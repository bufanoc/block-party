import { createRouter } from './router.js';
import { mountLanding } from './views/landing.js';
import { mountBuilder } from './builder/builder.js';
import { LocalTransport } from './net/transport-local.js';
import { SocketTransport } from './net/transport-socket.js';
import { getSocket } from './net/client.js';
import { DEFAULT_PROJECT_ID } from './net/protocol.js';

const app = document.getElementById('app');
const router = createRouter(app);

router.register('#/', mountLanding);

// Solo sandbox: the builder driven by a local (offline) transport.
router.register('#/solo', (_params, container) =>
  mountBuilder(container, { transport: new LocalTransport() })
);

// Phase 1: shared room over the network (single hardcoded project, no auth).
// The lobby and per-project routing arrive in Phase 2.
router.register('#/room', (_params, container) =>
  mountBuilder(container, { transport: new SocketTransport(getSocket(), DEFAULT_PROJECT_ID) })
);

router.start();
