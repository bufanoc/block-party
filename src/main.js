import * as THREE from 'three';
import { createScene } from './scene.js';
import { BrickStore, footprintSize, GRID } from './placement.js';
import { PIECE_BY_ID, PLATE_H } from './bricks/catalog.js';
import { pieceGeometry, materialFor } from './bricks/geometry.js';
import { buildUI } from './ui/palette.js';

const SAVE_KEY = 'brick-builder-save-v1';

const canvas = document.getElementById('scene');
const { renderer, scene, camera, controls, ground } = createScene(canvas);

const store = new BrickStore();
const brickMeshes = new Map(); // brick id -> mesh

const state = {
  pieceId: 'b2x4',
  colorId: 'red',
  rot: 0,
  hover: null, // {x, z, level} or null
};

// ---------- mesh management ----------

function addBrickMesh(brick) {
  const piece = PIECE_BY_ID[brick.pieceId];
  const { w, d } = footprintSize(piece, brick.rot);
  const mesh = new THREE.Mesh(pieceGeometry(piece), materialFor(brick.colorId));
  mesh.position.set(brick.x + w / 2, brick.level * PLATE_H, brick.z + d / 2);
  mesh.rotation.y = brick.rot * (Math.PI / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.brickId = brick.id;
  scene.add(mesh);
  brickMeshes.set(brick.id, mesh);
}

function removeBrickMesh(id) {
  const mesh = brickMeshes.get(id);
  if (!mesh) return;
  scene.remove(mesh);
  brickMeshes.delete(id);
}

function syncAfterChange() {
  ui.setCount(store.bricks.size);
  localStorage.setItem(SAVE_KEY, store.serialize());
  updateGhost();
}

// ---------- ghost preview ----------

const ghostMat = new THREE.MeshStandardMaterial({
  transparent: true, opacity: 0.55, roughness: 0.35,
});
const ghost = new THREE.Mesh(undefined, ghostMat);
ghost.visible = false;
scene.add(ghost);

function refreshGhostShape() {
  ghost.geometry = pieceGeometry(PIECE_BY_ID[state.pieceId]);
  ghost.rotation.y = state.rot * (Math.PI / 2);
  updateGhost();
}

function updateGhost() {
  const h = state.hover;
  if (!h) { ghost.visible = false; return; }
  const piece = PIECE_BY_ID[state.pieceId];
  const level = store.levelFor(piece, h.x, h.z, state.rot);
  if (level < 0) { ghost.visible = false; return; }
  const { w, d } = footprintSize(piece, state.rot);
  ghost.position.set(h.x + w / 2, level * PLATE_H + 0.001, h.z + d / 2);
  ghostMat.color.set(materialFor(state.colorId).color);
  ghost.visible = true;
}

// ---------- raycasting ----------

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function raycast(clientX, clientY) {
  pointerNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const targets = [ground, ...brickMeshes.values()];
  return raycaster.intersectObjects(targets, false)[0] ?? null;
}

// Convert a ray hit into an anchor cell for the current piece, nudging
// along the surface normal so side hits land in the adjacent column.
function hoverFromHit(hit) {
  const piece = PIECE_BY_ID[state.pieceId];
  const { w, d } = footprintSize(piece, state.rot);
  const n = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : new THREE.Vector3(0, 1, 0);
  const p = hit.point.clone().addScaledVector(n, 0.01);
  let x = Math.floor(p.x) - Math.floor((w - 1) / 2);
  let z = Math.floor(p.z) - Math.floor((d - 1) / 2);
  x = Math.max(0, Math.min(GRID - w, x));
  z = Math.max(0, Math.min(GRID - d, z));
  return { x, z };
}

// ---------- pointer input (click vs. orbit-drag) ----------

const press = { x: 0, y: 0, button: -1, moved: false };

canvas.addEventListener('pointerdown', (e) => {
  press.x = e.clientX;
  press.y = e.clientY;
  press.button = e.button;
  press.moved = false;
});

canvas.addEventListener('pointermove', (e) => {
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
  const hit = raycast(e.clientX, e.clientY);
  state.hover = hit ? hoverFromHit(hit) : null;
  updateGhost();
});

canvas.addEventListener('pointerup', (e) => {
  if (press.moved || e.button !== press.button) return; // it was an orbit drag

  if (e.button === 0) {
    // place
    const hit = raycast(e.clientX, e.clientY);
    if (!hit) return;
    const { x, z } = hoverFromHit(hit);
    const brick = store.place(state.pieceId, state.colorId, x, z, state.rot);
    if (brick) {
      addBrickMesh(brick);
      syncAfterChange();
    }
  } else if (e.button === 2) {
    // delete
    const hit = raycast(e.clientX, e.clientY);
    const id = hit?.object.userData.brickId;
    if (id && store.remove(id)) {
      removeBrickMesh(id);
      syncAfterChange();
    }
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Right-drag pans by default in OrbitControls; keep it, deletion is click-only.

// ---------- actions ----------

function rotatePiece() {
  state.rot = (state.rot + 1) % 4;
  refreshGhostShape();
}

function undo() {
  const diff = store.undo();
  if (!diff) return;
  for (const b of diff.removed) removeBrickMesh(b.id);
  for (const b of diff.added) addBrickMesh(b);
  syncAfterChange();
}

function clearAll() {
  if (store.bricks.size && !confirm('Remove all bricks?')) return;
  for (const b of store.clear()) removeBrickMesh(b.id);
  syncAfterChange();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') rotatePiece();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  }
});

// ---------- UI ----------

const ui = buildUI({
  onPiece: (id) => {
    state.pieceId = id;
    ui.setActivePiece(id);
    refreshGhostShape();
  },
  onColor: (id) => {
    state.colorId = id;
    ui.setActiveColor(id);
    updateGhost();
  },
  onRotate: rotatePiece,
  onUndo: undo,
  onClear: clearAll,
});

ui.setActivePiece(state.pieceId);
ui.setActiveColor(state.colorId);

// ---------- restore save ----------

const saved = localStorage.getItem(SAVE_KEY);
if (saved) {
  for (const brick of store.load(saved)) addBrickMesh(brick);
}
ui.setCount(store.bricks.size);
refreshGhostShape();

// ---------- render loop ----------

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
