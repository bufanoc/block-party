import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ProjectManager, userRoom } from './projects.js';
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
