import { BrickStore } from '../src/placement.js';
import { PIECE_BY_ID, COLOR_BY_ID } from '../src/bricks/catalog.js';
import { S2C } from '../src/net/protocol.js';
import * as persistence from './persistence.js';

const room = (projectId) => `proj:${projectId}`;

// Owns one authoritative BrickStore per loaded project. Validates every
// mutating intent (membership, frozen, bounds via store.place) and broadcasts
// the result to the project room. Clients never assign brick ids.
export class ProjectManager {
  constructor(io) {
    this.io = io;
    this.projects = new Map(); // projectId -> { id, store, frozen }
  }

  async getOrLoad(projectId) {
    let proj = this.projects.get(projectId);
    if (proj) return proj;

    const store = new BrickStore();
    const saved = await persistence.loadWorld(projectId);
    if (saved) store.load(saved);

    proj = { id: projectId, store, frozen: false };
    this.projects.set(projectId, proj);
    return proj;
  }

  snapshot(proj) {
    return { bricks: [...proj.store.bricks.values()], frozen: proj.frozen };
  }

  async join(socket, projectId) {
    const proj = await this.getOrLoad(projectId);
    socket.join(room(projectId));
    return this.snapshot(proj);
  }

  leave(socket, projectId) {
    socket.leave(room(projectId));
  }

  _isMember(socket, projectId) {
    return socket.rooms.has(room(projectId));
  }

  place(socket, { projectId, pieceId, colorId, x, z, rot }) {
    const proj = this.projects.get(projectId);
    if (!proj || !this._isMember(socket, projectId)) return { ok: false, reason: 'not-member' };
    if (proj.frozen) return { ok: false, reason: 'frozen' };
    if (!PIECE_BY_ID[pieceId] || !COLOR_BY_ID[colorId]) return { ok: false, reason: 'bad-piece' };
    if (![x, z, rot].every(Number.isInteger)) return { ok: false, reason: 'bad-coords' };

    const brick = proj.store.place(pieceId, colorId, x, z, rot);
    if (!brick) return { ok: false, reason: 'invalid' };

    this.io.to(room(projectId)).emit(S2C.BRICK_PLACED, { projectId, brick });
    this._persist(proj);
    return { ok: true };
  }

  remove(socket, { projectId, id }) {
    const proj = this.projects.get(projectId);
    if (!proj || !this._isMember(socket, projectId)) return { ok: false, reason: 'not-member' };
    if (proj.frozen) return { ok: false, reason: 'frozen' };

    const brick = proj.store.remove(id);
    if (!brick) return { ok: false, reason: 'missing' };

    this.io.to(room(projectId)).emit(S2C.BRICK_REMOVED, { projectId, id });
    this._persist(proj);
    return { ok: true };
  }

  clear(socket, { projectId }) {
    const proj = this.projects.get(projectId);
    if (!proj || !this._isMember(socket, projectId)) return { ok: false, reason: 'not-member' };
    if (proj.frozen) return { ok: false, reason: 'frozen' };

    proj.store.clear();
    this.io.to(room(projectId)).emit(S2C.PROJECT_RESET, { projectId, bricks: [] });
    this._persist(proj);
    return { ok: true };
  }

  setFrozen(projectId, frozen) {
    const proj = this.projects.get(projectId);
    if (!proj) return { ok: false, reason: 'missing' };
    proj.frozen = !!frozen;
    this.io.to(room(projectId)).emit(S2C.PROJECT_FROZEN, { projectId, frozen: proj.frozen });
    return { ok: true };
  }

  _persist(proj) {
    persistence.saveWorldDebounced(proj.id, () => proj.store.serialize());
  }
}
