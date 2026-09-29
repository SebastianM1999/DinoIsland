// Rock shapes shared by the rock meshes (client) and the walkable rock surface
// (client + server). Every rock variant is a table of rings around its centre:
// ring k at angle j has a radius and a height. The client builds the mesh from
// exactly these vertices and the collision reads the same table, so the hitbox
// is the visible rock – including the vertical walls of stepped rocks.


/** Angles per ring (enough for a smooth outline; collision uses the same table). */
const SIDES = 24;
const TAU = Math.PI * 2;

/** Pebbles up to this scale are decoration only (walk straight through). */
export const PEBBLE_SCALE = 0.45;

/**
 * Variant profiles in unit space (radius ≈ 1): rings [radius, height, wall?].
 * `wall` marks a (near) vertical step from the previous ring: standing there
 * counts as the upper level, so a low step can be walked up and a high one
 * needs a jump.
 * `sx/sz` stretch the rock; `wob` = outline irregularity; `tierWob` = how much
 * each ledge wanders on its own.
 */
const dome = (H, cut, rs) => rs.map((r) => {
  let y = H * Math.sqrt(Math.max(0, 1 - r * r));
  if (y > cut) y = cut + (y - cut) * 0.2;
  return [r, y];
});
const tiers = (levels, bevel = 0.04) => {
  // levels: [outer radius, height] from the top tier outward
  const rings = [[0, levels[0][1]]];
  levels.forEach(([r, h], i) => {
    rings.push([r - bevel, h]);                     // flat top up to the ledge
    const next = levels[i + 1];
    if (next) rings.push([r, next[1], true]);       // wall down to the next ledge
  });
  return rings;
};
export const ROCK_VARIANTS = [
  // 0 rounded boulder
  { rings: dome(0.72, 0.52, [0, 0.3, 0.55, 0.74, 0.88, 0.97]), sx: 1, sz: 1, wob: 0.13, tierWob: 0.05 },
  // 1 chunky block
  { rings: dome(0.9, 0.6, [0, 0.42, 0.7, 0.86, 0.96]), sx: 0.95, sz: 1.05, wob: 0.12, tierWob: 0.05 },
  // 2 flat slab
  { rings: dome(0.5, 0.32, [0, 0.4, 0.7, 0.88, 0.98]), sx: 1.12, sz: 0.88, wob: 0.14, tierWob: 0.05 },
  // 3 stepped rock: three ledges
  { rings: tiers([[0.36, 1.0], [0.66, 0.68], [0.95, 0.34]]), sx: 1.05, sz: 0.95, wob: 0.12, tierWob: 0.1 },
  // 4 rock formation: five ledges, climbable step by step
  { rings: tiers([[0.22, 1.0], [0.4, 0.8], [0.57, 0.6], [0.74, 0.4], [0.93, 0.2]], 0.025), sx: 1.15, sz: 0.9, wob: 0.18, tierWob: 0.12 },
];
/** How deep the skirt below the outer ring reaches (unit), so slopes show no gap. */
const SKIRT = [0.3, 0.3, 0.25, 0.35, 0.3];

const tables = new Map();
/**
 * Ring table of a variant: { rad[k][j], h[k][j], wall[k] } in unit space
 * (before the variant stretch sx/sz and the instance scale).
 */
export function rockTable(variant) {
  let t = tables.get(variant);
  if (t) return t;
  const v = ROCK_VARIANTS[variant];
  const seed = 31 + variant * 17;
  // lobed outline shared by all rings + an own wobble per ring (ledges wander)
  const outline = [];
  for (let j = 0; j < SIDES; j++) {
    const a = (j / SIDES) * TAU;
    // smooth lobes only (no per-vertex noise) so the outline reads as a rounded stone
    outline.push(1 + v.wob * (Math.sin(2 * a + variant) * 0.6 + Math.sin(3 * a + variant * 2) * 0.4 + Math.sin(5 * a + seed) * 0.22));
  }
  const rad = [], h = [], wall = [];
  v.rings.forEach(([r, y, isWall], k) => {
    const rr = [], hh = [];
    for (let j = 0; j < SIDES; j++) {
      // walls keep the radius of the ledge above them so they stay vertical
      const key = isWall ? k - 1 : k;
      const a = (j / SIDES) * TAU;
      const wobble = r === 0 ? 0 : (Math.sin(a * 3 + key * 1.7 + seed) * 0.6 + Math.sin(a * 5 - key * 2.3) * 0.4) * v.tierWob;
      rr.push(r * outline[j] * (1 + wobble));
      hh.push(y + (r === 0 ? 0 : Math.sin(a * 2 + k * 1.3 + seed) * 0.015));
    }
    if (isWall) for (let j = 0; j < SIDES; j++) rr[j] = Math.max(rr[j], rad[k - 1][j] + 0.004);
    else if (k > 0) for (let j = 0; j < SIDES; j++) rr[j] = Math.max(rr[j], rad[k - 1][j] + 0.02);
    rad.push(rr); h.push(hh); wall.push(!!isWall);
  });
  // skirt: straight down below the ground
  const last = rad[rad.length - 1];
  rad.push(last.map((r) => r + 0.03));
  h.push(last.map(() => -SKIRT[variant]));
  wall.push(false);
  t = { rad, h, wall, sides: SIDES, sx: v.sx, sz: v.sz, top: Math.max(...h[0]) };
  tables.set(variant, t);
  return t;
}

