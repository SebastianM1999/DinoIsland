// Procedural tree models. Each builder returns { trunk, foliage } geometries
// (local space, ground at y=0) that are instanced by vegetation.js.
// Geometry is built once and cached.

import { THREE, tube, blob, merge, place, paint, deform, jitter } from '../../models/kit.js';
import { clump, leafStrip, arcPath } from './shapes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Wind settings per tree type (geometry units, before instance scale). */
export const TREE_WIND = {
  palm: { strength: 0.016, pivotY: 3.2, frequency: 1.3, heightScale: 0.25 },
  round: { strength: 0.012, pivotY: 2.6, frequency: 1.5, heightScale: 0.25 },
  tall: { strength: 0.009, pivotY: 3.8, frequency: 1.2, heightScale: 0.22 },
  jungle: { strength: 0.006, pivotY: 4.8, frequency: 1.0, heightScale: 0.2 },
  mango: { strength: 0.01, pivotY: 2.6, frequency: 1.4, heightScale: 0.25 },
};

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
export function treeMatrix(t, out = new THREE.Matrix4(), sink = 0.12) {
  _e.set(t.lean, t.rot, t.lean * 0.5, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(t.x, t.y - sink, t.z);
  _s.setScalar(t.scale);
  return out.compose(_p, _q, _s);
}

/** Bark painter: base color with darker patches, darker/mossy near the ground. */
const bark = (base, dark, seed, foot = null) => (t, a, p) => {
  if (foot && t < 0.07) return foot;
  return jitter(p, 1, seed) > 0.35 ? dark : base;
};

/** A curved branch tube from a to b. */
function branch(a, b, r0, r1, base, dark, seed) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += a.distanceTo(b) * 0.12;
  return tube([a, mid, b], (t) => r0 + (r1 - r0) * t, { radial: 5, color: bark(base, dark, seed), capStart: false });
}

