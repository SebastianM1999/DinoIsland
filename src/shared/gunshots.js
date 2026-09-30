import { segmentColliders } from './collision.js';
import { groveEntry } from './grove.js';

// Shared terrain and obstacle ray termination for hitscan tracers and validation.
export function shotEnd(world, origin, dir, range) {
  let distance = range;
  const end = origin.map((n, i) => n + dir[i] * range);
  const f = segmentColliders(...origin, ...end, world.layout.colliders, world.layout.groundAt);
  if (f >= 0) distance = f * range;
  // shots from outside stop at the Primeval Grove's barrier
  const g = groveEntry(world.layout, origin[0], origin[2], end[0], end[2]);
  if (g >= 0) distance = Math.min(distance, g * range);
  for (let t = 0.4; t < distance; t += 0.4) {
    if (origin[1] + dir[1] * t <= world.layout.groundAt(origin[0] + dir[0] * t, origin[2] + dir[2] * t)) {
      distance = t; break;
    }
  }
  return origin.map((n, i) => n + dir[i] * distance);
}
