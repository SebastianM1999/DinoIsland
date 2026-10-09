// Hollow Mountain (level 4): the mountain as ONE solid volume, not a heightfield plus patches.
//
// caveRock(plan) answers `rock(x, y, z)`: the sign field of the whole mountain - negative in the rock, positive in the
// air, about a distance (metres) near the surface. Terrain, flank, tunnel walls, floor and roof are all the one
// zero level of this single function, so a mesher (client/world/caveVolumeMesh.js) gets a closed, rounded skin with no
// seams between ground, roof and shell, and later phases can sample floor and ceiling from it.
//
//   air(x,y,z)  = what is open: the sky above the ground (`y - top`) united with the cave, the open space between the
//                 floor and the roof where the tunnel field (caveField `s`) is open. Both are smooth maxima, so the floor
//                 curves into the walls and the walls into the vault (radius ~ KC).
//   rock(x,y,z) = air + low-frequency 3D noise only near the surface (so flanks and walls gain overhangs and ledges;
//                 flat ground - beaches, floors, the seabed - stays exactly as the heightfield: it is what you walk on).
//
// Per column (x, z) everything comes from caveColumn (caveField.js): `top`, `floor`, `roof`, `s`. A column's data is
// `{ top, floor, roof, s, inv }` where `inv = 1 / sqrt(1 + |grad top|^2)` turns a height above the skin into about a
// distance. Pure and deterministic: no randomness, same numbers on client and server.

import { smoothstep } from './rng.js';
import { fbm3 } from './springShape.js';
import { caveColumn, caveDepth } from './caveField.js';
import { CAVE_GEOM as G } from './caveMaze.js';

/** Roundness of the cave's cross-section (floor into wall, wall into vault) and of the union with the outside (metres). */
export const KC = 2.4, KU = 1.6;
/** Surface noise: amplitude (m), wavelength (m). Low frequency, never per vertex. */
export const NOISE = { amp: 0.85, wave: 7 };
/** Columns closer than this to the open space (metres) are sampled over their whole height, the others only round the skin. */
export const NEAR = 7.5;
/** How far outside the mountain's edge the volume reaches (depth, metres): the steep sea cliffs end well inside. */
export const REACH = 16;

export const smx = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

/**
 * The field at (x, y, z) for the column data `c` (`c.inv`, `c.g` = slope of the skin, see the header).
 * @returns {number} negative in the rock, positive in the air
 */
export function volumeField(c, x, y, z, seed = 0) {
  const aOut = (y - c.top) * c.inv;
  const cav = smx(smx(c.s, c.floor - y, KC), y - c.roof, KC);
  const f = smx(aOut, -cav, KU);
  const att = 1 - smoothstep(1.5, 4, Math.abs(f));
  if (att <= 0) return f;
  // noise where the surface is steep (flank) or part of a wall/roof (not within a step of the floor)
  // (the flank term belongs to the skin: a floor deep under a steep slope has the slope's g but no noise)
  // (and not at the foot of the cliff in the coves, where people walk: no ledge there to step onto, the noise starts above head height)
  const foot = Math.abs(z) < G.coveHalf + 50 && Math.abs(x) > G.face - 30 && Math.abs(x) < G.shore + 60 ? smoothstep(4, 8, y) : 1;
  const w = Math.max(smoothstep(0.35, 0.9, c.g) * (1 - smoothstep(3, 6, Math.abs(aOut))) * foot, (1 - smoothstep(NEAR - 2.5, NEAR, c.s)) * smoothstep(1.5, 4, y - c.floor));
  if (w <= 0) return f;
  const L = 1 / NOISE.wave;
  return f + NOISE.amp * fbm3(x * L, y * L, z * L, seed + 5) * att * w;
}

/** Slope data of a column from the gradient of its `top` (rise per metre in x and z). */
export function slopeOf(gx, gz) {
  const g = Math.hypot(gx, gz);
  return { g, inv: 1 / Math.sqrt(1 + g * g) };
}

