const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  SPEECH_CHARS,
  normalizeStoryLength,
  speechCharsFor,
  wikiUsesFullExtract,
  sharedClipPlan
} = require('../story-length');

describe('normalizeStoryLength', () => {
  it('accepts short, medium, and long', () => {
    assert.equal(normalizeStoryLength('short'), 'short');
    assert.equal(normalizeStoryLength('LONG'), 'long');
    assert.equal(normalizeStoryLength(''), 'medium');
    assert.equal(normalizeStoryLength('epic'), 'medium');
  });
});

describe('wikiUsesFullExtract', () => {
  it('only Long leaves the Wikipedia intro', () => {
    assert.equal(wikiUsesFullExtract('short'), false);
    assert.equal(wikiUsesFullExtract('medium'), false);
    assert.equal(wikiUsesFullExtract('long'), true);
  });
});

describe('sharedClipPlan', () => {
  it('reuses a clip that already matches the setting', () => {
    assert.equal(sharedClipPlan(500, 'medium'), 'play');
    assert.equal(sharedClipPlan(300, 'short'), 'play');
  });

  it('clips a long shared recording when the setting is Short', () => {
    assert.equal(sharedClipPlan(1200, 'short'), 'clip');
  });

  it('skips a short shared clip when the setting is Long', () => {
    assert.equal(sharedClipPlan(400, 'long'), 'skip');
    assert.equal(sharedClipPlan(1400, 'long'), 'play');
  });
});

describe('client stays in sync', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  it('uses the same speech budgets as STORY_LENGTHS', () => {
    for (const [id, chars] of Object.entries(SPEECH_CHARS)) {
      assert.match(html, new RegExp(id + ': \\{[^}]*speechChars: ' + chars));
    }
    assert.equal(speechCharsFor('long'), 1400);
  });

  it('fetches a full Wikipedia extract when length is Long', () => {
    assert.match(html, /wikiUsesFullExtract\(/);
    assert.match(html, /sharedClipPlan\(/);
    assert.match(html, /function storyLengthId\(/);
  });
});
