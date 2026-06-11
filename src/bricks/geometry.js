import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLATE_H, STUD_R, STUD_H, COLOR_BY_ID } from './catalog.js';

// All piece geometries are centered on x/z, with y running 0..height.
// Footprint extents: x in [-w/2, w/2], z in [-d/2, d/2].

const geoCache = new Map();
const matCache = new Map();

export function pieceGeometry(piece) {
  let geo = geoCache.get(piece.id);
  if (!geo) {
    geo = piece.slope ? slopeGeometry(piece) : boxGeometry(piece);
    geoCache.set(piece.id, geo);
  }
  return geo;
}

export function materialFor(colorId) {
  let mat = matCache.get(colorId);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: COLOR_BY_ID[colorId].hex,
      roughness: 0.35,
      metalness: 0.0,
    });
    matCache.set(colorId, mat);
  }
  return mat;
}

function stud(x, z, topY, segments = 14) {
  const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, segments);
  g.translate(x, topY + STUD_H / 2, z);
  return g;
}

// Stud center for column i of n: -n/2 + 0.5 + i
const studPos = (i, n) => -n / 2 + 0.5 + i;

function boxGeometry(piece) {
  const { w, d, h } = piece;
  const height = h * PLATE_H;

  const body = new THREE.BoxGeometry(w, height, d);
  body.translate(0, height / 2, 0);

  const parts = [body];
  if (!piece.tile) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++)
        parts.push(stud(studPos(i, w), studPos(j, d), height));
  }
  return mergeGeometries(parts);
}

// 45-degree slope: back row (1 stud deep) at full height with studs,
// face sloping down to a small lip at the front edge.
function slopeGeometry(piece) {
  const { w, d, h } = piece;
  const H = h * PLATE_H;
  const lip = PLATE_H / 2;

  // Profile in the (z, y) plane; back of the piece is at z = -d/2.
  // Shape is built in (u, v) with u = -z so that after rotateY(PI/2)
  // the extruded x-axis maps back onto world z correctly.
  const pts = [
    [-(-d / 2), H],       // back top
    [-(-d / 2 + 1), H],   // top front edge of back row
    [-(d / 2), lip],      // front lip top
    [-(d / 2), 0],        // front bottom
    [-(-d / 2), 0],       // back bottom
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();

  const body = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  body.rotateY(Math.PI / 2);     // extrusion axis -> world x, profile u -> world -z
  body.translate(-w / 2, 0, 0);  // center on x

  const parts = [body];
  for (let i = 0; i < w; i++)
    parts.push(stud(studPos(i, w), -d / 2 + 0.5, H));

  // ExtrudeGeometry is non-indexed while CylinderGeometry is indexed;
  // mergeGeometries requires them to match.
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
}

// Green baseplate with a full grid of studs (visual only, not raycast).
export function baseplateGeometry(size) {
  const base = new THREE.BoxGeometry(size, PLATE_H / 2, size);
  base.translate(size / 2, -PLATE_H / 4, size / 2);

  const parts = [base];
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 8);
      g.translate(i + 0.5, STUD_H / 2, j + 0.5);
      parts.push(g);
    }
  return mergeGeometries(parts);
}
