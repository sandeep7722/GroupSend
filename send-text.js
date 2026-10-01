// Executed by the application's WhatsApp client. Return only the send receipt,
// avoiding getMessageModel's unrelated message/contact serialization.
async function sendTextWithReceipt(chatId, text) {
  let phase = 'prepare';
  try {
    const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
    if (!chat) return { ok: false, phase, reason: 'group_unavailable' };
    phase = 'send';
    const message = await window.WWebJS.sendMessage(chat, text, {
      linkPreview: undefined, parseVCards: false, mentionedJidList: [],
      ignoreQuoteErrors: true, waitUntilMsgSent: false,
    });
    const id = message?.id?._serialized;
    return typeof id === 'string' && id.length > 0
      ? { ok: true, id }
      : { ok: false, phase, reason: 'missing_receipt' };
  } catch {
    return { ok: false, phase, reason: phase === 'prepare' ? 'group_unavailable' : 'unconfirmed_send' };
  }
}
module.exports = { sendTextWithReceipt };
