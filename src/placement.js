import { PIECE_BY_ID } from './bricks/catalog.js';
import { DEFAULT_GRID } from './sizes.js';

// Default baseplate size in studs (used by solo mode and as a fallback).
export const GRID = DEFAULT_GRID;

// Footprint of a piece at rotation r (0..3): odd rotations swap w/d.
export function footprintSize(piece, rot) {
  return rot % 2 ? { w: piece.d, d: piece.w } : { w: piece.w, d: piece.d };
}

// Holds placed bricks plus a per-cell height map (in plate units) so new
// pieces stack on whatever is highest under their footprint. The grid size is
// per-project (the same stud pitch everywhere — a bigger world just has more
// cells), so the same class backs a 32×32 sandbox or a 128×128 world.
export class BrickStore {
  constructor(gridSize = DEFAULT_GRID) {
    this.grid = gridSize;
    this.bricks = new Map();   // id -> {id, pieceId, colorId, x, z, rot, level}
    this.heights = new Int16Array(gridSize * gridSize);
    this.nextId = 1;
    this.undoStack = [];       // [{type: 'add'|'remove', brick}]
  }

  levelFor(piece, x, z, rot) {
    const { w, d } = footprintSize(piece, rot);
    const G = this.grid;
    if (x < 0 || z < 0 || x + w > G || z + d > G) return -1; // out of bounds
    let level = 0;
    for (let i = x; i < x + w; i++)
      for (let j = z; j < z + d; j++)
        level = Math.max(level, this.heights[i * G + j]);
    return level;
  }

  place(pieceId, colorId, x, z, rot) {
    const piece = PIECE_BY_ID[pieceId];
    const level = this.levelFor(piece, x, z, rot);
    if (level < 0) return null;
    const brick = { id: this.nextId++, pieceId, colorId, x, z, rot, level };
    this.bricks.set(brick.id, brick);
    this.#raise(brick);
    this.undoStack.push({ type: 'add', brick });
    return brick;
  }

  remove(id) {
    const brick = this.bricks.get(id);
    if (!brick) return null;
    this.bricks.delete(id);
    this.#rebuildHeights();
    this.undoStack.push({ type: 'remove', brick });
    return brick;
  }

  // Returns {added: [brick], removed: [brick]} to sync meshes, or null.
  undo() {
    const action = this.undoStack.pop();
    if (!action) return null;
    if (action.type === 'add') {
      this.bricks.delete(action.brick.id);
      this.#rebuildHeights();
      return { added: [], removed: [action.brick] };
    } else {
      this.bricks.set(action.brick.id, action.brick);
      this.#rebuildHeights();
      return { added: [action.brick], removed: [] };
    }
  }

  clear() {
    const removed = [...this.bricks.values()];
    this.bricks.clear();
    this.heights.fill(0);
    this.undoStack = [];
    return removed;
  }

  #raise(brick) {
    const piece = PIECE_BY_ID[brick.pieceId];
    const { w, d } = footprintSize(piece, brick.rot);
    const G = this.grid;
    const top = brick.level + piece.h;
    for (let i = brick.x; i < brick.x + w; i++)
      for (let j = brick.z; j < brick.z + d; j++)
        this.heights[i * G + j] = Math.max(this.heights[i * G + j], top);
  }

  #rebuildHeights() {
    this.heights.fill(0);
    for (const brick of this.bricks.values()) this.#raise(brick);
  }

  serialize() {
    return JSON.stringify({ v: 1, bricks: [...this.bricks.values()] });
  }

  // Returns the list of restored bricks (meshes are created by the caller).
  load(json) {
    let data;
    try { data = JSON.parse(json); } catch { return []; }
    if (!data || data.v !== 1 || !Array.isArray(data.bricks)) return [];
    this.clear();
    for (const b of data.bricks) {
      if (!PIECE_BY_ID[b.pieceId]) continue;
      this.bricks.set(b.id, b);
      this.nextId = Math.max(this.nextId, b.id + 1);
      this.#raise(b);
    }
    return [...this.bricks.values()];
  }
}
