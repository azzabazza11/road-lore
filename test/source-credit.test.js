const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  SOURCE_CREDIT_MAX,
  isLowValueSource,
  spokenSiteName,
  worthySourceName,
  sourceCreditLine,
  shouldSpeakSourceCredit,
  pickCreditEvery
} = require('../source-credit');

describe('spokenSiteName', () => {
  it('names Wikipedia and skips Google search', () => {
    assert.equal(spokenSiteName('https://en.wikipedia.org/wiki/Taranaki', ''), 'Wikipedia');
    assert.equal(spokenSiteName('https://www.google.com/search?q=taranaki', ''), '');
    assert.equal(isLowValueSource('https://www.google.com/search?q=x'), true);
  });

  it('uses a friendly label for known hosts', () => {
    assert.equal(spokenSiteName('https://www.stuff.co.nz/national/123', ''), 'Stuff');
    assert.equal(spokenSiteName('https://gns.cri.nz/Home', ''), 'GNS Science');
  });
});

describe('worthySourceName', () => {
  it('credits Wikipedia page ids and first AI source', () => {
    assert.equal(worthySourceName({ pageid: 123, url: 'https://en.wikipedia.org/wiki/X' }), 'Wikipedia');
    assert.equal(
      worthySourceName({
        ai: true,
        sources: [{ title: 'Harbour', uri: 'https://www.nzherald.co.nz/story' }]
      }),
      'the New Zealand Herald'
    );
    assert.equal(
      worthySourceName({
        ai: true,
        url: 'https://www.google.com/search?q=lore',
        sources: []
      }),
      ''
    );
    assert.equal(worthySourceName({ continuation: true, url: 'https://en.wikipedia.org/wiki/X' }), '');
  });
});

describe('shouldSpeakSourceCredit', () => {
  it('speaks about one in five to ten until three credits', () => {
    assert.equal(shouldSpeakSourceCredit(0, 7, 0), true);
    assert.equal(shouldSpeakSourceCredit(0, 7, 3), false);
    assert.equal(shouldSpeakSourceCredit(3, 5, 0), false);
    assert.equal(SOURCE_CREDIT_MAX, 3);
    assert.equal(pickCreditEvery(() => 0), 5);
    assert.equal(pickCreditEvery(() => 0.99), 10);
  });

  it('builds the spoken line', () => {
    assert.match(sourceCreditLine('Wikipedia'), /sliced from Wikipedia/);
    assert.match(sourceCreditLine('Wikipedia'), /Sources on the card/);
    assert.equal(sourceCreditLine(''), '');
  });
});

describe('client wires the credit', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  it('keeps a Sources link on the narrator card', () => {
    assert.match(html, /id="heroSources"/);
    assert.match(html, /function maybeSourceCredit\(/);
    assert.match(html, /function renderHeroSources\(/);
    assert.match(html, /sourceCreditHeard/);
    assert.match(html, /SOURCE_CREDIT_MAX = 3/);
    assert.match(html, /SOURCE_CREDIT_EVERY_MIN = 5/);
    assert.match(html, /SOURCE_CREDIT_EVERY_MAX = 10/);
    assert.match(html, /Tap Sources on the card/);
    assert.match(html, /main-src/);
    assert.match(html, /story\.continuation \? '' : maybeSourceCredit\(story\)/);
  });
});
