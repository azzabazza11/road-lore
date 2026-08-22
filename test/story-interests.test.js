const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  INTEREST_IDS,
  matchingInterestIds,
  interestBoost,
  interestsNarrowed,
  clipFitsInterests
} = require('../story-interests');
const { INTEREST_IDS: LORE_IDS } = require('../lore');

describe('matchingInterestIds', () => {
  it('picks geology from a volcano extract', () => {
    assert.deepEqual(
      matchingInterestIds('Mount Ngauruhoe', 'An andesite volcanic cone on the Tongariro fault.', ['geology']),
      ['geology']
    );
  });

  it('does not call a shipwreck a geology story', () => {
    assert.deepEqual(
      matchingInterestIds('Orpheus wreck', 'The steamship wrecked on the Manukau bar.', ['geology']),
      []
    );
    assert.deepEqual(
      matchingInterestIds('Orpheus wreck', 'The steamship wrecked on the Manukau bar.', ['maritime']),
      ['maritime']
    );
  });
});

describe('clipFitsInterests', () => {
  it('allows any clip when every topic is on', () => {
    assert.equal(clipFitsInterests('Town hall', 'A quiet village.', INTEREST_IDS), true);
  });

  it('drops off-topic clips when interests are narrowed', () => {
    assert.equal(
      clipFitsInterests('Town hall', 'The council adopted a district plan.', ['civic']),
      true
    );
    assert.equal(
      clipFitsInterests('Town hall', 'The council adopted a district plan.', ['geology']),
      false
    );
  });
});

describe('interestBoost', () => {
  it('scores extract matches higher than title-only', () => {
    const title = interestBoost('Volcano', '', ['geology']);
    const both = interestBoost('Volcano', 'A basaltic crater.', ['geology']);
    assert.equal(title, 70);
    assert.equal(both, 100);
    assert.equal(interestsNarrowed(['geology']), true);
    assert.equal(interestsNarrowed(INTEREST_IDS), false);
  });
});

describe('client stays in sync', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  it('uses the same interest ids as the lore prompt and wiki matcher', () => {
    assert.deepEqual(INTEREST_IDS, LORE_IDS);
    assert.match(html, /function matchingInterestIds\(/);
    assert.match(html, /function clipFitsInterests\(/);
    assert.match(html, /interestLabel/);
    assert.match(html, /wikiExtracts\(pool\.map/);
  });
});
