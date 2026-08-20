// Passenger Tales dev/backend server.
//
// Serves the static PWA AND a small proxy endpoint (POST /api/tts) that calls
// Google's Gemini text-to-speech on the server side. The Gemini API key is read
// from the GEMINI_API_KEY environment variable and NEVER sent to the browser or
// committed to the repo. The browser talks only to /api/tts.
//
// Usage:
//   GEMINI_API_KEY=your-key node server.js
//   (or put the key in a .env file — see .env.example — and `node --env-file=.env server.js`)
//
// Optional Phase 1 TTS cache: set GCS_BUCKET to a bucket name (Cloud Run SA needs
// storage.objectAdmin). Same text+voice is stored as tts/<sha256>.json and Gemini
// is skipped on later requests. GCS_BUCKET=memory uses an in-process map (tests).
//
// Phase 2 nearby index uses the same bucket under nearby/<geohash>/ (GET /api/nearby).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ttsCache = require('./tts-cache');
const clipIndex = require('./clip-index');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// Text model used to generate grounded local-history lore. Overridable via env.
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const GEMINI_TEXT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TEXT_MODEL + ':generateContent';

// --- Simple abuse protection for the paid Gemini endpoints ---------------
// Per-IP sliding-window rate limit plus a global daily cap. Counters are
// in-memory, so with multiple Cloud Run instances each instance keeps its own
// tally (keep --max-instances low; use a shared store for a hard global cap).
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS) || 60000; // 1 minute
const RATE_MAX = Number(process.env.RATE_MAX) || 20;                // per IP / window
const DAILY_CAP = Number(process.env.DAILY_CAP) || 500;            // per instance / UTC day
const TRIAL_MS = Number(process.env.TRIAL_MS) || 7 * 24 * 60 * 60 * 1000;
const GCS_BUCKET = (process.env.GCS_BUCKET || '').trim();

let ttsStore = null;
let ttsCacheMode = 'off';
try {
  const init = ttsCache.initTtsStore(GCS_BUCKET);
  ttsStore = init.store;
  ttsCacheMode = init.mode;
} catch (err) {
  console.error('[tts-cache] init failed', String(err).slice(0, 200));
  ttsStore = null;
  ttsCacheMode = 'off';
}

let clipIndexStore = null;
let clipIndexMode = 'off';
try {
  const idx = clipIndex.initClipIndex(GCS_BUCKET);
  clipIndexStore = idx.store;
  clipIndexMode = idx.mode;
} catch (err) {
  console.error('[clip-index] init failed', String(err).slice(0, 200));
  clipIndexStore = null;
  clipIndexMode = 'off';
}

function trialSecret() {
  return process.env.TRIAL_SECRET || process.env.GEMINI_API_KEY || 'road-lore-dev-trial';
}

function signTrial(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', trialSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyTrial(token) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expect = crypto.createHmac('sha256', trialSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.id || !Number.isFinite(payload.t0)) return null;
    return payload;
  } catch {
    return null;
  }
}

function trialInfo(payload) {
  const ends = payload.t0 + TRIAL_MS;
  return { active: Date.now() < ends, ends, started: payload.t0, id: payload.id };
}

function trialHeader(req) {
  return req.headers['x-road-lore-trial'] || '';
}

function requireTrial(req, res) {
  const payload = verifyTrial(trialHeader(req));
  if (!payload) {
    sendJson(res, 401, { error: 'trial_required', message: 'Start a session first.' });
    return null;
  }
  const info = trialInfo(payload);
  if (!info.active) {
    sendJson(res, 402, {
      error: 'trial_ended',
      trialEnds: info.ends,
      message: 'The complimentary week has ended. The on-device voice remains free.'
    });
    return null;
  }
  return info;
}

