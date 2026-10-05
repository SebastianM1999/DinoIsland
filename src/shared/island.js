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
import { planSwampArena, SWAMP_ARENA, ambushPocket } from './swampArena.js';
import { planVolcanoArena, moatFlow, VOLCANO_ARENA } from './volcanoArena.js';
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
export const HOURGLASS = { depth: 0.63, width: 0.2 };

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
  const inland = (1 - d) * scale;                         // meters from the coastline
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

/**
 * The caldera (Ashfall Isle): a huge cone filling the middle of the round
 * island. Its rim at craterR stands rimH above the lowland it rises from. The
 * inside – the flat crater floor (the boss arena, shared/volcanoArena.js), the
 * inner wall and the notch at notchAngle where the mountain path comes in –
 * is shaped by calderaInner at fixed heights.
 */
function volcanoHeight(v, x, z, seed) {
  const dx = x - v.x, dz = z - v.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r > v.radius * 1.15) return 0;
  const ang = Math.atan2(dz, dx);
  const ridges = 1 + 0.06 * Math.sin(ang * 7 + seed) + 0.05 * valueNoise(Math.cos(ang) * 3, Math.sin(ang) * 3, seed + 21);
  const span = v.radius - v.craterR;
  const u = clamp((r / ridges - v.craterR) / span, 0, 1);
  // concave cone: steep under the rim, spreading lava plains at the foot
  let h = v.rimH * Math.pow(1 - u, 1.5);
  h += fbm(x * 0.04, z * 0.04, 3, seed + 22) * 3 * (1 - u) * u * 2;
  // gullies running down the flanks
  h -= Math.max(0, Math.sin(ang * 11 + fbm(x * 0.02, z * 0.02, 2, seed + 23) * 3)) * 2.2 * u * (1 - u) * 2;
  // a crest along the rim (the crater inside: calderaInner)
  h += 2 * (1 - smoothstep(0, 7, Math.abs(r - v.craterR)));
  return h;
}

/**
 * The caldera's inside at fixed heights, whatever the lowland under the cone
 * does: the flat floor at floorY, the steep inner wall up to the rim, and the
 * notch – a pass cut through the rim where the mountain path comes in.
 */
function calderaInner(v, x, z, h, seed) {
  const dx = x - v.x, dz = z - v.z, r = Math.hypot(dx, dz);
  if (r > v.craterR + 16) return h;
  if (r < v.craterR + 3) {
    const wall = smoothstep(v.floorR, v.craterR, r);
    const inner = lerp(v.floorY + fbm(x * 0.09, z * 0.09, 2, seed + 24) * 0.25, v.rimY + 2, wall * wall * (3 - 2 * wall));
    h = lerp(inner, h, smoothstep(v.craterR - 1, v.craterR + 3, r));
  }
  const notch = Math.cos(Math.atan2(dz, dx) - v.notchAngle);
  if (notch > 0.9 && r > v.floorR - 4) {
    const nk = smoothstep(0.9, 0.97, notch) * smoothstep(v.floorR - 4, v.floorR, r) * (1 - smoothstep(v.craterR + 8, v.craterR + 16, r));
    h = lerp(h, Math.min(h, v.floorY + 1.5 + Math.max(0, r - v.craterR) * 0.35), nk);
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
  if (plan.volcano?.floorY != null) h = calderaInner(plan.volcano, x, z, h, plan.seed);
  return h;
}

function poolEffect(plan, x, z, h) {
  for (const p of plan.pools) {
    if (p.kind === 'lava' && (p.crater || p.annex || p.pit)) continue;   // the crater / boss arena / path pits shape their own bowls
    // (bank: how far out the raised rim reaches – 2.5 radii unless the pool says)
    const dd = Math.hypot(x - p.x, z - p.z), bank = p.bank ?? p.r * 2.5;
    if (dd > bank + p.r * 0.1) continue;
    const rim = 1 - smoothstep(p.r * 1.2, bank, dd);
    h = lerp(h, Math.max(h, p.level + (p.rim ?? 0.8) + fbm(x * 0.1, z * 0.1, 2, plan.seed + 13) * 0.35), rim);
    const bowl = 1 - smoothstep(p.r * 0.55, p.r * 1.05, dd);
    h = lerp(h, p.level - p.depth, bowl);
  }
  return h;
}

/**
 * The vents on the volcano's flanks: a low cinder cone round the spot where a
 * lava flow wells out (the flow then carves its mouth and its way out of it).
 */
function ventEffect(plan, x, z, h) {
  // the young flow runs between high banks down the steep flank
  const q = riverQuery(plan, x, z, 12, 'lava');
  if (q && q.flow.vent && q.i <= 4 && q.d > q.width / 2) {
    const k = 1 - smoothstep(q.width / 2 + 4, q.width / 2 + 9, q.d);
    h = Math.max(h, lerp(h, q.surface + 1.6, k));
  }
  for (const f of plan.flows) {
    const v = f.vent;
    if (!v) continue;
    const d = Math.hypot(x - v.x, z - v.z);
    if (d > VENT.r * 2) continue;
    // a crest round the mouth on a low mound (it holds the young flow's banks high)
    const ring = Math.exp(-(((d - VENT.r) / VENT.w) ** 2));
    const mound = 1 - smoothstep(VENT.r, VENT.r * 2.2, d);
    h += (ring * VENT.h + mound * 0.9) * (1 + fbm(x * 0.4, z * 0.4, 2, plan.seed + 141) * 0.25);
  }
  return h;
}
const VENT = { r: 4.5, w: 3, h: 1.6 };

/** All flows of the island: the river (or first lava flow), more lava flows, the crater's lava moat. */
export const flowsOf = (plan) => plan.flows ?? (plan.river ? [plan.river] : []);

/**
 * Nearest point on any flow polyline (river / lava flow) of `kind` (any kind
 * when omitted): { d, i, u, surface, width, flow } or null.
 */
export function riverQuery(plan, x, z, maxDist = 30, kind = null) {
  const cx = Math.floor(x / RIVER_CELL), cz = Math.floor(z / RIVER_CELL);
  let best = null, bd = maxDist * maxDist;
  for (const rv of flowsOf(plan)) {
    if (kind && rv.kind !== kind) continue;
    const grid = rv.grid;
    if (!grid) continue;
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
            best = { d: Math.sqrt(q), i, u, surface: lerp(a.y, b.y, u), width: lerp(a.w, b.w, u), flow: rv };
          }
        }
      }
    }
  }
  return best;
}
const RIVER_CELL = 24;

