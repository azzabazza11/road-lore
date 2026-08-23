// Nearby place suggestions (not stories). Cloud Run proxies Overpass so the
// phone never talks to OSM directly. Dining mix + Maps hops live here so
// server tests and the PWA stay on the same rules.

(function (root, factory) {
  const exp = factory();
  if (typeof module === 'object' && module.exports) module.exports = exp;
  else root.PassengerSuggestions = exp;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const DEFAULT_OVERPASS = OVERPASS_URLS[0];
  const MAPS_MAX = 3;

  const KINDS = [
    { id: 'entertainment', label: 'Entertainment', radiusM: 15000 },
    { id: 'events', label: 'Events', radiusM: 20000 },
    { id: 'dining', label: 'Dining', radiusM: 15000 },
    { id: 'sightseeing', label: 'Sightseeing', radiusM: 15000 },
    { id: 'parks', label: 'Parks / reserves', radiusM: 15000 },
    { id: 'restroom', label: 'Restroom', radiusM: 10000 }
  ];

  const KIND_IDS = KINDS.map(k => k.id);

  const DINING_TYPES = [
    { id: 'fine', label: 'Fine dining' },
    { id: 'restaurant', label: 'Restaurant' },
    { id: 'cafe', label: 'Cafe' },
    { id: 'pub', label: 'Pub' },
    { id: 'bakery', label: 'Bakery' },
    { id: 'fast_food', label: 'Fast food' }
  ];

  const DINING_TYPE_IDS = DINING_TYPES.map(t => t.id);

  const KIND_TAGS = {
    entertainment: [
      ['amenity', 'cinema'],
      ['amenity', 'theatre'],
      ['amenity', 'arts_centre'],
      ['amenity', 'nightclub'],
      ['amenity', 'casino'],
      ['leisure', 'bowling_alley'],
      ['leisure', 'amusement_arcade'],
      ['leisure', 'sports_centre'],
      ['leisure', 'swimming_pool'],
      ['leisure', 'stadium']
    ],
    events: [
      ['amenity', 'events_venue'],
      ['amenity', 'community_centre'],
      ['amenity', 'conference_centre'],
      ['amenity', 'theatre'],
      ['leisure', 'stadium'],
      ['tourism', 'theme_park']
    ],
    dining: [
      ['amenity', 'restaurant'],
      ['amenity', 'cafe'],
      ['amenity', 'fast_food'],
      ['amenity', 'bakery'],
      ['amenity', 'pub'],
      ['amenity', 'bar'],
      ['shop', 'bakery']
    ],
    sightseeing: [
      ['tourism', 'attraction'],
      ['tourism', 'viewpoint'],
      ['tourism', 'museum'],
      ['tourism', 'gallery'],
      ['tourism', 'artwork'],
      ['tourism', 'theme_park'],
      ['tourism', 'zoo'],
      ['tourism', 'aquarium'],
      ['historic', '*']
    ],
    parks: [
      ['leisure', 'park'],
      ['leisure', 'garden'],
      ['leisure', 'nature_reserve'],
      ['boundary', 'national_park'],
      ['landuse', 'recreation_ground']
    ],
    restroom: [
      ['amenity', 'toilets']
    ]
  };

  function getKind(id) {
    const key = String(id || '').trim().toLowerCase();
    return KINDS.find(k => k.id === key) || null;
  }

  function normalizeDiningType(id) {
    const key = String(id || '').trim().toLowerCase();
    return DINING_TYPE_IDS.includes(key) ? key : '';
  }

  function diningTypeLabel(id) {
    const row = DINING_TYPES.find(t => t.id === id);
    return row ? row.label : '';
  }

  function coord(n) {
    return Number(n).toFixed(6);
  }

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function mapsDirUrl(lat, lng) {
    const dest = coord(lat) + ',' + coord(lng);
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
  }

  function mapsPlaceUrl(lat, lng, name) {
    const pin = coord(lat) + ',' + coord(lng);
    const label = String(name || '').trim();
    const q = label ? (label + ' ' + pin) : pin;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function formatDistance(m) {
    if (!Number.isFinite(m)) return '';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(1) + ' km';
  }

  function speakDistance(m) {
    if (!Number.isFinite(m)) return '';
    if (m < 1000) return Math.round(m) + ' metres';
    const km = m / 1000;
    const rounded = km >= 10 ? String(Math.round(km)) : km.toFixed(1);
    return rounded + ' kilometres';
  }

  function elementCoords(el) {
    if (!el) return null;
    if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      return { lat: el.lat, lng: el.lon };
    }
    if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
      return { lat: el.center.lat, lng: el.center.lon };
    }
    return null;
  }

  function isFineDining(tags, name) {
    const t = tags || {};
    if (t.stars && String(t.stars).trim()) return true;
    const cuisine = String(t.cuisine || '').toLowerCase();
    if (/\bfine[_ ]?dining\b/.test(cuisine)) return true;
    return /steakhouse|brasserie|degustation|tasting menu|fine dining/i.test(String(name || ''));
  }

  function classifyDining(tags, name) {
    const t = tags || {};
    const amenity = String(t.amenity || '');
    const shop = String(t.shop || '');
    if (amenity === 'fast_food') return 'fast_food';
    if (amenity === 'pub' || amenity === 'bar') return 'pub';
    if (amenity === 'cafe') return 'cafe';
    if (amenity === 'bakery' || shop === 'bakery') return 'bakery';
    if (amenity === 'restaurant') return isFineDining(t, name) ? 'fine' : 'restaurant';
    return '';
  }

  function fallbackName(kind, tags) {
    const t = tags || {};
    if (kind === 'restroom') return 'Public toilets';
    if (kind === 'parks') {
      if (t.leisure === 'garden') return 'Garden';
      if (t.leisure === 'nature_reserve' || t.boundary === 'national_park') return 'Nature reserve';
      return 'Park';
    }
    return '';
  }

  function requiresName(kind) {
    return kind === 'dining' || kind === 'entertainment' || kind === 'sightseeing' || kind === 'events';
  }

  function parsePlaces(elements, origin, kind) {
    const spec = typeof kind === 'string' ? getKind(kind) : kind;
    const kindId = spec && spec.id;
    const out = [];
    const seen = new Set();
    for (const el of Array.isArray(elements) ? elements : []) {
      const tags = el && el.tags ? el.tags : {};
      const xy = elementCoords(el);
      if (!xy) continue;
      const rawName = String(tags.name || tags['name:en'] || '').trim();
      const name = rawName || fallbackName(kindId, tags);
      if (!name) continue;
      if (requiresName(kindId) && !rawName) continue;
      let type = '';
      if (kindId === 'dining') {
        type = classifyDining(tags, name);
        if (!type) continue;
      }
      const dist = haversineM(origin, xy);
      const key = name.toLowerCase() + '|' + xy.lat.toFixed(4) + '|' + xy.lng.toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        lat: xy.lat,
        lng: xy.lng,
        dist,
        type,
        mapsUrl: mapsDirUrl(xy.lat, xy.lng),
        mapsPlaceUrl: mapsPlaceUrl(xy.lat, xy.lng, name)
      });
    }
    return out;
  }

  function diningTypesPresent(places) {
    const have = new Set();
    for (const p of places || []) {
      if (p && p.type) have.add(p.type);
    }
    return DINING_TYPES.filter(t => have.has(t.id)).map(t => ({ id: t.id, label: t.label }));
  }

  function nearestFirst(places) {
    return (places || []).slice().sort((a, b) => a.dist - b.dist);
  }

  function mixDining(places) {
    const unused = nearestFirst(places);
    const picked = [];
    const used = new Set();
    for (const type of DINING_TYPE_IDS) {
      const hit = unused.find(p => p.type === type && !used.has(p));
      if (hit) {
        picked.push(hit);
        used.add(hit);
      }
    }
    for (const p of unused) {
      if (picked.length >= MAPS_MAX) break;
      if (!used.has(p)) {
        picked.push(p);
        used.add(p);
      }
    }
    return picked.slice(0, MAPS_MAX);
  }

  function pickMapsChoices(places, kind, type) {
    const list = places || [];
    if (kind === 'dining' && !type) return mixDining(list);
    const filtered = type ? list.filter(p => p.type === type) : list;
    return nearestFirst(filtered).slice(0, MAPS_MAX);
  }

  function suggestTitle(spec, type, count) {
    if (type) {
      const label = diningTypeLabel(type) || spec.label;
      return count ? ('Nearby ' + label.toLowerCase()) : ('No ' + label.toLowerCase() + ' nearby');
    }
    return count ? ('Nearby ' + spec.label.toLowerCase()) : ('No ' + spec.label.toLowerCase() + ' nearby');
  }

  function buildSuggestPayload({ kind, origin, elements, type }) {
    const spec = getKind(kind);
    if (!spec) return { error: 'invalid_kind' };
    const typeFilter = spec.id === 'dining' ? normalizeDiningType(type) : '';
    const places = parsePlaces(elements, origin, spec);
    const maps = pickMapsChoices(places, spec.id, typeFilter);
    const types = spec.id === 'dining' ? diningTypesPresent(places) : [];
    const heading = typeFilter
      ? (diningTypeLabel(typeFilter) || spec.label).toLowerCase()
      : spec.label.toLowerCase();
    const extract = maps.length
      ? maps.map(p => p.name + ', ' + formatDistance(p.dist)).join('. ') + '.'
      : ('No ' + heading + ' found nearby.');
    const spoken = maps.length
      ? ('Nearby ' + heading + '. ' + maps.map(p => p.name + ', ' + speakDistance(p.dist)).join('. ') + '.')
      : ('No ' + heading + ' found nearby.');
    return {
      kind: spec.id,
      label: spec.label,
      type: typeFilter,
      places: maps,
      types,
      title: suggestTitle(spec, typeFilter, maps.length),
      extract,
      spoken
    };
  }

  function buildOverpassQuery(kind, lat, lng) {
    const spec = typeof kind === 'string' ? getKind(kind) : kind;
    if (!spec) return '';
    const tags = KIND_TAGS[spec.id] || [];
    const radiusM = Math.max(200, Math.min(20000, Math.round(spec.radiusM)));
    const la = coord(lat);
    const ln = coord(lng);
    const parts = [];
    for (const [k, v] of tags) {
      const sel = v === '*' ? '[' + k + ']' : '[' + k + '=' + v + ']';
      parts.push('  node(around:' + radiusM + ',' + la + ',' + ln + ')' + sel + ';');
      parts.push('  way(around:' + radiusM + ',' + la + ',' + ln + ')' + sel + ';');
    }
    return '[out:json][timeout:25];\n(\n' + parts.join('\n') + '\n);\nout center 80;';
  }

  function overpassEndpoints(url) {
    const extra = [];
    if (Array.isArray(url)) extra.push(...url);
    else if (url) extra.push(url);
    const seen = new Set();
    const out = [];
    for (const item of extra.concat(OVERPASS_URLS)) {
      const endpoint = String(item || '').trim();
      if (!endpoint || seen.has(endpoint)) continue;
      seen.add(endpoint);
      out.push(endpoint);
    }
    return out.length ? out : OVERPASS_URLS.slice();
  }

  async function fetchOneOverpass(query, endpoint, fetchFn, timeoutMs) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (controller) controller.abort();
    }, timeoutMs || 28000);
    try {
      const opts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'User-Agent': 'PassengerTales/1.10 (+https://azzabazza11.github.io/road-lore/)'
        },
        body: 'data=' + encodeURIComponent(query)
      };
      if (controller) opts.signal = controller.signal;
      const res = await fetchFn(endpoint, opts);
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        const err = new Error('overpass ' + res.status);
        err.detail = detail;
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchOverpass(query, { url, fetchImpl, timeoutMs } = {}) {
    const fetchFn = fetchImpl || fetch;
    const endpoints = overpassEndpoints(url);
    let lastErr;
    for (const endpoint of endpoints) {
      try {
        return await fetchOneOverpass(query, endpoint, fetchFn, timeoutMs);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('overpass failed');
  }

  async function runSuggest({ kind, lat, lng, type, fetchImpl, overpassUrl }) {
    const spec = getKind(kind);
    if (!spec) {
      const err = new Error('invalid_kind');
      err.code = 'invalid_kind';
      throw err;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      const err = new Error('bad_coords');
      err.code = 'bad_coords';
      throw err;
    }
    const query = buildOverpassQuery(spec, lat, lng);
    const data = await fetchOverpass(query, { url: overpassUrl, fetchImpl });
    return buildSuggestPayload({
      kind: spec.id,
      origin: { lat, lng },
      elements: (data && data.elements) || [],
      type
    });
  }

  return {
    OVERPASS_URLS,
    DEFAULT_OVERPASS,
    KINDS,
    KIND_IDS,
    DINING_TYPES,
    DINING_TYPE_IDS,
    MAPS_MAX,
    getKind,
    normalizeDiningType,
    diningTypeLabel,
    haversineM,
    mapsDirUrl,
    mapsPlaceUrl,
    formatDistance,
    speakDistance,
    elementCoords,
    isFineDining,
    classifyDining,
    parsePlaces,
    diningTypesPresent,
    mixDining,
    pickMapsChoices,
    buildSuggestPayload,
    buildOverpassQuery,
    overpassEndpoints,
    fetchOverpass,
    runSuggest
  };
});
