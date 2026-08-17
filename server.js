// Road Lore dev/backend server.
//
// Serves the static PWA AND a small proxy endpoint (POST /api/tts) that calls
// Google's Gemini text-to-speech on the server side. The Gemini API key is read
// from the GEMINI_API_KEY environment variable and NEVER sent to the browser or
// committed to the repo. The browser talks only to /api/tts.
//
// Usage:
//   GEMINI_API_KEY=your-key node server.js
//   (or put the key in a .env file — see .env.example — and `node --env-file=.env server.js`)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// Text model used to generate grounded local-history lore. Overridable via env.
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const GEMINI_TEXT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TEXT_MODEL + ':generateContent';

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

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
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

async function handleTts(req, res) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    sendJson(res, 500, { error: 'Server is missing GEMINI_API_KEY. Set it in the environment.' });
    return;
  }

  let text = '';
  let voice = 'Kore';
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    text = String(body.text || '').slice(0, 5000);
    voice = String(body.voice || 'Kore');
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  if (!text.trim()) {
    sendJson(res, 400, { error: 'Missing "text"' });
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
    sendJson(res, 200, { audio: inline.data, mimeType: inline.mimeType || 'audio/L16;rate=24000' });
  } catch (err) {
    sendJson(res, 500, { error: 'Proxy request failed', detail: String(err).slice(0, 200) });
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    sendJson(res, 500, { error: 'Server is missing GEMINI_API_KEY. Set it in the environment.' });
    return;
  }

  let lat, lng, avoid;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    lat = Number(body.lat);
    lng = Number(body.lng);
    avoid = Array.isArray(body.avoid) ? body.avoid.slice(0, 12).map(String) : [];
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
  const prompt = [
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
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const routePath = req.url.split('?')[0];
  if (req.method === 'POST' && routePath === '/api/tts') return handleTts(req, res);
  if (req.method === 'POST' && routePath === '/api/lore') return handleLore(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  console.log('Road Lore server on http://localhost:' + PORT);
  console.log('Gemini key: ' + (hasKey ? 'loaded from env' : 'MISSING (set GEMINI_API_KEY to enable /api/tts and /api/lore)'));
  console.log('Models: tts=' + GEMINI_MODEL + '  text=' + GEMINI_TEXT_MODEL);
});
