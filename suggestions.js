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

  function parseWikipediaTitle(tags) {
    const raw = String((tags && (tags.wikipedia || tags['wikipedia:en'])) || '').trim();
    if (!raw) return '';
    const colon = raw.indexOf(':');
    if (colon > 0 && /^[a-z]{2,3}$/i.test(raw.slice(0, colon))) {
      if (raw.slice(0, colon).toLowerCase() !== 'en') return '';
      return raw.slice(colon + 1).replace(/_/g, ' ').trim();
    }
    return raw.replace(/_/g, ' ').trim();
  }

  function parseWikidataId(tags) {
    const id = String((tags && tags.wikidata) || '').trim();
    return /^Q\d+$/i.test(id) ? ('Q' + id.slice(1)) : '';
  }

  function parseCommonsFile(tags) {
    const raw = String((tags && (tags.wikimedia_commons || tags.image)) || '').trim();
    if (!raw || /^Category:/i.test(raw)) return '';
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (u.hostname === 'upload.wikimedia.org' && u.protocol === 'https:') return raw;
        if (u.hostname === 'commons.wikimedia.org') {
          const m = decodeURIComponent(u.pathname).match(/\/wiki\/(?:File:)?(.+)$/i);
          if (m && m[1] && !/^Category:/i.test(m[1])) return m[1].replace(/_/g, ' ');
        }
      } catch { /* ignore */ }
      return '';
    }
    return raw.replace(/^File:/i, '').trim();
  }

  function mediaHints(tags) {
    const wikipedia = parseWikipediaTitle(tags);
    const wikidata = parseWikidataId(tags);
    const commons = parseCommonsFile(tags);
    const thumb = /^https:\/\/upload\.wikimedia\.org\//i.test(commons) ? commons : '';
    return {
      wikipedia,
      wikidata,
      commons: thumb ? '' : commons,
      thumb
    };
  }

  function isWikimediaThumb(url) {
    try {
      const u = new URL(String(url || ''));
      return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org';
    } catch {
      return false;
    }
  }

  async function fetchJson(fetchFn, url) {
    const res = await fetchFn(url);
    if (!res || !res.ok) return null;
    return res.json();
  }

  async function wikiPageimages(titles, fetchFn, size) {
    const unique = [];
    const seen = new Set();
    for (const title of titles || []) {
      const t = String(title || '').trim();
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      unique.push(t);
    }
    const thumbs = new Map();
    if (!unique.length) return thumbs;
    const u = new URL('https://en.wikipedia.org/w/api.php');
    u.searchParams.set('action', 'query');
    u.searchParams.set('prop', 'pageimages');
    u.searchParams.set('piprop', 'thumbnail');
    u.searchParams.set('pithumbsize', String(size || 160));
    u.searchParams.set('titles', unique.join('|'));
    u.searchParams.set('format', 'json');
    u.searchParams.set('origin', '*');
    const data = await fetchJson(fetchFn, u.toString());
    const pages = (data && data.query && data.query.pages) || {};
    const byTitle = new Map();
    for (const page of Object.values(pages)) {
      if (page && page.title && page.thumbnail && isWikimediaThumb(page.thumbnail.source)) {
        byTitle.set(page.title, page.thumbnail.source);
      }
    }
    for (const n of (data && data.query && data.query.normalized) || []) {
      if (n && n.from && n.to && byTitle.has(n.to)) byTitle.set(n.from, byTitle.get(n.to));
    }
    unique.forEach(title => {
      if (byTitle.has(title)) thumbs.set(title, byTitle.get(title));
      else {
        const hit = [...byTitle.keys()].find(k => k.toLowerCase() === title.toLowerCase());
        if (hit) thumbs.set(title, byTitle.get(hit));
      }
    });
    return thumbs;
  }

  async function commonsThumbs(files, fetchFn, size) {
    const unique = [];
    const seen = new Set();
    for (const file of files || []) {
      const f = String(file || '').replace(/^File:/i, '').trim();
      if (!f || seen.has(f.toLowerCase())) continue;
      seen.add(f.toLowerCase());
      unique.push(f);
    }
    const thumbs = new Map();
    if (!unique.length) return thumbs;
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.searchParams.set('action', 'query');
    u.searchParams.set('prop', 'imageinfo');
    u.searchParams.set('iiprop', 'url');
    u.searchParams.set('iiurlwidth', String(size || 160));
    u.searchParams.set('titles', unique.map(f => 'File:' + f).join('|'));
    u.searchParams.set('format', 'json');
    u.searchParams.set('origin', '*');
    const data = await fetchJson(fetchFn, u.toString());
    for (const page of Object.values((data && data.query && data.query.pages) || {})) {
      const info = page && page.imageinfo && page.imageinfo[0];
      const src = (info && (info.thumburl || info.url)) || '';
      if (!isWikimediaThumb(src)) continue;
      const title = String(page.title || '').replace(/^File:/i, '');
      thumbs.set(title, src);
      unique.forEach(f => {
        if (f.toLowerCase() === title.toLowerCase()) thumbs.set(f, src);
      });
    }
    return thumbs;
  }

  async function wikidataHints(ids, fetchFn) {
    const unique = [];
    const seen = new Set();
    for (const id of ids || []) {
      const q = parseWikidataId({ wikidata: id });
      if (!q || seen.has(q)) continue;
      seen.add(q);
      unique.push(q);
    }
    const out = new Map();
    if (!unique.length) return out;
    const u = new URL('https://www.wikidata.org/w/api.php');
    u.searchParams.set('action', 'wbgetentities');
    u.searchParams.set('ids', unique.join('|'));
    u.searchParams.set('props', 'claims|sitelinks');
    u.searchParams.set('format', 'json');
    u.searchParams.set('origin', '*');
    const data = await fetchJson(fetchFn, u.toString());
    const entities = (data && data.entities) || {};
    for (const id of unique) {
      const ent = entities[id];
      if (!ent) continue;
      const p18 = ent.claims && ent.claims.P18 && ent.claims.P18[0];
      const commons = p18 && p18.mainsnak && p18.mainsnak.datavalue && p18.mainsnak.datavalue.value
        ? String(p18.mainsnak.datavalue.value)
        : '';
      const wikipedia = ent.sitelinks && ent.sitelinks.enwiki && ent.sitelinks.enwiki.title
        ? String(ent.sitelinks.enwiki.title)
        : '';
      out.set(id, { commons, wikipedia });
    }
    return out;
  }

  async function resolvePlaceThumbs(places, { fetchImpl, thumbSize } = {}) {
    const fetchFn = fetchImpl || fetch;
    const size = thumbSize || 160;
    const list = (places || []).map(p => Object.assign({}, p));
    const wikiTitles = [];
    const commonsFiles = [];
    const wikiIds = [];
    list.forEach(p => {
      if (p.thumb && isWikimediaThumb(p.thumb)) return;
      if (p.wikipedia) wikiTitles.push(p.wikipedia);
      if (p.commons) commonsFiles.push(p.commons);
      if (p.wikidata) wikiIds.push(p.wikidata);
    });
    const wd = await wikidataHints(wikiIds, fetchFn);
    wd.forEach(hint => {
      if (hint.wikipedia) wikiTitles.push(hint.wikipedia);
      if (hint.commons) commonsFiles.push(hint.commons);
    });
    const [wikiThumbs, fileThumbs] = await Promise.all([
      wikiPageimages(wikiTitles, fetchFn, size),
      commonsThumbs(commonsFiles, fetchFn, size)
    ]);
    list.forEach(p => {
      if (p.thumb && isWikimediaThumb(p.thumb)) return;
      const wdHint = p.wikidata ? wd.get(p.wikidata) : null;
      const commonsName = p.commons || (wdHint && wdHint.commons) || '';
      const wikiTitle = p.wikipedia || (wdHint && wdHint.wikipedia) || '';
      if (commonsName && fileThumbs.get(commonsName)) {
        p.thumb = fileThumbs.get(commonsName);
        return;
      }
      if (wikiTitle && wikiThumbs.get(wikiTitle)) {
        p.thumb = wikiThumbs.get(wikiTitle);
      }
    });
    return list;
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
      const media = mediaHints(tags);
      out.push({
        name,
        lat: xy.lat,
        lng: xy.lng,
        dist,
        type,
        mapsUrl: mapsDirUrl(xy.lat, xy.lng),
        mapsPlaceUrl: mapsPlaceUrl(xy.lat, xy.lng, name),
        wikipedia: media.wikipedia,
        wikidata: media.wikidata,
        commons: media.commons,
        thumb: media.thumb
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
    parseWikipediaTitle,
    parseWikidataId,
    parseCommonsFile,
    mediaHints,
    isWikimediaThumb,
    resolvePlaceThumbs,
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
