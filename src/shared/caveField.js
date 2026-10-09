// Hollow Mountain (level 4): the heightfield and the ceiling of the cave level.
// Pure functions of the plan (see island.js planCave, caveMaze.js). The world
// stays a heightfield: tunnels and chambers are the low floor, solid rock is a
// high heightfield with walls far steeper than the walk limit, the roof is a
// separate field (Terrain.ceilingAt).
//
//   mountainDepth(seed)   -> (x, z) => metres inside the mountain (negative outside)
//   caveHeight(plan,x,z)  -> final ground height
//   caveCeiling(plan,x,z) -> roof height (>= SKY outdoors, the client/Terrain map that to Infinity)
//   caveOpenSdf(plan,x,z) -> signed distance to the open space (negative = tunnel/chamber floor)
//   caveColumn(plan,x,z,o)-> top / floor / roof / open sdf of one column in a single pass (caveVolume.js)

import { fbm, clamp, lerp, smoothstep } from './rng.js';
import { CAVE_GEOM as G, SUMP } from './caveMaze.js';

/** Roof values at or above this are "open sky" (Terrain.ceilingAt returns Infinity). */
export const CAVE_SKY = 100;
/** Nobody on foot is ever higher than this on the Hollow Mountain (floors and beaches stay below 8 m): the server rejects a walking player above it (the mountain's flanks and top are not for climbing). */
export const CAVE_WALK_MAX = 12;
/** Walls rise from the floor to the rock over this many metres. */
const WALL = 4.5;
/**
 * The rock sill at the end of a false exit: `h` m high, rising between `end1` and `end0` m (measured along the tunnel)
 * before its open end - steeper than any walk or jump, daylight falls in over it.
 */
export const FALSE_SILL = { h: 9, end0: 14, end1: 15 };
/** Smoothing of the union of tunnels and chambers (metres): round junctions. */
const SMIN = 3;
/** How far below the dry floor the swimmable stretch of a flooded tunnel dips. */
export const FLOOD_DEPTH = 3.4;
/** Water surface below the dry floor beside it. */
export const FLOOD_LEVEL = 0.35;
const BUCKET = 32;
const REACH = 38;

const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
const smin = (a, b, k) => 0.5 * (a + b - Math.sqrt((a - b) * (a - b) + k * k));

/**
 * One cove (s = -1 west, +1 east) as a signed distance (negative inside the water/beach pocket, positive in the
 * rock). A bay that narrows toward the mountain, with a rounded head, a wandering side wall and a couple of small
 * rocky nooks cut into it. `side(x, z)` is how far inside the side walls a point lies (the beach's room).
 */
function coveOf(seed, s) {
  const k = s < 0 ? 0 : 1;
  const ph = ((seed >>> (k * 5)) % 628) / 100;
  const face = (z) => G.face + 11 * fbm(z * 0.022 + 9 + k * 7, 3.1, 3, seed + 71 + k);
  const half = (u) => G.coveHalf * (0.82 + 0.2 * smoothstep(0, 70, u)) + 8 * fbm(u * 0.035 + 2, 5 + k * 3, 3, seed + 72 + k) + 4 * Math.sin(u * 0.06 + ph);
  // nooks: small round inlets just outside the side walls
  const nooks = [0, 1].map((i) => {
    const r = 9 + 7 * (((seed >>> (3 + i * 4 + k)) % 97) / 97);
    const u = 26 + 46 * i + 14 * (((seed >>> (9 + i * 3 + k)) % 89) / 89);
    const sgn = (((seed >>> (2 + i + k * 2)) & 1) ? 1 : -1) * (i ? -1 : 1);
    return { r, u, z: sgn * (half(u) + r * 0.35) };
  });
  const base = (x, z) => {
    const u = s * x - face(z);
    return smax(-u, Math.abs(z) - half(Math.max(u, 0)), 14);
  };
  return {
    sdf(x, z) {
      let d = base(x, z);
      const u = s * x - face(z);
      for (const n of nooks) d = smin(d, Math.hypot(u - n.u, z - n.z) - n.r, 7);
      return d;
    },
    side(x, z) { const u = s * x - face(z); return half(Math.max(u, 0)) - Math.abs(z); },
  };
}

