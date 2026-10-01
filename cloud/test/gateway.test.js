const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Accounts } = require('../auth');
const { createGateway } = require('../gateway');

test('password hashes, invite single-use, sessions and account separation', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groupsend-cloud-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const accounts = new Accounts(dir);
  const owner = await accounts.create('owner@example.test', 'Owner-test-password', 'admin');
  const invite = accounts.invite();
  const user = await accounts.register('user@example.test', 'User-test-password', invite);
  await assert.rejects(accounts.register('second@example.test', 'User-test-password', invite), /Invite/);
  const contents = fs.readFileSync(accounts.file, 'utf8');
  assert.ok(!contents.includes('Owner-test-password'));
  assert.ok(!contents.includes(invite));
  assert.equal(await accounts.login('user@example.test', 'wrong-password'), null);
  const token = await accounts.login('user@example.test', 'User-test-password');
  assert.equal(accounts.session(token).user.id, user.id);
  assert.notEqual(user.id, owner.id);
  accounts.logout(token); assert.equal(accounts.session(token), null);
  assert.equal(new Accounts(dir).data.users.length, 2);
});

test('HTTP gateway enforces auth, CSRF, owner rights and session-bound workspace identity', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groupsend-gateway-'));
  const accounts = new Accounts(dir);
  const owner = await accounts.create('owner@example.test', 'Owner-test-password', 'admin');
  const user = await accounts.create('user@example.test', 'User-test-password');
  const calls = [];
  const workspaces = { close() {}, async call(id, route, data) { calls.push({ id, route, data }); return { status: 'disconnected', groups: [], ownerId: id }; } };
  const { server } = createGateway({ origin: 'http://localhost', dataDir: dir, accounts, workspaces });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = 'GET', cookie, csrf, body, origin = 'http://localhost' } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(url + route, { method, headers: { Host: 'localhost', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-App-Token': csrf } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])) })));
      });
      req.on('error', reject);
      req.end(method === 'POST' ? JSON.stringify(body || {}) : undefined);
    });
  }
  assert.equal((await request('/api/status')).status, 401);
  assert.equal(calls.length, 0);
  const login = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'User-test-password' } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const me = await (await request('/api/auth/me', { cookie })).json();
  const csrf = me.token;
  const status = await (await request('/api/status', { cookie })).json();
  assert.equal(status.ownerId, user.id);
  assert.equal((await request('/api/send', { method: 'POST', cookie })).status, 403);
  assert.equal((await request('/api/send', { method: 'POST', cookie, csrf, origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/api/send', { method: 'POST', cookie, csrf, body: { userId: owner.id } })).status, 200);
  assert.equal(calls.at(-1).id, user.id);
  assert.equal((await request('/api/admin/invite', { method: 'POST', cookie, csrf })).status, 403);
  assert.equal((await request('/api/restart-local', { method: 'POST', cookie, csrf })).status, 404);
  assert.equal((await request('/.data/accounts.json', { cookie })).status, 404);
  const page = await (await request('/', { cookie })).text();
  assert.ok(page.includes('/cloud-ui.js'));
  assert.ok(page.includes('Sending server par chalegi'));
  const appScript = await (await request('/app.js', { cookie })).text();
  assert.ok(appScript.includes("response.status === 401"));
  assert.ok(appScript.includes("location.assign('/login')"));
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, csrf })).status, 200);
  assert.equal((await request('/api/status', { cookie })).status, 401);
});

test('public HTTP origins are refused', () => {
  assert.throws(() => createGateway({ origin: 'http://example.com', dataDir: '.', accounts: {}, workspaces: {} }), /HTTPS/);
});
