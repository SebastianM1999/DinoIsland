// Dinosaur nest: a big twig-and-straw ring (~2.5 m radius at size 1) with a
// soft straw bowl, four speckled dino eggs around the middle (the middle is
// kept free for the golden egg relic), bones and a few feathers around it.
//
// API: buildNest(n) -> THREE.Group at (n.x, n.y, n.z), rotation.y = n.rot,
//   uniformly scaled by n.size (default 1). The golden egg goes at the local
//   center, height NEST_EGG_Y * size above n.y.

import * as THREE from 'three';
import { MAT, deform, paint, place, merge, tube, blob, limb, mesh } from '../kit.js';
import { leafStrip, arcPath, LEAF_MAT } from '../../world/veg/shapes.js';
import { makeRng } from '../../../shared/rng.js';
import { TAU, noise3, smoothstep } from './common.js';

/** Bowl floor height at the nest center (local, before n.size). */
export const NEST_EGG_Y = 0.3;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STRAW = ['#c9a15a', '#a47a3e', '#d8b56c', '#8a6236'].map((h) => new THREE.Color(h));

function straw(seed) {
  const tmp = new THREE.Color();
  return (c) => {
    const a = Math.atan2(c.z, c.x);
    const s = Math.sin(a * 23 + c.y * 9 + noise3(c.x * 2, c.y * 2, c.z * 2, seed) * 4);
    const k = s > 0.5 ? 2 : s < -0.6 ? 1 : 0;
    tmp.copy(STRAW[k]).lerp(STRAW[3], smoothstep(0.25, -0.1, c.y) * 0.6);
    return tmp.multiplyScalar(0.92 + 0.1 * noise3(c.x * 6, c.y * 6, c.z * 6, seed + 1));
  };
}

function eggGeometry(seed) {
  let g = new THREE.SphereGeometry(1, 24, 18);
  g = deform(g, (v) => { const k = v.y > 0 ? 1 - 0.2 * v.y * v.y : 1 - 0.04 * v.y * v.y; v.x *= k; v.z *= k; });
  g.scale(0.19, 0.27, 0.19);
  const tmp = new THREE.Color();
  return paint(g, (c) => {
    tmp.set('#f1e6cc').lerp(new THREE.Color('#dfeede'), smoothstep(-0.2, 0.25, c.y) * 0.4);
    if (noise3(c.x * 30, c.y * 30, c.z * 30, seed) > 0.42) tmp.set('#8a6a4a');
    else if (noise3(c.x * 16, c.y * 16, c.z * 16, seed + 3) > 0.5) tmp.lerp(new THREE.Color('#b99a78'), 0.6);
    return tmp;
  });
}

function bone(len) {
  return merge([
    place(limb(0.035, 0.03, len, '#efe3c8', 8), [0, -len / 2, 0]),
    place(blob(0.06, 0.05, 0.06, '#e8dbbd', { w: 7, h: 5 }), [0.03, len / 2, 0]),
    place(blob(0.06, 0.05, 0.06, '#e8dbbd', { w: 7, h: 5 }), [-0.03, len / 2, 0]),
    place(blob(0.06, 0.05, 0.06, '#e8dbbd', { w: 7, h: 5 }), [0.03, -len / 2, 0]),
    place(blob(0.06, 0.05, 0.06, '#e8dbbd', { w: 7, h: 5 }), [-0.03, -len / 2, 0]),
  ]);
}

