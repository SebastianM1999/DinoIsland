// Tree trunk shapes shared by the tree meshes (client) and the tree colliders
// (client + server). The mesh builders in client/world/veg/trees.js sweep a
// tube along these centerlines; the colliders are built from the same numbers,
// so the hitbox follows every bend and lean of the visible trunk.

import * as dmath from './dmath.js';

/**
 * @typedef {Object} TrunkShape
 * @property {number[][]} pts   centerline control points [x, y, z] (local, ground at y=0)
 * @property {(t:number) => number} r  trunk radius along the centerline (t: 0 base .. 1 top)
 * @property {number[][]} [base] extra solid rings at the foot [top, radius] (buttress roots)
 */

const palm = (variant) => {
  const H = variant ? 7.3 : 8.0;
  const bend = variant ? 1.9 : 1.15;
  const wob = variant ? 0.35 : 0.12;
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pts.push([bend * t * t, H * t, wob * dmath.sin(t * 3.2)]);
  }
  return { pts, r: (t) => 0.33 - 0.13 * t + (t < 0.05 ? 0.12 : 0) };
};

/** @type {Record<string, TrunkShape[]>} one entry per geometry variant */
export const TRUNKS = {
  palm: [palm(0), palm(1)],
  round: [0, 1].map((variant) => ({
    pts: [[0, 0, 0], [0.08, 1.4, 0.05], [-0.06, 2.8, 0], [variant ? -0.15 : 0.1, 4.0, variant ? 0.1 : 0]],
    r: (t) => 0.3 - 0.1 * t + (t < 0.06 ? 0.14 : 0),
  })),
  tall: [{
    pts: [[0, 0, 0], [0.1, 2.5, 0.1], [-0.1, 5.0, 0], [0.15, 7.0, -0.05], [0.2, 8.4, -0.1]],
    r: (t) => 0.3 - 0.14 * t + (t < 0.05 ? 0.14 : 0),
  }],
  jungle: [{
    pts: [[0, 0, 0], [0.15, 3, 0.05], [-0.05, 6.2, 0.1], [0.3, 9.6, 0.2]],
    r: (t) => 0.5 - 0.2 * t + (t < 0.05 ? 0.12 : 0),
    // buttress fins: [height up to, radius they reach at that height]
    base: [[0.35, 1.35], [0.8, 1.05], [1.6, 0.72]],
  }],
  mango: [{
    pts: [[0, 0, 0], [0.05, 1.1, 0], [-0.05, 2.1, 0.05]],
    r: (t) => 0.36 - 0.1 * t + (t < 0.08 ? 0.14 : 0),
  }],
  // bamboo: one solid column around the whole stalk cluster (the footprint)
  bamboo: [0, 1].map(() => ({
    pts: [[0, 0, 0], [0, 3.5, 0], [0, 7, 0]],
    r: () => 0.72,
  })),
  // huge jungle emergent: ~24 m, thick trunk, wide buttress fins
  giant: [0, 1].map((variant) => ({
    pts: variant
      ? [[0, 0, 0], [-0.3, 5.5, 0.2], [0.2, 11, -0.3], [0.5, 16.5, 0.1], [0.1, 22, 0.3]]
      : [[0, 0, 0], [0.3, 6, 0.2], [-0.2, 12, 0.4], [0.4, 18, 0.1], [0.2, 24, 0]],
    r: (t) => 1.45 - 0.65 * t + (t < 0.04 ? 0.2 : 0),
    base: [[1.2, 2.8], [2.6, 2.1], [4.2, 1.75]],
  })),
  kapok: [0, 1].map((variant) => ({
    pts: [[0, 0, 0], [0.1, 3.2, 0.05], [-0.1, 6.4, 0.1], [variant ? 0.3 : -0.2, variant ? 8.8 : 9.8, 0.1]],
    r: (t) => 0.58 - 0.26 * t + (t < 0.05 ? 0.15 : 0),
    base: [[0.6, 1.25], [1.3, 0.95]],
  })),
  banana: [0, 1].map((variant) => ({
    pts: [[0, 0, 0], [0.08, 1.2, 0], [variant ? 0.3 : 0.18, variant ? 3.1 : 2.6, 0.05]],
    r: (t) => 0.19 - 0.06 * t + (t < 0.06 ? 0.05 : 0),
  })),
  pine: [0, 1].map((variant) => {
    const H = variant ? 7.5 : 9.5;
    return {
      pts: [[0, 0, 0], [0.05, H * 0.35, 0.03], [-0.04, H * 0.7, 0], [0, H, 0]],
      r: (t) => 0.3 - 0.18 * t + (t < 0.05 ? 0.12 : 0),
    };
  }),
  // swamp mangrove: the trunk rises out of a cage of arched stilt roots (the
  // base rings are that cage: solid up to ~1.5 m, a little inside the outermost arches)
  mangrove: [0, 1].map((variant) => ({
    pts: variant
      ? [[0, 0, 0], [0.1, 1.5, 0.05], [-0.15, 3.2, 0.2], [0.2, 4.8, 0.1]]
      : [[0, 0, 0], [-0.05, 1.6, 0.1], [0.12, 3.6, -0.1], [-0.1, 5.4, 0.05]],
    r: (t) => 0.3 - 0.12 * t,
    base: [[1.5, 1.15], [0.6, 1.4]],
  })),
  // swamp fig (the swamp's fruit tree): a strangler fig – a thick trunk of
  // fused, twisting roots with a ring of root flanks at its foot
  swampfig: [{
    pts: [[0, 0, 0], [0.1, 1.6, 0.05], [-0.1, 3.2, 0.1], [0.12, 4.4, 0]],
    r: (t) => 0.44 - 0.14 * t + (t < 0.05 ? 0.12 : 0),
    base: [[0.9, 0.95]],
  }],
  // swamp snag: a dead grey trunk, no embers (same bends as the volcanic 'dead')
  snag: [0, 1].map((variant) => ({
    pts: variant
      ? [[0, 0, 0], [0.3, 1.8, 0.1], [-0.1, 3.4, 0.4], [0.4, 5.0, 0.2], [0.2, 6.1, -0.2]]
      : [[0, 0, 0], [-0.2, 1.6, 0.2], [0.25, 3.2, 0.1], [0.1, 4.7, -0.3]],
    r: (t) => 0.34 - 0.2 * t + (t < 0.05 ? 0.12 : 0),
  })),
  // nipa palm: fronds straight out of a short stump in the mud
  nipa: [0, 1].map((variant) => ({
    pts: [[0, 0, 0], [0, 0.5, 0], [variant ? 0.08 : 0, 0.9, 0]],
    r: () => 0.38,
  })),
  // volcano: a tall burnt trunk, black and split, a few stubs of branches (glowing cracks)
  charred: [0, 1].map((variant) => ({
    pts: variant
      ? [[0, 0, 0], [0.15, 2.4, 0.05], [-0.1, 4.8, 0.2], [0.25, 7.0, 0.1]]
      : [[0, 0, 0], [-0.1, 2.2, 0.1], [0.12, 4.4, -0.1], [0.05, 5.8, 0.05]],
    r: (t) => 0.42 - 0.24 * t + (t < 0.05 ? 0.14 : 0),
  })),
  // volcano: the ash plum (the island's fruit tree), short and gnarled, leaning out of the ash
  ashplum: [{
    pts: [[0, 0, 0], [0.18, 1.2, 0.05], [0.05, 2.3, 0.15], [0.2, 3.2, 0.05]],
    r: (t) => 0.3 - 0.1 * t + (t < 0.06 ? 0.12 : 0),
  }],
  dead: [0, 1].map((variant) => ({
    pts: variant
      ? [[0, 0, 0], [0.3, 1.8, 0.1], [-0.1, 3.4, 0.4], [0.4, 5.0, 0.2], [0.2, 6.1, -0.2]]
      : [[0, 0, 0], [-0.2, 1.6, 0.2], [0.25, 3.2, 0.1], [0.1, 4.7, -0.3]],
    r: (t) => 0.34 - 0.2 * t + (t < 0.05 ? 0.12 : 0),
  })),
};

