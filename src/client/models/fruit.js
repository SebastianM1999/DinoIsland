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

function berry() {
  let body = new THREE.SphereGeometry(1, 9, 7);
  body = deform(body, (v) => {
    const point = v.y < 0 ? 1 + v.y * 0.16 : 1;
    v.set(v.x * 0.105 * point, v.y * 0.13, v.z * 0.105 * point);
  });
  const dark = new THREE.Color('#b82030'), red = new THREE.Color('#e8323c'), light = new THREE.Color('#ff7880');
  const shade = new THREE.Color();
  body = paint(body, (v) => {
    const t = Math.max(0, Math.min(1, (v.y + 0.13) / 0.26));
    return t < 0.6 ? shade.copy(dark).lerp(red, t / 0.6) : shade.copy(red).lerp(light, (t - 0.6) / 0.4);
  });
  const parts = [body];
  parts.push(place(blob(0.045, 0.015, 0.045, '#5a8330', { w: 6, h: 3 }), [0, 0.122, 0]));
  parts.push(tube([V(0, 0.13, 0), V(0.01, 0.19, 0)], () => 0.012, { radial: 5, color: () => '#567b2d' }));
  parts.push(place(leaf(0.11, 0.045), [0, 0.16, 0], [0.2, 0.6, 0.4]));
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
    g = type === 'mango' ? mango() : type === 'dragon' ? dragon() : berry();
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