/** Distance from (x, z) to the nearest flow's centreline. */
export function flowDist(plan, x, z) {
  let best = Infinity;
  for (const rv of flowsOf(plan)) best = Math.min(best, distToPolyline(rv.pts, x, z));
  return best;
}

function riverCarve(plan, x, z, h) {
  const q = riverQuery(plan, x, z, 40);
  if (!q) return h;
  const half = q.width / 2;
  // the crater's lava moat only digs its own channel: the crater wall beside it stays a wall
  // (so does the lava seeping along the ridge path's ditch: the ditch is the path's)
  if (q.flow.ring || q.flow.gutter) return q.d < half ? Math.min(h, q.surface - 0.8 * (1 - (q.d / half) ** 2) - 0.15) : h;
  const depth = q.flow.kind === 'lava' ? 0.8 : 1.35;
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
  const bank = q.surface + 0.25 + (q.d - half) * (q.flow.kind === 'lava' ? 0.55 : 0.42);
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
/**
 * The volcano's ridge path (calderaPath): how wide the walkway is, how far
 * beside it the ditch on the upper side runs and how deep, how steeply the
 * lower side drops away, and how far out all that reaches (m).
 */
const RIDGE = { width: 5, ditch: 2.8, depth: 3.5, drop: 1.6, reach: 16 };

function rampEffect(plan, x, z, h) {
  for (const r of plan.ramps) {
    if (Math.hypot(x - r.cx, z - r.cz) > r.reach) continue;
    let bd = Infinity, by = 0, bk = 0;
    const pts = r.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const u = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1), 0, 1);
      const d = Math.hypot(a.x + vx * u - x, a.z + vz * u - z);
      if (d < bd) { bd = d; by = lerp(a.y, b.y, u); bk = r.ridge ? lerp(a.ridge ?? 0, b.ridge ?? 0, u) : 0; }
    }
    if (bk > 0) {
      // the volcano's narrow ridge path: a steep drop on the lower side, a
      // ditch on the upper one (lava seeps along it in places: ridgeGutters)
      const half = r.width * 0.5;
      if (bd > half + RIDGE.reach) continue;
      let hr;
      if (bd <= half) hr = by;
      else if (h > by) hr = Math.min(h, by - RIDGE.depth + Math.max(0, Math.abs(bd - half - RIDGE.ditch) - 1.3) * 2);
      else hr = Math.max(h, by - (bd - half) * RIDGE.drop);
      const hs = bd < half ? by : h > by ? Math.max(by, lerp(h, by, 1 - smoothstep(half, half * 5, bd))) : Math.min(by, Math.max(h, lerp(h, by, 1 - smoothstep(half, half * 5, bd))));
      h = lerp(hs, hr, bk);
      continue;
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
  // Only the boss hollows are deep; the causeway and ordinary bogs stay dry/shallow.
  if (b.arena) out = lerp(out, b.level - 3.4, ambushPocket(plan.swampArena, x, z) * (1 - s.dam));
  return out;
}

// ------------------------------------------------------------------ lava crossings (volcano)

/**
 * Basalt bridge at (x, z), or null: where a path crosses a lava flow, the lava
 * runs through a tube under a dam of solid basalt (deck height b.y).
 */
export function bridgeAt(plan, x, z) {
  for (const b of plan.bridges || []) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return b;
  return null;
}

function bridgeEffect(plan, x, z, h) {
  for (const b of plan.bridges) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d > b.r + 5) continue;
    const w = 1 - smoothstep(b.r - 1, b.r + 5, d);
    h = lerp(h, Math.max(h, b.y), w);
  }
  return h;
}

/**
 * The lava pits that break the volcano's ridge path (lavaPits): a bowl of
 * lava right across the walkway, a low rim round it where the ridge falls away.
 */
