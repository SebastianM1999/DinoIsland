// Cave: a big smooth rock dome with a hollow inside and a thick arched
// entrance, set into a hillside (see shared/caveShape.js for size, colliders,
// the hillside rock masses and the rubble around the mouth). The rock is one
// smooth SDF mesh: dome + back ridge + shoulders + mouth buttresses + a brow
// over the entrance, smoothly blended, minus interior and entrance tunnel.
// The shell reaches CAVE.base below c.y with a flared foot, so it always
// meets lower ground; buried parts simply vanish in the terrain. Colored by
// the biome's rock colors with strata, warm/cool patches and speckles,
// darker inside. Jungle: moss on top, bushes and ferns on ledges, vines over
// the brow and hanging roots inside. Volcano: ash on top, glowing ember
// cracks and stalactites. Inside: glowing crystals (+ mushrooms in the
// jungle) and one small point light. Rubble/boulders from caveRockPilesLocal.
//
// API: buildCave(c, biome) -> THREE.Group at (c.x, c.y, c.z), rotation.y = c.rot.
//   Entrance faces local -z (world (-sin rot, -cos rot)). c.seed varies the rock.

import * as THREE from 'three';
import { MAT, place, merge, tube, blob, limb, spike, rockGeometry, mesh } from '../kit.js';
import { clump, leafStrip, arcPath, LEAF_MAT } from '../../world/veg/shapes.js';
import { fernGeometry } from '../../world/veg/plants.js';
import { makeRng } from '../../../shared/rng.js';
import { CAVE, caveMasses, caveRockPilesLocal } from '../../../shared/caveShape.js';
import { TAU, fbm3, noise3, smoothstep, sdfMesh, sdfRay, tintGlow, orient } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------- SDF
export const ell3 = (x, y, z, a, b, c) => {
  const k0 = Math.hypot(x / a, y / b, z / c);
  const k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
  return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
};
export const ell2 = (x, y, a, b) => {
  const k0 = Math.hypot(x / a, y / b);
  const k1 = Math.hypot(x / (a * a), y / (b * b));
  return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
};
export const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export function caveSdf(seed) {
  const masses = caveMasses(seed);
  const R = CAVE.radius + 0.1, base = CAVE.base;
  const outer = (x, y, z) => {
    let d = ell3(x, y + 1.5, z, R, CAVE.top + 1.5, R);
    d = smin(d, ell3(x, y - base, z, R + 1.9, 2.4, R + 1.9), 1.6);           // flared foot
    for (const m of masses) {
      const dx = x - m.x, dy = y - m.y, dz = z - m.z;
      if (Math.abs(dx) > m.rx + 3 || Math.abs(dy) > m.ry + 3 || Math.abs(dz) > m.rz + 3) continue;
      d = smin(d, ell3(dx, dy, dz, m.rx, m.ry, m.rz), 2.2);
    }
    // rough horizontal rock layers, big soft lumps + finer rock noise
    d += 0.16 * Math.sin(y * 1.8 + 1.6 * noise3(x * 0.2, y * 0.1, z * 0.2, seed + 27));
    return d - 0.55 * fbm3(x * 0.3, y * 0.3, z * 0.3, seed) - 0.3 * noise3(x * 0.13, y * 0.13, z * 0.13, seed + 21);
  };
  const interior = (x, y, z) => ell3(x, y + 0.8, z, CAVE.inner + 0.2, CAVE.height + 0.8, CAVE.inner + 0.2) + 0.22 * noise3(x * 0.6, y * 0.6, z * 0.6, seed + 3);
  const tunnel = (x, y, z) => Math.max(ell2(x, y - 0.9, 2.7, 3.7) + 0.12 * noise3(x * 0.8, y * 0.8, z * 0.8, seed + 5), z + 1.0);
  const sdf = (x, y, z) => {
    let d = smax(outer(x, y, z), -interior(x, y, z), 0.8);
    d = smax(d, -tunnel(x, y, z), 0.9);
    return smax(d, -(y - base), 0.2);
  };
  return { sdf, outer, interior, tunnel, masses };
}