const ipHits = new Map();
let dayKey = new Date().toISOString().slice(0, 10);
let dayCount = 0;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Returns true if the request may proceed; otherwise writes a 429 and returns false.
function allowRequest(req, res) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; ipHits.clear(); }

  if (dayCount >= DAILY_CAP) {
    res.writeHead(429, securityHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': '3600'
    }, req));
    res.end(JSON.stringify({ error: 'Daily limit reached. Please try again tomorrow.' }));
    return false;
  }

  const ip = clientIp(req);
  const cutoff = now - RATE_WINDOW_MS;
  let hits = ipHits.get(ip);
  if (!hits) { hits = []; ipHits.set(ip, hits); }
  while (hits.length && hits[0] < cutoff) hits.shift();

  if (hits.length >= RATE_MAX) {
    const retry = Math.max(1, Math.ceil((hits[0] + RATE_WINDOW_MS - now) / 1000));
    res.writeHead(429, securityHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(retry)
    }, req));
    res.end(JSON.stringify({ error: 'Too many requests — slow down a moment.' }));
    return false;
  }

  hits.push(now);
  dayCount++;

  // Bound memory if lots of distinct IPs show up.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (!v.length || v[v.length - 1] < cutoff) ipHits.delete(k);
    }
  }
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8'
};

function corsHeaders(req) {
  const origin = String((req && req.headers && req.headers.origin) || '');
  const ok = origin === 'https://azzabazza11.github.io' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  if (!ok) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-road-lore-trial',
    'Access-Control-Expose-Headers': 'X-TTS-Cache',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function securityHeaders(extra, req) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(self), microphone=(), camera=(), payment=(), usb=()'
  }, corsHeaders(req), extra);
}

function sendJson(res, code, obj, extra) {
  res.writeHead(code, securityHeaders(Object.assign({
    'Content-Type': 'application/json; charset=utf-8'
  }, extra || {}), res.req));
  res.end(JSON.stringify(obj));
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function parseQuery(req) {
  try {
    return new URL(req.url, 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

async function maybeIndexClip(text, voice, lat, lng, title, clip) {
  if (!clipIndexStore || !ttsStore) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  await clipIndex.registerClip(clipIndexStore, ttsStore, {
    text,
    voice,
    lat,
    lng,
    title,
    clip,
    ttsKey: ttsCache.ttsCacheKey(text, voice)
  });
}

function handleSession(req, res) {
  const existing = verifyTrial(trialHeader(req));
  const payload = existing || { id: crypto.randomUUID(), t0: Date.now() };
  const info = trialInfo(payload);
  sendJson(res, 200, {
    token: signTrial(payload),
    deviceId: payload.id,
    trialActive: info.active,
    trialEnds: info.ends,
    trialDays: Math.round(TRIAL_MS / 86400000)
  });
}

function sendTtsAudio(res, clip, cache) {
  sendJson(res, 200, {
    audio: clip.audio,
    mimeType: clip.mimeType || 'audio/L16;rate=24000',
    cache
  }, { 'X-TTS-Cache': String(cache).toUpperCase() });
}

async function handleTts(req, res) {
  if (!allowRequest(req, res)) return;
  if (!requireTrial(req, res)) return;

  let text = '';
  let voice = 'Kore';
  let lat, lng, title;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    text = String(body.text || '').slice(0, 5000);
    voice = String(body.voice || 'Kore');
    lat = Number(body.lat);
    lng = Number(body.lng);
    title = body.title != null ? String(body.title).slice(0, 120) : '';
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  if (!text.trim()) {
    sendJson(res, 400, { error: 'Missing "text"' });
    return;
  }

  const cached = await ttsCache.lookupTts(ttsStore, text, voice);
  if (cached) {
    console.log('[tts] cache HIT');
    await maybeIndexClip(text, voice, lat, lng, title, cached);
    sendTtsAudio(res, cached, 'hit');
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    sendJson(res, 500, { error: 'Server is missing GEMINI_API_KEY. Set it in the environment.' });
    return;
  }

  try {
    const gRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      })
    });

    if (!gRes.ok) {
      const detail = (await gRes.text()).slice(0, 300);
      console.error('[tts] Gemini error', gRes.status, detail);
      sendJson(res, 502, { error: 'Gemini error ' + gRes.status, detail });
      return;
    }

    const data = await gRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const inline = parts.find(p => p.inlineData)?.inlineData;
    if (!inline?.data) {
      sendJson(res, 502, { error: 'No audio in Gemini response' });
      return;
    }
    const clip = {
      audio: inline.data,
      mimeType: inline.mimeType || 'audio/L16;rate=24000',
      voice
    };
    let cache = ttsStore ? 'miss' : 'off';
    if (ttsStore) {
      const saved = await ttsCache.saveTts(ttsStore, text, voice, clip);
      if (!saved) cache = 'error';
      else await maybeIndexClip(text, voice, lat, lng, title, clip);
    }
    sendTtsAudio(res, clip, cache);
  } catch (err) {
    sendJson(res, 500, { error: 'Proxy request failed', detail: String(err).slice(0, 200) });
  }
}

