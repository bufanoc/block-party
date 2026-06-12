import { randomUUID } from 'node:crypto';
import { BrickStore } from '../src/placement.js';
import { PIECE_BY_ID, COLOR_BY_ID } from '../src/bricks/catalog.js';
import { S2C, POLICY } from '../src/net/protocol.js';
import { gridFor, SIZE_BY_ID, DEFAULT_SIZE_ID, DEFAULT_BASE_COLOR, isHexColor } from '../src/sizes.js';
import * as persistence from './persistence.js';

const INDEX_FILE = 'projects/index.json';
const room = (projectId) => `proj:${projectId}`;
export const userRoom = (username) => `user:${username}`; // all of one user's sockets
const NAME_RE = /^.{1,40}$/;

// Owns project metadata (the lobby index) plus a lazily-loaded authoritative
// BrickStore per project. Reuses the pure BrickStore so the server and client
// share identical placement rules. Clients never assign brick ids.
//
// Phase 3 adds: approval-to-join (per-project policy), live presence, and
// Creator-only admin actions (freeze / rename / delete / clear / set policy).
export class ProjectManager {
  constructor(io) {
    this.io = io;
    this.metas = new Map();    // projectId -> meta
    this.loaded = new Map();   // projectId -> BrickStore
    this.presence = new Map(); // projectId -> Map(username -> socketCount)
    this.pending = new Map();  // projectId -> Set(username) awaiting approval
  }

  async init() {
    const index = (await persistence.readJson(INDEX_FILE, [])) || [];
    for (const meta of index) this.metas.set(meta.id, meta);
  }

  async _saveIndex() {
    await persistence.writeJson(INDEX_FILE, [...this.metas.values()]);
  }

  // ---- lobby ----

  // Lobby cards: omit the members allowlist (not needed client-side).
  list() {
    return [...this.metas.values()].map(({ members, ...rest }) => ({ ...rest }));
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
      members: [creator], // allowlist for approval projects; creator always in
      createdAt: Date.now(),
    };
    this.metas.set(meta.id, meta);
    this.loaded.set(meta.id, new BrickStore(gridFor(sizeId)));
    persistence.saveWorldDebounced(meta.id, () => this.loaded.get(meta.id).serialize());
    await this._saveIndex();
    return { ok: true, meta: this._publicMeta(meta) };
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

  _publicMeta(meta) {
    const { members, ...rest } = meta;
    return { ...rest };
  }

  _isAllowed(meta, username) {
    return meta.policy === POLICY.OPEN
      || username === meta.creator
      || (meta.members || []).includes(username);
  }

  // ---- entry: gate check from the lobby (does NOT join the room) ----

  enter(socket, projectId) {
    const meta = this.metas.get(projectId);
    if (!meta) return { ok: false, reason: 'no-project' };
    if (!socket.username) return { ok: false, reason: 'unauthenticated' };
    if (this._isAllowed(meta, socket.username)) return { ok: true, allowed: true };

    // approval policy, not yet a member -> request to join
    this._addPending(projectId, socket.username);
    this.io.to(userRoom(meta.creator)).emit(S2C.JOIN_REQUEST, { projectId, username: socket.username });
    return { ok: true, pending: true };
  }

  // ---- real join: enters the room + presence (assumes allowed) ----

  async join(socket, projectId) {
    const meta = this.metas.get(projectId);
    if (!meta) return { ok: false, reason: 'no-project' };
    if (!socket.username) return { ok: false, reason: 'unauthenticated' };
    if (!this._isAllowed(meta, socket.username)) return { ok: false, reason: 'not-approved' };

    await this._store(projectId);
    socket.join(room(projectId));
    this._addPresence(socket, projectId);

    const res = {
      ok: true,
      meta: this._publicMeta(meta),
      snapshot: this.snapshot(projectId),
      present: this._presentList(projectId),
    };
    if (socket.username === meta.creator) res.pending = this._pendingList(projectId);
    return res;
  }

  leave(socket, projectId) {
    socket.leave(room(projectId));
    this._removePresence(socket, projectId);
  }

  _isMember(socket, projectId) {
    return socket.rooms.has(room(projectId));
  }

  // ---- approval (creator only) ----

  approve(socket, { projectId, username }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    this._removePending(projectId, username);
    if (!meta.members) meta.members = [meta.creator];
    if (!meta.members.includes(username)) meta.members.push(username);
    this._saveIndex();
    this.io.to(userRoom(username)).emit(S2C.JOIN_APPROVED, { projectId });
    return { ok: true };
  }

