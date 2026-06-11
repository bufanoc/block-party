import { PIECES, COLORS } from '../bricks/catalog.js';

// Builds the piece/color palette and toolbar bindings.
// Returns setters so main.js can keep the UI in sync with state.
export function buildUI({ onPiece, onColor, onRotate, onUndo, onClear }) {
  const piecesEl = document.getElementById('pieces');
  const colorsEl = document.getElementById('colors');
  const countEl = document.getElementById('count');

  // Pieces, grouped
  const groups = [...new Set(PIECES.map(p => p.group))];
  const pieceButtons = new Map();
  for (const group of groups) {
    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = group;
    piecesEl.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'piece-grid';
    for (const piece of PIECES.filter(p => p.group === group)) {
      const btn = document.createElement('button');
      btn.className = 'piece-btn';
      btn.textContent = piece.name;
      btn.addEventListener('click', () => onPiece(piece.id));
      pieceButtons.set(piece.id, btn);
      grid.appendChild(btn);
    }
    piecesEl.appendChild(grid);
  }

  // Colors
  const colorButtons = new Map();
  for (const color of COLORS) {
    const btn = document.createElement('button');
    btn.className = 'color-btn';
    btn.title = color.name;
    btn.style.background = '#' + color.hex.toString(16).padStart(6, '0');
    btn.addEventListener('click', () => onColor(color.id));
    colorButtons.set(color.id, btn);
    colorsEl.appendChild(btn);
  }

  document.getElementById('btn-rotate').addEventListener('click', onRotate);
  document.getElementById('btn-undo').addEventListener('click', onUndo);
  document.getElementById('btn-clear').addEventListener('click', onClear);

  return {
    setActivePiece(id) {
      for (const [pid, btn] of pieceButtons) btn.classList.toggle('active', pid === id);
    },
    setActiveColor(id) {
      for (const [cid, btn] of colorButtons) btn.classList.toggle('active', cid === id);
    },
    setCount(n) {
      countEl.textContent = `${n} brick${n === 1 ? '' : 's'}`;
    },
  };
}
