// Fruit models (held / dropped / previews, and the fruit on the island plants).
// Geometry is built once per type and shared; materials glow in their own hue.

import { THREE, deform, paint, place, merge, blob, spike, tube, jitter } from './kit.js';
import { glowMaterial } from '../world/veg/shapes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Emissive strength per fruit type (dragon fruit glows the most). */
export const FRUIT_GLOW = { berry: 0.45, mango: 0.4, dragon: 0.85 };

/** Pointed leaf, lying along +X from the origin. */
function leaf(len, width, top = '#5fc23f', bottom = '#3a8f2d') {
  let g = new THREE.SphereGeometry(1, 6, 4);
  g = deform(g, (v) => {
    const t = (v.x + 1) / 2;                           // 0..1 along the leaf
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * width;
    v.set(t * len, v.y * width * 0.18 + Math.sin(t * Math.PI) * width * 0.25, v.z * w);
  });
  return paint(g, (c, n) => (n.y > 0 ? top : bottom));
}

function center(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  return g;
}

function berryCluster() {
  const berryCol = (c, n) => (n.y > 0.55 ? '#ff7a7e' : n.y < -0.4 ? '#b41e2e' : '#e8323c');
  const spots = [[0, 0, 0], [0.085, 0.02, 0.03], [-0.05, 0.025, 0.07], [0.02, 0.06, -0.075], [-0.07, -0.03, -0.03]];
  const parts = [];
  spots.forEach(([x, y, z], i) => {
    const r = 0.058 + 0.008 * Math.sin(i * 2.3);
    let g = new THREE.SphereGeometry(r, 6, 5);
    g = deform(g, (v) => { v.x += jitter(v, r * 0.08, i + 1); v.z += jitter(v, r * 0.08, i + 2); });
    parts.push(place(paint(g, berryCol), [x, y, z]));
    // tiny dark calyx on top of each berry
    parts.push(place(blob(r * 0.35, r * 0.15, r * 0.35, '#5a1a22', { w: 5, h: 2 }), [x, y + r * 0.95, z]));
  });
  parts.push(place(leaf(0.14, 0.05), [0, 0.15, 0], [0, 0.6, 0.35]));
  parts.push(place(leaf(0.11, 0.04), [0, 0.15, 0], [0, 2.9, 0.25]));
  return center(merge(parts));
}

function mango() {
  let g = new THREE.SphereGeometry(1, 10, 8);
  g = deform(g, (v) => {
    const y = v.y;
    v.x = v.x * 0.095 * (1 - 0.12 * y) + 0.028 * (1 - y * y) - 0.02 * y; // kidney bend
    v.z *= 0.082;
    v.y = y * 0.125;
  });
  g = paint(g, (c, n) => {
    if (c.y > 0.06 && c.x < 0.01) return '#ff6d2c';         // red-orange blush near the stem
    if (n.y > 0.55) return '#ffc445';
    if (c.y < -0.07) return '#ffd84d';                      // yellow bottom
    return jitter(c, 1, 3) > 0.35 ? '#ffb82e' : '#ffab1f';
  });
  const parts = [g];
  parts.push(tube([V(-0.01, 0.115, 0), V(-0.015, 0.15, 0), V(-0.03, 0.175, 0)], () => 0.012, { radial: 4, color: () => '#6b4a2a', capStart: false }));
  parts.push(place(leaf(0.16, 0.055, '#5ec43d', '#3a8f2d'), [-0.02, 0.16, 0], [0.3, -0.5, 0.5]));
  return center(merge(parts));
}

function dragon() {
  let g = new THREE.SphereGeometry(1, 9, 7);
  g = deform(g, (v) => {
    const k = v.y < 0 ? 0.1 : 0.12;
    v.set(v.x * 0.098, v.y * k, v.z * 0.098);
  });
  g = paint(g, (c, n) => (n.y > 0.6 ? '#9a8cff' : jitter(c, 1, 5) > 0.2 ? '#7a6cff' : '#6a5cff'));
  const parts = [g];
  // bracts (scales) curling out of the skin, with glowing cyan tips
  const rows = [[-0.06, 5, 0.07], [0.0, 6, 0.1], [0.06, 5, 0.085]];
  rows.forEach(([y, n, rr], ri) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + ri * 0.55;
      const s = spike(0.028, 0.085, '#8b7dff', '#8ff6ff', 4);
      // lean the spike outward (rotate about the tangent axis) then turn it to angle a
      const p = place(s, [0, 0, 0], [0, 0, -1.0 - ri * 0.15]);
      parts.push(place(p, [Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0]));
    }
  });
  // top crown
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    parts.push(place(place(spike(0.022, 0.09, '#7fd9a0', '#c8ffe6', 4), [0, 0, 0], [0, 0, -0.45]), [Math.cos(a) * 0.02, 0.11, Math.sin(a) * 0.02], [0, -a, 0]));
  }
  return center(merge(parts));
}

const geoCache = new Map();
/** Shared fruit geometry (centered at the origin). */
export function fruitGeometry(type) {
  let g = geoCache.get(type);
  if (!g) {
    g = type === 'mango' ? mango() : type === 'dragon' ? dragon() : berryCluster();
    geoCache.set(type, g);
  }
  return g;
}

/** Glow material for a fruit type (shared). */
export function fruitMaterial(type) {
  return glowMaterial(FRUIT_GLOW[type] ?? 0.4);
}

/** One fruit, ~0.2–0.3 m, origin at its center. */
export function makeFruitMesh(type) {
  const m = new THREE.Mesh(fruitGeometry(type), fruitMaterial(type));
  m.name = `fruit-${type}`;
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}
