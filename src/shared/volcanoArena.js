// The crater arena (Ashfall Isle, island 3): the caldera's floor on top of the
// volcano. A steep inner wall rings it; the only way in is the notch in the
// rim where the mountain path arrives. A ring of lava (the moat, a lava flow
// in plan.flows) runs round the fighting floor, broken only where the path
// comes in. Basalt columns stand on the floor to dodge and kite round
// (layout.js). Its boss (the T-Rex) comes later: then the entrance
// (gates[0].locked) closes behind the team. For now it is open.
//
// Planned from the caldera alone (no rng draws), shared by client (look,
// minimap) and server (terrain, colliders, AI).

export const VOLCANO_ARENA = {
  name: 'Ember Crown',
  /** Radius of the fighting floor inside the moat. */
  r: 30,
  /** Lava moat: centre radius and width. */
  moatR: 34,
  moatW: 6,
  /** The moat's lava lies this far below the floor. */
  sink: 0.5,
  /** The flat crater floor reaches this far; the inner wall rises from here to the rim. */
  floorR: 38,
  /** Rim radius. */
  craterR: 43,
  /** The floor lies this far below the rim. */
  depth: 12,
  /** Half the length of the moat's gap where the path comes in. */
  gapHalf: 11,
  /** Basalt columns on the floor to kite round. */
  columns: 7,
};

/**
 * Plan the arena on the caldera floor: the entrance at the notch, the boss's
 * spawn across the floor from it.
 * @param {{ volcano: { x:number, z:number, floorY:number, notchAngle:number } }} plan
 */
export function planVolcanoArena(plan) {
  const v = plan.volcano;
  const V = VOLCANO_ARENA;
  const a = v.notchAngle, c = Math.cos(a), s = Math.sin(a);
  return {
    x: v.x, z: v.z, r: V.r, y: v.floorY,
    craterR: V.craterR, moatR: V.moatR, moatW: V.moatW, moatLevel: v.floorY - V.sink,
    gates: [{ angle: a, kind: 'entrance', locked: false, x: v.x + c * (V.craterR + 9), z: v.z + s * (V.craterR + 9) }],
    spawn: { x: v.x - c * V.r * 0.5, z: v.z - s * V.r * 0.5 },
  };
}

/** Is (x, z) inside the crater (within the rim, pad > 0 grows it)? */
export function insideVolcanoArena(layout, x, z, pad = 0) {
  const a = layout?.volcanoArena ?? layout?.plan?.volcanoArena ?? layout;
  if (!a || a.craterR == null) return false;
  const r = a.craterR + pad;
  return (x - a.x) ** 2 + (z - a.z) ** 2 < r * r;
}

/**
 * Shelter from the volcano's ash rain: the camp's clearing round the hut and
 * the base plots (sim/volcano.js hurts players out in it, player/controller.js
 * slows their stamina).
 */
export function ashShelter(layout, x, z) {
  const hut = layout.plan.hut;
  if (Math.hypot(x - hut.x, z - (hut.z + 2)) < hut.radius) return true;
  return (layout.basePlots || []).some((p) => Math.hypot(x - p.x, z - p.z) < p.r);
}

/** Distance (m, along the moat) from (x, z)'s bearing to the entrance's middle. */
export function entranceOffset(a, x, z) {
  const ang = Math.atan2(z - a.z, x - a.x);
  const g = a.gates[0].angle;
  return Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) * a.moatR;
}

/** The moat as a lava flow polyline: round the floor, open at the entrance. */
export function moatFlow(a) {
  const V = VOLCANO_ARENA;
  const gap = V.gapHalf / a.moatR;
  const g = a.gates[0].angle;
  const n = 48;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const ang = g + gap + (k / n) * (Math.PI * 2 - 2 * gap);
    pts.push({ x: a.x + Math.cos(ang) * a.moatR, z: a.z + Math.sin(ang) * a.moatR, y: a.moatLevel, w: a.moatW });
  }
  return { kind: 'lava', ring: true, pts };
}
