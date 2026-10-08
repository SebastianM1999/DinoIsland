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

import { fbm, clamp, lerp, smoothstep } from './rng.js';
import { CAVE_GEOM as G } from './caveMaze.js';

/** Roof values at or above this are "open sky" (Terrain.ceilingAt returns Infinity). */
export const CAVE_SKY = 100;
/** Walls rise from the floor to the rock over this many metres. */
const WALL = 4.5;
/** Smoothing of the union of tunnels and chambers (metres): round junctions. */
const SMIN = 3;
/** How far below the dry floor the swimmable stretch of a flooded tunnel dips. */
export const FLOOD_DEPTH = 3.4;
/** Water surface below the dry floor beside it. */
export const FLOOD_LEVEL = 0.35;
const BUCKET = 32;
const REACH = 38;

const sdRoundBox = (px, pz, hx, hz, r) => {
  const qx = Math.abs(px) - (hx - r), qz = Math.abs(pz) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
};

/** Distance to the mountain's outside (positive inside), ignoring the wobble of the coves. */
export function mountainDepth(seed) {
  const p1 = (seed % 628) / 100, p2 = ((seed >>> 8) % 628) / 100;
  const [ax, az] = G.radius;
  return (x, z) => {
    const ang = Math.atan2(z / az, x / ax);
    const warp = 1 + 0.045 * Math.sin(3 * ang + p1) + 0.03 * Math.sin(5 * ang + p2);
    const dEll = (warp - Math.hypot(x / ax, z / az)) * Math.min(ax, az);
    const wob = 10 * fbm(z * 0.016 + 9, x * 0.004, 2, seed + 71);
    const cove = (s) => sdRoundBox(x - s * (G.face + 210), z, 210, G.coveHalf, 24) + wob;
    return Math.min(dEll, cove(-1), cove(1));
  };
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
      const pr = { type: 0, ax: a.x, az: a.z, bx: b.x, bz: b.z, w0: a.w, w1: b.w, r0: a.roof, r1: b.roof, u0: cum[i] / acc, u1: cum[i + 1] / acc, t };
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
    let sum = 0, best = 1e9, rw = 0, rs = 0, dep = 0, fw = 0, y0 = 0;
    if (list) {
      for (const pr of list) {
        let d, roof;
        if (pr.type === 0) {
          const vx = pr.bx - pr.ax, vz = pr.bz - pr.az;
          const u = clamp(((x - pr.ax) * vx + (z - pr.az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
          const dc = Math.hypot(pr.ax + vx * u - x, pr.az + vz * u - z);
          const half = lerp(pr.w0, pr.w1, u) / 2;
          d = dc - half;
          roof = lerp(pr.r0, pr.r1, u);
          const fl = pr.t.flooded;
          if (fl && dc < half * 1.8) {
            const arc = lerp(pr.u0, pr.u1, u), n = dc / half;
            const wf = smoothstep(fl.u0, fl.u0 + 0.14, arc) * (1 - smoothstep(fl.u1 - 0.14, fl.u1, arc));
            const dp = FLOOD_DEPTH * wf * (1 - smoothstep(0.15, 1, n));
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
    memo = { s: Math.min(s, 80), roof: rw > 0 ? rs / rw : 8, dep, fw, y0 };
    return memo;
  };

  // --- cove / beach ground (no tunnels)
  const sx = (z, side) => side * (G.shore + 10 * fbm(z * 0.02 + 5, 3.3, 2, seed + 91));
  const beachH = (x, z, d) => {
    const side = x < 0 ? -1 : 1;
    const inland = side < 0 ? x - sx(z, -1) : sx(z, 1) - x;
    // the cove narrows toward the sea: a bay between the two horns of the mountain
    const half = 38 + 67 * smoothstep(0, 150, inland) + 9 * fbm(z * 0.022 + 4, x * 0.02, 2, seed + 93);
    const e = Math.abs(z) - half;
    const land = smoothstep(-3, 3, inland) * (1 - smoothstep(-6, 10, e));
    const out = Math.max(0, -inland, e);
    const shelf = Math.max(-16, -0.3 - 0.05 * out - 0.16 * Math.max(0, out - 24) + 0.6 * fbm(x * 0.03, z * 0.03, 2, seed + 5));
    const beach = 0.35 + (G.floor - 0.35) * smoothstep(0, 45, inland) + 0.3 * fbm(x * 0.09 + 2, z * 0.09, 2, seed + 7) * smoothstep(0, 20, inland);
    let h = lerp(shelf, beach, land);
    // sea cliffs: the water at the mountain's foot is deep at once (nobody wades round the mountain)
    const dOut = Math.max(0, -d);
    const foot = -2.4 - 0.45 * Math.min(dOut, 6) + 14 * smoothstep(4, 14, dOut);
    h = Math.min(h, foot + 12 * smoothstep(0.2, 1, h));
    return h;
  };
  const floorBase = (x, z, d) => floorLevel(seed, x, z, d);

  const pads = plan.pads;
  const field = {
    depth,
    floorBase: (x, z) => floorBase(x, z, depth(x, z)),
    open: (x, z) => query(x, z).s,
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
        const floor = fb - q.dep;
        const hm = 30 + 32 * smoothstep(0, 150, d) + 6 * fbm(x * 0.02 + 8, z * 0.02, 3, seed + 13);
        const top = fb + hm * (1 - Math.exp(-d / 4.5));
        const s = (q.s + 1.0 * fbm(x * 0.025 + 3, z * 0.025 + 7, 2, seed + 17)) * 1.6;
        h = lerp(floor, top, smoothstep(0, WALL, s));
      }
      for (const p of pads) {
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd < p.r) h = lerp(h, p.h, 1 - smoothstep(p.r * 0.65, p.r, dd));
      }
      return h;
    },
    ceiling(x, z) {
      const d = depth(x, z);
      if (d <= 0) return 1e4;
      const q = query(x, z);
      const fc = floorBase(x, z, d);
      const roof = fc + clamp(q.roof + 1.1 * fbm(x * 0.04 + 6, z * 0.04, 2, seed + 19), 4.6, 22);
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
