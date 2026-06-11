import { createRouter } from './router.js';
import { mountLanding } from './views/landing.js';
import { mountBuilder } from './builder/builder.js';
import { LocalTransport } from './net/transport-local.js';

const app = document.getElementById('app');
const router = createRouter(app);

router.register('#/', mountLanding);

// Solo sandbox: the builder driven by a local (offline) transport.
router.register('#/solo', (_params, container) =>
  mountBuilder(container, { transport: new LocalTransport() })
);

router.start();
