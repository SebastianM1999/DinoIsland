// Hollow Mountain: what you can stand on and what is over your head, sampled from the SAME volume the client draws
// (caveVolume.js), so the walls you cannot walk through are the walls you see.
//
// The sim keeps a floor grid and a ceiling grid, but finer than the island's 2.7 m grid and only where it matters
// (WALK.cell metres, in tiles of WALK.tile cells): round the open space of the mountain (tunnels, chambers, the mouths)
// and on its steep flank. Everywhere else the island's coarse grid stays (flat sand and sea floor are the same there).
//
// Per node (x, z) the volume is scanned along y. The air above the rock is cut into spans; the first span a player
// fits into is the floor (its bottom) and the ceiling (its top). A node with no span that is high enough, or too near a
// wall, is WALL: its floor is the top of the rock (tens of metres up), so `heightAt` has a cliff exactly there and the
// ordinary step rules of the player and the dinosaurs block it. "Too near a wall" is the field eroded by the player's
// radius (`WALK.erode`): the span must exist where the field is above that much, so a centre point that is allowed
// is also a body that fits. Floor and ceiling themselves are the true zero level of the field.
//
// The column data (top, floor, roof, open distance, slope) comes from the shared lattice (`volumeLattice`, 1.25 m) by
// bilinear interpolation: client mesh and sim read the same numbers. Deterministic, no randomness.

import { CONFIG } from './config.js';
import { smoothstep } from './rng.js';
import { CAVE_GEOM as G } from './caveMaze.js';
import { volumeLattice, NEAR } from './caveVolume.js';

/** Bump when the sampling changes: a baked grid (assets/cave) of an older version is ignored. */
export const WALK_VERSION = 1;
/** cell: grid spacing (m); tile: cells per tile side; erode: wall clearance (m, ~ the player's radius); step: vertical scan step (m). */
export const WALK = { cell: 0.5, tile: 16, erode: 0.35, step: 0.5 };
/** Stored for "no roof" (open sky). */
export const SKY = 1e4;

const P = CONFIG.player;
/** free height a player needs (eroded spans lose twice the clearance) */
const HEAD = P.height + 0.05;
/** rock higher than this is never stood on (CAVE_WALK_MAX is 12) */
const DEEP = 20;
const GROW = 3;

export class CaveWalk {
  /**
   * @param {{ox:number, oz:number, cell:number, tile:number, nx:number, nt:number, tileIndex:Int32Array, floor:Float32Array, ceil:Float32Array, stats?:object}} d
   */
  constructor(d) {
    Object.assign(this, d);
    this.t1 = d.tile + 1;
    this.tn = this.t1 * this.t1;
  }

