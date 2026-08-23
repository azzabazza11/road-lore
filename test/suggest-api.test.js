const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function jsonReq(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

describe('GET /api/suggest', () => {
  let overpass;
  let child;
  let port;

  before(async () => {
    overpass = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          elements: [
            {
              type: 'node',
              id: 1,
              lat: -36.8486,
              lon: 174.7634,
              tags: { amenity: 'restaurant', name: 'Thai House' }
            },
            {
              type: 'node',
              id: 2,
              lat: -36.8488,
              lon: 174.7638,
              tags: { amenity: 'cafe', name: 'Cafe Coco' }
            },
            {
              type: 'node',
              id: 3,
              lat: -36.8492,
              lon: 174.7642,
              tags: { amenity: 'fast_food', name: 'Hell Pizza' }
            }
          ]
        }));
      });
    });
    const overpassPort = await listen(overpass);

    port = 18080 + Math.floor(Math.random() * 1000);
    child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, {
        PORT: String(port),
        TRIAL_SECRET: 'suggest-test-secret',
        OVERPASS_URL: 'http://127.0.0.1:' + overpassPort + '/',
        GCS_BUCKET: ''
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
      const onData = chunk => {
        if (String(chunk).includes('Passenger Tales server')) {
          clearTimeout(timer);
          child.stdout.off('data', onData);
          resolve();
        }
      };
      child.stdout.on('data', onData);
      child.on('error', reject);
    });
  });

  after(() => {
    if (child) child.kill();
    if (overpass) overpass.close();
  });

  it('requires a session, then returns a dining mix with Maps hops', async () => {
    const denied = await jsonReq(port, 'GET', '/api/suggest?kind=dining&lat=-36.8485&lng=174.7633');
    assert.equal(denied.status, 401);

    const bad = await jsonReq(port, 'GET', '/api/suggest?kind=history&lat=-36.8485&lng=174.7633');
    // still 401 without a token — session first
    assert.equal(bad.status, 401);

    const session = await jsonReq(port, 'POST', '/api/session', { body: { deviceId: 'suggest-test' } });
    assert.equal(session.status, 200);
    const token = session.json.token;
    const headers = { 'x-road-lore-trial': token };

    const kindErr = await jsonReq(port, 'GET', '/api/suggest?kind=history&lat=-36.8485&lng=174.7633', { headers });
    assert.equal(kindErr.status, 400);
    assert.equal(kindErr.json.error, 'invalid_kind');

    const ok = await jsonReq(port, 'GET', '/api/suggest?kind=dining&lat=-36.8485&lng=174.7633', { headers });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.kind, 'dining');
    assert.equal(ok.json.places.length, 3);
    assert.equal(ok.json.places[0].name, 'Thai House');
    assert.ok(ok.json.places[0].mapsUrl.includes('/maps/dir/'));
    assert.ok(ok.json.types.some(t => t.id === 'cafe'));
    assert.match(ok.json.spoken, /Nearby dining/);
  });
});
