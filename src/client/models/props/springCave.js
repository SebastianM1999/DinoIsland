// Spring cave: the rocky grotto a waterfall pours out of, set into a steep
// cliff / mountain face. One smooth SDF rock mass (a chunk of cliff face,
// two cheeks and a heavy brow around the mountain opening, plus a
// few stacked boulders), minus a tall arched opening that runs ~3 m into the
// rock and is closed at the back. The cavity is painted almost black with
// depth so it reads as a deep dark hole; a stream surface fills its floor and
// meets the vertical falling curtain without a projecting shelf. Jungle: moss, wet algae below the lip, vines curtaining
// the opening, ferns and bushes on the ledges. Other biomes: darker rock,
// wet streaks, ash dust on top (volcano).
//
// API: buildSpringCave(s, biome) -> THREE.Group at (s.x, s.y, s.z), rotation.y = s.rot.
//   s = { x, y, z, rot, width }: y = height of the water's lip, local -z points
//   out of the cliff (the direction the water flows), width = waterfall width.
//   The lip edge (where the water starts to fall) is SPRING_LIP_OFFSET m in
//   front of s along local -z, at local y = SPRING_FLOOR (just below s.y).
//   group.userData.water is the stream-surface mesh (hide it if the water
//   system draws its own stream there).

import * as THREE from 'three';
import { MAT, place, merge, tube, mesh } from '../kit.js';
import { clump, leafStrip, arcPath, LEAF_MAT } from '../../world/veg/shapes.js';
import { fernGeometry } from '../../world/veg/plants.js';
import { makeRng } from '../../../shared/rng.js';
import { TAU, fbm3, noise3, smoothstep, sdfMesh, sdfRay } from './common.js';
import { ell3, ell2, smin, smax } from './cave.js';
import { SPRING_LIP_OFFSET, SPRING_FLOOR, SPRING_WATER_OFFSET } from '../../../shared/springShape.js';
export { SPRING_LIP_OFFSET, SPRING_FLOOR } from '../../../shared/springShape.js';

/** Opening height above the lip. */
export const SPRING_OPENING_HEIGHT = 4.0;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function springSdf(width, seed) {
  const W = width;
  const hw = W / 2 + 1.0;                         // opening half-width (~ width + 2 m wide)
  const rng = makeRng(((seed | 0) * 2654435761 + 13) >>> 0);
  const masses = [
    { x: 0, y: 0.6, z: 2.7, rx: hw + 5.6, ry: 6.8, rz: 3.4 },                       // chunk of cliff face
    { x: -(hw + 1.3), y: 1.2, z: -0.5, rx: 2.1, ry: 4.0, rz: 2.3 },                  // cheeks
    { x: hw + 1.3, y: 1.4, z: -0.4, rx: 2.0, ry: 4.2, rz: 2.2 },
    { x: 0, y: 4.9, z: -0.5, rx: hw + 2.0, ry: 1.9, rz: 2.3 },                       // brow
    { x: -(hw + 2.4), y: -2.6, z: -0.3, rx: 1.8, ry: 2.3, rz: 1.8 },                 // stacked boulders below the cheeks
    { x: hw + 2.6, y: -2.9, z: -0.1, rx: 1.9, ry: 2.2, rz: 1.7 },
  ];
  // a few extra lumps on top and around the frame (never in the water's path)
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1;
    const top = k < 3;
    const r = 0.9 + rng() * 0.9;
    const x = top ? (rng() - 0.5) * (hw * 2 + 3) : side * (hw + 1.6 + rng() * 3.2);
    const y = top ? 5.6 + rng() * 1.0 : -3.5 + rng() * 8.5;
    masses.push({ x, y, z: -0.2 + rng() * 1.2, rx: r * (1 + rng() * 0.4), ry: r * (0.7 + rng() * 0.3), rz: r });
  }
  // stream bed: the opening, flat floor just below the lip, closed ~3 m in
  const cavity = (x, y, z) => {
    const c2 = Math.max(ell2(x, y - 0.4, hw, SPRING_OPENING_HEIGHT - 0.4), SPRING_FLOOR - y);
    return smax(c2 + 0.12 * noise3(x * 0.9, y * 0.9, z * 0.9, seed + 5), z - 2.1, 1.1);
  };
  const outer = (x, y, z) => {
    let d = 1e9;
    for (const m of masses) {
      const dx = x - m.x, dy = y - m.y, dz = z - m.z;
      if (Math.abs(dx) > m.rx + 2.5 || Math.abs(dy) > m.ry + 2.5 || Math.abs(dz) > m.rz + 2.5) continue;
      d = smin(d, ell3(dx, dy, dz, m.rx, m.ry, m.rz), 1.4);
    }
    d += 0.12 * Math.sin(y * 2.2 + 1.5 * noise3(x * 0.25, y * 0.1, z * 0.25, seed + 9));   // rock layers
    // calmer rock right at the lip so the water always leaves at the same spot
    const k = 0.2 + 0.8 * smoothstep(0.6, 2.4, Math.hypot(Math.max(0, Math.abs(x) - W / 2), y + 0.3, z + SPRING_LIP_OFFSET));
    return d - k * 0.4 * fbm3(x * 0.35, y * 0.35, z * 0.35, seed) - k * 0.2 * noise3(x * 0.15, y * 0.15, z * 0.15, seed + 3);
  };
  // keep the free-fall zone below the lip clear so the water never clips rock
  const chute = (x, y, z) => Math.max(Math.abs(x) - (W / 2 + 0.9), y - SPRING_FLOOR, z + SPRING_LIP_OFFSET - 0.5);
  const sdf = (x, y, z) => smax(smax(outer(x, y, z), -cavity(x, y, z), 0.5), -chute(x, y, z), 0.3);
  return { sdf, cavity, hw, bounds: { min: [-(hw + 8), -7, -4.2], max: [hw + 8, 8.4, 6.6] } };
}