  /** Index of the cell's tile data, -1 when (x, z) is not covered; sets this.fx / this.fz / this.lo (local node index). */
  #cell(x, z) {
    const gx = (x - this.ox) / this.cell, gz = (z - this.oz) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nx - 1) return -1;
    const T = this.tile, ti = (j / T | 0) * this.nt + (i / T | 0);
    const t = this.tileIndex[ti];
    if (t < 0) return -1;
    this.fx = gx - i; this.fz = gz - j;
    return t * this.tn + (j % T) * this.t1 + (i % T);
  }

  #sample(arr, x, z) {
    const o = this.#cell(x, z);
    if (o < 0) return NaN;
    const fx = this.fx, fz = this.fz, s = this.t1;
    const a = arr[o], b = arr[o + 1], c = arr[o + s], d = arr[o + s + 1];
    // (the same triangle split as Terrain.heightAt)
    if (fx + fz < 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  /** Floor height at (x, z), or NaN when the point is outside the covered tiles. */
  height(x, z) { return this.#sample(this.floor, x, z); }
  /** Raw roof value (>= CAVE_SKY: open) at (x, z), or NaN outside the covered tiles. */
  ceiling(x, z) { return this.#sample(this.ceil, x, z); }
  /** Is (x, z) in a covered tile? */
  covers(x, z) { return this.#cell(x, z) >= 0; }
}

/** weight of the fine value: 1 round the open space and on the steep flank, 0 elsewhere (there the coarse grid is as good) */
function weightOf(x, z, top, g, s) {
  let w = 0;
  w = 1 - smoothstep(2.5, 4, s);   // (also in the open coves: there the smooth union of the cavity and the sky dents the sand)
  // (the steep flank only where someone can walk up to it: the two coves; the rest is a sea cliff in deep water)
  if (top < 24 && g > 0.2 && Math.abs(z) < G.coveHalf + 30 && Math.abs(x) > G.face - 30 && Math.abs(x) < G.shore + 30) w = Math.max(w, smoothstep(0.2, 0.35, g));
  return w;
}

/**
 * Build the walk grid of a Hollow Mountain plan.
 * @param {object} plan island plan with `plan.cave`
 * @param {{half:number, coarseHeight:(x:number,z:number)=>number, coarseCeiling:(x:number,z:number)=>number}} src the island's coarse grid
 * @returns {CaveWalk}
 */
export function buildCaveWalk(plan, { half, coarseHeight, coarseCeiling }) {
  const t0 = performance.now();
  const lat = volumeLattice(plan, half);
  const { V, x0, z0, NI, NK, avail, top: lTop, g: lG, sOpen, Y0, jlo, jhi, at } = lat;
  const tLattice = performance.now();
  const F = WALK.cell, T = WALK.tile, r = WALK.erode;
  const nx = Math.round(2 * half / F) + 1;
  const nt = Math.ceil((nx - 1) / T);
  const tileIndex = new Int32Array(nt * nt).fill(-1);

  // --- 1. the weight of every lattice column, grown by GROW cells (a bit more than the island grid's cell: the coarse
  // values are smeared over a whole cell round a wall), and the tiles that hold any weight (+ 2 m for the interpolation)
  const wl = new Float32Array(NI * NK), wd = new Float32Array(NI * NK);
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const q = k * NI + i;
    if (avail[q]) wl[q] = weightOf(x0 + i * V, z0 + k * V, lTop[q], lG[q], sOpen[q]);
  }
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {   // (max filter, rows)
    let m = 0;
    for (let d = Math.max(0, i - GROW); d <= Math.min(NI - 1, i + GROW); d++) m = Math.max(m, wl[k * NI + d]);
    wd[k * NI + i] = m;
  }
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {   // (columns)
    let m = 0;
    for (let d = Math.max(0, k - GROW); d <= Math.min(NK - 1, k + GROW); d++) m = Math.max(m, wd[d * NI + i]);
    wl[k * NI + i] = m;
  }
  let nTiles = 0;
  const mark = (x, z) => {
    const i = Math.floor((x + half) / F / T), j = Math.floor((z + half) / F / T);
    if (i < 0 || j < 0 || i >= nt || j >= nt) return;
    if (tileIndex[j * nt + i] < 0) tileIndex[j * nt + i] = nTiles++;
  };
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) {
    const q = k * NI + i;
    if (!avail[q] || wl[q] <= 0) continue;
    const x = x0 + i * V, z = z0 + k * V;
    mark(x - 2, z - 2); mark(x + 2, z - 2); mark(x - 2, z + 2); mark(x + 2, z + 2);
  }
  const t1 = T + 1, tn = t1 * t1;
  const floor = new Float32Array(nTiles * tn), ceil = new Float32Array(nTiles * tn);
  let scanned = 0, walls = 0;

  // --- 2. the nodes: the volume's own samples (the mesh's), blended bilinearly over the lattice cell, cut into air spans
  const ys = [], fs = [];
  const trueSp = [], eroSp = [];
  const out = { floor: 0, ceil: 0 };
  const spansOf = (level, spans) => {
    spans.length = 0;
    let start = fs[0] >= level ? ys[0] : NaN;
    for (let t = 1; t < ys.length; t++) {
      const a = fs[t - 1] >= level, b = fs[t] >= level;
      if (a === b) continue;
      const y = ys[t - 1] + (ys[t] - ys[t - 1]) * ((level - fs[t - 1]) / (fs[t] - fs[t - 1]));
      if (b) start = y; else { spans.push(start, y); start = NaN; }
    }
    if (start === start) spans.push(start, Infinity);
  };
  /** floor and ceiling of the column at (x, z) in the lattice cell with lower corner q (fractions a, b) */
  const scan = (q, a, b) => {
    const q10 = q + 1, q01 = q + NI, q11 = q01 + 1;
    const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    const jl = Math.min(jlo[q], jlo[q10], jlo[q01], jlo[q11]), jh = Math.max(jhi[q], jhi[q10], jhi[q01], jhi[q11]);
    ys.length = 0; fs.length = 0;
    for (let j = jl; j <= jh; j++) {
      ys.push(Y0 + j * V);
      fs.push(at(q, j) * w00 + at(q10, j) * w10 + at(q01, j) * w01 + at(q11, j) * w11);
    }
    spansOf(0, trueSp);
    spansOf(r, eroSp);
    const top = trueSp.length ? trueSp[trueSp.length - 2] : Y0 + jh * V;
    for (let e = 0; e < eroSp.length; e += 2) {
      if (eroSp[e + 1] - eroSp[e] < HEAD - 2 * r) continue;
      let k = 0;
      for (; k < trueSp.length; k += 2) if (trueSp[k] <= eroSp[e] + 1e-6 && trueSp[k + 1] >= eroSp[e + 1] - 1e-6) break;
      if (k >= trueSp.length) k = -1;
      out.floor = k < 0 ? eroSp[e] : trueSp[k];
      out.ceil = k < 0 ? eroSp[e + 1] : trueSp[k + 1];
      if (out.ceil === Infinity) out.ceil = SKY;
      return;
    }
    // (no room for a body: the top of the rock)
    out.floor = top;
    out.ceil = SKY;
  };

  const tileOrigin = new Int32Array(nTiles * 2);
  for (let ti = 0; ti < nt * nt; ti++) {
    const t = tileIndex[ti];
    if (t < 0) continue;
    tileOrigin[t * 2] = (ti % nt) * T; tileOrigin[t * 2 + 1] = (ti / nt | 0) * T;
  }
  for (let t = 0; t < nTiles; t++) {
    const gi0 = tileOrigin[t * 2], gj0 = tileOrigin[t * 2 + 1];
    for (let lj = 0; lj <= T; lj++) for (let li = 0; li <= T; li++) {
      const gi = gi0 + li, gj = gj0 + lj, o = t * tn + lj * t1 + li;
      const x = -half + gi * F, z = -half + gj * F;
      let fv = coarseHeight(x, z), cv = coarseCeiling(x, z);
      const u = (x - x0) / V, v = (z - z0) / V, ci = Math.floor(u), ck = Math.floor(v);
      if (ci >= 0 && ck >= 0 && ci < NI - 1 && ck < NK - 1) {
        const q = ck * NI + ci;
        if (avail[q] && avail[q + 1] && avail[q + NI] && avail[q + NI + 1]) {
          const a = u - ci, b = v - ck;
          const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
          const topI = lTop[q] * w00 + lTop[q + 1] * w10 + lTop[q + NI] * w01 + lTop[q + NI + 1] * w11;
          const sI = sOpen[q] * w00 + sOpen[q + 1] * w10 + sOpen[q + NI] * w01 + sOpen[q + NI + 1] * w11;
          const w = wl[q] * w00 + wl[q + 1] * w10 + wl[q + NI] * w01 + wl[q + NI + 1] * w11;
          if (w > 0) {
            scanned++;
            if (sI > 1.5 && topI > DEEP) { out.floor = topI; out.ceil = SKY; }   // (rock far above anything a player reaches: no scan)
            else scan(q, a, b);
            if (out.floor - topI > -0.5 && out.floor > 12) walls++;
            fv = w >= 1 ? out.floor : fv + (out.floor - fv) * w;
            cv = w >= 0.5 ? out.ceil : cv;
          }
        }
      }
      floor[o] = fv; ceil[o] = cv;
    }
  }
  return new CaveWalk({
    ox: -half, oz: -half, cell: F, tile: T, nx, nt, tileIndex, floor, ceil,
    stats: { tiles: nTiles, nodes: nTiles * tn, scanned, walls, bytes: nTiles * tn * 8 + tileIndex.byteLength, msLattice: tLattice - t0, ms: performance.now() - t0 },
  });
}
