// Procedural tree models. Each builder returns { trunk, foliage } geometries
// (local space, ground at y=0) that are instanced by vegetation.js.
// Geometry is built once and cached. Trunk shapes (and so the colliders) come
// from shared/treeShapes.js.
//
// Types: palm, round, tall, jungle, mango (classic island), bamboo (cluster),
// giant (huge jungle emergent), kapok (umbrella crown), banana (paddle
// leaves), pine (ashy conifer), dead (charred snag with ember cracks); swamp:
// mangrove (stilt roots, low dark crown, hanging moss), snag (dead grey trunk,
// no embers), nipa (fronds straight out of the mud).
// Bark is vertex-painted with grooves, moss patches and lichen spots; leaf
// masses mix 2–3 greens plus yellow-green / teal accents.

import { THREE, tube, blob, merge, place, paint, deform, jitter, spike } from '../../models/kit.js';
import { clump, leafStrip, arcPath, withGeometryDetail } from './shapes.js';
import { TRUNKS, TREE_SINK } from '../../../shared/treeShapes.js';
import { makeRng } from '../../../shared/rng.js';
import { noise3 } from '../../models/props/common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Centerline of a shared trunk shape as vectors. */
const trunkPts = (shape) => shape.pts.map((p) => V(...p));
const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Wind settings per tree type (geometry units, before instance scale). */
export const TREE_WIND = {
  palm: { strength: 0.016, pivotY: 3.2, frequency: 1.3, heightScale: 0.25 },
  round: { strength: 0.012, pivotY: 2.6, frequency: 1.5, heightScale: 0.25 },
  tall: { strength: 0.009, pivotY: 3.8, frequency: 1.2, heightScale: 0.22 },
  jungle: { strength: 0.006, pivotY: 4.8, frequency: 1.0, heightScale: 0.2 },
  mango: { strength: 0.01, pivotY: 2.6, frequency: 1.4, heightScale: 0.25 },
  bamboo: { strength: 0.007, pivotY: 1.0, frequency: 1.1, heightScale: 0.2 },
  giant: { strength: 0.004, pivotY: 14, frequency: 0.8, heightScale: 0.12 },
  kapok: { strength: 0.007, pivotY: 5.5, frequency: 1.0, heightScale: 0.2 },
  banana: { strength: 0.02, pivotY: 1.4, frequency: 1.5, heightScale: 0.35 },
  pine: { strength: 0.009, pivotY: 2.5, frequency: 1.2, heightScale: 0.22 },
  dead: { strength: 0.004, pivotY: 3.0, frequency: 1.0, heightScale: 0.2 },
  mangrove: { strength: 0.006, pivotY: 3.4, frequency: 1.1, heightScale: 0.2 },
  snag: { strength: 0.005, pivotY: 3.0, frequency: 0.9, heightScale: 0.25 },
  nipa: { strength: 0.02, pivotY: 0.3, frequency: 1.4, heightScale: 0.3 },
  swampfig: { strength: 0.008, pivotY: 3.4, frequency: 1.2, heightScale: 0.22 },
};

/** Where the figs hang in the swamp fig's crown (local space, before instance transform). */
export const SWAMPFIG_FRUIT_LOCAL = [
  [2.0, 4.25, 0.6],
  [-1.5, 4.2, 1.5],
  [-0.6, 4.3, -2.0],
  [1.2, 4.2, -1.7],
];

/** Where mangos hang on the mango tree (local space, before instance transform). */
export const MANGO_FRUIT_LOCAL = [
  [2.55, 2.6, 0.8],
  [-1.75, 2.5, 2.05],
  [-0.7, 2.65, -2.6],
  [1.35, 2.55, -2.3],
  [-2.65, 2.6, -0.35],
];

/** World matrix of a layout tree (shared by vegetation + fruit plants). */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function treeMatrix(t, out = new THREE.Matrix4(), sink = t.sink ?? TREE_SINK) {
  _e.set(t.lean, t.rot, t.lean * 0.5, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(t.x, t.y - sink, t.z);
  _s.setScalar(t.scale);
  return out.compose(_p, _q, _s);
}

// ------------------------------------------------------------------ bark
/** Trunk axis (x, z) at height y, interpolated along a centerline. */
function axisAt(pts, y) {
  if (y <= pts[0].y) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i].y) {
      const k = (y - pts[i - 1].y) / (pts[i].y - pts[i - 1].y || 1);
      return _p.set(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y, pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k);
    }
  }
  return pts[pts.length - 1];
}

/**
 * Bark painter for tube(): vertical grooves (darker), moss patches (more near
 * the foot), lichen spots and an optional foot color. `axis` (centerline
 * points) keeps the groove pattern in line with barkRidges().
 */
function bark({ base, dark, seed = 1, foot = null, moss = '#5f8a39', mossAmt = 0.45, lichen = '#c2c9a0', lichenAmt = 0.35, grooves = 7, axis = null, ember = 0 }) {
  const cb = new THREE.Color(base), cd = new THREE.Color(dark), cm = new THREE.Color(moss), cl = new THREE.Color(lichen);
  const cf = foot ? new THREE.Color(foot) : null, ce = new THREE.Color('#ff7a2a'), out = new THREE.Color();
  return (t, a, p) => {
    let ang = a;
    if (axis) { const c = axisAt(axis, p.y); ang = Math.atan2(p.z - c.z, p.x - c.x); }
    const n = noise3(p.x * 1.2, p.y * 0.3, p.z * 1.2, seed);
    const g = Math.cos(ang * grooves + n * 2.2 + p.y * 0.12);
    out.copy(cb).lerp(cd, smooth(0.1, 0.9, g) * 0.75 + Math.max(0, n) * 0.25);
    out.multiplyScalar(0.94 + 0.08 * noise3(p.x * 3, p.y * 3, p.z * 3, seed + 9));
    if (mossAmt > 0) {
      const m = noise3(p.x * 0.8, p.y * 0.8, p.z * 0.8, seed + 3) + (1 - t) * 0.55 - 0.3;
      out.lerp(cm, smooth(0.0, 0.3, m) * mossAmt);
    }
    if (lichenAmt > 0 && noise3(p.x * 5.5, p.y * 5.5, p.z * 5.5, seed + 5) > 0.5) out.lerp(cl, lichenAmt);
    if (ember && t < ember && g > 0.55 && noise3(p.x * 2, p.y * 4, p.z * 2, seed + 7) > -0.1) out.copy(ce).lerp(cd, t / ember * 0.6);
    if (cf && t < 0.07) out.lerp(cf, 0.6);
    return out;
  };
}

