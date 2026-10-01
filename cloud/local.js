const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Accounts } = require('./auth');
async function main() {
  const dataDir = path.resolve(__dirname, '../.local-cloud');
  const accounts = new Accounts(dataDir);
  if (!accounts.data.users.length) {
    const password = 'Gs-' + crypto.randomBytes(12).toString('base64url');
    const email = 'demo@groupsend.test';
    await accounts.create(email, password, 'admin');
    fs.writeFileSync(path.join(dataDir, 'demo-login.txt'),
      `GroupSend LOCAL TEST LOGIN\r\n\r\nApp: http://localhost:4321/login\r\nEmail: ${email}\r\nPassword: ${password}\r\n\r\nThis account is only for this computer. Keep this file private.\r\nOnline Render account is created separately.\r\n`, { mode: 0o600 });
  }
  if (process.argv.includes('--setup')) { console.log('Local account ready.'); return; }
  // The local launcher always binds to this computer, with native Chrome settings.
  delete process.env.GROUPSEND_BROWSER_MODE;
  delete process.env.OWNER_EMAIL; delete process.env.OWNER_PASSWORD;
  Object.assign(process.env, { PUBLIC_ORIGIN: 'http://localhost:4321', PORT: '4321', BIND_HOST: '127.0.0.1', CLOUD_DATA_DIR: dataDir, TRUST_PROXY: '0', MAX_WORKSPACES: '3' });
  await require('./runtime').start();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
