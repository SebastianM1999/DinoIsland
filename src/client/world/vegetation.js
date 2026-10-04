// Island vegetation: trees (per biome: palm / round / tall / jungle / bamboo /
// mango / pine / dead), decorative bushes, ferns and big-leaf plants, grass
// tufts and flowers. All instanced; leaves, fronds and grass sway through
// windMaterial (driven by WIND.uTime in Game.update).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng, fbm, smoothstep } from '../../shared/rng.js';
import { insideBossArena } from '../../shared/bossArena.js';
import { insideSwampArena } from '../../shared/swampArena.js';
import { MAT } from '../models/kit.js';
import { treeGeometry, treeMatrix, TREE_WIND, TREE_VARIANTS, CROWN_TYPES, CROWN_VARIANTS } from './veg/trees.js';
import * as plants from './veg/plants.js';
import { windPair, LEAF_MAT, instanced, foliageTint, withGeometryDetail } from './veg/shapes.js';
import { SpatialInstances } from './veg/spatialInstances.js';
import { detailMaterial } from './surfaceDetail.js';
import { buildSwampDecor } from './veg/swampDecor.js';

const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
const FLOWER_TINTS = ['#ff7fbf', '#ffe066', '#ffffff', '#b49cff', '#ff9a4a', '#ff5f6d'].map(C);

/** Tuning. */
export const VEG_TUNING = {
  grassWind: { strength: 0.03, pivotY: 0, frequency: 2.2, heightScale: 1.6 },
  bushWind: { strength: 0.03, pivotY: 0.2, frequency: 1.8, heightScale: 0.6 },
  fernWind: { strength: 0.035, pivotY: 0.05, frequency: 2.0, heightScale: 0.9 },
  flowerRatio: 1 / 14,        // flower tufts per grass tuft
};

