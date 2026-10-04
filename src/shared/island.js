// Island generator: every level is one oblong island, generated from
// (level index, variant seed). The plan is pure data shared by client and
// server; islandHeight(plan, x, z) turns it into the heightfield.
//
// Layout of every island (x = east, z = south):
//   west tip  – beach with the hunting hut (spawn)
//   east tip  – beach with the wrecked boat (goal)
//   in between – hills / peaks (jungle) or a volcano (volcano), a river or a
//               lava flow, pools, caves, ruins, nests and meadows, plus a
//               winding trail from the hut to the boat.

import { CONFIG } from './config.js';
import { makeRng, fbm, valueNoise, clamp, smoothstep, lerp } from './rng.js';
import { levelDef } from './levels.js';
import { planBossArena, bossArenaHeight } from './bossArena.js';
import { planSwampArena, SWAMP_ARENA } from './swampArena.js';
import { BASE_PLOT_RADIUS } from './base.js';

const TAU = Math.PI * 2;

/** Terrain grid for all islands (square; the island is an ellipse inside it). */
export const WORLD = { size: CONFIG.world.size, segments: CONFIG.world.segments, seaLevel: CONFIG.world.seaLevel };

export const HUT_GROUND = 2.6;
/** Caves are disabled until they are reworked (see planIsland). */
export const CAVES_ENABLED = false;

/** Stable seed for (level, variant). */
export function islandSeed(levelIndex, variant) {
  let h = Math.imul((levelIndex + 1) | 0, 0x9e3779b1) ^ Math.imul(variant | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return (h ^ (h >>> 13)) >>> 0;
}

// ------------------------------------------------------------------ outline

/** Hourglass outline (swamp): how deep the waist pinches and how long it is (share of A). */
export const HOURGLASS = { depth: 0.6, width: 0.2 };

/**
 * Half-width (z extent) of the island's outline frame at x: B for the oval
 * islands; the hourglass pinches it to a waist around x = 0.
 */
export function halfWidthAt(plan, x) {
  if (plan.shape !== 'hourglass') return plan.B;
  return plan.B * (1 - HOURGLASS.depth * Math.exp(-((x / (HOURGLASS.width * plan.A)) ** 2)));
}

/** Inside the island's outline at normalized radius < k (roughly, ignoring coast wobble). */
export const insideOutline = (plan, x, z, k) => (x / plan.A) ** 2 + (z / halfWidthAt(plan, x)) ** 2 < k * k;

// ------------------------------------------------------------------ height pieces

/** Base land: ellipse (or hourglass) with wavy long sides, beach ring rising into lowland. */
function coastHeight(plan, x, z) {
  const { A, seed } = plan;
  const B = halfWidthAt(plan, x);
  const nx = x / A, nz = z / B;
  const ang = Math.atan2(nz, nx);
  // bays and headlands only along the long sides – the tips stay clean beaches
  const side = smoothstep(0.2, 0.55, Math.abs(Math.sin(ang)));
  const warp = 1 + side * (0.12 * valueNoise(Math.cos(ang) * 1.9 + 3, Math.sin(ang) * 1.9, seed + 1)
    + 0.06 * valueNoise(Math.cos(ang) * 5.3 + 9, Math.sin(ang) * 5.3, seed + 2));
  const d = Math.sqrt(nx * nx + nz * nz) / warp;
  const scale = B + (A - B) * Math.cos(ang) ** 2;        // meters per unit of d along this direction
  let inland = (1 - d) * scale;                           // meters from the coastline
  // the swamp arena bulges out of the waist: land all round its ring
  const sa = plan.swampArena;
  if (sa) inland = Math.max(inland, sa.r + 20 - Math.hypot(x - sa.x, z - sa.z));
  if (inland < 0) {
    const out = -inland;
    let h = -out * 0.05 - Math.max(0, out - 24) * 0.16;   // turquoise shelf, then drop-off
    h = Math.max(h, -16);
    return h + fbm(x * 0.02, z * 0.02, 2, seed + 3) * 1.1;
  }
  const t = clamp(inland / 48, 0, 1);
  const [r1, r2] = plan.lowland ?? [1.6, 2.4];
  let h = 0.35 + r1 * smoothstep(0, 0.45, t) + r2 * smoothstep(0.35, 1, t);
  h += fbm(x * 0.017, z * 0.017, 4, seed + 4) * plan.rolling * smoothstep(0.3, 1, t);
  h += fbm(x * 0.07, z * 0.07, 2, seed + 5) * 0.5 * t;
  return h;
}

/** Terraced hill / mountain with a wobbly outline. */
function hillHeight(f, x, z, seed) {
  let dx = x - f.x, dz = z - f.z;
  if (f.stretch) {                                   // elongated ridge along angle f.rot
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    dx = u / f.stretch; dz = v;
  }
  const r0 = Math.sqrt(dx * dx + dz * dz);
  if (r0 > f.radius * 1.3) return 0;
  const ang = Math.atan2(dz, dx);
  const warp = 1 + 0.2 * valueNoise(Math.cos(ang) * 2.1 + f.x * 0.01, Math.sin(ang) * 2.1, seed + 7)
    + 0.08 * valueNoise(Math.cos(ang) * 5.7, Math.sin(ang) * 5.7 + f.z * 0.01, seed + 8);
  const r = r0 / (f.radius * warp);
  if (r >= 1) return 0;
  let h = f.height * Math.pow(1 - smoothstep(f.core ?? 0.1, 1.0, r), f.shape ?? 0.8);
  h += fbm(x * 0.03, z * 0.03, 3, seed + 11) * f.rough * (1 - r);
  if (f.terrace > 0) {
    const tt = h / f.terrace;
    const fl = Math.floor(tt);
    const fr = tt - fl;
    h = f.terrace * (fl + smoothstep(f.sharp ?? 0.8, 1.0, fr)) + fr * 0.6;
  }
  return Math.max(0, h);
}

/** Volcano cone with a crater and a notch where the lava spills out. */
function volcanoHeight(v, x, z, seed) {
  const dx = x - v.x, dz = z - v.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r > v.radius * 1.15) return 0;
  const ang = Math.atan2(dz, dx);
  const ridges = 1 + 0.06 * Math.sin(ang * 7 + seed) + 0.05 * valueNoise(Math.cos(ang) * 3, Math.sin(ang) * 3, seed + 21);
  const u = clamp(r / (v.radius * ridges), 0, 1);
  // concave cone: steep near the top, spreading lava plains at the base
  let h = v.height * Math.pow(1 - u, 1.6);
  h += fbm(x * 0.04, z * 0.04, 3, seed + 22) * 3 * (1 - u);
  // gullies running down the flanks
  h -= Math.max(0, Math.sin(ang * 11 + fbm(x * 0.02, z * 0.02, 2, seed + 23) * 3)) * 2.2 * u * (1 - u) * 2;
  // crater: rim at craterR, bowl inside
  const rimH = v.height * Math.pow(1 - v.craterR / v.radius, 1.6);
  if (r < v.craterR * 1.25) {
    const k = r / v.craterR;
    const floor = rimH - v.craterDepth;
    const bowl = floor + (rimH + 1.5 - floor) * smoothstep(0.35, 1.0, k);
    h = k < 1 ? bowl : lerp(bowl, h, smoothstep(1, 1.25, k));
  }
  // notch in the rim toward the lava flow
  const notch = Math.cos(ang - v.notchAngle);
  if (notch > 0.9 && r < v.craterR * 1.8) {
    const nk = smoothstep(0.9, 1, notch) * (1 - smoothstep(v.craterR * 1.1, v.craterR * 1.8, r));
    h = lerp(h, Math.min(h, rimH - v.craterDepth * 0.55), nk);
  }
  return h;
}