/** Pull the trunk surface in along the grooves (soft vertical ridges). */
function barkRidges(geo, pts, grooves, depth, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const c = axisAt(pts, y);
    const dx = x - c.x, dz = z - c.z;
    const ang = Math.atan2(dz, dx);
    const n = noise3(x * 1.2, y * 0.3, z * 1.2, seed);
    const k = 1 - depth * (0.5 + 0.5 * Math.cos(ang * grooves + n * 2.2 + y * 0.12));
    p.setXYZ(i, c.x + dx * k, y, c.z + dz * k);
  }
  p.needsUpdate = true;
  return geo;
}

/** Trunk tube along a shared shape with grooves + ridges. */
function trunkTube(shape, opts, { radial = 8, grooves = 7, ridge = 0.05, rMul = null } = {}) {
  const pts = trunkPts(shape);
  const g = tube(pts, rMul || shape.r, { radial, color: bark({ ...opts, grooves, axis: pts }) });
  return barkRidges(g, pts, grooves, ridge, opts.seed || 1);
}

/** A curved branch tube from a to b. */
function branch(a, b, r0, r1, base, dark, seed, extra = {}) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += a.distanceTo(b) * 0.12;
  return tube([a, mid, b], (t) => r0 + (r1 - r0) * t, { radial: 5, color: bark({ base, dark, seed, mossAmt: 0.25, ...extra }), capStart: false });
}

/** Leaf-mass palettes: pick 2–3 greens + an accent per tree. */
const PAL = {
  bright: { top: '#9ad84f', mid: '#73c03f', mid2: '#66b23a', bottom: '#579f3b' },
  deep: { top: '#62b245', mid: '#44923a', mid2: '#3b8634', bottom: '#3e8636' },
  lime: { top: '#b5e05a', mid: '#8ccb46', mid2: '#7cbc40', bottom: '#5e9c38' },
  teal: { top: '#6fcf8e', mid: '#40a66e', mid2: '#379763', bottom: '#2f7f55' },
  olive: { top: '#9cc056', mid: '#6f9a3c', mid2: '#638d36', bottom: '#4d7530' },
  jade: { top: '#7cc85a', mid: '#4f9e48', mid2: '#468f41', bottom: '#387a38' },
};
const pick = (list, k, seed) => PAL[list[Math.abs((k * 7 + seed * 3) | 0) % list.length]];

/** Duplicate a thin sheet with flipped winding so it shows from both sides. */
function twoSided(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const back = g.clone();
  const p = back.attributes.position, c = back.attributes.color;
  for (let i = 0; i < p.count; i += 3) {
    for (const attr of [p, c]) {
      if (!attr) continue;
      const x = attr.getX(i + 1), y = attr.getY(i + 1), z = attr.getZ(i + 1);
      attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
      attr.setXYZ(i + 2, x, y, z);
    }
  }
  back.computeVertexNormals();
  return merge([g, back]);
}

// ------------------------------------------------------------------ palm
function buildPalm(variant) {
  const shape = TRUNKS.palm[variant];
  const pts = trunkPts(shape);
  const H = pts[pts.length - 1].y;
  const segs = (pts.length - 1) * 3;
  const trunk = tube(pts, (t) => shape.r(t) * (Math.round(t * segs) % 2 ? 1.08 : 1), {
    radial: 7,
    color: (t, a, p) => {
      if (t > 0.94) return '#6d4c2f';
      const s = Math.floor(t * segs);
      const n = noise3(p.x * 4, p.y * 2, p.z * 4, 12 + variant);
      if (n > 0.5) return '#b39a74';                                   // pale weathered patches
      return s % 2 ? '#a8784c' : (t < 0.3 ? '#86603f' : '#936a44');
    },
  });
  const T = pts[pts.length - 1];
  const parts = [trunk];
  // crown bulb + coconuts
  parts.push(place(blob(0.4, 0.34, 0.4, (c, n) => (n.y > 0.3 ? '#7ea63a' : '#5d7d2c'), { w: 7, h: 5 }), [T.x, T.y + 0.05, T.z]));
  const coco = (c, n) => (n.y > 0.4 ? '#8f6438' : '#6e4b2a');
  for (let k = 0; k < (variant ? 3 : 4); k++) {
    const a = k * 1.9 + 0.4;
    parts.push(place(blob(0.2, 0.22, 0.2, coco, { w: 5, h: 4 }), [T.x + Math.cos(a) * 0.3, T.y - 0.3, T.z + Math.sin(a) * 0.3]));
  }
  const trunkGeo = merge(parts);

  const fronds = [];
  const n = variant ? 8 : 9;
  const color = (t, h) => {
    if (t < 0.12) return h ? '#6f8f31' : '#5a7b2a';
    if (t > 0.78) return h ? '#9ad84c' : '#6fb73c';
    return h ? '#6fc53e' : '#45962f';
  };
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + Math.sin(k * 3.1 + variant) * 0.18;
    const dx = Math.cos(a), dz = Math.sin(a);
    const L = 4.2 + 0.6 * Math.sin(k * 2.3 + variant);
    const rise = 0.5 + 0.22 * Math.sin(k * 1.7);
    const from = V(T.x + dx * 0.2, T.y + 0.12, T.z + dz * 0.2);
    const path = arcPath(from, dx, dz, L, rise, 1.1, 10);
    fronds.push(leafStrip(path, (t) => (t >= 1 ? 0.03 : 0.74 * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.75)), {
      side: V(-dz, 0, dx), ridge: 0.35, serrate: 0.4, color,
    }));
  }
  // young upright fronds in the middle
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.5;
    const dx = Math.cos(a), dz = Math.sin(a);
    const from = V(T.x, T.y + 0.2, T.z);
    const path = arcPath(from, dx, dz, 2.3, 1.05, 0.95, 6);
    fronds.push(leafStrip(path, (t) => (t >= 1 ? 0.02 : 0.42 * Math.sin(Math.PI * (0.1 + 0.85 * t))), {
      side: V(-dz, 0, dx), ridge: 0.4, serrate: 0.35, color: (t, h) => (h ? '#8ad44a' : '#5fb23a'),
    }));
  }
  return { trunk: trunkGeo, foliage: merge(fronds), height: H };
}

// ------------------------------------------------------- round broadleaf
function buildRound(variant) {
  const s = variant * 17 + 3;
  const shape = TRUNKS.round[variant];
  const pts = trunkPts(shape);
  const trunkTop = pts[pts.length - 1];
  const trunk = trunkTube(shape, { base: '#8d5c3a', dark: '#6a432a', seed: s, foot: '#6a452d' }, { radial: 8, grooves: 6 });
  const parts = [trunk];
  const clumps = [];
  const cols = variant ? ['bright', 'lime', 'bright'] : ['bright', 'jade', 'bright', 'lime'];
  const cy = variant ? 5.2 : 5.0;
  clumps.push(place(clump(1.9, { seed: s, ...PAL.bright, squash: 0.85 }), [0, cy, 0]));
  const ring = variant ? 4 : 5;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * TAU + variant * 0.6;
    const rr = 1.45 + 0.2 * Math.sin(k * 2.1);
    const p = [Math.cos(a) * rr, cy - 0.55 + 0.35 * Math.sin(k * 1.3 + variant), Math.sin(a) * rr];
    clumps.push(place(clump(1.2 + 0.2 * Math.cos(k * 1.7), { seed: s + k + 1, ...pick(cols, k, s) }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(trunkTop.x * 0.5, 3.2, trunkTop.z * 0.5), V(p[0] * 0.7, p[1] - 0.3, p[2] * 0.7), 0.13, 0.06, '#8d5c3a', '#744a2f', s + k));
  }
  clumps.push(place(clump(1.25, { seed: s + 9, ...PAL.lime }), [0.35, cy + 1.2, -0.25]));
  if (variant) clumps.push(place(clump(0.9, { seed: s + 11, ...PAL.bright }), [-0.9, cy + 0.9, 0.7]));
  return { trunk: merge(parts), foliage: merge(clumps), height: 6.6 };
}