// ---------------------------------------------------------------- colors
function palette(biome) {
  const volcano = biome?.id === 'volcano';
  const rocks = biome?.rocks || { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845' };
  const t = biome?.terrain || {};
  return {
    volcano,
    c: rocks.colors.map((h) => new THREE.Color(h)),
    warm: new THREE.Color(t.rockWarm || (volcano ? '#6a4a44' : '#b59c90')),
    moss: new THREE.Color(rocks.moss || '#6fa845'),
    moss2: new THREE.Color(volcano ? '#5a6440' : '#8cc152'),
    mossy: !volcano,
    ash: new THREE.Color(t.ash || '#8a8488'),
    ground: new THREE.Color(volcano ? (t.scorch || '#2e2629') : (t.dirtDark || '#b0814c')),
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
    min: [-12.2, CAVE.base - 0.3, -10.6], max: [12.2, 10.2, 11.8], step: 0.55,
    color: (p, n) => {
      const t = fbm3(p.x * 0.25, p.y * 0.4, p.z * 0.25, seed + 11);
      tmp.copy(P.c[0]).lerp(P.c[1], smoothstep(-0.1, 0.5, t)).lerp(P.c[2], smoothstep(-0.1, -0.5, t) * 0.8);
      // big warm/cool patches, horizontal strata + small speckles for texture
      tmp.lerp(P.warm, 0.35 * smoothstep(0.15, 0.6, noise3(p.x * 0.12, p.y * 0.18, p.z * 0.12, seed + 31)));
      const strata = Math.sin(p.y * 3.1 + noise3(p.x * 0.4, 0, p.z * 0.4, seed) * 2.0);
      tmp.multiplyScalar(0.93 + 0.07 * strata + 0.05 * noise3(p.x * 2.2, p.y * 2.2, p.z * 2.2, seed + 2));
      const inside = Math.max(
        1 - smoothstep(0.0, 1.3, interior(p.x, p.y, p.z)),
        (1 - smoothstep(0.0, 1.0, tunnel(p.x, p.y, p.z))) * smoothstep(-7.8, -3.5, p.z),
      );
      if (P.mossy && inside < 0.3) {
        const m = smoothstep(0.35, 0.8, n.y + 0.25 * fbm3(p.x * 0.5, p.y * 0.5, p.z * 0.5, seed + 9));
        tmp.lerp(P.moss, m * 0.9);
        tmp.lerp(P.moss2, m * 0.45 * smoothstep(0, 0.6, noise3(p.x * 0.7, p.y * 0.7, p.z * 0.7, seed + 13)));
        // mossy streaks running down the sides
        const streak = smoothstep(0.45, 0.8, noise3(p.x * 1.4, p.y * 0.25, p.z * 1.4, seed + 17));
        tmp.lerp(P.moss, streak * 0.4 * smoothstep(-0.2, 0.3, n.y + 0.5));
      }
      if (P.volcano && inside < 0.3) {
        tmp.lerp(P.ash, smoothstep(0.55, 0.9, n.y) * 0.7);
        if (p.y < 1.2) tmp.multiplyScalar(0.75 + 0.25 * smoothstep(-0.5, 1.2, p.y));
      }
      if (inside > 0) tmp.lerp(P.inner, inside * 0.55).multiplyScalar(1 - inside * 0.25);
      // the foot takes on the ground color so rock and terrain meet softly
      if (inside < 0.3) tmp.lerp(P.ground, 0.45 * (1 - smoothstep(-0.4, 0.7, p.y)) * (0.6 + 0.4 * noise3(p.x * 0.9, 0, p.z * 0.9, seed + 19)));
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
  for (let k = 0; k < 4; k++) {
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
  for (let k = 0; k < 13; k++) {
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

  /** Surface point on the rock straight below (x, z), or null. */
  const drop = (x, z) => sdfRay(sdf, [x, 13, z], [0, -1, 0], 16, 0.1);
  /** Is (x, y, z) in open air, at least `pad` away from the rock? */
  const free = (x, y, z, pad) => sdf(x, y, z) > pad;

  const vine = (p0, len, sway) => {
    const pts = [p0, V(p0.x + sway * 0.1, p0.y - len * 0.5, p0.z - 0.15), V(p0.x - sway * 0.05, p0.y - len, p0.z - 0.1)];
    std.push(tube(pts, (t) => 0.035 - 0.015 * t, { radial: 5, color: (t) => (t > 0.7 ? '#4c8a33' : '#3f7a2c'), capStart: false }));
    const nl = Math.max(3, Math.round(len * 2.2));
    for (let j = 1; j < nl; j++) {
      const t = j / nl, q = pts[0].clone().lerp(pts[2], t);
      const dir = j % 2 ? 1 : -1;
      leaf.push(leafStrip(arcPath(V(q.x, q.y, q.z - 0.12), dir * 0.7, -0.7, 0.22, 0.4, 1.3, 3), (tt) => (tt >= 1 ? 0.005 : 0.07 * Math.sin(Math.PI * (0.1 + 0.9 * tt))), {
        side: V(0.7, 0, dir * 0.7), ridge: 0.3, serrate: 0, color: (tt, h) => (h ? '#7cc545' : '#4e9a34'),
      }));
    }
  };

  if (!P.volcano) {
    // ---- vines over the entrance face and down from the brow
    for (let k = 0; k < 8; k++) {
      const x = -2.4 + (k / 7) * 4.8 + (rng() - 0.5) * 0.3;
      const archY = 0.9 + 3.7 * Math.sqrt(Math.max(0, 1 - (x / 2.7) ** 2));
      const hit = sdfRay(sdf, [x, archY + 0.35, -14], [0, 0, 1], 11, 0.08);
      if (!hit) continue;
      vine(V(hit[0], hit[1], hit[2] - 0.05), 0.8 + rng() * (archY - 0.9) * 0.6, rng() - 0.5);
    }
    for (let k = 0; k < 7; k++) {
      const x = (rng() - 0.5) * 9.5, z = -6.6 - rng() * 1.2;
      const hit = sdfRay(sdf, [x, 1.2, z], [0, 1, 0], 7, 0.08);
      if (!hit || hit[1] < 2.6) continue;
      vine(V(hit[0], hit[1] + 0.05, hit[2]), Math.min(hit[1] - 2.2, 0.8 + rng() * 2.2), rng() - 0.5);
    }
    // ---- bushes on the rock and ferns on ledges / around the foot
    const col = { top: '#8fd14f', mid: '#62b23c', mid2: '#56a236', bottom: '#3c7d2e' };
    for (let k = 0, n = 0; k < 40 && n < 8; k++) {
      const x = (rng() - 0.5) * 22, z = -8 + rng() * 18;
      const hit = drop(x, z);
      if (!hit || hit[1] < 0.8) continue;
      n++;
      std.push(place(clump(0.6 + rng() * 0.8, { seed: seed + k * 3, ...col, squash: 0.7, maxDetail: 2 }), [hit[0], hit[1] + 0.12, hit[2]]));
    }
    const fern = fernGeometry();
    for (let k = 0, n = 0; k < 50 && n < 9; k++) {
      const x = (rng() - 0.5) * 22, z = -9 + rng() * 17;
      const hit = drop(x, z);
      if (!hit) continue;
      const y = hit[1];
      if (y < -0.2 || !free(hit[0], y + 0.6, hit[2], 0.25)) continue;
      n++;
      leaf.push(place(fern.clone(), [hit[0], y - 0.05, hit[2]], [0, rng() * TAU, 0], 0.9 + rng() * 0.7));
    }
  } else {
    // ---- ember cracks on the outside
    for (let k = 0; k < 8; k++) {
      let az = rng() * TAU, el = 0.1 + rng() * 0.35;
      if (Math.cos(az) < -0.7) az += Math.PI * 0.5;
      const pts = [];
      for (let j = 0; j < 7; j++) {
        const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
        const o = [d[0] * 18, 1 + d[1] * 18, d[2] * 18];
        const hit = sdfRay(sdf, o, [-d[0], -d[1], -d[2]], 20, 0.12);
        if (hit) pts.push(V(hit[0] - d[0] * 0.02, hit[1], hit[2] - d[2] * 0.02));
        az += (rng() - 0.5) * 0.22;
        el += 0.05 + rng() * 0.07;
      }
      if (pts.length < 3) continue;
      glow.push(tube(pts, (t) => 0.1 * (1 - t * 0.6), { radial: 5, color: (t) => (t < 0.3 ? '#ffd26a' : '#ff6a2a') }));
    }
  }

  // ---- rubble + boulders around the mouth (these have rock colliders)
  const rockCols = biome?.rocks?.colors;
  const mossC = P.mossy ? biome?.rocks?.moss : null;
  const piles = caveRockPilesLocal(seed);
  piles.forEach((p, k) => {
    const squash = Math.min(0.95, Math.max(0.5, p.h / p.r * 0.85));
    const g = rockGeometry({ radius: p.r * 1.05, seed: seed * 7 + k, squash, colors: rockCols, moss: mossC });
    std.push(place(g, [p.x, p.h - p.r * 1.05 * squash * 1.05, p.z], [0, rng() * TAU, (rng() - 0.5) * 0.2]));
    // a few loose stones around each
    const m = p.r > 0.9 ? 1 : 0;
    for (let i = 0; i < m; i++) {
      const a = rng() * TAU, d = p.r + 0.2 + rng() * 0.5, s = 0.12 + rng() * 0.18;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (z < -4 && Math.abs(x) < 2.6) continue;
      std.push(place(rockGeometry({ radius: s, seed: seed * 11 + k * 5 + i, squash: 0.6, colors: rockCols, moss: mossC }), [x, 0, z], [0, rng() * TAU, 0]));
    }
    if (P.mossy && rng() < 0.35) {
      const a = rng() * TAU, d = p.r + 0.25;
      leaf.push(place(fernGeometry().clone(), [p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d], [0, rng() * TAU, 0], 0.8 + rng() * 0.6));
    }
    if (P.volcano && p.r > 0.7) {
      std.push(place(blob(p.r * 0.9, 0.1, p.r * 0.7, (c, n) => (n.y > 0.6 ? '#9a9496' : '#7a7476'), { w: 12, h: 6 }), [p.x + 0.3, 0.02, p.z - p.r * 0.6], [0, rng() * TAU, 0]));
    }
  });

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