/** Which geometry variant a layout tree uses. */
export const treeVariant = (t) => t.id % TRUNKS[t.type].length;

/** Instances sink a little into the ground so slopes show no gap. */
export const TREE_SINK = 0.12;

/**
 * Local -> world for a layout tree: scale, then Euler(lean, rot, lean/2, 'YXZ'),
 * then translate. Must match treeMatrix() in client/world/veg/trees.js.
 */
export function treePoint(t, [x, y, z], sink = t.sink ?? TREE_SINK) {
  x *= t.scale; y *= t.scale; z *= t.scale;
  const c = t.lean * 0.5, a = t.lean, b = t.rot;
  let x1 = x * dmath.cos(c) - y * dmath.sin(c), y1 = x * dmath.sin(c) + y * dmath.cos(c);    // Z
  const y2 = y1 * dmath.cos(a) - z * dmath.sin(a), z2 = y1 * dmath.sin(a) + z * dmath.cos(a); // X
  const x3 = x1 * dmath.cos(b) + z2 * dmath.sin(b), z3 = -x1 * dmath.sin(b) + z2 * dmath.cos(b); // Y
  return [t.x + x3, t.y - sink + y2, t.z + z3];
}

/**
 * Upright collider slices along the trunk of a layout tree:
 * circles {x, z, r, bottom, top, kind:'tree'} in world space.
 */