// ------------------------------------------------------ tall layered tree
function buildTall(variant) {
  const s = 40 + variant * 13;
  const shape = TRUNKS.tall[0];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const trunk = trunkTube(shape, { base: '#a2856c', dark: '#7c624e', seed: s, foot: '#735a47', lichenAmt: 0.45 }, { radial: 8, grooves: 6 });
  const parts = [trunk];
  const clumps = [];
  const cols = ['jade', 'bright', 'teal'];
  const tiers = [
    { y: 5.6, r: 2.3, n: 3, rr: 1.4 },
    { y: 7.4, r: 1.8, n: 3, rr: 1.0 },
    { y: 9.1, r: 1.35, n: 1, rr: 0 },
  ];
  tiers.forEach((tr, ti) => {
    if (tr.n === 1) {
      clumps.push(place(clump(tr.r, { seed: s + ti * 5, ...PAL.bright, squash: 0.62 }), [top.x, tr.y, top.z]));
      return;
    }
    for (let k = 0; k < tr.n; k++) {
      const a = (k / tr.n) * TAU + ti * 1.1 + variant * 0.5;
      const p = [Math.cos(a) * tr.rr, tr.y + 0.2 * Math.sin(k * 2 + ti), Math.sin(a) * tr.rr];
      clumps.push(place(clump(tr.r, { seed: s + ti * 5 + k, ...pick(cols, k + ti, s), squash: 0.48, flatBottom: 0.3 }), p, [0, a, 0]));
      if (ti === 0) parts.push(branch(V(0, tr.y - 1.2, 0), V(p[0] * 0.8, p[1] - 0.3, p[2] * 0.8), 0.12, 0.05, '#a2856c', '#8a6e58', s + k));
    }
  });
  return { trunk: merge(parts), foliage: merge(clumps), height: 9.6 };
}

