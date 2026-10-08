// Helpers shared by the tail-swinging grazers (Stegosaurus, Crystal Plodder): the swept tail hitbox measured
// from a baked Attack clip, the "swing the rump round" yaw maths and the calm graze-and-wander loop.
// Nothing species specific lives here: every number comes in through the factory arguments / `C`.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';

export const smoothstep = x => (x = Math.min(1, Math.max(0, x))) * x * (3 - 2 * x);
export const dir = a => [Math.sin(a), Math.cos(a)];

/** Yaw that puts a point at angle `phi` behind the animal (phi + = its right). */
export const rearYaw = (d, x, z, phi) => Math.atan2(x - d.x, z - d.z) - phi;

/**
 * Swept tail hitbox from a clip. `sweep` = [[time s, min angle, max angle]...] of the striking part around the hip
 * pivot (angles from straight behind, + = the animal's right, measured from the baked Attack clip), `strikeEnd` =
 * clip time after which the tail only swings back (no damage), `pivotBack` = pivot behind the body centre (m),
 * `reach` = pivot -> farthest tip, `halfWidth` = half the tail's thickness there (all metres at scale 1).
 */
export function makeTailSweep({ sweep, strikeEnd, pivotBack, reach, halfWidth }) {
  const strikeStart = sweep[0][0];
  function sweepAt(t) {
    if (t <= sweep[0][0]) return [sweep[0][1], sweep[0][2]];
    for (let i = 1; i < sweep.length; i++) {
      const [t1, lo1, hi1] = sweep[i];
      if (t <= t1) {
        const [t0, lo0, hi0] = sweep[i - 1], u = (t - t0) / (t1 - t0);
        return [lo0 + (lo1 - lo0) * u, hi0 + (hi1 - hi0) * u];
      }
    }
    return [sweep.at(-1)[1], sweep.at(-1)[2]];
  }
  /** Angular span (around the hip pivot) the tail swept through between clip times t0 and t1. */
  function tailSweep(t0, t1) {
    t0 = Math.max(t0, strikeStart); t1 = Math.min(t1, strikeEnd);
    if (t1 < t0) return null;
    let [lo, hi] = sweepAt(t0);
    const keep = ([l, h]) => { lo = Math.min(lo, l); hi = Math.max(hi, h); };
    keep(sweepAt(t1));
    for (const [t, l, h] of sweep) if (t > t0 && t < t1) keep([l, h]);
    return [lo, hi];
  }
  /** Hip pivot of the tail and where a player sits relative to it: distance + angle from behind. */
  function tailRelative(d, p) {
    const k = d.scale || 1;
    const px = d.x + Math.sin(d.yaw) * pivotBack * k, pz = d.z + Math.cos(d.yaw) * pivotBack * k;
    const dx = p.x - px, dz = p.z - pz;
    return { px, pz, r: Math.hypot(dx, dz), phi: angleDiff(d.yaw, Math.atan2(dx, dz)) };
  }
  /** Everyone inside the arc the tail crossed this tick gets hit once: `onHit(player, rel)` does the damage. */
  function tailStrike(d, sys, t0, t1, onHit) {
    const span = tailSweep(t0, t1);
    if (!span) return;
    const k = d.scale || 1, reach_ = (reach + halfWidth) * k + CONFIG.player.radius;
    for (const p of sys.world.players.values()) {
      if (!p.alive || d.tailVictims.has(p.id) || sys.inSafeZone(p)) continue;
      if (p.y > d.y + 2.6 * k) continue;                         // jumped/standing high above the tail
      const rel = tailRelative(d, p);
      if (rel.r > reach_) continue;
      const margin = Math.atan2(halfWidth * k + CONFIG.player.radius, Math.max(rel.r, 0.5));
      if (rel.phi < span[0] - margin || rel.phi > span[1] + margin) continue;
      d.tailVictims.add(p.id);
      onHit(p, rel);
    }
  }
  return { sweepAt, tailSweep, tailRelative, tailStrike, strikeStart };
}

/**
 * The calm half of a grazer's update: graze in place, then wander to a random spot inside the territory and graze
 * again. Clears the "defending" flag and the target.
 */
export function grazeWander(d, sys, dt, C, home) {
  d.fl &= ~1;
  d.targetId = null;
  d.mode = d.mode === 'walk' ? 'walk' : 'graze';
  d.modeT -= dt;
  if (d.mode === 'graze') {
    sys.halt(d, dt);
    d.st = DS.GRAZE;
    if (d.modeT <= 0) {
      d.mode = 'walk';
      d.wander = sys.randomWalkablePoint(d, home.x, home.z, C.territoryRadius * 0.8);
      d.modeT = 20;
    }
  } else {
    const left = d.wander ? sys.steer(d, d.wander.x, d.wander.z, C.walkSpeed, dt) : 0;
    d.st = DS.WALK;
    if (!d.wander || left < 2 || d.modeT <= 0) {
      d.mode = 'graze';
      d.modeT = 5 + Math.random() * 8;
    }
  }
}