// ------------------------------------------------------------------ palm
function buildPalm(variant) {
  const H = variant ? 7.3 : 8.0;
  const bend = variant ? 1.9 : 1.15;
  const wob = variant ? 0.35 : 0.12;
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pts.push(V(bend * t * t, H * t, wob * Math.sin(t * 3.2)));
  }
  const segs = (pts.length - 1) * 3;
  const trunk = tube(pts, (t) => {
    const s = Math.round(t * segs);
    const r = 0.33 - 0.13 * t + (t < 0.05 ? 0.12 : 0);
    return r * (s % 2 ? 1.08 : 1);
  }, {
    radial: 7,
    color: (t) => {
      if (t > 0.94) return '#6d4c2f';
      const s = Math.floor(t * segs);
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
    const path = arcPath(from, dx, dz, L, rise, 1.1, 8);
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
const ROUND_COL = { top: '#9ad84f', mid: '#73c03f', mid2: '#66b23a', bottom: '#579f3b' };
function buildRound(variant) {
  const s = variant * 17 + 3;
  const trunkTop = V(variant ? -0.15 : 0.1, 4.0, variant ? 0.1 : 0);
  const trunk = tube([V(0, 0, 0), V(0.08, 1.4, 0.05), V(-0.06, 2.8, 0), trunkTop],
    (t) => 0.3 - 0.1 * t + (t < 0.06 ? 0.14 : 0), { radial: 7, color: bark('#8d5c3a', '#744a2f', s, '#6a452d') });
  const parts = [trunk];
  const clumps = [];
  const cy = variant ? 5.2 : 5.0;
  clumps.push(place(clump(1.9, { seed: s, ...ROUND_COL, squash: 0.85 }), [0, cy, 0]));
  const ring = variant ? 4 : 5;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * TAU + variant * 0.6;
    const rr = 1.45 + 0.2 * Math.sin(k * 2.1);
    const p = [Math.cos(a) * rr, cy - 0.55 + 0.35 * Math.sin(k * 1.3 + variant), Math.sin(a) * rr];
    clumps.push(place(clump(1.2 + 0.2 * Math.cos(k * 1.7), { seed: s + k + 1, ...ROUND_COL, detail: k % 2 ? 0 : 1 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(trunkTop.x * 0.5, 3.2, trunkTop.z * 0.5), V(p[0] * 0.7, p[1] - 0.3, p[2] * 0.7), 0.13, 0.06, '#8d5c3a', '#744a2f', s + k));
  }
  clumps.push(place(clump(1.25, { seed: s + 9, ...ROUND_COL }), [0.35, cy + 1.2, -0.25]));
  if (variant) clumps.push(place(clump(0.9, { seed: s + 11, ...ROUND_COL, detail: 0 }), [-0.9, cy + 0.9, 0.7]));
  return { trunk: merge(parts), foliage: merge(clumps), height: 6.6 };
}

// ------------------------------------------------------ tall layered tree
const TALL_COL = { top: '#86cc4c', mid: '#5fae42', mid2: '#56a33e', bottom: '#4d9440' };
function buildTall(variant) {
  const s = 40 + variant * 13;
  const top = V(0.2, 8.4, -0.1);
  const trunk = tube([V(0, 0, 0), V(0.1, 2.5, 0.1), V(-0.1, 5.0, 0), V(0.15, 7.0, -0.05), top],
    (t) => 0.3 - 0.14 * t + (t < 0.05 ? 0.14 : 0), { radial: 7, color: bark('#a2856c', '#8a6e58', s, '#735a47') });
  const parts = [trunk];
  const clumps = [];
  const tiers = [
    { y: 5.6, r: 2.3, n: 3, rr: 1.4 },
    { y: 7.4, r: 1.8, n: 3, rr: 1.0 },
    { y: 9.1, r: 1.35, n: 1, rr: 0 },
  ];
  tiers.forEach((tr, ti) => {
    if (tr.n === 1) {
      clumps.push(place(clump(tr.r, { seed: s + ti * 5, ...TALL_COL, squash: 0.62 }), [top.x, tr.y, top.z]));
      return;
    }
    for (let k = 0; k < tr.n; k++) {
      const a = (k / tr.n) * TAU + ti * 1.1 + variant * 0.5;
      const p = [Math.cos(a) * tr.rr, tr.y + 0.2 * Math.sin(k * 2 + ti), Math.sin(a) * tr.rr];
      clumps.push(place(clump(tr.r, { seed: s + ti * 5 + k, ...TALL_COL, squash: 0.48, flatBottom: 0.3 }), p, [0, a, 0]));
      if (ti === 0) parts.push(branch(V(0, tr.y - 1.2, 0), V(p[0] * 0.8, p[1] - 0.3, p[2] * 0.8), 0.12, 0.05, '#a2856c', '#8a6e58', s + k));
    }
  });
  return { trunk: merge(parts), foliage: merge(clumps), height: 9.6 };
}

// --------------------------------------------- jungle giant (buttresses)
const JUNGLE_COL = { top: '#62b245', mid: '#44923a', mid2: '#3b8634', bottom: '#3e8636' };
function buttress(angle, seed) {
  // A thin fin: tall at the trunk, sloping to the ground outward.
  let g = new THREE.BoxGeometry(1, 1, 1, 1, 3, 3);
  g = deform(g, (v) => {
    const out = v.z + 0.5;                 // 0 at trunk, 1 outside
    const d = 0.25 + out * 1.45;
    const h = (v.y + 0.5) * 2.6 * Math.pow(1 - out, 1.4);
    const th = 0.2 * (1 - out * 0.6);
    v.set(v.x * th + jitter(v, 0.04, seed), Math.max(-0.1, h - 0.1), d);
  });
  g = paint(g, (c) => (c.y < 0.35 ? '#5f8a39' : jitter(c, 1, seed) > 0.3 ? '#6b4f3a' : '#7d5e45'));
  return place(g, [0, 0, 0], [0, angle, 0]);
}
function buildJungle(variant) {
  const s = 70 + variant * 11;
  const top = V(0.3, 9.6, 0.2);
  const trunk = tube([V(0, 0, 0), V(0.15, 3, 0.05), V(-0.05, 6.2, 0.1), top],
    (t) => 0.5 - 0.2 * t + (t < 0.05 ? 0.12 : 0), {
      radial: 8,
      color: (t, a, p) => (t < 0.12 ? '#5f8a39' : jitter(p, 1, s) > 0.3 ? '#6b4f3a' : '#806047'),
    });
  const parts = [trunk];
  for (let k = 0; k < 5; k++) parts.push(buttress((k / 5) * TAU + 0.3 + Math.sin(k) * 0.2, s + k));
  const leaves = [];
  const cy = 10.6;
  leaves.push(place(clump(3.1, { seed: s, ...JUNGLE_COL, squash: 0.5, flatBottom: 0.35 }), [top.x, cy, top.z]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + variant * 0.4;
    const rr = 2.9 + 0.3 * Math.sin(k * 1.9);
    const p = [top.x + Math.cos(a) * rr, cy - 0.7 + 0.3 * Math.sin(k * 2.7), top.z + Math.sin(a) * rr];
    leaves.push(place(clump(1.9, { seed: s + k + 1, ...JUNGLE_COL, squash: 0.58, detail: k % 3 === 2 ? 0 : 1 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(0.2, 7.8, 0.1), V(p[0] * 0.75, p[1] - 0.4, p[2] * 0.75), 0.2, 0.08, '#6b4f3a', '#806047', s + k));
    // hanging vines
    if (k % 2 === 1) {
      const vx = p[0] * 0.8, vz = p[2] * 0.8, vy = p[1] - 0.6;
      const len = 2.2 + 0.8 * Math.sin(k * 3.3);
      leaves.push(tube([V(vx, vy, vz), V(vx + 0.1, vy - len * 0.5, vz + 0.05), V(vx + 0.05, vy - len, vz)],
        (t) => 0.06 - 0.03 * t, { radial: 3, color: (t) => (t > 0.8 ? '#5aa83e' : '#2f6e2a'), capStart: false }));
      leaves.push(place(clump(0.28, { seed: s + 30 + k, detail: 0, ...JUNGLE_COL, top: '#6fbd48' }), [vx + 0.05, vy - len, vz]));
    }
  }
  leaves.push(place(clump(1.7, { seed: s + 20, ...JUNGLE_COL, squash: 0.6 }), [top.x - 0.4, cy + 1.3, top.z + 0.3]));
  return { trunk: merge(parts), foliage: merge(leaves), height: 12.2 };
}

// ------------------------------------------------------------ mango tree
const MANGO_COL = { top: '#71c64a', mid: '#3f9a3c', mid2: '#378d37', bottom: '#3b8537' };
function buildMango() {
  const s = 101;
  const trunk = tube([V(0, 0, 0), V(0.05, 1.1, 0), V(-0.05, 2.1, 0.05)],
    (t) => 0.36 - 0.1 * t + (t < 0.08 ? 0.14 : 0), { radial: 8, color: bark('#7b4e33', '#643e28', s, '#5a3a26') });
  const parts = [trunk];
  const leaves = [];
  const cy = 4.5;
  leaves.push(place(clump(2.1, { seed: s, ...MANGO_COL, squash: 0.78 }), [0, cy, 0]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.2;
    const rr = 2.0 + 0.15 * Math.sin(k * 2.2);
    const p = [Math.cos(a) * rr, cy - 0.85 + 0.25 * Math.sin(k * 1.8), Math.sin(a) * rr];
    leaves.push(place(clump(1.4, { seed: s + k + 1, ...MANGO_COL, squash: 0.72, flatBottom: 0.4, detail: k % 3 === 1 ? 0 : 1 }), p, [0, a, 0]));
    if (k % 2 === 0) parts.push(branch(V(0, 1.9, 0), V(p[0] * 0.8, p[1] - 0.2, p[2] * 0.8), 0.17, 0.07, '#7b4e33', '#643e28', s + k));
  }
  leaves.push(place(clump(1.3, { seed: s + 12, ...MANGO_COL }), [-0.3, cy + 1.2, 0.3]));
  // twigs down to where the mangos hang
  for (const [x, y, z] of MANGO_FRUIT_LOCAL) {
    parts.push(branch(V(x * 0.6, y + 1.0, z * 0.6), V(x, y + 0.3, z), 0.06, 0.03, '#7b4e33', '#643e28', s + 50));
  }
  return { trunk: merge(parts), foliage: merge(leaves), height: 6.3 };
}

// ------------------------------------------------------------------ cache
const cache = new Map();
/** @returns {{trunk:THREE.BufferGeometry, foliage:THREE.BufferGeometry, height:number}} */
export function treeGeometry(type, variant = 0) {
  const key = `${type}:${variant}`;
  let g = cache.get(key);
  if (!g) {
    if (type === 'palm') g = buildPalm(variant);
    else if (type === 'round') g = buildRound(variant);
    else if (type === 'tall') g = buildTall(variant);
    else if (type === 'jungle') g = buildJungle(variant);
    else g = buildMango();
    cache.set(key, g);
  }
  return g;
}

/** How many geometry variants each type has. */
export const TREE_VARIANTS = { palm: 2, round: 2, tall: 1, jungle: 1, mango: 1 };
