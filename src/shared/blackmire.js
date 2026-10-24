// The Blackmire (docs/map-progression/21-laterne.md): the deepest bog of the swamp island, where the
// mist is so thick that a torch chokes and you see only a few metres; a lantern burning glowblood
// lights the way. Placed by the layout (`layout.blackmire`: { x, z, r }); the swamp's egg boat part
// and Elias' note from the mire lie in it.

import * as dmath from './dmath.js';

/** Metres over which the dark eases in at the Blackmire's edge. */
export const BLACKMIRE_EDGE = 12;

/** How deep in the Blackmire (x, z) is: 0 outside .. 1 well inside (eased over BLACKMIRE_EDGE). */
export function blackmireDepth(layout, x, z) {
  const b = layout?.blackmire;
  if (!b) return 0;
  const d = dmath.hypot(x - b.x, z - b.z);
  const t = (b.r + BLACKMIRE_EDGE * 0.5 - d) / BLACKMIRE_EDGE;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** Is (x, z) in the Blackmire proper (a torch goes out here)? */
export const inBlackmire = (layout, x, z) => !!layout?.blackmire && dmath.hypot(x - layout.blackmire.x, z - layout.blackmire.z) < layout.blackmire.r;
