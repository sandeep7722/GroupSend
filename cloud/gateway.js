const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Accounts } = require('./auth');
const { Workspaces } = require('./workers');
const buildRevision = require('./build-info').sourceRevision();

function createGateway({ origin, dataDir, accounts = new Accounts(dataDir), workspaces = new Workspaces({ dataDir, max: Number(process.env.MAX_WORKSPACES || 5) }), trustProxy = false }) {
  const site = new URL(origin);
  if (site.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(site.hostname)) throw new Error('Public app requires HTTPS');
  if (site.pathname !== '/' || site.search || site.hash) throw new Error('PUBLIC_ORIGIN must be a site origin');
  const secure = site.protocol === 'https:';
  const limits = new Map();
  function limited(key, maximum) {
    const now = Date.now();
    let item = limits.get(key);
    if (!item || now > item.until) { item = { count: 0, until: now + 600000 }; limits.set(key, item); }
    item.count++;
    if (limits.size > 10000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
    return item.count > maximum;
  }
  function reply(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
  function cookie(res, value, age) { res.setHeader('Set-Cookie', `groupsend_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`); }
  async function readBody(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON request required');
    let value = '';
    for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 32768) throw new Error('Request too large'); }
    return JSON.parse(value || '{}');
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok: true, app: 'groupsend-cloud', revision: buildRevision });
    if (req.headers.host !== site.host) return reply(res, 403, { error: 'Host rejected' });
    const route = new URL(req.url, site.origin).pathname;
    if (req.method === 'POST' && req.headers.origin !== site.origin) return reply(res, 403, { error: 'Origin rejected' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, { error: 'Cross-site request rejected' });
    const token = /(?:^|;\s*)groupsend_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = accounts.session(token);
    const ip = trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
    try {
      if (req.method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(route)) {
        if (limited('login-ip:' + ip, 30)) return reply(res, 429, { error: 'Zyada attempts hue. 10 minute baad try karein.' });
        const data = await readBody(req);
        if (limited('login-email:' + String(data.email || '').toLowerCase(), 10)) return reply(res, 429, { error: 'Zyada attempts hue. 10 minute baad try karein.' });
        if (!accounts.data.users.length) return reply(res, 503, { error: 'Owner account setup baaki hai.' });
        if (route.endsWith('/register')) {
          if (accounts.data.users.length >= Number(process.env.MAX_USERS || 100)) throw new Error('Account limit reached. Owner se contact karein.');
          await accounts.register(data.email, data.password, data.invite);
        }
        const loginToken = await accounts.login(data.email, data.password);
        if (!loginToken) return reply(res, 401, { error: 'Email ya password galat hai.' });
        cookie(res, loginToken, 43200);
        return reply(res, 200, { ok: true });
      }
      if (route.startsWith('/api/')) {
        if (!session) return reply(res, 401, { error: 'Sign in karein.' });
        if (req.method === 'GET' && route === '/api/auth/me') return reply(res, 200, { user: session.user, token: session.csrf });
        if (req.method === 'POST') {
          if (req.headers['x-app-token'] !== session.csrf) return reply(res, 403, { error: 'Page refresh karein.' });
          if (limited('action:' + session.user.id, 120)) return reply(res, 429, { error: 'Thodi der baad try karein.' });
          const data = await readBody(req);
          if (route === '/api/auth/logout') { accounts.logout(token); cookie(res, '', 0); return reply(res, 200, { ok: true }); }
          if (route === '/api/admin/invite') {
            if (session.user.role !== 'admin') return reply(res, 403, { error: 'Owner access required' });
            return reply(res, 200, { url: site.origin + '/login#invite=' + accounts.invite() });
          }
          if (!['/api/connect', '/api/logout', '/api/groups', '/api/send', '/api/cancel', '/api/pair-code', '/api/pair-cancel'].includes(route)) return reply(res, 404, { error: 'Not found' });
          // Account identity comes only from the authenticated session, never request fields.
          return reply(res, 200, await workspaces.call(session.user.id, route, data));
        }
        if (req.method === 'GET' && route === '/api/status') {
          const status = await workspaces.call(session.user.id, route);
          return reply(res, 200, { ...status, token: session.csrf, user: session.user, cloud: true });
        }
        return reply(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' });
      if (route === '/' && !session) { res.writeHead(302, { Location: '/login' }); return res.end(); }
      const shared = path.resolve(__dirname, '../public');
      const staticFiles = {
        '/login': [path.join(__dirname, 'public/login.html'), 'text/html'],
        '/login.js': [path.join(__dirname, 'public/login.js'), 'application/javascript'],
        '/cloud-ui.js': [path.join(__dirname, 'public/cloud-ui.js'), 'application/javascript'],
        '/style.css': [path.join(shared, 'style.css'), 'text/css'],
        '/cloud.css': [path.join(__dirname, 'public/cloud.css'), 'text/css'],
        '/favicon.svg': [path.join(shared, 'favicon.svg'), 'image/svg+xml'],
      };
      if (route === '/' || route === '/app.js') {
        if (!session) return reply(res, 401, { error: 'Sign in required' });
        const value = fs.readFileSync(path.join(shared, route === '/' ? 'index.html' : 'app.js'), 'utf8');
        res.writeHead(200, { 'Content-Type': route === '/' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8' }); return res.end(value);
      }
      const file = staticFiles[route];
      if (!file) return reply(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' }); res.end(fs.readFileSync(file[0]));
    } catch (error) { reply(res, 400, { error: error.message || 'Request fail hui' }); }
  });
  server.on('close', () => workspaces.close());
  return { server, accounts, workspaces };
}
if (require.main === module) {
  require('./runtime').start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createGateway };
