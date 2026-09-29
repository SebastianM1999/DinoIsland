// The wrecked sailing boat on the east beach: size, colliders and the spot
// where players press E. Shared by server and client (models/props/boat.js).
//
// Frame (see siteFrame.js): b = { x, z, y, rot }, group.rotation.y = rot.
// The bow points along local +x, i.e. world direction (cos rot, -sin rot);
// starboard (the side with the hole and the interact spot) is local +z.

import { toWorld, siteBox } from './siteFrame.js';

export const BOAT = {
  length: 10,        // stern (local x = -5) .. bow (x = +5)
  width: 3.2,        // beam at the widest point
  gunwale: 1.85,     // hull rim height above the keel (midships, upright)
  deckY: 0.95,       // deck height above the keel (hull frame)
  mastX: 0.8,        // mast position along the length
  mastH: 7.4,        // mast top above the keel
  /** Local deck spots (x, z) where the three delivered relics appear. */
  sockets: [[-3.25, 0], [-2.05, -0.62], [-2.05, 0.62]],
};

/** Box colliders { x, z, hw, hd, rot, top } covering the hull (both states). */
export function boatColliders(b) {
  const y = b.y ?? 0;
  return [
    siteBox(b, -1.2, 0, 3.8, 1.55, y + 2.3),    // stern + midships
    siteBox(b, 3.4, 0, 1.0, 1.0, y + 2.4),      // forward hull
    siteBox(b, 4.6, 0, 0.45, 0.45, y + 2.4),    // bow tip
  ];
}

/** Spot on the sand beside the starboard hull (next to the hole). */
export function boatInteractPoint(b) {
  return toWorld(b, -0.6, BOAT.width / 2 + 1.4);
}