/**
 * Instance transform of a layout rock (shared by mesh and surface).
 * Adds fx/fy/fz (axis scales), by (base y), R (footprint radius), top.
 */
export function placeRock(r, terrain) {
  const slope = terrain.slopeAt(r.x, r.z);
  const t = rockTable(r.variant);
  r.fx = r.scale * (1 + (r.sx - 1.1) * 0.4) * t.sx;
  r.fz = r.scale * (1 + (r.sz - 1.05) * 0.4) * t.sz;
  r.fy = r.scale * (0.85 + 0.3 * ((r.id * 0.618) % 1)) * (r.sy ?? 1);
  r.by = r.y - r.scale * (0.12 + Math.min(0.35, slope * 0.3)) * (r.sink ?? 1);
  const maxRad = Math.max(...t.rad[t.rad.length - 2]);
  r.R = maxRad * Math.max(r.fx, r.fz);
  r.top = r.by + t.top * r.fy;
  return r;
}

const out = { h: -Infinity, slope: 0, ledge: -Infinity };
/**
 * Rock surface at world (x, z): { h: world height of the mesh surface or -Infinity,
 * slope: tan of the surface there, ledge: the height you have to climb to get
 * here – at a step wall that is the upper ledge (slope 0: a step, not a slope) }.
 * Interpolates the same vertices the mesh is built from.
 */
export function rockSurfaceAt(r, x, z) {
  out.h = -Infinity; out.slope = 0; out.ledge = -Infinity;
  const dx = x - r.x, dz = z - r.z;
  if (dx * dx + dz * dz > r.R * r.R) return out;
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  // world -> rock local (inverse yaw, then inverse scale); the mesh uses the same axes
  const lx = (dx * c - dz * s) / r.fx, lz = (dx * s + dz * c) / r.fz;
  const t = rockTable(r.variant);
  let a = Math.atan2(lz, lx);
  if (a < 0) a += TAU;
  const j0 = Math.floor((a / TAU) * t.sides) % t.sides, j1 = (j0 + 1) % t.sides;
  const d = Math.hypot(lx, lz);
  const ux = d > 1e-9 ? lx / d : 1, uz = d > 1e-9 ? lz / d : 0;
  const a0 = (j0 / t.sides) * TAU, a1 = (j1 / t.sides) * TAU;
  const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
  // Where the ray from the centre crosses ring k's straight mesh edge: radius + height there.
  let ringR = 0, ringH = 0;
  const ring = (k) => {
    const p0x = t.rad[k][j0] * c0, p0z = t.rad[k][j0] * s0, p1x = t.rad[k][j1] * c1, p1z = t.rad[k][j1] * s1;
    const ex = p1x - p0x, ez = p1z - p0z;
    const den = ux * ez - uz * ex;
    const f = Math.abs(den) > 1e-9 ? Math.min(1, Math.max(0, -(ux * p0z - uz * p0x) / den)) : 0;
    ringR = Math.hypot(p0x + ex * f, p0z + ez * f);
    ringH = t.h[k][j0] + (t.h[k][j1] - t.h[k][j0]) * f;
  };
  const rings = t.rad.length - 1; // the skirt is not walkable
  let prevR = 0, prevH = t.h[0][0];
  for (let k = 1; k < rings; k++) {
    ring(k);
    const rk = ringR, hk = ringH;
    if (d <= rk) {
      const span = rk - prevR;
      const f = span > 1e-6 ? (d - prevR) / span : 0;
      out.h = r.by + (prevH + (hk - prevH) * f) * r.fy;
      if (t.wall[k]) {
        out.ledge = r.by + prevH * r.fy;
        return out;
      }
      out.ledge = out.h;
      // slope in world units: height change over the radial distance
      out.slope = span > 1e-6 ? Math.abs(hk - prevH) * r.fy / (span * Math.min(r.fx, r.fz)) : 0;
      return out;
    }
    prevR = rk; prevH = hk;
  }
  return out;
}

/** World height of the rock top at (x, z), or -Infinity outside it. */
export const rockHeightAt = (r, x, z) => rockSurfaceAt(r, x, z).h;
