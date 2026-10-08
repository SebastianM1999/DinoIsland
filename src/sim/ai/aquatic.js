// Shared helpers of the water ambushers (the Alpha Sarcosuchus boss and the cave Sump Lurker): committed-phase
// bookkeeping, submergence, water support height and the swept mouth capsule. Species that use them set
// `CONFIG.dinos[type].aquatic` (see config.js); `DinoSystem` reads the same flag for swimming and carcass floating.
import { CONFIG } from '../../shared/config.js';
import { clamp } from '../../shared/rng.js';

/** Yaw that faces player/point `p` from `d` (creatures face -Z). */
export const toYaw = (d, p) => Math.atan2(-(p.x - d.x), -(p.z - d.z));

/** Start (or clear, with no clip) the clip-synchronised phase that the snapshot rows carry. */
export function phase(d, sys, clip, seconds) {
  d.phaseSeq = (d.phaseSeq ?? 0) + 1;
  d.phase = clip ? { clip, started: sys.world.now, duration: seconds, seq: d.phaseSeq } : null;
}

/** Move `d.submergence` (0 surfaced .. 1 fully submerged) toward its target at 2.5/s; sets flag bit 8 while low. */
export function submergeToward(d, dt, submerged) {
  d.submergence = clamp((d.submergence ?? (submerged ? 1 : 0)) +
    clamp((submerged ? 1 : 0) - (d.submergence ?? 0), -2.5 * dt, 2.5 * dt), 0, 1);
}
export function flagSubmerged(d) {
  if (d.submergence > 0.05) d.fl |= 8; else d.fl &= ~8;
}

/** Absolute water support, resolved AFTER horizontal movement at the new position (never added to the bank height twice). */
export function aquaticGroundHeight(d, terrain, c = CONFIG.dinos[d.type]) {
  const { shallow, range } = c.aquatic.submerge;
  const ground = terrain.heightAt(d.x, d.z), water = terrain.waterLevelAt(d.x, d.z);
  if (water === null) return ground;
  const depth = (shallow + range * clamp(d.submergence ?? 0, 0, 1)) * (c.bodyHeightScale ?? 1);
  return Math.max(ground, water - depth);
}

/** Height a dead aquatic animal settles at: floating just under the surface (or on the ground). */
export function carcassSurface(d, terrain) {
  const ground = terrain.heightAt(d.x, d.z), water = terrain.waterLevelAt(d.x, d.z);
  return water === null ? ground : Math.max(ground, water - CONFIG.dinos[d.type].aquatic.carcassDepth);
}

/**
 * Swept mouth capsule: a fast committed lunge cannot skip a player between ticks. `from` is the position at the
 * previous tick; the strike ellipse is `half` m to each side and `half * lengthScale` m long, `back` m behind the reach.
 */
export function mouthCapsuleHit(d, p, from, reach, { lengthScale = 1, half = 2.1, back = 1.5 } = {}) {
  const fx = -Math.sin(d.strikeYaw), fz = -Math.cos(d.strikeYaw);
  const ax = from.x + fx * (reach - back * lengthScale), az = from.z + fz * (reach - back * lengthScale);
  const bx = d.x + fx * (reach - back * lengthScale), bz = d.z + fz * (reach - back * lengthScale);
  const sx = bx - ax, sz = bz - az;
  const t = clamp(((p.x - ax) * sx + (p.z - az) * sz) / (sx * sx + sz * sz || 1), 0, 1);
  const dx = p.x - ax - sx * t, dz = p.z - az - sz * t;
  const side = dx * fz - dz * fx, front = dx * fx + dz * fz;
  return (side / half) ** 2 + (front / (half * lengthScale)) ** 2 <= 1;
}
