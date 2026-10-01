const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SendQueue } = require('../queue');
const groups = [{ id: 'one@g.us', name: 'One' }, { id: 'two@g.us', name: 'Two' }];
const payload = { requestId: '12345678-1234-1234-1234', groupIds: groups.map(g => g.id), message: 'Hello' };
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groupsend-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new SendQueue({ file: path.join(dir, 'job.json'), ready: () => true, send: async () => {}, delay: 0, ...options });
}
async function finish(q) { while (q.busy) await new Promise(resolve => setTimeout(resolve, 5)); }
test('deduplicates group IDs and duplicate submit requests', async t => {
  const sent = [];
  const q = fixture(t, { send: async (id, message) => sent.push({ id, message }) });
  const first = q.start({ ...payload, groupIds: ['one@g.us', 'one@g.us'] }, groups);
  assert.equal(q.start(payload, groups).id, first.id);
  await finish(q);
  assert.deepEqual(sent, [{ id: 'one@g.us', message: 'Hello' }]);
  assert.equal(q.start(payload, groups).id, first.id);
  assert.equal(sent.length, 1);
});
test('rejects unlisted groups, individual chats, empty messages and disconnected sending', t => {
  const q = fixture(t);
  assert.throws(() => q.start({ ...payload, groupIds: ['other@g.us'] }, groups));
  assert.throws(() => q.start({ ...payload, groupIds: ['123@c.us'] }, groups));
  assert.throws(() => q.start({ ...payload, message: '  ' }, groups));
  assert.throws(() => q.start({ ...payload, message: 'x'.repeat(4097) }, groups));
  assert.throws(() => q.start({ ...payload, requestId: '' }, groups));
  q.ready = () => false;
  assert.throws(() => q.start(payload, groups));
});
test('cancel lets in-flight send finish and skips remaining groups', async t => {
  let release;
  const q = fixture(t, { send: () => new Promise(resolve => { release = resolve; }) });
  q.start(payload, groups);
  assert.throws(() => q.start({ ...payload, requestId: 'otherrequest-12345678' }, groups));
  q.cancel(); release(); await finish(q);
  assert.deepEqual(q.job.results.map(r => r.status), ['submitted', 'cancelled']);
  assert.equal(q.job.status, 'stopped');
});
test('uncertain sends are not retried, while pre-send errors are failed', async t => {
  let calls = 0;
  const q = fixture(t, { send: async id => { calls++; const error = new Error('simulated'); error.beforeSend = id === 'two@g.us'; throw error; } });
  q.start(payload, groups); await finish(q);
  assert.equal(calls, 2);
  assert.deepEqual(q.job.results.map(r => r.status), ['unknown', 'failed']);
});
test('disconnect skips pending groups', async t => {
  let connected = true;
  const q = fixture(t, { ready: () => connected, send: async () => { connected = false; } });
  q.start(payload, groups); await finish(q);
  assert.deepEqual(q.job.results.map(r => r.status), ['submitted', 'cancelled']);
});
test('restart marks in-flight result unknown without resending', t => {
  const q = fixture(t);
  fs.writeFileSync(q.file, JSON.stringify({ ...payload, status: 'running', results: [{ id: 'one@g.us', status: 'sending' }, { id: 'two@g.us', status: 'pending' }] }));
  const restored = new SendQueue({ file: q.file, ready: () => true, send: () => assert.fail('Must not send on startup') });
  assert.equal(restored.job.status, 'interrupted');
  assert.deepEqual(restored.job.results.map(r => r.status), ['unknown', 'cancelled']);
});
