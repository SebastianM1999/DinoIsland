// Island vegetation: trees (palm / round / tall / jungle / mango), decorative
// bushes and ferns, grass tufts and flowers. All instanced; leaves, fronds and
// grass sway through windMaterial (driven by WIND.uTime in Game.update).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng, fbm, smoothstep } from '../../shared/rng.js';
import { MAT } from '../models/kit.js';
import { treeGeometry, treeMatrix, TREE_WIND, TREE_VARIANTS } from './veg/trees.js';
import { bushGeometry, fernGeometry, grassGeometry, flowerGeometry } from './veg/plants.js';
import { windPair, LEAF_MAT, instanced, finishInstanced, foliageTint } from './veg/shapes.js';

const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
// Terrain greens (see terrainMesh.js) so grass blends into the ground.
const PAL = {
  grass: C('#7cc34a'), grassLight: C('#95d256'), grassDark: C('#5ea83a'),
  jungle: C('#4c9434'), mesaTop: C('#86c650'), dry: C('#b9c95a'),
};
const FLOWER_TINTS = ['#ff7fbf', '#ffe066', '#ffffff', '#b49cff', '#ff9a4a', '#ff5f6d'].map(C);

/** Tuning. */
export const VEG_TUNING = {
  grassWind: { strength: 0.03, pivotY: 0, frequency: 2.2, heightScale: 1.6 },
  bushWind: { strength: 0.03, pivotY: 0.2, frequency: 1.8, heightScale: 0.6 },
  fernWind: { strength: 0.035, pivotY: 0.05, frequency: 2.0, heightScale: 0.9 },
  flowerRatio: 1 / 14,        // flower tufts per grass tuft
};

