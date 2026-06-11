import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import * as persistence from './persistence.js';

const ACCOUNTS_FILE = 'accounts.json';
const KEYLEN = 64;

// Username rules: 3-20 chars, letters/digits/_/-/space, trimmed.
const USERNAME_RE = /^[A-Za-z0-9 _-]{3,20}$/;
// Secret (PIN/passphrase): at least 4 chars.
const MIN_SECRET = 4;

// Lightweight account + session auth.
// - Accounts persist to data/accounts.json: { username: {salt, hash, createdAt} }.
//   Register-on-first-use; verify with scrypt + constant-time compare.
// - Sessions are in-memory tokens (Map<token, username>). A server restart
//   forces re-login; that's an accepted v1 simplification.
export class Auth {
  constructor() {
    this.accounts = {};          // username -> { salt, hash, createdAt }
    this.tokens = new Map();     // token -> username
  }

  async init() {
    this.accounts = (await persistence.readJson(ACCOUNTS_FILE, {})) || {};
  }

  // Register-or-verify. Returns { ok, token, username } or { ok:false, reason }.
  async login(rawUsername, secret) {
    const username = String(rawUsername ?? '').trim();
    if (!USERNAME_RE.test(username)) return { ok: false, reason: 'bad-username' };
    if (typeof secret !== 'string' || secret.length < MIN_SECRET) {
      return { ok: false, reason: 'bad-secret' };
    }

    const existing = this.accounts[username];
    if (!existing) {
      // first use -> register
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(secret, salt, KEYLEN).toString('hex');
      this.accounts[username] = { salt, hash, createdAt: Date.now() };
      await persistence.writeJson(ACCOUNTS_FILE, this.accounts);
    } else if (!this._verify(secret, existing)) {
      return { ok: false, reason: 'bad-credentials' };
    }

    return { ok: true, token: this._issueToken(username), username };
  }

  _verify(secret, account) {
    const expected = Buffer.from(account.hash, 'hex');
    const actual = scryptSync(secret, account.salt, KEYLEN);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  _issueToken(username) {
    const token = randomUUID();
    this.tokens.set(token, username);
    return token;
  }

  // Resolve a handshake token to a username, or null.
  usernameForToken(token) {
    return (token && this.tokens.get(token)) || null;
  }
}