async function handleNearby(req, res) {
  if (!allowRequest(req, res)) return;
  if (!requireTrial(req, res)) return;

  const q = parseQuery(req);
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const radiusM = Number(q.get('radius') || q.get('radiusM') || process.env.NEARBY_DEFAULT_RADIUS_M || 10000);
  const voice = String(q.get('voice') || 'Kore');
  const limit = Number(q.get('limit') || 8);
  const avoid = [];
  for (const v of q.getAll('avoid')) {
    for (const part of String(v).split(',')) {
      const t = part.trim();
      if (t) avoid.push(t);
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    sendJson(res, 400, { error: 'Missing/invalid lat,lng query params' });
    return;
  }
  if (!clipIndexStore || !ttsStore) {
    sendJson(res, 200, { clips: [], index: 'off' });
    return;
  }

  try {
    const clips = await clipIndex.findNearby(clipIndexStore, ttsStore, {
      lat,
      lng,
      radiusM,
      voice,
      limit,
      avoid
    });
    sendJson(res, 200, { clips });
  } catch (err) {
    sendJson(res, 500, { error: 'Nearby lookup failed', detail: String(err).slice(0, 200) });
  }
}

// Pull a { title, text } object out of the model's text response, tolerating
// code fences or stray prose around the JSON.
function parseLoreJson(text, fallbackTitle) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const tryParse = s => {
    try {
      const o = JSON.parse(s);
      if (o && (o.title || o.text)) return o;
    } catch { /* ignore */ }
    return null;
  };
  let obj = tryParse(cleaned);
  if (!obj) {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) obj = tryParse(cleaned.slice(first, last + 1));
  }
  if (!obj) obj = { title: fallbackTitle || 'Local lore', text: cleaned };
  return {
    title: String(obj.title || fallbackTitle || 'Local lore').slice(0, 120),
    text: String(obj.text || '').trim()
  };
}