/** Everything except river carving, pads and pools (used while planning). */
function naturalHeight(plan, x, z) {
  let h = coastHeight(plan, x, z);
  let hills = 0;
  for (const f of plan.hills) hills = Math.max(hills, hillHeight(f, x, z, plan.seed + f.id * 13));
  if (plan.volcano) hills = Math.max(hills, volcanoHeight(plan.volcano, x, z, plan.seed));
  // hills only rise from land
  if (h > 0.5) h += hills * smoothstep(0.5, 3, h);
  return h;
}

function poolEffect(plan, x, z, h) {
  for (const p of plan.pools) {
    if (p.kind === 'lava' && (p.crater || p.annex)) continue;   // the crater / boss arena shape their own bowls
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd > p.r * 2.6) continue;
    const rim = 1 - smoothstep(p.r * 1.2, p.r * 2.5, dd);
    h = lerp(h, Math.max(h, p.level + 0.8 + fbm(x * 0.1, z * 0.1, 2, plan.seed + 13) * 0.35), rim);
    const bowl = 1 - smoothstep(p.r * 0.55, p.r * 1.05, dd);
    h = lerp(h, p.level - p.depth, bowl);
  }
  return h;
}

/** Nearest point on the river polyline: { d, t (index + fraction), surface, width } or null. */
export function riverQuery(plan, x, z, maxDist = 30) {
  const rv = plan.river;
  if (!rv) return null;
  const grid = rv.grid;
  const cx = Math.floor(x / RIVER_CELL), cz = Math.floor(z / RIVER_CELL);
  let best = null, bd = maxDist * maxDist;
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const segs = grid.get(gx * 8192 + gz);
      if (!segs) continue;
      for (const i of segs) {
        const a = rv.pts[i], b = rv.pts[i + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const L2 = vx * vx + vz * vz || 1;
        const u = clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
        const px = a.x + vx * u - x, pz = a.z + vz * u - z;
        const q = px * px + pz * pz;
        if (q < bd) {
          bd = q;
          best = { d: Math.sqrt(q), i, u, surface: lerp(a.y, b.y, u), width: lerp(a.w, b.w, u) };
        }
      }
    }
  }
  return best;
}
const RIVER_CELL = 24;

function riverCarve(plan, x, z, h) {
  const q = riverQuery(plan, x, z, 40);
  if (!q) return h;
  const half = q.width / 2;
  const depth = plan.river.kind === 'lava' ? 0.8 : 1.35;
  if (q.d < half) {
    const k = q.d / half;
    let bed = Math.min(h, q.surface - depth * (1 - k * k) - 0.15);
    const sb = plan.sandbank;
    if (sb) {
      // a low, rounded sand island rising out of the water
      const u = Math.hypot(x - sb.x, z - sb.z) / sb.r;
      if (u < 1.8) bed = Math.max(bed, sb.top - 0.9 * u * u);
    }
    return bed;
  }
  // banks: sloped valley walls up to the natural ground ...
  const bank = q.surface + 0.25 + (q.d - half) * (plan.river.kind === 'lava' ? 0.55 : 0.42);
  let out = Math.min(h, bank);
  // ... and never lower than the water beside it: a low natural levee keeps the
  // river in its bed (except where it meets the sea, which is its mouth)
  // (not inside the pool the river leaves: that basin stays open water)
  if (q.surface > 0.3 && q.d < half + 7 && !inWaterPool(plan, x, z)) {
    const levee = q.surface + 0.35 + (q.d - half) * 0.12;
    out = Math.max(out, lerp(levee, out, smoothstep(half + 4, half + 7, q.d)));
  }
  return out;
}

/** Mountain paths: ramps spiralling up to the summit, cut into / built onto the slopes. */
function rampEffect(plan, x, z, h) {
  for (const r of plan.ramps) {
    if (Math.hypot(x - r.cx, z - r.cz) > r.reach) continue;
    let bd = Infinity, by = 0;
    const pts = r.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const u = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1), 0, 1);
      const d = Math.hypot(a.x + vx * u - x, a.z + vz * u - z);
      if (d < bd) { bd = d; by = lerp(a.y, b.y, u); }
    }
    // the walkway breathes: wider and narrower stretches
    const width = r.width * (0.8 + 0.35 * (valueNoise(x * 0.08, z * 0.08, plan.seed + 71) * 0.5 + 0.5));
    if (bd > width * 2.6) continue;
    // walkway, then a soft bank blending back into the mountain
    const w = 1 - smoothstep(width * 0.5, width * 2.6, bd);
    const cut = bd < width * 0.5 ? by : lerp(h, by, w * w * (3 - 2 * w));
    h = bd < width * 0.5 ? by : (h > by ? Math.max(by, cut) : Math.min(by, Math.max(h, cut)));
  }
  return h;
}

function padEffect(plan, x, z, h) {
  for (const p of plan.pads) {
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd > p.r * 1.8) continue;
    const w = 1 - smoothstep(p.r * 0.8, p.r * 1.8, dd);
    h = lerp(h, p.h, w);
  }
  return h;
}

// ------------------------------------------------------------------ bogs (swamp)

/**
 * Bog rules: the water never stands deeper than maxDepth above the mud (players
 * wade, dinosaurs walk through – sim/dinos.js stops at 0.35 m), and the paths
 * cross on causeways pathHalf + a few metres wide that stay dry above it.
 */
export const BOG = { maxDepth: 0.3, pathHalf: 2.2 };

/** Distance from (x, z) to the nearest of the segments [ax, az, bx, bz]. */
function segsDist(segs, x, z) {
  let best = Infinity;
  for (const [ax, az, bx, bz] of segs) {
    const vx = bx - ax, vz = bz - az;
    const u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
    const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The bog at (x, z), or null: { bog, k (0 centre .. 1 shore), inner (bog
 * share 0..1), dam (causeway share 0..1), mask (where its water stands) }.
 */
export function bogSample(plan, x, z) {
  const bogs = plan.bogs;
  if (!bogs || !bogs.length) return null;
  // overlapping bogs of one swamp field share their water level: the one we are deepest in wins
  let best = null;
  for (const b of bogs) {
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) > b.reach || Math.abs(dz) > b.reach) continue;
    const ang = Math.atan2(dz, dx);
    // an organic shoreline: lobes and inlets around the circle
    const warp = b.round ? 1 : 1 + 0.2 * valueNoise(Math.cos(ang) * 1.6 + b.id * 3.1, Math.sin(ang) * 1.6, plan.seed + 91)
      + 0.08 * valueNoise(Math.cos(ang) * 4.1, Math.sin(ang) * 4.1 + b.id * 1.7, plan.seed + 92);
    const k = Math.hypot(dx, dz) / (b.r * warp);
    if (k >= 1.15 || (best && k >= best.k)) continue;
    best = { bog: b, k };
  }
  if (!best) return null;
  const b = best.bog;
  const inner = 1 - smoothstep(0.8, 1.06, best.k);
  // the causeway's dry crown reaches past the terrain grid's cell, so the path itself never reads as bog
  const dam = b.segs.length ? 1 - smoothstep(BOG.pathHalf + 2, BOG.pathHalf + 5, segsDist(b.segs, x, z)) : 0;
  return { bog: b, k: best.k, inner, dam, mask: inner * (1 - dam) };
}

