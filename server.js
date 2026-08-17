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
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/tts') return handleTts(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  console.log('Road Lore server on http://localhost:' + PORT);
  console.log('Gemini key: ' + (hasKey ? 'loaded from env' : 'MISSING (set GEMINI_API_KEY to enable /api/tts)'));
});
