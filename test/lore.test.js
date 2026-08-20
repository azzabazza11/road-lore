const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  INTEREST_IDS,
  LENGTHS,
  normalizeInterests,
  normalizeLength,
  loreTimeoutMs,
  buildLorePrompt
} = require('../lore');

describe('normalizeInterests', () => {
  it('keeps known ids in order and drops junk', () => {
    assert.deepEqual(
      normalizeInterests(['geology', 'HISTORY', 'nope', 'geology', '']),
      ['geology', 'history']
    );
  });

  it('falls back to every topic when missing or empty', () => {
    assert.deepEqual(normalizeInterests(undefined), INTEREST_IDS);
    assert.deepEqual(normalizeInterests([]), INTEREST_IDS);
    assert.deepEqual(normalizeInterests('geology'), INTEREST_IDS);
  });
});

describe('normalizeLength', () => {
  it('accepts short, medium, and long', () => {
    assert.equal(normalizeLength('short'), 'short');
    assert.equal(normalizeLength('LONG'), 'long');
    assert.equal(normalizeLength('medium'), 'medium');
  });

  it('defaults unknown values to medium', () => {
    assert.equal(normalizeLength(''), 'medium');
    assert.equal(normalizeLength('epic'), 'medium');
    assert.equal(normalizeLength(null), 'medium');
  });

  it('gives long stories a longer Gemini timeout', () => {
    assert.equal(loreTimeoutMs('short'), 30000);
    assert.equal(loreTimeoutMs('medium'), 30000);
    assert.equal(loreTimeoutMs('long'), 45000);
    assert.equal(loreTimeoutMs('nope'), 30000);
  });
});

describe('buildLorePrompt', () => {
  it('asks for geology surveys when geology is the only interest', () => {
    const prompt = buildLorePrompt({
      lat: -39.296,
      lng: 174.064,
      interests: ['geology'],
      length: 'short'
    });
    assert.match(prompt, /latitude -39\.29600/);
    assert.match(prompt, /GNS Science/);
    assert.match(prompt, /USGS/);
    assert.match(prompt, /About 2 sentences/);
    assert.match(prompt, /Focus on that topic/);
    assert.doesNotMatch(prompt, /shipwrecks, harbours/);
  });

  it('lists several interests and keeps medium length by default', () => {
    const prompt = buildLorePrompt({
      lat: -36.84846,
      lng: 174.76333,
      interests: ['history', 'nature'],
      avoid: ['One Tree Hill']
    });
    assert.match(prompt, /interested in: history, nature/);
    assert.match(prompt, /About 3–4 sentences/);
    assert.match(prompt, /One Tree Hill/);
    assert.match(prompt, /do not mash several topics/i);
  });

  it('uses the chosen length when expanding a story', () => {
    const prompt = buildLorePrompt({
      lat: -41.2865,
      lng: 174.7762,
      interests: ['maritime'],
      length: 'long',
      expand: { title: 'Harbour lights', text: 'A beacon stood on the point.' }
    });
    assert.match(prompt, /Harbour lights/);
    assert.match(prompt, /5–8 extra sentences/);
    assert.match(prompt, /maritime/);
    assert.match(prompt, /Do not retell the original/);
    assert.doesNotMatch(prompt, /About 6–8 sentences/);
  });

  it('includes geology when an older client omits interests', () => {
    const prompt = buildLorePrompt({ lat: -41.3, lng: 174.8 });
    assert.match(prompt, /geology and landforms/);
    assert.match(prompt, new RegExp('interested in: ' + INTEREST_IDS.join(', ')));
    assert.match(prompt, /About 3–4 sentences/);
  });

  it('asks for council plans, local news, town stats, and trivia', () => {
    const prompt = buildLorePrompt({
      lat: -37.787,
      lng: 175.279,
      interests: ['civic', 'news', 'stats', 'trivia'],
      length: 'short'
    });
    assert.match(prompt, /interested in: civic, news, stats, trivia/);
    assert.match(prompt, /council/);
    assert.match(prompt, /local news/);
    assert.match(prompt, /population/);
    assert.match(prompt, /quirky true details/);
    assert.match(prompt, /Skip graphic crime/);
    assert.doesNotMatch(prompt, /geology and landforms/);
  });
});

describe('client settings stay in sync', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  it('uses the same interest ids as the lore prompt module', () => {
    const block = html.match(/const STORY_INTERESTS = \[([\s\S]*?)\];/);
    assert.ok(block, 'STORY_INTERESTS missing from index.html');
    const ids = [...block[1].matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
    assert.deepEqual(ids, INTEREST_IDS);
  });

  it('sends short, medium, and long to /api/lore', () => {
    assert.match(html, /data-length="short"/);
    assert.match(html, /data-length="medium"/);
    assert.match(html, /data-length="long"/);
    assert.match(html, /interests: selectedInterests\(\)/);
    assert.match(html, /length: \(state\.settings && state\.settings\.storyLength\) \|\| 'medium'/);
    assert.deepEqual(Object.keys(LENGTHS), ['short', 'medium', 'long']);
  });
});