/** Sink the ground into the bogs: a shallow mud bed with hummocks, dry causeways across. */
function bogEffect(plan, x, z, h) {
  const s = bogSample(plan, x, z);
  if (!s) return h;
  const b = s.bog;
  const depth = 0.06 + 0.22 * (1 - smoothstep(0.4, 0.95, s.k));
  // mud islands poke out of the water (bigger ones in the arena basin)
  const hum = fbm(x * 0.08 + b.id * 5.3, z * 0.08, 2, plan.seed + 93);
  const bed = b.level - depth + Math.max(0, hum - (b.round ? 0.05 : 0.2)) * (b.round ? 1.6 : 1.1);
  // (never more than ~1.2 m down into higher ground: the shore stays a gentle bank)
  let out = lerp(h, Math.max(bed, h - 1.2), s.inner);
  out = Math.max(out, b.level - BOG.maxDepth + 0.01);
  // causeway: the path crosses dry, a little above the water
  if (s.dam > 0) out = lerp(out, Math.max(out, b.level + 0.4), s.dam);
  return out;
}

/** Inside a water pool's basin (its bowl, a little past the waterline)? */
function inWaterPool(plan, x, z) {
  for (const p of plan.pools) if (p.kind === 'water' && Math.hypot(x - p.x, z - p.z) < p.r * 1.1) return true;
  return false;
}

/** Final analytic island height at (x, z). */
export function islandHeight(plan, x, z) {
  let h = naturalHeight(plan, x, z);
  h = poolEffect(plan, x, z, h);
  h = riverCarve(plan, x, z, h);
  // mountain paths win over the wide river valley walls (so the valley never
  // bites a cliff out of a trail), but give way right at the water: a path
  // never dams a river, it dips down to cross it
  const q = plan.ramps.length ? riverQuery(plan, x, z, 12) : null;
  const keep = q ? smoothstep(q.width / 2 + 1.5, q.width / 2 + 8, q.d) : 1;
  const hr = h;
  if (keep > 0) h = lerp(h, rampEffect(plan, x, z, h), keep);
  h = padEffect(plan, x, z, h);
  if (plan.bogs?.length) h = bogEffect(plan, x, z, h);
  // paths and flattened sites never dig the river's levee away – except in the
  // pool the river flows out of: its basin must stay a basin (no levee hump in
  // the middle of it, where the waterfall comes down)
  if (q && q.d >= q.width / 2 && q.surface > 0.3 && !inWaterPool(plan, x, z)) h = Math.max(h, Math.min(hr, q.surface + 0.35 + (q.d - q.width / 2) * 0.12));
  // Cut the cliff foot and clear the grotto opening. The drop has no shelf
  // or ramp: all ground directly beneath the outlet lies under the pool.
  if (plan.waterfall) {
    const f = plan.waterfall, dx = x - f.x, dz = z - f.z;
    const back = dx * f.dir.x + dz * f.dir.z;
    const side = Math.abs(dx * f.dir.z - dz * f.dir.x);
    const shoulder = (1 - smoothstep(f.width / 2 + 3, f.width / 2 + 10, side))
      * smoothstep(2.8, 4.2, back) * (1 - smoothstep(12, 20, back));
    h = lerp(h, Math.max(h, f.pool.level + 12), shoulder);
    const across = 1 - smoothstep(f.width / 2 + 1.5, f.width / 2 + 5, side);
    const face = 1 - smoothstep(2.8, 4.2, back);
    if (back > -f.pool.r && across > 0 && face > 0) h = lerp(h, Math.min(h, f.pool.level - f.pool.depth), across * face);
  }
  // the boss arena's islet beside the boat (shared/bossArena.js)
  if (plan.bossArena) h = bossArenaHeight(plan.bossArena, x, z, h, plan.seed);
  return h;
}

// ------------------------------------------------------------------ planning helpers

function slopeOf(fn, x, z, e = 2) {
  return Math.hypot(fn(x + e, z) - fn(x - e, z), fn(x, z + e) - fn(x, z - e)) / (2 * e);
}

/** Inside the outline (ellipse or hourglass) at normalized radius < k. */
const insideEllipse = insideOutline;

function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vz = b.z - a.z;
    const u = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1), 0, 1);
    best = Math.min(best, Math.hypot(a.x + vx * u - x, a.z + vz * u - z));
  }
  return best;
}

/** River / lava flow: walk downhill from `start` via the `goals` waypoints, with meanders. */
function traceFlow(plan, start, goals, { kind, width0, width1, surface0, stopAt }) {
  goals = Array.isArray(goals) ? goals.slice() : [goals];
  let goal = goals.shift();
  const fn = (x, z) => poolEffect(plan, x, z, naturalHeight(plan, x, z));
  const pts = [];
  let x = start.x, z = start.z;
  let heading = Math.atan2(goal.z - z, goal.x - x);
  let surface = surface0;
  const step = 5;
  for (let i = 0; i < 160; i++) {
    const nat = fn(x, z);
    if (i > 0) surface = Math.min(surface - (kind === 'lava' ? 0.05 : 0.025) * step, nat - 0.55);
    surface = Math.max(surface, stopAt === 'sea' ? 0.05 : -99);
    const t = Math.min(1, i / 70);
    pts.push({ x, z, y: surface, w: lerp(width0, width1, t) });
    if (stopAt === 'sea' && nat < -0.3) break;
    if (stopAt !== 'sea' && nat < stopAt) break;
    if (goals.length && Math.hypot(goal.x - x, goal.z - z) < 30) goal = goals.shift();
    // candidate headings: toward the goal, prefer lower ground, gentle meander
    const toGoal = Math.atan2(goal.z - z, goal.x - x);
    let bestA = heading, bestS = Infinity;
    for (let k = -3; k <= 3; k++) {
      const a = heading + k * 0.22;
      const tx = x + Math.cos(a) * step * 3, tz = z + Math.sin(a) * step * 3;
      const turn = Math.abs(Math.atan2(Math.sin(a - toGoal), Math.cos(a - toGoal)));
      const s = fn(tx, tz) + turn * (i < 25 ? 2.5 : 5) + Math.abs(k) * 0.4;
      if (s < bestS) { bestS = s; bestA = a; }
    }
    const wiggle = valueNoise(i * 0.35, 0.5, plan.seed + 61) * 0.35;
    heading = lerp(heading, bestA, 0.6) + wiggle * 0.3;
    x += Math.cos(heading) * step;
    z += Math.sin(heading) * step;
  }
  return { kind, pts };
}

function indexRiver(river) {
  const grid = new Map();
  for (let i = 0; i < river.pts.length - 1; i++) {
    const a = river.pts[i], b = river.pts[i + 1];
    const pad = Math.max(a.w, b.w) / 2 + 40;
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / RIVER_CELL), x1 = Math.floor((Math.max(a.x, b.x) + pad) / RIVER_CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - pad) / RIVER_CELL), z1 = Math.floor((Math.max(a.z, b.z) + pad) / RIVER_CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 8192 + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  }
  river.grid = grid;
}

// ------------------------------------------------------------------ the plan

/**
 * Plan an island.
 * @param {number} levelIndex 0-based level
 * @param {number} variant random seed chosen by the server when the level starts
 */
