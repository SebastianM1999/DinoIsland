// Synchronous reader for the Hollow Mountain bakes (assets/cave, see src/shared/caveBake.js) in Node: the game host and the
// build/test scripts install it so a Terrain built for a baked fixed map takes its walk grid (and, for the scripts, the
// mesh) from the file. A missing or foreign file is simply "no bake".

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BAKE_DIR, bakeFile, setCaveBakeProvider, unpackBake } from '../src/shared/caveBake.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the bake file of a map. */
export const bakePath = (levelIndex, variant) => path.join(ROOT, BAKE_DIR, bakeFile(levelIndex, variant));

/** Read a bake: { header, walk, mesh } with inflated sections, or null. `mesh: false` skips the mesh section. */
export function readCaveBake(levelIndex, variant, { mesh = false } = {}) {
  let bytes;
  try { bytes = new Uint8Array(fs.readFileSync(bakePath(levelIndex, variant))); } catch { return null; }
  const pack = unpackBake(bytes);
  if (!pack) return null;
  const inflate = (name) => { const s = pack.section(name); return s ? new Uint8Array(zlib.gunzipSync(s)) : null; };
  return { header: pack.header, walk: inflate('walk'), mesh: mesh ? inflate('mesh') : null };
}

/** Let Terrain find baked walk grids on disk. */
export function installCaveBakes(opts) {
  setCaveBakeProvider((levelIndex, variant) => readCaveBake(levelIndex, variant, opts));
}