export function buildVegetation(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  // ---------------------------------------------------------------- trees
  const buckets = new Map();
  for (const t of layout.trees) {
    const nv = TREE_VARIANTS[t.type] ?? 1;
    const key = `${t.type}:${nv > 1 ? t.id % nv : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  for (const [key, list] of buckets) {
    const [type, variant] = key.split(':');
    const geo = treeGeometry(type, +variant);
    const wind = TREE_WIND[type];
    const tw = windPair(MAT.standard, wind);
    const fw = windPair(type === 'palm' ? LEAF_MAT : MAT.standard, wind);
    const trunk = instanced(geo.trunk, tw.mat, list.length, { depth: tw.depth, name: `tree-${key}-trunk` });
    const leaves = instanced(geo.foliage, fw.mat, list.length, { depth: fw.depth, name: `tree-${key}-leaves` });
    list.forEach((t, i) => {
      treeMatrix(t, m4);
      trunk.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, foliageTint(t.hue, col));
      const b = 0.88 + 0.12 * ((t.hue * 7.3) % 1);
      trunk.setColorAt(i, col.setRGB(b, b * 0.98, b * 0.96));
    });
    group.add(finishInstanced(trunk), finishInstanced(leaves));
  }

  // ---------------------------------------------------- bushes and ferns
  const addSmall = (geo, list, windParams, name) => {
    if (!list.length) return;
    const w = windPair(LEAF_MAT, windParams);
    const m = instanced(geo, w.mat, list.length, { cast: false, receive: true, name });
    list.forEach((b, i) => {
      e.set(0, b.rot, 0); q.setFromEuler(e);
      p.set(b.x, b.y - 0.06, b.z);
      s.set(b.scale, b.scale * (0.85 + 0.3 * b.hue), b.scale);
      m.setMatrixAt(i, m4.compose(p, q, s));
      m.setColorAt(i, foliageTint(b.hue, col));
    });
    group.add(finishInstanced(m));
  };
  addSmall(bushGeometry(), layout.bushes.filter((b) => b.type === 'bush'), VEG_TUNING.bushWind, 'bushes');
  addSmall(fernGeometry(), layout.bushes.filter((b) => b.type === 'fern'), VEG_TUNING.fernWind, 'ferns');

  // --------------------------------------------------- grass + flowers
  const S = CONFIG.world.seed;
  const rng = makeRng(S ^ 0x6a55e1);
  const camp = layout.hut.campfire;
  const grassCount = CONFIG.render.grassCount | 0;
  const flowerCount = Math.round(grassCount * VEG_TUNING.flowerRatio);
  const R = CONFIG.world.islandRadius + 5;

  /** Returns ground height if a small plant may grow here, else null. */
  const spotOk = (x, z) => {
    if (terrain.waterLevelAt(x, z) !== null) return null;
    const h = terrain.heightAt(x, z);
    if (h < 1.3) return null;
    if (h < 2.3 && rng() > 0.15 + (h - 1.3) * 0.25) return null;      // sparse on the beach
    if (Math.hypot(x - camp.x, z - camp.z) < 10) return null;
    if (terrain.slopeAt(x, z) > 0.7) return null;
    if (layout.distToPath(x, z) < 2.2) return null;
    return h;
  };
  const greenAt = (x, z, h, out) => {
    const g = fbm(x * 0.04, z * 0.04, 3, S + 91) * 0.5 + 0.5;
    out.copy(PAL.grass).lerp(PAL.grassLight, smoothstep(0.45, 0.8, g)).lerp(PAL.grassDark, smoothstep(0.5, 0.25, g) * 0.6);
    out.lerp(PAL.jungle, smoothstep(0.55, 1.0, layout.jungleDensity(x, z)) * 0.75);
    if (h > 11) out.lerp(PAL.mesaTop, 0.6);
    if (h < 2.6) out.lerp(PAL.dry, 0.45);
    return out;
  };

  const grassW = windPair(LEAF_MAT, VEG_TUNING.grassWind);
  const grass = instanced(grassGeometry(), grassW.mat, grassCount, { cast: false, receive: true, name: 'grass' });
  let gi = 0;
  for (let tries = 0; gi < grassCount && tries < grassCount * 8; tries++) {
    // cluster centres, masked by a noise field for meadow patches
    const a = rng() * TAU, r = R * Math.sqrt(rng());
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const n = fbm(cx * 0.035, cz * 0.035, 2, S + 500) * 0.5 + 0.5;
    if (rng() > 0.12 + smoothstep(0.3, 0.62, n) * 0.88) continue;
    const k = 2 + Math.floor(rng() * 3);
    for (let j = 0; j < k && gi < grassCount; j++) {
      const x = cx + (rng() - 0.5) * 1.8, z = cz + (rng() - 0.5) * 1.8;
      const h = spotOk(x, z);
      if (h === null) continue;
      const sc = 0.75 + rng() * 0.6;
      e.set((rng() - 0.5) * 0.2, rng() * TAU, (rng() - 0.5) * 0.2); q.setFromEuler(e);
      p.set(x, h - 0.03, z);
      s.set(sc, sc * (0.75 + rng() * 0.6), sc);
      grass.setMatrixAt(gi, m4.compose(p, q, s));
      greenAt(x, z, h, col).offsetHSL((rng() - 0.5) * 0.025, 0, (rng() - 0.5) * 0.06);
      grass.setColorAt(gi, col);
      gi++;
    }
  }
  grass.count = gi;
  group.add(finishInstanced(grass));

  const flowers = instanced(flowerGeometry(), grassW.mat, flowerCount, { cast: false, receive: true, name: 'flowers' });
  let fi = 0;
  for (let tries = 0; fi < flowerCount && tries < flowerCount * 30; tries++) {
    const a = rng() * TAU, r = R * Math.sqrt(rng());
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (layout.jungleDensity(cx, cz) > 0.85) continue;             // meadows and edges
    const n = fbm(cx * 0.05, cz * 0.05, 2, S + 510) * 0.5 + 0.5;
    if (n < 0.5) continue;
    const tint = FLOWER_TINTS[Math.floor(rng() * FLOWER_TINTS.length)];
    const k = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < k && fi < flowerCount; j++) {
      const x = cx + (rng() - 0.5) * 2.2, z = cz + (rng() - 0.5) * 2.2;
      const h = spotOk(x, z);
      if (h === null || h < 2.2) continue;
      const sc = 0.9 + rng() * 0.5;
      e.set(0, rng() * TAU, 0); q.setFromEuler(e);
      p.set(x, h - 0.02, z);
      s.setScalar(sc);
      flowers.setMatrixAt(fi, m4.compose(p, q, s));
      flowers.setColorAt(fi, tint);
      fi++;
    }
  }
  flowers.count = fi;
  if (fi > 0) group.add(finishInstanced(flowers));

  return {
    group,
    // Wind is shader-driven (WIND.uTime), nothing to do per frame.
    update() {},
  };
}
