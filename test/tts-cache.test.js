const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTtsText,
  ttsCacheKey,
  objectPath,
  clipPayload,
  createMemoryStore,
  createGcsStore,
  lookupTts,
  saveTts,
  initTtsStore
} = require('../tts-cache');

describe('tts cache key', () => {
  it('collapses whitespace so the same story hashes once', () => {
    const a = ttsCacheKey('  Hello   harbour\nbridge.  ', 'Kore');
    const b = ttsCacheKey('Hello harbour bridge.', 'Kore');
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.equal(objectPath(a), 'tts/' + a + '.json');
  });

  it('changes when the voice or text changes', () => {
    const base = ttsCacheKey('A shipwreck story.', 'Kore');
    assert.notEqual(base, ttsCacheKey('A shipwreck story.', 'Puck'));
    assert.notEqual(base, ttsCacheKey('A different story.', 'Kore'));
  });

  it('defaults a blank voice to Kore', () => {
    assert.equal(ttsCacheKey('Same line.', ''), ttsCacheKey('Same line.', 'Kore'));
    assert.equal(normalizeTtsText('\n  two   words\t'), 'two words');
  });
});

describe('memory store', () => {
  it('round-trips a clip and misses unknown keys', async () => {
    const store = createMemoryStore();
    const text = 'Local gum-digger lore.';
    const miss = await lookupTts(store, text, 'Kore');
    assert.equal(miss, null);

    await saveTts(store, text, 'Kore', {
      audio: 'YWJj',
      mimeType: 'audio/L16;rate=24000'
    });
    const hit = await lookupTts(store, '  Local   gum-digger lore. ', 'Kore');
    assert.equal(hit.audio, 'YWJj');
    assert.equal(hit.mimeType, 'audio/L16;rate=24000');
    assert.equal(hit.voice, 'Kore');
  });

  it('no-ops when storage is unset', async () => {
    assert.equal(await lookupTts(null, 'hello', 'Kore'), null);
    assert.equal(await saveTts(null, 'hello', 'Kore', { audio: 'xx' }), false);
  });
});

describe('GCS adapter', () => {
  it('returns null on 404 and saves JSON clips', async () => {
    const objects = new Map();
    const bucket = {
      file(path) {
        return {
          async download() {
            if (!objects.has(path)) {
              const err = new Error('not found');
              err.code = 404;
              throw err;
            }
            return [Buffer.from(objects.get(path), 'utf8')];
          },
          async save(body, opts) {
            assert.equal(opts.resumable, false);
            assert.equal(opts.contentType, 'application/json');
            objects.set(path, String(body));
          }
        };
      }
    };
    const store = createGcsStore(bucket);
    const key = ttsCacheKey('Cached harbour tale.', 'Kore');
    assert.equal(await store.get(key), null);
    await store.put(key, { audio: 'cGNt', mimeType: 'audio/L16;rate=24000', voice: 'Kore' });
    const got = await store.get(key);
    assert.equal(got.audio, 'cGNt');
    assert.ok(objects.has(objectPath(key)));
  });

  it('lookup swallows store errors so TTS can still call Gemini', async () => {
    const store = {
      async get() {
        throw new Error('bucket down');
      }
    };
    assert.equal(await lookupTts(store, 'story', 'Kore'), null);
  });
});

describe('initTtsStore', () => {
  it('stays off without a bucket and uses memory when asked', () => {
    assert.deepEqual(initTtsStore(''), { store: null, mode: 'off' });
    const mem = initTtsStore('memory');
    assert.equal(mem.mode, 'memory');
    assert.ok(mem.store);
  });
});

describe('clipPayload', () => {
  it('rejects empty audio', () => {
    assert.equal(clipPayload({ audio: '' }), null);
    assert.equal(clipPayload(null), null);
  });
});
