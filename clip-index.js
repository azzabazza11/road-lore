// Phase 2 location index: geohash buckets in GCS → nearby shared clips (story lat/lng only).

const { ttsCacheKey, normalizeTtsText, normalizeVoice } = require('./tts-cache');

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const NEIGHBOR_STEPS = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]
];

function encodeGeohash(lat, lng, precision = 5) {
  let idx = 0;
  let bit = 0;
  let even = true;
  let hash = '';
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = (idx << 1) + 1;
        lngMin = mid;
      } else {
        idx = idx << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = (idx << 1) + 1;
        latMin = mid;
      } else {
        idx = idx << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

function decodeGeohash(hash) {
  let even = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  for (const ch of String(hash || '')) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) break;
    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (idx & mask) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (idx & mask) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    latErr: (latMax - latMin) / 2,
    lngErr: (lngMax - lngMin) / 2
  };
}

function geohashNeighbors(hash) {
  const box = decodeGeohash(hash);
  if (!box.latErr) return [hash];
  const latStep = box.latErr * 2;
  const lngStep = box.lngErr * 2;
  const out = new Set([hash]);
  for (const [dlat, dlng] of NEIGHBOR_STEPS) {
    out.add(encodeGeohash(box.lat + dlat * latStep, box.lng + dlng * lngStep, hash.length));
  }
  return [...out];
}

function geohashPrefixes(lat, lng, radiusM) {
  const prec = radiusM <= 6000 ? 6 : radiusM <= 15000 ? 5 : 4;
  const center = encodeGeohash(lat, lng, prec);
  return geohashNeighbors(center);
}

function haversineM(a, b) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function indexObjectPath(geohash, ttsKey) {
  return 'nearby/' + geohash + '/' + ttsKey + '.json';
}