function pitEffect(plan, x, z, h) {
  for (const p of plan.pits) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r * 2.4) continue;
    h = lerp(h, Math.max(h, p.level + 0.9), 1 - smoothstep(p.r * 1.6, p.r * 2.4, d));
    h = lerp(h, p.level - p.depth, 1 - smoothstep(p.r * 0.6, p.r * 1.05, d));
  }
  return h;
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
  if (plan.flows) h = ventEffect(plan, x, z, h);
  h = riverCarve(plan, x, z, h);
  // mountain paths win over the wide river valley walls (so the valley never
  // bites a cliff out of a trail), but give way right at the water: a path
  // never dams a river, it dips down to cross it
  // (also on the flat swamp, which has no mountain paths but sites and plots beside its creek)
  const q = plan.ramps.length || plan.shape === 'hourglass' ? riverQuery(plan, x, z, 12) : null;
  const keep = q && !q.flow.gutter ? smoothstep(q.width / 2 + 1.5, q.width / 2 + 8, q.d) : 1;
  const hr = h;
  if (keep > 0) h = lerp(h, rampEffect(plan, x, z, h), keep);
  h = padEffect(plan, x, z, h);
  if (plan.bogs?.length) h = bogEffect(plan, x, z, h);
  // paths and flattened sites never dig the river's levee away – except in the
  // pool the river flows out of: its basin must stay a basin (no levee hump in
  // the middle of it, where the waterfall comes down)
  // (a lava flow needs no levee over the paths: it runs in its own carved channel)
  if (q && q.flow.kind === 'water' && q.d >= q.width / 2 && q.surface > 0.3 && !inWaterPool(plan, x, z)) h = Math.max(h, Math.min(hr, q.surface + 0.35 + (q.d - q.width / 2) * 0.12));
  // the volcano's basalt bridges over its lava flows
  if (plan.bridges?.length) h = bridgeEffect(plan, x, z, h);
  if (plan.pits?.length) h = pitEffect(plan, x, z, h);
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
  // the volcano island is round
  if (plan.shape === 'round') plan.B = plan.A;
  const { A, B } = plan;
  // the swamp arena fills the middle of the waist (shared/swampArena.js): the way to the second half
  if (level.swampArena) plan.swampArena = planSwampArena(plan);
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
    // the caldera fills the middle of the round island (volcanoHeight); the
    // notch in its rim, where the mountain path comes in, faces a random side
    const V = VOLCANO_ARENA;
    const rimH = rng.range(56, 64);
    // (rimH / floorH: above the lowland it stands on; rimY / floorY: the actual heights)
    plan.volcano = { x: 0, z: 0, radius: A * 0.6, rimH, height: rimH, craterR: V.craterR, floorR: V.floorR, floorH: rimH - V.depth, notchAngle: rng.range(-Math.PI, Math.PI) };
    const base = coastHeight(plan, 0, 0);
    plan.volcano.floorY = base + plan.volcano.floorH;
    plan.volcano.rimY = base + rimH;
    const vr = plan.volcano.radius;
    // rocky hills on the lowland ring round it (the tallest carries the peak site) ...
    for (let i = 0; i < 3; i++) {
      const p = place(300, (x, z) => clearOf(x, z, 18) && Math.hypot(x, z) > vr * 1.1 + 24 && insideEllipse(plan, x, z, 0.8)
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius + 26));
      // (gentle enough to walk up anywhere: no terraces, no paths of their own)
      if (p) addHill({ ...p, radius: rng.range(24, 28), height: rng.range(13, 18), terrace: 0, rough: 2, core: 0.18, shape: 0.8 });
    }
    // ... and basalt spires
    for (let i = 0; i < 9; i++) {
      const p = place(150, (x, z) => clearOf(x, z, 10) && insideEllipse(plan, x, z, 0.84) && Math.hypot(x, z) > vr * 1.05 + 8
        && plan.hills.every((h) => Math.hypot(x - h.x, z - h.z) > h.radius + 10));
      if (p) addHill({ ...p, radius: rng.range(6, 10), height: rng.range(9, 16), terrace: 0, rough: 2, core: 0.3, shape: 0.35 });
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
  // the long climb up the caldera, round its flank and in through the notch
  if (volcanic) plan.ramps.push(calderaPath(plan, rng));

  // --- river / lava flow
  if (volcanic) {
    // three lava flows from vents on the flanks down to the beach, clear of the
    // hut and boat beaches and of the notch; the crater's lava moat is one more
    const v = plan.volcano;
    const angles = [];
    const off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    for (let i = 0; i < 600 && angles.length < 3; i++) {
      const a = rng.range(-Math.PI, Math.PI);
      if (off(a, Math.PI) < 0.8 || off(a, 0) < 0.65 || off(a, v.notchAngle) < 0.4 || angles.some((b) => off(a, b) < 1.25)) continue;
      angles.push(a);
    }
    plan.flows = [];
    const climb = plan.ramps.find((r) => r.caldera).pts;
    // (where the mountain path passes on a bearing: its radius there)
    const pathR = (a) => {
      let best = null;
      for (const c of climb) if (off(Math.atan2(c.z - v.z, c.x - v.x), a) < 0.08) { const r = Math.hypot(c.x - v.x, c.z - v.z); if (!best || r < best) best = r; }
      return best;
    };
    let above = false;
    for (const a of angles) {
      // the vent keeps clear of the mountain path (the flow crosses it further down);
      // one vent at least sits above the path, so the path has lava to cross
      const pr = above ? null : pathR(a);
      let vr = 0;
      for (let k = 0; k < 24; k++) {
        const r = v.craterR + (v.radius - v.craterR) * rng.range(0.2, 0.55);
        const gap = distToPolyline(climb, v.x + Math.cos(a) * r, v.z + Math.sin(a) * r);
        if (gap > 22 && (!pr || r < pr - 18)) { vr = r; above ||= !!pr; break; }
        if (!vr || gap > distToPolyline(climb, v.x + Math.cos(a) * vr, v.z + Math.sin(a) * vr)) vr = r;
      }
      const start = { x: v.x + Math.cos(a) * vr, z: v.z + Math.sin(a) * vr };
      const goal = { x: Math.cos(a) * A * 1.35, z: Math.sin(a) * A * 1.35 };
      const y0 = naturalHeight(plan, start.x, start.z);
      const flow = traceFlow(plan, start, goal, { kind: 'lava', width0: 4, width1: 7.5, surface0: y0 - 0.6, stopAt: 0.5 });
      flow.vent = { x: start.x, z: start.z, y: y0 };
      plan.flows.push(flow);
    }
    // the mountain path crosses lava at least once (stepping stones there): if
    // none of the flows does, one more breaks out a little above its middle
    const crosses = (fl) => fl.pts.some((p, i) => i && climb.some((c, j) => j && segCross(fl.pts[i - 1], p, climb[j - 1], c)));
    if (!plan.flows.some(crosses)) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const m = climb[Math.floor(climb.length * t)];
        const a = Math.atan2(m.z - v.z, m.x - v.x), rm = Math.hypot(m.x - v.x, m.z - v.z);
        if (off(a, Math.PI) < 0.8 || off(a, 0) < 0.65 || angles.some((b) => off(a, b) < 0.35)) continue;
        const start = { x: v.x + Math.cos(a) * (rm - 16), z: v.z + Math.sin(a) * (rm - 16) };
        const goal = { x: Math.cos(a) * A * 1.35, z: Math.sin(a) * A * 1.35 };
        const y0 = naturalHeight(plan, start.x, start.z);
        const flow = traceFlow(plan, start, goal, { kind: 'lava', width0: 4, width1: 7.5, surface0: y0 - 0.6, stopAt: 0.5 });
        flow.vent = { x: start.x, z: start.z, y: y0 };
        if (!crosses(flow)) continue;
        plan.flows.push(flow);
        break;
      }
    }
    // the ridge eases off where the path meets a flow (the flow keeps its banks)
    for (const c of climb) if (c.ridge) c.ridge *= smoothstep(10, 24, Math.min(...plan.flows.map((fl) => distToPolyline(fl.pts, c.x, c.z))));
    plan.volcanoArena = planVolcanoArena(plan);
    plan.flows.push(moatFlow(plan.volcanoArena));
    plan.river = plan.flows[0];
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
    // out of the pool's edge (not its bowl), toward the waist and the coast
    const start = { x: pool.x + toWaist * pool.r * 0.67, z: pool.z + side * pool.r * 0.67 };
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
  // (the caldera's own path crosses its lava flows on basalt bridges instead)
  plan.flows ??= [plan.river];
  {
    const halfW = Math.max(...plan.flows.flatMap((f) => f.pts.map((p) => p.w))) / 2;
    plan.ramps = plan.ramps.filter((r) => r.caldera || r.hill === plan.mainPeak?.id ||
      r.pts.every((p) => flowDist(plan, p.x, p.z) > halfW + 10));
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
  for (const f of plan.flows) indexRiver(f);

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
    const lavaPenalty = (x, zz) => (volcanic ? Math.max(0, 40 - flowDist(plan, x, zz)) * 3 : 0)
      + (plan.volcano ? Math.max(0, plan.volcano.radius * 0.75 - Math.hypot(x - plan.volcano.x, zz - plan.volcano.z)) * 2 : 0)
      // through the swamp's waist: straight through the arena, gate to gate; round the creek's spring
      + (sa && Math.abs(x - sa.x) < sa.r + 24 ? Math.abs(zz - sa.z) * 20 : 0)
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
    // the swamp: straight through the arena, in at the west gate and out at the east gate
    if (sa) {
      const keep = pts.filter((p) => Math.abs(p.x - sa.x) > sa.r + 22);
      const lane = [-(sa.r + 14), -(sa.r + 4), 0, sa.r + 4, sa.r + 14].map((dx) => ({ x: sa.x + dx, z: sa.z, fixed: true }));
      pts.length = 0;
      pts.push(...keep.filter((p) => p.x < sa.x), ...lane, ...keep.filter((p) => p.x > sa.x));
    }
    // round the corners and let it wander a little between the waypoints
    const smooth = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 6; k++) {
        const t = k / 6, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const x = cr(p0.x, p1.x, p2.x, p3.x), zz = cr(p0.z, p1.z, p2.z, p3.z);
        const n = i > 0 && i < pts.length - 2 && !p1.fixed && !p2.fixed ? valueNoise(x * 0.05, zz * 0.05, plan.seed + 77) * 4 : 0;
        smooth.push({ x, z: zz + n });
      }
    }
    smooth.push(pts[pts.length - 1]);
    plan.trail = smooth;
  }
  // the paths cross the lava flows on basalt bridges; the mountain path rises gently onto their decks
  plan.bridges = volcanic ? lavaBridges(plan) : [];
  plan.steps = [];
  if (volcanic) planLavaSteps(plan);
  for (const b of plan.bridges) {
    if (b.steps) continue;
    for (const r of plan.ramps) {
      // (measured along the path from where it crosses: not the loop above or below)
      const pts = r.pts;
      let j0 = -1, bd = b.r;
      pts.forEach((p, j) => { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd) { bd = d; j0 = j; } });
      if (j0 < 0) continue;
      for (const dir of [-1, 1]) {
        let s = bd;
        for (let j = j0; j >= 0 && j < pts.length && s < b.r + 40; j += dir) {
          if (j !== j0) s += Math.hypot(pts[j].x - pts[j - dir].x, pts[j].z - pts[j - dir].z);
          pts[j].y = Math.max(pts[j].y, b.y - 0.2 * Math.max(0, s - b.r * 0.6));
        }
      }
    }
  }

  // lava seeping along the ridge path's ditch
  if (volcanic) ridgeGutters(plan);
  // lava pits across it, crossed on stepping stones
  plan.pits = [];
  if (volcanic) lavaPits(plan);

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
      if (flowDist(plan, x, z) < riverGap + r) continue;
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
        if (flowDist(plan, spot.x, spot.z) < 18 || distToPolyline(plan.trail, spot.x, spot.z) < 10 || rampNear(spot.x, spot.z, 19)) continue;
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
    const riverGap = volcanic ? 22 : 3;   // (the plot's flattened pad never cuts a lava flow's bank)
    const cands = [];
    for (let x = -A * 0.85; x <= A * 0.85; x += 7) {
      for (let z = -B * 0.8; z <= B * 0.8; z += 7) {
        if (!insideEllipse(plan, x, z, 0.84)) continue;
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + R)) continue;
        const h = fnN(x, z);
        if (h < (swamp ? 1.4 : 1.8) || h > 32) continue;
        const trail = distToPolyline(plan.trail, x, z), river = flowDist(plan, x, z);
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
  // --- volcano: steaming fumaroles
  plan.fumaroles = [];
  if (volcanic) planFumaroles(plan, taken, makeRng(seed ^ 0xf0a1), fnN);
  if (volcanic) planLavaCraters(plan, taken, makeRng(seed ^ 0x1a7a), fnN);

  return plan;
}

