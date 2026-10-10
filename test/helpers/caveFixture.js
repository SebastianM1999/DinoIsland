// Reuse a live-generated walk grid through the real bake path when a behavior test
// creates more worlds on the same map. Each Terrain still decodes its own arrays;
// no server state is shared. Generation and stale-bake tests opt out of this helper.
import { after } from 'node:test';
import { encodeWalk, walkKey, registerCaveBake, forgetCaveBakes } from '../../src/shared/caveBake.js';

after(forgetCaveBakes);

export function reuseCaveWalk(terrain) {
  const plan = terrain.plan;
  if (!terrain.walk) return;
  registerCaveBake(plan.level.index, plan.variant, {
    header: { walkKey: walkKey(plan) },
    walk: encodeWalk(terrain.walk),
  });
}
