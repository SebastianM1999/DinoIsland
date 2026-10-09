// Hollow Mountain bake: the volume mesh and the walk grid of a FIXED map, built offline (scripts/bakeCave.mjs) into one small
// binary (assets/cave/island4-v7.bin) so an island load does not spend seconds meshing and painting a million triangles.
//
// File: 'DCAV', u32 format, u32 header length, header (JSON), then the sections (each gzip'd, offsets in the header):
//   walk   the sim's floor and ceiling grids (caveWalk.js), exact Float32: the server and every client that load it agree to the bit
//   mesh   the painted volume mesh (caveVolumeMesh.js + the vertex paint of client/world/caveTerrain.js), quantised:
//          positions uint16 per chunk box, normals int8 octahedral, colours uint16, surface weights uint8, indices uint16
// A bake carries two keys. `walkKey` hashes everything the walk grid depends on (the format, WALK_VERSION, the seed and a probe of the
// field itself: 48 columns and 48 samples of the volume), `meshKey` adds the mesher's and the painter's versions and a probe of the
// painted colours. A loader computes the keys of the live code and uses a bake only when they agree; otherwise it builds live.
// Registry: the browser preloads a file and registers it; a Node host installs a synchronous provider (server/caveBake.js).
// Pure data and numbers: no DOM, no node: imports (the platform loaders inflate the sections).

import { caveRock } from './caveVolume.js';
import { VOXEL } from './caveVolume.js';
import { CaveWalk, WALK_VERSION } from './caveWalk.js';
import { levelDef } from './levels.js';

/** Container layout version. */
export const BAKE_FORMAT = 1;
/** Bump when caveVolumeMesh.js changes what it makes (the mesh is not hashed). */
export const MESH_VERSION = 1;
/** Folder of the baked files, relative to the site root. */
export const BAKE_DIR = 'assets/cave/';

/** File name of a Hollow Mountain map: island<N>-v<variant>.bin (N = the level's number, 4). */
export const bakeFile = (levelIndex, variant) => `island${levelDef(levelIndex).number}-v${variant}.bin`;

