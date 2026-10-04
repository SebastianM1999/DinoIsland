// The swamp arena (Misty Swamp, island 2): a round kettle in the waist of the
// hourglass island. A wall of huge dead stilt-root mangroves rings it – the
// barrier – with a single gap, the gate, facing the corridor the main trail
// takes past it. Inside, the ground drops into a sunken basin of mud and bog
// water with mud islands. Its boss (a giant alpha Sarcosuchus) comes later;
// for now the arena holds its spawn point.
//
// Planned from the island's outline alone (no rng draws besides the side),
// shared by client (look, minimap) and server (terrain, colliders, AI).

import { smoothstep } from './rng.js';

export const SWAMP_ARENA = {
  name: 'Drowned Hollow',
  /** Barrier ring radius (m): the root wall stands on this circle. */
  r: 27,
  /** Wall thickness and height (colliders). */
  wallW: 2.4,
  wallH: 4.2,
  /** Width of the gate opening in the wall. */
  gateW: 6.5,
  /** The basin's bog water lies this far below the ground around the arena. */
  sink: 1.1,
  /** The arena bulges out of the waist: its centre sits this share of r inside the coastline. */
  inset: 0.35,
};

/**
 * Plan the arena for an hourglass island: centred on the waist (x = 0), pushed
 * toward one coast so the trail has a corridor on the other side.
 * @param {{ A: number, B: number }} plan
 * @param {number} waistHalf half-width of the island at the waist (m)
 * @param {number} side +1 (south) or -1 (north)
 */
export function planSwampArena(plan, waistHalf, side) {
  const A = SWAMP_ARENA;
  const z = side * (waistHalf - A.r * A.inset);
  // the gate looks across the waist toward the corridor (away from the coast)
  const gateAngle = Math.atan2(-side, 0);   // angle in the x-z plane (cos -> x, sin -> z)
  return {
    x: 0, z, r: A.r, side,
    gateAngle,
    gate: { x: Math.cos(gateAngle) * (A.r + 3), z: z + Math.sin(gateAngle) * (A.r + 3) },
    spawn: { x: 0, z },
  };
}

/** Is (x, z) inside the arena ring of `layout` (pad > 0 grows the circle)? */
export function insideSwampArena(layout, x, z, pad = 0) {
  const a = layout?.swampArena ?? layout?.plan?.swampArena ?? layout;
  if (!a || a.r == null) return false;
  const r = a.r + pad;
  return (x - a.x) ** 2 + (z - a.z) ** 2 < r * r;
}

/** Angle distance of (x, z) on the ring from the gate (0 = in the gate's middle). */
function gateOffset(a, x, z) {
  const ang = Math.atan2(z - a.z, x - a.x);
  return Math.abs(Math.atan2(Math.sin(ang - a.gateAngle), Math.cos(ang - a.gateAngle)));
}

/** True where the ring wall stands (not in the gate's opening). */
export function onArenaWall(a, x, z) {
  const d = Math.hypot(x - a.x, z - a.z);
  if (Math.abs(d - a.r) > SWAMP_ARENA.wallW / 2) return false;
  return gateOffset(a, x, z) * a.r > SWAMP_ARENA.gateW / 2;
}

/**
 * Wall colliders: short boxes along the ring, leaving the gate open.
 * @param {{x:number,z:number,r:number,gateAngle:number}} a
 * @param {number} groundY ground height around the wall
 */
export function arenaWallColliders(a, groundY) {
  const out = [];
  const n = 40;
  const seg = (2 * Math.PI * a.r) / n;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    const x = a.x + Math.cos(ang) * a.r, z = a.z + Math.sin(ang) * a.r;
    if (gateOffset(a, x, z) * a.r < SWAMP_ARENA.gateW / 2 + seg / 2) continue;
    // box: long side along the ring tangent; collider rot is the negated yaw
    out.push({ x, z, hw: seg / 2 + 0.15, hd: SWAMP_ARENA.wallW / 2, rot: ang + Math.PI / 2, top: groundY + SWAMP_ARENA.wallH, kind: 'arena' });
  }
  return out;
}

/** How much of the basin floor shaping applies at (x, z): 1 inside, 0 beyond the wall. */
export function arenaBasin(a, x, z) {
  const d = Math.hypot(x - a.x, z - a.z);
  return 1 - smoothstep(a.r - 7, a.r - 2, d);
}
