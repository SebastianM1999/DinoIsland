// Small plant models: decorative bush, fern, grass tuft, flower, berry bush
// and the exotic dragon-fruit plant. Built once, cached.

import { THREE, merge, place, paint, tube, blob } from '../../models/kit.js';
import { clump, leafStrip, arcPath } from './shapes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const cache = new Map();
const cached = (key, fn) => {
  let g = cache.get(key);
  if (!g) { g = fn(); cache.set(key, g); }
  return g;
};

/** Decorative leafy bush, ~1 m tall. */
export function bushGeometry() {
  return cached('bush', () => {
    const col = { top: '#8fd14f', mid: '#62b23c', mid2: '#56a236', bottom: '#3c7d2e' };
    const parts = [place(clump(0.62, { seed: 201, ...col, squash: 0.82 }), [0, 0.5, 0])];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      parts.push(place(clump(0.42 + 0.06 * Math.sin(k * 2), { seed: 202 + k, ...col, detail: k % 2 }), [Math.cos(a) * 0.5, 0.32 + 0.08 * Math.sin(k * 1.7), Math.sin(a) * 0.5], [0, a, 0]));
    }
    // a few pointy leaf tips poking out
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 1.1;
      const dx = Math.cos(a), dz = Math.sin(a);
      parts.push(leafStrip(arcPath(V(dx * 0.35, 0.55, dz * 0.35), dx, dz, 0.6, 0.9, 0.9, 3), (t) => (t >= 1 ? 0.01 : 0.12 * Math.sin(Math.PI * (0.15 + 0.85 * t))), {
        side: V(-dz, 0, dx), ridge: 0.3, serrate: 0, color: (t, h) => (h ? '#7cc545' : '#4e9a34'),
      }));
    }
    return merge(parts);
  });
}

/** Fern: a rosette of arching serrated fronds, ~0.9 m. */
export function fernGeometry() {
  return cached('fern', () => {
    const parts = [];
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.sin(k * 2.7) * 0.2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const L = 0.95 + 0.2 * Math.sin(k * 1.9);
      const inner = k % 2 === 0;
      const path = arcPath(V(dx * 0.05, 0.05, dz * 0.05), dx, dz, inner ? L * 0.8 : L, inner ? 1.5 : 1.1, inner ? 1.25 : 1.2, 6);
      parts.push(leafStrip(path, (t) => (t >= 1 ? 0.01 : 0.2 * Math.pow(Math.sin(Math.PI * (0.08 + 0.9 * t)), 0.8)), {
        side: V(-dz, 0, dx), ridge: 0.25, serrate: 0.55,
        color: (t, h) => (t > 0.7 ? (h ? '#8fd650' : '#63b43d') : h ? '#5fb53c' : '#3e8c30'),
      }));
    }
    parts.push(place(blob(0.08, 0.06, 0.08, '#4d7a2c', { w: 5, h: 3 }), [0, 0.04, 0]));
    return merge(parts);
  });
}

/**
 * Grass tuft: 5 bent blades (3 tris each). Vertex colors are brightness
 * factors (dark base -> light tip); the actual green comes from instanceColor.
 */
export function grassGeometry() {
  return cached('grass', () => {
    const pos = [], col = [];
    const blades = 5;
    const push = (p, c) => { pos.push(p.x, p.y, p.z); col.push(c, c, c); };
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * TAU + Math.sin(k * 4.1) * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const sx = -dz, sz = dx;                      // blade width direction
      const r0 = 0.05 + 0.03 * (k % 2);
      const h = 0.38 + 0.2 * ((k * 7) % 5) / 4;
      const lean = 0.18 + 0.1 * (k % 3);
      const w = 0.045;
      const b = V(dx * r0, 0, dz * r0);
      const bl = b.clone().add(V(sx * w, 0, sz * w)), br = b.clone().add(V(-sx * w, 0, -sz * w));
      const m = V(b.x + dx * lean * 0.45, h * 0.55, b.z + dz * lean * 0.45);
      const ml = m.clone().add(V(sx * w * 0.75, 0, sz * w * 0.75)), mr = m.clone().add(V(-sx * w * 0.75, 0, -sz * w * 0.75));
      const tip = V(b.x + dx * lean * 1.25, h, b.z + dz * lean * 1.25);
      const c0 = 0.62, c1 = 0.92, c2 = 1.22;
      push(bl, c0); push(br, c0); push(mr, c1);
      push(bl, c0); push(mr, c1); push(ml, c1);
      push(ml, c1); push(mr, c1); push(tip, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  });
}

/** Flower tuft: 2 little 5-petal flowers on short stems + 2 leaves. Petals white (tinted per instance). */
export function flowerGeometry() {
  return cached('flower', () => {
    const parts = [];
    const pos = [], col = [];
    const c3 = new THREE.Color();
    const tri = (a, b, c, hex) => {
      pos.push(...a, ...b, ...c);
      c3.set(hex);
      for (let k = 0; k < 3; k++) col.push(c3.r, c3.g, c3.b);
    };
    const heads = [[0, 0.32, 0, 0.0], [0.12, 0.22, 0.08, 0.7]];
    for (const [x, y, z, rot] of heads) {
      // 5 diamond petals (2 tris each), cupped slightly upward; alternating shade
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + rot;
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
        const at = (d, w, h) => [x + dx * d + px * w, y + h, z + dz * d + pz * w];
        const shade = k % 2 ? '#ffffff' : '#e9e3f0';
        tri(at(0.012, 0, 0), at(0.05, 0.028, 0.012), at(0.1, 0, 0.03), shade);
        tri(at(0.012, 0, 0), at(0.1, 0, 0.03), at(0.05, -0.028, 0.012), shade);
      }
      // yellow center (3-sided pyramid)
      const cc = [x, y + 0.03, z];
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * TAU, a1 = ((k + 1) / 3) * TAU;
        tri([x + Math.cos(a0) * 0.028, y + 0.004, z + Math.sin(a0) * 0.028], cc, [x + Math.cos(a1) * 0.028, y + 0.004, z + Math.sin(a1) * 0.028], k ? '#ffd84a' : '#ffb830');
      }
      // stem: a thin bent ribbon
      const w = 0.01;
      tri([x * 0.3 - w, 0, z * 0.3], [x * 0.3 + w, 0, z * 0.3], [x + w * 0.5, y, z], '#4f9a35');
      tri([x * 0.3 - w, 0, z * 0.3], [x + w * 0.5, y, z], [x - w * 0.5, y, z], '#468f30');
    }
    const heads3 = new THREE.BufferGeometry();
    heads3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    heads3.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    heads3.computeVertexNormals();
    parts.push(heads3);
    for (let k = 0; k < 2; k++) {
      const a = k * 2.6 + 0.4, dx = Math.cos(a), dz = Math.sin(a);
      parts.push(leafStrip(arcPath(V(0, 0, 0), dx, dz, 0.22, 1.0, 1.2, 3), (t) => (t >= 1 ? 0.005 : 0.045 * Math.sin(Math.PI * (0.1 + 0.9 * t))), {
        side: V(-dz, 0, dx), ridge: 0.2, serrate: 0, color: (t, h) => (h ? '#6cbf42' : '#4a9632'),
      }));
    }
    return merge(parts);
  });
}