// ------------------------------------------------------------------------------------------------ keys

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
/** 64-bit FNV-style hash of a list of numbers (their exact bits), as 16 hex digits */
export function hashNumbers(list) {
  let a = 0x811c9dc5, b = 0x9e3779b1;
  for (const v of list) {
    f64[0] = Math.fround(v);   // (float32 resolution: a rounding wobble of the last bit of a double does not matter)
    for (let k = 0; k < 2; k++) {
      a = Math.imul(a ^ u32[k], 0x01000193);
      b = Math.imul(b ^ ((u32[k] >>> 7) | (u32[k] << 25)), 0x85ebca6b);
      b ^= b >>> 13;
    }
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const probeCache = new WeakMap();
/** The numbers of a fixed set of field samples of the plan: columns and volume values at 48 well-spread points. */
export function fieldProbe(plan) {
  let p = probeCache.get(plan);
  if (p) return p;
  const rock = caveRock(plan), out = [];
  const o = {};
  for (let i = 1; i <= 48; i++) {
    // (a Halton-like scatter over the mountain's footprint)
    const hx = (((i * 0.7548776662) % 1) - 0.5) * 2, hz = (((i * 0.5698402909) % 1) - 0.5) * 2;
    const x = hx * 285, z = hz * 270;
    rock.column(x, z, o);
    out.push(o.top, o.floor, o.roof, o.s);
    out.push(rock.rock(x, 2 + (i % 7) * 1.3, z), rock.rock(x, 6 + (i % 5) * 2.2, z));
  }
  probeCache.set(plan, p = out);
  return p;
}

const keyCache = new WeakMap();
/** Key of the walk grid for this plan: everything its numbers depend on, except the sampling code in caveWalk.js (WALK_VERSION). */
export function walkKey(plan) {
  let k = keyCache.get(plan);
  if (!k) keyCache.set(plan, k = hashNumbers([BAKE_FORMAT, WALK_VERSION, VOXEL, plan.seed, plan.variant, plan.level.index, ...fieldProbe(plan)]));
  return k;
}
/** Key of the mesh: the walk's inputs, the mesher's version and `paint`, numbers the painter produced for fixed probes. */
export function meshKey(plan, paint = []) {
  return hashNumbers([BAKE_FORMAT, MESH_VERSION, ...fieldProbe(plan), ...paint, plan.seed, plan.variant]);
}

// ------------------------------------------------------------------------------------------------ walk section

const WALK_HEAD = 48;
/** Float32 values as four byte planes (the high bytes alike: gzip likes it); exact */
function floatPlanes(f) {
  const n = f.length, src = new Uint8Array(f.buffer, f.byteOffset, f.byteLength), o = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) o[k * n + i] = src[i * 4 + k];
  return o;
}
function unplaneFloats(bytes, off, n) {
  const a = new Float32Array(n), dst = new Uint8Array(a.buffer);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) dst[i * 4 + k] = bytes[off + k * n + i];
  return a;
}
export function encodeWalk(W) {
  const nTiles = W.floor.length / W.tn;
  const bytes = new Uint8Array(WALK_HEAD + W.tileIndex.byteLength + W.floor.byteLength + W.ceil.byteLength);
  const dv = new DataView(bytes.buffer);
  dv.setFloat64(0, W.ox, true); dv.setFloat64(8, W.oz, true); dv.setFloat64(16, W.cell, true);
  dv.setUint32(24, W.tile, true); dv.setUint32(28, W.nx, true); dv.setUint32(32, W.nt, true); dv.setUint32(36, nTiles, true);
  let o = WALK_HEAD;
  bytes.set(new Uint8Array(W.tileIndex.buffer, W.tileIndex.byteOffset, W.tileIndex.byteLength), o); o += W.tileIndex.byteLength;
  for (const a of [W.floor, W.ceil]) { bytes.set(floatPlanes(a), o); o += a.byteLength; }
  return bytes;
}
export function decodeWalk(bytes, stats = {}) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tile = dv.getUint32(24, true), nx = dv.getUint32(28, true), nt = dv.getUint32(32, true), nTiles = dv.getUint32(36, true);
  const tn = (tile + 1) ** 2;
  let o = WALK_HEAD;
  const tileIndex = new Int32Array(bytes.slice(o, o + nt * nt * 4).buffer); o += nt * nt * 4;
  const floor = unplaneFloats(bytes, o, nTiles * tn); o += nTiles * tn * 4;
  const ceil = unplaneFloats(bytes, o, nTiles * tn);
  return new CaveWalk({
    ox: dv.getFloat64(0, true), oz: dv.getFloat64(8, true), cell: dv.getFloat64(16, true), tile, nx, nt, tileIndex, floor, ceil,
    stats: { ...stats, tiles: nTiles, nodes: nTiles * tn, bytes: nTiles * tn * 8 + tileIndex.byteLength, baked: true },
  });
}

// ------------------------------------------------------------------------------------------------ mesh section

const q16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
/** unit vector -> octahedral (two values in [-1, 1]) */
function octEncode(x, y, z) {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / s, v = y / s;
  if (z < 0) { const ou = u; u = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1); v = (1 - Math.abs(ou)) * (v >= 0 ? 1 : -1); }
  return [u, v];
}
function octDecode(u, v, out, o) {
  const z = 1 - Math.abs(u) - Math.abs(v);
  let x = u, y = v;
  if (z < 0) { x = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1); y = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); }
  const l = Math.hypot(x, y, z) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
}
const COLOR_MAX = 2;   // (colours are stored over 0..2, as the square root: the dark end keeps its resolution)

// Streams are stored as differences to the previous vertex (neighbours are alike) and 16-bit ones split into a low and a high byte
// plane: both make the gzip of the file several times smaller.
/** Uint8 stream of `n` elements with `stride` components -> differences (in place on a copy) */
function deltaBytes(a, stride) { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] - (i >= stride ? a[i - stride] : 0)) & 255; return o; }
function undeltaBytes(a, stride) { for (let i = stride; i < a.length; i++) a[i] = (a[i] + a[i - stride]) & 255; return a; }
/** Uint16 stream -> [low bytes..., high bytes...] of the differences */
function deltaPlanes(a, stride) {
  const n = a.length, o = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { const d = (a[i] - (i >= stride ? a[i - stride] : 0)) & 65535; o[i] = d & 255; o[n + i] = d >> 8; }
  return o;
}
function undeltaPlanes(bytes, off, n, stride) {
  const a = new Uint16Array(n);
  for (let i = 0; i < n; i++) a[i] = ((bytes[off + i] | (bytes[off + n + i] << 8)) + (i >= stride ? a[i - stride] : 0)) & 65535;
  return a;
}

