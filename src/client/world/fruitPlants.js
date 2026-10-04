// Fruit plants: the fruit on the island's plants, per kind (config.js
// fruit.types): bushes with their berry clusters (red berries in the jungle,
// marsh berries on the swamp's bog shores, ember chilis on the volcano's warm
// ground), fruit hanging in fruit trees (mangos, swamp figs, ash plums; the
// trees themselves come from vegetation.js) and rare glowing plants with
// sparkles (dragon fruit, glow lotus, obsidian figs on their cacti). Fruit can be
// hidden/shown per spot (setCount) with a pop-in animation.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng } from '../../shared/rng.js';
import { MAT } from '../models/kit.js';
import { fruitGeometry, fruitMaterial, FRUIT_GLOW } from '../models/fruit.js';
import { treeMatrix, MANGO_FRUIT_LOCAL, SWAMPFIG_FRUIT_LOCAL, ASHPLUM_FRUIT_LOCAL } from './veg/trees.js';
import { berryBushGeometry, dragonPlantGeometry, BERRY_SPOTS_LOCAL, DRAGON_FRUIT_LOCAL, marshBushGeometry, MARSH_SPOTS_LOCAL, lotusPlantGeometry, LOTUS_FRUIT_LOCAL,
  chiliBushGeometry, CHILI_SPOTS_LOCAL, cactusPlantGeometry, CACTUS_FRUIT_LOCAL } from './veg/plants.js';
import { LEAF_MAT, instanced, finishInstanced } from './veg/shapes.js';

const TAU = Math.PI * 2;
const POP_TIME = 0.35;
const SPARKLES_PER_PLANT = 6;
const MAX_FRUIT_PER_PLANT = 4;

/**
 * How each fruit kind is shown. role 'bush': a host shrub with fruit at `spots`;
 * 'tree': fruit at `spots` in the layout tree that hosts it; 'plant': a host
 * plant holding glowing fruit round `local`, with sparkles.
 */
const KINDS = {
  berry: { host: berryBushGeometry, hostMat: () => MAT.standard, hostName: 'berry-bushes', spots: BERRY_SPOTS_LOCAL, name: 'fruit-berries', scale: 1.8 },
  mango: { spots: MANGO_FRUIT_LOCAL, name: 'fruit-mangos', scale: 2.0, cast: true },
  dragon: { host: dragonPlantGeometry, hostMat: () => LEAF_MAT, hostName: 'dragon-plants', local: DRAGON_FRUIT_LOCAL, name: 'fruit-dragon', scale: 1.6 * 0.82, hostScale: 1.1 },
  marshberry: { host: marshBushGeometry, hostMat: () => LEAF_MAT, hostName: 'marshberry-bushes', spots: MARSH_SPOTS_LOCAL, name: 'fruit-marshberries', scale: 1.7 },
  swampfig: { spots: SWAMPFIG_FRUIT_LOCAL, name: 'fruit-swampfigs', scale: 2.0, cast: true },
  glowlotus: { host: lotusPlantGeometry, hostMat: () => LEAF_MAT, hostName: 'lotus-plants', local: LOTUS_FRUIT_LOCAL, name: 'fruit-glowlotus', scale: 1.5, hostScale: 1.15 },
  emberchili: { host: chiliBushGeometry, hostMat: () => LEAF_MAT, hostName: 'chili-bushes', spots: CHILI_SPOTS_LOCAL, name: 'fruit-emberchilis', scale: 1.8 },
  ashplum: { spots: ASHPLUM_FRUIT_LOCAL, name: 'fruit-ashplums', scale: 2.0, cast: true },
  obsidianfig: { host: cactusPlantGeometry, hostMat: () => MAT.standard, hostName: 'cactus-plants', local: CACTUS_FRUIT_LOCAL, name: 'fruit-obsidianfigs', scale: 1.5, hostScale: 1.2 },
};
/** Visual scale of fruit on the plants (fruit models are ~0.25 m; bigger = easier to spot). */
export const FRUIT_PLANT_SCALE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.scale]));
const roleOf = (type) => CONFIG.fruit.types[type]?.role || 'bush';