/**
 * The mountain path up the caldera: from the foot it winds round the flank,
 * rising evenly (it keeps to the height the cone has at its radius), and ends
 * in the notch, then runs down through it onto the crater floor.
 */
function calderaPath(plan, rng) {
  const v = plan.volcano;
  const turns = rng.range(0.6, 0.7), dir = rng() < 0.5 ? -1 : 1;
  const outer = v.craterR + 9;
  const yEnd = v.floorY + 1.5 + 9 * 0.35;              // the notch's floor there (volcanoHeight, on the lowland)
  const footR = v.radius * 1.02;
  const a0 = v.notchAngle - dir * turns * TAU;
  const y0 = Math.max(1, naturalHeight(plan, v.x + Math.cos(a0) * footR, v.z + Math.sin(a0) * footR));
  const steps = 150;
  // on each bearing, the radius where the flank (ridges and gullies included) has the path's height
  const rs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = lerp(y0, yEnd, t), a = a0 + dir * t * turns * TAU;
    let lo = outer, hi = footR;
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2;
      if (naturalHeight(plan, v.x + Math.cos(a) * mid, v.z + Math.sin(a) * mid) > y) lo = mid; else hi = mid;
    }
    rs.push((lo + hi) / 2);
  }
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // smoothed: no zigzag where a gully cuts in
    let sum = 0, n = 0;
    for (let k = -3; k <= 3; k++) if (rs[i + k] != null) { sum += rs[i + k]; n++; }
    const r = clamp(sum / n, outer, footR);
    const a = a0 + dir * t * turns * TAU;
    // (a ridge from a little way up the foot to just below the notch)
    pts.push({ x: v.x + Math.cos(a) * r, z: v.z + Math.sin(a) * r, y: lerp(y0, yEnd, t), ridge: smoothstep(0.04, 0.12, t) * (1 - smoothstep(0.93, 0.99, t)) });
  }
  // through the notch and down onto the floor (across the moat's gap)
  const c = Math.cos(v.notchAngle), s = Math.sin(v.notchAngle);
  for (const [r, y] of [[v.craterR + 3, v.floorY + 2.6], [v.craterR - 2, v.floorY + 1.1], [v.floorR - 3, v.floorY + 0.15], [VOLCANO_ARENA.r - 6, v.floorY + 0.1]]) {
    pts.push({ x: v.x + c * r, z: v.z + s * r, y });
  }
  return { pts, width: RIDGE.width, cx: v.x, cz: v.z, reach: footR * 1.15 + 12, hill: -1, caldera: true, ridge: true };
}

