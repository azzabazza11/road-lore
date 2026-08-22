// How Short / Medium / Long change a story.
// Speech budgets are mirrored on STORY_LENGTHS in index.html (no bundler).

const SPEECH_CHARS = {
  short: 360,
  medium: 520,
  long: 1400
};

function normalizeStoryLength(raw) {
  const id = String(raw || '').toLowerCase().trim();
  return SPEECH_CHARS[id] ? id : 'medium';
}

function speechCharsFor(length) {
  return SPEECH_CHARS[normalizeStoryLength(length)];
}

// Long needs article body, not the intro-only Wikipedia extract.
function wikiUsesFullExtract(length) {
  return normalizeStoryLength(length) === 'long';
}

// Shared clips were recorded at whoever generated them’s length.
// play = reuse the cached audio; clip = speak a trimmed copy; skip = too short for Long.
function sharedClipPlan(textLength, length) {
  const id = normalizeStoryLength(length);
  const budget = SPEECH_CHARS[id];
  const n = Number(textLength) || 0;
  if (id === 'long' && n < budget * 0.45) return 'skip';
  if (n > budget * 1.3) return 'clip';
  return 'play';
}

module.exports = {
  SPEECH_CHARS,
  normalizeStoryLength,
  speechCharsFor,
  wikiUsesFullExtract,
  sharedClipPlan
};
