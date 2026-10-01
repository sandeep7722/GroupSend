const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendTextWithReceipt } = require('../send-text');
test('confirmed send survives broken rich-message serialization and sends once', async () => {
  let count = 0;
  global.window = { WWebJS: {
    getChat: async (_, options) => { assert.equal(options.getAsModel, false); return {}; },
    sendMessage: async () => { count++; return { id: { _serialized: 'receipt-1' } }; },
    getMessageModel: () => { throw new Error('Unsupported contact serializer'); },
  } };
  try { assert.deepEqual(await sendTextWithReceipt('g@g.us', 'test'), { ok: true, id: 'receipt-1' }); assert.equal(count, 1); }
  finally { delete global.window; }
});
test('missing receipt remains uncertain and is never retried', async () => {
  let count = 0;
  global.window = { WWebJS: { getChat: async () => ({}), sendMessage: async () => { count++; return undefined; } } };
  try { assert.deepEqual(await sendTextWithReceipt('g@g.us', 'test'), { ok: false, phase: 'send', reason: 'missing_receipt' }); assert.equal(count, 1); }
  finally { delete global.window; }
});
test('pre-send failure differs from an error during send', async () => {
  global.window = { WWebJS: { getChat: async () => null, sendMessage: async () => { throw new Error('unknown'); } } };
  try {
    assert.equal((await sendTextWithReceipt('g@g.us', 'test')).phase, 'prepare');
    window.WWebJS.getChat = async () => ({});
    assert.equal((await sendTextWithReceipt('g@g.us', 'test')).phase, 'send');
  } finally { delete global.window; }
});
