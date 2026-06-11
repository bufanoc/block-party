import { getSocket, setSocketToken } from '../net/client.js';
import { setSession } from '../net/session.js';
import { C2S } from '../net/protocol.js';

const REASONS = {
  'bad-username': 'Username must be 3–20 letters, numbers, spaces, _ or -.',
  'bad-secret': 'PIN must be at least 4 characters.',
  'bad-credentials': 'Wrong PIN for that name.',
};

// Combined register-or-login. First use of a name registers it with the PIN;
// later it verifies. Lightweight by design (no email, no password reset yet).
export function mountLogin(_params, container) {
  container.innerHTML = `
    <div id="landing">
      <form class="hero auth-card" id="login-form">
        <h1 class="hero-title small">Block Party</h1>
        <p class="hero-by">By <a href="https://carminebufano.com" target="_blank" rel="noopener">carminebufano.com</a></p>
        <p class="auth-help">Pick a name and a PIN. New name = new account; the PIN is how you prove it's you next time (on any device).</p>
        <label class="field">
          <span>Name</span>
          <input id="username" name="username" autocomplete="username" maxlength="20" placeholder="e.g. Carmine" required />
        </label>
        <label class="field">
          <span>PIN / passphrase</span>
          <input id="pin" name="pin" type="password" autocomplete="current-password" placeholder="at least 4 characters" required />
        </label>
        <p class="form-err" id="login-err"></p>
        <div class="hero-actions">
          <button class="btn btn-primary" type="submit">Continue</button>
          <a class="btn" href="#/">Back</a>
        </div>
      </form>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const err = container.querySelector('#login-err');

  function onSubmit(e) {
    e.preventDefault();
    err.textContent = '';
    const username = container.querySelector('#username').value;
    const secret = container.querySelector('#pin').value;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    getSocket().emit(C2S.LOGIN, { username, secret }, (res) => {
      btn.disabled = false;
      if (res?.ok) {
        setSession(res.token, res.username);
        setSocketToken(res.token);
        location.hash = '#/lobby';
      } else {
        err.textContent = REASONS[res?.reason] || 'Could not sign in. Try again.';
      }
    });
  }

  form.addEventListener('submit', onSubmit);
  return { unmount() { form.removeEventListener('submit', onSubmit); container.innerHTML = ''; } };
}
