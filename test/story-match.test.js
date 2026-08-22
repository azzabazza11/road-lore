const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  normalizeTitle,
  titlesSimilar,
  titleInList,
  nextChapterTitle,
  continueRemark,
  chapterNumber
} = require('../story-match');

describe('normalizeTitle', () => {
  it('drops articles, punctuation, and case', () => {
    assert.equal(normalizeTitle('The Harbour Bridge!'), 'harbour bridge');
    assert.equal(normalizeTitle('Gold-Rush'), 'gold rush');
  });
});

describe('titlesSimilar', () => {
  it('treats obvious retreads as the same story', () => {
    assert.equal(titlesSimilar('Harbour Bridge', 'The Harbour Bridge'), true);
    assert.equal(titlesSimilar('Gold rush', 'The Gold Rush'), true);
    assert.equal(titlesSimilar('One Tree Hill', 'One Tree Hill volcano'), true);
    assert.equal(titlesSimilar('Thames', 'Thames'), true);
    assert.equal(titlesSimilar('The Battle of Makarau Tunnel', 'The Battle of Makarau Tunnel — Part II'), true);
    assert.equal(titlesSimilar('The Lost Town of Cornwallis Part II', 'The Lost Town of Cornwallis'), true);
  });

  it('does not collapse unrelated places', () => {
    assert.equal(titlesSimilar('One Tree Hill', 'Sky Tower'), false);
    assert.equal(titlesSimilar('Gold rush', 'Harbour lights'), false);
    assert.equal(titlesSimilar('', 'Harbour'), false);
    assert.equal(titlesSimilar('Park', 'Hyde Park'), false);
  });
});

describe('titleInList', () => {
  it('fuzzy-matches against an avoid list', () => {
    const avoid = ['Harbour Bridge', 'Gold rush'];
    assert.equal(titleInList('The Harbour Bridge', avoid), true);
    assert.equal(titleInList('Sky Tower', avoid), false);
  });
});

describe('nextChapterTitle', () => {
  it('adds Part II then Part III for the same base tale', () => {
    assert.equal(
      nextChapterTitle('The Battle of Makarau Tunnel', ['The Battle of Makarau Tunnel']),
      'The Battle of Makarau Tunnel — Part II'
    );
    assert.equal(
      nextChapterTitle('The Battle of Makarau Tunnel', [
        'The Battle of Makarau Tunnel',
        'The Battle of Makarau Tunnel — Part II'
      ]),
      'The Battle of Makarau Tunnel — Part III'
    );
    assert.equal(chapterNumber('Cornwallis — Part II'), 2);
    assert.match(continueRemark('The Lost Town of Cornwallis — Part II'), /story of the Lost Town of Cornwallis/);
    assert.match(continueRemark('Makarau Tunnel'), /story of Makarau Tunnel/);
  });
});

describe('client copies the same helpers', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  it('keeps normalizeTitle / titlesSimilar / titleInList in index.html', () => {
    assert.match(html, /function normalizeTitle\(/);
    assert.match(html, /function titlesSimilar\(/);
    assert.match(html, /function titleInList\(/);
    assert.match(html, /function nextChapterTitle\(/);
    assert.match(html, /function continueRemark\(/);
    assert.match(html, /more to the story of/);
    assert.match(html, /heardTitles/);
    assert.match(html, /AVOID_LIMIT/);
  });
});
