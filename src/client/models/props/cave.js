// Cave: a big smooth rock dome with a hollow inside and a thick arched
// entrance (see shared/caveShape.js for size, colliders and the relic spot).
// The rock is one smooth SDF mesh (dome minus interior minus entrance tunnel),
// colored by the biome's rock colors, darker inside. Jungle: moss on top,
// bushes, vines over the entrance and hanging roots inside. Volcano: ash on
// top, glowing ember cracks and stalactites. Inside: glowing crystals (+
// mushrooms in the jungle) and one small point light.
//
// API: buildCave(c, biome) -> THREE.Group at (c.x, c.y, c.z), rotation.y = c.rot.
//   Entrance faces local -z (world (-sin rot, -cos rot)). c.seed varies the rock.

import * as THREE from 'three';
import { MAT, place, merge, tube, blob, limb, spike, rockGeometry, mesh } from '../kit.js';
import { clump, leafStrip, arcPath, LEAF_MAT } from '../../world/veg/shapes.js';
import { fernGeometry } from '../../world/veg/plants.js';
import { makeRng } from '../../../shared/rng.js';
import { CAVE } from '../../../shared/caveShape.js';
import { TAU, fbm3, noise3, smoothstep, sdfMesh, sdfRay, tintGlow, orient } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------- SDF
const ell3 = (x, y, z, a, b, c) => {
  const k0 = Math.hypot(x / a, y / b, z / c);
  const k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
  return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
};
const ell2 = (x, y, a, b) => {
  const k0 = Math.hypot(x / a, y / b);
  const k1 = Math.hypot(x / (a * a), y / (b * b));
  return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
};
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

export function caveSdf(seed) {
  const outer = (x, y, z) => ell3(x, y + 1.5, z, CAVE.radius + 0.1, CAVE.top + 1.5, CAVE.radius + 0.1) - 0.5 * fbm3(x * 0.32, y * 0.32, z * 0.32, seed);
  const interior = (x, y, z) => ell3(x, y + 0.8, z, CAVE.inner + 0.2, CAVE.height + 0.8, CAVE.inner + 0.2) + 0.22 * noise3(x * 0.6, y * 0.6, z * 0.6, seed + 3);
  const tunnel = (x, y, z) => Math.max(ell2(x, y - 0.9, 2.7, 3.7) + 0.12 * noise3(x * 0.8, y * 0.8, z * 0.8, seed + 5), z + 1.0);
  const sdf = (x, y, z) => {
    let d = smax(outer(x, y, z), -interior(x, y, z), 0.8);
    d = smax(d, -tunnel(x, y, z), 0.9);
    return smax(d, -(y + 0.7), 0.2);
  };
  return { sdf, interior, tunnel };
}

