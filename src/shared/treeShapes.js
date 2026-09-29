// Tree trunk shapes shared by the tree meshes (client) and the tree colliders
// (client + server). The mesh builders in client/world/veg/trees.js sweep a
// tube along these centerlines; the colliders are built from the same numbers,
// so the hitbox follows every bend and lean of the visible trunk.

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
    pts.push([bend * t * t, H * t, wob * Math.sin(t * 3.2)]);
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
export function treePoint(t, [x, y, z], sink = TREE_SINK) {
  x *= t.scale; y *= t.scale; z *= t.scale;
  const c = t.lean * 0.5, a = t.lean, b = t.rot;
  let x1 = x * Math.cos(c) - y * Math.sin(c), y1 = x * Math.sin(c) + y * Math.cos(c);    // Z
  const y2 = y1 * Math.cos(a) - z * Math.sin(a), z2 = y1 * Math.sin(a) + z * Math.cos(a); // X
  const x3 = x1 * Math.cos(b) + z2 * Math.sin(b), z3 = -x1 * Math.sin(b) + z2 * Math.cos(b); // Y
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
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k])));
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
    const half = Math.hypot(a[0] - b[0], a[2] - b[2]) / 2;
    const c = { x: cx, z: cz, r: r * t.scale + half, bottom: Math.min(a[1], b[1]), top: Math.max(a[1], b[1]), kind: 'tree' };
    const prev = out[out.length - 1];
    // merge straight runs into one taller slice (grown to still enclose the merged part)
    const drift = prev ? Math.hypot(prev.x - c.x, prev.z - c.z) : Infinity;
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
