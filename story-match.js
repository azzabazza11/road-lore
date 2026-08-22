// Title matching for “don’t repeat stories”.
// Used by the nearby clip index and mirrored in index.html (no bundler).

function normalizeTitle(s) {
  return String(s || '')
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

module.exports = {
  normalizeTitle,
  titleTokens,
  titlesSimilar,
  titleInList
};
