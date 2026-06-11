// Sticky login session, persisted in localStorage so a page reload stays
// logged in. Holds only { token, username } — never the PIN.
const KEY = 'block-party-session-v1';

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}

export function setSession(token, username) {
  localStorage.setItem(KEY, JSON.stringify({ token, username }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function getToken() { return getSession()?.token || null; }
export function getUsername() { return getSession()?.username || null; }
