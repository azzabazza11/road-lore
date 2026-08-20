const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  encodeGeohash,
  geohashNeighbors,
  haversineM,
  createMemoryIndexStore,
  registerClip,
  findNearby,
  listClips
} = require('../clip-index');
const { createMemoryStore, ttsCacheKey } = require('../tts-cache');

describe('geohash', () => {
  it('encodes stable prefixes and lists neighbors', () => {
    const h5 = encodeGeohash(-36.8485, 174.7633, 5);
    assert.equal(h5.length, 5);
    const neighbors = geohashNeighbors(h5);
    assert.ok(neighbors.includes(h5));
    assert.equal(neighbors.length, 9);
  });

  it('measures distance in metres', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 });
    assert.ok(d > 1000 && d < 1200);
  });
});

describe('nearby index', () => {
  it('registers and finds a clip within radius', async () => {
    const indexStore = createMemoryIndexStore();
    const ttsStore = createMemoryStore();
    const text = 'Harbour bridge history told aloud.';
    const voice = 'Kore';
    const key = ttsCacheKey(text, voice);
    await ttsStore.put(key, { audio: 'cGNt', mimeType: 'audio/L16;rate=24000', voice });

    const ok = await registerClip(indexStore, ttsStore, {
      text,
      voice,
      lat: -36.8485,
      lng: 174.7633,
      title: 'Harbour bridge',
      ttsKey: key
    });
    assert.equal(ok, true);

    const clips = await findNearby(indexStore, ttsStore, {
      lat: -36.85,
      lng: 174.76,
      radiusM: 10000,
      voice: 'Kore'
    });
    assert.equal(clips.length, 1);
    assert.equal(clips[0].title, 'Harbour bridge');
    assert.equal(clips[0].audio, 'cGNt');
    assert.ok(clips[0].distance < 5000);
  });

  it('filters by voice and avoid titles', async () => {
    const indexStore = createMemoryIndexStore();
    const ttsStore = createMemoryStore();
    const text = 'Gold rush lore.';
    const key = ttsCacheKey(text, 'Kore');
    await ttsStore.put(key, { audio: 'x', voice: 'Kore' });
    await registerClip(indexStore, ttsStore, {
      text,
      voice: 'Kore',
      lat: -37,
      lng: 175,
      title: 'Gold rush',
      ttsKey: key
    });

    assert.equal((await findNearby(indexStore, ttsStore, {
      lat: -37,
      lng: 175,
      radiusM: 10000,
      voice: 'Puck'
    })).length, 0);

    assert.equal((await findNearby(indexStore, ttsStore, {
      lat: -37,
      lng: 175,
      radiusM: 10000,
      voice: 'Kore',
      avoid: ['Gold rush']
    })).length, 0);
  });

  it('lists metadata without audio for the admin map', async () => {
    const indexStore = createMemoryIndexStore();
    const ttsStore = createMemoryStore();
    const text = 'Kaipara harbour tale.';
    const key = ttsCacheKey(text, 'Kore');
    await ttsStore.put(key, { audio: 'pcm', voice: 'Kore' });
    await registerClip(indexStore, ttsStore, {
      text,
      voice: 'Kore',
      lat: -36.4,
      lng: 174.3,
      title: 'Kaipara',
      ttsKey: key
    });
    const listed = await listClips(indexStore, { limit: 10 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Kaipara');
    assert.equal(listed[0].audio, undefined);
    assert.ok(listed[0].textPreview);
  });
});
