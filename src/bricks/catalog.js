// LEGO system geometry, normalized so 1 unit = one stud pitch (8 mm).
export const PLATE_H = 0.4;   // plate height: 3.2 mm / 8 mm
export const STUD_R = 0.3;    // stud radius: 2.4 mm / 8 mm
export const STUD_H = 0.22;   // stud height: ~1.8 mm / 8 mm

// w/d are footprint in studs, h is height in plates (brick = 3 plates).
// tile: no studs on top. slope: 45-degree wedge, studs on back row only.
export const PIECES = [
  // --- Bricks ---
  { id: 'b1x1', name: '1×1', group: 'Bricks', w: 1, d: 1, h: 3 },
  { id: 'b1x2', name: '1×2', group: 'Bricks', w: 2, d: 1, h: 3 },
  { id: 'b1x3', name: '1×3', group: 'Bricks', w: 3, d: 1, h: 3 },
  { id: 'b1x4', name: '1×4', group: 'Bricks', w: 4, d: 1, h: 3 },
  { id: 'b1x6', name: '1×6', group: 'Bricks', w: 6, d: 1, h: 3 },
  { id: 'b1x8', name: '1×8', group: 'Bricks', w: 8, d: 1, h: 3 },
  { id: 'b2x2', name: '2×2', group: 'Bricks', w: 2, d: 2, h: 3 },
  { id: 'b2x3', name: '2×3', group: 'Bricks', w: 3, d: 2, h: 3 },
  { id: 'b2x4', name: '2×4', group: 'Bricks', w: 4, d: 2, h: 3 },
  { id: 'b2x6', name: '2×6', group: 'Bricks', w: 6, d: 2, h: 3 },
  { id: 'b2x8', name: '2×8', group: 'Bricks', w: 8, d: 2, h: 3 },

  // --- Plates ---
  { id: 'p1x1', name: '1×1', group: 'Plates', w: 1, d: 1, h: 1 },
  { id: 'p1x2', name: '1×2', group: 'Plates', w: 2, d: 1, h: 1 },
  { id: 'p1x4', name: '1×4', group: 'Plates', w: 4, d: 1, h: 1 },
  { id: 'p2x2', name: '2×2', group: 'Plates', w: 2, d: 2, h: 1 },
  { id: 'p2x4', name: '2×4', group: 'Plates', w: 4, d: 2, h: 1 },
  { id: 'p2x6', name: '2×6', group: 'Plates', w: 6, d: 2, h: 1 },
  { id: 'p4x4', name: '4×4', group: 'Plates', w: 4, d: 4, h: 1 },
  { id: 'p6x6', name: '6×6', group: 'Plates', w: 6, d: 6, h: 1 },

  // --- Tiles (smooth, no studs) ---
  { id: 't1x2', name: '1×2', group: 'Tiles', w: 2, d: 1, h: 1, tile: true },
  { id: 't2x2', name: '2×2', group: 'Tiles', w: 2, d: 2, h: 1, tile: true },

  // --- Slopes (45 degrees) ---
  { id: 's1x2', name: '1×2 45°', group: 'Slopes', w: 1, d: 2, h: 3, slope: true },
  { id: 's2x2', name: '2×2 45°', group: 'Slopes', w: 2, d: 2, h: 3, slope: true },
];

export const PIECE_BY_ID = Object.fromEntries(PIECES.map(p => [p.id, p]));

// Classic LEGO color palette (official-ish hex values).
export const COLORS = [
  { id: 'red',    name: 'Red',         hex: 0xc91a09 },
  { id: 'blue',   name: 'Blue',        hex: 0x0055bf },
  { id: 'yellow', name: 'Yellow',      hex: 0xf2cd37 },
  { id: 'green',  name: 'Green',       hex: 0x237841 },
  { id: 'white',  name: 'White',       hex: 0xf4f4f4 },
  { id: 'black',  name: 'Black',       hex: 0x1b2a34 },
  { id: 'lgray',  name: 'Light Gray',  hex: 0xa0a5a9 },
  { id: 'dgray',  name: 'Dark Gray',   hex: 0x6c6e68 },
  { id: 'orange', name: 'Orange',      hex: 0xfe8a18 },
  { id: 'tan',    name: 'Tan',         hex: 0xe4cd9e },
  { id: 'brown',  name: 'Brown',       hex: 0x582a12 },
  { id: 'lime',   name: 'Lime',        hex: 0xbbe90b },
];

export const COLOR_BY_ID = Object.fromEntries(COLORS.map(c => [c.id, c]));
