import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { ProjectManager, userRoom } from './projects.js';
import { Auth } from './auth.js';
import * as persistence from './persistence.js';
import { C2S } from '../src/net/protocol.js';

const HOST = '0.0.0.0';

// Production: when a built front-end exists in dist/, this one process serves
// the app AND the multiplayer socket on a single port (PORT). In dev there is
// no dist/ — Vite serves the front-end on :5173 and this is just the API/socket.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SERVE_STATIC = existsSync(path.join(DIST, 'index.html'));

// Default to port 80 in production (clean URLs, no :port) and 3001 in dev.
// Override with the PORT env var. Binding 80 needs privilege — the systemd
// service grants CAP_NET_BIND_SERVICE; for a manual run use sudo or PORT=8080.
const PORT = Number(process.env.PORT) || (SERVE_STATIC ? 80 : 3001);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

// Serve files from dist/ with an SPA fallback to index.html. Socket.IO
// intercepts its own /socket.io/ requests before this handler runs.
async function serveStatic(req, res) {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let filePath = path.normalize(path.join(DIST, urlPath));
    if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end(); } // traversal guard
    let info = null;
    try { info = await stat(filePath); } catch { /* missing */ }
    if (!info || info.isDirectory()) filePath = path.join(DIST, 'index.html'); // SPA fallback
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

await persistence.ensureDirs();

const auth = new Auth();
await auth.init();

const httpServer = createServer((req, res) => {
  if (SERVE_STATIC) return serveStatic(req, res);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Block Party game server (dev). The front-end is served by Vite on :5173.\n');
});
// Permissive CORS for the dev tool (Vite serves the page from :5173, a
// different origin). In production the page is same-origin, so CORS is moot.
const io = new Server(httpServer, { cors: { origin: true } });
const pm = new ProjectManager(io);
await pm.init();

// Resolve a handshake token to a username so reconnects/reloads stay logged in.
io.use((socket, next) => {
  socket.username = auth.usernameForToken(socket.handshake.auth?.token) || null;
  next();
});

io.on('connection', (socket) => {
  // Token-authenticated sockets join their user room (used to reach all of a
  // user's tabs/devices for join requests + approvals).
  if (socket.username) socket.join(userRoom(socket.username));

  socket.on(C2S.LOGIN, async ({ username, secret } = {}, ack) => {
    const res = await auth.login(username, secret);
    if (res.ok) {
      socket.username = res.username; // authenticate this live socket
      socket.join(userRoom(res.username));
    }
    ack?.(res);
  });

  socket.on(C2S.PROJECT_LIST, (_payload, ack) => {
    if (!socket.username) return ack?.({ ok: false, reason: 'unauthenticated' });
    ack?.({ ok: true, projects: pm.list() });
  });

  socket.on(C2S.PROJECT_CREATE, async ({ name, policy, size, baseColor } = {}, ack) => {
    if (!socket.username) return ack?.({ ok: false, reason: 'unauthenticated' });
    ack?.(await pm.create(socket.username, name, policy, size, baseColor));
  });

  // Lobby gate check (open vs approval) — does not join the room.
  socket.on(C2S.PROJECT_ENTER, ({ projectId } = {}, ack) => {
    ack?.(pm.enter(socket, projectId));
  });

  socket.on(C2S.PROJECT_JOIN, async ({ projectId } = {}, ack) => {
    ack?.(await pm.join(socket, projectId));
  });

  socket.on(C2S.PROJECT_LEAVE, ({ projectId } = {}, ack) => {
    pm.leave(socket, projectId);
    ack?.({ ok: true });
  });

  // Building. NOTE: evaluate the handler BEFORE the optional ack —
  // `ack?.(pm.place(...))` would short-circuit the pm call when no ack callback
  // is supplied (the normal fire-and-forget path for these intents).
  socket.on(C2S.BRICK_PLACE, (intent = {}, ack) => { const r = pm.place(socket, intent); ack?.(r); });
  socket.on(C2S.BRICK_REMOVE, (intent = {}, ack) => { const r = pm.remove(socket, intent); ack?.(r); });

  // Admin + approval (creator-only; enforcement lives in ProjectManager).
  socket.on(C2S.PROJECT_CLEAR, (intent = {}, ack) => { const r = pm.clear(socket, intent); ack?.(r); });
  socket.on(C2S.PROJECT_FREEZE, (intent = {}, ack) => { const r = pm.setFrozen(socket, intent); ack?.(r); });
  socket.on(C2S.PROJECT_RENAME, (intent = {}, ack) => { const r = pm.rename(socket, intent); ack?.(r); });
  socket.on(C2S.PROJECT_SET_POLICY, (intent = {}, ack) => { const r = pm.setPolicy(socket, intent); ack?.(r); });
  socket.on(C2S.PROJECT_DELETE, async (intent = {}, ack) => { ack?.(await pm.delete(socket, intent)); });
  socket.on(C2S.JOIN_APPROVE, (intent = {}, ack) => { const r = pm.approve(socket, intent); ack?.(r); });
  socket.on(C2S.JOIN_DENY, (intent = {}, ack) => { const r = pm.deny(socket, intent); ack?.(r); });

  socket.on('disconnect', () => pm.handleDisconnect(socket));
});

httpServer.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`\nCannot bind port ${PORT} — permission denied.\n` +
      `Port 80 is privileged. Run with sudo, use the systemd service, or set an ` +
      `unprivileged port, e.g.  PORT=8080 npm start\n`);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Stop the other process or set PORT.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  const mode = SERVE_STATIC ? 'serving app + multiplayer' : 'dev (socket/API only)';
  console.log(`Block Party server listening on http://${HOST}:${PORT} — ${mode}`);
});

// Flush pending world writes on shutdown so nothing is lost.
async function shutdown() {
  console.log('\nFlushing and shutting down…');
  try { await persistence.flushAll(); } finally { process.exit(0); }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
