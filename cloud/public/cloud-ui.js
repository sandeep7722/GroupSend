(() => {
  async function setup() {
    const response = await fetch('/api/auth/me');
    if (response.status === 401) { location.assign('/login'); return; }
    if (!response.ok) return;
    const account = await response.json();
    const bar = document.createElement('div'); bar.className = 'account-bar';
    const label = document.createElement('span'); label.textContent = account.user.email;
    const signout = document.createElement('button'); signout.className = 'text-button'; signout.textContent = 'Account sign out';
    signout.onclick = async () => {
      signout.disabled = true;
      try {
        const result = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': account.token }, body: '{}' });
        if (!result.ok) throw new Error('Sign out fail hua. Page refresh karein.');
        location.assign('/login');
      } catch (error) { label.textContent = error.message; signout.disabled = false; }
    };
    bar.append(label, signout);
    document.querySelector('main').prepend(bar);
    if (account.user.role === 'admin') {
      const panel = document.createElement('section'); panel.className = 'card invite-panel';
      const title = document.createElement('h2'); title.textContent = 'Invite a user';
      const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Ek invite ek naye account ke liye hai aur 24 ghante tak valid hai. Link sirf us vyakti ko bhejein jise access dena hai.';
      const button = document.createElement('button'); button.className = 'button dark'; button.textContent = 'Create invite link';
      const output = document.createElement('input'); output.readOnly = true; output.hidden = true; output.setAttribute('aria-label', 'Invite link');
      button.onclick = async () => {
        button.disabled = true;
        try {
          const result = await fetch('/api/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': account.token }, body: '{}' });
          const data = await result.json(); if (!result.ok) throw new Error(data.error);
          output.value = data.url; output.hidden = false; output.focus(); output.select();
        } catch (error) { hint.textContent = error.message; }
        finally { button.disabled = false; }
      };
      panel.append(title, hint, button, output); document.querySelector('main').append(panel);
    }
  }
  setup().catch(() => {});
})();