/** Distance to the mountain's outside (positive inside): a ragged, lobed outline with two natural coves. */
export function mountainDepth(seed) {
  const p1 = (seed % 628) / 100, p2 = ((seed >>> 8) % 628) / 100, p3 = ((seed >>> 4) % 628) / 100, p4 = ((seed >>> 12) % 628) / 100;
  const [ax, az] = G.radius;
  const west = coveOf(seed, -1), east = coveOf(seed, 1);
  const f = (x, z) => {
    const ang = Math.atan2(z / az, x / ax);
    const warp = 1 + 0.05 * Math.sin(3 * ang + p1) + 0.034 * Math.sin(5 * ang + p2) + 0.026 * Math.sin(2 * ang + p3) + 0.018 * Math.sin(8 * ang + p4);
    const dEll = (warp - Math.hypot(x / ax, z / az)) * Math.min(ax, az);
    // headlands and bays along the shore, small rocky points on top
    const rag = 17 * fbm(x * 0.011 + 3, z * 0.011 - 5, 3, seed + 61) + 5 * fbm(x * 0.04 + 8, z * 0.04, 2, seed + 62);
    return Math.min(dEll + rag, west.sdf(x, z), east.sdf(x, z));
  };
  f.coveSide = (x, z) => (x < 0 ? west : east).side(x, z);
  return f;
}

/** Floor level of the tunnels before flooding (gently rolling, flat at the coves). */
export const floorLevel = (seed, x, z, d) => G.floor + (1.25 * fbm(x * 0.018 + 4, z * 0.018, 2, seed + 11) + 0.4 * fbm(x * 0.075 + 1, z * 0.075, 2, seed + 12)) * smoothstep(0, 60, d);

const cache = new WeakMap();
function fieldOf(plan) {
  let f = cache.get(plan);
  if (!f) { f = buildField(plan); cache.set(plan, f); }
  return f;
}

