const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function sourceRevision(root = path.resolve(__dirname, '..')) {
  const files = ['package.json', 'package-lock.json', 'server.js', 'queue.js', 'browser-config.js', 'group-list.js', 'connection.js', 'send-text.js'];
  for (const directory of ['public', 'cloud', 'cloud/public']) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.isFile() && (directory !== 'cloud' || entry.name.endsWith('.js'))) files.push(directory + '/' + entry.name);
    }
  }
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    // Ignore Windows line-ending conversion when comparing the same source checkout.
    hash.update(file + '\0' + fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n') + '\0');
  }
  return hash.digest('hex').slice(0, 16);
}
module.exports = { sourceRevision };