/**
 * Where the volcano's mountain path crosses a lava flow, up to two crossings
 * get no bridge but stepping stones: basalt columns standing out of the lava,
 * a jump apart (plan.steps; players stand on them: shared/layout.js).
 */
function planLavaSteps(plan) {
  const climb = plan.ramps.find((r) => r.caldera)?.pts;
  if (!climb) { for (const b of plan.bridges) delete b.cross; return; }
  const v = plan.volcano;
  const cands = plan.bridges.filter((b) => b.cross === climb && Math.hypot(b.x - v.x, b.z - v.z) > v.craterR + 16
    && distToPolyline(plan.trail, b.x, b.z) > b.r + 12);
  for (const b of cands.slice(0, 2)) {
    // along the path across the stream: from bank to bank
    let j = 0, jd = Infinity;
    climb.forEach((p, k) => { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < jd) { jd = d; j = k; } });
    const p0 = climb[Math.max(0, j - 2)], p1 = climb[Math.min(climb.length - 1, j + 2)];
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, dx = (p1.x - p0.x) / l, dz = (p1.z - p0.z) / l;
    const lava = (t) => { const q = riverQuery(plan, b.x + dx * t, b.z + dz * t, 12, 'lava'); return q && !q.flow.ring && q.d < q.width / 2 + 1.5 ? q : null; };
    let t0 = 0, t1 = 0;
    while (t0 > -20 && lava(t0 - 0.25)) t0 -= 0.25;
    while (t1 < 20 && lava(t1 + 0.25)) t1 += 0.25;
    const L = t1 - t0 + 1;                              // (a little onto each bank)
    const n = Math.max(2, Math.round(L / STEPS.spacing));
    for (let k = 0; k < n; k++) {
      const t = t0 - 0.5 + (k + 0.5) * (L / n);
      const x = b.x + dx * t, z = b.z + dz * t;
      const q = riverQuery(plan, x, z, 12, 'lava');
      plan.steps.push({ x, z, r: STEPS.r, top: (q ? q.surface : b.y - 0.9) + STEPS.above });
    }
    b.steps = true;
  }
  plan.bridges = plan.bridges.filter((b) => !b.steps);
  for (const b of plan.bridges) delete b.cross;
}
/** Stepping stones: radius, how far apart (middle to middle) and how high over the lava (m). */
const STEPS = { r: 0.75, spacing: 3.1, above: 0.8 };