// --------------------------------------------- jungle giant (buttresses)
function buttress(angle, seed, scale = 1) {
  // A thin fin: tall at the trunk, sloping to the ground outward.
  let g = new THREE.BoxGeometry(1, 1, 1, 1, 4, 5);
  g = deform(g, (v) => {
    const out = v.z + 0.5;                 // 0 at trunk, 1 outside
    const d = 0.25 + out * 1.45;
    const h = (v.y + 0.5) * 2.6 * Math.pow(1 - out, 1.4);
    const th = 0.22 * (1 - out * 0.6);
    v.set(v.x * th + Math.sin(out * 5 + seed) * 0.06, Math.max(-0.1, h - 0.1), d);
  });
  g = paint(g, (c) => (c.y < 0.35 ? '#5f8a39' : noise3(c.x * 3, c.y * 2, c.z * 3, seed) > 0.2 ? '#6b4f3a' : '#7d5e45'));
  return place(g, [0, 0, 0], [0, angle, 0], scale);
}
function buildJungle(variant) {
  const s = 70 + variant * 11;
  const shape = TRUNKS.jungle[0];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const trunk = trunkTube(shape, { base: '#806047', dark: '#5e4432', seed: s, foot: '#5f8a39', mossAmt: 0.6 }, { radial: 8, grooves: 6 });
  const parts = [trunk];
  for (let k = 0; k < 5; k++) parts.push(buttress((k / 5) * TAU + 0.3 + Math.sin(k) * 0.2, s + k));
  const leaves = [];
  const cols = ['deep', 'jade', 'deep', 'teal'];
  const cy = 10.6;
  leaves.push(place(clump(3.1, { seed: s, ...PAL.deep, squash: 0.5, flatBottom: 0.35, maxDetail: 3 }), [top.x, cy, top.z]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + variant * 0.4;
    const rr = 2.9 + 0.3 * Math.sin(k * 1.9);
    const p = [top.x + Math.cos(a) * rr, cy - 0.7 + 0.3 * Math.sin(k * 2.7), top.z + Math.sin(a) * rr];
    leaves.push(place(clump(1.9, { seed: s + k + 1, ...pick(cols, k, s), squash: 0.58 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(0.2, 7.8, 0.1), V(p[0] * 0.75, p[1] - 0.4, p[2] * 0.75), 0.2, 0.08, '#6b4f3a', '#806047', s + k));
    // hanging vines
    if (k % 2 === 1) {
      const vx = p[0] * 0.8, vz = p[2] * 0.8, vy = p[1] - 0.6;
      const len = 2.2 + 0.8 * Math.sin(k * 3.3);
      leaves.push(tube([V(vx, vy, vz), V(vx + 0.1, vy - len * 0.5, vz + 0.05), V(vx + 0.05, vy - len, vz)],
        (t) => 0.06 - 0.03 * t, { radial: 3, color: (t) => (t > 0.8 ? '#5aa83e' : '#2f6e2a'), capStart: false }));
      leaves.push(place(clump(0.28, { seed: s + 30 + k, detail: 0, ...PAL.deep, top: '#6fbd48' }), [vx + 0.05, vy - len, vz]));
    }
  }
  leaves.push(place(clump(1.7, { seed: s + 20, ...PAL.lime, squash: 0.6 }), [top.x - 0.4, cy + 1.3, top.z + 0.3]));
  return { trunk: merge(parts), foliage: merge(leaves), height: 12.2 };
}

// ------------------------------------------------------------ mango tree
const MANGO_COL = { top: '#71c64a', mid: '#3f9a3c', mid2: '#378d37', bottom: '#3b8537' };
function buildMango() {
  const s = 101;
  const shape = TRUNKS.mango[0];
  const trunk = trunkTube(shape, { base: '#7b4e33', dark: '#57361f', seed: s, foot: '#5a3a26' }, { radial: 9, grooves: 6 });
  const parts = [trunk];
  const leaves = [];
  const cy = 4.5;
  leaves.push(place(clump(2.1, { seed: s, ...MANGO_COL, squash: 0.78 }), [0, cy, 0]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.2;
    const rr = 2.0 + 0.15 * Math.sin(k * 2.2);
    const p = [Math.cos(a) * rr, cy - 0.85 + 0.25 * Math.sin(k * 1.8), Math.sin(a) * rr];
    leaves.push(place(clump(1.4, { seed: s + k + 1, ...(k % 3 === 2 ? PAL.jade : MANGO_COL), squash: 0.72, flatBottom: 0.4, detail: k % 3 === 1 ? 0 : 1 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(0, 1.9, 0), V(p[0] * 0.8, p[1] - 0.2, p[2] * 0.8), 0.17, 0.07, '#7b4e33', '#643e28', s + k));
  }
  leaves.push(place(clump(1.3, { seed: s + 12, ...MANGO_COL }), [-0.3, cy + 1.2, 0.3]));
  // twigs down to where the mangos hang
  for (const [x, y, z] of MANGO_FRUIT_LOCAL) {
    parts.push(branch(V(x * 0.6, y + 1.0, z * 0.6), V(x, y + 0.3, z), 0.06, 0.03, '#7b4e33', '#643e28', s + 50));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: 6.3 };
}

// ---------------------------------------------------------------- bamboo
function buildBamboo(variant) {
  const rng = makeRng(500 + variant * 17);
  const n = variant ? 7 : 6;
  const trunk = [], leaves = [];
  const green = [['#5f9a34', '#86b84a'], ['#6fa83a', '#9cc756'], ['#4f8c3a', '#78ad4c']];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng() * 0.5;
    const r0 = 0.12 + rng() * 0.46;
    const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    const H = (variant ? 9.5 : 8) + rng() * 3.5;
    const lean = 0.5 + r0 * 1.8 + rng() * 0.8;
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(V(bx + Math.cos(a) * lean * t ** 1.6, H * t, bz + Math.sin(a) * lean * t ** 1.6));
    }
    const rs = 0.075 + rng() * 0.04;
    const [c0, c1] = green[k % 3];
    const cn = '#b8c96a';
    trunk.push(tube(pts, (t) => rs * (1 - 0.35 * t) * (Math.round(t * 20) % 2 ? 1 : 1.13), {
      radial: 5, capStart: false,
      color: (t, ang, p) => (Math.round(t * 20) % 2 ? (noise3(p.x * 3, p.y * 0.8, p.z * 3, k) > 0.45 ? '#a9b86a' : new THREE.Color(c0).lerp(new THREE.Color(c1), t)) : cn),
    }));
    // leaf sprays near the top
    for (let sp = 0; sp < 3; sp++) {
      const t = 0.62 + sp * 0.14 + rng() * 0.04;
      const i = Math.min(3, Math.floor(t * 4)), f = t * 4 - i;
      const q = pts[i].clone().lerp(pts[i + 1], f);
      for (let l = 0; l < 3; l++) {
        const la = a + (rng() - 0.5) * 2.6;
        const dx = Math.cos(la), dz = Math.sin(la);
        leaves.push(leafStrip(arcPath(q, dx, dz, 0.75 + rng() * 0.3, 0.35, 0.75, 3), (tt) => (tt >= 1 ? 0.004 : 0.075 * Math.sin(Math.PI * (0.12 + 0.88 * tt))), {
          side: V(-dz, 0, dx), ridge: 0.25, serrate: 0, color: (tt, h) => (h ? '#8fcf4c' : '#5aa436'),
        }));
      }
    }
  }
  // fresh shoots at the foot
  for (let k = 0; k < 3; k++) {
    const a = rng() * TAU, r = 0.5 + rng() * 0.3;
    trunk.push(place(spike(0.06, 0.4 + rng() * 0.3, '#6e8a3a', '#a9c25a', 4), [Math.cos(a) * r, 0, Math.sin(a) * r]));
  }
  return { trunk: merge(trunk), foliage: twoSided(merge(leaves)), height: 11 };
}

// ------------------------------------------------- giant jungle emergent
function buildGiant(variant) {
  const s = 900 + variant * 31;
  const rng = makeRng(s);
  const shape = TRUNKS.giant[variant];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const parts = [trunkTube(shape, { base: '#7a5a42', dark: '#54392a', seed: s, foot: '#5f8a39', mossAmt: 0.7, lichenAmt: 0.4 }, { radial: 12, grooves: 9, ridge: 0.06 })];
  for (let k = 0; k < 6; k++) parts.push(buttress((k / 6) * TAU + 0.2 + Math.sin(k * 2) * 0.2, s + k, 2.1));
  const leaves = [];
  const cols = ['deep', 'jade', 'teal', 'deep', 'lime'];
  // canopy: a wide flat main platform, a ring of masses, a smaller top layer
  const cy = top.y + 0.5;
  leaves.push(place(clump(5.6, { seed: s, ...PAL.deep, squash: 0.3, flatBottom: 0.3, rough: 0.25 }), [top.x, cy, top.z]));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + variant;
    const rr = 4.8 + rng() * 0.8;
    const p = [top.x + Math.cos(a) * rr, cy - 0.6 + rng() * 0.6, top.z + Math.sin(a) * rr];
    leaves.push(place(clump(3.3 + rng() * 0.6, { seed: s + k + 1, ...pick(cols, k, s), squash: 0.42, flatBottom: 0.3, maxDetail: 3 }), p, [0, a, 0]));
    // vines hanging from the rim
    for (let v = 0; v < (k % 2 ? 2 : 1); v++) {
      const va = a + (v - 0.5) * 0.5;
      const vr = rr + 1.5, vx = top.x + Math.cos(va) * vr, vz = top.z + Math.sin(va) * vr, vy = cy - 1.2;
      const len = 4 + rng() * 6;
      leaves.push(tube([V(vx, vy, vz), V(vx + 0.2, vy - len * 0.5, vz + 0.1), V(vx + 0.1, vy - len, vz)], (t) => 0.07 - 0.03 * t, { radial: 3, color: (t) => (t > 0.85 ? '#5aa83e' : '#2f6e2a'), capStart: false, capEnd: false }));
    }
  }
  leaves.push(place(clump(3.6, { seed: s + 9, ...PAL.lime, squash: 0.45, maxDetail: 3 }), [top.x + 0.8, cy + 2.2, top.z - 0.5]));
  // side branches with their own canopy blobs
  for (let b = 0; b < 2; b++) {
    const a = variant * 1.3 + b * 2.7 + 0.4;
    const y0 = 13 + b * 4;
    const from = V(pts[2].x, y0, pts[2].z);
    const to = V(Math.cos(a) * 7.5, y0 + 3.5, Math.sin(a) * 7.5);
    parts.push(tube([from, from.clone().lerp(to, 0.5).add(V(0, 1.2, 0)), to], (t) => 0.45 - 0.28 * t, { radial: 7, color: bark({ base: '#7a5a42', dark: '#54392a', seed: s + b, mossAmt: 0.6 }), capStart: false }));
    leaves.push(place(clump(3.0, { seed: s + 20 + b, ...pick(cols, b + 2, s), squash: 0.45, flatBottom: 0.3, maxDetail: 3 }), [to.x, to.y + 0.6, to.z]));
    const len = 3 + rng() * 4;
    leaves.push(tube([V(to.x, to.y - 0.6, to.z), V(to.x + 0.1, to.y - 0.6 - len / 2, to.z), V(to.x, to.y - 0.6 - len, to.z + 0.1)], (t) => 0.06 - 0.03 * t, { radial: 3, color: () => '#2f6e2a', capStart: false, capEnd: false }));
  }
  // vines down the trunk + cocoa-like pods
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    const vp = [];
    for (let i = 0; i <= 3; i++) {
      const y = 3 + i * 6.3, c = axisAt(pts, y), aa = a + i * 0.35;
      vp.push(V(c.x + Math.cos(aa) * (shape.r(y / top.y) + 0.04), y, c.z + Math.sin(aa) * (shape.r(y / top.y) + 0.04)));
    }
    parts.push(tube(vp, () => 0.07, { radial: 3, color: () => '#3a7a2c', capStart: false, capEnd: false }));
  }
  for (let k = 0; k < 7; k++) {
    const y = 4 + rng() * 12, c = axisAt(pts, y), a = rng() * TAU, rr = shape.r(y / top.y) + 0.12;
    let pod = new THREE.SphereGeometry(1, 9, 6);
    pod = deform(pod, (v) => { v.y *= 1.5; v.x *= 1 + 0.08 * Math.cos(Math.atan2(v.z, v.x) * 5); });
    const col = k % 3 === 0 ? '#e0a33a' : k % 3 === 1 ? '#b8662e' : '#8fae3a';
    parts.push(place(paint(pod, (q, n) => (n.y > 0.5 ? '#7a5a2a' : col)), [c.x + Math.cos(a) * rr, y, c.z + Math.sin(a) * rr], [0, -a, 0.3], 0.18));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: top.y + 3 };
}

// ---------------------------------------------------- kapok (umbrella)
function buildKapok(variant) {
  const s = 700 + variant * 23;
  const rng = makeRng(s);
  const shape = TRUNKS.kapok[variant];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const parts = [trunkTube(shape, { base: '#a9a298', dark: '#827a70', seed: s, lichen: '#d2d8b0', lichenAmt: 0.5, mossAmt: 0.35 }, { radial: 10, grooves: 7 })];
  for (let k = 0; k < 4; k++) parts.push(buttress((k / 4) * TAU + 0.6, s + k, 1.1));
  const leaves = [];
  const cols = variant ? ['olive', 'bright', 'lime'] : ['jade', 'bright', 'lime'];
  const cy = top.y + 1.4;
  leaves.push(place(clump(3.0, { seed: s, ...PAL.bright, squash: 0.4, flatBottom: 0.25, maxDetail: 3 }), [top.x, cy + 0.4, top.z]));
  const ring = 6;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * TAU + variant * 0.5;
    const rr = 3.8 + rng() * 0.5;
    const p = [top.x + Math.cos(a) * rr, cy - 0.2 + rng() * 0.4, top.z + Math.sin(a) * rr];
    leaves.push(place(clump(2.4 + rng() * 0.4, { seed: s + k + 1, ...pick(cols, k, s), squash: 0.4, flatBottom: 0.25, maxDetail: 3 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(top.x * 0.8, top.y - 1.5, top.z * 0.8), V(p[0] * 0.8, p[1] - 0.5, p[2] * 0.8), 0.22, 0.09, '#a9a298', '#827a70', s + k, { lichenAmt: 0.5 }));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: cy + 1.5 };
}

// --------------------------------------------------------------- banana
function buildBanana(variant) {
  const s = 800 + variant * 7;
  const rng = makeRng(s);
  const shape = TRUNKS.banana[variant];
  const pts = trunkPts(shape);
  const T = pts[pts.length - 1];
  const parts = [tube(pts, shape.r, { radial: 7, color: (t, a, p) => (noise3(p.x * 4, p.y * 3, p.z * 4, s) > 0.3 ? '#7a6a3a' : t < 0.2 ? '#6b7a38' : '#7f9a44') })];
  // hanging bunch + purple bud
  const bx = T.x + 0.3, by = T.y - 0.6;
  parts.push(tube([V(T.x, T.y - 0.1, T.z), V(bx + 0.1, T.y - 0.2, T.z), V(bx + 0.2, by - 0.4, T.z)], () => 0.03, { radial: 4, color: () => '#6b7a38' }));
  let bunch = new THREE.SphereGeometry(1, 16, 12);
  bunch = deform(bunch, (v) => { const a = Math.atan2(v.z, v.x); v.x *= 1 + 0.15 * Math.cos(a * 6 + v.y * 4); v.z *= 1 + 0.15 * Math.cos(a * 6 + v.y * 4); });
  parts.push(place(paint(bunch, (c, n) => (n.y > 0.6 ? '#7f9a44' : '#c9d44a')), [bx + 0.15, by, T.z], [0, 0, 0], [0.22, 0.34, 0.22]));
  parts.push(place(blob(0.1, 0.18, 0.1, '#7a2a55', { w: 8, h: 6 }), [bx + 0.22, by - 0.52, T.z]));
  // huge paddle leaves (both sides, since trees use a single-sided material)
  const leaves = [];
  const n = variant ? 7 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng() * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const L = 2.0 + rng() * 0.6;
    const young = k % 4 === 0;
    const path = arcPath(V(T.x + dx * 0.08, T.y + 0.05, T.z + dz * 0.08), dx, dz, L, young ? 1.4 : 0.9, young ? 0.9 : 1.1, 8);
    leaves.push(leafStrip(path, (t) => (t >= 1 ? 0.03 : (t < 0.12 ? 0.04 + t * 1.2 : 0.36 * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * t)), 0.4))), {
      side: V(-dz, 0, dx), ridge: 0.18, serrate: young ? 0 : 0.14,
      color: (t, h) => (t < 0.12 ? '#6b8a3a' : young ? (h ? '#9ad85a' : '#7cc24a') : h ? (k % 2 ? '#6cbf3e' : '#5fb24a') : (k % 2 ? '#4f9a34' : '#468f40')),
    }));
  }
  return { trunk: merge(parts), foliage: twoSided(merge(leaves)), height: T.y + 1.4 };
}