export function buildVegetation(terrain, layout) {
  // per-biome tints for plant kinds whose own palette is too bright for the island (swamp: olive, grey)
  const tints = Object.fromEntries(Object.entries(layout.biome.vegetation?.tints || {}).map(([k, v]) => [k, C(v)]));
  const tinted = (kind, c) => (tints[kind] ? c.multiply(tints[kind]) : c);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const spatial = new SpatialInstances(group);
  // nothing is seen past the fog: skip those chunks (the swamp's thick fog makes its dense forest affordable)
  spatial.setCullDistance((layout.biome.sky?.fogFar ?? Infinity) + 35);
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
    // crown variant independent of the trunk variant (trunks carry the colliders)
    const crown = CROWN_TYPES.has(t.type) ? Math.floor(t.id / nv + t.hue * 5) % CROWN_VARIANTS : 0;
    const key = `${t.type}:${nv > 1 ? t.id % nv : 0}:${crown}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  for (const [key, list] of buckets) {
    const [type, variant, crown] = key.split(':');
    const geo = treeGeometry(type, +variant, 0, +crown);
    const wind = TREE_WIND[type];
    const tw = windPair(MAT.standard, wind);
    const fw = windPair(detailMaterial(type === 'palm' ? LEAF_MAT : MAT.standard, 'foliage'), wind);
    const trunk = instanced(geo.trunk, tw.mat, list.length, { depth: tw.depth, name: `tree-${key}-trunk` });
    const leaves = instanced(geo.foliage, fw.mat, list.length, { depth: fw.depth, name: `tree-${key}-leaves` });
    list.forEach((t, i) => {
      treeMatrix(t, m4);
      trunk.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, tinted(type, foliageTint(t.hue, col)));
      const b = 0.88 + 0.12 * ((t.hue * 7.3) % 1);
      trunk.setColorAt(i, col.setRGB(b, b * 0.98, b * 0.96));
    });
    spatial.add(trunk, { wind });
    spatial.add(leaves, { wind, geometries: [geo.foliage, treeGeometry(type, +variant, 1, +crown).foliage, treeGeometry(type, +variant, 2, +crown).foliage] });
  }

  // ---------------------------------------------------- bushes and ferns
  const addSmall = (geometries, list, windParams, name) => {
    if (!list.length) return;
    const w = windPair(detailMaterial(LEAF_MAT, 'foliage'), windParams);
    const m = instanced(geometries[0], w.mat, list.length, { cast: false, receive: true, name });
    list.forEach((b, i) => {
      e.set(0, b.rot, 0); q.setFromEuler(e);
      p.set(b.x, b.y - 0.06, b.z);
      s.set(b.scale, b.scale * (0.85 + 0.3 * b.hue), b.scale);
      m.setMatrixAt(i, m4.compose(p, q, s));
      m.setColorAt(i, tinted(name.slice(7), foliageTint(b.hue, col)));
    });
    spatial.add(m, { geometries, wind: windParams });
  };
  // Bush types come from plants.js (BUSH_TYPES); unknown types fall back to a bush.
  const types = plants.BUSH_TYPES || {
    bush: { geometry: plants.bushGeometry, wind: VEG_TUNING.bushWind },
    fern: { geometry: plants.fernGeometry, wind: VEG_TUNING.fernWind },
  };
  const byType = new Map();
  for (const b of layout.bushes) {
    const t = types[b.type] ? b.type : 'bush';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(b);
  }
  for (const [t, list] of byType) addSmall([0, 1, 2].map(detail => withGeometryDetail(detail, types[t].geometry)), list, types[t].wind || VEG_TUNING.bushWind, `bushes-${t}`);

  // swamp: lily pads, duckweed and breathing roots around the bogs
  for (const m of buildSwampDecor(terrain, layout)) spatial.add(m);

  // --------------------------------------------------- grass + flowers
  const plan = layout.plan;
  const S = plan.seed;
  const T = layout.biome.terrain;
  const PAL = {
    grass: C(T.grass), grassLight: C(T.grassLight), grassDark: C(T.grassDark),
    jungle: C(T.floor), mesaTop: C(T.high), dry: C(layout.biome.id === 'volcano' ? T.ash || '#8a8478' : '#b9c95a'),
  };
  const rng = makeRng(S ^ 0x6a55e1);
  const camp = layout.hut.campfire;
  // where grass starts above the beach (the swamp's lowland lies low)
  const lowland = (layout.biome.vegetation.minTreeHeight ?? 2.2) < 2 ? 1.0 : 1.3;
  const grassCount = Math.round((CONFIG.render.grassCount | 0) * layout.biome.vegetation.grass);
  const flowerCount = Math.round((CONFIG.render.grassCount | 0) * VEG_TUNING.flowerRatio * layout.biome.vegetation.flowers);
  // random point in the island ellipse
  const inEllipse = () => {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 1.02;
    return [Math.cos(a) * plan.A * r, Math.sin(a) * plan.B * r];
  };

  /** Returns ground height if a small plant may grow here, else null. */
  const spotOk = (x, z) => {
    if (terrain.waterLevelAt(x, z) !== null || terrain.lavaLevelAt(x, z) !== null) return null;
    const h = terrain.heightAt(x, z);
    if (h < lowland) return null;
    if (h < lowland + 1 && rng() > 0.15 + (h - lowland) * 0.25) return null;      // sparse on the beach
    if (terrain.bogAt?.(x, z) > 0.3) return null;                      // bare mud in the bogs
    if (insideSwampArena(layout.swampArena, x, z, 2)) return null;
    if (Math.hypot(x - camp.x, z - camp.z) < 10) return null;
    for (const c of layout.caves) if (Math.hypot(x - c.x, z - c.z) < 7.5) return null;
    if (layout.ruins && Math.hypot(x - layout.ruins.x, z - layout.ruins.z) < 6) return null;
    if (insideBossArena(layout, x, z, 6)) return null;                 // bare basalt and ash
    if (terrain.slopeAt(x, z) > 0.7) return null;
    if (layout.distToPath(x, z) < 2.2) return null;
    return h;
  };
  const greenAt = (x, z, h, out) => {
    const g = fbm(x * 0.04, z * 0.04, 3, S + 91) * 0.5 + 0.5;
    out.copy(PAL.grass).lerp(PAL.grassLight, smoothstep(0.45, 0.8, g)).lerp(PAL.grassDark, smoothstep(0.5, 0.25, g) * 0.6);
    out.lerp(PAL.jungle, smoothstep(0.55, 1.0, layout.jungleDensity(x, z)) * 0.75);
    if (h > 18) out.lerp(PAL.mesaTop, 0.6);
    if (h < lowland + 1.3) out.lerp(PAL.dry, 0.45);
    return out;
  };

  const grassW = windPair(LEAF_MAT, VEG_TUNING.grassWind);
  const grass = instanced(plants.grassGeometry(), grassW.mat, grassCount, { cast: false, receive: true, name: 'grass' });
  let gi = 0;
  for (let tries = 0; gi < grassCount && tries < grassCount * 8; tries++) {
    // cluster centres, masked by a noise field for meadow patches
    const [cx, cz] = inEllipse();
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
  spatial.add(grass, { wind: VEG_TUNING.grassWind, density: true });

  const flowers = instanced(plants.flowerGeometry(), grassW.mat, Math.max(1, flowerCount), { cast: false, receive: true, name: 'flowers' });
  let fi = 0;
  for (let tries = 0; fi < flowerCount && tries < flowerCount * 30; tries++) {
    const [cx, cz] = inEllipse();
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
  spatial.add(flowers, { wind: VEG_TUNING.grassWind, density: true });

  return {
    group,
    spatial,
    update(dt, time, cam) { if (cam) spatial.update(cam); },
    setQuality(q) { spatial.setQuality(q); },
    /** Draw only a share (0..1) of the grass and flowers. Instances are in random order, so any prefix is evenly spread. */
    setDensity(k) {
      spatial.setDensity(k);
    },
  };
}
