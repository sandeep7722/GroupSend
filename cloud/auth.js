const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const emailKey = value => String(value || '').trim().toLowerCase();
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Password 12–128 characters ka rakhein.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, expected] = encoded.split(':');
  const hash = await scrypt(password, salt, 64);
  const buffer = Buffer.from(expected, 'hex');
  return hash.length === buffer.length && crypto.timingSafeEqual(hash, buffer);
}
class Accounts {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'accounts.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { users: [], invites: [] };
    this.sessions = new Map();
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  publicUser(user) { return { id: user.id, email: user.email, role: user.role }; }
  async create(email, password, role = 'user') {
    email = emailKey(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Valid email address dein.');
    const passwordHash = await hashPassword(password);
    if (this.data.users.some(user => user.email === email)) throw new Error('Account pehle se hai.');
    const user = { id: crypto.randomUUID(), email, passwordHash, role };
    this.data.users.push(user); this.save();
    return this.publicUser(user);
  }
  async login(email, password) {
    const user = this.data.users.find(user => user.email === emailKey(email));
    const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await verifyPassword(password, user?.passwordHash || dummy);
    if (!user || !valid) return null;
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(digest(token), { userId: user.id, csrf: crypto.randomBytes(32).toString('hex'), expires: Date.now() + 12 * 60 * 60 * 1000 });
    this.prune();
    return token;
  }
  session(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.sessions.get(digest(token));
    if (!session || session.expires < Date.now()) return null;
    const user = this.data.users.find(user => user.id === session.userId);
    return user ? { ...session, user: this.publicUser(user) } : null;
  }
  logout(token) { if (token) this.sessions.delete(digest(token)); }
  prune() { for (const [key, session] of this.sessions) if (session.expires < Date.now()) this.sessions.delete(key); }
  invite() {
    const token = crypto.randomBytes(24).toString('hex');
    this.data.invites = this.data.invites.filter(invite => invite.expires > Date.now() && !invite.used);
    this.data.invites.push({ hash: digest(token), expires: Date.now() + 86400000, used: false });
    this.save(); return token;
  }
  async register(email, password, token) {
    const invite = this.data.invites.find(invite => invite.hash === digest(String(token || '')) && !invite.used && invite.expires > Date.now());
    if (!invite) throw new Error('Invite invalid ya expired hai. Owner se naya invite lein.');
    // Reserve synchronously before password hashing, so concurrent requests cannot reuse it.
    invite.used = true; this.save();
    try { return await this.create(email, password); }
    catch (error) { invite.used = false; this.save(); throw error; }
  }
}
module.exports = { Accounts, hashPassword, verifyPassword };
