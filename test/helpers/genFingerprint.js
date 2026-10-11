// Hashes of everything the island generator makes for a (level, variant): the plan, the Terrain's grids (heights,
// ceilings, the cave walk grid), the layout (colliders, trees, rocks, spawns, sites), sampled height / water / ceiling
// queries and the Hollow Mountain's volume field. Exact bits (a last-bit difference of any number changes its hash).
// Imports only src/shared, so the same file runs in Node (test/cross-engine.test.js) and in a real browser, which loads
// it from a local server: equal hashes mean both engines build the very same island.

import { planIsland } from '../../src/shared/island.js';
import { Terrain } from '../../src/shared/terrain.js';
import { buildLayout } from '../../src/shared/layout.js';
import { caveRock } from '../../src/shared/caveVolume.js';
import { makeRng } from '../../src/shared/rng.js';
import * as dmath from '../../src/shared/dmath.js';

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);

/** Streaming 64-bit hash (two 32-bit FNV/murmur-style lanes) over numbers (exact bits), strings and tokens. */
export class Hasher {
  constructor() { this.a = 0x811c9dc5; this.b = 0x9e3779b1; this.count = 0; }
  word(w) {
    this.a = Math.imul(this.a ^ w, 0x01000193);
    this.b = Math.imul(this.b ^ ((w >>> 7) | (w << 25)), 0x85ebca6b);
    this.b ^= this.b >>> 13;
  }
  num(v) {
    f64[0] = v;
    this.word(u32[0]); this.word(u32[1]);
    this.count++;
  }
  str(s) {
    this.word(s.length | 0x40000000);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
  }
  hex() { return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0'); }
}

/**
 * Deep hash of a value: own enumerable keys in insertion order, arrays, typed arrays, Maps and Sets; functions are
 * skipped, a revisited object hashes as a back reference, objects in `skip` are left out (e.g. the plan inside the layout).
 */
export function deepHash(value, skip = []) {
  const h = new Hasher(), seen = new Map(skip.map((o) => [o, -1]));
  const visit = (v) => {
    if (v === null) { h.word(1); return; }
    switch (typeof v) {
      case 'number': h.word(2); h.num(v); return;
      case 'string': h.word(3); h.str(v); return;
      case 'boolean': h.word(v ? 4 : 5); return;
      case 'undefined': h.word(6); return;
      case 'bigint': h.word(7); h.str(v.toString()); return;
      case 'function': case 'symbol': return;
    }
    if (seen.has(v)) { h.word(8); h.word(seen.get(v)); return; }
    seen.set(v, seen.size);
    if (ArrayBuffer.isView(v)) { h.word(9); h.word(v.length); for (let i = 0; i < v.length; i++) h.num(v[i]); return; }
    if (Array.isArray(v)) { h.word(10); h.word(v.length); for (const x of v) visit(x); return; }
    if (v instanceof Map) { h.word(11); for (const [k, x] of v) { visit(k); visit(x); } return; }
    if (v instanceof Set) { h.word(12); for (const x of v) visit(x); return; }
    h.word(13);
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'function') continue;
      h.str(k);
      visit(v[k]);
    }
  };
  visit(value);
  return h.hex();
}

/** Hash of fn(x, z) over an n x n grid spanning [-half, half] (NaN and null hash too). */
function sampleHash(half, n, fn) {
  const h = new Hasher();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + (2 * half * (i + 0.37)) / n, z = -half + (2 * half * (j + 0.61)) / n;
      const v = fn(x, z);
      h.num(v === null ? -12345.678 : v);
    }
  }
  return h.hex();
}

/**
 * Fingerprint of one island. `parts` picks the sections: 'plan' (cheap), 'terrain', 'layout', 'samples', 'cave'.
 * Returns { section: hex } plus `ms` per section (timings are not part of the comparison).
 */
