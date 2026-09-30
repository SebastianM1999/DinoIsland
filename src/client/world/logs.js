// Fallen trees: old trunks lying on the forest floor (layout.logs), with a
// torn-up root plate at one end, a splintered break at the other, a few branch
// stubs and moss on top (grey, bare deadwood on the volcano island). All logs
// are merged into one mesh; their colliders come from the shared layout.

import * as THREE from 'three';
import { MAT, tube, blob, place, merge, paint, deform, jitter } from '../models/kit.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const BARK = { base: '#7a5236', dark: '#5f3f29', moss: '#6f9a3c', mossLight: '#86b04a', wood: '#c9a574', soil: '#5b4330' };
const DEAD = { base: '#7d746c', dark: '#5d5650', moss: '#7d746c', mossLight: '#8a817a', wood: '#b9aa94', soil: '#4b4240' };

/** One log in local space: trunk along +X from -len/2 to len/2, axis at y=0. */
function logGeometry(log) {
  const C = log.dead ? DEAD : BARK;
  const seed = 17 + log.id * 7;
  const L = log.len, r = log.r;
  const parts = [];
  // trunk: slightly tapering, gently bent, bark with moss on the upper side
  const n = 6;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(V(-L / 2 + L * t, Math.sin(t * Math.PI) * r * 0.08, jitter(V(t, seed, 0), r * 0.15, seed)));
  }
  parts.push(tube(pts, (t) => r * (1.05 - t * 0.3), {
    radial: 9,
    color: (t, a, p) => {
      const up = Math.cos(a);                                   // +1 on top, -1 underneath
      if (!log.dead && up > 0.45 && jitter(p, 1, seed + 3) > -0.3) return jitter(p, 1, seed + 4) > 0 ? C.moss : C.mossLight;
      return jitter(p, 1, seed + 5) > 0.35 ? C.dark : C.base;
    },
  }));
  // splintered break at the thin end
  let br = new THREE.ConeGeometry(r * 0.72, r * 1.3, 7, 2, true);
  br = deform(br, (v) => { v.x += jitter(v, r * 0.18, seed + 6); v.z += jitter(v, r * 0.18, seed + 7); });
  parts.push(place(paint(br, C.wood), [L / 2 + r * 0.45, 0, 0], [0, 0, -Math.PI / 2]));
  // root plate: a torn-up disc of roots and soil at the thick end
  if (log.roots) {
    let plate = new THREE.CylinderGeometry(r * 2.3, r * 2.0, r * 0.7, 12, 1);
    plate = deform(plate, (v) => {
      const k = Math.hypot(v.x, v.z) / (r * 2.3);
      v.x *= 1 + jitter(v, 0.25, seed + 8) * k;
      v.z *= 1 + jitter(v, 0.25, seed + 9) * k;
      v.y += jitter(v, r * 0.2, seed + 10);
    });
    plate = paint(plate, (c, nrm) => (Math.abs(nrm.y) > 0.6 ? C.soil : jitter(c, 1, seed + 11) > 0 ? C.dark : C.base));
    parts.push(place(plate, [-L / 2 - r * 0.2, 0, 0], [0, 0, Math.PI / 2]));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + jitter(V(k, seed, 1), 0.4, seed);
      const from = V(-L / 2 - r * 0.3, Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
      const to = V(-L / 2 - r * (0.8 + (k % 3) * 0.3), Math.cos(a) * r * 2.9, Math.sin(a) * r * 2.9);
      parts.push(tube([from, from.clone().lerp(to, 0.5).add(V(-r * 0.2, 0, 0)), to], (t) => r * 0.22 * (1 - t * 0.8), { radial: 5, color: () => C.dark, capStart: false }));
    }
  } else {
    // a sawn-flat looking break at the thick end
    parts.push(place(paint(new THREE.CircleGeometry(r * 1.02, 9), C.wood), [-L / 2 - 0.01, 0, 0], [0, -Math.PI / 2, 0]));
  }
  // broken-off branch stubs, sticking out sideways (alternating sides)
  for (let k = 0; k < 3; k++) {
    const x = -L / 2 + L * (0.3 + k * 0.22);
    const side = k % 2 ? 1 : -1;
    const a = side * (1.1 + jitter(V(k, seed, 2), 0.35, seed + 12));   // ~60-80° off vertical
    const from = V(x, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
    const to = from.clone().add(V(r * 0.5, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75));
    parts.push(tube([from, to], (t) => r * 0.3 * (1 - t * 0.35), { radial: 6, color: () => (log.dead ? C.base : C.dark) }));
  }
  // a little moss/fungus cushion here and there
  if (!log.dead) {
    for (let k = 0; k < 2; k++) {
      const x = -L / 2 + L * (0.25 + k * 0.4);
      parts.push(place(blob(r * 0.55, r * 0.22, r * 0.45, C.mossLight, { w: 7, h: 4 }), [x, r * 0.92, 0]));
    }
  }
  return merge(parts);
}

export function buildLogs(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'fallen-trees';
  if (!layout.logs?.length) return { group };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const geos = [];
  for (const log of layout.logs) {
    const g = logGeometry(log);
    // lie along the layout axis, tilted from one resting end to the other
    const pitch = Math.atan2(log.yB - log.yA, log.len);
    e.set(0, -log.rot, pitch, 'YXZ');
    q.setFromEuler(e);
    m4.compose(V(log.x, (log.yA + log.yB) / 2, log.z), q, V(1, 1, 1));
    g.applyMatrix4(m4);
    geos.push(g);
  }
  const mesh = new THREE.Mesh(merge(geos), MAT.standard);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return { group };
}