/**
 * @param {object} plan island plan of the Hollow Mountain (`plan.cave`)
 * @returns {{ seed:number, column(x:number,z:number,o?:object):object, rock(x:number,y:number,z:number):number, region(grow:number):(x:number,z:number)=>boolean, field(c:object,x:number,y:number,z:number):number }}
 */
export function caveRock(plan) {
  const seed = plan.seed;
  const tmp = {};
  const api = {
    seed,
    /** column data (top, floor, roof, s, d) without the slope terms */
    column: (x, z, o = {}) => caveColumn(plan, x, z, o),
    /** the field from column data */
    field: (c, x, y, z) => volumeField(c, x, y, z, seed),
    /** slow general query (five column evaluations): for tests and one-off lookups; the mesher samples a grid */
    rock(x, y, z) {
      const e = 0.6, c = caveColumn(plan, x, z, {});
      const gx = (caveColumn(plan, x + e, z, tmp).top - caveColumn(plan, x - e, z, tmp).top) / (2 * e);
      const gz = (caveColumn(plan, x, z + e, tmp).top - caveColumn(plan, x, z - e, tmp).top) / (2 * e);
      Object.assign(c, slopeOf(gx, gz));
      return volumeField(c, x, y, z, seed);
    },
    /**
     * Where the volume is meshed: the mountain with a margin (`REACH` outside its edge) and the two coves' beaches
     * (a box round each cove), `grow` metres larger. The terrain heightfield draws everything else.
     */
    region(grow = 0) {
      const cz = G.coveHalf + 50 + grow, xa = G.face - 30 - grow, xb = G.shore + 60 + grow;
      return (x, z) => caveDepth(plan, x, z) > -REACH - grow || (Math.abs(z) < cz && Math.abs(x) > xa && Math.abs(x) < xb);
    },
  };
  return api;
}

/** Lattice spacing (metres) of the shared column lattice: the mesher's voxel and the walk grid's source (see volumeLattice). */
export const VOXEL = 1.25;
const GROW = 6;       // (the lattice reaches this much beyond the region the terrain gives up)
const latticeCache = new WeakMap();

/**
 * The 2D data of every column of one uniform lattice (spacing `voxel`) over the volume's region: `top`, `floor`, `roof`,
 * the open distance `sOpen` and the slope of the skin (`g`, `inv`). Both the mesher (client/world/caveVolumeMesh.js) and the
 * sim's walk grid (caveWalk.js) read it, so they see the same field. Cached per plan.
 * `avail[q]` is 0 outside the region. Index q = k * NI + i, position (x0 + i * V, z0 + k * V).
 */
