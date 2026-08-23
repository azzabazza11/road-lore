const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const suggestionsSrc = fs.readFileSync(path.join(__dirname, '../suggestions.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
const agents = fs.readFileSync(path.join(__dirname, '../AGENTS.md'), 'utf8');

describe('suggestion + Maps wiring', () => {
  it('exposes one-shot home chips, not Settings interest filters', () => {
    assert.match(html, /id="suggestChips"/);
    assert.match(html, /id="suggestResults"/);
    assert.match(html, /function renderSuggestResults/);
    assert.match(html, /maps-icon/);
    assert.match(html, /web-icon/);
    assert.match(html, /phone-icon/);
    assert.match(html, /function suggestActionLink/);
    assert.match(html, /href\.indexOf\('tel:'\)/);
    assert.match(suggestionsSrc, /id: 'camping'/);
    assert.match(suggestionsSrc, /label: 'Camping'/);
    assert.match(suggestionsSrc, /id: 'accommodation'/);
    assert.match(suggestionsSrc, /label: 'Accommodation'/);
    assert.match(html, /SUGGEST_KINDS\.map/);
    assert.match(html, /suggest-thumb/);
    assert.match(html, /hydrateSuggestThumbs/);
    assert.match(html, /upload\.wikimedia\.org/);
    assert.match(html, /www\.wikidata\.org/);
    assert.match(html, /commons\.wikimedia\.org/);
    assert.match(html, /maps\/search\/\?api=1/);
    assert.match(html, /id="heroMaps"/);
    assert.match(html, /id="heroDiningTypes"/);
    assert.match(html, /suggestions\.js/);
    assert.match(html, /function presentSuggestion/);
    assert.match(html, /suggestionHoldUntil/);
    assert.match(html, /\/api\/suggest/);
    assert.doesNotMatch(html, /data-interest="dining"/);
    assert.match(html, /<div class="chips" id="interestChips"/);
    assert.ok(html.indexOf('id="suggestChips"') < html.indexOf('id="settings"'));
  });

  it('does not persist suggestion kinds as Settings toggles', () => {
    assert.doesNotMatch(html, /settings\.suggest/);
    assert.doesNotMatch(html, /state\.settings\.dining/);
  });

  it('proxies Overpass on Cloud Run behind a trial session', () => {
    assert.match(server, /routePath === '\/api\/suggest'/);
    assert.match(server, /handleSuggest/);
    assert.match(server, /requireTrial\(req, res\)/);
    assert.match(server, /suggestions\.runSuggest/);
    assert.doesNotMatch(server, /MAP_TOKEN.*suggest/);
  });

  it('caches the shared suggestions helper in the service worker', () => {
    assert.match(sw, /suggestions\.js/);
  });

  it('keeps the Suggestions spec in agent notes', () => {
    assert.match(agents, /Suggestions/);
    assert.match(agents, /single-use/i);
    assert.match(agents, /Overpass/);
  });

  it('falls back to Overpass on the phone when Cloud Run has no /api/suggest', () => {
    assert.match(html, /function fetchSuggestPayload/);
    assert.match(html, /SUGGEST\.runSuggest/);
    assert.match(html, /overpass-api\.de/);
    assert.match(html, /overpass\.kumi\.systems/);
    assert.match(html, /connection problem, not an empty area/);
  });
});