/**
 * @param {{pos:Float32Array, nor:Float32Array, col:Float32Array, sf:Float32Array, sf2:Float32Array, idx:Uint32Array|Uint16Array, ci:number, ck:number}[]} chunks
 */
export function encodeMesh(chunks) {
  let nv = 0, ni = 0;
  for (const c of chunks) { nv += c.pos.length / 3; ni += c.idx.length; if (c.pos.length / 3 > 65535) throw new Error('chunk too big for 16-bit indices'); }
  const TABLE = 40;   // per chunk: ci,ck (u16), nv, ni (u32), box min xyz + size xyz (f32)
  const posQ = new Uint16Array(nv * 3), norQ = new Uint8Array(nv * 2), colQ = new Uint8Array(nv * 3), sfQ = new Uint8Array(nv * 4), sf2Q = new Uint8Array(nv * 2), idxQ = new Uint16Array(ni);
  const table = new Uint8Array(chunks.length * TABLE), dv = new DataView(table.buffer);
  let v0 = 0, i0 = 0, t = 0;
  for (const c of chunks) {
    const m = c.pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < m; v++) for (let k = 0; k < 3; k++) { const p = c.pos[v * 3 + k]; if (p < lo[k]) lo[k] = p; if (p > hi[k]) hi[k] = p; }
    const size = hi.map((h, k) => Math.max(h - lo[k], 1e-3));
    dv.setUint16(t, c.ci, true); dv.setUint16(t + 2, c.ck, true); dv.setUint32(t + 4, m, true); dv.setUint32(t + 8, c.idx.length, true);
    for (let k = 0; k < 3; k++) { dv.setFloat32(t + 12 + k * 4, lo[k], true); dv.setFloat32(t + 24 + k * 4, size[k], true); }
    t += TABLE;
    for (let v = 0; v < m; v++) {
      const g = v0 + v;
      for (let k = 0; k < 3; k++) posQ[g * 3 + k] = q16((c.pos[v * 3 + k] - lo[k]) / size[k]);
      const [u, w] = octEncode(c.nor[v * 3], c.nor[v * 3 + 1], c.nor[v * 3 + 2]);
      norQ[g * 2] = Math.round(u * 127) & 255; norQ[g * 2 + 1] = Math.round(w * 127) & 255;
      for (let k = 0; k < 3; k++) colQ[g * 3 + k] = Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, c.col[v * 3 + k]) / COLOR_MAX) * 255)));
      for (let k = 0; k < 4; k++) sfQ[g * 4 + k] = Math.max(0, Math.min(255, Math.round(c.sf[v * 4 + k] * 255)));
      for (let k = 0; k < 2; k++) sf2Q[g * 2 + k] = Math.max(0, Math.min(255, Math.round(c.sf2[v * 2 + k] * 255)));
    }
    for (let i = 0; i < c.idx.length; i++) idxQ[i0 + i] = c.idx[i];
    v0 += m; i0 += c.idx.length;
  }
  const parts = [table, deltaPlanes(posQ, 3), deltaBytes(norQ, 2), deltaBytes(colQ, 3), deltaBytes(sfQ, 4), deltaBytes(sf2Q, 2), deltaPlanes(idxQ, 1)];
  const bytes = new Uint8Array(16 + parts.reduce((s, p) => s + p.length, 0)), hd = new DataView(bytes.buffer);
  hd.setUint32(0, chunks.length, true); hd.setUint32(4, nv, true); hd.setUint32(8, ni, true);
  let o = 16;
  for (const p of parts) { bytes.set(p, o); o += p.length; }
  return bytes;
}

