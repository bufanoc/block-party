import { randomUUID } from 'node:crypto';
import { BrickStore } from '../src/placement.js';
import { PIECE_BY_ID, COLOR_BY_ID } from '../src/bricks/catalog.js';
import { S2C, POLICY } from '../src/net/protocol.js';
import { gridFor, SIZE_BY_ID, DEFAULT_SIZE_ID, DEFAULT_BASE_COLOR, isHexColor } from '../src/sizes.js';
import * as persistence from './persistence.js';

const INDEX_FILE = 'projects/index.json';
const room = (projectId) => `proj:${projectId}`;
const NAME_RE = /^.{1,40}$/;

// Owns project metadata (the lobby index) plus a lazily-loaded authoritative
// BrickStore per project. Reuses the pure BrickStore so the server and client
// share identical placement rules. Clients never assign brick ids.
export class ProjectManager {
  constructor(io) {
    this.io = io;
    this.metas = new Map();   // projectId -> { id, name, creator, policy, frozen, createdAt }
    this.loaded = new Map();  // projectId -> BrickStore
  }

  async init() {
    const index = (await persistence.readJson(INDEX_FILE, [])) || [];
    for (const meta of index) this.metas.set(meta.id, meta);
  }

  async _saveIndex() {
    await persistence.writeJson(INDEX_FILE, [...this.metas.values()]);
  }

  // ---- lobby ----

  list() {
    return [...this.metas.values()].map((m) => ({ ...m }));
  }

  async create(creator, name, policy, size, baseColor) {
    const trimmed = String(name ?? '').trim();
    if (!NAME_RE.test(trimmed)) return { ok: false, reason: 'bad-name' };

    const sizeId = SIZE_BY_ID[size] ? size : DEFAULT_SIZE_ID;
    const color = isHexColor(baseColor) ? baseColor : DEFAULT_BASE_COLOR;

    const meta = {
      id: randomUUID(),
      name: trimmed,
      creator,
      policy: policy === POLICY.APPROVAL ? POLICY.APPROVAL : POLICY.OPEN,
      frozen: false,
      size: sizeId,
      baseColor: color,
      createdAt: Date.now(),
    };
    this.metas.set(meta.id, meta);
    this.loaded.set(meta.id, new BrickStore(gridFor(sizeId)));
    persistence.saveWorldDebounced(meta.id, () => this.loaded.get(meta.id).serialize());
    await this._saveIndex();
    return { ok: true, meta };
  }

  // ---- project loading ----

  async _store(projectId) {
    let store = this.loaded.get(projectId);
    if (store) return store;
    const meta = this.metas.get(projectId);
    if (!meta) return null;
    store = new BrickStore(gridFor(meta.size));
    const saved = await persistence.loadWorld(projectId);
    if (saved) store.load(saved);
    this.loaded.set(projectId, store);
    return store;
  }

  snapshot(projectId) {
    const meta = this.metas.get(projectId);
    const store = this.loaded.get(projectId);
    return { bricks: store ? [...store.bricks.values()] : [], frozen: !!meta?.frozen };
  }

  // ---- membership ----

  async join(socket, projectId) {
    const meta = this.metas.get(projectId);
    if (!meta) return { ok: false, reason: 'no-project' };
    if (!socket.username) return { ok: false, reason: 'unauthenticated' };
    // Phase 2: open join. Approval handshake arrives in Phase 3.
    await this._store(projectId);
    socket.join(room(projectId));
    return { ok: true, meta: { ...meta }, snapshot: this.snapshot(projectId) };
  }

  leave(socket, projectId) {
    socket.leave(room(projectId));
  }

  _isMember(socket, projectId) {
    return socket.rooms.has(room(projectId));
  }

  // ---- building (validated, authoritative, broadcast) ----

  place(socket, { projectId, pieceId, colorId, x, z, rot }) {
    const gate = this._canBuild(socket, projectId);
    if (!gate.ok) return gate;
    if (!PIECE_BY_ID[pieceId] || !COLOR_BY_ID[colorId]) return { ok: false, reason: 'bad-piece' };
    if (![x, z, rot].every(Number.isInteger)) return { ok: false, reason: 'bad-coords' };

    const brick = gate.store.place(pieceId, colorId, x, z, rot);
    if (!brick) return { ok: false, reason: 'invalid' };

    this.io.to(room(projectId)).emit(S2C.BRICK_PLACED, { projectId, brick });
    this._persist(projectId, gate.store);
    return { ok: true };
  }

  remove(socket, { projectId, id }) {
    const gate = this._canBuild(socket, projectId);
    if (!gate.ok) return gate;

    const brick = gate.store.remove(id);
    if (!brick) return { ok: false, reason: 'missing' };

    this.io.to(room(projectId)).emit(S2C.BRICK_REMOVED, { projectId, id });
    this._persist(projectId, gate.store);
    return { ok: true };
  }

  clear(socket, { projectId }) {
    const gate = this._canBuild(socket, projectId);
    if (!gate.ok) return gate;

    gate.store.clear();
    this.io.to(room(projectId)).emit(S2C.PROJECT_RESET, { projectId, bricks: [] });
    this._persist(projectId, gate.store);
    return { ok: true };
  }

  // Authenticated + member + project exists + not frozen. Returns the store.
  _canBuild(socket, projectId) {
    const meta = this.metas.get(projectId);
    if (!meta) return { ok: false, reason: 'no-project' };
    if (!socket.username) return { ok: false, reason: 'unauthenticated' };
    if (!this._isMember(socket, projectId)) return { ok: false, reason: 'not-member' };
    if (meta.frozen) return { ok: false, reason: 'frozen' };
    const store = this.loaded.get(projectId);
    if (!store) return { ok: false, reason: 'not-loaded' };
    return { ok: true, store };
  }

  _persist(projectId, store) {
    persistence.saveWorldDebounced(projectId, () => store.serialize());
  }
}
