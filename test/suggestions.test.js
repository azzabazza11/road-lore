const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  KIND_IDS,
  DINING_TYPE_IDS,
  mapsDirUrl,
  formatDistance,
  speakDistance,
  classifyDining,
  isFineDining,
  parsePlaces,
  diningTypesPresent,
  mixDining,
  pickMapsChoices,
  buildSuggestPayload,
  buildOverpassQuery,
  runSuggest,
  getKind
} = require('../suggestions');

const ORIGIN = { lat: -36.8485, lng: 174.7633 };

function node(id, lat, lng, tags) {
  return { type: 'node', id, lat, lon: lng, tags };
}

function way(id, lat, lng, tags) {
  return { type: 'way', id, center: { lat, lon: lng }, tags };
}

describe('kinds', () => {
  it('lists the six one-shot suggestion kinds', () => {
    assert.deepEqual(KIND_IDS, [
      'entertainment', 'events', 'dining', 'sightseeing', 'parks', 'restroom'
    ]);
    assert.ok(getKind('Dining'));
    assert.equal(getKind('history'), null);
  });
});

describe('maps + distance', () => {
  it('builds a Google Maps directions hop from coordinates', () => {
    const url = mapsDirUrl(-36.84846, 174.76333);
    assert.equal(
      url,
      'https://www.google.com/maps/dir/?api=1&destination=-36.848460%2C174.763330'
    );
  });

  it('formats metres and kilometres for the card and speech', () => {
    assert.equal(formatDistance(420), '420 m');
    assert.equal(formatDistance(1240), '1.2 km');
    assert.equal(speakDistance(420), '420 metres');
    assert.equal(speakDistance(1240), '1.2 kilometres');
    assert.equal(speakDistance(12000), '12 kilometres');
  });
});

describe('dining classification', () => {
  it('orders types high-end through fast food', () => {
    assert.deepEqual(DINING_TYPE_IDS, [
      'fine', 'restaurant', 'cafe', 'pub', 'bakery', 'fast_food'
    ]);
  });

  it('marks starred or named fine dining, and leaves a plain restaurant', () => {
    assert.equal(isFineDining({ stars: '1' }, 'Ortolana'), true);
    assert.equal(classifyDining({ amenity: 'restaurant', cuisine: 'fine_dining' }, 'Ahi'), 'fine');
    assert.equal(classifyDining({ amenity: 'restaurant' }, 'The Grill Steakhouse'), 'fine');
    assert.equal(classifyDining({ amenity: 'restaurant' }, 'Thai House'), 'restaurant');
    assert.equal(classifyDining({ amenity: 'cafe' }, 'Coco'), 'cafe');
    assert.equal(classifyDining({ amenity: 'pub' }, 'The Dog'), 'pub');
    assert.equal(classifyDining({ amenity: 'bar' }, 'The Dog'), 'pub');
    assert.equal(classifyDining({ amenity: 'bakery' }, 'Daily Bread'), 'bakery');
    assert.equal(classifyDining({ shop: 'bakery' }, 'Daily Bread'), 'bakery');
    assert.equal(classifyDining({ amenity: 'fast_food' }, 'Hell Pizza'), 'fast_food');
  });
});

describe('parsePlaces', () => {
  it('skips unnamed dining and keeps restroom / park fallbacks', () => {
    const elements = [
      node(1, -36.849, 174.764, { amenity: 'restaurant' }),
      node(2, -36.85, 174.765, { amenity: 'restaurant', name: 'Ortolana' }),
      node(3, -36.847, 174.762, { amenity: 'toilets' }),
      way(4, -36.846, 174.761, { leisure: 'park' })
    ];
    const dining = parsePlaces(elements, ORIGIN, 'dining');
    assert.equal(dining.length, 1);
    assert.equal(dining[0].name, 'Ortolana');
    assert.ok(dining[0].mapsUrl.startsWith('https://www.google.com/maps/dir/'));

    const loos = parsePlaces(elements, ORIGIN, 'restroom');
    assert.equal(loos[0].name, 'Public toilets');

    const parks = parsePlaces(elements, ORIGIN, 'parks');
    assert.equal(parks[0].name, 'Park');
  });

  it('reads way centres and dedupes the same name at the same pin', () => {
    const elements = [
      node(1, -36.8485, 174.7633, { amenity: 'cinema', name: 'Rialto' }),
      way(2, -36.84851, 174.76331, { amenity: 'cinema', name: 'Rialto' })
    ];
    const places = parsePlaces(elements, ORIGIN, 'entertainment');
    assert.equal(places.length, 1);
  });
});

