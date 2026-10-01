// Runs inside the app's WhatsApp client. Avoid getChats' eager metadata/message serialization.
function collectGroupSummaries() {
  const chats = window.require('WAWebCollections').Chat.getModelsArray();
  const result = [];
  for (const chat of chats) {
    try {
      const id = chat.id?._serialized;
      if (typeof id !== 'string' || !id.endsWith('@g.us')) continue;
      const metadata = chat.groupMetadata;
      result.push({ id, name: chat.name || chat.formattedTitle || metadata?.subject || 'Unnamed group', members: metadata?.participants?.length || 0 });
    } catch {
      // A stale chat must not prevent the remaining groups from loading.
    }
  }
  return result;
}
module.exports = { collectGroupSummaries };