// ------------------------------------------------------------------ pine
function buildPine(variant) {
  const s = 600 + variant * 9;
  const rng = makeRng(s);
  const shape = TRUNKS.pine[variant];
  const pts = trunkPts(shape);
  const H = pts[pts.length - 1].y;
  const trunk = trunkTube(shape, { base: '#5a4a40', dark: '#3a302a', seed: s, moss: '#6b7a4a', mossAmt: 0.15, lichen: '#9a9c92', lichenAmt: 0.4 }, { radial: 8, grooves: 6 });
  const tiers = [];
  const count = variant ? 5 : 6;
  const ash = new THREE.Color('#9a9c96'), dark = new THREE.Color('#34503f'), mid = new THREE.Color('#44634a'), tip = new THREE.Color('#5d7c56'), tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const f = i / count;
    const yT = H * 0.3 + f * H * 0.66 + 0.5;
    const R = 0.55 + (1 - f) * 2.5;
    const droop = 0.45 + R * 0.28, th = 0.4 + R * 0.08;
    const prof = [[0.12, yT - droop - th], [R * 0.55, yT - droop * 0.78 - th * 0.75], [R * 0.97, yT - droop - th * 0.2], [R, yT - droop], [R * 0.6, yT - droop * 0.45], [R * 0.25, yT - droop * 0.08], [0, yT]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    let g = new THREE.LatheGeometry(prof, 20);
    const rot = rng() * TAU;
    g = deform(g, (v) => {
      const r = Math.hypot(v.x, v.z), a = Math.atan2(v.z, v.x) + rot;
      const w = Math.cos(a * 7) * (r / R);
      v.x *= 1 + 0.1 * w; v.z *= 1 + 0.1 * w;
      v.y -= 0.18 * (0.5 + 0.5 * w) * (r / R);
    });
    tiers.push(paint(g, (c, n) => {
      const r = Math.hypot(c.x, c.z) / R;
      tmp.copy(dark).lerp(mid, Math.max(0, n.y) * 0.8).lerp(tip, smooth(0.7, 1, r) * 0.6);
      if (n.y > 0.55) tmp.lerp(ash, smooth(0.55, 0.9, n.y) * (0.35 + 0.35 * noise3(c.x * 1.5, c.y, c.z * 1.5, s + i)));
      return tmp;
    }));
  }
  tiers.push(place(spike(0.3, 1.2, '#44634a', '#8a9088', 6), [pts[pts.length - 1].x, H + 0.3, pts[pts.length - 1].z]));
  return { trunk: merge([trunk]), foliage: merge(tiers), height: H + 1.5 };
}

