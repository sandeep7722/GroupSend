const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectGroupSummaries } = require('../group-list');
test('group listing needs no metadata refresh or last-message serialization', () => {
  const broken = { get id() { throw new Error('stale chat'); } };
  const chats = [
    { id: { _serialized: 'person@c.us' }, name: 'Private chat' },
    { id: { _serialized: 'a@g.us' }, name: 'Team', serialize() { throw new Error('unsupported'); }, groupMetadata: { announce: true, participants: { length: 5 } } },
    broken,
    { id: { _serialized: 'b@g.us' }, formattedTitle: 'Family' },
    { id: { _serialized: 'channel@newsletter' }, name: 'Channel' },
  ];
  global.window = { require: name => { assert.equal(name, 'WAWebCollections'); return { Chat: { getModelsArray: () => chats } }; } };
  try {
    assert.deepEqual(collectGroupSummaries(), [{ id: 'a@g.us', name: 'Team', members: 5 }, { id: 'b@g.us', name: 'Family', members: 0 }]);
  } finally { delete global.window; }
});