/**
 * Lava seeping along the ditch beside the volcano's ridge path, in two or
 * three stretches away from the crossings (flows of their own: gutter).
 */
function ridgeGutters(plan) {
  const climb = plan.ramps.find((r) => r.caldera);
  if (!climb) return;
  const v = plan.volcano, pts = climb.pts, n = pts.length;
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const near = (p) => [...plan.bridges, ...plan.steps].some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 30)
    || plan.flows.some((f) => !f.ring && distToPolyline(f.pts, p.x, p.z) < f.pts[0].w + 12);
  let made = 0, i = Math.floor(n * 0.18);
  while (i < n * 0.85 && made < 3) {
    // a stretch of about 35 m along a steady ridge
    let j = i;
    while (j < n - 1 && len[j] - len[i] < GUTTER.length) j++;
    const run = pts.slice(i, j + 1);
    if (run.some((p) => (p.ridge ?? 0) < 0.99 || near(p))) { i += 3; continue; }
    const out = [];
    for (let k = run.length - 1; k >= 0; k--) {
      const a = pts[Math.max(0, i + k - 1)], b = pts[Math.min(n - 1, i + k + 1)], p = run[k];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      // to the upper side: toward the volcano
      let nx = -tz / tl, nz = tx / tl;
      if (nx * (v.x - p.x) + nz * (v.z - p.z) < 0) { nx = -nx; nz = -nz; }
      const off = RIDGE.width * 0.5 + RIDGE.ditch;
      const y = Math.min(out.length ? out[out.length - 1].y : Infinity, p.y - GUTTER.below);
      out.push({ x: p.x + nx * off, z: p.z + nz * off, y, w: GUTTER.width });
    }
    const flow = { kind: 'lava', pts: out, gutter: true };
    indexRiver(flow);
    plan.flows.push(flow);
    made++;
    i = j + 25;
  }
}
/**
 * Lava pits right across the ridge path, away from its fords, bridges and
 * gutters: the way goes on over stepping stones a jump apart (plan.steps).
 * Each pit is a lava pool of its own (pit: true; its bowl: pitEffect).
 */
