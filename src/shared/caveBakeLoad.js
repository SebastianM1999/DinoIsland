// Loading a Hollow Mountain bake (caveBake.js) from bytes, with web-standard APIs only (fetch, DecompressionStream, URL): the
// page and the solo Web Worker preload the file before they build the island (their Terrain is built synchronously); Node
// hosts use the synchronous provider in server/caveBake.js instead.

import { BAKE_DIR, bakeFile, registerCaveBake, unpackBake } from './caveBake.js';
import { levelDef } from './levels.js';

/** gunzip with DecompressionStream */
export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Inflate and register the bake in `bytes` for (levelIndex, variant); false if the bytes are not a bake of this format.
 * `mesh: false` skips the (big) mesh section: the sim only needs the walk grid.
 */
export async function registerBakeBytes(levelIndex, variant, bytes, { mesh = true } = {}) {
  const pack = unpackBake(bytes);
  if (!pack) return false;
  const walk = pack.section('walk'), meshSection = mesh ? pack.section('mesh') : null;
  registerCaveBake(levelIndex, variant, {
    header: pack.header,
    walk: walk ? await gunzip(walk) : null,
    mesh: meshSection ? await gunzip(meshSection) : null,
  });
  return true;
}

const pending = new Map();
/**
 * Fetch and register the baked file of a Hollow Mountain map, if the server has one (no file: nothing happens, the island builds
 * live). Safe to call again; resolves true when a bake is registered. Never rejects.
 */
export function preloadCaveBake(levelIndex, variant = levelDef(levelIndex).variant, { mesh = true } = {}) {
  if (levelDef(levelIndex).biome.id !== 'cave') return Promise.resolve(false);
  const id = `${levelIndex}/${variant}/${mesh}`;
  let p = pending.get(id);
  if (!p) {
    // (this module lives in src/shared: the site root is two folders up)
    const url = new URL(`../../${BAKE_DIR}${bakeFile(levelIndex, variant)}`, import.meta.url);
    p = fetch(url).then(async (res) => (res.ok ? registerBakeBytes(levelIndex, variant, new Uint8Array(await res.arrayBuffer()), { mesh }) : false)).catch(() => false);
    pending.set(id, p);
  }
  return p;
}
