const path = require('node:path');
const { Accounts } = require('./auth');

function runtimeConfig(env = process.env) {
  const origin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  if (!origin) throw new Error('Set PUBLIC_ORIGIN or deploy as a Render web service.');
  const port = Number(env.PORT || env.CLOUD_PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid service port');
  return { origin, port, host: env.BIND_HOST || (env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1'),
    dataDir: env.CLOUD_DATA_DIR || path.join(__dirname, '.data'), trustProxy: env.TRUST_PROXY === '1' };
}
async function bootstrapOwner(accounts, env = process.env) {
  const email = env.OWNER_EMAIL;
  const password = env.OWNER_PASSWORD;
  // Do not pass owner credentials to WhatsApp child processes.
  delete env.OWNER_EMAIL; delete env.OWNER_PASSWORD;
  if (accounts.data.users.length) return;
  if (!email || !password) throw new Error('First startup needs OWNER_EMAIL and OWNER_PASSWORD, or a locally created owner account.');
  await accounts.create(email, password, 'admin');
}
async function start(env = process.env) {
  const config = runtimeConfig(env);
  const accounts = new Accounts(config.dataDir);
  await bootstrapOwner(accounts, env);
  const { createGateway } = require('./gateway');
  const gateway = createGateway({ ...config, accounts });
  gateway.server.listen(config.port, config.host, () => console.log('GroupSend account app ready: ' + config.origin));
  gateway.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const timer = setInterval(() => { accounts.prune(); gateway.workspaces.evictIdle(); }, 60000); timer.unref();
  const stop = () => { clearInterval(timer); gateway.workspaces.close(); gateway.server.close(); setTimeout(() => process.exit(), 10000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return gateway;
}
module.exports = { runtimeConfig, bootstrapOwner, start };
