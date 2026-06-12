import * as THREE from 'three';
import { createScene } from '../scene.js';
import { footprintSize } from '../placement.js';
import { PIECE_BY_ID, PLATE_H } from '../bricks/catalog.js';
import { pieceGeometry, materialFor } from '../bricks/geometry.js';
import { buildUI } from '../ui/palette.js';

// The builder UI markup (was previously hardcoded in index.html). Mounted
// inside the builder's container so it can be created/destroyed per view.
const TEMPLATE = `
  <canvas id="scene"></canvas>
  <div id="ui">
    <div id="toolbar">
      <button id="btn-leave" title="Back to lobby" style="display:none">← Lobby</button>
      <span id="title">Block Party</span>
      <button id="btn-rotate" title="Rotate piece (R)">⟳ Rotate</button>
      <button id="btn-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
      <button id="btn-clear" title="Remove all bricks">🗑 Clear</button>
      <span id="count">0 bricks</span>
    </div>
    <div id="palette">
      <div id="pieces"></div>
      <div id="colors"></div>
    </div>
    <div id="hint">
      Click: place &nbsp;·&nbsp; Right-click: delete &nbsp;·&nbsp; Drag: orbit &nbsp;·&nbsp; Scroll: zoom &nbsp;·&nbsp; R: rotate
    </div>
  </div>
`;

// Mounts the 3D builder into `container`, driven by `transport` (solo or
// networked). The grid size and baseplate color aren't known until the
// transport initialises (for networked projects they arrive with the join),
// so the 3D scene is built once init() resolves. Returns { unmount }.
export function mountBuilder(container, { transport, onFatal, onLeave }) {
  container.innerHTML = TEMPLATE;
  let disposed = false;
  let teardown = null;

  transport.init().then((res) => {
    if (disposed) return;
    if (res && res.ok === false) { onFatal?.(res.reason); return; }
    teardown = start(container, transport, { onFatal, onLeave });
  });

  return {
    unmount() {
      disposed = true;
      if (teardown) teardown();
      else {
        try { transport.dispose(); } catch { /* not yet wired */ }
        container.innerHTML = '';
      }
    },
  };
}

// Builds the scene + input + UI once the transport is ready. Returns an
// unmount function that tears everything down.
function start(container, transport, { onFatal, onLeave }) {
  const grid = transport.gridSize;
  const canvas = container.querySelector('#scene');
  const { renderer, scene, camera, controls, ground, dispose: disposeScene } =
    createScene(canvas, { gridSize: grid, baseColor: transport.baseColor });

  const brickMeshes = new Map(); // brick id -> mesh

  const state = {
    pieceId: 'b2x4',
    colorId: 'red',
    rot: 0,
    hover: null,   // {x, z} or null
    frozen: false,
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

  function clearAllMeshes() {
    for (const mesh of brickMeshes.values()) scene.remove(mesh);
    brickMeshes.clear();
  }

  function refreshCount() {
    ui.setCount(brickMeshes.size);
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
    if (!h || state.frozen) { ghost.visible = false; return; }
    const piece = PIECE_BY_ID[state.pieceId];
    const level = transport.levelFor(piece, h.x, h.z, state.rot);
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
    x = Math.max(0, Math.min(grid - w, x));
    z = Math.max(0, Math.min(grid - d, z));
    return { x, z };
  }

  // ---------- pointer input (click vs. orbit-drag) ----------

  const press = { x: 0, y: 0, button: -1, moved: false };

  function onPointerDown(e) {
    press.x = e.clientX;
    press.y = e.clientY;
    press.button = e.button;
    press.moved = false;
  }

  function onPointerMove(e) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
    const hit = raycast(e.clientX, e.clientY);
    state.hover = hit ? hoverFromHit(hit) : null;
    updateGhost();
  }

  function onPointerUp(e) {
    if (press.moved || e.button !== press.button) return; // it was an orbit drag
    if (state.frozen) return;

    if (e.button === 0) {
      const hit = raycast(e.clientX, e.clientY);
      if (!hit) return;
      const { x, z } = hoverFromHit(hit);
      transport.place(state.pieceId, state.colorId, x, z, state.rot);
    } else if (e.button === 2) {
      const hit = raycast(e.clientX, e.clientY);
      const id = hit?.object.userData.brickId;
      if (id) transport.remove(id);
    }
  }

  function onContextMenu(e) { e.preventDefault(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  // ---------- actions ----------

  function rotatePiece() {
    state.rot = (state.rot + 1) % 4;
    refreshGhostShape();
  }

  function undo() {
    if (transport.capabilities.undo) transport.undo();
  }

  function clearAll() {
    if (state.frozen) return;
    if (brickMeshes.size && !confirm('Remove all bricks?')) return;
    transport.clear();
  }

  function onKeyDown(e) {
    if (e.key === 'r' || e.key === 'R') rotatePiece();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------- UI ----------

  const ui = buildUI(container, {
    onPiece: (id) => { state.pieceId = id; ui.setActivePiece(id); refreshGhostShape(); },
    onColor: (id) => { state.colorId = id; ui.setActiveColor(id); updateGhost(); },
    onRotate: rotatePiece,
    onUndo: undo,
    onClear: clearAll,
  });
  ui.setActivePiece(state.pieceId);
  ui.setActiveColor(state.colorId);
  ui.setUndoVisible(transport.capabilities.undo);

  // "← Lobby" button, shown only in networked mode (when a leave handler exists).
  const leaveBtn = container.querySelector('#btn-leave');
  function onLeaveClick() { onLeave?.(); }
  if (onLeave) {
    leaveBtn.style.display = '';
    leaveBtn.addEventListener('click', onLeaveClick);
  }

  // ---------- transport events (authoritative state -> meshes) ----------

  const offs = [
    transport.on('placed', (brick) => { addBrickMesh(brick); refreshCount(); updateGhost(); }),
    transport.on('removed', (id) => { removeBrickMesh(id); refreshCount(); updateGhost(); }),
    transport.on('rotated', (brick) => { removeBrickMesh(brick.id); addBrickMesh(brick); refreshCount(); updateGhost(); }),
    transport.on('reset', (bricks) => {
      clearAllMeshes();
      for (const b of bricks) addBrickMesh(b);
      refreshCount();
      updateGhost();
    }),
    transport.on('frozen', (frozen) => {
      state.frozen = frozen;
      ui.setFrozen(frozen);
      updateGhost();
    }),
    transport.on('fatal', (reason) => { onFatal?.(reason); }),
  ];

  // ---------- initial state (transport.init() has resolved) ----------

  const snap = transport.getSnapshot();
  state.frozen = !!snap.frozen;
  ui.setFrozen(state.frozen);
  for (const b of snap.bricks) addBrickMesh(b);
  refreshCount();
  refreshGhostShape();

  // ---------- render loop ----------

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  // ---------- teardown ----------

  return function unmount() {
    renderer.setAnimationLoop(null);
    for (const off of offs) off();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    leaveBtn.removeEventListener('click', onLeaveClick);
    window.removeEventListener('keydown', onKeyDown);
    clearAllMeshes();
    disposeScene();
    transport.dispose();
    container.innerHTML = '';
  };
}
