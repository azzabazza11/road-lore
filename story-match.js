// Title matching for “don’t repeat stories”.
// Used by the nearby clip index and mirrored in index.html (no bundler).

function stripChapterSuffix(s) {
  return String(s || '')
    .replace(/[\s]*[-–—:,]+\s*(?:part|chapter|ch\.?)\s*(?:[ivxlcdm]+|\d+)\s*$/i, '')
    .replace(/\s+(?:part|chapter|ch\.?)\s*(?:[ivxlcdm]+|\d+)\s*$/i, '')
    .trim();
}

function romanToInt(str) {
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const s = String(str || '').toLowerCase();
  let n = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = map[s[i]];
    if (!v) return 0;
    n += v < prev ? -v : v;
    prev = v;
  }
  return n;
}

function intToRoman(n) {
  const nums = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let x = Math.max(1, Math.min(20, Number(n) || 1));
  let out = '';
  for (const [v, s] of nums) {
    while (x >= v) {
      out += s;
      x -= v;
    }
  }
  return out;
}

function chapterNumber(title) {
  const s = String(title || '').trim();
  const m = s.match(/(?:part|chapter|ch\.?)\s*([ivxlcdm]+|\d+)\s*$/i);
  if (!m) return 1;
  if (/^\d+$/.test(m[1])) return Math.max(1, parseInt(m[1], 10));
  return romanToInt(m[1]) || 1;
}

function baseTitle(title) {
  return stripChapterSuffix(title) || String(title || '').trim();
}

function normalizeTitle(s) {
  return stripChapterSuffix(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|of|and|in|on|at|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(s) {
  return normalizeTitle(s).split(' ').filter(t => t.length > 1);
}

function titlesSimilar(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 8 && longer.includes(shorter)) {
    const idx = longer.indexOf(shorter);
    const before = idx === 0 || longer[idx - 1] === ' ';
    const after = idx + shorter.length === longer.length || longer[idx + shorter.length] === ' ';
    if (before && after) return true;
  }
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.length || !tb.length) return false;
  const setB = new Set(tb);
  const inter = ta.filter(t => setB.has(t)).length;
  const union = new Set(ta.concat(tb)).size;
  if (inter >= 2 && union && inter / union >= 0.5) return true;
  if (ta.length === 1 && tb.length === 1 && ta[0] === tb[0] && ta[0].length >= 5) return true;
  return false;
}

function titleInList(title, list) {
  if (!title || !list || !list.length) return false;
  return list.some(item => titlesSimilar(title, item));
}

function nextChapterTitle(title, existingTitles) {
  const raw = String(title || '').trim() || 'Local lore';
  const base = baseTitle(raw) || raw;
  let highest = 0;
  for (const item of existingTitles || []) {
    if (!titlesSimilar(item, base)) continue;
    highest = Math.max(highest, chapterNumber(item));
  }
  const incoming = chapterNumber(raw);
  if (highest === 0) highest = incoming > 1 ? incoming - 1 : 1;
  const next = incoming > highest ? incoming : highest + 1;
  return base + ' — Part ' + intToRoman(next);
}

function spokenTopicName(title) {
  let s = baseTitle(title).replace(/[.!?]+$/, '').trim();
  if (!s) return '';
  if (/^the\s+/i.test(s)) return 'the ' + s.replace(/^the\s+/i, '');
  return s;
}

function continueRemark(title) {
  const name = spokenTopicName(title);
  if (!name) return "There's more to that story. ";
  return "There's more to the story of " + name + '. ';
}

module.exports = {
  stripChapterSuffix,
  baseTitle,
  chapterNumber,
  normalizeTitle,
  titleTokens,
  titlesSimilar,
  titleInList,
  nextChapterTitle,
  spokenTopicName,
  continueRemark
};