const easeOutBack = (t) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function buildFruitPlants(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'fruit-plants';
  const rng = makeRng(CONFIG.world.seed ^ 0xf2b17);
  const spots = layout.fruitSpots;
  const treesById = new Map(layout.trees.map((t) => [t.id, t]));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // per kind on this island: host plants, fruit, sparkles (rare plants), and how many of each are used
  const kinds = new Map();
  for (const type of new Set(spots.map((sp) => sp.type))) {
    const K = KINDS[type] || KINDS.berry;
    const n = spots.filter((sp) => sp.type === type).length;
    const role = roleOf(type);
    const k = {
      type, K, role, n,
      host: K.host && role !== 'tree' ? instanced(K.host(), K.hostMat(), n, { name: K.hostName }) : null,
      fruit: instanced(fruitGeometry(type), fruitMaterial(type), n * MAX_FRUIT_PER_PLANT, { cast: !!K.cast, name: K.name }),
      sparkles: role === 'plant' ? instanced(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff7ff'), fog: true }), n * SPARKLES_PER_PLANT, { cast: false, receive: false, name: `${K.name}-sparkles` }) : null,
      hosts: 0, fruits: 0,
    };
    if (k.sparkles) k.sparkles.frustumCulled = false; // animated every frame; bounding sphere would go stale
    kinds.set(type, k);
  }

  /** @type {Map<number, {spot:any, kind:object, count:number, pop:number, anchor:THREE.Vector3, fruit:{mesh:THREE.InstancedMesh,index:number,pos:THREE.Vector3,quat:THREE.Quaternion,scale:number}[], sparkleBase:number}>} */
  const state = new Map();

  const addFruit = (st, pos, scale, yaw) => {
    const quat = new THREE.Quaternion().setFromEuler(e.set((rng() - 0.5) * 0.3, yaw, (rng() - 0.5) * 0.3));
    st.fruit.push({ mesh: st.kind.fruit, index: st.kind.fruits++, pos: pos.clone(), quat, scale });
  };

  for (const spot of spots) {
    const kind = kinds.get(spot.type), K = kind.K;
    const st = { spot, kind, count: 0, pop: 1, anchor: new THREE.Vector3(), fruit: [], sparkleBase: -1 };
    state.set(spot.id, st);
    const rot = rng() * TAU;
    if (kind.role === 'tree') {
      const id = Number(String(spot.host).split(':')[1]);
      const tree = treesById.get(id);
      if (tree) treeMatrix(tree, m4);
      else m4.compose(p.set(spot.x, spot.y, spot.z), q.identity(), s.setScalar(1));
      for (const l of K.spots.slice(0, MAX_FRUIT_PER_PLANT)) {
        const wp = new THREE.Vector3(...l).applyMatrix4(m4);
        addFruit(st, wp, K.scale, rng() * TAU);
        st.anchor.add(wp);
      }
    } else if (kind.role === 'bush') {
      const sc = 0.95 + rng() * 0.2;
      e.set(0, rot, 0); q.setFromEuler(e);
      p.set(spot.x, spot.y - 0.08, spot.z);
      m4.compose(p, q, s.setScalar(sc));
      kind.host?.setMatrixAt(kind.hosts++, m4);
      for (const l of K.spots.slice(0, MAX_FRUIT_PER_PLANT)) {
        const wp = new THREE.Vector3(...l).applyMatrix4(m4);
        addFruit(st, wp, K.scale, rng() * TAU);
        st.anchor.add(wp);
      }
    } else {
      e.set(0, rot, 0); q.setFromEuler(e);
      p.set(spot.x, spot.y - 0.04, spot.z);
      m4.compose(p, q, s.setScalar(K.hostScale ?? 1.1));
      kind.host?.setMatrixAt(kind.hosts++, m4);
      for (let i = 0; i < MAX_FRUIT_PER_PLANT; i++) {
        const a = i * TAU / MAX_FRUIT_PER_PLANT + rot;
        const local = new THREE.Vector3(...K.local);
        local.x += Math.cos(a) * 0.14;
        local.z += Math.sin(a) * 0.14;
        local.y += i % 2 ? -0.09 : 0.06;
        const wp = local.applyMatrix4(m4);
        addFruit(st, wp, K.scale, a);
        st.anchor.add(wp);
      }
      st.sparkleBase = (kind.hosts - 1) * SPARKLES_PER_PLANT;
    }
    st.anchor.divideScalar(MAX_FRUIT_PER_PLANT);
  }

  const writeFruit = (st, k = 1) => {
    for (let i = 0; i < st.fruit.length; i++) {
      const f = st.fruit[i];
      f.mesh.setMatrixAt(f.index, m4.compose(f.pos, f.quat, s.setScalar(f.scale * (i < st.count ? k : 0))));
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  for (const st of state.values()) writeFruit(st, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const k of kinds.values()) {
    if (k.sparkles) for (let i = 0; i < k.sparkles.count; i++) k.sparkles.setMatrixAt(i, zero);
    for (const m of [k.host, k.fruit, k.sparkles]) if (m && m.count > 0) group.add(finishInstanced(m));
  }

  const popping = new Set();
  const glowing = [...kinds.values()].filter((k) => k.role === 'plant');
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  return {
    group,

    /** Show the server-owned number of fruit left on a plant. */
    setCount(spotId, count) {
      const st = state.get(spotId);
      if (!st) return;
      count = Math.max(0, Math.min(MAX_FRUIT_PER_PLANT, count | 0));
      if (st.count === count) return;
      const growing = count > st.count;
      st.count = count;
      if (growing) {
        st.pop = 0;
        popping.add(st);
        writeFruit(st, 0);
      } else {
        popping.delete(st);
        st.pop = 1;
        writeFruit(st);
      }
    },

    /** World position of the spot's fruit (for interaction prompts). */
    getAnchor(spotId) {
      const st = state.get(spotId);
      return st ? st.anchor.clone() : null;
    },

    update(dt, time) {
      for (const st of popping) {
        st.pop = Math.min(1, st.pop + dt / POP_TIME);
        writeFruit(st, easeOutBack(st.pop));
        if (st.pop >= 1) popping.delete(st);
      }
      // rare plants: their fruit spins and bobs, pulsing glow, orbiting sparkles
      for (const kind of glowing) {
        fruitMaterial(kind.type).emissiveIntensity = (FRUIT_GLOW[kind.type] ?? 0.8) + 0.25 * Math.sin(time * 2.4);
      }
      if (!glowing.length) return;
      for (const st of state.values()) {
        if (st.kind.role !== 'plant') continue;
        const f = st.fruit[0];
        const k = st.count > 0 ? (popping.has(st) ? easeOutBack(st.pop) : 1) : 0;
        for (let i = 0; i < st.count; i++) {
          const fruit = st.fruit[i];
          _q.setFromEuler(e.set(0, time * 0.6 + st.spot.id + i, 0));
          _v.copy(fruit.pos); _v.y += Math.sin(time * 1.8 + st.spot.id + i) * 0.03;
          fruit.mesh.setMatrixAt(fruit.index, m4.compose(_v, _q, s.setScalar(fruit.scale * k)));
        }
        const sp = st.kind.sparkles;
        for (let j = 0; j < SPARKLES_PER_PLANT; j++) {
          const idx = st.sparkleBase + j;
          const ph = (time * 0.35 + j / SPARKLES_PER_PLANT) % 1;
          const a = time * 0.9 + (j / SPARKLES_PER_PLANT) * TAU;
          const r = 0.28 + 0.08 * Math.sin(time * 1.3 + j * 1.7);
          _v.set(f.pos.x + Math.cos(a) * r, f.pos.y - 0.2 + ph * 0.65, f.pos.z + Math.sin(a) * r);
          _q.setFromEuler(e.set(time * 2 + j, time * 3 + j, 0));
          const sc = Math.sin(Math.PI * ph) * k;
          sp.setMatrixAt(idx, m4.compose(_v, _q, s.setScalar(Math.max(0, sc))));
        }
      }
      for (const kind of glowing) {
        kind.fruit.instanceMatrix.needsUpdate = true;
        kind.sparkles.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
