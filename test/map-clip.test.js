const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('admin map plays stored clips', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const map = fs.readFileSync(path.join(__dirname, '../admin-map.html'), 'utf8');

  it('exposes GET /api/clip and keeps the pin list audio-free', () => {
    assert.match(server, /routePath === '\/api\/clip'/);
    assert.match(server, /function handleClipAudio/);
    assert.match(server, /clipIndex\.getClipAudio/);
    const listFn = server.match(/async function handleClips\(req, res\) \{[\s\S]*?\n\}/);
    assert.ok(listFn, 'handleClips missing');
    assert.doesNotMatch(listFn[0], /audio:/);
  });

  it('fetches one clip on Play and decodes L16 locally', () => {
    assert.match(map, /data-play=/);
    assert.match(map, /\/api\/clip\?/);
    assert.match(map, /function playPcm\(/);
    assert.match(map, /function fetchStoredClip\(/);
    assert.match(map, /createBuffer\(1, samples, 24000\)/);
    assert.doesNotMatch(map, /\/api\/tts/);
    assert.doesNotMatch(map, /generateContent/);
  });
});