function lavaPits(plan) {
  const climb = plan.ramps.find((r) => r.caldera);
  if (!climb) return;
  const pts = climb.pts, n = pts.length;
  const clear = (p) => [...plan.bridges, ...plan.steps, ...plan.pits].every((b) => Math.hypot(b.x - p.x, b.z - p.z) > PITS.gap)
    && plan.flows.every((fl) => fl.ring || distToPolyline(fl.pts, p.x, p.z) > (fl.gutter ? 14 : PITS.gap));
  for (const t of PITS.at) {
    // the nearest steady stretch of ridge to that share of the way up
    let best = -1;
    for (let o = 0; o < n * 0.12 && best < 0; o++) {
      for (const i of [Math.round(n * t) + o, Math.round(n * t) - o]) {
        const p = pts[i];
        if (!p || i < 3 || i > n - 4 || (p.ridge ?? 0) < 0.99 || pts[i - 3].ridge < 0.99 || pts[i + 3].ridge < 0.99 || !clear(p)) continue;
        best = i;
        break;
      }
    }
    if (best < 0) continue;
    const p = pts[best], a = pts[best - 2], b = pts[best + 2];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, dx = (b.x - a.x) / l, dz = (b.z - a.z) / l;
    const pit = { x: p.x, z: p.z, r: PITS.r, level: p.y - 0.7, depth: 0.9, kind: 'lava', pit: true, disc: PITS.r };
    plan.pits.push(pit);
    plan.pools.push(pit);
    // stones along the path, the first and last just inside the rim
    const L = PITS.r * 2, k = Math.max(2, Math.round(L / STEPS.spacing) + 1);
    for (let j = 0; j < k; j++) {
      const u = -PITS.r + 0.6 + (j / (k - 1)) * (L - 1.2);
      plan.steps.push({ x: p.x + dx * u, z: p.z + dz * u, r: STEPS.r, top: pit.level + STEPS.above });
    }
  }
}
/** The ridge path's lava pits: where along the way (share of it), radius, room to anything else (m). */
const PITS = { at: [0.3, 0.55, 0.78], r: 3.6, gap: 22 };

/** The ridge path's lava gutters: stretch length, channel width, how far below the walkway (m). */
const GUTTER = { length: 35, width: 3, below: 2 };

/** Segment intersection: the parameters (t on a, u on b) or null. */
function segCross(a0, a1, b0, b1) {
  const rx = a1.x - a0.x, rz = a1.z - a0.z, sx = b1.x - b0.x, sz = b1.z - b0.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = b0.x - a0.x, qz = b0.z - a0.z;
  const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/**
 * Basalt bridges where the mountain paths and the trail cross a lava flow:
 * the deck lies at the path's own height (at least a little above the lava).
 */
function lavaBridges(plan) {
  const out = [];
  const lines = [...plan.ramps.map((r) => r.pts), plan.trail];
  for (const f of plan.flows) {
    if (f.ring) continue;
    for (const line of lines) {
      for (let i = 0; i < f.pts.length - 1; i++) {
        const a = f.pts[i], b = f.pts[i + 1];
        for (let j = 0; j < line.length - 1; j++) {
          const c = line[j], d = line[j + 1];
          const hit = segCross(a, b, c, d);
          if (!hit) continue;
          const x = lerp(a.x, b.x, hit.t), z = lerp(a.z, b.z, hit.t);
          const lava = lerp(a.y, b.y, hit.t), w = lerp(a.w, b.w, hit.t);
          const pathY = c.y != null ? lerp(c.y, d.y, hit.u) : naturalHeight(plan, x, z);
          const br = { x, z, r: w / 2 + 3.5, y: Math.max(pathY, lava + 0.9), cross: line };
          const near = out.find((o) => Math.hypot(o.x - x, o.z - z) < o.r + br.r);
          if (near) { near.y = Math.max(near.y, br.y); continue; }
          out.push(br);
        }
      }
      // a flow brushing past a path without crossing it gets a bridge there too
      for (const p of f.pts) {
        let bd = Infinity, by = 0;
        for (let j = 0; j < line.length - 1; j++) {
          const c = line[j], d = line[j + 1];
          const vx = d.x - c.x, vz = d.z - c.z;
          const u = clamp(((p.x - c.x) * vx + (p.z - c.z) * vz) / (vx * vx + vz * vz || 1), 0, 1);
          const dd = Math.hypot(c.x + vx * u - p.x, c.z + vz * u - p.z);
          if (dd < bd) { bd = dd; by = c.y != null ? lerp(c.y, d.y, u) : naturalHeight(plan, p.x, p.z); }
        }
        if (bd > p.w / 2 + 4 || out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 4)) continue;
        out.push({ x: p.x, z: p.z, r: p.w / 2 + 3.5 + bd, y: Math.max(by, p.y + 0.9) });
      }
    }
  }
  return out;
}

/** Fumaroles: steaming cracks on the lower flanks and the lowland (hot ground round them). */
function planFumaroles(plan, taken, rng, fnN) {
  const { A } = plan;
  const lines = [plan.trail, ...plan.ramps.map((r) => r.pts)];
  for (let i = 0; i < 4000 && plan.fumaroles.length < 14; i++) {
    const x = rng.range(-A * 0.85, A * 0.85), z = rng.range(-A * 0.85, A * 0.85);
    if (!insideEllipse(plan, x, z, 0.82) || insideVolcanoCrater(plan, x, z, 8)) continue;
    const h = fnN(x, z);
    if (h < 1.5 || h > 34 || slopeOf(fnN, x, z, 2) > 0.6) continue;
    if (Math.hypot(x - plan.hut.x, z - plan.hut.z) < 48 || Math.hypot(x - plan.boat.x, z - plan.boat.z) < 30) continue;
    if (taken.some((t) => !t.hill && t.r < 60 && Math.hypot(t.x - x, t.z - z) < t.r + 4)) continue;
    if (flowDist(plan, x, z) < 12 || lines.some((l) => distToPolyline(l, x, z) < 7)) continue;
    if (plan.fumaroles.some((f) => Math.hypot(f.x - x, f.z - z) < 26)) continue;
    plan.fumaroles.push({ id: plan.fumaroles.length, x, z });
  }
}