function indexEntry(raw) {
  if (!raw || !raw.ttsKey || !raw.text) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    ttsKey: String(raw.ttsKey),
    title: String(raw.title || 'Local story').slice(0, 120),
    text: String(raw.text).slice(0, 5000),
    lat,
    lng,
    voice: normalizeVoice(raw.voice),
    geohash: String(raw.geohash || encodeGeohash(lat, lng, 5)),
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

function createMemoryIndexStore() {
  const map = new Map();
  return {
    async put(entry) {
      const row = indexEntry(entry);
      if (!row) return;
      map.set(indexObjectPath(row.geohash, row.ttsKey), row);
    },
    async listPrefix(prefix) {
      const out = [];
      const p = String(prefix || '');
      for (const [path, row] of map) {
        if (path.startsWith('nearby/' + p)) out.push(row);
      }
      return out;
    }
  };
}

function isNotFound(err) {
  if (!err) return false;
  if (err.code === 404 || err.code === '404') return true;
  return (err.statusCode || err.status) === 404;
}

function createGcsIndexStore(bucket) {
  return {
    async put(entry) {
      const row = indexEntry(entry);
      if (!row) return;
      const file = bucket.file(indexObjectPath(row.geohash, row.ttsKey));
      await file.save(JSON.stringify(row), {
        resumable: false,
        contentType: 'application/json',
        metadata: { cacheControl: 'private, max-age=31536000' }
      });
    },
    async listPrefix(prefix) {
      const [files] = await bucket.getFiles({ prefix: 'nearby/' + prefix, autoPaginate: true });
      const out = [];
      for (const file of files) {
        try {
          const [buf] = await file.download();
          const row = indexEntry(JSON.parse(buf.toString('utf8')));
          if (row) out.push(row);
        } catch (err) {
          if (!isNotFound(err)) console.error('[clip-index] read', String(err).slice(0, 120));
        }
      }
      return out;
    }
  };
}

function createGcsBucketIndexStore(bucketName) {
  const { Storage } = require('@google-cloud/storage');
  return createGcsIndexStore(new Storage().bucket(bucketName));
}

function initClipIndex(bucketName) {
  const name = String(bucketName || '').trim();
  if (!name) return { store: null, mode: 'off' };
  if (name === 'memory') return { store: createMemoryIndexStore(), mode: 'memory' };
  return { store: createGcsBucketIndexStore(name), mode: 'gcs:' + name };
}

async function registerClip(indexStore, ttsStore, opts) {
  if (!indexStore || !ttsStore) return false;
  const text = normalizeTtsText(opts.text);
  const voice = normalizeVoice(opts.voice);
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  if (!text || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const ttsKey = opts.ttsKey || ttsCacheKey(text, voice);
  const clip = opts.clip || (ttsStore.get ? await ttsStore.get(ttsKey) : null);
  if (!clip || !clip.audio) return false;
  try {
    await indexStore.put({
      ttsKey,
      title: opts.title || text.slice(0, 80),
      text,
      lat,
      lng,
      voice,
      geohash: encodeGeohash(lat, lng, 5),
      createdAt: clip.createdAt || new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.error('[clip-index] register failed', String(err).slice(0, 200));
    return false;
  }
}

async function findNearby(indexStore, ttsStore, opts) {
  if (!indexStore || !ttsStore) return [];
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  const radiusM = Math.min(
    Number(opts.radiusM) || 10000,
    Number(process.env.NEARBY_MAX_RADIUS_M) || 15000
  );
  const voice = normalizeVoice(opts.voice);
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 20);
  const avoid = new Set((opts.avoid || []).map(String));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const prefixes = geohashPrefixes(lat, lng, radiusM);
  const seen = new Set();
  const candidates = [];

  try {
    for (const prefix of prefixes) {
      const rows = await indexStore.listPrefix(prefix);
      for (const row of rows) {
        if (seen.has(row.ttsKey)) continue;
        seen.add(row.ttsKey);
        if (row.voice !== voice) continue;
        if (avoid.has(row.title)) continue;
        const distance = haversineM({ lat, lng }, { lat: row.lat, lng: row.lng });
        if (distance > radiusM) continue;
        candidates.push({ ...row, distance });
      }
    }
  } catch (err) {
    console.error('[clip-index] nearby list failed', String(err).slice(0, 200));
    return [];
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const picked = candidates.slice(0, limit);
  const out = [];
  for (const row of picked) {
    try {
      const clip = await ttsStore.get(row.ttsKey);
      if (!clip || !clip.audio) continue;
      out.push({
        title: row.title,
        text: row.text,
        lat: row.lat,
        lng: row.lng,
        voice: row.voice,
        distance: Math.round(row.distance),
        audio: clip.audio,
        mimeType: clip.mimeType || 'audio/L16;rate=24000',
        ttsKey: row.ttsKey
      });
    } catch { /* skip broken clip */ }
  }
  return out;
}

async function listClips(indexStore, opts = {}) {
  if (!indexStore) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);
  const voiceFilter = opts.voice ? normalizeVoice(opts.voice) : '';
  try {
    const rows = await indexStore.listPrefix('');
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      if (!row || seen.has(row.ttsKey)) continue;
      seen.add(row.ttsKey);
      if (voiceFilter && row.voice !== voiceFilter) continue;
      out.push({
        title: row.title,
        lat: row.lat,
        lng: row.lng,
        voice: row.voice,
        ttsKey: row.ttsKey,
        geohash: row.geohash,
        createdAt: row.createdAt,
        textPreview: String(row.text || '').slice(0, 160)
      });
      if (out.length >= limit) break;
    }
    out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return out;
  } catch (err) {
    console.error('[clip-index] list failed', String(err).slice(0, 200));
    return [];
  }
}

module.exports = {
  encodeGeohash,
  decodeGeohash,
  geohashNeighbors,
  geohashPrefixes,
  haversineM,
  indexObjectPath,
  indexEntry,
  createMemoryIndexStore,
  createGcsIndexStore,
  createGcsBucketIndexStore,
  initClipIndex,
  registerClip,
  findNearby,
  listClips
};