async function handleLore(req, res) {
  if (!allowRequest(req, res)) return;
  if (!requireTrial(req, res)) return;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    sendJson(res, 500, { error: 'Server is missing GEMINI_API_KEY. Set it in the environment.' });
    return;
  }

  let lat, lng, avoid, expand;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    lat = Number(body.lat);
    lng = Number(body.lng);
    avoid = Array.isArray(body.avoid) ? body.avoid.slice(0, 12).map(String) : [];
    if (body.expand && typeof body.expand === 'object') {
      expand = {
        title: String(body.expand.title || '').slice(0, 120),
        text: String(body.expand.text || '').slice(0, 4000)
      };
      if (!expand.text.trim()) expand = null;
    }
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    sendJson(res, 400, { error: 'Missing/invalid lat,lng' });
    return;
  }

  const avoidClause = avoid.length
    ? 'The traveller has already heard stories about these — pick something clearly different: ' +
      avoid.join('; ') + '.'
    : '';
  const prompt = expand
    ? [
        'You are a warm, knowledgeable local-history guide for people on a road trip.',
        'The traveller is near latitude ' + lat.toFixed(5) + ', longitude ' + lng.toFixed(5) + '.',
        'They just heard this short piece titled "' + expand.title + '":',
        expand.text,
        'Use web search to flesh out THIS SAME topic with 3–5 extra sentences: more colour, a surprising fact,',
        'or what happened next. Do not retell the original. Do not start a new subject. Do not give directions.',
        'Friendly and easy to follow when read aloud while driving.',
        'Respond ONLY with minified JSON, no code fences: {"title":"' +
          expand.title.replace(/["\\]/g, '') +
          '","text":"<the extra narration only>"}'
      ].join(' ')
    : [
        'You are a warm, knowledgeable local-history guide for people on a road trip.',
        'The traveller is near latitude ' + lat.toFixed(5) + ', longitude ' + lng.toFixed(5) + '.',
        'Use web search to find ONE genuinely interesting true story from the wider local area or region',
        '(it need not be at the exact point) — e.g. Māori history, early settlers and industry (kauri, gum,',
        'gold, farming, fishing), shipwrecks, notable people, landmarks, or events.',
        'Blend vivid storytelling with accurate facts. About 3–4 sentences, friendly and easy to follow when',
        'read aloud while driving. Do not give directions or navigation instructions.',
        avoidClause,
        'Respond ONLY with minified JSON, no code fences: {"title":"<short evocative title, max 6 words>","text":"<the narration>"}'
      ].filter(Boolean).join(' ');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const gRes = await fetch(GEMINI_TEXT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.9 }
      })
    });

    if (!gRes.ok) {
      const detail = (await gRes.text()).slice(0, 300);
      console.error('[lore] Gemini error', gRes.status, detail);
      sendJson(res, 502, { error: 'Gemini error ' + gRes.status, detail });
      return;
    }

    const data = await gRes.json();
    const cand = data?.candidates?.[0] || {};
    const rawText = (cand.content?.parts || []).map(p => p.text || '').join('');
    const { title, text } = parseLoreJson(rawText);
    if (!text) {
      sendJson(res, 502, { error: 'No lore text in Gemini response' });
      return;
    }

    const seen = new Set();
    const sources = [];
    for (const ch of cand.groundingMetadata?.groundingChunks || []) {
      const web = ch.web;
      if (web?.uri && !seen.has(web.uri)) {
        seen.add(web.uri);
        sources.push({ title: web.title || web.uri, uri: web.uri });
      }
      if (sources.length >= 5) break;
    }

    sendJson(res, 200, { title, text, sources });
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    console.error('[lore] proxy failure', String(err));
    sendJson(res, aborted ? 504 : 500, {
      error: aborted ? 'Lore request timed out' : 'Proxy request failed',
      detail: String(err).slice(0, 200)
    });
  } finally {
    clearTimeout(timer);
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, securityHeaders({ 'Content-Type': 'text/plain' }, req));
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain' }, req));
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = securityHeaders({ 'Content-Type': MIME[ext] || 'application/octet-stream' }, req);
    const base = path.basename(filePath);
    if (base === 'manifest.json' || ext === '.webmanifest') {
      headers['Content-Type'] = 'application/manifest+json; charset=utf-8';
    }
    if (base === 'version.json' || base === 'service-worker.js') {
      headers['Cache-Control'] = 'no-store';
    }
    if (base === 'version.json') {
      headers['Access-Control-Allow-Origin'] = '*';
    }
    res.writeHead(200, headers);
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const routePath = req.url.split('?')[0];
  if (req.method === 'OPTIONS' && routePath.startsWith('/api/')) {
    res.writeHead(204, securityHeaders({}, req));
    res.end();
    return;
  }
  if (req.method === 'POST' && routePath === '/api/session') return handleSession(req, res);
  if (req.method === 'POST' && routePath === '/api/tts') return handleTts(req, res);
  if (req.method === 'POST' && routePath === '/api/lore') return handleLore(req, res);
  if (req.method === 'GET' && routePath === '/api/nearby') return handleNearby(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, securityHeaders({ 'Content-Type': 'text/plain' }, req));
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  console.log('Passenger Tales server on http://localhost:' + PORT);
  console.log('Gemini key: ' + (hasKey ? 'loaded from env' : 'MISSING (set GEMINI_API_KEY to enable /api/tts and /api/lore)'));
  console.log('Models: tts=' + GEMINI_MODEL + '  text=' + GEMINI_TEXT_MODEL);
  console.log('Limits: ' + RATE_MAX + ' req / ' + Math.round(RATE_WINDOW_MS / 1000) + 's per IP, ' + DAILY_CAP + ' / day (per instance)');
  console.log('Trial: ' + Math.round(TRIAL_MS / 86400000) + ' day complimentary generated voice (then on-device voice)');
  console.log('TTS cache: ' + ttsCacheMode + (ttsCacheMode === 'off' ? ' (set GCS_BUCKET to reuse clips)' : ''));
  console.log('Nearby index: ' + clipIndexMode + (clipIndexMode === 'off' ? '' : '  GET /api/nearby'));
});
