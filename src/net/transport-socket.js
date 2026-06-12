import { Emitter } from './emitter.js';
import { BrickStore } from '../placement.js';
import { C2S, S2C } from './protocol.js';
import { gridFor, DEFAULT_GRID, DEFAULT_BASE_COLOR } from '../sizes.js';

// Networked transport: the server owns the authoritative World. We send
// intents and render only when the server echoes a broadcast (apply-on-echo).
// A display-only mirror BrickStore is kept in sync so the ghost preview can
// compute stacking height over everyone's bricks.
export class SocketTransport extends Emitter {
  constructor(socket, projectId) {
    super();
    this.socket = socket;
    this.projectId = projectId;
    this.capabilities = { undo: false };
    this.meta = null;                  // project meta (name, creator, policy, frozen, size, baseColor)
    this.gridSize = DEFAULT_GRID;       // resolved from meta.size on join
    this.baseColor = DEFAULT_BASE_COLOR;
    this.mirror = new BrickStore(DEFAULT_GRID);
    this._bricks = new Map();          // id -> authoritative brick
    this._snapshot = { bricks: [], frozen: false };
    this._listeners = [];              // [event, fn] for teardown
  }

  // ---- lifecycle ----

  init() {
    this._bind(S2C.BRICK_PLACED, (d) => {
      if (d.projectId !== this.projectId) return;
      this._bricks.set(d.brick.id, d.brick);
      this._rebuildMirror();
      this.emit('placed', d.brick);
    });
    this._bind(S2C.BRICK_REMOVED, (d) => {
      if (d.projectId !== this.projectId) return;
      this._bricks.delete(d.id);
      this._rebuildMirror();
      this.emit('removed', d.id);
    });
    this._bind(S2C.BRICK_ROTATED, (d) => {
      if (d.projectId !== this.projectId) return;
      this._bricks.set(d.brick.id, d.brick);
      this._rebuildMirror();
      this.emit('rotated', d.brick);
    });
    this._bind(S2C.PROJECT_RESET, (d) => {
      if (d.projectId !== this.projectId) return;
      this._setBricks(d.bricks || []);
      this.emit('reset', [...this._bricks.values()]);
    });
    this._bind(S2C.PROJECT_FROZEN, (d) => {
      if (d.projectId !== this.projectId) return;
      this._snapshot.frozen = !!d.frozen;
      this.emit('frozen', this._snapshot.frozen);
    });

    // Re-join after a reconnect so we resync the world.
    this._bind('connect', () => { this._join(); }, /*onSocketDirectly*/ true);

    return this._join();
  }

  _join() {
    return new Promise((resolve) => {
      this.socket.emit(C2S.PROJECT_JOIN, { projectId: this.projectId }, (res) => {
        if (res?.ok && res.snapshot) {
          this.meta = res.meta || this.meta;
          // Size/color come from the project — size the mirror to match so the
          // ghost preview's bounds and stacking are correct.
          this.gridSize = gridFor(this.meta?.size);
          this.baseColor = this.meta?.baseColor || DEFAULT_BASE_COLOR;
          this.mirror = new BrickStore(this.gridSize);
          this._setBricks(res.snapshot.bricks || []);
          this._snapshot.frozen = !!res.snapshot.frozen;
          // On a reconnect this fires again; push the fresh world to the builder.
          this.emit('reset', [...this._bricks.values()]);
          this.emit('frozen', this._snapshot.frozen);
          resolve({ ok: true });
        } else {
          const reason = res?.reason || 'join-failed';
          // For a reconnect-time failure the builder is already listening.
          this.emit('fatal', reason);
          resolve({ ok: false, reason });
        }
      });
    });
  }

  getSnapshot() {
    return { bricks: [...this._bricks.values()], frozen: this._snapshot.frozen };
  }

  levelFor(piece, x, z, rot) {
    return this.mirror.levelFor(piece, x, z, rot);
  }

  // ---- intents (no local mutation; rendered on echo) ----

  place(pieceId, colorId, x, z, rot) {
    this.socket.emit(C2S.BRICK_PLACE, { projectId: this.projectId, pieceId, colorId, x, z, rot });
  }

  remove(id) {
    this.socket.emit(C2S.BRICK_REMOVE, { projectId: this.projectId, id });
  }

  rotate(id) {
    this.socket.emit(C2S.BRICK_ROTATE, { projectId: this.projectId, id });
  }

  clear() {
    this.socket.emit(C2S.PROJECT_CLEAR, { projectId: this.projectId });
  }

  undo() { /* no shared undo in networked mode */ }

  // ---- mirror upkeep ----

  _setBricks(bricks) {
    this._bricks = new Map(bricks.map((b) => [b.id, b]));
    this._rebuildMirror();
  }

  // Rebuild the display mirror from the authoritative set. load() keys bricks
  // by their real ids and recomputes the height map, so levelFor stays correct.
  _rebuildMirror() {
    this.mirror.load(JSON.stringify({ v: 1, bricks: [...this._bricks.values()] }));
  }

  _bind(event, fn, onSocketDirectly = false) {
    this.socket.on(event, fn);
    this._listeners.push([event, fn]);
  }

  dispose() {
    for (const [event, fn] of this._listeners) this.socket.off(event, fn);
    this._listeners = [];
    this.socket.emit(C2S.PROJECT_LEAVE, { projectId: this.projectId });
    this.clearListeners();
  }
}
