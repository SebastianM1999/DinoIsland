// Small plant models: decorative bush, fern, big-leaf plant (elephant ear),
// dry thorny shrub, grass tuft, flower, berry bush and the exotic dragon-fruit
// plant. Built once, cached. BUSH_TYPES lists the instanced bush kinds with
// their wind settings (same format as VEG_TUNING in vegetation.js).

import { THREE, merge, place, paint, tube, blob, spike, smoothNormals } from '../../models/kit.js';
import { clump, leafStrip, arcPath, getGeometryDetail } from './shapes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const cache = new Map();
const cached = (key, fn) => {
  key += ':' + getGeometryDetail();
  let g = cache.get(key);
  if (!g) { g = fn(); g.userData.sharedResource = true; cache.set(key, g); }
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
    const out = smoothNormals(g, Math.PI);      // soft, bent blades (no facets)
    out.computeBoundingSphere();
    return out;
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


/** Marsh berry shrub (swamp): a low, spreading bog shrub with red stems and small dark leaves, ~0.8 m. */
export function marshBushGeometry() {
  return cached('marshbush', () => {
    const col = { top: '#7d8f4c', mid: '#556b38', mid2: '#4b6033', bottom: '#38492a' };
    const parts = [place(clump(0.6, { seed: 401, ...col, squash: 0.6 }), [0, 0.45, 0])];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.2;
      parts.push(place(clump(0.42, { seed: 402 + k, ...col, detail: 1, squash: 0.6 }), [Math.cos(a) * 0.62, 0.3 + 0.08 * Math.sin(k * 2.1), Math.sin(a) * 0.62], [0, a, 0]));
      // red stems arching out over the mud
      parts.push(tube([V(0, 0.02, 0), V(Math.cos(a) * 0.4, 0.32, Math.sin(a) * 0.4), V(Math.cos(a) * 0.85, 0.2, Math.sin(a) * 0.85)], (t) => 0.025 - 0.01 * t, { radial: 4, color: () => '#7a2e2a', capStart: false }));
    }
    return merge(parts);
  });
}

/** Local positions of the berry clusters on the marsh shrub. */
export const MARSH_SPOTS_LOCAL = [
  [0.62, 0.62, 0.25], [-0.5, 0.6, 0.45], [0.05, 0.55, -0.72], [0.1, 0.92, 0.3],
];

/** Glow lotus (swamp, rare): a ring of lotus pads on the mud and a tall stalk with a glowing seed pod, ~1.1 m. */
export const LOTUS_FRUIT_LOCAL = [0, 1.05, 0];
export function lotusPlantGeometry() {
  return cached('lotusplant', () => {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + (k % 2) * 0.4, r = 0.35 + (k % 2) * 0.18;
      const pad = paint(new THREE.CircleGeometry(0.3 + (k % 3) * 0.05, 12, 0.3, TAU - 0.45).rotateX(-Math.PI / 2), (c) => (Math.hypot(c.x, c.z) > 0.24 ? '#6f9a4c' : '#3f7a3a'));
      parts.push(place(pad, [Math.cos(a) * r, 0.04 + (k % 2) * 0.03, Math.sin(a) * r], [0.08, a, 0]));
    }
    // the stalk, two pale petals curled round the pod's foot
    const top = V(LOTUS_FRUIT_LOCAL[0], LOTUS_FRUIT_LOCAL[1] - 0.12, LOTUS_FRUIT_LOCAL[2]);
    parts.push(tube([V(0, 0, 0), V(0.05, 0.5, 0.03), top], (t) => 0.03 - 0.01 * t, { radial: 5, color: (t) => (t > 0.7 ? '#7fb36a' : '#4f8a46') }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const dx = Math.cos(a), dz = Math.sin(a);
      parts.push(leafStrip(arcPath(V(top.x, top.y, top.z), dx, dz, 0.2, 1.1, 1.3, 3), (t) => (t >= 1 ? 0.005 : 0.07 * Math.sin(Math.PI * (0.1 + 0.9 * t))), {
        side: V(-dz, 0, dx), ridge: 0.4, serrate: 0, color: (t, h) => (t > 0.6 ? '#f4e6f0' : h ? '#e8c0d8' : '#c890b4'),
      }));
    }
    return merge(parts);
  });
}

/**
 * Big tropical leaf plant (elephant ear / banana leaf), ~1.5�2.2 m: long
 * stalks carrying large smooth heart-shaped leaves that droop at the tip.
 */
export function bigLeafGeometry() {
  return cached('bigleaf', () => {
    const parts = [];
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.sin(k * 2.3) * 0.25;
      const dx = Math.cos(a), dz = Math.sin(a);
      const h = 0.9 + 0.45 * ((k * 0.618) % 1);          // stalk height
      const out = 0.25 + 0.2 * ((k * 0.37) % 1);
      const top = V(dx * out, h, dz * out);
      parts.push(tube([V(dx * 0.04, 0, dz * 0.04), V(dx * out * 0.5, h * 0.6, dz * out * 0.5), top], (t) => 0.035 - 0.012 * t, {
        radial: 5, capStart: false, color: (t) => (t < 0.15 ? '#5a7a2e' : '#6fae3e'),
      }));
      // blade: broad heart shape, arching out and down from the stalk top
      const L = 0.95 + 0.3 * ((k * 0.73) % 1);
      const path = arcPath(top, dx, dz, L, 0.35, 1.05, 9);
      const shade = k % 3;
      parts.push(leafStrip(path, (t) => (t >= 1 ? 0.01 : 0.4 * L * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.9)), 0.55)), {
        side: V(-dz, 0, dx), ridge: 0.22, serrate: 0,
        color: (t, hh) => {
          if (t < 0.08) return '#7cbf45';
          const c = shade === 0 ? ['#4fa83e', '#6cc24a'] : shade === 1 ? ['#3f9a44', '#5bb85a'] : ['#5aa83a', '#86cc4c'];
          return hh ? c[1] : c[0];
        },
      }));
    }
    parts.push(place(blob(0.14, 0.1, 0.14, '#4d7a2c', { w: 6, h: 4 }), [0, 0.05, 0]));
    return merge(parts);
  });
}

