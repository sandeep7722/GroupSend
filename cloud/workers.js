const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
class Workspaces {
  constructor({ dataDir, root = path.resolve(__dirname, '..'), max = 5, spawn = fork }) {
    this.dataDir = dataDir; this.root = root; this.max = max; this.spawn = spawn; this.workers = new Map();
  }
  async get(userId) {
    if (!/^[a-f0-9-]{36}$/.test(userId)) throw new Error('Invalid account');
    if (this.workers.has(userId)) return this.workers.get(userId).ready;
    if (this.workers.size >= this.max) throw new Error('Server capacity full hai. Owner se contact karein.');
    const directory = path.join(this.dataDir, 'users', userId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const child = this.spawn(path.join(this.root, 'server.js'), [], {
      cwd: this.root,
      env: { ...process.env, PORT: '0', GROUPSEND_CLOUD: '1', GROUPSEND_DATA_DIR: directory },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const worker = { child, touched: Date.now() };
    worker.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Workspace start timeout')); }, 30000);
      child.once('error', error => { clearTimeout(timeout); this.workers.delete(userId); reject(error); });
      child.on('message', message => {
        if (message?.type === 'ready' && Number.isInteger(message.port)) { clearTimeout(timeout); worker.url = `http://127.0.0.1:${message.port}`; resolve(worker); }
      });
      child.once('exit', () => { clearTimeout(timeout); this.workers.delete(userId); reject(new Error('Workspace stopped')); });
    });
    // No user messages, QR codes or phone numbers go to gateway logs.
    child.stderr?.on('data', () => { console.error('A WhatsApp workspace reported an error.'); });
    this.workers.set(userId, worker);
    return worker.ready;
  }
  async call(userId, route, data) {
    const worker = await this.get(userId); worker.touched = Date.now();
    const statusResponse = await fetch(worker.url + '/api/status', { signal: AbortSignal.timeout(10000) });
    if (!statusResponse.ok) throw new Error('Workspace unavailable');
    const status = await statusResponse.json();
    worker.status = status.status; worker.busy = ['running', 'stopping'].includes(status.job?.status);
    if (route === '/api/status') { delete status.token; return status; }
    const response = await fetch(worker.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': status.token }, body: JSON.stringify(data || {}), signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'WhatsApp request failed');
    return result;
  }
  evictIdle() {
    for (const worker of this.workers.values()) {
      if (worker.status === 'disconnected' && !worker.busy && Date.now() - worker.touched > 600000) worker.child.send({ type: 'shutdown' });
    }
  }
  close() { for (const worker of this.workers.values()) if (worker.child.connected) worker.child.send({ type: 'shutdown' }); }
}
module.exports = { Workspaces };