export function planIsland(levelIndex = 0, variant = 1) {
  const level = levelDef(levelIndex);
  const biome = level.biome;
  const seed = islandSeed(level.seedIndex, variant);
  const rng = makeRng(seed);
  const volcanic = biome.id === 'volcano';
  const swamp = biome.id === 'swamp';
  const plan = {
    level, biome, seed, variant,
    // island size (levels.js): the first island is a small tutorial island, later ones larger
    k: level.scale,
    shape: biome.shape || 'oval',
    A: 0,
    B: 0,
    ramps: [],
    rolling: volcanic ? 3.2 : swamp ? 1.6 : 5.5,
    // the swamp is low and flat: its lowland rises only ~2.6 m above the beach
    lowland: swamp ? [1.2, 1.1] : null,
    bogs: [],
    paths: [],
    hills: [],
    volcano: null,
    pools: [],
    pads: [],
    river: null,
    waterfall: null,
    meadows: [],
    sites: {},
    trail: [],
  };
  const K = plan.k;
  plan.A = rng.range(285, 310) * K;
  plan.B = Math.max(64, rng.range(118, 138) * K);
  // the hourglass's round halves are a little wider than the oval's sides
  if (plan.shape === 'hourglass') plan.B *= 1.15;
  const { A, B } = plan;
  // the swamp arena sits in the waist (shared/swampArena.js): planned first, the coast bulges round it
  if (level.swampArena) plan.swampArena = planSwampArena(plan, halfWidthAt(plan, 0), rng() < 0.5 ? -1 : 1);
  const sa = plan.swampArena;
  const clearOfArena = (x, z, r) => !sa || Math.hypot(x - sa.x, z - sa.z) > sa.r + r;

  // --- hut (west beach) and boat (east beach)
  plan.hut = { x: -A + 34, z: rng.range(-10, 10) * K, radius: 21, ground: HUT_GROUND };
  plan.boat = { x: A - 15, z: rng.range(-22, 22) * K, rot: rng.range(-0.35, 0.35) };

  // --- relief
  let hid = 0;
  const addHill = (f) => { f.id = hid++; plan.hills.push(f); return f; };
  const clearOf = (x, z, r) => Math.hypot(x - plan.hut.x, z - plan.hut.z) > r + 60 * Math.max(0.7, K) && Math.hypot(x - plan.boat.x, z - plan.boat.z) > r + 45 * Math.max(0.7, K);
  const place = (tries, pred) => {
    for (let i = 0; i < tries; i++) {
      const x = rng.range(-A * 0.72, A * 0.72), z = rng.range(-B * 0.62, B * 0.62);
      if (pred(x, z)) return { x, z };
    }
    return null;
  };

  if (swamp) {
    // flat and low: one moor hill (the peak) in a round half, dry knolls between the bogs
    const lobe = rng() < 0.5 ? -1 : 1;
    const hill = place(300, (x, z) => clearOf(x, z, 40 * K) && Math.abs(x) > 0.3 * A && Math.sign(x) === lobe && insideEllipse(plan, x, z, 0.62));
    if (hill) addHill({ ...hill, radius: rng.range(26, 32), height: rng.range(8, 11), terrace: 0, rough: 1.5, core: 0.2, shape: 0.9, moor: true });
    for (let i = 0; i < 14; i++) {
      const p = place(120, (x, z) => clearOf(x, z, 16) && clearOfArena(x, z, 22) && insideEllipse(plan, x, z, 0.78)
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius * 0.8 + 14));
      if (p) addHill({ ...p, radius: rng.range(12, 22), height: rng.range(1.6, 3.6), terrace: 0, rough: 0.8, core: 0.1, shape: 1.3 });
    }
  } else if (volcanic) {
    const vx = rng.range(0.02, 0.28) * A, vz = rng.range(-0.12, 0.12) * B;
    const notchAngle = rng() < 0.5 ? -Math.PI / 2 + rng.range(-0.5, 0.5) : Math.PI / 2 + rng.range(-0.5, 0.5);
    plan.volcano = { x: vx, z: vz, radius: rng.range(100, 112) * K, height: rng.range(70, 80) * K, craterR: 17 * Math.max(0.75, K), craterDepth: 13 * K, notchAngle };
    // rocky hills and spires around it
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) {
      const p = place(200, (x, z) => clearOf(x, z, 40 * K) && Math.hypot(x - vx, z - vz) > 130 * K && insideEllipse(plan, x, z, 0.7)
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius + 30 * K));
      if (!p) continue;
      addHill({ ...p, radius: rng.range(30, 44) * K, height: rng.range(22, 38) * K, terrace: 8, sharp: 0.72, rough: 4, core: 0.18, shape: 0.6 });
    }
    for (let i = 0; i < 7; i++) {
      const p = place(120, (x, z) => clearOf(x, z, 14) && insideEllipse(plan, x, z, 0.8) && Math.hypot(x - vx, z - vz) > 115 * K);
      if (p) addHill({ ...p, radius: rng.range(7, 12), height: rng.range(12, 22), terrace: 0, rough: 2, core: 0.3, shape: 0.35 });
    }
  } else {
    // main peak with terraces, plus rolling hills
    const main = addHill({
      x: rng.range(-0.05, 0.32) * A, z: rng.range(-0.25, 0.25) * B,
      radius: rng.range(60, 72) * Math.max(0.62, K), height: rng.range(50, 60) * Math.max(0.55, K), terrace: K < 0.7 ? 7 : 10, sharp: 0.84, rough: 3, main: true,
    });
    const spurRadius = 26 * Math.max(0.7, K);
    const poolRadius = 14 * Math.max(0.8, K);
    if (level.index === 0) {
      // Anchor the falling curtain first, then fit its pool and mountain around it.
      // The pool centre is west of the lip by 55% of its radius.
      const poolX = -0.12 * A - poolRadius * 0.55;
      main.x = poolX + main.radius * 0.7 + spurRadius * 1.05;
      main.z = 0;
    }
    const n = Math.round(rng.int(4, 6) * Math.max(0.6, K));
    for (let i = 0; i < n; i++) {
      const p = place(250, (x, z) => clearOf(x, z, 40 * K) && insideEllipse(plan, x, z, 0.72)
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius * 0.8 + 28 * K));
      if (!p) continue;
      const ridge = rng() < 0.45;
      addHill({
        ...p, radius: rng.range(26, 48) * K, height: rng.range(12, 32) * Math.max(0.6, K), terrace: rng() < 0.5 ? 7 : 0, sharp: 0.8, rough: 3,
        ...(ridge ? { stretch: rng.range(1.8, 2.6), rot: rng() * Math.PI, radius: rng.range(18, 26) * K } : {}),
      });
    }
    // knolls and bumps so the lowland is never flat
    for (let i = 0; i < Math.round(16 * K); i++) {
      const p = place(80, (x, z) => clearOf(x, z, 18) && insideEllipse(plan, x, z, 0.78)
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius * 0.7 + 12));
      if (p) addHill({ ...p, radius: rng.range(10, 20), height: rng.range(3.5, 9), terrace: 0, rough: 1.2, core: 0.05, shape: 1.2 });
    }
    // First-island waterfall faces the western spawn; other jungle islands use
    // the side of the peak with the most land along the island.
    const dir = { x: main.x > 0 ? -1 : 1, z: rng.range(-0.45, 0.45) };
    if (level.index === 0) { dir.x = -1; dir.z = 0; }
    const dl = Math.hypot(dir.x, dir.z);
    dir.x /= dl; dir.z /= dl;
    const spur = addHill({
      x: main.x + dir.x * main.radius * 0.7, z: main.z + dir.z * main.radius * 0.7,
      radius: spurRadius, height: 22 * Math.max(0.65, K), terrace: K < 0.7 ? 7 : 10, sharp: 0.86, rough: 2, spur: true,
    });
    const pool = { x: spur.x + dir.x * spur.radius * 1.05, z: spur.z + dir.z * spur.radius * 1.05, r: poolRadius, depth: 3, kind: 'water' };
    // pool level from the ground around it
    let ring = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      ring += naturalHeight(plan, pool.x + Math.cos(a) * pool.r * 1.6, pool.z + Math.sin(a) * pool.r * 1.6);
    }
    pool.level = Math.max(2.2, ring / 12 - 0.4);
    plan.pools.push(pool);
    plan.waterfallDir = { x: -dir.x, z: -dir.z };   // from the pool toward the cliff (water flows the other way)
    // The outlet faces a broad pool, with the mountain rising behind it.
    plan.waterfall = { x: pool.x - dir.x * (pool.r * 0.55 + 0.45), z: pool.z - dir.z * (pool.r * 0.55 + 0.45), width: 4.5, dir: plan.waterfallDir, pool };
    plan.spur = spur;
    plan.mainPeak = main;
  }

  // --- mountain paths: two spiral ramps up the main peak / the tallest hills
  {
    const targets = volcanic
      ? plan.hills.filter((h) => h.radius > 20 * K && h.terrace > 0).sort((a, b) => b.height - a.height).slice(0, 2)
      : [plan.mainPeak, ...plan.hills.filter((h) => !h.main && !h.spur && h.terrace > 0 && h.height > 12).slice(0, 1)];
    for (const f of targets) {
      if (!f) continue;
      // summit: highest natural point near the centre
      let top = { x: f.x, z: f.z, y: naturalHeight(plan, f.x, f.z) };
      for (let i = 0; i < 160; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * f.radius * 0.3;
        const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        const y = naturalHeight(plan, x, z);
        if (y > top.y) top = { x, z, y };
      }
      // one winding trail per mountain: it wanders around the flank at an
      // uneven pace, with random bends and a varying radius – no perfect spiral
      // The trail starts at the foot of the mountain, away from the hut and boat
      // clearings, and keeps clear of the waterfall cliff; a few tries, then the
      // best one is kept.
      const wpool = plan.pools.find((p) => p.kind === 'water');
      const cliff = wpool && plan.waterfallDir
        ? { x: wpool.x + plan.waterfallDir.x * (wpool.r + 6), z: wpool.z + plan.waterfallDir.z * (wpool.r + 6) } : null;
      let best = null;
      for (let attempt = 0; attempt < 12; attempt++) {
      let a0 = rng() * TAU;
      const dirSign = rng() < 0.5 ? -1 : 1;
      const R0 = f.radius * (f.stretch ? 1 : rng.range(0.95, 1.1));
      let turns = rng.range(0.9, 1.35) + f.height / 110;
      // the waterfall is on this mountain's own flank: wind most of the way
      // around, starting beside the cliff and ending before coming back to it
      if (cliff && attempt >= 6) {
        a0 = Math.atan2(cliff.z - f.z, cliff.x - f.x) + dirSign * rng.range(0.55, 0.75);
        turns = rng.range(0.68, 0.8);
      }
      const pts = [];
      const steps = 110;
      const base = naturalHeight(plan, f.x + Math.cos(a0) * R0, f.z + Math.sin(a0) * R0);
      const s = plan.seed + f.id * 7 + attempt * 13;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // uneven angular speed (bends) + radius wobble
        const a = a0 + dirSign * (t * turns * TAU + valueNoise(t * 4, 1.3, s) * 0.55);
        const wob = 1 + valueNoise(t * 6, 7.1, s + 1) * 0.16;
        const r = (R0 * (1 - t) + 3 * t) * wob;
        const x = top.x + (f.x - top.x) * (1 - t) + Math.cos(a) * r;
        const z = top.z + (f.z - top.z) * (1 - t) + Math.sin(a) * r;
        // steady climb with small flats and steeper bits
        const climb = t + valueNoise(t * 5, 3.7, s + 2) * 0.03;
        pts.push({ x, z, y: lerp(base, top.y, clamp(smoothstep(0, 1, climb) * 0.25 + climb * 0.75, 0, 1)) });
      }
      const p0 = pts[0];
      let bad = 0;
      if (Math.hypot(p0.x - plan.hut.x, p0.z - plan.hut.z) < plan.hut.radius * 1.8 + 10) bad++;
      if (Math.hypot(p0.x - plan.boat.x, p0.z - plan.boat.z) < 30) bad++;
      if (cliff && pts.some((p) => Math.hypot(p.x - cliff.x, p.z - cliff.z) < 14)) bad += 2;
      const ramp = { pts, width: rng.range(4.6, 5.4), cx: f.x, cz: f.z, reach: R0 * 1.2 + 12, hill: f.id };
      if (!best || bad < best.bad) best = { ramp, bad };
      if (!bad) break;
      }
      plan.ramps.push(best.ramp);
    }
  }

  // --- river / lava flow
  if (volcanic) {
    const v = plan.volcano;
    const rimH = v.height * Math.pow(1 - v.craterR / v.radius, 1.6);
    const floor = rimH - v.craterDepth;
    plan.pools.push({ x: v.x, z: v.z, r: v.craterR * 0.8, level: floor + 1.2, depth: 0, kind: 'lava', crater: true });
    const start = { x: v.x + Math.cos(v.notchAngle) * v.craterR * 1.25, z: v.z + Math.sin(v.notchAngle) * v.craterR * 1.25 };
    const goal = { x: v.x + Math.cos(v.notchAngle) * v.radius * 1.4, z: Math.sign(Math.sin(v.notchAngle)) * B * 1.2 };
    plan.river = traceFlow(plan, start, goal, { kind: 'lava', width0: 4.5, width1: 7, surface0: rimH - v.craterDepth * 0.55 - 0.4, stopAt: 3.2 });
    const end = plan.river.pts[plan.river.pts.length - 1];
    plan.pools.push({ x: end.x, z: end.z, r: 9, level: end.y, depth: 0.9, kind: 'lava' });
  } else if (swamp) {
    // a slow brackish creek: from a dark spring pool in one round half, winding
    // along the half and out to the nearer long coast
    const lobe = rng() < 0.5 ? -1 : 1;
    const side = rng() < 0.5 ? -1 : 1;
    const px = lobe * rng.range(0.42, 0.58) * A;
    const pool = { x: px, z: -side * halfWidthAt(plan, px) * rng.range(0.1, 0.25), r: 9, depth: 2.2, kind: 'water' };
    let ring = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      ring += naturalHeight(plan, pool.x + Math.cos(a) * pool.r * 1.6, pool.z + Math.sin(a) * pool.r * 1.6);
    }
    pool.level = Math.max(1.6, ring / 12 - 0.35);
    plan.pools.push(pool);
    const toWaist = -lobe;
    const goals = [
      { x: pool.x + toWaist * 30, z: side * halfWidthAt(plan, pool.x) * 0.3 },
      { x: pool.x + toWaist * 45, z: side * halfWidthAt(plan, pool.x + toWaist * 45) * 1.3 },
    ];
    const start = { x: pool.x + side * 0 + toWaist * pool.r * 0.6, z: pool.z + side * pool.r * 0.6 };
    plan.river = traceFlow(plan, start, goals, { kind: 'water', width0: 5, width1: 9, surface0: pool.level, stopAt: 'sea' });
  } else {
    const pool = plan.pools[0];
    const out = { x: -plan.waterfallDir.x, z: -plan.waterfallDir.z };
    const start = { x: pool.x + out.x * pool.r * 0.9, z: pool.z + out.z * pool.r * 0.9 };
    // run a long way through the lowland along the island before reaching the sea
    const side = pool.z > 0 ? 1 : pool.z < 0 ? -1 : (rng() < 0.5 ? -1 : 1);
    const east = Math.sign(out.x) || 1;
    const along = Math.min(rng.range(130, 170) * K, Math.max(40, A * 0.8 - east * pool.x));
    const goals = [
      { x: pool.x + east * along * 0.5, z: pool.z * 0.5 + side * B * 0.3 },
      { x: pool.x + east * along, z: side * B * 0.45 },
      { x: pool.x + east * (along + 40 * K), z: side * B * 1.3 },
    ];
    plan.river = traceFlow(plan, start, goals, { kind: 'water', width0: 6.5, width1: 13, surface0: pool.level, stopAt: 'sea' });
  }
  // a river cutting through a side hill would chop its mountain path into
  // cliffs: that hill simply has no path (the main mountain always keeps its own)
  {
    const halfW = Math.max(...plan.river.pts.map((p) => p.w)) / 2;
    plan.ramps = plan.ramps.filter((r) => r.hill === plan.mainPeak?.id ||
      r.pts.every((p) => distToPolyline(plan.river.pts, p.x, p.z) > halfW + 10));
  }
  // a sandbank in the middle of the (water) river: the river widens around a small sand island
  if (plan.river.kind === 'water') {
    const pts = plan.river.pts;
    const lo = Math.floor(pts.length * 0.35), hi = Math.max(lo + 1, Math.floor(pts.length * 0.65));
    let pick = -1;
    for (let i = lo; i < hi; i++) if (pts[i].y > 0.6) { pick = i; break; }
    if (pick < 0) pick = Math.min(pts.length - 2, Math.max(1, lo));
    for (let k = -2; k <= 2; k++) {
      const p = pts[pick + k];
      if (p) p.w *= 1 + (1 - Math.abs(k) / 3) * 1.1;
    }
    const c = pts[pick];
    // (the swamp's flat creek can step down sharply: stay above its upstream water too)
    const wl = swamp ? Math.max(...pts.slice(Math.max(0, pick - 2), pick + 3).map((p) => p.y)) : c.y;
    plan.sandbank = { x: c.x, z: c.z, r: Math.min(3.4, c.w * 0.22), top: wl + 0.45 };
  }
  indexRiver(plan.river);

  // --- boss arena (first island): a lava islet grown onto the coast beside the
  // boat, placed from the boat alone (no rng draws: the rest of the island stays as it was)
  if (level.bossArena) {
    plan.bossArena = planBossArena(plan, (x, z) => naturalHeight(plan, x, z));
    plan.pools.push(plan.bossArena.lava);
  }

  // --- trail from the hut to the boat: stay low, avoid the river/lava where possible
  {
    const fn = (x, z) => naturalHeight(plan, x, z);
    const pts = [{ x: plan.hut.x + 8, z: plan.hut.z - 6 }];
    let z = plan.hut.z;
    const lavaPenalty = (x, zz) => (volcanic ? Math.max(0, 40 - distToPolyline(plan.river.pts, x, zz)) * 3 : 0)
      + (plan.volcano ? Math.max(0, plan.volcano.radius * 0.75 - Math.hypot(x - plan.volcano.x, zz - plan.volcano.z)) * 2 : 0)
      // through the swamp's waist past the arena, never into it, and round the creek's spring
      + (sa ? Math.max(0, sa.r + 16 - Math.hypot(x - sa.x, zz - sa.z)) * 8 : 0)
      + (swamp ? plan.pools.reduce((s, q) => s + Math.max(0, q.r * 1.6 + 8 - Math.hypot(x - q.x, zz - q.z)) * 6, 0) : 0);
    for (let x = plan.hut.x + 40; x < plan.boat.x - 25; x += 34) {
      let bestZ = z, bestS = Infinity;
      for (let k = -8; k <= 8; k++) {
        const zz = z + k * 7;
        if (!insideEllipse(plan, x, zz, 0.8)) continue;
        const s = fn(x, zz) * 1.2 + Math.abs(zz - z) * 0.08 + lavaPenalty(x, zz) + slopeOf(fn, x, zz, 4) * 25;
        if (s < bestS) { bestS = s; bestZ = zz; }
      }
      z = bestZ;
      pts.push({ x, z });
    }
    pts.push({ x: plan.boat.x - 10, z: plan.boat.z });
    // round the corners and let it wander a little between the waypoints
    const smooth = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 6; k++) {
        const t = k / 6, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const x = cr(p0.x, p1.x, p2.x, p3.x), zz = cr(p0.z, p1.z, p2.z, p3.z);
        const n = i > 0 && i < pts.length - 2 ? valueNoise(x * 0.05, zz * 0.05, plan.seed + 77) * 4 : 0;
        smooth.push({ x, z: zz + n });
      }
    }
    smooth.push(pts[pts.length - 1]);
    plan.trail = smooth;
  }

  // --- sites: caves, ruins, nest, meadows (flat pads away from trail, river and each other)
  const taken = [
    { x: plan.hut.x, z: plan.hut.z, r: 40 },
    { x: plan.boat.x, z: plan.boat.z, r: 30 },
    ...plan.pools.map((p) => ({ x: p.x, z: p.z, r: p.r + 14 })),
    ...(plan.bossArena ? [{ x: plan.bossArena.center.x, z: plan.bossArena.center.z, r: plan.bossArena.outerR + 10 }] : []),
    ...plan.hills.filter((h) => h.main || h.spur || h.moor).map((h) => ({ x: h.x, z: h.z, r: h.radius * (h.moor ? 0.45 : 0.7), hill: true })),
    ...(sa ? [{ x: sa.x, z: sa.z, r: sa.r + 10 }] : []),
  ];
  if (plan.volcano) taken.push({ x: plan.volcano.x, z: plan.volcano.z, r: plan.volcano.radius * 0.72 });
  const fnN = (x, z) => poolEffect(plan, x, z, naturalHeight(plan, x, z));
  // the swamp's lowland lies low: its sites may stand lower
  const findSpot = (r, { minH = swamp ? 1.4 : 3, maxH = 30, maxSlope = 0.4, trailGap = 14, riverGap = 16 } = {}) => {
    for (let i = 0; i < 900; i++) {
      const x = rng.range(-A * 0.75, A * 0.75), z = rng.range(-B * 0.7, B * 0.7);
      if (!insideEllipse(plan, x, z, 0.8)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) continue;
      const h = fnN(x, z);
      if (h < minH || h > maxH || slopeOf(fnN, x, z, r * 0.5) > maxSlope) continue;
      if (distToPolyline(plan.trail, x, z) < trailGap + r) continue;
      if (distToPolyline(plan.river.pts, x, z) < riverGap + r) continue;
      // a flattened site must not cut a cliff into a mountain path
      if (plan.ramps.some((rp) => rp.pts.some((p) => Math.hypot(p.x - x, p.z - z) < r * 1.8 + 6))) continue;
      taken.push({ x, z, r: r + 8 });
      return { x, z, h };
    }
    return null;
  };
  const addPad = (s, r) => { plan.pads.push({ x: s.x, z: s.z, r, h: s.h }); };

  // the giant's pen (the "grove", see shared/grove.js): the boss arena's
  // plateau out in the lava, no longer a hollow on the island itself
  if (level.grove && plan.bossArena) {
    const a = plan.bossArena;
    plan.sites.grove = { x: a.plateau.x, z: a.plateau.z, y: a.plateauY, r: a.plateauR };
  }
  plan.sites.caves = [];
  // Caves are switched off for now (their look and hitboxes need rework); the
  // generator, shapes (caveShape.js) and models (props/cave.js) stay for later.
  if (CAVES_ENABLED) {
    // caves are dug into the flank of a hill or mountain: the slope rises behind
    // and around them, the entrance looks out over the lowland
    const hosts = plan.hills.filter((h) => !h.spur && h.height > 7 && h.radius > 12).sort(() => rng() - 0.5);
    const rampNear = (x, z, pad) => plan.ramps.some((r) => r.pts.some((p) => Math.hypot(p.x - x, p.z - z) < pad));
    for (const f of hosts) {
      if (plan.sites.caves.length >= 2) break;
      for (let tries = 0; tries < 40; tries++) {
        const a = rng() * TAU;
        const ox = Math.cos(a), oz = Math.sin(a);
        // walk outward from the hill until the ground is ~4-9 m above the foot
        let spot = null;
        for (let r = f.radius * 0.35; r < f.radius * 1.2; r += 1) {
          const x = f.x + ox * r, z = f.z + oz * r;
          const hIn = fnN(x, z), hOut = fnN(x + ox * 12, z + oz * 12);
          if (hIn - hOut > 3.5 && hIn - hOut < 10 && hOut > 2.5) { spot = { x: x + ox * 3, z: z + oz * 3, h: fnN(x + ox * 10, z + oz * 10) }; }
          if (hIn - hOut < 3.5 && spot) break;
        }
        if (!spot || !insideEllipse(plan, spot.x, spot.z, 0.82)) continue;
        // (mountains themselves are fine hosts – only other sites and pools are in the way)
        if (taken.some((t) => !t.hill && Math.hypot(t.x - spot.x, t.z - spot.z) < t.r + 9)) continue;
        if (distToPolyline(plan.river.pts, spot.x, spot.z) < 18 || distToPolyline(plan.trail, spot.x, spot.z) < 10 || rampNear(spot.x, spot.z, 19)) continue;
        // entrance (local -z) faces outward, away from the hill
        const rot = Math.atan2(-ox, -oz);
        plan.sites.caves.push({ x: spot.x, z: spot.z, y: spot.h, rot, seed: rng.int(1, 9999), host: f.id });
        // flatten the floor and the approach in front, not the hill behind
        plan.pads.push({ x: spot.x, z: spot.z, r: 7.5, h: spot.h });
        plan.pads.push({ x: spot.x + ox * 7, z: spot.z + oz * 7, r: 6, h: spot.h });
        taken.push({ x: spot.x, z: spot.z, r: 18 });
        break;
      }
    }
    // fallback: free-standing rock hill with a cave if no flank was found
    while (plan.sites.caves.length < 2) {
      const s = findSpot(10, { maxSlope: 0.45 });
      if (!s) break;
      plan.sites.caves.push({ x: s.x, z: s.z, y: s.h, rot: rng() * TAU, seed: rng.int(1, 9999) });
      addPad(s, 11);
    }
  }
  {
    const s = findSpot(12, { maxSlope: 0.35 });
    if (s) { plan.sites.ruins = { x: s.x, z: s.z, y: s.h, rot: rng() * TAU, seed: rng.int(1, 9999) }; addPad(s, 13); }
  }
  {
    const s = findSpot(6, { maxSlope: 0.4, trailGap: 30 });
    if (s) { plan.sites.nest = { x: s.x, z: s.z, y: s.h, rot: rng() * TAU, size: volcanic ? 1.4 : 1.1 }; addPad(s, 6); }
  }
  for (let i = 0; i < 2; i++) {
    const mr = 22 * Math.max(0.55, K);
    const s = findSpot(mr, { maxSlope: 0.32, trailGap: 4, riverGap: 6, maxH: 18 });
    if (s) { plan.meadows.push({ x: s.x, z: s.z, r: mr * 1.2 }); taken[taken.length - 1].meadow = true; }
  }

  // --- base building plots (every island after the first, see shared/base.js).
  // Planned after all other sites so those stay exactly as they were.
  // A deterministic grid search scored per kind of place: it draws no random
  // numbers, so every other part of the island stays as it was.
  plan.basePlots = [];
  if (level.index > 0) {
    const R = BASE_PLOT_RADIUS;
    const riverGap = volcanic ? 10 : 3;
    const cands = [];
    for (let x = -A * 0.85; x <= A * 0.85; x += 7) {
      for (let z = -B * 0.8; z <= B * 0.8; z += 7) {
        if (!insideEllipse(plan, x, z, 0.84)) continue;
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + R)) continue;
        const h = fnN(x, z);
        if (h < (swamp ? 1.4 : 1.8) || h > 32) continue;
        const trail = distToPolyline(plan.trail, x, z), river = distToPolyline(plan.river.pts, x, z);
        if (trail < R + 1 || river < R + riverGap) continue;
        if (plan.ramps.some((rp) => rp.pts.some((p) => Math.hypot(p.x - x, p.z - z) < R * 1.6 + 6))) continue;
        const slope = slopeOf(fnN, x, z, R * 0.5);
        if (slope > 0.5) continue;
        // the ground around the plot must meet the flattened pad gently – no
        // mesa with cliffs on a narrow hilltop that nobody can climb
        let rim = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (const rr of [R + 4, R + 10]) rim = Math.max(rim, Math.abs(fnN(x + Math.cos(a) * rr, z + Math.sin(a) * rr) - h) / (rr - R + 2));
        }
        if (rim > 0.65) continue;
        cands.push({ x, z, h, slope, rim, hut: Math.hypot(x - plan.hut.x, z - plan.hut.z), river });
      }
    }
    const kinds = [
      // near the landing beach, low ground
      { kind: 'coast', score: (c) => Math.abs(c.hut - 90) + (c.hut < 45 ? 200 : 0) + c.h * 2 + c.slope * 120 },
      // the highest open ground with gentle sides (named "inland" by the layout when it is low)
      { kind: 'highland', score: (c) => -c.h * 3 + c.slope * 120 },
      // by the water (keeping a little more distance from a lava flow)
      { kind: 'river', score: (c) => c.river * 2 + c.slope * 120 + (c.river > R + 30 ? 200 : 0) },
    ];
    // first pass: gentle rims and well apart; if that leaves fewer than two
    // plots, a second pass accepts steeper rims and closer neighbours
    for (const pass of [{ rim: 0.45, gap: 70 }, { rim: 0.65, gap: 45 }]) {
      if (pass.rim > 0.45 && plan.basePlots.length >= 2) break;
      for (const k of kinds) {
        if (plan.basePlots.some((p) => p.kind === k.kind)) continue;
        let best = null, bs = Infinity;
        for (const c of cands) {
          if (c.rim > pass.rim || plan.basePlots.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < pass.gap)) continue;
          const sc = k.score(c);
          if (sc < bs) { bs = sc; best = c; }
        }
        // no fitting place of this kind (the second pass takes any open ground except for the riverbank)
        if (!best || (bs >= 200 && (pass.rim <= 0.45 || k.kind === 'river'))) continue;
        plan.basePlots.push({ kind: k.kind, x: best.x, z: best.z, r: R, h: best.h });
        taken.push({ x: best.x, z: best.z, r: R + 8 });
        addPad(best, R + 2.5);
      }
    }
  }

  // flatten the hut clearing and the boat beach
  plan.pads.push({ x: plan.hut.x, z: plan.hut.z + 2, r: plan.hut.radius, h: HUT_GROUND });
  plan.pads.push({ x: plan.boat.x, z: plan.boat.z, r: 9, h: 0.9 });

  // --- summit (peak site): highest point of the main peak / tallest rocky hill
  {
    const top = volcanic
      ? plan.hills.filter((h) => h.radius > 20).sort((a, b) => b.height - a.height)[0]
      : swamp ? plan.hills.find((h) => h.moor) : plan.mainPeak;
    if (top) {
      let best = null;
      for (let i = 0; i < 400; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * top.radius * 0.45;
        const x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r;
        const h = islandHeight(plan, x, z);
        if (slopeOf((xx, zz) => islandHeight(plan, xx, zz), x, z, 1.5) < 0.35 && (!best || h > best.y)) best = { x, z, y: h };
      }
      plan.sites.peak = best;
    }
  }

  // --- which three sites hide the relics this time
  const available = biome.sites.filter((s) => {
    if (s === 'cave') return plan.sites.caves.length > 0;
    if (s === 'ruins') return !!plan.sites.ruins;
    if (s === 'nest') return !!plan.sites.nest;
    if (s === 'peak') return !!plan.sites.peak;
    return true;                                      // waterfall / river / lava always exist in their biome
  });
  const chosen = [];
  const pool = available.slice();
  while (chosen.length < level.relicCount && pool.length) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  plan.relicSites = chosen;

  // --- swamp: side paths from the trail, then the bogs around them
  if (swamp) planSwampPaths(plan, taken);
  if (swamp) planBogs(plan, taken, makeRng(seed ^ 0xb06), fnN);

  return plan;
}

