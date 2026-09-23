const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');

describe('local story cards', () => {
  it('keeps the last ten cards and spoken clips on the phone', () => {
    assert.match(html, /const LOG_KEEP = 10;/);
    assert.match(html, /if \(next\.log\.length > LOG_KEEP\) next\.log\.length = LOG_KEEP;/);
    assert.match(html, /if \(state\.log\.length > LOG_KEEP\) state\.log\.length = LOG_KEEP;/);
    assert.match(html, /state\.log\.slice\(0, LOG_KEEP\)/);
    assert.match(html, /if \(rest\.length <= LOG_KEEP\) return;/);
    assert.match(html, /const drop = rest\.slice\(LOG_KEEP\);/);
    assert.match(readme, /last ten stories/);
    assert.match(readme, /last ten clips/);
  });

  it('plays a saved nearby card when start-trip lookup fails or finds nothing new', () => {
    assert.match(html, /function localSavedStory/);
    assert.match(html, /function deliverLookup/);
    assert.match(html, /localSaved: true/);
    assert.match(html, /GPS live · saved story/);
    assert.match(html, /recordLog: !saved/);
    assert.match(html, /allowEmptySaved/);
    assert.match(html, /Lookup failed · check network/);
  });

  it('replays a stored card from saved audio before generating a new voice', () => {
    const speakAt = html.indexOf('async function speakGemini');
    const generateAt = html.indexOf("setVoiceStatus('Generating AI voice…')", speakAt);
    const localAt = html.indexOf('readLocalClip(key, meta.pageid)', speakAt);
    const siteAt = html.indexOf('siteStoredClip(meta, voice)', speakAt);
    assert.ok(localAt > speakAt && localAt < generateAt);
    assert.ok(siteAt > localAt && siteAt < generateAt);
    assert.match(html, /Saved voice/);
    assert.match(html, /Stored clip/);
    assert.match(html, /preferStored: true/);
    assert.match(html, /radius: '12000'/);
    assert.match(html, /voice: story\.voice \|\| ''/);
    assert.match(html, /function nearbyClipForTitle/);
    assert.match(html, /storedVoice: story\.voice \|\| ''/);
    assert.match(html, /readLocalClip\(key, meta\.pageid\)/);
  });
});
