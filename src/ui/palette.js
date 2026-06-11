import { PIECES, COLORS } from '../bricks/catalog.js';

// Builds the piece/color palette and toolbar bindings inside `root`.
// Returns setters so the builder can keep the UI in sync with state.
export function buildUI(root, { onPiece, onColor, onRotate, onUndo, onClear }) {
  const piecesEl = root.querySelector('#pieces');
  const colorsEl = root.querySelector('#colors');
  const countEl = root.querySelector('#count');
  const undoBtn = root.querySelector('#btn-undo');
  const clearBtn = root.querySelector('#btn-clear');

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

  root.querySelector('#btn-rotate').addEventListener('click', onRotate);
  undoBtn.addEventListener('click', onUndo);
  clearBtn.addEventListener('click', onClear);

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
    // Hide controls that don't apply in networked mode (no shared undo).
    setUndoVisible(visible) {
      undoBtn.style.display = visible ? '' : 'none';
    },
    // Reflect a frozen project: disable build-affecting controls.
    setFrozen(frozen) {
      root.classList.toggle('frozen', frozen);
      clearBtn.disabled = frozen;
    },
  };
}
