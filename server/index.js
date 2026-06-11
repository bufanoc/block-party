import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ProjectManager } from './projects.js';
import * as persistence from './persistence.js';
import { C2S, DEFAULT_PROJECT_ID } from '../src/net/protocol.js';

const PORT = 3001;
const HOST = '0.0.0.0';

await persistence.ensureDirs();

const httpServer = createServer();
// Permissive CORS for the LAN dev tool (Vite serves the page from :5173 on
// localhost / LAN / ZeroTier). Tighten before any public deployment.
const io = new Server(httpServer, { cors: { origin: true } });
const pm = new ProjectManager(io);

// Phase 1: a single hardcoded project until the lobby lands in Phase 2.
await pm.getOrLoad(DEFAULT_PROJECT_ID);

io.on('connection', (socket) => {
  socket.on(C2S.PROJECT_JOIN, async ({ projectId } = {}, ack) => {
    try {
      const snapshot = await pm.join(socket, projectId || DEFAULT_PROJECT_ID);
      ack?.({ ok: true, snapshot });
    } catch (err) {
      ack?.({ ok: false, reason: 'join-failed' });
    }
  });

  socket.on(C2S.PROJECT_LEAVE, ({ projectId } = {}, ack) => {
    pm.leave(socket, projectId || DEFAULT_PROJECT_ID);
    ack?.({ ok: true });
  });

  // NOTE: evaluate the handler BEFORE the optional ack. `ack?.(pm.place(...))`
  // would short-circuit the whole call — including pm.place — when no ack
  // callback is supplied (the normal case for fire-and-forget intents).
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