/** Berry bush body (the berries are separate instances), ~1.2 m. */
export function berryBushGeometry() {
  return cached('berrybush', () => {
    const col = { top: '#7ccc48', mid: '#48a23a', mid2: '#3f9535', bottom: '#2c6f2b' };
    const parts = [place(clump(0.72, { seed: 301, ...col, squash: 0.9 }), [0, 0.72, 0])];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.3;
      parts.push(place(clump(0.5, { seed: 302 + k, ...col, detail: 1, squash: 0.85 }), [Math.cos(a) * 0.55, 0.45 + 0.1 * Math.sin(k * 2.3), Math.sin(a) * 0.55], [0, a, 0]));
    }
    parts.push(place(clump(0.45, { seed: 310, ...col }), [0.1, 1.2, -0.05]));
    // woody base
    parts.push(tube([V(0, -0.05, 0), V(0.03, 0.3, 0)], (t) => 0.1 - 0.03 * t, { radial: 5, color: () => '#6b4a30', capStart: false }));
    return merge(parts);
  });
}

/** Local positions where berry clusters sit on the berry bush (on its surface). */
export const BERRY_SPOTS_LOCAL = [
  [0.72, 0.98, 0.3], [-0.52, 1.08, 0.6], [0.06, 0.84, -0.85], [0.08, 1.5, 0.42],
];

/** Exotic spiky dragon-fruit plant, ~1 m: a succulent rosette + a stalk holding the fruit. */
export const DRAGON_FRUIT_LOCAL = [0, 0.98, 0];
export function dragonPlantGeometry() {
  return cached('dragonplant', () => {
    const parts = [];
    // thick triangular succulent leaves with spiny edges
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + (k % 2) * 0.3;
      const dx = Math.cos(a), dz = Math.sin(a);
      const L = k % 2 ? 0.75 : 0.95;
      const path = arcPath(V(dx * 0.06, 0.05, dz * 0.06), dx, dz, L, k % 2 ? 1.35 : 1.0, k % 2 ? 1.0 : 1.05, 5);
      parts.push(leafStrip(path, (t) => (t >= 1 ? 0.005 : 0.13 * (1 - t * 0.8)), {
        side: V(-dz, 0, dx), ridge: 0.8, serrate: 0.6,
        color: (t, h) => (t > 0.75 ? (h ? '#b6f0c8' : '#7fd6b0') : h ? '#3fb57a' : '#23865f'),
      }));
    }
    // stalk to the fruit, with a few bracts
    const top = V(DRAGON_FRUIT_LOCAL[0], DRAGON_FRUIT_LOCAL[1] - 0.14, DRAGON_FRUIT_LOCAL[2]);
    parts.push(tube([V(0, 0, 0), V(0.04, 0.45, 0.02), top], (t) => 0.045 - 0.015 * t, { radial: 5, color: (t) => (t > 0.7 ? '#4fc28b' : '#2e9366') }));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const dx = Math.cos(a), dz = Math.sin(a);
      parts.push(leafStrip(arcPath(V(top.x, top.y - 0.02, top.z), dx, dz, 0.22, 0.8, 1.2, 3), (t) => (t >= 1 ? 0.004 : 0.05), {
        side: V(-dz, 0, dx), ridge: 0.5, serrate: 0, color: (t, h) => (h ? '#8a7cff' : '#5a4bd6'),
      }));
    }
    // a couple of small glow-bulbs on the ground leaves for an exotic touch
    parts.push(place(blob(0.1, 0.07, 0.1, '#2e7f58', { w: 6, h: 4 }), [0, 0.05, 0]));
    return merge(parts);
  });
}

