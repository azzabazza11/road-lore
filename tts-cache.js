// Phase 1 spoken-clip cache: same normalised text + voice → one Gemini TTS call.
// Storage is a { get(key), put(key, payload) } adapter (GCS in prod, memory in tests).

const crypto = require('crypto');

function normalizeTtsText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function normalizeVoice(voice) {
  return String(voice || 'Kore').trim() || 'Kore';
}

function ttsCacheKey(text, voice) {
  return crypto
    .createHash('sha256')
    .update(normalizeTtsText(text) + '\n' + normalizeVoice(voice), 'utf8')
    .digest('hex');
}

function objectPath(key) {
  return 'tts/' + key + '.json';
}

function clipPayload(raw, fallbackVoice) {
  if (!raw || typeof raw.audio !== 'string' || !raw.audio) return null;
  return {
    audio: raw.audio,
    mimeType: raw.mimeType || 'audio/L16;rate=24000',
    voice: raw.voice || fallbackVoice || '',
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

function createMemoryStore() {
  const map = new Map();
  return {
    async get(key) {
      const v = map.get(key);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async put(key, payload) {
      const clip = clipPayload(payload);
      if (!clip) return;
      map.set(key, clip);
    }
  };
}

function isNotFound(err) {
  if (!err) return false;
  if (err.code === 404 || err.code === '404' || err.code === 'ENOENT') return true;
  const status = err.statusCode || err.status;
  return status === 404;
}

function createGcsStore(bucket) {
  return {
    async get(key) {
      const file = bucket.file(objectPath(key));
      try {
        const [buf] = await file.download();
        return clipPayload(JSON.parse(buf.toString('utf8')));
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async put(key, payload) {
      const clip = clipPayload(payload);
      if (!clip) return;
      const file = bucket.file(objectPath(key));
      await file.save(JSON.stringify(clip), {
        resumable: false,
        contentType: 'application/json',
        metadata: { cacheControl: 'private, max-age=31536000' }
      });
    }
  };
}

function createGcsBucketStore(bucketName) {
  const { Storage } = require('@google-cloud/storage');
  return createGcsStore(new Storage().bucket(bucketName));
}

async function lookupTts(store, text, voice) {
  if (!store) return null;
  try {
    return clipPayload(await store.get(ttsCacheKey(text, voice)), voice);
  } catch (err) {
    console.error('[tts-cache] get failed', String(err).slice(0, 200));
    return null;
  }
}

async function saveTts(store, text, voice, payload) {
  if (!store) return false;
  try {
    await store.put(ttsCacheKey(text, voice), clipPayload(payload, voice));
    return true;
  } catch (err) {
    console.error('[tts-cache] put failed', String(err).slice(0, 200));
    return false;
  }
}

function initTtsStore(bucketName) {
  const name = String(bucketName || '').trim();
  if (!name) return { store: null, mode: 'off' };
  if (name === 'memory') return { store: createMemoryStore(), mode: 'memory' };
  return { store: createGcsBucketStore(name), mode: 'gcs:' + name };
}

module.exports = {
  normalizeTtsText,
  normalizeVoice,
  ttsCacheKey,
  objectPath,
  clipPayload,
  createMemoryStore,
  createGcsStore,
  createGcsBucketStore,
  lookupTts,
  saveTts,
  initTtsStore
};
