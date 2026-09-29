// Cave site: a big rocky dome with a hollow inside and one arched entrance.
// Shared by server (colliders, relic spot) and client (models/props/cave.js).
//
// Frame (see siteFrame.js): c = { x, z, y, rot, seed }, group.rotation.y = rot.
// The entrance faces local -z, i.e. world direction (-sin rot, -cos rot).
// The generator flattens the terrain at the cave spot.

import { toWorld } from './siteFrame.js';

export const CAVE = {
  radius: 7.2,       // outer footprint radius of the rock dome at ground level
  inner: 5.0,        // walkable interior radius (wall collider inner edge)
  height: 5.5,       // interior ceiling height
  top: 7.0,          // outer dome height
  mouth: 2.5,        // clear half-width of the entrance (arch is ~2.6 wide at the floor)
  mouthHeight: 4.6,  // arch apex
  wallR: 1.0,        // radius of the wall collider circles
};

/**
 * Wall colliders: a ring of overlapping circles around the interior with a
 * gap at the entrance, plus two cheek circles each side of the entrance
 * passage. Circles: { x, z, r, top, kind: 'cave' }.
 */
export function caveColliders(c) {
  const out = [];
  const R = CAVE.inner + CAVE.wallR;            // ring center radius
  const top = (c.y ?? 0) + CAVE.top;
  const n = 30;
  const push = (lx, lz, r = CAVE.wallR) => {
    const p = toWorld(c, lx, lz);
    out.push({ x: p.x, z: p.z, r, top, kind: 'cave' });
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;             // 0 = entrance center (local -z)
    const lx = Math.sin(a) * R, lz = -Math.cos(a) * R;
    if (lz < 0 && Math.abs(lx) < CAVE.mouth + CAVE.wallR) continue;
    push(lx, lz);
  }
  // entrance passage cheeks (the wall is thick there)
  const cx = CAVE.mouth + CAVE.wallR;
  for (const s of [-1, 1]) {
    push(s * cx, -5.6);
    push(s * (cx + 0.3), -6.6);
  }
  return out;
}

/** A point deep inside the cave (relic spot), opposite the entrance. */
export function caveInterior(c) {
  return toWorld(c, 0, 2.6);
}

/** A point on the ground just outside the entrance. */
export function caveMouth(c) {
  return toWorld(c, 0, -(CAVE.radius + 1.6));
}