  deny(socket, { projectId, username }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    this._removePending(projectId, username);
    this.io.to(userRoom(username)).emit(S2C.JOIN_DENIED, { projectId });
    return { ok: true };
  }

  // ---- admin (creator only) ----

  setFrozen(socket, { projectId, frozen }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    meta.frozen = !!frozen;
    this._saveIndex();
    this.io.to(room(projectId)).emit(S2C.PROJECT_FROZEN, { projectId, frozen: meta.frozen });
    return { ok: true };
  }

  rename(socket, { projectId, name }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    const trimmed = String(name ?? '').trim();
    if (!NAME_RE.test(trimmed)) return { ok: false, reason: 'bad-name' };
    meta.name = trimmed;
    this._saveIndex();
    this.io.to(room(projectId)).emit(S2C.PROJECT_RENAMED, { projectId, name: trimmed });
    return { ok: true };
  }

  setPolicy(socket, { projectId, policy }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    meta.policy = policy === POLICY.APPROVAL ? POLICY.APPROVAL : POLICY.OPEN;
    this._saveIndex();
    this.io.to(room(projectId)).emit(S2C.PROJECT_POLICY, { projectId, policy: meta.policy });
    return { ok: true };
  }

  clear(socket, { projectId }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    const store = this.loaded.get(projectId);
    if (!store) return { ok: false, reason: 'not-loaded' };
    store.clear();
    this.io.to(room(projectId)).emit(S2C.PROJECT_RESET, { projectId, bricks: [] });
    this._persist(projectId, store);
    return { ok: true };
  }

  async delete(socket, { projectId }) {
    const meta = this._asCreator(socket, projectId);
    if (meta.error) return meta.error;
    this.io.to(room(projectId)).emit(S2C.PROJECT_DELETED, { projectId });
    // Kick everyone out of the room, then forget the project.
    this.io.in(room(projectId)).socketsLeave(room(projectId));
    this.metas.delete(projectId);
    this.loaded.delete(projectId);
    this.presence.delete(projectId);
    this.pending.delete(projectId);
    await persistence.deleteWorld(projectId);
    await this._saveIndex();
    return { ok: true };
  }

  // Resolve meta and verify the socket is its creator. Returns the meta object
  // (mutable) or { error: {...} }.
  _asCreator(socket, projectId) {
    const meta = this.metas.get(projectId);
    if (!meta) return { error: { ok: false, reason: 'no-project' } };
    if (!socket.username || socket.username !== meta.creator) {
      return { error: { ok: false, reason: 'forbidden' } };
    }
    return meta;
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

  // ---- presence ----

  _addPresence(socket, projectId) {
    if (!socket.data.presentIn) socket.data.presentIn = new Set();
    if (socket.data.presentIn.has(projectId)) return; // idempotent per socket
    socket.data.presentIn.add(projectId);
    let m = this.presence.get(projectId);
    if (!m) this.presence.set(projectId, (m = new Map()));
    m.set(socket.username, (m.get(socket.username) || 0) + 1);
    this._broadcastMembers(projectId);
  }

  _removePresence(socket, projectId) {
    if (!socket.data.presentIn?.has(projectId)) return;
    socket.data.presentIn.delete(projectId);
    const m = this.presence.get(projectId);
    if (!m) return;
    const c = (m.get(socket.username) || 0) - 1;
    if (c <= 0) m.delete(socket.username);
    else m.set(socket.username, c);
    this._broadcastMembers(projectId);
  }

  _presentList(projectId) {
    return [...(this.presence.get(projectId)?.keys() || [])];
  }

  _broadcastMembers(projectId) {
    this.io.to(room(projectId)).emit(S2C.MEMBERS_UPDATE, {
      projectId, members: this._presentList(projectId),
    });
  }

  handleDisconnect(socket) {
    for (const projectId of [...(socket.data.presentIn || [])]) {
      this._removePresence(socket, projectId);
    }
  }

  // ---- pending requests ----

  _addPending(projectId, username) {
    let s = this.pending.get(projectId);
    if (!s) this.pending.set(projectId, (s = new Set()));
    s.add(username);
  }

  _removePending(projectId, username) {
    this.pending.get(projectId)?.delete(username);
  }

  _pendingList(projectId) {
    return [...(this.pending.get(projectId) || [])];
  }

  _persist(projectId, store) {
    persistence.saveWorldDebounced(projectId, () => store.serialize());
  }
}
