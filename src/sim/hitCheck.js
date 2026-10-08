// Server-side plausibility of client-reported dinosaur hits. Clients test
// against their animated hit spheres; the server only checks that the point
// lies near the animal as that client saw it (`pose`, see ServerWorld.hitPose)
// and that the claimed zone fits the side of the body that was hit.

import { CONFIG } from '../shared/config.js';

/** How far above/below its origin a hit on each species can be (× scale). */
const HIT_HEIGHT = { brachio: 17, trex: 12, stego: 7, raptor: 5, 'gloom-raptor': 6, ptera: 6 };

/**
 * @param {object} d dinosaur
 * @param {{x:number,y:number,z:number}} pose where it was when hit
 * @param {number[]} point [x, y, z] reported hit point
 * @param {number} slack extra horizontal reach (neck, tail, limbs) × scale
 */
export function nearDino(d, pose, point, slack) {
  const s = d.scale || 1;
  const reach = d.type === 'ptera' ? slack + 5 : d.radius + slack * s;
  return Math.hypot(point[0] - pose.x, point[2] - pose.z) <= reach &&
    Math.abs(point[1] - pose.y) <= (HIT_HEIGHT[d.type] ?? 17) * s;
}

/**
 * The damage zone to apply: unknown zones count as body, and a head/neck hit
 * well behind the hips or a tail hit well in front of them as body too.
 * (Pterosaurs bank and twist in flight; their zones are taken as reported.)
 */
export function plausibleZone(d, pose, point, zone) {
  if (!Object.hasOwn(CONFIG.hitZones, zone)) return 'body';
  if (d.type === 'ptera') return zone;
  const s = d.scale || 1;
  const along = (point[0] - pose.x) * -Math.sin(pose.yaw) + (point[2] - pose.z) * -Math.cos(pose.yaw);
  if ((zone === 'head' || zone === 'neck') && along < -1 * s) return 'body';
  if (zone === 'tail' && along > 1 * s) return 'body';
  return zone;
}
