// A short warm flash on a dinosaur when it takes damage (DinoView.flinch). The
// model's materials are shared by every animal of a species, so each animal gets
// its own copies first; a copy keeps the same shader program (same type, defines,
// onBeforeCompile and cache key), so nothing recompiles. Only the emissive colour
// changes, never a light. No rim light or outline: dinos stay hard to spot.
import * as THREE from 'three';
import { FX } from '../../../shared/palette.js';

/** Flash colour and peak strength (emissive, added on top of the lit skin). */
export const FLASH = { color: FX.hitFlash, peak: 0.55 };

/**
 * Copy of `m` that compiles to the same program (Material.clone drops these two hooks).
 * The copy belongs to this animal: clone() also copies the cache's `sharedResource` mark,
 * which would keep DinoView.dispose (disposeIslandScenes) from ever freeing it.
 */
function ownCopy(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  delete c.userData.sharedResource;
  return c;
}

/**
 * Give every lit mesh under `root` its own material and return `{ set(k), materials }`:
 * `set(k)` (0..1) adds the flash; unlit materials (e.g. crystal glow) are left alone.
 */
export function makeHitFlash(root) {
  const copies = new Map();   // shared material -> this animal's copy
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const own = [o.material].flat().map((m) => {
      if (!m.emissive) return m;
      if (!copies.has(m)) copies.set(m, ownCopy(m));
      return copies.get(m);
    });
    o.material = Array.isArray(o.material) ? own : own[0];
  });
  const materials = [...copies.values()];
  const base = materials.map((m) => m.emissive.clone());
  const flash = new THREE.Color(FLASH.color);
  let last = 0;
  return {
    materials,
    set(k) {
      k = Math.max(0, Math.min(1, k));
      if (k === last) return;
      last = k;
      const s = k * FLASH.peak;
      materials.forEach((m, i) => m.emissive.copy(flash).multiplyScalar(s).add(base[i]));
    },
  };
}
