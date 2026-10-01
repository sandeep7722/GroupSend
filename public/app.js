const $ = id => document.getElementById(id);
let state = null;
let selected = new Set();
let groupSignature = '';
let jobSignature = '';
let posting = false;
let request = null;
let loadingGroups = false;
let serverOnline = false;
let automaticError = '';
let gettingCode = false;
const labels = { disconnected: 'Not connected', disconnecting: 'Disconnecting…', connecting: 'Connecting…', qr: 'Scan QR on your phone', loading: 'Loading WhatsApp…', ready: 'Connected', error: 'Connection issue' };
function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
async function post(route, data = {}) {
  const response = await fetch('/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': state?.token || '' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request fail hui.');
  return result;
}
function busy() { return posting || ['running', 'stopping'].includes(state?.job?.status); }
function controls() {
  const ready = state?.status === 'ready';
  const active = busy();
  $('connect').hidden = ready;
  $('connect').disabled = !serverOnline || ['connecting', 'qr', 'loading', 'disconnecting'].includes(state?.status);
  $('logout').hidden = !['ready', 'connecting', 'qr', 'loading', 'disconnecting'].includes(state?.status);
  $('logout').disabled = !serverOnline || state?.status === 'disconnecting';
  $('logout').textContent = state?.status === 'disconnecting' ? 'Disconnecting…' : 'Disconnect';
  $('phonePanel').hidden = !serverOnline || state?.status !== 'qr';
  $('phoneForm').hidden = !!state?.pairingCode;
  $('codePanel').hidden = !state?.pairingCode;
  $('pairingCode').textContent = state?.pairingCode || '';
  $('getCode').disabled = gettingCode;
  $('getCode').textContent = gettingCode ? 'Code aa raha hai…' : 'Get linking code';
  $('backToQR').disabled = gettingCode;
  $('refresh').disabled = !ready || loadingGroups || active;
  $('search').disabled = !ready;
  $('selectAll').disabled = !ready || active || !state?.groups.length;
  $('clear').disabled = !selected.size || active;
  $('message').disabled = active;
  $('send').disabled = !ready || !selected.size || !$('message').value.trim() || active;
  $('selectedCount').textContent = selected.size;
  $('characters').textContent = `${$('message').value.length} / 4096`;
  $('previewText').textContent = !ready ? 'Pehle WhatsApp connect karein.' : selected.size ? `${selected.size} selected group${selected.size === 1 ? '' : 's'} mein message bheja jayega.` : 'Baayein taraf se groups select karein.';
  $('sendLabel').textContent = active ? 'Message bheja ja raha hai…' : selected.size ? `Send to ${selected.size} group${selected.size === 1 ? '' : 's'}` : 'Send message';
  document.querySelectorAll('.group-row input').forEach(input => { input.disabled = active; input.checked = selected.has(input.value); });
}
function visibleGroups() { const q = $('search').value.toLocaleLowerCase(); return (state?.groups || []).filter(g => g.name.toLocaleLowerCase().includes(q)); }
function renderGroups() {
  const container = $('groups'); container.replaceChildren();
  $('groupCount').textContent = `${state?.groups.length || 0} groups available`;
  const list = visibleGroups();
  if (!list.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '☷';
    const title = document.createElement('h3'); title.textContent = state?.status === 'ready' ? ($('search').value ? 'Koi matching group nahi mila' : 'Abhi koi group nahi mila') : 'Aapke groups yahan dikhenge';
    const note = document.createElement('p'); note.textContent = state?.status === 'ready' ? 'Search badlein ya Refresh par click karein.' : 'WhatsApp connect karke apne existing groups load kijiye.';
    empty.append(icon, title, note); container.append(empty);
  }
  for (const group of list) {
    const row = document.createElement('label'); row.className = 'group-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = group.id; checkbox.checked = selected.has(group.id);
    checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(group.id) : selected.delete(group.id); request = null; controls(); });
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = Array.from(group.name)[0]?.toUpperCase() || 'G';
    const name = document.createElement('span'); name.className = 'group-name'; name.textContent = group.name;
    if (group.members) { const members = document.createElement('small'); members.textContent = `${group.members} members`; name.append(members); }
    row.append(checkbox, avatar, name); container.append(row);
  }
  controls();
}
function renderJob() {
  const job = state?.job; $('resultsPanel').hidden = !job; if (!job) return;
  const signature = JSON.stringify(job); if (signature === jobSignature) return; jobSignature = signature;
  const active = ['running', 'stopping'].includes(job.status);
  const sent = job.results.filter(r => r.status === 'submitted').length;
  $('resultsTitle').textContent = `${active ? 'Sending' : 'Last send'} · ${sent} / ${job.results.length} submitted`;
  $('cancel').hidden = !active; $('cancel').disabled = job.status === 'stopping';
  const statuses = { pending: 'Waiting', sending: 'Sending…', submitted: 'Submitted ✓', failed: 'Failed', unknown: 'Check WhatsApp', cancelled: 'Not sent' };
  $('results').replaceChildren();
  for (const result of job.results) {
    const row = document.createElement('div'); row.className = 'result-row';
    const name = document.createElement('span'); name.textContent = result.name;
    if (result.error) { const note = document.createElement('small'); note.textContent = result.error; name.append(note); }
    const status = document.createElement('span'); status.className = 'badge ' + result.status; status.textContent = statuses[result.status];
    row.append(name, status); $('results').append(row);
  }
}
async function poll() {
  try {
    const response = await fetch('/api/status');
    if (response.status === 401) { location.assign('/login'); return; }
    if (!response.ok) throw new Error('Server unavailable');
    state = await response.json();
    serverOnline = true;
    $('connectionText').textContent = state.status === 'ready' ? state.account : labels[state.status];
    $('dot').className = 'dot ' + state.status;
    $('linkPanel').hidden = !!state.pairingCode || !['connecting', 'qr', 'loading'].includes(state.status);
    $('linkTitle').textContent = state.status === 'qr' ? 'Phone se QR scan kijiye' : state.status === 'loading' ? 'WhatsApp sync ho raha hai…' : 'Connection shuru ho raha hai…';
    $('qr').hidden = !state.qr; $('qrLoading').hidden = !!state.qr;
    if (state.qr && $('qr').getAttribute('src') !== state.qr) $('qr').src = state.qr;
    if (!state.qr) $('qr').removeAttribute('src');
    if (state.error) { automaticError = state.error; showError(automaticError); }
    else if (automaticError) { if ($('error').textContent === automaticError) showError(''); automaticError = ''; }
    const sig = JSON.stringify(state.groups) + state.status;
    if (sig !== groupSignature) { groupSignature = sig; selected = new Set([...selected].filter(id => state.groups.some(g => g.id === id))); renderGroups(); }
    renderJob(); controls();
  } catch {
    serverOnline = false;
    $('qr').removeAttribute('src');
    $('qr').hidden = true;
    $('pairingCode').textContent = '';
    $('linkPanel').hidden = true;
    if (state) state.status = 'disconnected';
    $('connectionText').textContent = 'App offline';
    $('dot').className = 'dot';
    automaticError = 'Server se connection nahi ho raha. Internet check karein; local use mein accounts launcher kholein.';
    showError(automaticError); controls();
  }
}
async function action(fn) { showError(''); try { await fn(); await poll(); } catch (error) { showError(error.message); } }
$('connect').onclick = () => action(() => post('connect'));
$('phoneForm').onsubmit = event => {
  event.preventDefault();
  if (gettingCode) return;
  action(async () => {
    gettingCode = true; controls();
    try { await post('pair-code', { phone: $('phone').value }); $('phone').value = ''; }
    finally { gettingCode = false; controls(); }
  });
};
$('backToQR').onclick = () => action(async () => {
  gettingCode = true; controls();
  try { await post('pair-cancel'); } finally { gettingCode = false; controls(); }
});
$('logout').onclick = () => action(() => post('logout'));
$('refresh').onclick = () => action(async () => { loadingGroups = true; controls(); try { await post('groups'); } finally { loadingGroups = false; controls(); } });
$('search').oninput = renderGroups;
$('message').oninput = () => { request = null; controls(); };
$('selectAll').onclick = () => { for (const g of visibleGroups()) selected.add(g.id); request = null; renderGroups(); };
$('clear').onclick = () => { selected.clear(); request = null; renderGroups(); };
$('send').onclick = () => action(async () => {
  if (busy()) return;
  posting = true; controls();
  request ||= { requestId: crypto.randomUUID(), groupIds: [...selected], message: $('message').value };
  try { const result = await post('send', request); state.job = result.job; renderJob(); $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  finally { posting = false; controls(); }
});
$('cancel').onclick = () => action(() => post('cancel'));
async function loop() { await poll(); setTimeout(loop, 2000); }
loop();
