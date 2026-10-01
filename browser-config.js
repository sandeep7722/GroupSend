const fs = require('node:fs');
const path = require('node:path');
function browserOptions(env = process.env, exists = fs.existsSync) {
  const candidates = [env.CHROME_PATH,
    ...(env.GROUPSEND_CLOUD === '1' ? ['/usr/bin/chromium', '/usr/bin/google-chrome'] : []),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const executablePath = candidates.find(candidate => candidate && exists(candidate));
  if (!executablePath) throw new Error('Installed Chrome/Edge nahi mila. CHROME_PATH check karein.');
  return {
    // Retain the installed browser's native current identity.
    userAgent: false,
    browserName: /msedge\.exe$/i.test(executablePath) ? 'Edge' : 'Chrome',
    puppeteer: { executablePath, headless: false, defaultViewport: null,
      // Render containers cannot be configured with our VPS SYS_ADMIN capability.
      // Explicit Render-only opt-in; local browsers keep their default sandbox.
      ...(env.GROUPSEND_BROWSER_MODE === 'render' ? { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] } : {}) },
    webVersionCache: { type: 'none' }, deviceName: 'GroupSend'
  };
}
module.exports = { browserOptions };
