const { test } = require('node:test');
const assert = require('node:assert/strict');
const { closeAndLogout, bounded, isBrowserClosedError } = require('../connection');
test('disconnect revokes login and closes browser', async () => {
  const calls = [];
  const result = await closeAndLogout({ logout: async () => calls.push('logout'), destroy: async () => calls.push('close'), authStrategy: { logout: async () => calls.push('clear') } });
  assert.deepEqual(calls, ['logout', 'close']);
  assert.deepEqual(result, { remote: true, local: true });
});
test('dead browser does not prevent local session clearing or falsely confirm remote logout', async () => {
  const calls = [];
  const result = await closeAndLogout({ logout: async () => { throw new Error('detached Frame'); }, destroy: async () => calls.push('close'), authStrategy: { logout: async () => calls.push('clear') } });
  assert.deepEqual(calls, ['close', 'clear']);
  assert.deepEqual(result, { remote: false, local: true });
});
test('hanging logout is bounded and still closes client', async () => {
  let closed = false;
  const result = await closeAndLogout({ logout: () => new Promise(() => {}), destroy: async () => { closed = true; }, authStrategy: { logout: async () => {} } }, 10);
  assert.ok(closed);
  assert.equal(result.local, true);
  await assert.rejects(bounded(() => new Promise(() => {}), 10), /timed out/);
});
test('browser closure classification is narrow', () => {
  assert.ok(isBrowserClosedError(new Error('Protocol error: Target closed')));
  assert.ok(isBrowserClosedError(new Error('Attempted to use detached Frame')));
  assert.equal(isBrowserClosedError(new Error('Disk full')), false);
});
