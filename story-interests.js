// How Settings interests curate Wikipedia / shared-clip narrator cards.
// Regexes are mirrored on STORY_INTERESTS in index.html (no bundler).

const WIKI = {
  history: /history|museum|heritage|castle|cathedral|fort|memorial|settlement|pioneer/i,
  geology:
    /volcano|volcanic|basalt|limestone|granite|fault|glacier|geothermal|geyser|fossil|crater|ridge|escarpment|sandstone|schist|igneous|sediment|earthquake|tectonic|karst|cave|mineral|goldfield/i,
  nature:
    /national park|forest|wildlife|bird|wetland|reserve|river|lake|mountain|bay|harbour|harbor|beach|island|flora|fauna|conservation/i,
  people: /\bborn\b|politician|artist|explorer|chief|writer|inventor|scientist|captain/i,
  maritime: /shipwreck|harbour|harbor|lighthouse|wharf|port|ferry|naval|wreck|maritime|fishing/i,
  industry: /mine|mining|mill|railway|farm|gum|gold|timber|kauri|dairy|quarry|factory|industry/i,
  culture: /m[aā]ori|iwi|marae|festival|art gallery|language|tradition|wharenui|hap[uū]/i,
  civic: /council|district|borough|municipality|mayor|town hall|city hall|planning|infrastructure/i,
  news: /newspaper|herald|times\b|gazette|chronicle|bulletin/i,
  stats: /population|census|demographics|statistics|inhabitants|elevation/i,
  trivia: /famous for|known for|record|unusual|only|first|nickname|odd/i
};

const INTEREST_IDS = Object.keys(WIKI);

function matchingInterestIds(title, extract, selected) {
  const hay = (String(title || '') + ' ' + String(extract || '')).toLowerCase();
  const want = Array.isArray(selected) && selected.length ? selected : INTEREST_IDS;
  const out = [];
  for (const id of want) {
    if (WIKI[id] && WIKI[id].test(hay)) out.push(id);
  }
  return out;
}

function interestBoost(title, extract, selected) {
  const n = matchingInterestIds(title, extract, selected).length;
  if (!n) return 0;
  return n * (extract ? 100 : 70);
}

function interestsNarrowed(selected) {
  const list = Array.isArray(selected) ? selected : [];
  return list.length > 0 && list.length < INTEREST_IDS.length;
}

function clipFitsInterests(title, extract, selected) {
  if (!interestsNarrowed(selected)) return true;
  return matchingInterestIds(title, extract, selected).length > 0;
}

module.exports = {
  WIKI,
  INTEREST_IDS,
  matchingInterestIds,
  interestBoost,
  interestsNarrowed,
  clipFitsInterests
};
