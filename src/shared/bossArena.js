// The Boss Arena (first island): a dark volcanic islet out in the sea beside
// the boat. A rocky rim holds a lake of lava; a basalt causeway leads from the
// beach over the sea and across the lava to a plateau – the giant
// Brachiosaurus's pen with its barrier and warning (shared/grove.js; the
// plateau is layout.grove). It looks like a piece of the volcano island
// (Ashfall Isle) – a taste of what is waiting there.
//
// Everything is placed from the boat alone (no randomness), so the arena and
// its boss spawn point always sit at the same spot relative to the boat.
// Shared by client (look, terrain tint, minimap) and server (terrain, AI).
//
// Frame: u points from the causeway start out to sea (along the causeway),
// v is u turned a quarter to the side.

import { valueNoise, smoothstep, lerp, clamp } from './rng.js';
import { GROVE } from './grove.js';

export const BOSS_ARENA = {
  name: GROVE.name,
  /** Lava lake surface (m above the sea). */
  lavaLevel: 1.2,
  /** Lake bottom below the surface. */
  lakeDepth: 0.9,
  /** Lava lake radius around the islet centre. */
  lakeR: 44,
  /** The islet: rocky rim out to here, then the shore drops into the sea. */
  outerR: 62,
  /** Islet centre this far out from the causeway start: open sea between it and the island. */
  offshore: 132,
  /** Causeway width (the terrain grid is 2.7 m, so keep it >= 2 cells). */
  causewayW: 6.5,
  /** Causeway top above the lava. */
  causewayRise: 1.3,
  /**
   * The plateau in the lava: the giant's pen (the old Primeval Grove, see
   * shared/grove.js – its barrier is the plateau's edge). Radius and height.
   */
  plateauR: 26,
  plateauRise: 1.8,
  /** Plateau centre: this far past the islet centre (a wider lava crossing in front). */
  plateauShift: 6,
  /** Causeway start: this far beside the boat (m), on the beach. */
  besideBoat: 20,
};

const A = BOSS_ARENA;

/**
 * Plan the arena from the boat (plan.boat) and keep it on the side away from
 * the river mouth. Returns the arena: { side, u, v, start, center, plateau,
 * spawn, path, lava } (lava = the lava pool for plan.pools).
 */
export function planBossArena(plan) {
  const b = plan.boat;
  const candidates = [-1, 1].map((side) => {
    const start = { x: b.x - 10, z: b.z + side * A.besideBoat };
    const ul = Math.hypot(0.55, 0.83);
    const u = { x: 0.55 / ul, z: (0.83 / ul) * side };
    const center = { x: start.x + u.x * A.offshore, z: start.z + u.z * A.offshore };
    let riverGap = Infinity;
    for (const p of plan.river?.pts || []) riverGap = Math.min(riverGap, Math.hypot(p.x - center.x, p.z - center.z) - p.w / 2);
    return { side, start, u, center, riverGap };
  });
  // away from the river, else the side away from the island's middle
  candidates.sort((p, q) => (q.riverGap > A.outerR + 15) - (p.riverGap > A.outerR + 15) || q.riverGap - p.riverGap);
  const { side, start, u, center } = candidates[0];
  const v = { x: -u.z, z: u.x };
  const plateau = { x: center.x + u.x * A.plateauShift, z: center.z + u.z * A.plateauShift };
  // the boss (the giant Brachiosaurus) spawns in the middle of the plateau,
  // looking down the causeway (yaw like the player's: facing (-sin yaw, -cos yaw) = -u)
  const spawn = { x: plateau.x, z: plateau.z, yaw: Math.atan2(u.x, u.z) };
  // the causeway: over the sea, through the rim and across the lava onto the
  // plateau, a gentle S-bend
  const end = { x: plateau.x - u.x * A.plateauR * 0.8, z: plateau.z - u.z * A.plateauR * 0.8 };
  const path = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, bend = Math.sin(t * Math.PI * 2) * 5 * Math.sin(t * Math.PI);
    path.push({ x: lerp(start.x, end.x, t) + v.x * bend, z: lerp(start.z, end.z, t) + v.z * bend });
  }
  const top = A.lavaLevel + A.causewayRise;
  const plateauY = A.lavaLevel + A.plateauRise;
  spawn.y = plateauY;
  return {
    name: A.name, side, u, v, start, center, plateau, spawn, path,
    causewayY: top, plateauY, lakeR: A.lakeR, outerR: A.outerR, plateauR: A.plateauR, causewayW: A.causewayW,
    // reach/disc: the lake is found (terrain.js) and drawn (water.js) only as far
    // as the rim holds it – never out over the sea beyond
    lava: { x: center.x, z: center.z, r: A.lakeR, level: A.lavaLevel, depth: A.lakeDepth, kind: 'lava', annex: true, reach: A.lakeR + 3, disc: A.lakeR + 5 },
  };
}

