// "Get unstuck": find the nearest spot around a player where they can stand
// and walk away from – dry, no lava, not steep, not inside a tree/wall/prop,
// with several open directions. Used by ServerWorld for ACT.UNSTUCK.

import { CONFIG } from '../shared/config.js';
import { penetration } from '../shared/collision.js';

const P = CONFIG.player;
const MAX_SLOPE = P.maxWalkSlope * 0.7;
const DIRS = 8;
const PROBE_STEP = 0.5;
const PROBE_LEN = 2.5;
/** Open directions a spot needs so the player can walk away from it. */
export const MIN_FREE_DIRS = 3;

/** Can a player stand at (x, z)? Returns the ground height, or null. */
export function standable(terrain, layout, x, z) {
  const lim = CONFIG.world.size / 2 - 6;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return null;
  if (terrain.waterDepthAt(x, z) > 0.2 || terrain.lavaLevelAt(x, z) !== null) return null;
  const g = layout.groundAt(x, z);
  if (!Number.isFinite(g)) return null;
  // on bare terrain the controller slides where the gradient is too steep
  if (layout.rockHeightAt(x, z) < terrain.heightAt(x, z) + 0.05) {
    const gr = terrain.gradientAt(x, z, 0.6);
    if (Math.hypot(gr.x, gr.z) > MAX_SLOPE) return null;
  }
  // flat over the whole footprint (terrain and rock tops alike)
  const e = P.radius + 0.25;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const px = x + Math.cos(a) * e, pz = z + Math.sin(a) * e;
    if (Math.abs(layout.groundAt(px, pz) - g) / e > MAX_SLOPE) return null;
    if (terrain.lavaLevelAt(px, pz) !== null) return null;
  }
  if (penetration(x, z, P.radius + 0.05, layout.playerColliders, g + 0.05, g + P.height) > 0) return null;
  return g;
}

/** Number of directions (of 8) in which the player can walk PROBE_LEN metres from (x, z) standing at height g. */
export function freeDirections(terrain, layout, x, z, g) {
  let free = 0;
  for (let k = 0; k < DIRS; k++) {
    const a = (k / DIRS) * Math.PI * 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    let prev = g, ok = true;
    for (let s = PROBE_STEP; s <= PROBE_LEN + 1e-6 && ok; s += PROBE_STEP) {
      const px = x + ux * s, pz = z + uz * s;
      const h = layout.groundAt(px, pz);
      const rise = h - prev;
      if (rise > P.stepHeight * 0.8 || (rise > 0.05 && rise / PROBE_STEP > P.maxWalkSlope)) ok = false;
      else if (terrain.waterDepthAt(px, pz) > CONFIG.world.maxWadeDepth || terrain.lavaLevelAt(px, pz) !== null) ok = false;
      else if (penetration(px, pz, P.radius, layout.playerColliders, h + 0.05, h + P.height) > 0.01) ok = false;
      prev = h;
    }
    if (ok) free++;
  }
  return free;
}

/** Is (x, z) a good place to stand and walk away from? Returns the ground height or null. */
export function goodSpot(terrain, layout, x, z) {
  const g = standable(terrain, layout, x, z);
  if (g === null) return null;
  return freeDirections(terrain, layout, x, z, g) >= MIN_FREE_DIRS ? g : null;
}

/**
 * Spiral outward from (x, z) for the nearest good spot at least `minDist` away.
 * Returns { x, y, z } or null when nothing within `maxDist` works.
 */
export function findUnstuckSpot(terrain, layout, x, z, { minDist = 0, maxDist = 60, step = 0.6 } = {}) {
  for (let r = minDist; r <= maxDist; r += step) {
    const n = r < 1e-6 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * r) / step));
    const a0 = r * 0.37; // rotate each ring a little so rings don't line up
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const g = goodSpot(terrain, layout, px, pz);
      if (g !== null) return { x: px, y: g, z: pz };
    }
  }
  return null;
}
