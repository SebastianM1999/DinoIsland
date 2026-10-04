// The swamp arena (Misty Swamp, island 2): a round kettle in the middle of the
// hourglass island's waist – the only way from the first half to the second.
// A wall of huge dead stilt-root mangroves rings it with two gates: the
// entrance facing west (the hut) and the exit facing east (the boat). Root
// walls run from the ring north and south out into the deep sea, so nobody
// walks or wades round it. Inside, the ground drops into a sunken basin of mud
// and bog water; the trail crosses it on a causeway. The Alpha Sarcosuchus
// occupies the central arena; both gates stay open.
//
// Planned from the island's outline alone (no rng draws), shared by client
// (look, minimap) and server (terrain, colliders, AI).

import { smoothstep } from './rng.js';

export const SWAMP_ARENA = {
  name: 'Drowned Hollow',
  /** Barrier ring radius (m): the root wall stands on this circle. */
  r: 28,
  /** Wall thickness and height (colliders). */
  wallW: 2.4,
  wallH: 4.2,
  /** Width of each gate opening in the wall. */
  gateW: 6.5,
  /** The basin's bog water lies this far below the ground around the arena. */
  sink: 1.1,
  /** The waist walls reach this far into water deeper than a player can wade. */
  deepRun: 8,
};

/**
 * Plan the arena: centred in the waist of an hourglass island, gates west and east.
 * @param {{ A: number }} plan
 */
export function planSwampArena(plan) {
  const r = SWAMP_ARENA.r;
  const x = 0, z = 0;
  const gate = (angle, kind) => ({ angle, kind, locked: false, x: x + Math.cos(angle) * (r + 3), z: z + Math.sin(angle) * (r + 3) });
  return {
    x, z, r,
    gates: [gate(Math.PI, 'entrance'), gate(0, 'exit')],
    // beside the causeway that crosses the basin
    spawn: { x, z: z + r * 0.45 },
  };
}

/** Is (x, z) inside the arena ring of `layout` (pad > 0 grows the circle)? */
export function insideSwampArena(layout, x, z, pad = 0) {
  const a = layout?.swampArena ?? layout?.plan?.swampArena ?? layout;
  if (!a || a.r == null) return false;
  const r = a.r + pad;
  return (x - a.x) ** 2 + (z - a.z) ** 2 < r * r;
}

/** Distance along the ring (m) from (x, z) to the nearest gate's middle. */
export function gateOffset(a, x, z) {
  const ang = Math.atan2(z - a.z, x - a.x);
  let best = Infinity;
  for (const g of a.gates) best = Math.min(best, Math.abs(Math.atan2(Math.sin(ang - g.angle), Math.cos(ang - g.angle))) * a.r);
  return best;
}

/** True where the ring wall stands (not in a gate's opening). */
export function onArenaWall(a, x, z) {
  const d = Math.hypot(x - a.x, z - a.z);
  if (Math.abs(d - a.r) > SWAMP_ARENA.wallW / 2) return false;
  return gateOffset(a, x, z) > SWAMP_ARENA.gateW / 2;
}

/**
 * Ring wall colliders: short boxes along the ring, leaving the gates open.
 * @param {{x:number,z:number,r:number,gates:object[]}} a
 * @param {number} groundY ground height around the wall
 */
export function arenaWallColliders(a, groundY) {
  const out = [];
  const n = 44;
  const seg = (2 * Math.PI * a.r) / n;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    const x = a.x + Math.cos(ang) * a.r, z = a.z + Math.sin(ang) * a.r;
    if (gateOffset(a, x, z) < SWAMP_ARENA.gateW / 2 + seg / 2) continue;
    // box: long side along the ring tangent; collider rot is the negated yaw
    out.push({ x, z, hw: seg / 2 + 0.15, hd: SWAMP_ARENA.wallW / 2, rot: ang + Math.PI / 2, top: groundY + SWAMP_ARENA.wallH, kind: 'arena' });
  }
  return out;
}

/**
 * The waist walls: from the ring's north and south points straight out (±z)
 * until the sea has been deeper than `maxWade` for SWAMP_ARENA.deepRun metres.
 * @param {{x:number,z:number,r:number}} a
 * @param {{ heightAt(x:number,z:number):number, seaDepthAt(x:number,z:number):number }} terrain
 * @param {number} maxWade deepest water a player walks through
 * @returns {{ side: number, z0: number, z1: number }[]} the two wall lines (z0 at the ring)
 */
export function waistWalls(a, terrain, maxWade) {
  const out = [];
  for (const side of [-1, 1]) {
    const z0 = a.z + side * (a.r - 0.5);
    let z = z0, deep = 0;
    for (let k = 0; k < 400 && deep < SWAMP_ARENA.deepRun; k++) {
      z += side;
      deep = terrain.seaDepthAt(a.x, z) > maxWade + 0.2 ? deep + 1 : 0;
    }
    out.push({ side, z0, z1: z });
  }
  return out;
}

/** Colliders of the waist walls (boxes ~3 m long along z). */
export function waistWallColliders(a, walls, groundAt) {
  const out = [];
  for (const w of walls) {
    const len = Math.abs(w.z1 - w.z0), n = Math.max(1, Math.ceil(len / 3));
    for (let k = 0; k < n; k++) {
      const z = w.z0 + w.side * (k + 0.5) * (len / n);
      // walls stand on the sea floor out there too: tall enough to never be climbed or waded round
      const top = Math.max(groundAt(a.x, z), 0) + SWAMP_ARENA.wallH;
      out.push({ x: a.x, z, hw: SWAMP_ARENA.wallW / 2, hd: len / n / 2 + 0.15, rot: 0, top, kind: 'arena' });
    }
  }
  return out;
}

/** How much of the basin floor shaping applies at (x, z): 1 inside, 0 beyond the wall. */
export function arenaBasin(a, x, z) {
  const d = Math.hypot(x - a.x, z - a.z);
  return 1 - smoothstep(a.r - 7, a.r - 2, d);
}

/** Deep ambush hollows beside the dry causeway, with gently sloping banks. */
export function ambushPocket(a, x, z) {
  if (!a) return 0;
  let depth = 0;
  for (const side of [-1, 1]) {
    const d = Math.hypot((x - a.x) / 1.4, z - a.z - side * a.r * .45);
    depth = Math.max(depth, 1 - smoothstep(6, 10, d));
  }
  return depth;
}
