import { Emitter } from './emitter.js';
import { BrickStore } from '../placement.js';

// Solo transport: owns a local BrickStore and persists to localStorage.
// Mutations are applied synchronously and echoed as events, so the builder
// uses the exact same event-driven code path as the networked transport.
//
// Keep the legacy save key so existing solo builds are not orphaned.
const SAVE_KEY = 'brick-builder-save-v1';

export class LocalTransport extends Emitter {
  constructor() {
    super();
    this.store = new BrickStore();
    this.capabilities = { undo: true };
  }

  async init() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) this.store.load(saved);
  }

  getSnapshot() {
    return { bricks: [...this.store.bricks.values()], frozen: false };
  }

  levelFor(piece, x, z, rot) {
    return this.store.levelFor(piece, x, z, rot);
  }

  place(pieceId, colorId, x, z, rot) {
    const brick = this.store.place(pieceId, colorId, x, z, rot);
    if (!brick) return;
    this._save();
    this.emit('placed', brick);
  }

  remove(id) {
    const brick = this.store.remove(id);
    if (!brick) return;
    this._save();
    this.emit('removed', id);
  }

  // Reserved for Phase 5 (rotate a placed piece). No-op for now.
  rotate(_id) {}

  clear() {
    this.store.clear();
    this._save();
    this.emit('reset', []);
  }

  undo() {
    const diff = this.store.undo();
    if (!diff) return;
    this._save();
    for (const b of diff.removed) this.emit('removed', b.id);
    for (const b of diff.added) this.emit('placed', b);
  }

  _save() {
    localStorage.setItem(SAVE_KEY, this.store.serialize());
  }

  dispose() {
    this.clearListeners();
  }
}
