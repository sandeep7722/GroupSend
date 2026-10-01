function isBrowserClosedError(error) {
  return /Target closed|Session closed|Connection closed|detached Frame|Execution context was destroyed|TargetCloseError/i.test(String(error?.stack || error));
}
async function bounded(operation, ms = 8000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Operation timed out')), ms); })]);
  } finally { clearTimeout(timer); }
}
async function closeAndLogout(current, timeout = 8000) {
  if (!current) return { remote: false, local: true };
  let remote = false;
  let local = false;
  try { await bounded(() => current.logout(), timeout); remote = true; local = true; } catch {}
  try { await bounded(() => current.destroy(), timeout); } catch {}
  if (!local) { try { await bounded(() => current.authStrategy.logout(), timeout); local = true; } catch {} }
  return { remote, local };
}
module.exports = { isBrowserClosedError, bounded, closeAndLogout };