function buildField(plan) {
  const cave = plan.cave, seed = plan.seed;
  const depth = cave.depthAt = cave.depthAt ?? mountainDepth(seed);
  // --- primitives in a spatial index
  const prims = [];
  const grid = new Map();
  const put = (pr, x0, z0, x1, z1) => {
    const i0 = Math.floor((x0 - REACH) / BUCKET), i1 = Math.floor((x1 + REACH) / BUCKET);
    const j0 = Math.floor((z0 - REACH) / BUCKET), j1 = Math.floor((z1 + REACH) / BUCKET);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 4096 + j;
      let l = grid.get(k);
      if (!l) grid.set(k, l = []);
      l.push(pr);
    }
  };
  for (const t of cave.maze.tunnels) {
    let acc = 0;
    const cum = [0];
    for (let i = 1; i < t.pts.length; i++) { acc += Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].z - t.pts[i - 1].z); cum.push(acc); }
    for (let i = 0; i < t.pts.length - 1; i++) {
      const a = t.pts[i], b = t.pts[i + 1];
      const pr = { type: 0, ax: a.x, az: a.z, bx: b.x, bz: b.z, w0: a.w, w1: b.w, r0: a.roof, r1: b.roof, u0: cum[i] / acc, u1: cum[i + 1] / acc, len: acc, t };
      prims.push(pr);
      put(pr, Math.min(a.x, b.x) - a.w, Math.min(a.z, b.z) - a.w, Math.max(a.x, b.x) + a.w, Math.max(a.z, b.z) + a.w);
    }
  }
  for (const n of cave.maze.nodes) {
    if (n.outside) continue;
    const ra = n.r * Math.sqrt(n.aspect), rb = n.r / Math.sqrt(n.aspect);
    const pr = { type: 1, n, ra, rb, c: Math.cos(n.rot), s: Math.sin(n.rot), roof: n.roof };
    prims.push(pr);
    const R = Math.max(ra, rb) * 1.2;
    put(pr, n.x - R, n.z - R, n.x + R, n.z + R);
  }

  // --- a one-entry memo for the open-space query
  let mx = NaN, mz = NaN, memo = null;
  const query = (x, z) => {
    if (x === mx && z === mz) return memo;
    mx = x; mz = z;
    const list = grid.get(Math.floor(x / BUCKET) * 4096 + Math.floor(z / BUCKET));
    let sum = 0, best = 1e9, rw = 0, rs = 0, dep = 0, fw = 0, y0 = 0, sw = 0, sy = 0, sl = 0, fx = 0;
    if (list) {
      for (const pr of list) {
        let d, roof;
        if (pr.type === 0) {
          const vx = pr.bx - pr.ax, vz = pr.bz - pr.az;
          const raw = ((x - pr.ax) * vx + (z - pr.az) * vz) / (vx * vx + vz * vz || 1);
          const u = clamp(raw, 0, 1);
          const dc = Math.hypot(pr.ax + vx * u - x, pr.az + vz * u - z);
          const half = lerp(pr.w0, pr.w1, u) / 2;
          d = dc - half;
          roof = lerp(pr.r0, pr.r1, u);
          // (a false exit: how much this point belongs to its floor, for the rock sill at its end, see FALSE_SILL)
          if (pr.t.kind === 'falseExit' && dc < half * 1.8 && raw > -0.02 && raw < 1.02) {   // (beside this piece, not before or past it)
            const toEnd = (1 - lerp(pr.u0, pr.u1, u)) * pr.len;   // metres along the tunnel to its open end
            fx = Math.max(fx, (1 - smoothstep(1.1, 1.8, dc / half)) * (1 - smoothstep(FALSE_SILL.end0, FALSE_SILL.end1, toEnd)));
          }
          const fl = pr.t.flooded;
          if (fl && dc < half * 1.8) {
            const arc = lerp(pr.u0, pr.u1, u), n = dc / half;
            const wf = smoothstep(fl.u0, fl.u0 + 0.14, arc) * (1 - smoothstep(fl.u1 - 0.14, fl.u1, arc));
            // the sump: the channel dips deeper and the roof comes down below the water (the roof is the absolute `sy`)
            const sp = fl.sump;
            // (only where the point lies beside this piece, not beyond its end: a neighbour's arc would reach ~10 m too far)
            const sd = sp && raw > -0.5 && raw < 1.5 ? smoothstep(sp.s0 - sp.ramp, sp.s0, arc) * (1 - smoothstep(sp.s1, sp.s1 + sp.ramp, arc)) : 0;
            if (sd > 0) {
              const w = sd * (1 - smoothstep(1, 1.5, n));
              if (w > sw) { sw = w; sl = fl.level; sy = sl - SUMP.clear; }
            }
            const dp = lerp(FLOOD_DEPTH, SUMP.depth, sd) * Math.max(wf, sd) * (1 - smoothstep(0.15, lerp(1, 1.35, sd), n));   // (in the sump the wall rises straight from the deep: no dry ledge under the low roof)
            const flat = smoothstep(fl.u0 - 0.22, fl.u0 - 0.08, arc) * (1 - smoothstep(fl.u1 + 0.08, fl.u1 + 0.22, arc)) * (1 - smoothstep(1, 1.7, n));
            if (dp > dep) dep = dp;
            if (flat > fw) { fw = flat; y0 = fl.y0; }
          }
        } else {
          const dx = x - pr.n.x, dz = z - pr.n.z;
          const lx = dx * pr.c + dz * pr.s, lz = -dx * pr.s + dz * pr.c;
          const th = Math.atan2(lz, lx);
          const wf = 1 + 0.09 * Math.sin(2 * th + pr.n.wob[0]) + 0.06 * Math.sin(3 * th + pr.n.wob[1]);
          d = (Math.hypot(lx / pr.ra, lz / pr.rb) - wf) * Math.min(pr.ra, pr.rb);
          roof = pr.roof + 1.2 * Math.sin(th * 2 + pr.n.wob[1]) * 0.5;
        }
        if (d < best) best = d;
        if (d < 28) {
          sum += Math.exp(-d / SMIN);
          const w = Math.exp(-Math.max(d, -12) / 5);
          rw += w; rs += w * roof;
        }
      }
    }
    const s = sum > 0 ? Math.min(best + 1e-6, -SMIN * Math.log(sum)) : best;
    memo = { s: Math.min(s, 80), roof: rw > 0 ? rs / rw : 8, dep, fw, y0, sw, sy, sl, fx };
    return memo;
  };

  // --- cove / beach ground (no tunnels)
  const sx = (z, side) => side * (G.shore + 10 * fbm(z * 0.02 + 5, 3.3, 2, seed + 91));
  const beachH = (x, z, d) => {
    const side = x < 0 ? -1 : 1;
    const inland = side < 0 ? x - sx(z, -1) : sx(z, 1) - x;
    // the cove's own walls (a tapering, wandering bay: shared/caveField coveOf) leave a margin of shallows
    const e = 8 - depth.coveSide(x, z);
    const land = smoothstep(-3, 3, inland) * (1 - smoothstep(-6, 10, e));
    const out = Math.max(0, -inland, e);
    const shelf = Math.max(-16, -0.3 - 0.05 * out - 0.16 * Math.max(0, out - 24) + 0.6 * fbm(x * 0.03, z * 0.03, 2, seed + 5));
    const beach = 0.35 + (G.floor - 0.35) * smoothstep(0, 60, inland) + 0.3 * fbm(x * 0.09 + 2, z * 0.09, 2, seed + 7) * smoothstep(0, 20, inland);
    let h = lerp(shelf, beach, land);
    // sea cliffs: the water at the mountain's foot is deep at once (nobody wades round the mountain)
    const dOut = Math.max(0, -d);
    const foot = -2.4 - 0.45 * Math.min(dOut, 6) + 14 * smoothstep(4, 14, dOut);
    h = Math.min(h, foot + 12 * smoothstep(0.2, 1, h));
    return h;
  };
  const floorBase = (x, z, d) => floorLevel(seed, x, z, d);

  // --- the mountain's mass above the floor: steep flanks with buttresses, gullies and ledges, a few crags, two summits
  const pk = ((seed >>> 3) % 97) / 97, pq = ((seed >>> 11) % 89) / 89, pr = ((seed >>> 17) % 83) / 83;
  const peakA = { x: (pk - 0.5) * 120, z: (pq - 0.5) * 200, h: 52 + 12 * pr, r: 85 };
  const aAng = 0.9 + 4.4 * pr + pk;
  const peakB = { x: -peakA.x * 0.6 + Math.cos(aAng) * 135, z: peakA.z * 0.5 + Math.sin(aAng) * 150, h: 30 + 10 * pk, r: 62 };
  for (const p of [peakA, peakB]) {   // (a summit sits in the core, well away from the rim)
    for (let i = 0; i < 12 && depth(p.x, p.z) < 95; i++) { p.x *= 0.85; p.z *= 0.85; }
  }
  /** rise (m) at depth d: 2.4 m per m over the first 6 m (67 deg: nobody climbs), easing to 0.5 by 22 m, then 0.4 */
  const belt = (d) => {
    const foot = 4 * (1 - Math.exp(-d / 1.8));   // (a sea cliff's first steps: 75 deg right at the water)
    const u = clamp((d - 6) / 16, 0, 1);
    const K = Math.min(d, 6) + 16 * (u - (u * u * u - u * u * u * u / 2));
    return 0.5 * Math.min(d, 22) + 1.9 * K + 0.4 * Math.max(0, d - 22) + foot;
  };
  const summit = (x, z) => {
    let h = 0;
    for (const p of [peakA, peakB]) {
      const r = Math.hypot(x - p.x, z - p.z) / p.r;
      h += p.h * (0.55 * Math.exp(-r * r * 1.1) + 0.45 * Math.exp(-r * 1.9));
    }
    return h;
  };
  const rise = (x, z, d) => {
    // buttresses and gullies: the flank climbs sooner or later along the shore
    const bw = fbm(x * 0.018 + 13, z * 0.018 - 4, 3, seed + 31);
    // radial ribs running down from the summit
    const ang = Math.atan2(z - peakA.z, x - peakA.x);
    const rib = 1 - Math.abs(fbm(ang * 11 + 5, Math.hypot(x - peakA.x, z - peakA.z) * 0.012, 3, seed + 32));
    const de = d * (1 + 0.12 * bw * smoothstep(0, 14, d));
    const deep = smoothstep(7, 45, d);
    let y = belt(Math.max(de, 0));
    y += summit(x, z) * (0.88 + 0.24 * rib);
    // spurs and valleys (big ridged lumps) and crags (small ones), more of both higher up
    const spur = 1 - Math.abs(fbm(x * 0.011 + 2, z * 0.011 + 6, 3, seed + 33));
    const crag = 1 - Math.abs(fbm(x * 0.035 + 7, z * 0.035 - 2, 2, seed + 37));
    y += smoothstep(22, 90, d) * (30 * spur * spur - 14) + deep * (10 * crag * crag - 4);
    // strata ledges: flat shelves with short drops, wandering with the rock's own layers (high up only)
    const T = 8 + 4 * fbm(x * 0.012 + 1, z * 0.012 + 9, 2, seed + 35), ph = 3 * fbm(x * 0.02 + 5, z * 0.02 + 1, 2, seed + 34);
    const patch = smoothstep(0.0, 0.45, fbm(x * 0.014 + 3, z * 0.014 - 8, 2, seed + 36));
    y += 1.2 * patch * smoothstep(38, 52, y) * Math.sin(y * (Math.PI * 2 / T) + ph);
    return y;
  };

  /** The roof at (x, z) inside the mountain; over a sump it comes down below the water. */
  const roofOf = (x, z, d, q) => {
    const r = floorBase(x, z, d) + clamp(q.roof + 1.1 * fbm(x * 0.04 + 6, z * 0.04, 2, seed + 19), 4.6, 22);
    if (!(q.sw > 0)) return r;
    // (only over water that is deep enough to swim in: a shallow bank keeps its roof, nobody wades under a ceiling at their chin)
    return lerp(r, q.sy, q.sw * smoothstep(0.2, 1.4, q.sl - field.height(x, z)));
  };

  const pads = plan.pads;
  const field = {
    depth,
    floorBase: (x, z) => floorBase(x, z, depth(x, z)),
    open: (x, z) => query(x, z).s,
    /** the roof without the open-sky term (the visual roof, also inside the open canyon mouths) */
    roofBase(x, z) {
      const d = depth(x, z);
      if (d <= 0) return 1e4;
      return roofOf(x, z, d, query(x, z));
    },
    /** the solid rock's height over everything (the mountain's skin; the ground itself over rock, beneath it the tunnels are carved) */
    rockTop(x, z) {
      const d = depth(x, z);
      if (d <= 0) return beachH(x, z, d);
      const h0 = beachH(x, z, d), fc = floorBase(x, z, d);
      const fb = h0 > 0.2 ? lerp(h0, fc, smoothstep(0, 10, d)) : fc;
      return fb + rise(x, z, d);
    },
    height(x, z) {
      const d = depth(x, z);
      const h0 = beachH(x, z, d);
      let h;
      if (d <= 0) h = h0;
      else {
        const q = query(x, z);
        const fc = floorBase(x, z, d);
        let fb = h0 > 0.2 ? lerp(h0, fc, smoothstep(0, 10, d)) : fc;
        if (q.fw > 0) fb = lerp(fb, q.y0, q.fw);
        // a false exit ends in a rock sill a few metres before the sea cliff: too steep and too high to climb or jump,
        // daylight still falls in over it (nobody falls down the cliff)
        const sill = FALSE_SILL.h * q.fx;
        const floor = fb - q.dep + sill;
        const top = fb + rise(x, z, d);
        const s = (q.s + 1.0 * fbm(x * 0.025 + 3, z * 0.025 + 7, 2, seed + 17)) * 1.6;
        h = lerp(floor, top, smoothstep(0, WALL, s));
      }
      for (const p of pads) {
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd < p.r) h = lerp(h, p.h, 1 - smoothstep(p.r * 0.65, p.r, dd));
      }
      return h;
    },
    /**
     * Everything the volume needs of one column in one pass (shares the memoised tunnel query): `top` the highest solid
     * (the ground outdoors, the mountain's skin over the tunnels), `floor` the tunnel floor (= the ground outdoors),
     * `roof` (1e4 outdoors), `s` the open-space distance (metres), `d` the depth into the mountain.
     */
    column(x, z, o) {
      const d = depth(x, z), h0 = beachH(x, z, d);
      o.d = d;
      let floor = h0, top = h0;
      if (d > 0) {
        const q = query(x, z), fc = floorBase(x, z, d);
        const fb0 = h0 > 0.2 ? lerp(h0, fc, smoothstep(0, 10, d)) : fc;
        const fb = q.fw > 0 ? lerp(fb0, q.y0, q.fw) : fb0;
        floor = fb - q.dep + FALSE_SILL.h * q.fx;
        const up = rise(x, z, d);
        const s = (q.s + 1.0 * fbm(x * 0.025 + 3, z * 0.025 + 7, 2, seed + 17)) * 1.6;
        top = Math.max(lerp(floor, fb + up, smoothstep(0, WALL, s)), fb0 + up);   // (the height, and the rock top beside it)
        o.roof = roofOf(x, z, d, q);
        o.s = q.s;
      } else { o.roof = 1e4; o.s = query(x, z).s; }
      for (const p of pads) {
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd < p.r) { const t = 1 - smoothstep(p.r * 0.65, p.r, dd); floor = lerp(floor, p.h, t); top = lerp(top, p.h, t); }
      }
      o.floor = floor; o.top = top;
      return o;
    },
    ceiling(x, z) {
      const d = depth(x, z);
      if (d <= 0) return 1e4;
      const roof = roofOf(x, z, d, query(x, z));
      const s = smoothstep(2, 24, d);
      return roof + 4000 * (1 - s) ** 3;
    },
  };
  return field;
}

export const caveHeight = (plan, x, z) => fieldOf(plan).height(x, z);
export const caveCeiling = (plan, x, z) => fieldOf(plan).ceiling(x, z);
export const caveOpenSdf = (plan, x, z) => fieldOf(plan).open(x, z);
export const caveDepth = (plan, x, z) => fieldOf(plan).depth(x, z);
export const caveFloorBase = (plan, x, z) => fieldOf(plan).floorBase(x, z);
export const caveRoofBase = (plan, x, z) => fieldOf(plan).roofBase(x, z);
export const caveColumn = (plan, x, z, o = {}) => fieldOf(plan).column(x, z, o);
export const caveRockTop = (plan, x, z) => fieldOf(plan).rockTop(x, z);
