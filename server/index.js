import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ProjectManager } from './projects.js';
import { Auth } from './auth.js';
import * as persistence from './persistence.js';
import { C2S } from '../src/net/protocol.js';

const PORT = 3001;
const HOST = '0.0.0.0';

await persistence.ensureDirs();

const auth = new Auth();
await auth.init();

const httpServer = createServer();
// Permissive CORS for the LAN dev tool (Vite serves the page from :5173 on
// localhost / LAN / ZeroTier). Tighten before any public deployment.
const io = new Server(httpServer, { cors: { origin: true } });
const pm = new ProjectManager(io);
await pm.init();

// Resolve a handshake token to a username so reconnects/reloads stay logged in.
io.use((socket, next) => {
  socket.username = auth.usernameForToken(socket.handshake.auth?.token) || null;
  next();
});

io.on('connection', (socket) => {
  socket.on(C2S.LOGIN, async ({ username, secret } = {}, ack) => {
    const res = await auth.login(username, secret);
    if (res.ok) socket.username = res.username; // authenticate this live socket
    ack?.(res);
  });

  socket.on(C2S.PROJECT_LIST, (_payload, ack) => {
    if (!socket.username) return ack?.({ ok: false, reason: 'unauthenticated' });
    ack?.({ ok: true, projects: pm.list() });
  });

  socket.on(C2S.PROJECT_CREATE, async ({ name, policy } = {}, ack) => {
    if (!socket.username) return ack?.({ ok: false, reason: 'unauthenticated' });
    ack?.(await pm.create(socket.username, name, policy));
  });

  socket.on(C2S.PROJECT_JOIN, async ({ projectId } = {}, ack) => {
    ack?.(await pm.join(socket, projectId));
  });

  socket.on(C2S.PROJECT_LEAVE, ({ projectId } = {}, ack) => {
    pm.leave(socket, projectId);
    ack?.({ ok: true });
  });

  // NOTE: evaluate the handler BEFORE the optional ack — `ack?.(pm.place(...))`
  // would short-circuit the pm call when no ack callback is supplied (the
  // normal fire-and-forget path for these intents).
  socket.on(C2S.BRICK_PLACE, (intent = {}, ack) => { const r = pm.place(socket, intent); ack?.(r); });
  socket.on(C2S.BRICK_REMOVE, (intent = {}, ack) => { const r = pm.remove(socket, intent); ack?.(r); });
  socket.on(C2S.PROJECT_CLEAR, (intent = {}, ack) => { const r = pm.clear(socket, intent); ack?.(r); });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Block Party server listening on http://${HOST}:${PORT}`);
});

// Flush pending world writes on shutdown so nothing is lost.
async function shutdown() {
  console.log('\nFlushing and shutting down…');
  try { await persistence.flushAll(); } finally { process.exit(0); }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
