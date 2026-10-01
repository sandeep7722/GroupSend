const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SendQueue } = require('./queue');
const { browserOptions } = require('./browser-config');
const { collectGroupSummaries } = require('./group-list');
const { isBrowserClosedError, bounded, closeAndLogout } = require('./connection');
const { sendTextWithReceipt } = require('./send-text');
const ROOT = __dirname;
const DATA = process.env.GROUPSEND_DATA_DIR || path.join(ROOT, '.data');
fs.mkdirSync(DATA, { recursive: true });
const PORT = Number(process.env.PORT || 0);
const token = crypto.randomBytes(32).toString('hex');
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
let state = { status: 'disconnected', qr: null, error: '', account: '' };
let client = null;
let groups = [];
let connecting = false;
let refreshing = null;
let pairingBusy = false;
let disconnecting = false;
let connectionEpoch = 0;
function disconnectedClient(current) {
  if (client !== current) return;
  groups = [];
  state = { status: 'disconnected', qr: null, account: '', error: 'WhatsApp browser se connection toot gaya. Connect WhatsApp dabakar naya connection kholein.' };
}
function checkClientConnection() {
  if (!client?.pupPage || !client?.pupBrowser) return;
  if (client.pupPage.isClosed() || !client.pupBrowser.isConnected() || client.pupPage.mainFrame().detached) disconnectedClient(client);
}

async function refreshGroups() {
  if (state.status !== 'ready') throw new Error('Pehle WhatsApp connect karein.');
  if (refreshing) return refreshing;
  refreshing = (async () => {
    groups = (await client.pupPage.evaluate(collectGroupSummaries)).sort((a, b) => a.name.localeCompare(b.name));
    state.error = '';
    return groups;
  })();
  try { return await refreshing; } finally { refreshing = null; }
}

const queue = new SendQueue({ file: path.join(DATA, 'last-send.json'), ready: () => { checkClientConnection(); return state.status === 'ready'; }, send: async (id, message) => {
  const sender = client;
  let chat;
  try {
    if (!sender || state.status !== 'ready') throw new Error('WhatsApp disconnected');
    chat = (await sender.pupPage.evaluate(collectGroupSummaries)).find(group => group.id === id);
    if (!chat) throw new Error('Group no longer available');
  } catch (error) {
    if (isBrowserClosedError(error)) { disconnectedClient(sender); error.userMessage = 'WhatsApp connection toot gaya; yeh message send nahi hua.'; }
    error.beforeSend = true; throw error;
  }
  // Never automatically retry: a lost acknowledgement can still mean a message was sent.
  try {
    if (client !== sender || state.status !== 'ready') { const error = new Error('WhatsApp disconnected'); error.beforeSend = true; throw error; }
    const receipt = await bounded(() => sender.pupPage.evaluate(sendTextWithReceipt, id, message), 45000);
    if (!receipt?.ok) {
      const error = new Error(receipt?.reason || 'missing_receipt');
      error.beforeSend = receipt?.phase === 'prepare';
      throw error;
    }
    return { id: receipt.id };
  } catch (error) {
    console.error(new Date().toISOString(), 'Send operation failed:', error?.name || 'Error', isBrowserClosedError(error) ? 'Browser connection closed' : 'No confirmed send result');
    if (isBrowserClosedError(error) || /timed out/.test(error.message)) disconnectedClient(sender);
    throw error;
  }
} });

async function connect() {
  checkClientConnection();
  if (connecting || disconnecting || ['ready', 'connecting', 'qr', 'loading'].includes(state.status)) return;
  const epoch = ++connectionEpoch;
  connecting = true;
  state = { status: 'connecting', qr: null, error: '', account: '' };
  groups = [];
  try {
    const previous = client;
    client = null;
    if (previous) { try { await previous.destroy(); } catch {} }
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const QRCode = require('qrcode');
    const options = browserOptions();
    console.log(new Date().toISOString(), 'Starting connection v3 with', options.browserName);
    const current = new Client({ ...options, authStrategy: new LocalAuth({ clientId: 'groupsend-v3', dataPath: path.join(DATA, 'session') }) });
    client = current;
    current.on('code', code => {
      if (client === current && state.status === 'qr') state = { ...state, pairingCode: code, qr: null, error: '' };
    });
    current.on('loading_screen', percent => {
      if (client === current) state = { ...state, progress: percent };
    });
    current.on('qr', async qr => {
      const data = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
      if (client === current && !state.pairingCode && !['ready', 'loading', 'error'].includes(state.status)) state = { ...state, status: 'qr', qr: data, error: '' };
    });
    current.on('authenticated', () => { if (client === current) state = { ...state, status: 'loading', qr: null, pairingCode: null }; });
    current.on('ready', () => {
      if (client !== current) return;
      state = { status: 'ready', qr: null, error: '', account: current.info?.pushname || 'WhatsApp connected' };
      refreshGroups().catch(() => { state.error = 'Groups load nahi hue. Refresh groups par click karein.'; });
    });
    current.on('auth_failure', () => { if (client === current) state = { status: 'error', qr: null, error: 'Login fail hua. Phone ke Linked devices check karke dobara connect karein.', account: '' }; });
    current.on('disconnected', () => { if (client === current) { state = { status: 'disconnected', qr: null, error: 'WhatsApp disconnect ho gaya. Dobara connect karein.', account: '' }; groups = []; } });
    await current.initialize();
    if (client !== current || epoch !== connectionEpoch) { try { await current.destroy(); } catch {} return; }
    if (current.pupPage) current.pupPage.once('close', () => disconnectedClient(current));
    if (current.pupBrowser) current.pupBrowser.once('disconnected', () => disconnectedClient(current));
    checkClientConnection();
  } catch (error) {
    if (epoch !== connectionEpoch) return;
    console.error(new Date().toISOString(), 'Connection failed:', error instanceof Error ? error.stack : String(error));
    state = { status: 'error', qr: null, error: error.code === 'EPERM' ? 'Windows ne browser launch block kiya. App ko band karke File Explorer se Start GroupSend Accounts.cmd dobara kholein.' : 'WhatsApp nahi khula. Internet aur Chrome/Edge check karke dobara connect karein.', account: '' };
  } finally { if (epoch === connectionEpoch) connecting = false; }
}

