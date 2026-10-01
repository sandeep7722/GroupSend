const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Workspaces } = require('../workers');
test('each account gets its own process and private storage; path traversal rejected', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groupsend-workers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configs = [];
  const manager = new Workspaces({ dataDir: dir, max: 2, spawn: (_, args, options) => {
    configs.push(options); const child = new EventEmitter(); child.stderr = new EventEmitter(); child.send = () => {}; child.kill = () => {}; child.connected = true;
    queueMicrotask(() => child.emit('message', { type: 'ready', port: 4000 + configs.length })); return child;
  } });
  const first = '11111111-1111-1111-1111-111111111111';
  const second = '22222222-2222-2222-2222-222222222222';
  await manager.get(first); await manager.get(second); await manager.get(first);
  assert.equal(configs.length, 2);
  assert.notEqual(configs[0].env.GROUPSEND_DATA_DIR, configs[1].env.GROUPSEND_DATA_DIR);
  assert.equal(configs[0].env.PORT, '0');
  await assert.rejects(manager.get('../../secrets'), /Invalid/);
  await assert.rejects(manager.get('33333333-3333-3333-3333-333333333333'), /capacity/);
});