/** Distance from (x, z) to the causeway centre line: { d, t } (t in [0, 1] along it). */
export function causewayQuery(a, x, z) {
  const pts = a.path;
  let bd = Infinity, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const vx = q.x - p.x, vz = q.z - p.z;
    const L2 = vx * vx + vz * vz || 1;
    const s = clamp(((x - p.x) * vx + (z - p.z) * vz) / L2, 0, 1);
    const d = Math.hypot(p.x + vx * s - x, p.z + vz * s - z);
    if (d < bd) { bd = d; bt = (i + s) / (pts.length - 1); }
  }
  return { d: bd, t: bt };
}

/**
 * Terrain of the islet on top of the island's height h at (x, z): rim, lava
 * lake bed, plateau and causeway. Far away it returns h unchanged.
 */
export function bossArenaHeight(a, x, z, h, seed = 0) {
  const dc = Math.hypot(x - a.center.x, z - a.center.z);
  const q = causewayQuery(a, x, z);
  const half = a.causewayW / 2;
  if (dc > a.outerR + 12) {
    // out over the sea only the causeway: a raised dam with steep banks
    if (q.d >= half + 6) return h;
    if (q.d < half) return a.causewayY;
    return h < a.causewayY ? lerp(a.causewayY, h, smoothstep(half, half + 2.2, q.d)) : h;
  }
  const L = A.lavaLevel, bed = L - A.lakeDepth;
  // rocky rim: jagged crest all round, softly into the sea (or the island) outside
  const ang = Math.atan2(z - a.center.z, x - a.center.x);
  const crest = L + 1.4 + 2.4 * (0.5 + 0.5 * valueNoise(Math.cos(ang) * 3.1 + 7, Math.sin(ang) * 3.1, seed + 301))
    + 0.6 * valueNoise(x * 0.18, z * 0.18, seed + 302);
  let g;
  if (dc < a.lakeR - 1.5) g = bed;
  else if (dc < a.lakeR + 3) g = lerp(bed, crest, smoothstep(a.lakeR - 1.5, a.lakeR + 3, dc));
  else g = crest;
  const out = smoothstep(a.outerR - 5, a.outerR + 6, dc);
  g = lerp(Math.max(g, dc > a.lakeR + 3 ? h : g), h, out);
  // the plateau rises out of the lava
  const dp = Math.hypot(x - a.plateau.x, z - a.plateau.z);
  if (dp < a.plateauR + 4) {
    const k = 1 - smoothstep(a.plateauR, a.plateauR + 4, dp);
    g = Math.max(g, lerp(bed, a.plateauY + 0.15 * valueNoise(x * 0.3, z * 0.3, seed + 303), k));
  }
  // the causeway: flat on top, steep banks down to the lava, a pass cut through the rim
  if (q.d < half + 6) {
    const top = a.causewayY;
    if (q.d < half) g = top;
    else if (g < top) g = lerp(top, g, smoothstep(half, half + 2.2, q.d));
    else g = lerp(top, g, smoothstep(half, half + 6, q.d));
  }
  return g;
}

/** Is (x, z) on the islet of `layout` (pad > 0 grows it)? */
export function insideBossArena(layout, x, z, pad = 0) {
  const a = layout?.bossArena;
  if (!a) return false;
  const r = a.outerR + pad;
  return (x - a.center.x) ** 2 + (z - a.center.z) ** 2 < r * r;
}