// ------------------------------------------------------------ dead snag
function buildDead(variant) {
  const s = 650 + variant * 13;
  const rng = makeRng(s);
  const shape = TRUNKS.dead[variant];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const opts = { base: '#3d3739', dark: '#1f1b1d', seed: s, mossAmt: 0, lichen: '#6a6466', lichenAmt: 0.35, ember: 0.2 };
  const parts = [trunkTube(shape, opts, { radial: 9, grooves: 7, ridge: 0.08 })];
  const twigs = [];
  const nb = variant ? 5 : 4;
  for (let b = 0; b < nb; b++) {
    const t = 0.45 + (b / nb) * 0.5;
    const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const from = pts[i].clone().lerp(pts[i + 1], t * (pts.length - 1) - i);
    const a = b * 2.3 + variant + rng() * 0.6;
    const len = 1.6 + rng() * 1.6;
    const bp = [from];
    for (let k = 1; k <= 3; k++) {
      const f = k / 3;
      bp.push(V(from.x + Math.cos(a + Math.sin(k * 2.1) * 0.4) * len * f, from.y + len * f * (0.55 + rng() * 0.3), from.z + Math.sin(a + Math.sin(k * 2.1) * 0.4) * len * f));
    }
    parts.push(tube(bp, (tt) => 0.14 * (1 - tt * 0.75), { radial: 5, color: bark({ ...opts, ember: 0 }), capStart: false }));
    // finer twigs sway a little (foliage)
    for (let k = 0; k < 2; k++) {
      const q = bp[2 + k], ta = a + (k ? 0.9 : -0.9);
      const e = V(q.x + Math.cos(ta) * 0.7, q.y + 0.45, q.z + Math.sin(ta) * 0.7);
      twigs.push(tube([q, q.clone().lerp(e, 0.5).add(V(0, 0.1, 0)), e], (tt) => 0.05 * (1 - tt * 0.8), { radial: 4, color: () => '#2e292b', capStart: false }));
    }
  }
  twigs.push(place(spike(0.1, 0.6, '#2e292b', '#403a3c', 4), [top.x, top.y - 0.05, top.z], [0.3, 0, 0.2]));
  return { trunk: merge(parts), foliage: merge(twigs), height: top.y + 1 };
}

// ------------------------------------------------------------- mangrove
// swamp greens: dark, a little blue-grey
const MANGROVE_COL = [
  { top: '#6a9448', mid: '#456f34', mid2: '#3d6530', bottom: '#2f5226' },
  { top: '#5d8a4a', mid: '#3f6a3a', mid2: '#375e33', bottom: '#2a4a28' },
];
const MOSS_STRAND = (t) => (t > 0.85 ? '#8f9a78' : t > 0.4 ? '#7a8666' : '#66704f');

/** Hanging moss: a few thin strands from (x, y, z) down to `len`. */
function mossStrands(out, x, y, z, len, seed, n = 3) {
  const rng = makeRng(seed);
  for (let k = 0; k < n; k++) {
    const ox = (rng() - 0.5) * 0.5, oz = (rng() - 0.5) * 0.5, l = len * (0.6 + rng() * 0.5);
    out.push(tube([V(x + ox, y, z + oz), V(x + ox + 0.05, y - l * 0.5, z + oz - 0.04), V(x + ox, y - l, z + oz + 0.03)],
      (t) => 0.035 - 0.02 * t, { radial: 3, color: MOSS_STRAND, capStart: false }));
  }
}

/**
 * The swamp's mangrove: a trunk standing on a cage of arched stilt roots
 * (shared/treeShapes.js base rings), a low, wide, closed dark crown, hanging moss.
 * `dead`: the bare grey giants of the swamp arena's wall – roots, trunk, snags, moss.
 */