function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 32000) throw new Error('Request too large'); }
  return text ? JSON.parse(text) : {};
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (!allowedHosts.has(req.headers.host) || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) return json(res, 403, { error: 'Local access only' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Origin rejected' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      checkClientConnection();
      return json(res, 200, { app: 'groupsend-local', version: 7, ...state, token, groups, job: queue.job });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (req.headers['x-app-token'] !== token) return json(res, 403, { error: 'Page refresh karke dobara try karein.' });
      const data = await body(req);
      if (url.pathname === '/api/connect') { void connect(); return json(res, 202, { ok: true }); }
      if (url.pathname === '/api/pair-code') {
        const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()+-]/g, '') : '';
        if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Country code ke saath phone number dein, jaise 91 ke baad apna 10-digit number.');
        if (state.status !== 'qr' || !client) throw new Error('Pehle Connect WhatsApp dabayein aur QR aane dein.');
        if (pairingBusy || state.pairingCode) throw new Error('Linking pehle se chal rahi hai. Dikhaya gaya code phone mein enter karein.');
        pairingBusy = true;
        try {
          await client.requestPairingCode(phone, false);
          return json(res, 200, { ok: true });
        } catch {
          throw new Error('WhatsApp se linking code nahi mila. Thodi der baad dobara try karein.');
        } finally { pairingBusy = false; }
      }
      if (url.pathname === '/api/pair-cancel') {
        if (state.status !== 'qr' || !client || pairingBusy) throw new Error('Linking complete hone dein.');
        pairingBusy = true;
        try { state.pairingCode = null; await client.cancelPairingCode(); return json(res, 200, { ok: true }); }
        finally { pairingBusy = false; }
      }
      if (url.pathname === '/api/groups') return json(res, 200, { groups: await refreshGroups() });
      if (url.pathname === '/api/send') return json(res, 202, { job: queue.start(data, groups) });
      if (url.pathname === '/api/cancel') { queue.cancel(); return json(res, 200, { ok: true }); }
      if (url.pathname === '/api/logout') {
        if (disconnecting) return json(res, 202, { ok: true });
        disconnecting = true;
        ++connectionEpoch;
        connecting = false;
        queue.cancel();
        const previous = client;
        client = null;
        groups = []; state = { status: 'disconnecting', qr: null, error: '', account: '' };
        try {
          const result = await closeAndLogout(previous);
          state = { status: 'disconnected', qr: null, account: '', error: !result.local ? 'Connection band hai, lekin saved login clear nahi hua. Phone ke Linked devices se GroupSend unlink karein.' : previous && !result.remote ? 'App disconnect ho gaya. WhatsApp logout confirm nahi hua; phone ke Linked devices se GroupSend unlink karein.' : '' };
        } finally { disconnecting = false; }
        return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});
server.listen(PORT, '127.0.0.1', () => {
  const actualPort = server.address().port;
  allowedHosts.add(`127.0.0.1:${actualPort}`);
  allowedHosts.add(`localhost:${actualPort}`);
  console.log(`GroupSend ready at http://localhost:${actualPort}`);
  if (process.send) process.send({ type: 'ready', port: actualPort });
});
process.on('message', message => { if (message?.type === 'shutdown') void shutdown(); });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
async function shutdown() { server.close(); if (client) { try { await client.destroy(); } catch {} } process.exit(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
process.on('unhandledRejection', error => {
  if (!isBrowserClosedError(error)) { console.error('Unhandled application error:', error); void shutdown(); return; }
  // The library can reject its navigation callbacks when the user closes Chrome.
  console.error(new Date().toISOString(), 'WhatsApp browser connection closed');
  if (!disconnecting && client) disconnectedClient(client);
  queue.cancel();
});
