import { createRouter } from './router.js';
import { mountLanding } from './views/landing.js';
import { mountLogin } from './views/login.js';
import { mountLobby } from './views/lobby.js';
import { mountBuilder } from './builder/builder.js';
import { LocalTransport } from './net/transport-local.js';
import { SocketTransport } from './net/transport-socket.js';
import { getSocket } from './net/client.js';
import { getSession } from './net/session.js';

const app = document.getElementById('app');
const router = createRouter(app);

// Redirect to login if there's no session; returns whether auth is present.
function requireAuth() {
  if (getSession()) return true;
  location.hash = '#/login';
  return false;
}

router.register('#/', mountLanding);
router.register('#/login', mountLogin);

// Solo sandbox: offline builder, no server, no login.
router.register('#/solo', (_params, container) =>
  mountBuilder(container, { transport: new LocalTransport() })
);

router.register('#/lobby', (params, container) =>
  requireAuth() ? mountLobby(params, container) : null
);

// A project's shared World over the network.
router.register('#/project/:id', (params, container) => {
  if (!requireAuth()) return null;
  return mountBuilder(container, {
    transport: new SocketTransport(getSocket(), params.id),
    onLeave: () => { location.hash = '#/lobby'; },
    onFatal: () => { location.hash = '#/lobby'; },
  });
});

router.start();