/** @returns {{pos:Float32Array, nor:Float32Array, col:Float32Array, sf:Float32Array, sf2:Float32Array, idx:Uint16Array, ci:number, ck:number}[]} */
export function decodeMesh(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nChunks = dv.getUint32(0, true), nv = dv.getUint32(4, true), ni = dv.getUint32(8, true);
  const TABLE = 40, b0 = bytes.byteOffset;
  let o = 16 + nChunks * TABLE;
  const posQ = undeltaPlanes(bytes, o, nv * 3, 3); o += nv * 6;
  const sub = (n) => { const s = bytes.slice(o, o + n); o += n; return s; };
  const norQ = undeltaBytes(sub(nv * 2), 2), colQ = undeltaBytes(sub(nv * 3), 3), sfQ = undeltaBytes(sub(nv * 4), 4), sf2Q = undeltaBytes(sub(nv * 2), 2);
  const idxQ = undeltaPlanes(bytes, o, ni, 1);
  void b0;
  const out = [];
  let v0 = 0, i0 = 0;
  for (let c = 0, t = 16; c < nChunks; c++, t += TABLE) {
    const ci = dv.getUint16(t, true), ck = dv.getUint16(t + 2, true), m = dv.getUint32(t + 4, true), n = dv.getUint32(t + 8, true);
    const lo = [0, 1, 2].map((k) => dv.getFloat32(t + 12 + k * 4, true)), size = [0, 1, 2].map((k) => dv.getFloat32(t + 24 + k * 4, true));
    const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), sf = new Float32Array(m * 4), sf2 = new Float32Array(m * 2);
    for (let v = 0; v < m; v++) {
      const g = v0 + v;
      for (let k = 0; k < 3; k++) pos[v * 3 + k] = lo[k] + posQ[g * 3 + k] / 65535 * size[k];
      octDecode(((norQ[g * 2] << 24) >> 24) / 127, ((norQ[g * 2 + 1] << 24) >> 24) / 127, nor, v * 3);
      for (let k = 0; k < 3; k++) { const q = colQ[g * 3 + k] / 255; col[v * 3 + k] = q * q * COLOR_MAX; }
      for (let k = 0; k < 4; k++) sf[v * 4 + k] = sfQ[g * 4 + k] / 255;
      for (let k = 0; k < 2; k++) sf2[v * 2 + k] = sf2Q[g * 2 + k] / 255;
    }
    out.push({ pos, nor, col, sf, sf2, idx: idxQ.slice(i0, i0 + n), ci, ck });
    v0 += m; i0 += n;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ container

const MAGIC = [0x44, 0x43, 0x41, 0x56];   // 'DCAV'
/**
 * @param {{header:object, sections:Record<string, Uint8Array>}} parts `sections` already compressed
 */
export function packBake({ header, sections }) {
  const names = Object.keys(sections);
  const h = { ...header, format: BAKE_FORMAT, sections: [] };
  let off = 0;
  for (const n of names) { h.sections.push({ name: n, offset: off, length: sections[n].length }); off += sections[n].length; }
  const hb = new TextEncoder().encode(JSON.stringify(h));
  const out = new Uint8Array(12 + hb.length + off);
  out.set(MAGIC, 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(4, BAKE_FORMAT, true); dv.setUint32(8, hb.length, true);
  out.set(hb, 12);
  for (const s of h.sections) out.set(sections[s.name], 12 + hb.length + s.offset);
  return out;
}
/** @returns {{header:object, section(name:string):Uint8Array|null}|null} null if this is not a bake of this format */
export function unpackBake(bytes) {
  if (bytes.length < 12 || MAGIC.some((m, i) => bytes[i] !== m)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(4, true) !== BAKE_FORMAT) return null;
  const hl = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl)));
  const base = 12 + hl;
  return { header, section: (name) => { const s = header.sections.find((q) => q.name === name); return s ? bytes.subarray(base + s.offset, base + s.offset + s.length) : null; } };
}

// ------------------------------------------------------------------------------------------------ registry

/** loaded bakes: "level/variant" -> { header, walk: Uint8Array (inflated) | null, mesh: Uint8Array (inflated) | null } */
const loaded = new Map();
let provider = null;
const slot = (levelIndex, variant) => `${levelIndex}/${variant}`;
/** A host that can read files synchronously (Node) installs this: (levelIndex, variant) => { header, walk, mesh } | null. */
export function setCaveBakeProvider(fn) { provider = fn; }
/** Register an inflated bake (the browser's preload does this). */
export function registerCaveBake(levelIndex, variant, bake) { loaded.set(slot(levelIndex, variant), bake); }
export function forgetCaveBakes() { loaded.clear(); }

/** The bake of this plan if one is loaded (or the provider has it) and its keys match the live code, else null. */
export function caveBakeFor(plan, want = 'walk') {
  if (!plan.cave) return null;
  const key = slot(plan.level.index, plan.variant);
  let b = loaded.get(key);
  if (b === undefined && provider) { b = provider(plan.level.index, plan.variant); loaded.set(key, b ?? null); }
  if (!b || !b.header) return null;
  if (b.header.walkKey !== walkKey(plan)) return null;
  if (want === 'walk') return b.walk ? b : null;
  return b[want] ? b : null;
}
