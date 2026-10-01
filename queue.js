const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

class SendQueue {
  constructor({ file, send, ready, delay = 2500 }) {
    this.file = file;
    this.send = send;
    this.ready = ready;
    this.delay = delay;
    this.busy = false;
    this.job = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (this.job && ['running', 'stopping'].includes(this.job.status)) {
      this.job.status = 'interrupted';
      for (const row of this.job.results) {
        if (row.status === 'sending') { row.status = 'unknown'; row.error = 'App band ho gaya tha. Dobara bhejne se pehle WhatsApp check karein.'; }
        if (row.status === 'pending') row.status = 'cancelled';
      }
      this.save();
    }
  }
  save() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.job), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  start({ requestId, groupIds, message }, groups) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error('Invalid request. Page refresh karein.');
    if (this.job?.requestId === requestId) return this.job;
    if (this.busy) throw new Error('Pichla message abhi bheja ja raha hai.');
    if (!this.ready()) throw new Error('Pehle WhatsApp connect karein.');
    if (typeof message !== 'string' || !message.trim() || message.length > 4096) throw new Error('Message 1 se 4096 characters ka hona chahiye.');
    if (!Array.isArray(groupIds) || !groupIds.length || groupIds.length > 100) throw new Error('1 se 100 groups select karein.');
    const ids = [...new Set(groupIds)];
    const known = new Map(groups.map(g => [g.id, g]));
    if (ids.some(id => typeof id !== 'string' || !id.endsWith('@g.us') || !known.has(id))) throw new Error('Group list refresh karke dobara select karein.');
    this.job = { id: randomUUID(), requestId, status: 'running', startedAt: new Date().toISOString(), results: ids.map(id => ({ id, name: known.get(id).name, status: 'pending' })) };
    this.save();
    this.busy = true;
    this.run(message).catch(() => {
      this.busy = false;
      this.job.status = 'interrupted';
      for (const row of this.job.results) {
        if (row.status === 'sending') row.status = 'unknown';
        if (row.status === 'pending') row.status = 'cancelled';
      }
      try { this.save(); } catch {}
    });
    return this.job;
  }
  cancel() {
    if (this.busy) { this.job.status = 'stopping'; this.save(); }
  }
  async run(message) {
    for (const row of this.job.results) {
      if (this.job.status === 'stopping' || !this.ready()) { row.status = 'cancelled'; this.save(); continue; }
      row.status = 'sending'; this.save();
      try {
        const receipt = await this.send(row.id, message);
        if (receipt?.id) row.messageId = receipt.id;
        row.status = 'submitted';
      } catch (error) {
        row.status = error.beforeSend ? 'failed' : 'unknown';
        row.error = error.beforeSend ? (error.userMessage || 'Is group mein message nahi bhej sake. Membership aur permission check karein.') : 'Send confirm nahi hua. Dobara bhejne se pehle WhatsApp check karein.';
      }
      this.save();
      if (this.delay) await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    this.job.status = this.job.results.some(r => r.status === 'cancelled') ? 'stopped' : 'complete';
    this.busy = false;
    this.save();
  }
}
module.exports = { SendQueue };