// ---------------------------------------------------------------- colors
function palette(biome) {
  const volcano = biome?.id === 'volcano';
  const rocks = biome?.rocks || { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845' };
  return {
    volcano,
    c: rocks.colors.map((h) => new THREE.Color(h)),
    moss: new THREE.Color(rocks.moss || '#6fa845'),
    mossy: !volcano,
    ash: new THREE.Color(biome?.terrain?.ash || '#8a8488'),
    inner: new THREE.Color(volcano ? '#2a2228' : '#4a4458'),
    crystal: volcano ? ['#ff6a2a', '#ffd08a'] : ['#1fb4e0', '#c8f8ff'],
    light: volcano ? 0xff7a3a : 0x6fe3ff,
  };
}

// ------------------------------------------------------------------ build
const geoCache = new Map();

function buildGeometry(seed, biome) {
  const P = palette(biome);
  const rng = makeRng(seed * 131 + 7);
  const { sdf, interior, tunnel } = caveSdf(seed);
  const tmp = new THREE.Color();
  const rock = sdfMesh(sdf, {
    min: [-8.6, -1.1, -9.2], max: [8.6, CAVE.top + 1.2, 8.6], step: 0.32,
    color: (p, n) => {
      const t = fbm3(p.x * 0.25, p.y * 0.4, p.z * 0.25, seed + 11);
      tmp.copy(P.c[0]).lerp(P.c[1], smoothstep(-0.1, 0.5, t)).lerp(P.c[2], smoothstep(-0.1, -0.5, t) * 0.8);
      // horizontal strata + small speckles for texture
      const strata = Math.sin(p.y * 3.1 + noise3(p.x * 0.4, 0, p.z * 0.4, seed) * 2.0);
      tmp.multiplyScalar(0.93 + 0.07 * strata + 0.05 * noise3(p.x * 2.2, p.y * 2.2, p.z * 2.2, seed + 2));
      const inside = Math.max(
        1 - smoothstep(0.0, 1.3, interior(p.x, p.y, p.z)),
        (1 - smoothstep(0.0, 1.0, tunnel(p.x, p.y, p.z))) * smoothstep(-7.8, -3.5, p.z),
      );
      if (!P.volcano && P.mossy && inside < 0.3) {
        const m = smoothstep(0.35, 0.8, n.y + 0.25 * fbm3(p.x * 0.5, p.y * 0.5, p.z * 0.5, seed + 9));
        tmp.lerp(P.moss, m * 0.9);
      }
      if (P.volcano && inside < 0.3) {
        tmp.lerp(P.ash, smoothstep(0.55, 0.9, n.y) * 0.7);
        if (p.y < 1.2) tmp.multiplyScalar(0.75 + 0.25 * smoothstep(-0.5, 1.2, p.y));
      }
      if (inside > 0) tmp.lerp(P.inner, inside * 0.55).multiplyScalar(1 - inside * 0.25);
      if (p.y < 0.5) tmp.multiplyScalar(0.82 + 0.18 * smoothstep(-0.6, 0.5, p.y));   // contact shade
      return tmp;
    },
  });

  const std = [], leaf = [], glow = [];
  // ---- floor inside (dark packed dirt with pebbles)
  let floor = new THREE.CircleGeometry(CAVE.inner + 0.3, 40, 0, TAU);
  floor.rotateX(-Math.PI / 2);
  floor = place(floor, [0, 0.03, 0]);
  const floorCol = new THREE.Color(P.volcano ? '#2e2629' : '#5e5048'), ft = new THREE.Color();
  std.push(floor);
  const fc = floor.attributes.color;
  for (let i = 0; i < fc.count; i++) {
    const x = floor.attributes.position.getX(i), z = floor.attributes.position.getZ(i);
    ft.copy(floorCol).multiplyScalar(0.8 + 0.2 * Math.hypot(x, z) / CAVE.inner);
    fc.setXYZ(i, ft.r, ft.g, ft.b);
  }
  for (let k = 0; k < 7; k++) {
    const a = rng() * TAU, r = 1.5 + rng() * 2.8;
    std.push(place(rockGeometry({ radius: 0.2 + rng() * 0.25, seed: seed + k, squash: 0.6, colors: biome?.rocks?.colors }), [Math.sin(a) * r, 0.02, Math.cos(a) * r]));
  }

  // ---- crystals along the inner wall (back half)
  const crystal = (x, z, s, lean, sd) => {
    const r = makeRng(sd);
    const parts = [];
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const h = (0.5 + r() * 0.7) * s, rad = (0.08 + r() * 0.06) * s;
      const body = new THREE.CylinderGeometry(rad, rad * 0.8, h, 6, 1);
      body.translate(0, h / 2, 0);
      const tip = new THREE.ConeGeometry(rad, h * 0.3, 6, 1);
      tip.translate(0, h * 1.15, 0);
      const c0 = new THREE.Color(P.crystal[0]), c1 = new THREE.Color(P.crystal[1]), c = new THREE.Color();
      const g = merge([body, tip].map((q) => { q = q.index ? q.toNonIndexed() : q; const pos = q.attributes.position; const col = new Float32Array(pos.count * 3); for (let v = 0; v < pos.count; v++) { c.copy(c0).lerp(c1, pos.getY(v) / (h * 1.3)); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; } q.setAttribute('color', new THREE.BufferAttribute(col, 3)); return q; }), 0.9);
      const a = r() * TAU;
      parts.push(orient(g, [x + Math.cos(a) * 0.15 * s, 0, z + Math.sin(a) * 0.15 * s], [Math.cos(a) * (0.3 + lean), 1, Math.sin(a) * (0.3 + lean)], 1, r() * TAU));
    }
    return parts;
  };
  for (let k = 0; k < 6; k++) {
    const a = (0.25 + (k / 5) * 1.5) * Math.PI * (k % 2 ? 1 : -1) * 0.62 + (rng() - 0.5) * 0.3;
    const r = CAVE.inner - 0.45 - rng() * 0.3;
    glow.push(...crystal(Math.sin(a) * r, Math.cos(a) * r, 0.9 + rng() * 0.8, 0.1, seed * 13 + k));
  }
  if (!P.volcano) {
    // glowing mushrooms
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU, r = 2.8 + rng() * 1.9;
      if (Math.cos(a) < -0.5) continue;
      const x = Math.sin(a) * r, z = Math.cos(a) * r, s = 0.6 + rng() * 0.7;
      std.push(place(limb(0.035 * s, 0.03 * s, 0.28 * s, '#e8e0d0', 6), [x, 0, z]));
      glow.push(place(blob(0.12 * s, 0.06 * s, 0.12 * s, (c, n) => (n.y > 0.2 ? '#5ff0d8' : '#2a9c8e'), { w: 8, h: 5 }), [x, 0.28 * s, z]));
    }
  }

  // ---- ceiling: hanging roots (jungle) / stalactites (volcano)
  for (let k = 0; k < 16; k++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * (CAVE.inner - 1.2);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z < -3) continue;
    const hit = sdfRay(sdf, [x, 0.5, z], [0, 1, 0], 8, 0.1);
    if (!hit) continue;
    if (P.volcano || k % 3 === 0) {
      const len = 0.4 + rng() * 0.9;
      std.push(orient(spike(0.12 + rng() * 0.1, len, P.c[1].getHex(), P.c[0].getHex(), 5), [hit[0], hit[1] + 0.15, hit[2]], [0, -1, 0]));
    } else {
      const len = 1.2 + rng() * 1.8;
      const pts = [V(hit[0], hit[1] + 0.1, hit[2]), V(hit[0] + (rng() - 0.5) * 0.3, hit[1] - len * 0.5, hit[2] + (rng() - 0.5) * 0.3), V(hit[0] + (rng() - 0.5) * 0.4, hit[1] - len, hit[2] + (rng() - 0.5) * 0.4)];
      std.push(tube(pts, (t) => 0.06 * (1 - t * 0.7), { radial: 5, color: (t) => (t > 0.8 ? '#8a6a4a' : '#6b4f3a'), capStart: false }));
    }
  }

  if (!P.volcano) {
    // ---- vines over the entrance
    for (let k = 0; k < 11; k++) {
      const x = -2.4 + (k / 10) * 4.8 + (rng() - 0.5) * 0.3;
      const archY = 0.9 + 3.7 * Math.sqrt(Math.max(0, 1 - (x / 2.7) ** 2));
      const hit = sdfRay(sdf, [x, archY + 0.35, -12], [0, 0, 1], 9, 0.08);
      if (!hit) continue;
      const len = 0.8 + rng() * (archY - 0.9) * 0.7;
      const p0 = V(hit[0], hit[1], hit[2] - 0.05);
      const pts = [p0, V(p0.x + 0.05, p0.y - len * 0.5, p0.z - 0.15), V(p0.x - 0.05, p0.y - len, p0.z - 0.1)];
      std.push(tube(pts, (t) => 0.035 - 0.015 * t, { radial: 5, color: () => '#3f7a2c', capStart: false }));
      for (let j = 1; j < 5; j++) {
        const t = j / 5, q = pts[0].clone().lerp(pts[2], t);
        const dir = j % 2 ? 1 : -1;
        leaf.push(leafStrip(arcPath(V(q.x, q.y, q.z - 0.12), dir * 0.7, -0.7, 0.22, 0.4, 1.3, 3), (tt) => (tt >= 1 ? 0.005 : 0.07 * Math.sin(Math.PI * (0.1 + 0.9 * tt))), {
          side: V(0.7, 0, dir * 0.7), ridge: 0.3, serrate: 0, color: (tt, h) => (h ? '#7cc545' : '#4e9a34'),
        }));
      }
    }
    // ---- bushes on the dome and ferns around the foot
    const col = { top: '#8fd14f', mid: '#62b23c', mid2: '#56a236', bottom: '#3c7d2e' };
    for (let k = 0; k < 7; k++) {
      const a = rng() * TAU, r = rng() * 5;
      const hit = sdfRay(sdf, [Math.sin(a) * r, 12, Math.cos(a) * r], [0, -1, 0], 14, 0.1);
      if (!hit) continue;
      std.push(place(clump(0.7 + rng() * 0.6, { seed: seed + k * 3, ...col, squash: 0.7 }), [hit[0], hit[1] + 0.15, hit[2]]));
    }
    const fern = fernGeometry();
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU;
      if (Math.cos(a) < -0.75) continue;
      const r = CAVE.radius + 0.1 + rng() * 0.6;
      leaf.push(place(fern.clone(), [Math.sin(a) * r, 0, Math.cos(a) * r], [0, rng() * TAU, 0], 1 + rng() * 0.6));
    }
  } else {
    // ---- ember cracks on the outside
    for (let k = 0; k < 6; k++) {
      let az = rng() * TAU, el = 0.1 + rng() * 0.35;
      if (Math.cos(az) < -0.7) az += Math.PI * 0.5;
      const pts = [];
      for (let j = 0; j < 7; j++) {
        const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
        const o = [d[0] * 14, 1 + d[1] * 14, d[2] * 14];
        const hit = sdfRay(sdf, o, [-d[0], -d[1], -d[2]], 16, 0.12);
        if (hit) pts.push(V(hit[0] - d[0] * 0.02, hit[1], hit[2] - d[2] * 0.02));
        az += (rng() - 0.5) * 0.22;
        el += 0.05 + rng() * 0.07;
      }
      if (pts.length < 3) continue;
      glow.push(tube(pts, (t) => 0.1 * (1 - t * 0.6), { radial: 5, color: (t) => (t < 0.3 ? '#ffd26a' : '#ff6a2a') }));
    }
  }

  // ---- boulders around the foot
  for (let k = 0; k < 8; k++) {
    const a = rng() * TAU;
    if (Math.cos(a) < -0.8) continue;
    const r = CAVE.radius + 0.2 + rng() * 0.8;
    std.push(place(rockGeometry({ radius: 0.5 + rng() * 0.7, seed: seed + 40 + k, squash: 0.65, colors: biome?.rocks?.colors, moss: P.mossy ? biome?.rocks?.moss : null }), [Math.sin(a) * r, 0, Math.cos(a) * r], [0, rng() * TAU, 0]));
  }
  return { rock, std: merge(std), leaf: leaf.length ? merge(leaf) : null, glow: merge(glow), light: P.light };
}

export function buildCave(c, biome) {
  const seed = (c.seed ?? 1) | 0;
  const key = `${seed}:${biome?.id || 'jungle'}`;
  let g = geoCache.get(key);
  if (!g) { g = buildGeometry(seed, biome); geoCache.set(key, g); }
  const group = new THREE.Group();
  group.name = 'cave';
  group.position.set(c.x, c.y ?? 0, c.z);
  group.rotation.y = c.rot || 0;
  group.add(mesh(g.rock, MAT.standard));
  group.add(mesh(g.std, MAT.standard));
  if (g.leaf) group.add(mesh(g.leaf, LEAF_MAT, { cast: false }));
  group.add(mesh(g.glow, tintGlow(0.85, 0.3), { cast: false }));
  const light = new THREE.PointLight(g.light, 7, 9, 2);
  light.position.set(0, 2.2, 1.4);
  light.castShadow = false;
  group.add(light);
  return group;
}
