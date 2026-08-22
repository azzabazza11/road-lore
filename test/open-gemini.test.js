const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

describe('Gemini is open — no week trial', () => {
  it('never expires a session on the server', () => {
    assert.match(server, /active: true/);
    assert.match(server, /trialEnds: 0/);
    assert.doesNotMatch(server, /trial_ended/);
    assert.doesNotMatch(server, /TRIAL_MS/);
    assert.doesNotMatch(server, /complimentary week/);
  });

  it('does not lock Gemini on the phone after a week', () => {
    assert.match(html, /function trialIsActive\(\) \{\s*return true;/);
    assert.match(html, /function applyTrialGates\(\) \{\s*return false;/);
    assert.doesNotMatch(html, /complimentary/);
    assert.doesNotMatch(html, /The first week includes/);
  });
});