function buildMangrove(variant, { dead = false } = {}) {
  const s = 1200 + variant * 19 + (dead ? 7 : 0);
  const rng = makeRng(s);
  const shape = TRUNKS.mangrove[variant];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const wood = dead
    ? { base: '#6f6a62', dark: '#4a4640', seed: s, moss: '#56663e', mossAmt: 0.3, lichen: '#9da08a', lichenAmt: 0.4 }
    : { base: '#5e4c3c', dark: '#3c2f25', seed: s, moss: '#4f6e34', mossAmt: 0.55, lichen: '#a7ab8c', lichenAmt: 0.35 };
  const parts = [trunkTube(shape, wood, { radial: 9, grooves: 6, ridge: 0.05 })];
  // stilt roots: arches from the trunk out and down into the mud
  const nr = variant ? 7 : 6;
  for (let k = 0; k < nr; k++) {
    const a = (k / nr) * TAU + rng.range(-0.2, 0.2);
    const ca = Math.cos(a), sa = Math.sin(a);
    const y0 = rng.range(0.9, 1.8), R = rng.range(1.25, 1.85);
    const c0 = axisAt(pts, y0);
    const p0 = V(c0.x + ca * 0.18, y0, c0.z + sa * 0.18);
    const rp = [p0, V(ca * R * 0.55, y0 + 0.2, sa * R * 0.55), V(ca * R, -0.25, sa * R)];
    parts.push(tube(rp, (t) => 0.11 - 0.05 * t, { radial: 5, color: bark({ ...wood, seed: s + k, mossAmt: wood.mossAmt * 0.6, foot: '#3a3024' }), capStart: false }));
    // a second, thinner root branching off some arches
    if (k % 3 === 0) {
      const b0 = rp[1].clone().lerp(rp[2], 0.3);
      const R2 = R * rng.range(0.55, 0.75), a2 = a + rng.range(0.35, 0.6);
      parts.push(tube([b0, V(Math.cos(a2) * R2 * 0.9, b0.y * 0.5, Math.sin(a2) * R2 * 0.9), V(Math.cos(a2) * R2, -0.2, Math.sin(a2) * R2)],
        (t) => 0.06 - 0.03 * t, { radial: 4, color: bark({ ...wood, seed: s + 40 + k, mossAmt: 0.2 }), capStart: false }));
    }
  }
  const leaves = [];
  if (!dead) {
    // low, wide, closed crown
    const pal = MANGROVE_COL[variant % 2];
    const cy = top.y + 0.6;
    leaves.push(place(clump(2.4, { seed: s, ...pal, squash: 0.42, flatBottom: 0.35, maxDetail: 3 }), [top.x, cy, top.z]));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + variant * 0.5;
      const rr = 2.3 + rng() * 0.5;
      const p = [top.x + Math.cos(a) * rr, cy - 0.5 + rng() * 0.4, top.z + Math.sin(a) * rr];
      leaves.push(place(clump(1.55 + rng() * 0.3, { seed: s + k + 1, ...MANGROVE_COL[(k + variant) % 2], squash: 0.5, flatBottom: 0.35 }), p, [0, a, 0]));
      if (k % 2 === 0) parts.push(branch(V(top.x * 0.7, top.y - 1.4, top.z * 0.7), V(p[0] * 0.8, p[1] - 0.3, p[2] * 0.8), 0.12, 0.05, wood.base, wood.dark, s + k));
      if (k % 2 === 1) mossStrands(leaves, p[0] * 0.85, p[1] - 0.7, p[2] * 0.85, 1.3, s + 60 + k, 2);
    }
  } else {
    // bare grey snags with moss in place of a crown
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + rng() * 0.6;
      const y = top.y - 1.2 + k * 0.35, len = 1.4 + rng() * 1.3;
      const from = axisAt(pts, y).clone();
      const to = V(from.x + Math.cos(a) * len, y + len * 0.55, from.z + Math.sin(a) * len);
      parts.push(tube([from, from.clone().lerp(to, 0.5).add(V(0, 0.15, 0)), to], (t) => 0.13 * (1 - t * 0.7), { radial: 5, color: bark({ ...wood, seed: s + 80 + k }), capStart: false }));
      mossStrands(leaves, to.x * 0.8 + from.x * 0.2, to.y - 0.1, to.z * 0.8 + from.z * 0.2, 1.6, s + 90 + k, 3);
    }
    parts.push(place(spike(0.16, 0.8, wood.dark, wood.base, 5), [top.x, top.y - 0.05, top.z], [0.25, 0, 0.15]));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: top.y + 2 };
}

const deadMangroveCache = new Map();
/** A bare dead mangrove of the swamp arena's wall (variant 0 or 1), cached. */
export function deadMangroveGeometry(variant = 0) {
  let g = deadMangroveCache.get(variant);
  if (!g) {
    g = buildMangrove(variant % 2, { dead: true });
    g.trunk.userData.sharedResource = true;
    g.foliage.userData.sharedResource = true;
    deadMangroveCache.set(variant, g);
  }
  return g;
}

// ------------------------------------------------- swamp snag (no embers)
function buildSnag(variant) {
  const s = 1300 + variant * 13;
  const rng = makeRng(s);
  const shape = TRUNKS.snag[variant];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const opts = { base: '#6b6258', dark: '#433c35', seed: s, moss: '#56703c', mossAmt: 0.4, lichen: '#a2a58c', lichenAmt: 0.45 };
  const parts = [trunkTube(shape, opts, { radial: 9, grooves: 7, ridge: 0.08 })];
  const twigs = [];
  const nb = variant ? 5 : 4;
  for (let b = 0; b < nb; b++) {
    const t = 0.45 + (b / nb) * 0.5;
    const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const from = pts[i].clone().lerp(pts[i + 1], t * (pts.length - 1) - i);
    const a = b * 2.3 + variant + rng() * 0.6;
    const len = 1.4 + rng() * 1.5;
    const end = V(from.x + Math.cos(a) * len, from.y + len * (0.4 + rng() * 0.3), from.z + Math.sin(a) * len);
    parts.push(tube([from, from.clone().lerp(end, 0.5).add(V(0, 0.2, 0)), end], (tt) => 0.13 * (1 - tt * 0.75), { radial: 5, color: bark(opts), capStart: false }));
    mossStrands(twigs, end.x * 0.7 + from.x * 0.3, end.y - 0.1, end.z * 0.7 + from.z * 0.3, 1.5, s + b, 2 + (b % 2));
  }
  twigs.push(place(spike(0.1, 0.6, '#4a423a', '#5a5248', 4), [top.x, top.y - 0.05, top.z], [0.3, 0, 0.2]));
  return { trunk: merge(parts), foliage: merge(twigs), height: top.y + 1 };
}

