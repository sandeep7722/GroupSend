const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browserOptions } = require('../browser-config');
test('only explicit Render mode disables sandbox; local and VPS modes preserve it', () => {
  const browser = '/usr/bin/chromium';
  const cloud = { GROUPSEND_CLOUD: '1', CHROME_PATH: browser };
  assert.equal(browserOptions(cloud, () => true).puppeteer.args, undefined);
  assert.equal(browserOptions({}, () => true).puppeteer.args, undefined);
  assert.deepEqual(browserOptions({ ...cloud, GROUPSEND_BROWSER_MODE: 'render' }, () => true).puppeteer.args,
    ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']);
});
test('finds x86 Chrome before Edge and retains native browser identity', () => {
  const chrome = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
  const options = browserOptions({}, candidate => candidate === chrome || candidate.includes('Edge'));
  assert.equal(options.puppeteer.executablePath, chrome);
  assert.equal(options.browserName, 'Chrome');
  assert.equal(options.userAgent, false);
  assert.equal(options.puppeteer.headless, false);
});
test('supports user-local Chrome and explicit browser paths', () => {
  assert.match(browserOptions({ LOCALAPPDATA: 'C:/Users/Test/AppData/Local' }, candidate => candidate.includes('AppData')).puppeteer.executablePath, /AppData/);
  assert.equal(browserOptions({ CHROME_PATH: 'D:/Browser/chrome.exe' }, () => true).puppeteer.executablePath, 'D:/Browser/chrome.exe');
});
test('falls back to installed Edge and fails clearly without a browser', () => {
  assert.equal(browserOptions({}, candidate => candidate.endsWith('msedge.exe')).browserName, 'Edge');
  assert.throws(() => browserOptions({}, () => false), /Chrome\/Edge/);
});
