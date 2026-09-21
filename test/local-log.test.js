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
});