// ------------------------------------------------------------- swamp fig
const FIG_COL = [
  { top: '#7a9a52', mid: '#4f7240', mid2: '#46683a', bottom: '#355230' },
  { top: '#6f9450', mid: '#486c3e', mid2: '#405f38', bottom: '#30492b' },
];
/** The swamp's fruit tree: a strangler fig – fused twisting roots for a trunk, a broad dark crown. */
function buildSwampFig() {
  const s = 1500;
  const rng = makeRng(s);
  const shape = TRUNKS.swampfig[0];
  const pts = trunkPts(shape);
  const top = pts[pts.length - 1];
  const wood = { base: '#7d725f', dark: '#504838', seed: s, moss: '#4f6e34', mossAmt: 0.45, lichen: '#a8ab90', lichenAmt: 0.35 };
  const parts = [trunkTube(shape, wood, { radial: 9, grooves: 9, ridge: 0.09 })];
  // the strangling roots: thin strands spiralling down the trunk into the ground
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * TAU + rng() * 0.4, turn = (rng() < 0.5 ? -1 : 1) * rng.range(0.6, 1.2);
    const rp = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, y = top.y * (1 - t) * 0.92, c = axisAt(pts, y), a = a0 + turn * t;
      const rr = shape.r(y / top.y) + 0.06 + t * t * 0.9;
      rp.push(V(c.x + Math.cos(a) * rr, y - (t > 0.95 ? 0.2 : 0), c.z + Math.sin(a) * rr));
    }
    parts.push(tube(rp, (t) => 0.07 + 0.05 * t, { radial: 5, color: bark({ ...wood, seed: s + k, mossAmt: 0.3 }), capStart: false }));
  }
  const leaves = [];
  const cy = top.y + 0.8;
  leaves.push(place(clump(2.5, { seed: s, ...FIG_COL[0], squash: 0.5, flatBottom: 0.35, maxDetail: 3 }), [top.x, cy, top.z]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3;
    const rr = 2.2 + rng() * 0.4;
    const p = [top.x + Math.cos(a) * rr, cy - 0.45 + rng() * 0.3, top.z + Math.sin(a) * rr];
    leaves.push(place(clump(1.55 + rng() * 0.25, { seed: s + k + 1, ...FIG_COL[k % 2], squash: 0.55, flatBottom: 0.4 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(top.x * 0.7, top.y - 1.0, top.z * 0.7), V(p[0] * 0.8, p[1] - 0.3, p[2] * 0.8), 0.14, 0.06, wood.base, wood.dark, s + k));
  }
  // twigs down to where the figs hang
  for (const [x, y, z] of SWAMPFIG_FRUIT_LOCAL) {
    parts.push(branch(V(x * 0.55, y + 0.9, z * 0.55), V(x, y + 0.25, z), 0.06, 0.03, wood.base, wood.dark, s + 50));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: cy + 1.6 };
}

// ------------------------------------------------------------ nipa palm
function buildNipa(variant) {
  const s = 1400 + variant * 11;
  const rng = makeRng(s);
  const shape = TRUNKS.nipa[variant];
  const pts = trunkPts(shape);
  const trunk = [tube(pts, (t) => 0.32 - 0.12 * t, { radial: 7, color: (t, a, p) => (noise3(p.x * 4, p.y * 4, p.z * 4, s) > 0.2 ? '#5a4a34' : '#6b5a3c') })];
  // a cluster of brown fruit heads low in the middle
  trunk.push(place(blob(0.32, 0.28, 0.32, (c, n) => (n.y > 0.3 ? '#7a5a34' : '#5a4026'), { w: 8, h: 6 }), [0.15, 0.55, 0.1]));
  const fronds = [];
  const n = variant ? 10 : 12;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng() * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const L = 3.4 + rng() * 1.2;
    const from = V(dx * 0.15, 0.4 + rng() * 0.3, dz * 0.15);
    const path = arcPath(from, dx, dz, L, 1.9 + rng() * 0.4, 1.0, 9);
    fronds.push(leafStrip(path, (t) => (t >= 1 ? 0.02 : 0.42 * Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * t)), 0.7)), {
      side: V(-dz, 0, dx), ridge: 0.3, serrate: 0.45,
      color: (t, h) => (t < 0.1 ? '#5f6a34' : t > 0.8 ? (h ? '#7da848' : '#5a8a3a') : h ? '#5f9440' : '#3e6e30'),
    }));
  }
  return { trunk: merge(trunk), foliage: twoSided(merge(fronds)), height: 4.5 };
}

// ------------------------------------------------------------------ cache
const BUILD = {
  palm: buildPalm, round: buildRound, tall: buildTall, jungle: buildJungle, mango: buildMango,
  bamboo: buildBamboo, giant: buildGiant, kapok: buildKapok, banana: buildBanana, pine: buildPine, dead: buildDead,
  mangrove: buildMangrove, snag: buildSnag, nipa: buildNipa, swampfig: buildSwampFig,
};
const cache = new Map();
/**
 * @param {number} [crown] crown variant 0..CROWN_VARIANTS-1 (same trunk, so the
 *   collider is unchanged; only leafy-crown types have more than one)
 * @returns {{trunk:THREE.BufferGeometry, foliage:THREE.BufferGeometry, height:number}}
 */
export function treeGeometry(type, variant = 0, detail = 0, crown = 0) {
  const c = CROWN_TYPES.has(type) ? crown % CROWN_VARIANTS : 0;
  const key = `${type}:${variant}:${detail}:${c}`;
  let g = cache.get(key);
  if (!g) {
    if (c) {
      const base = treeGeometry(type, variant, detail, 0);
      g = { ...base, foliage: crownVariant(base.foliage, c) };
    } else {
      g = withGeometryDetail(detail, () => (BUILD[type] || buildMango)(variant));
    }
    g.trunk.userData.sharedResource = true;
    g.foliage.userData.sharedResource = true;
    cache.set(key, g);
  }
  return g;
}

/** Crown variants per leafy tree type: the base crown, a taller lighter one and a wider deeper one. */
export const CROWN_VARIANTS = 3;
/** Types whose crowns are leaf clumps (palms, bananas and bamboo keep their fronds; mango keeps its fruit spots). */
export const CROWN_TYPES = new Set(['round', 'tall', 'jungle', 'giant', 'kapok', 'pine']);
const CROWN_SHAPE = [null, { sy: 1.12, sxz: 0.93, tint: [1.08, 1.06, 0.86] }, { sy: 0.9, sxz: 1.08, tint: [0.86, 0.97, 1.06] }];

/**
 * A crown variant of a foliage geometry: lumped by a smooth noise field (so
 * vertices shared by touching clumps move together), stretched taller or wider
 * from the crown's foot, and recoloured lighter or deeper green with blotches.
 * Normals are kept (the shift is small next to the clump size).
 */
function crownVariant(foliage, c) {
  const S = CROWN_SHAPE[c];
  const g = foliage.clone();
  const pos = g.attributes.position, col = g.attributes.color;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y;
  const f = 0.42;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = noise3(x * f + c * 11, y * f, z * f, 300 + c);
    const ny = noise3(x * f, y * f + c * 7, z * f, 310 + c);
    const nz = noise3(x * f, y * f, z * f + c * 5, 320 + c);
    pos.setXYZ(i, x * S.sxz + nx * 0.4, y0 + (y - y0) * S.sy + ny * 0.3, z * S.sxz + nz * 0.4);
    if (col) {
      const b = 0.9 + 0.2 * (noise3(x * 0.6, y * 0.6, z * 0.6, 330 + c) * 0.5 + 0.5);
      col.setXYZ(i, col.getX(i) * S.tint[0] * b, col.getY(i) * S.tint[1] * b, col.getZ(i) * S.tint[2] * b);
    }
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** How many geometry variants each type has (must match TRUNKS[type].length). */
export const TREE_VARIANTS = { palm: 2, round: 2, tall: 1, jungle: 1, mango: 1, bamboo: 2, giant: 2, kapok: 2, banana: 2, pine: 2, dead: 2, mangrove: 2, snag: 2, nipa: 2, swampfig: 1 };
