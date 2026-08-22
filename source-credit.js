// Occasional spoken credit for a real source, pointing at the card’s Sources link.

const SOURCE_CREDIT_MAX = 3;
const SOURCE_CREDIT_EVERY_MIN = 5;
const SOURCE_CREDIT_EVERY_MAX = 10;

const HOST_NAMES = {
  'en.wikipedia.org': 'Wikipedia',
  'wikipedia.org': 'Wikipedia',
  'stuff.co.nz': 'Stuff',
  'nzherald.co.nz': 'the New Zealand Herald',
  'rnz.co.nz': 'RNZ',
  'gns.cri.nz': 'GNS Science',
  'stats.govt.nz': 'Stats NZ',
  'teara.govt.nz': 'Te Ara',
  'natlib.govt.nz': 'the National Library',
  'doc.govt.nz': 'the Department of Conservation',
  'linz.govt.nz': 'LINZ',
  'bbc.co.uk': 'the BBC',
  'bbc.com': 'the BBC',
  'theguardian.com': 'the Guardian',
  'thespinoff.co.nz': 'The Spinoff',
  'odt.co.nz': 'the Otago Daily Times',
  'waikato.ac.nz': 'the University of Waikato',
  'auckland.ac.nz': 'the University of Auckland',
  'usgs.gov': 'the USGS'
};

function parseUrl(uri) {
  try {
    return new URL(String(uri || ''));
  } catch {
    return null;
  }
}

function hostKey(uri) {
  const u = parseUrl(uri);
  if (!u) return '';
  return u.hostname.replace(/^www\./i, '').toLowerCase();
}

function isLowValueSource(uri) {
  const u = parseUrl(uri);
  if (!u) return true;
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  const path = u.pathname || '';
  if (/google\./i.test(host) && /search/i.test(path + u.search)) return true;
  if (/vertexaisearch|grounding-api|googleusercontent/i.test(host)) return true;
  if (host === 'google.com' || host.endsWith('.google.com')) return true;
  return false;
}

function spokenSiteName(uri, title) {
  if (/wikipedia/i.test(String(title || ''))) return 'Wikipedia';
  if (isLowValueSource(uri)) return '';
  const host = hostKey(uri);
  if (!host) return '';
  if (HOST_NAMES[host]) return HOST_NAMES[host];
  const parts = host.split('.');
  let base = parts[0];
  if (parts.length >= 3 && ['co', 'com', 'govt', 'ac', 'org', 'net'].includes(parts[parts.length - 2])) {
    base = parts[parts.length - 3] || parts[0];
  }
  if (!base || base.length < 3) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function worthySourceName(story) {
  if (!story || story.continuation) return '';
  const sources = Array.isArray(story.sources) ? story.sources : [];
  for (const s of sources) {
    const name = spokenSiteName(s && s.uri, s && s.title);
    if (name) return name;
  }
  if (story.url) {
    const name = spokenSiteName(story.url, story.title);
    if (name) return name;
  }
  if (!story.ai && /^\d+$/.test(String(story.pageid || ''))) return 'Wikipedia';
  return '';
}

function sourceCreditLine(siteName) {
  const name = String(siteName || '').trim();
  if (!name) return '';
  return (
    'This Passenger Tale was sliced from ' +
    name +
    '. Tap Sources on the card if you would like to visit.'
  );
}

function clampCreditEvery(every) {
  const n = Math.round(Number(every));
  if (!Number.isFinite(n)) return 7;
  return Math.min(SOURCE_CREDIT_EVERY_MAX, Math.max(SOURCE_CREDIT_EVERY_MIN, n));
}

function shouldSpeakSourceCredit(heardCount, every, slot) {
  if ((Number(heardCount) || 0) >= SOURCE_CREDIT_MAX) return false;
  const n = clampCreditEvery(every);
  return (Number(slot) || 0) === 0 && n >= SOURCE_CREDIT_EVERY_MIN;
}

function pickCreditEvery(random) {
  const r = typeof random === 'function' ? random() : Math.random();
  return SOURCE_CREDIT_EVERY_MIN + Math.floor(r * (SOURCE_CREDIT_EVERY_MAX - SOURCE_CREDIT_EVERY_MIN + 1));
}

module.exports = {
  SOURCE_CREDIT_MAX,
  SOURCE_CREDIT_EVERY_MIN,
  SOURCE_CREDIT_EVERY_MAX,
  isLowValueSource,
  spokenSiteName,
  worthySourceName,
  sourceCreditLine,
  shouldSpeakSourceCredit,
  pickCreditEvery,
  clampCreditEvery
};