/**
 * Small lava craters: glowing pools of lava in bowls of their own, scattered
 * over the gentle ground of the lowland and the volcano's foot. Only where the
 * ground round them is flat, so the rim holds the lava all round (poolEffect
 * shapes the bowl and the rim).
 */
function planLavaCraters(plan, taken, rng, fnN) {
  const { A } = plan;
  const lines = [plan.trail, ...plan.ramps.map((r) => r.pts)];
  const ringAt = (x, z, rr) => {
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const y = fnN(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      lo = Math.min(lo, y); hi = Math.max(hi, y); sum += y;
    }
    return { lo, hi, mean: sum / 12 };
  };
  // a few wide lava lakes first, then smaller craters between them
  for (const { n, r0, r1, tries } of LAVA_CRATERS) {
  let made = 0;
  for (let i = 0; i < tries && made < n; i++) {
    // (anywhere between the volcano's crater and the beach)
    const ang = rng() * TAU, dist = Math.sqrt(rng.range(0.06, 0.64)) * A;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const r = rng.range(r0, r1), R = r * 1.2 + 6;   // R: the outer foot of its rim
    if (!insideEllipse(plan, x, z, 0.8) || insideVolcanoCrater(plan, x, z, 12)) continue;
    if (Math.hypot(x - plan.hut.x, z - plan.hut.z) < 50 || Math.hypot(x - plan.boat.x, z - plan.boat.z) < 35) continue;
    if (taken.some((t) => !t.hill && t.r < 60 && Math.hypot(t.x - x, t.z - z) < t.r + R - 4)) continue;
    // (not on a hilltop: its summit pad levels the ground there afterwards; not
    // up against a basalt spire)
    if (plan.hills.some((f) => Math.hypot(f.x - x, f.z - z) < (f.radius > 15 ? f.radius * 0.6 : f.radius + 4) + R)) continue;
    if (lines.some((l) => distToPolyline(l, x, z) < R + 3)) continue;
    if (flowDist(plan, x, z) < R + 7) continue;
    if (plan.bridges.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + R + 4)) continue;
    if (plan.fumaroles.some((f) => Math.hypot(f.x - x, f.z - z) < R + 8)) continue;
    if (plan.pools.some((p) => Math.hypot(p.x - x, p.z - z) < (p.bank ?? p.r * 2.6) + R + 3)) continue;
    // gentle ground: poolEffect raises the rim all round (a little bank on the
    // lower side), so the lava never hangs over a slope
    const inner = ringAt(x, z, r * 1.4);
    if (inner.lo < 1.5 || inner.hi - inner.lo > 3.6 || slopeOf(fnN, x, z, r * 2) > 0.42) continue;
    plan.pools.push({ x, z, r, level: inner.mean - 0.35, depth: 0.8, rim: 1.4, bank: R, kind: 'lava', small: true, disc: r * 1.2 });
    made++;
  }
  }
}
/** Lava craters per island: how many of which size (radius m), and how hard to look for room. */
const LAVA_CRATERS = [{ n: 5, r0: 8, r1: 12, tries: 12000 }, { n: 16, r0: 4.5, r1: 7, tries: 16000 }];

const insideVolcanoCrater = (plan, x, z, pad) => !!plan.volcano && Math.hypot(x - plan.volcano.x, z - plan.volcano.z) < plan.volcano.craterR + pad;

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
    // the trail crosses the basin on a causeway, gate to gate
    plan.bogs.push({ id: 0, field: 0, x: sa.x, z: sa.z, r, reach: r * 1.2, level, round: true, arena: true, segs: segsNear(sa.x, sa.z, r * 1.2 + BOG.pathHalf + 5) });
  }
  const want = Math.round(95 * (plan.k / 0.86) ** 2);
  for (let i = 0; i < 9000 && plan.bogs.length < want; i++) {
    const x = rng.range(-A * 0.85, A * 0.85), z = rng.range(-plan.B, plan.B);
    if (!insideOutline(plan, x, z, 0.8)) continue;
    const r = i < 3000 ? rng.range(22, 38) : rng.range(9, 22);   // big lagoons first (the crocodiles' home), then smaller bogs between
    const reach = r * 1.15 * 1.3;
    // the whole shoreline (up to ~1.4 r out) clear of the hut, boat, sites and plots; meadows may get wet edges
    if (taken.some((t) => !t.hill && Math.hypot(t.x - x, t.z - z) < (t.meadow ? t.r * 0.5 + r : t.r * 0.85 + r * 1.3))) continue;
    // a bog either joins the field it overlaps (deep enough into it) or keeps clear of all others
    const near = plan.bogs.filter((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 1.35 + 2);
    if (near.some((b) => b.arena || Math.hypot(b.x - x, b.z - z) > (b.r + r) * 1.15)) continue;
    const field = new Set(near.map((b) => b.field));
    if (field.size > 1 || (near.length && plan.bogs.filter((b) => b.field === near[0].field).length >= 14)) continue;
    if (plan.sites.peak && Math.hypot(plan.sites.peak.x - x, plan.sites.peak.z - z) < r * 1.3 + 14) continue;
    if (flowDist(plan, x, z) < reach + 6) continue;
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
