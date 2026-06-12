// Socket.IO event names shared by client and server (single source of truth,
// imported by both src/net/* in the browser and server/* in Node).
//
// Not every event is implemented yet — they are declared here up front so the
// later phases (accounts, lobby, approval, admin) don't drift on naming.

// Client -> Server (most use an ack callback)
export const C2S = {
  // auth / lobby (phase 2+)
  LOGIN: 'auth:login',
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_ENTER: 'project:enter',   // lobby gate check (open vs approval)
  PROJECT_JOIN: 'project:join',
  PROJECT_LEAVE: 'project:leave',
  // building (phase 1)
  BRICK_PLACE: 'brick:place',
  BRICK_REMOVE: 'brick:remove',
  BRICK_ROTATE: 'brick:rotate', // phase 5
  PROJECT_CLEAR: 'project:clear',
  // admin (phase 3)
  PROJECT_FREEZE: 'project:freeze',
  PROJECT_RENAME: 'project:rename',
  PROJECT_DELETE: 'project:delete',
  PROJECT_SET_POLICY: 'project:setPolicy',
  JOIN_APPROVE: 'join:approve',
  JOIN_DENY: 'join:deny',
};

// Server -> Client (broadcasts / directed events, no ack)
export const S2C = {
  BRICK_PLACED: 'brick:placed',
  BRICK_REMOVED: 'brick:removed',
  BRICK_ROTATED: 'brick:rotated',
  PROJECT_RESET: 'project:reset',
  PROJECT_FROZEN: 'project:frozen',
  PROJECT_RENAMED: 'project:renamed',
  PROJECT_DELETED: 'project:deleted',
  PROJECT_POLICY: 'project:policy',
  MEMBERS_UPDATE: 'members:update',
  JOIN_REQUEST: 'join:request',
  JOIN_APPROVED: 'join:approved',
  JOIN_DENIED: 'join:denied',
  ERROR: 'error',
};

// Join policies
export const POLICY = { OPEN: 'open', APPROVAL: 'approval' };

// Phase 1 uses a single hardcoded project until the lobby lands in Phase 2.
export const DEFAULT_PROJECT_ID = 'main';
