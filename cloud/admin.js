const readline = require('node:readline/promises');
const path = require('node:path');
const { Accounts, hashPassword } = require('./auth');
async function main() {
  const [command, email] = process.argv.slice(2);
  const accounts = new Accounts(process.env.CLOUD_DATA_DIR || path.join(__dirname, '.data'));
  if (!email || !['init', 'reset-password'].includes(command)) throw new Error('Usage: node cloud/admin.js init|reset-password email (password via stdin)');
  if (command === 'init' && accounts.data.users.length) throw new Error('Owner already exists');
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  const line = await input[Symbol.asyncIterator]().next(); input.close();
  if (command === 'init') await accounts.create(email, line.value, 'admin');
  else {
    const user = accounts.data.users.find(user => user.email === email.trim().toLowerCase());
    if (!user) throw new Error('Account not found');
    user.passwordHash = await hashPassword(line.value); accounts.save();
  }
  console.log('Account saved. Restart the gateway if it is already running.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