function palette(biome) {
  const id = biome?.id || 'jungle';
  const jungle = id === 'jungle';
  const volcano = id === 'volcano';
  const rocks = biome?.rocks || { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845' };
  const base = rocks.colors.map((h) => new THREE.Color(h));
  if (!jungle) base.forEach((c) => c.multiplyScalar(0.94));
  return {
    jungle, volcano,
    c: base,
    warm: new THREE.Color(biome?.terrain?.rockWarm || '#b59c90'),
    moss: new THREE.Color(rocks.moss || '#6fa845'),
    moss2: new THREE.Color(jungle ? '#8cc152' : '#6b7a4a'),
    algae: new THREE.Color(jungle ? '#3f6e3a' : '#3c4a44'),
    wet: new THREE.Color(jungle ? '#4a4a5a' : '#262229'),
    ash: new THREE.Color(biome?.terrain?.ash || '#8a8488'),
    dark: new THREE.Color('#120f16'),
    water: biome?.water || { shallow: '#4fd2c8', mid: '#1fa0b8', deep: '#156a9a', foam: '#f4fbff' },
  };
}

const cache = new Map();

function buildGeometry(width, seed, biome) {
  const P = palette(biome);
  const rng = makeRng(((seed | 0) * 7919 + 3) >>> 0);
  const { sdf, cavity, hw, bounds } = springSdf(width, seed);
  const W = width;
  const tmp = new THREE.Color();
  const rock = sdfMesh(sdf, {
    min: bounds.min, max: bounds.max, step: 0.36,
    color: (p, n) => {
      const t = fbm3(p.x * 0.28, p.y * 0.4, p.z * 0.28, seed + 11);
      tmp.copy(P.c[0]).lerp(P.c[1], smoothstep(-0.1, 0.5, t)).lerp(P.c[2], smoothstep(-0.1, -0.5, t) * 0.8);
      tmp.lerp(P.warm, 0.3 * smoothstep(0.2, 0.65, noise3(p.x * 0.15, p.y * 0.2, p.z * 0.15, seed + 31)));
      const strata = Math.sin(p.y * 3.3 + noise3(p.x * 0.4, 0, p.z * 0.4, seed) * 2.0);
      tmp.multiplyScalar(0.92 + 0.08 * strata + 0.06 * noise3(p.x * 2.4, p.y * 2.4, p.z * 2.4, seed + 2));
      // inside the opening: darker and darker with depth
      const inside = (1 - smoothstep(-0.1, 0.9, cavity(p.x, p.y, p.z))) * smoothstep(-1.6, 0.4, p.z);
      const up = n.y + 0.25 * fbm3(p.x * 0.5, p.y * 0.5, p.z * 0.5, seed + 9);
      if (inside < 0.5) {
        if (P.jungle) {
          const m = smoothstep(0.3, 0.75, up);
          tmp.lerp(P.moss, m * 0.9);
          tmp.lerp(P.moss2, m * 0.4 * smoothstep(0, 0.6, noise3(p.x * 0.7, p.y * 0.7, p.z * 0.7, seed + 13)));
          const streak = smoothstep(0.4, 0.8, noise3(p.x * 1.5, p.y * 0.25, p.z * 1.5, seed + 17));
          tmp.lerp(P.moss, streak * 0.45 * smoothstep(-0.3, 0.3, n.y + 0.5));
        } else {
          tmp.lerp(P.moss, smoothstep(0.55, 0.85, up) * 0.35);
          if (P.volcano) tmp.lerp(P.ash, smoothstep(0.6, 0.9, n.y) * 0.6);
        }
      }
      // wet rock / algae where the water runs over and splashes
      const wetX = 1 - smoothstep(W / 2 - 0.2, W / 2 + 1.4, Math.abs(p.x));
      const wet = wetX * (1 - smoothstep(-0.2, 0.6, p.y)) * (1 - smoothstep(0.2, 1.5, p.z));
      tmp.lerp(P.wet, wet * 0.6);
      if (P.jungle) tmp.lerp(P.algae, wet * 0.4 * smoothstep(-0.3, 0.5, noise3(p.x * 1.2, p.y * 0.4, p.z, seed + 21)));
      // dark hole
      tmp.lerp(P.dark, inside * (0.35 + 0.6 * smoothstep(-1.2, 1.6, p.z)));
      return tmp;
    },
  });

  const std = [], leaf = [];
  const drop = (x, z) => sdfRay(sdf, [x, 9, z], [0, -1, 0], 17, 0.1);
  const inOpening = (x, y, z) => cavity(x, y, z) < 0.35;
  const inWater = (x, y) => Math.abs(x) < W / 2 + 0.6 && y < 0.6;

  if (P.jungle) {
    // ---- vines curtaining the opening (from the brow) and down the cheeks
    const vine = (p0, len) => {
      const sw = (rng() - 0.5) * 0.3;
      const pts = [p0, V(p0.x + sw, p0.y - len * 0.5, p0.z - 0.12), V(p0.x - sw * 0.5, p0.y - len, p0.z - 0.05)];
      std.push(tube(pts, (t) => 0.035 - 0.015 * t, { radial: 5, color: (t) => (t > 0.7 ? '#4c8a33' : '#3f7a2c'), capStart: false }));
      const nl = Math.max(3, Math.round(len * 2.4));
      for (let j = 1; j < nl; j++) {
        const t = j / nl, q = pts[0].clone().lerp(pts[2], t);
        const dir = j % 2 ? 1 : -1;
        leaf.push(leafStrip(arcPath(V(q.x, q.y, q.z - 0.1), dir * 0.7, -0.7, 0.22, 0.4, 1.3, 3), (tt) => (tt >= 1 ? 0.005 : 0.07 * Math.sin(Math.PI * (0.1 + 0.9 * tt))), {
          side: V(0.7, 0, dir * 0.7), ridge: 0.3, serrate: 0, color: (tt, h) => (h ? '#7cc545' : '#4e9a34'),
        }));
      }
    };
    for (let k = 0; k < 16; k++) {
      const x = (k / 15 - 0.5) * (hw * 2 + 3.5) + (rng() - 0.5) * 0.3;
      const hit = sdfRay(sdf, [x, 0.8, -3.4], [0, 1, 0.25].map((v, i) => v / Math.hypot(0, 1, 0.25) * (i === 1 ? 1 : 1)), 8, 0.06);
      if (!hit) continue;
      const room = hit[1] - (inWater(x, 0) ? 0.9 : 0.1);
      if (room < 0.6) continue;
      const len = Math.min(room, (Math.abs(x) < hw ? 0.7 + rng() * 1.6 : 1.2 + rng() * 2.6));
      vine(V(hit[0], hit[1] + 0.05, hit[2] - 0.05), len);
    }
    // ---- bushes on top, ferns on every ledge
    const col = { top: '#8fd14f', mid: '#62b23c', mid2: '#56a236', bottom: '#3c7d2e' };
    for (let k = 0, n = 0; k < 40 && n < 9; k++) {
      const x = (rng() - 0.5) * (hw * 2 + 12), z = -2.6 + rng() * 5;
      const hit = drop(x, z);
      if (!hit || hit[1] < 1.5 || inOpening(hit[0], hit[1] + 0.5, hit[2])) continue;
      n++;
      std.push(place(clump(0.55 + rng() * 0.7, { seed: seed + k * 3, ...col, squash: 0.72, maxDetail: 2 }), [hit[0], hit[1] + 0.1, hit[2]]));
    }
    const fern = fernGeometry();
    for (let k = 0, n = 0; k < 70 && n < 14; k++) {
      const x = (rng() - 0.5) * (hw * 2 + 13), z = -3.2 + rng() * 5;
      const hit = drop(x, z);
      if (!hit || inWater(hit[0], hit[1]) || inOpening(hit[0], hit[1] + 0.4, hit[2])) continue;
      if (sdf(hit[0], hit[1] + 0.7, hit[2]) < 0.3) continue;
      n++;
      leaf.push(place(fern.clone(), [hit[0], hit[1] - 0.05, hit[2]], [0, rng() * TAU, 0], 0.7 + rng() * 0.6));
    }
  }

  // ---- stream surface in the opening, running out to the lip
  const L0 = 0.15, L1 = -SPRING_LIP_OFFSET;
  const cols = 10, rows = 14;
  const wg = new THREE.PlaneGeometry(1, 1, cols, rows);
  wg.rotateX(-Math.PI / 2);
  const wp = wg.attributes.position;
  const wc = new Float32Array(wp.count * 3);
  const deep = new THREE.Color(P.water.deep), mid = new THREE.Color(P.water.mid), shallow = new THREE.Color(P.water.shallow), foam = new THREE.Color(P.water.foam || '#f4fbff');
  for (let i = 0; i < wp.count; i++) {
    const u = wp.getX(i) + 0.5, v = wp.getZ(i) + 0.5;         // v: 0 = back, 1 = lip
    const z = L0 + (L1 - L0) * v;
    const x = (u - 0.5) * 2 * (hw - 0.05);
    const y = SPRING_FLOOR + SPRING_WATER_OFFSET + (1 - v * v) * 0.06 + (1 - v) * 0.015 * Math.sin(x * 3 + z * 5);
    wp.setXYZ(i, x, y, z);
    tmp.copy(deep).lerp(mid, smoothstep(0.1, 0.6, v)).lerp(shallow, smoothstep(0.6, 1, v) * 0.6);
    tmp.lerp(P.dark, (1 - smoothstep(0, 0.55, v)) * 0.7);                         // dark in the back
    const streak = smoothstep(0.35, 0.8, noise3(x * 2.2, 0, z * 0.7, seed + 41));
    tmp.lerp(foam, Math.max(smoothstep(0.82, 1, v) * 0.8, streak * 0.35 * v));
    tmp.lerp(foam, 0.5 * smoothstep(hw - 0.6, hw - 0.05, Math.abs(x)) * v);       // foam along the banks
    wc[i * 3] = tmp.r; wc[i * 3 + 1] = tmp.g; wc[i * 3 + 2] = tmp.b;
  }
  wg.setAttribute('color', new THREE.BufferAttribute(wc, 3));
  wg.computeVertexNormals();

  return { rock, std: std.length ? merge(std) : null, leaf: leaf.length ? merge(leaf) : null, water: wg };
}

export function buildSpringCave(s, biome) {
  const width = Math.max(2, s.width ?? 4.5);
  const seed = (Math.round((s.x ?? 0) * 13.1 + (s.z ?? 0) * 7.7) & 0xffff) + 1;
  const key = `${seed}:${width.toFixed(2)}:${biome?.id || 'jungle'}`;
  let g = cache.get(key);
  if (!g) { g = buildGeometry(width, seed, biome); cache.set(key, g); }
  const group = new THREE.Group();
  group.name = 'springCave';
  group.position.set(s.x, s.y ?? 0, s.z);
  group.rotation.y = s.rot || 0;
  group.add(mesh(g.rock, MAT.standard));
  if (g.std) group.add(mesh(g.std, MAT.standard));
  if (g.leaf) group.add(mesh(g.leaf, LEAF_MAT, { cast: false }));
  const water = mesh(g.water, MAT.glossy, { cast: false });
  water.name = 'springWater';
  group.add(water);
  group.userData.water = water;
  group.userData.lip = { offset: SPRING_LIP_OFFSET, y: SPRING_FLOOR };
  return group;
}
