// Rock shapes shared by the rock meshes (client) and the rock surface used for
// walking/jumping (client + server). A rock is a squashed, jittered sphere with
// a flattened top; for collision it is a height field (a small hill you can
// stand on and jump over), not an endless pillar.

/** Geometry variants: 0 = rounded boulder, 1 = chunky block, 2 = flat slab. */
export const ROCK_VARIANTS = [
  { base: 1, squash: 0.72, topCut: 0.52, stretch: 1 },
  { base: 1.02, squash: 0.88, topCut: 0.6, stretch: 0.95 },
  { base: 1, squash: 0.5, topCut: 0.32, stretch: 1.12 },
];

/** Pebbles below this scale are decoration only (walk straight through). */
export const PEBBLE_SCALE = 0.45;

/** The mesh surface is jittered; walking on a slightly smaller shape avoids hovering at the edges. */
const FOOT = 0.92;

/**
 * Instance transform of a layout rock (shared by mesh and surface).
 * Adds fx/fy/fz (axis scales), by (base y after sinking), R (footprint radius), top.
 */
export function placeRock(r, terrain) {
  const slope = terrain.slopeAt(r.x, r.z);
  const v = ROCK_VARIANTS[r.variant];
  r.fx = r.scale * (1 + (r.sx - 1.1) * 0.4);
  r.fz = r.scale * (1 + (r.sz - 1.05) * 0.4);
  r.fy = r.scale * (0.85 + 0.3 * ((r.id * 0.618) % 1)) * (r.sy ?? 1);
  r.by = r.y - r.scale * (0.12 + Math.min(0.35, slope * 0.3));
  r.R = Math.max(v.base * v.stretch * r.fx, v.base * (2 - v.stretch) * r.fz) * FOOT;
  r.top = r.by + rockLocalHeight(v, 0) * r.fy;
  return r;
}

/** Height of the (average, un-jittered) rock surface over unit-local q = normalized radius². */
function rockLocalHeight(v, q) {
  let y = v.base * v.squash * Math.sqrt(1 - q);
  if (y > v.topCut) y = v.topCut + (y - v.topCut) * 0.2;
  return y;
}

/** World height of the rock's top surface at (x, z), or -Infinity outside its footprint. */
export function rockHeightAt(r, x, z) {
  const dx = x - r.x, dz = z - r.z;
  if (dx * dx + dz * dz > r.R * r.R) return -Infinity;
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const v = ROCK_VARIANTS[r.variant];
  const lx = (dx * c - dz * s) / (r.fx * v.base * v.stretch * FOOT);
  const lz = (dx * s + dz * c) / (r.fz * v.base * (2 - v.stretch) * FOOT);
  const q = lx * lx + lz * lz;
  if (q >= 1) return -Infinity;
  return r.by + rockLocalHeight(v, q) * r.fy;
}