/** Dry thorny volcanic shrub, ~1 m: woody twigs, dull olive/brown leaf tufts, thorns. */
export function shrubGeometry() {
  return cached('shrub', () => {
    const parts = [];
    const col = { top: '#9a9656', mid: '#7a7a4a', mid2: '#6e6a40', bottom: '#554e34' };
    const wood = (t) => (t < 0.2 ? '#4a3a2e' : '#6a5440');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + Math.sin(k * 1.7) * 0.3;
      const dx = Math.cos(a), dz = Math.sin(a);
      const L = 0.55 + 0.25 * ((k * 0.618) % 1);
      const pts = [V(0, 0, 0), V(dx * L * 0.3, L * 0.55, dz * L * 0.3), V(dx * L * 0.7, L * 0.95, dz * L * 0.7)];
      parts.push(tube(pts, (t) => 0.035 * (1 - t * 0.7), { radial: 4, capStart: false, color: wood }));
      const tip = pts[2];
      if (k % 2 === 0) {
        parts.push(place(clump(0.26 + 0.06 * Math.sin(k), { seed: 410 + k, ...col, squash: 0.7, rough: 0.3 }), [tip.x, tip.y + 0.05, tip.z]));
      } else {
        // bare forked tip with thorns
        parts.push(place(spike(0.02, 0.28, '#5e4a38', '#8a7a60', 3), [tip.x, tip.y, tip.z], [dz * 0.6, 0, -dx * 0.6]));
      }
      for (let j = 0; j < 2; j++) {
        const q = pts[1].clone().lerp(pts[2], 0.3 + j * 0.4);
        parts.push(place(spike(0.012, 0.09, '#6a5a44', '#c9b890', 3), [q.x, q.y, q.z], [j ? 1.2 : -1.2, a, 0]));
      }
    }
    parts.push(place(clump(0.34, { seed: 420, ...col, squash: 0.6, rough: 0.3 }), [0.05, 0.62, -0.05]));
    parts.push(place(clump(0.22, { seed: 421, ...col, top: '#a8864a', squash: 0.7 }), [-0.25, 0.4, 0.2]));
    return merge(parts);
  });
}

/** Reeds and cattails (swamp shores): a tuft of tall blades, a few brown cattail heads, ~1.7 m. */
export function reedGeometry() {
  return cached('reed', () => {
    const parts = [];
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.sin(k * 3.7) * 0.4;
      const dx = Math.cos(a), dz = Math.sin(a);
      const r0 = 0.06 + 0.12 * ((k * 7) % 5) / 5;
      const L = 1.3 + 0.5 * Math.abs(Math.sin(k * 2.3));
      const path = arcPath(V(dx * r0, 0, dz * r0), dx, dz, L * 0.25, 3.6, 0.35 + 0.25 * Math.abs(Math.sin(k)), 5);
      parts.push(leafStrip(path, (t) => (t >= 1 ? 0.004 : 0.035 * (1 - t * 0.7)), {
        side: V(-dz, 0, dx), ridge: 0.2, serrate: 0,
        color: (t, h) => (t > 0.75 ? (h ? '#a9b46a' : '#8a9452') : h ? '#6f8e45' : '#4f6e34'),
      }));
    }
    // cattails: a stalk with a velvety brown head
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.3, r = 0.08 + k * 0.03;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.45 + k * 0.12;
      parts.push(tube([V(x, 0, z), V(x + 0.02, h * 0.5, z), V(x + 0.05, h, z + 0.02)], () => 0.012, { radial: 3, color: () => '#6f7a44', capStart: false }));
      parts.push(place(blob(0.04, 0.14, 0.04, (c, nn) => (nn.y > 0.8 ? '#4a3420' : '#6a4a2a'), { w: 6, h: 5 }), [x + 0.05, h - 0.1, z + 0.02]));
    }
    return merge(parts);
  });
}

/**
 * Instanced bush kinds for vegetation.js: geometry builder + wind params
 * ({ strength, pivotY, frequency, heightScale }, as in VEG_TUNING).
 */
export const BUSH_TYPES = {
  bush: { geometry: bushGeometry, wind: { strength: 0.03, pivotY: 0.2, frequency: 1.8, heightScale: 0.6 } },
  fern: { geometry: fernGeometry, wind: { strength: 0.035, pivotY: 0.05, frequency: 2.0, heightScale: 0.9 } },
  bigleaf: { geometry: bigLeafGeometry, wind: { strength: 0.022, pivotY: 0.4, frequency: 1.4, heightScale: 0.5 } },
  shrub: { geometry: shrubGeometry, wind: { strength: 0.018, pivotY: 0.1, frequency: 2.1, heightScale: 0.6 } },
  reed: { geometry: reedGeometry, wind: { strength: 0.04, pivotY: 0.05, frequency: 1.7, heightScale: 0.8 } },
};