let cached = null;
function nestGeometry() {
  if (cached) return cached;
  const rng = makeRng(0x7e57);
  const std = [], leaf = [];
  // ring mound
  let ring = new THREE.TorusGeometry(1.75, 0.72, 18, 56);
  ring.rotateX(Math.PI / 2);
  ring = deform(ring, (v) => {
    const a = Math.atan2(v.z, v.x);
    v.y = v.y * 0.62 + 0.3;
    const lump = 1 + 0.06 * Math.sin(a * 5) + 0.05 * noise3(v.x * 1.5, v.y * 1.5, v.z * 1.5, 2);
    v.x *= lump; v.z *= lump;
    if (v.y < 0) v.y *= 0.2;
  });
  std.push(paint(ring, straw(1)));
  // bowl
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(t * 1.9, NEST_EGG_Y - 0.12 + 0.45 * t * t)); }
  prof.reverse();
  let bowl = new THREE.LatheGeometry(prof, 40);
  std.push(paint(bowl, straw(5)));
  // twigs laid around the rim
  for (let k = 0; k < 38; k++) {
    const a = (k / 38) * TAU + rng() * 0.2;
    const r = 1.35 + rng() * 1.0, y = 0.25 + rng() * 0.5;
    const len = 1.1 + rng() * 0.9, da = len / r / 2;
    const p = (aa, yy, rr) => V(Math.cos(aa) * rr, yy, Math.sin(aa) * rr);
    const pts = [p(a - da, y + (rng() - 0.5) * 0.3, r + (rng() - 0.5) * 0.4), p(a, y + 0.1, r), p(a + da, y + (rng() - 0.5) * 0.3, r + (rng() - 0.5) * 0.4)];
    const col = rng() < 0.5 ? '#6b4a2e' : '#8a6236';
    std.push(tube(pts, (t) => 0.035 + 0.015 * (1 - t), { radial: 4, color: () => col }));
  }
  // straw wisps sticking out
  for (let k = 0; k < 22; k++) {
    const a = rng() * TAU, dx = Math.cos(a), dz = Math.sin(a);
    const from = V(dx * (1.9 + rng() * 0.5), 0.3 + rng() * 0.35, dz * (1.9 + rng() * 0.5));
    leaf.push(leafStrip(arcPath(from, dx, dz, 0.5 + rng() * 0.4, 0.6, 1.1, 3), (t) => (t >= 1 ? 0.004 : 0.025), {
      side: V(-dz, 0, dx), ridge: 0.2, serrate: 0, color: (t, h) => (h ? '#e3c47a' : '#c9a15a'),
    }));
  }
  // eggs around the (free) middle
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4, r = 0.72 + rng() * 0.12;
    std.push(place(eggGeometry(k + 3), [Math.cos(a) * r, NEST_EGG_Y + 0.2 + r * r * 0.08, Math.sin(a) * r], [Math.sin(a) * 0.35, rng() * TAU, -Math.cos(a) * 0.35]));
  }
  // bones around the nest
  const bones = [[2.9, 0.4, 0.6], [-2.6, 1.9, 0.45], [0.8, -3.0, 0.7], [-1.4, -2.7, 0.4]];
  for (const [x, z, len] of bones) std.push(place(bone(len), [x, 0.06, z], [Math.PI / 2, 0, rng() * TAU]));
  // a rib cage half buried
  for (let k = 0; k < 4; k++) {
    const x = -3.1 + k * 0.28;
    std.push(tube([V(x, 0, -1.2), V(x + 0.05, 0.45, -1.0), V(x + 0.1, 0.55, -0.6), V(x + 0.12, 0.3, -0.25)], (t) => 0.045 - 0.02 * t, { radial: 5, color: () => '#e8dbbd' }));
  }
  std.push(tube([V(-3.3, 0.05, -1.25), V(-2.0, 0.08, -1.2)], () => 0.06, { radial: 6, color: () => '#e2d5b5' }));
  // feathers
  const fcols = [['#3fb6a8', '#23806f'], ['#ff9a4a', '#d8652e'], ['#6f7fd8', '#4a58b0']];
  for (let k = 0; k < 6; k++) {
    const a = rng() * TAU, r = 2.4 + rng() * 1.2, dx = Math.cos(a + 1), dz = Math.sin(a + 1);
    const [c0, c1] = fcols[k % 3];
    leaf.push(leafStrip(arcPath(V(Math.cos(a) * r, 0.04, Math.sin(a) * r), dx, dz, 0.45, 0.05, 0.1, 5), (t) => (t >= 1 ? 0.004 : 0.07 * Math.sin(Math.PI * (0.05 + 0.9 * t)) ** 0.6), {
      side: V(-dz, 0, dx), ridge: 0.15, serrate: 0.2, color: (t, h) => (t < 0.15 ? '#f1e6cc' : h ? c0 : c1),
    }));
  }
  cached = { std: merge(std), leaf: merge(leaf) };
  return cached;
}

export function buildNest(n) {
  const g = nestGeometry();
  const group = new THREE.Group();
  group.name = 'nest';
  group.position.set(n.x, n.y ?? 0, n.z);
  group.rotation.y = n.rot || 0;
  group.scale.setScalar(n.size || 1);
  group.add(mesh(g.std, MAT.standard));
  group.add(mesh(g.leaf, LEAF_MAT, { cast: false }));
  return group;
}