/**
 * Side paths (swamp): from the nearest trail point out to the sites, base plots
 * and the arena gate, wandering a little. They join layout.path, so they are
 * worn in, kept clear of trees – and raised as dry causeways through the bogs.
 */
function planSwampPaths(plan, taken) {
  const sa = plan.swampArena;
  const targets = [];
  for (const key of ['ruins', 'nest']) if (plan.sites[key]) targets.push({ x: plan.sites[key].x, z: plan.sites[key].z, stop: key === 'ruins' ? 11 : 4 });
  if (plan.sites.peak) targets.push({ x: plan.sites.peak.x, z: plan.sites.peak.z, stop: 2 });
  for (const p of plan.basePlots) targets.push({ x: p.x, z: p.z, stop: p.r - 2 });
  if (sa) targets.push({ x: sa.gate.x, z: sa.gate.z, stop: 0 });
  // never through the arena (only up to its gate) or the creek's spring pool
  const blocked = (p) => (sa && Math.hypot(p.x - sa.x, p.z - sa.z) < sa.r + 2)
    || plan.pools.some((q) => q.kind === 'water' && Math.hypot(p.x - q.x, p.z - q.z) < q.r * 1.5 + 2);
  for (const t of targets) {
    // from the nearest trail point whose way out is clear
    const starts = plan.trail.map((p) => ({ p, d: Math.hypot(p.x - t.x, p.z - t.z) })).sort((a, b) => a.d - b.d);
    if (!starts.length || starts[0].d < t.stop + 6) continue;
    for (const { p: best, d: bd } of starts.slice(0, 24)) {
      const len = bd - t.stop;
      const dx = (t.x - best.x) / bd, dz = (t.z - best.z) / bd;
      const n = Math.max(3, Math.ceil(len / 6));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const wob = i > 0 && i < n ? valueNoise(best.x * 0.1 + u * 3, best.z * 0.1, plan.seed + 97) * Math.min(5, len * 0.12) * Math.sin(Math.PI * u) : 0;
        pts.push({ x: best.x + dx * len * u - dz * wob, z: best.z + dz * len * u + dx * wob });
      }
      if (pts.some(blocked)) continue;
      plan.paths.push(pts);
      break;
    }
  }
}

