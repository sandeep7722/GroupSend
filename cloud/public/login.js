(() => {
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (invite) {
    history.replaceState(null, '', '/login');
    document.getElementById('loginTitle').textContent = 'Apna account banayein.';
    document.getElementById('loginHint').textContent = 'Invite accept karein. Har user ka apna WhatsApp connection rahega.';
    document.getElementById('submit').textContent = 'Create account ↗';
    document.getElementById('password').autocomplete = 'new-password';
  }
  document.getElementById('authForm').onsubmit = async event => {
    event.preventDefault();
    const button = document.getElementById('submit'); button.disabled = true;
    const error = document.getElementById('authError'); error.hidden = true;
    try {
      const response = await fetch('/api/auth/' + (invite ? 'register' : 'login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value, invite }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign in failed');
      location.assign('/');
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { button.disabled = false; }
  };
})();
