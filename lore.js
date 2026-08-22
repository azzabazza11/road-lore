// Grounded local-lore prompts for POST /api/lore.
// Interests and story length come from the phone; invalid values fall back to
// “all topics” and medium length so older clients keep working.

const INTERESTS = {
  history: {
    label: 'History',
    prompt:
      'local history: iwi and Māori heritage, early settlers, wars, civic events, heritage buildings, and how the place grew'
  },
  geology: {
    label: 'Geology',
    prompt:
      'geology and landforms: volcanoes, faults, rock types, glaciers, geothermal features, fossils, coastal erosion, and how the landscape formed. Search geological surveys (GNS Science, USGS, or the local survey) and geology pages — not just travel blurbs'
  },
  nature: {
    label: 'Nature',
    prompt:
      'nature and ecology: native plants and animals, forests, wetlands, rivers, parks, and conservation stories'
  },
  people: {
    label: 'People',
    prompt:
      'notable people tied to the area: explorers, inventors, artists, leaders, and local characters'
  },
  maritime: {
    label: 'Maritime',
    prompt:
      'maritime stories: shipwrecks, harbours, lighthouses, fishing, and coastal trade'
  },
  industry: {
    label: 'Industry',
    prompt:
      'work and industry: mining, gum, gold, farming, mills, railways, and how people made a living'
  },
  culture: {
    label: 'Culture',
    prompt:
      'culture and arts: language, marae, festivals, food, music, and local traditions'
  },
  civic: {
    label: 'Civic',
    prompt:
      'local government and council: district or city council, long-term and district plans, town hall, infrastructure, bypasses, water and housing schemes. Search council sites and plan documents — not national politics'
  },
  news: {
    label: 'News',
    prompt:
      'recent local news: community papers, council notices, and town headlines from the last few years. Prefer civic developments, festivals, and notable events. Skip graphic crime, accidents, and electioneering'
  },
  stats: {
    label: 'Stats',
    prompt:
      'town and region statistics: population, area, elevation, nicknames, sister cities, census quirks, and what the place is known for in numbers. Search Stats NZ, census, council community profiles, or the local equivalent'
  },
  trivia: {
    label: 'Trivia',
    prompt:
      'fun facts and trivia: quirky true details, records, unusual laws, local firsts, odd place names, and “did you know” notes that are grounded in sources'
  }
};

const INTEREST_IDS = Object.keys(INTERESTS);

const LENGTHS = {
  short: {
    id: 'short',
    sentences: 'About 2 sentences',
    expand: '1–2 extra sentences',
    timeoutMs: 30000
  },
  medium: {
    id: 'medium',
    sentences: 'About 3–4 sentences',
    expand: '3–5 extra sentences',
    timeoutMs: 30000
  },
  long: {
    id: 'long',
    sentences: 'About 6–8 sentences. Include a vivid detail and one surprising fact',
    expand: '5–8 extra sentences',
    timeoutMs: 45000
  }
};

function normalizeInterests(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = String(item || '').toLowerCase().trim();
    if (INTERESTS[id] && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.length ? out : INTEREST_IDS.slice();
}

function normalizeLength(raw) {
  const id = String(raw || '').toLowerCase().trim();
  return LENGTHS[id] ? id : 'medium';
}

function loreTimeoutMs(length) {
  return LENGTHS[normalizeLength(length)].timeoutMs;
}

function interestClause(ids) {
  const parts = ids.map(id => INTERESTS[id].prompt);
  if (ids.length === 1) {
    return 'The traveller wants stories about ' + parts[0] + '. Focus on that topic.';
  }
  return (
    'The traveller is interested in: ' +
    ids.map(id => INTERESTS[id].label.toLowerCase()).join(', ') +
    '. Pick ONE true story that clearly matches one of these interests ' +
    '(do not mash several topics into one tale unless they are the same event). ' +
    'Topic cues: ' +
    parts.join('; ') +
    '.'
  );
}

function buildLorePrompt({ lat, lng, avoid = [], expand = null, interests, length } = {}) {
  const ids = normalizeInterests(interests);
  const len = normalizeLength(length);
  const spec = LENGTHS[len];
  const where =
    'The traveller is near latitude ' +
    Number(lat).toFixed(5) +
    ', longitude ' +
    Number(lng).toFixed(5) +
    '.';
  const avoidList = (avoid || []).map(t => String(t || '').trim()).filter(Boolean).slice(0, 24);
  const avoidClause = avoidList.length
    ? 'The traveller has already heard stories about these — pick something clearly different: ' +
      avoidList.join('; ') +
      '. Do not retell, paraphrase, or restart any of those topics, even under a new title. ' +
      'If the only true local story is one they already heard, do not start over — continue it instead with new facts only.'
    : '';

  if (expand && expand.text) {
    const title = String(expand.title || 'Local lore').replace(/["\\]/g, '');
    return [
      'You are a warm, knowledgeable local guide for people on a road trip.',
      where,
      'They just heard this short piece titled "' + title + '":',
      String(expand.text),
      'Use web search to flesh out THIS SAME topic with ' + spec.expand + ': more colour, a surprising fact,',
      'or what happened next. Stay on the same subject and lean into the traveller’s interests when relevant:',
      ids.map(id => INTERESTS[id].label.toLowerCase()).join(', ') + '.',
      'Do not retell the original. Do not start a new subject. Do not give directions.',
      'Friendly and easy to follow when read aloud while driving.',
      'Respond ONLY with minified JSON, no code fences: {"title":"' +
        title +
        '","text":"<the extra narration only>"}'
    ].join(' ');
  }

  return [
    'You are a warm, knowledgeable local guide for people on a road trip.',
    where,
    'Use web search to find ONE genuinely interesting true story from the wider local area or region',
    '(it need not be at the exact point).',
    interestClause(ids),
    'Blend vivid storytelling with accurate facts. ' + spec.sentences +
      ', friendly and easy to follow when read aloud while driving.',
    'Do not give directions or navigation instructions.',
    avoidClause,
    avoidList.length
      ? 'Respond ONLY with minified JSON, no code fences: {"title":"<short evocative title, max 6 words>","text":"<the narration>"}. ' +
        'If this continues a story they already heard, use {"title":"<same topic>","text":"<2–4 NEW sentences only>","continue":true} and do not repeat facts they already heard.'
      : 'Respond ONLY with minified JSON, no code fences: {"title":"<short evocative title, max 6 words>","text":"<the narration>"}'
  ].filter(Boolean).join(' ');
}

module.exports = {
  INTERESTS,
  INTEREST_IDS,
  LENGTHS,
  normalizeInterests,
  normalizeLength,
  loreTimeoutMs,
  buildLorePrompt
};