describe('dining mix and refine', () => {
  const places = [
    { name: 'Hell Pizza', dist: 80, type: 'fast_food', lat: 1, lng: 1, mapsUrl: 'u' },
    { name: 'Cafe Coco', dist: 200, type: 'cafe', lat: 1, lng: 1, mapsUrl: 'u' },
    { name: 'Cafe Bean', dist: 250, type: 'cafe', lat: 1, lng: 1, mapsUrl: 'u' },
    { name: 'Thai House', dist: 400, type: 'restaurant', lat: 1, lng: 1, mapsUrl: 'u' },
    { name: 'Daily Bread', dist: 900, type: 'bakery', lat: 1, lng: 1, mapsUrl: 'u' }
  ];

  it('mixes one of each type in high-end order, not nearest-only', () => {
    const mix = mixDining(places);
    assert.deepEqual(mix.map(p => p.name), ['Thai House', 'Cafe Coco', 'Daily Bread']);
  });

  it('lists only types that actually hit', () => {
    const types = diningTypesPresent(places);
    assert.deepEqual(types.map(t => t.id), ['restaurant', 'cafe', 'bakery', 'fast_food']);
    assert.ok(!types.some(t => t.id === 'fine' || t.id === 'pub'));
  });

  it('refines to nearest of a real type and does not invent fine dining', () => {
    assert.deepEqual(pickMapsChoices(places, 'dining', 'cafe').map(p => p.name), [
      'Cafe Coco', 'Cafe Bean'
    ]);
    assert.deepEqual(pickMapsChoices(places, 'dining', 'fine'), []);
  });

  it('caps Maps choices at three nearest for non-dining', () => {
    const parks = [
      { name: 'A', dist: 10 },
      { name: 'B', dist: 20 },
      { name: 'C', dist: 30 },
      { name: 'D', dist: 40 }
    ];
    assert.deepEqual(pickMapsChoices(parks, 'parks').map(p => p.name), ['A', 'B', 'C']);
  });
});

describe('buildSuggestPayload', () => {
  it('builds a spoken list and keeps unused dining types for refine chips', () => {
    const elements = [
      node(1, -36.8486, 174.7634, { amenity: 'restaurant', name: 'Thai House' }),
      node(2, -36.8487, 174.7635, { amenity: 'cafe', name: 'Cafe Coco' }),
      node(3, -36.8495, 174.7645, { amenity: 'fast_food', name: 'Hell Pizza' }),
      node(4, -36.8505, 174.7655, { amenity: 'bakery', name: 'Daily Bread' })
    ];
    const payload = buildSuggestPayload({
      kind: 'dining',
      origin: ORIGIN,
      elements
    });
    assert.equal(payload.kind, 'dining');
    assert.equal(payload.places.length, 3);
    assert.equal(payload.places[0].name, 'Thai House');
    assert.ok(payload.types.some(t => t.id === 'fast_food'));
    assert.match(payload.spoken, /Nearby dining/);
    assert.match(payload.spoken, /Thai House/);
    assert.match(payload.extract, /Thai House/);
  });

  it('says nothing was found instead of inventing a place', () => {
    const payload = buildSuggestPayload({
      kind: 'restroom',
      origin: ORIGIN,
      elements: []
    });
    assert.equal(payload.places.length, 0);
    assert.match(payload.extract, /No restroom found nearby/);
  });
});

describe('Overpass query + runSuggest', () => {
  it('emits allowlisted tags and safe coordinates', () => {
    const q = buildOverpassQuery('dining', -36.8485, 174.7633);
    assert.match(q, /amenity=restaurant/);
    assert.match(q, /amenity=cafe/);
    assert.match(q, /-36\.848500,174\.763300/);
    assert.doesNotMatch(q, /history/);
  });

  it('runs against a fake Overpass and rejects a bad kind', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        elements: [
          node(1, -36.8486, 174.7634, { amenity: 'toilets', name: 'Civic loos' })
        ]
      })
    });
    const payload = await runSuggest({
      kind: 'restroom',
      lat: -36.8485,
      lng: 174.7633,
      fetchImpl
    });
    assert.equal(payload.places[0].name, 'Civic loos');

    await assert.rejects(
      () => runSuggest({ kind: 'history', lat: 0, lng: 0, fetchImpl }),
      err => err.code === 'invalid_kind'
    );
  });
});