export function volumeLattice(plan, half, voxel = VOXEL) {
  let per = latticeCache.get(plan);
  if (!per) latticeCache.set(plan, per = new Map());
  const key = `${half}/${voxel}`;
  const hit = per.get(key);
  if (hit) return hit;
  const rock = caveRock(plan), V = voxel, seed = rock.seed;
  const inRegion = rock.region(GROW);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let z = -half; z <= half; z += 6) for (let x = -half; x <= half; x += 6) {
    if (!inRegion(x, z)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  x0 = Math.floor((x0 - 8) / V) * V; z0 = Math.floor((z0 - 8) / V) * V;
  const NI = Math.ceil((x1 + 8 - x0) / V) + 1, NK = Math.ceil((z1 + 8 - z0) / V) + 1;
  const N = NI * NK;
  const avail = new Uint8Array(N);
  const top = new Float32Array(N), floor = new Float32Array(N), roof = new Float32Array(N), sOpen = new Float32Array(N);
  const col = {};
  let topMax = -Infinity, topMin = Infinity;
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const x = x0 + i * V, z = z0 + k * V;
    if (!inRegion(x, z)) continue;
    const q = k * NI + i;
    avail[q] = 1;
    rock.column(x, z, col);
    top[q] = col.top; floor[q] = col.floor; roof[q] = col.roof; sOpen[q] = col.s;
    if (col.top > topMax) topMax = col.top;
    if (col.top < topMin) topMin = col.top;
  }
  // slope of the skin: the field's distance scale
  const g = new Float32Array(N), inv = new Float32Array(N);
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const q = k * NI + i;
    if (!avail[q]) continue;
    // (the gentler of the two one-sided slopes: a flat seabed at the foot of a cliff stays flat, a real slope has both alike)
    const t = top[q];
    const fx = i < NI - 1 && avail[q + 1] ? Math.abs(top[q + 1] - t) : -1, bx = i > 0 && avail[q - 1] ? Math.abs(t - top[q - 1]) : -1;
    const fz = k < NK - 1 && avail[q + NI] ? Math.abs(top[q + NI] - t) : -1, bz = k > 0 && avail[q - NI] ? Math.abs(t - top[q - NI]) : -1;
    const gx = (fx < 0 ? bx : bx < 0 ? fx : Math.min(fx, bx)) / V, gz = (fz < 0 ? bz : bz < 0 ? fz : Math.min(fz, bz)) / V;
    const s = slopeOf(gx, gz);
    g[q] = s.g; inv[q] = Math.max(0.12, s.inv);
  }
  // --- 2. the y bands (in lattice units), widened by the neighbours
  const Y0 = Math.floor((topMin - 6) / V) * V + 0.37 * V;   // (off the round levels: a flat floor at exactly -16 m would sit on the lattice)
  const rawLo = new Float32Array(N), rawHi = new Float32Array(N);
  const reachUp = NOISE.amp + KU;
  for (let q = 0; q < N; q++) {
    if (!avail[q]) continue;
    const B = 1 + reachUp / inv[q];
    let lo = top[q] - B, hi = top[q] + B;
    if (roof[q] < 1e3 && sOpen[q] < NEAR) {
      lo = Math.min(lo, floor[q] - B);
      hi = Math.max(hi, Math.min(roof[q], topMax) + B);
    }
    rawLo[q] = lo; rawHi[q] = hi;
  }
  const jlo = new Int32Array(N), jhi = new Int32Array(N).fill(-1), off = new Int32Array(N);
  let total = 0;
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const q = k * NI + i;
    if (!avail[q]) continue;
    let lo = Infinity, hi = -Infinity;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = k + dk;
      if (a < 0 || b < 0 || a >= NI || b >= NK) continue;
      const r = b * NI + a;
      if (!avail[r]) continue;
      if (rawLo[r] < lo) lo = rawLo[r];
      if (rawHi[r] > hi) hi = rawHi[r];
    }
    jlo[q] = Math.floor((lo - Y0) / V); jhi[q] = Math.ceil((hi - Y0) / V);
    off[q] = total; total += jhi[q] - jlo[q] + 1;
  }
  // --- 3. the samples
  const vals = new Float32Array(total);
  const c = { top: 0, floor: 0, roof: 0, s: 0, inv: 1, g: 0 };
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const q = k * NI + i;
    if (!avail[q]) continue;
    c.top = top[q]; c.floor = floor[q]; c.roof = roof[q]; c.s = sOpen[q]; c.inv = inv[q]; c.g = g[q];
    const x = x0 + i * V, z = z0 + k * V;
    for (let j = jlo[q], n = off[q]; j <= jhi[q]; j++, n++) vals[n] = volumeField(c, x, Y0 + j * V, z, seed);
  }
  const at = (q, j) => (j < jlo[q] ? -1 : j > jhi[q] ? 1 : vals[off[q] + j - jlo[q]]);
  const lat = { rock, V, x0, z0, NI, NK, N, avail, top, floor, roof, sOpen, g, inv, topMax, topMin, region: inRegion, Y0, jlo, jhi, off, vals, total, at };
  per.set(key, lat);
  return lat;
}
