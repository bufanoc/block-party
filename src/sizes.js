// Baseplate size presets. Same stud pitch (1 unit) everywhere — a bigger world
// just has MORE studs, never bigger ones, so the grid always looks the same and
// you zoom in to add detail with small pieces.
//
// `heavy: true` sizes are gated until the instancing perf pass (piece B), since
// thousands of separate brick meshes bog down rendering on weak/no-GPU clients.
export const WORLD_SIZES = [
  { id: 'small',   name: 'Small',   grid: 32,  blurb: 'A cozy build (the classic baseplate)' },
  { id: 'medium',  name: 'Medium',  grid: 48,  blurb: 'Room for a bigger build' },
  { id: 'large',   name: 'Large',   grid: 64,  blurb: 'A street or small scene' },
  { id: 'village', name: 'Village', grid: 96,  blurb: 'A detailed town', heavy: true },
  { id: 'world',   name: 'World',   grid: 128, blurb: 'A whole village of buildings', heavy: true },
];

export const SIZE_BY_ID = Object.fromEntries(WORLD_SIZES.map((s) => [s.id, s]));

// Sizes offered in the UI right now (the rest unlock with the perf pass).
export const AVAILABLE_SIZES = WORLD_SIZES.filter((s) => !s.heavy);

export const DEFAULT_SIZE_ID = 'small';
export const DEFAULT_GRID = SIZE_BY_ID[DEFAULT_SIZE_ID].grid;

// Classic LEGO baseplate green.
export const DEFAULT_BASE_COLOR = '#00852b';

// Resolve a size id to a grid dimension, falling back to the default.
export function gridFor(sizeId) {
  return SIZE_BY_ID[sizeId]?.grid ?? DEFAULT_GRID;
}

// Validate a "#rrggbb" color string.
export function isHexColor(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}