export function islandFingerprint(level, variant, parts = ['plan', 'terrain', 'layout', 'samples', 'cave']) {
  const out = {}, ms = {};
  const t0 = performance.now();
  const plan = planIsland(level, variant);
  ms.plan = performance.now() - t0;
  if (parts.includes('plan')) out.plan = deepHash(plan);
  if (parts.length === 1 && parts[0] === 'plan') return { hashes: out, ms };

  const t1 = performance.now();
  const terrain = new Terrain(plan);
  ms.terrain = performance.now() - t1;
  if (parts.includes('terrain')) {
    out.heights = deepHash(terrain.heights);
    if (terrain.ceilings) out.ceilings = deepHash(terrain.ceilings);
    if (terrain.walk) {
      // (the stats carry build timings: everything else of the grid)
      const { stats: { ms, msLattice, ...stats } = {}, ...walk } = terrain.walk;
      out.walk = deepHash({ ...walk, stats });
    }
    out.masks = deepHash([terrain.bogMask, terrain.bogLevel, terrain.heatMask]);
  }
  const t2 = performance.now();
  const layout = parts.includes('layout') || parts.includes('cave') ? buildLayout(terrain) : null;
  ms.layout = performance.now() - t2;
  if (parts.includes('layout')) out.layout = deepHash(layout, [plan, terrain]);
  if (parts.includes('samples')) {
    const half = terrain.half * 0.98;
    out.heightAt = sampleHash(half, 160, (x, z) => terrain.heightAt(x, z));
    out.waterAt = sampleHash(half, 120, (x, z) => terrain.waterLevelAt(x, z));
    if (terrain.lavaLevelAt) out.lavaAt = sampleHash(half, 120, (x, z) => terrain.lavaLevelAt(x, z));
    if (terrain.ceilingAt) out.ceilingAt = sampleHash(half, 120, (x, z) => terrain.ceilingAt(x, z));
  }
  if (parts.includes('cave') && plan.cave) {
    const t3 = performance.now();
    const rock = caveRock(plan), col = {};
    const h = new Hasher();
    for (let j = 0; j < 60; j++) {
      for (let i = 0; i < 60; i++) {
        const x = -290 + i * 9.83, z = -280 + j * 9.41;
        rock.column(x, z, col);
        h.num(col.top); h.num(col.floor); h.num(col.roof); h.num(col.s);
        for (const y of [-3, 1.5, 3.2, 5.7, 9.1, 14, 27]) h.num(rock.rock(x, y, z));
      }
    }
    out.volume = h.hex();
    ms.cave = performance.now() - t3;
  }
  return { hashes: out, ms };
}

/** The cases the cross-engine test compares: every level's fixed map in full, plus plans of a few more variants. */
export const FULL_CASES = [[0, 1], [1, 1], [2, 1], [3, 7]];
export const PLAN_CASES = [[0, 2], [0, 5], [1, 3], [2, 4], [3, 1], [3, 2], [3, 5]];

/** Hash of every dmath function over a fixed spread of arguments: small, game-sized, huge, subnormal and special ones. */
export function dmathFingerprint() {
  const h = new Hasher(), rng = makeRng(77);
  const xs = [0, -0, 1, -1, 0.5, Infinity, -Infinity, NaN, 1e-310, -1e-310, 1e300, -1e300, 1e22, Math.PI / 2, 709.7, -745];
  for (let i = 0; i < 4000; i++) {
    const u = rng();
    xs.push((u - 0.5) * (i % 4 === 0 ? 20 : i % 4 === 1 ? 2000 : i % 4 === 2 ? 2 : 1e7));
    if (i % 50 === 0) xs.push(dmath.scalbn(rng() - 0.5, Math.floor(rng() * 2000) - 1000));
  }
  for (const x of xs) {
    for (const f of [dmath.sin, dmath.cos, dmath.tan, dmath.atan, dmath.asin, dmath.acos, dmath.exp, dmath.log]) h.num(f(x));
    h.num(dmath.atan2(x, 0.37 - x * 0.5));
    h.num(dmath.pow(Math.abs(x), 0.731 + (x % 3)));
    h.num(dmath.pow(-Math.abs(x), 3));
    h.num(dmath.hypot(x, 1.5 - x, x * 0.25));
  }
  return { hashes: { dmath: h.hex() }, ms: {} };
}

/** All fingerprints the cross-engine test compares, keyed 'level:variant' (and 'dmath'). */
export function allFingerprints({ full = FULL_CASES, plans = PLAN_CASES } = {}) {
  const out = { dmath: dmathFingerprint() };
  for (const [l, v] of full) out[`${l}:${v}`] = islandFingerprint(l, v);
  for (const [l, v] of plans) out[`${l}:${v}`] = islandFingerprint(l, v, ['plan']);
  return out;
}