/**
 * The swamp's bogs: irregular shallow pools of mud water between the dry
 * knolls, each with one flat water level a little below its shore. They keep
 * clear of the hut, boat, sites, base plots and the creek; paths cross them on
 * causeways. The arena basin is one more (round, sunken) bog.
 */
function planBogs(plan, taken, rng, fnN) {
  const { A } = plan;
  const sa = plan.swampArena;
  const lines = [plan.trail, ...plan.paths];
  const segsNear = (x, z, reach) => {
    const out = [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        if (Math.min(a.x, b.x) > x + reach || Math.max(a.x, b.x) < x - reach || Math.min(a.z, b.z) > z + reach || Math.max(a.z, b.z) < z - reach) continue;
        out.push([a.x, a.z, b.x, b.z]);
      }
    }
    return out;
  };
  const ringMin = (x, z, r) => {
    let lo = Infinity;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      lo = Math.min(lo, fnN(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return lo;
  };
  if (sa) {
    // below the median of the ground round the ring (its coast side may dip toward the beach)
    const ring = [];
    for (let k = 0; k < 16; k++) ring.push(fnN(sa.x + Math.cos((k / 16) * TAU) * (sa.r + 4), sa.z + Math.sin((k / 16) * TAU) * (sa.r + 4)));
    ring.sort((a, b) => a - b);
    const level = Math.max(0.9, ring[8] - SWAMP_ARENA.sink);
    const r = sa.r - 3;
    plan.bogs.push({ id: 0, field: 0, x: sa.x, z: sa.z, r, reach: r * 1.2, level, round: true, arena: true, segs: [] });
  }
  const want = Math.round(70 * (plan.k / 0.86) ** 2);
  for (let i = 0; i < 6000 && plan.bogs.length < want; i++) {
    const x = rng.range(-A * 0.85, A * 0.85), z = rng.range(-plan.B, plan.B);
    if (!insideOutline(plan, x, z, 0.8)) continue;
    const r = i < 2000 ? rng.range(18, 34) : rng.range(8, 20);   // big bogs first, then smaller ones between
    const reach = r * 1.15 * 1.3;
    // the whole shoreline (up to ~1.4 r out) clear of the hut, boat, sites and plots; meadows may get wet edges
    if (taken.some((t) => !t.hill && Math.hypot(t.x - x, t.z - z) < (t.meadow ? t.r * 0.5 + r : t.r + r * 1.4))) continue;
    // a bog either joins the field it overlaps (deep enough into it) or keeps clear of all others
    const near = plan.bogs.filter((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 1.35 + 2);
    if (near.some((b) => b.arena || Math.hypot(b.x - x, b.z - z) > (b.r + r) * 1.0)) continue;
    const field = new Set(near.map((b) => b.field));
    if (field.size > 1 || (near.length && plan.bogs.filter((b) => b.field === near[0].field).length >= 10)) continue;
    if (plan.sites.peak && Math.hypot(plan.sites.peak.x - x, plan.sites.peak.z - z) < r * 1.3 + 14) continue;
    if (distToPolyline(plan.river.pts, x, z) < reach + 6) continue;
    if (plan.pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 2.6 + reach)) continue;
    const h = fnN(x, z);
    if (h < 0.9 || h > 4.5) continue;
    // the water stands a little below the lowest point of the shore
    const level = ringMin(x, z, r * 1.2) - 0.22;
    if (level < 0.7) continue;
    const id = plan.bogs.length;
    plan.bogs.push({ id, field: near.length ? near[0].field : id, x, z, r, reach, level, segs: segsNear(x, z, reach + BOG.pathHalf + 5) });
  }
  // one water level per field: the lowest of its bogs
  const levels = new Map();
  for (const b of plan.bogs) levels.set(b.field, Math.min(levels.get(b.field) ?? Infinity, b.level));
  for (const b of plan.bogs) b.level = levels.get(b.field);
}

/** River surface / lava helpers used by Terrain. */
export function poolAt(plan, x, z, kind) {
  for (const p of plan.pools) {
    if (p.kind !== kind) continue;
    if (Math.hypot(x - p.x, z - p.z) < (p.reach ?? p.r * 1.35)) return p;
  }
  return null;
}