export function treeColliders(t) {
  const shape = TRUNKS[t.type][treeVariant(t)];
  const pts = shape.pts;
  // arc length along the (polyline) centerline, so t matches the tube's radius parameter
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + dmath.hypot(...pts[i].map((v, k) => v - pts[i - 1][k])));
  const total = len[len.length - 1];
  const at = (s) => {
    let i = 1;
    while (i < len.length - 1 && len[i] < s) i++;
    const k = (s - len[i - 1]) / (len[i] - len[i - 1] || 1);
    return pts[i - 1].map((v, j) => v + (pts[i][j] - v) * k);
  };
  const out = [];
  const push = (a, b, r) => {
    const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
    const half = dmath.hypot(a[0] - b[0], a[2] - b[2]) / 2;
    const c = { x: cx, z: cz, r: r * t.scale + half, bottom: Math.min(a[1], b[1]), top: Math.max(a[1], b[1]), kind: 'tree' };
    const prev = out[out.length - 1];
    // merge straight runs into one taller slice (grown to still enclose the merged part)
    const drift = prev ? dmath.hypot(prev.x - c.x, prev.z - c.z) : Infinity;
    if (drift < 0.15 && Math.abs(prev.r - c.r) < 0.1) {
      prev.r = Math.max(prev.r, c.r + drift);
      prev.top = Math.max(prev.top, c.top);
      return;
    }
    out.push(c);
  };
  // foot of the trunk incl. root flare, then slices of ~0.8 m up to the crown
  const n = Math.max(3, Math.ceil(total / 0.8));
  for (let i = 0; i < n; i++) {
    const s0 = (i / n) * total, s1 = ((i + 1) / n) * total;
    const r = Math.max(shape.r(i / n), shape.r(Math.min(1, (i + 1) / n)), shape.r(i / n + 0.001));
    push(treePoint(t, at(s0)), treePoint(t, at(s1)), r);
  }
  out[0].bottom -= 1; // reach below uneven ground
  for (const [h, r] of shape.base || []) {
    const foot = treePoint(t, [0, 0, 0]);
    out.push({ x: foot[0], z: foot[2], r: r * t.scale, bottom: foot[1] - 1, top: foot[1] + h * t.scale, kind: 'tree' });
  }
  return out;
}

/**
 * Leaf crowns that stop dinosaurs (sim/dinos.js: a tall body walks into them, a pterosaur
 * cannot fly through them; players and shots ignore them). Per type and trunk variant, in
 * local tree space before scale: [cx, cz, bottom, top, r]. Measured from the foliage meshes
 * of client/world/veg/trees.js (the bottom where the lowest tenth of the leaves hangs, a
 * radius a little inside the crown's 80 % reach); test/props.test.js keeps them in step.
 * Bare snags, burnt trunks and the low fronds of banana and nipa (understory, bushy) have none.
 */
export const CROWNS = {
  palm: [[1.24, -0.07, 6.48, 8.92, 2.8], [2.35, -0.44, 5.66, 8.22, 2.8]],
  round: [[0.3, -0.05, 3.81, 7.09, 1.9], [0.21, 0.06, 4.11, 7.52, 1.8]],
  tall: [[0.23, -0.19, 5.24, 10.03, 2.2]],
  jungle: [[0.48, 0.19, 8.02, 12.89, 3.2]],
  mango: [[0.13, 0.18, 3.16, 6.91, 2.4]],
  bamboo: [[-0.19, 0.2, 5.06, 10.38, 2.1], [-0.23, -0.01, 7.09, 12.02, 1.75]],
  giant: [[-0.21, -0.07, 16.75, 28.42, 6.4], [0.12, 0.27, 16.03, 26.26, 6.4]],
  kapok: [[-0.14, 0.25, 10.75, 12.73, 4.8], [0.22, 0.08, 9.77, 11.99, 4.9]],
  pine: [[-0.03, -0.06, 4.05, 11.16, 1.4], [0.01, 0.09, 3.24, 9.11, 1.3]],
  mangrove: [[-0.25, 0.09, 4.14, 7.1, 2.8], [0.07, -0.09, 3.59, 6.56, 2.8]],
  swampfig: [[-0.17, -0.08, 4.46, 6.47, 3.0]],
  ashplum: [[0.24, 0.2, 3.19, 4.78, 2.0]],
};

/** The crown collider of a layout tree: { x, z, r, bottom, top, kind: 'crown' } in world space, or null. */
export function treeCrownCollider(t) {
  const c = CROWNS[t.type]?.[treeVariant(t)];
  if (!c) return null;
  const [cx, cz, bottom, top, r] = c;
  // the crown's centre follows the trunk's lean; its height span stays upright
  const lo = treePoint(t, [cx, bottom, cz]), hi = treePoint(t, [cx, top, cz]);
  return { x: (lo[0] + hi[0]) / 2, z: (lo[2] + hi[2]) / 2, r: r * t.scale, bottom: lo[1], top: hi[1], kind: 'crown' };
}
