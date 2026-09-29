// Fruit plants: berry bushes with red berry clusters, mangos hanging in the
// mango trees (trees themselves come from vegetation.js), and exotic dragon
// fruit plants with a glowing fruit and sparkles. Fruit can be hidden/shown
// per spot (setRipe) with a pop-in animation.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng } from '../../shared/rng.js';
import { MAT } from '../models/kit.js';
import { fruitGeometry, fruitMaterial, FRUIT_GLOW } from '../models/fruit.js';
import { treeMatrix, MANGO_FRUIT_LOCAL } from './veg/trees.js';
import { berryBushGeometry, dragonPlantGeometry, BERRY_SPOTS_LOCAL, DRAGON_FRUIT_LOCAL } from './veg/plants.js';
import { LEAF_MAT, instanced, finishInstanced } from './veg/shapes.js';

const TAU = Math.PI * 2;
const POP_TIME = 0.35;
const SPARKLES_PER_DRAGON = 6;
/** Visual scale of fruit on the plants (fruit models are ~0.25 m; bigger = easier to spot). */
export const FRUIT_PLANT_SCALE = { berry: 1.5, mango: 2.0, dragon: 1.6 };

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

  const count = (type) => spots.filter((sp) => sp.type === type).length;
  const nBerry = count('berry'), nMango = count('mango'), nDragon = count('dragon');

  // hosts (plants)
  const bushes = instanced(berryBushGeometry(), MAT.standard, nBerry, { name: 'berry-bushes' });
  const dragonPlants = instanced(dragonPlantGeometry(), LEAF_MAT, nDragon, { name: 'dragon-plants' });
  // fruit
  const berries = instanced(fruitGeometry('berry'), fruitMaterial('berry'), nBerry * BERRY_SPOTS_LOCAL.length, { cast: false, name: 'fruit-berries' });
  const mangos = instanced(fruitGeometry('mango'), fruitMaterial('mango'), nMango * MANGO_FRUIT_LOCAL.length, { cast: true, name: 'fruit-mangos' });
  const dragons = instanced(fruitGeometry('dragon'), fruitMaterial('dragon'), nDragon, { cast: false, name: 'fruit-dragon' });
  const sparkleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff7ff'), fog: true });
  const sparkles = instanced(new THREE.OctahedronGeometry(0.05, 0), sparkleMat, nDragon * SPARKLES_PER_DRAGON, { cast: false, receive: false, name: 'fruit-sparkles' });
  sparkles.frustumCulled = false; // animated every frame; bounding sphere would go stale

  /** @type {Map<number, {spot:any, ripe:boolean, pop:number, anchor:THREE.Vector3, fruit:{mesh:THREE.InstancedMesh,index:number,pos:THREE.Vector3,quat:THREE.Quaternion,scale:number}[], sparkleBase:number}>} */
  const state = new Map();
  const counters = { berry: 0, mango: 0, dragon: 0, bush: 0, plant: 0 };

  const addFruit = (st, mesh, pos, scale, yaw) => {
    const quat = new THREE.Quaternion().setFromEuler(e.set((rng() - 0.5) * 0.3, yaw, (rng() - 0.5) * 0.3));
    const idx = mesh === berries ? counters.berry++ : mesh === mangos ? counters.mango++ : counters.dragon++;
    st.fruit.push({ mesh, index: idx, pos: pos.clone(), quat, scale });
  };

  for (const spot of spots) {
    const st = { spot, ripe: true, pop: 1, anchor: new THREE.Vector3(), fruit: [], sparkleBase: -1 };
    state.set(spot.id, st);
    const rot = rng() * TAU;
    if (spot.type === 'berry') {
      const sc = 0.95 + rng() * 0.2;
      e.set(0, rot, 0); q.setFromEuler(e);
      p.set(spot.x, spot.y - 0.08, spot.z);
      m4.compose(p, q, s.setScalar(sc));
      bushes.setMatrixAt(counters.bush++, m4);
      for (const l of BERRY_SPOTS_LOCAL) {
        const wp = new THREE.Vector3(...l).applyMatrix4(m4);
        addFruit(st, berries, wp, FRUIT_PLANT_SCALE.berry, rng() * TAU);
        st.anchor.add(wp);
      }
      st.anchor.divideScalar(BERRY_SPOTS_LOCAL.length);
    } else if (spot.type === 'mango') {
      const id = Number(String(spot.host).split(':')[1]);
      const tree = treesById.get(id);
      if (tree) treeMatrix(tree, m4);
      else m4.compose(p.set(spot.x, spot.y, spot.z), q.identity(), s.setScalar(1));
      for (const l of MANGO_FRUIT_LOCAL) {
        const wp = new THREE.Vector3(...l).applyMatrix4(m4);
        addFruit(st, mangos, wp, FRUIT_PLANT_SCALE.mango, rng() * TAU);
        st.anchor.add(wp);
      }
      st.anchor.divideScalar(MANGO_FRUIT_LOCAL.length);
    } else {
      const sc = 1.1;
      e.set(0, rot, 0); q.setFromEuler(e);
      p.set(spot.x, spot.y - 0.04, spot.z);
      m4.compose(p, q, s.setScalar(sc));
      dragonPlants.setMatrixAt(counters.plant++, m4);
      const wp = new THREE.Vector3(...DRAGON_FRUIT_LOCAL).applyMatrix4(m4);
      wp.y += 0.06;
      addFruit(st, dragons, wp, FRUIT_PLANT_SCALE.dragon, rot);
      st.anchor.copy(wp);
      st.sparkleBase = (counters.dragon - 1) * SPARKLES_PER_DRAGON;
    }
  }

  const writeFruit = (st, k = 1) => {
    for (const f of st.fruit) {
      f.mesh.setMatrixAt(f.index, m4.compose(f.pos, f.quat, s.setScalar(f.scale * k)));
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  for (const st of state.values()) writeFruit(st, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < sparkles.count; i++) sparkles.setMatrixAt(i, zero);

  for (const m of [bushes, dragonPlants, berries, mangos, dragons, sparkles]) {
    if (m.count > 0) group.add(finishInstanced(m));
  }

  const popping = new Set();
  const dragonMat = fruitMaterial('dragon');
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  return {
    group,

    /** Show/hide a spot's fruit. Showing plays a quick pop-in. */
    setRipe(spotId, ripe) {
      const st = state.get(spotId);
      if (!st) return;
      ripe = !!ripe;
      if (st.ripe === ripe) return;
      st.ripe = ripe;
      if (ripe) {
        st.pop = 0;
        popping.add(st);
        writeFruit(st, 0);
      } else {
        popping.delete(st);
        st.pop = 0;
        writeFruit(st, 0);
      }
    },

    /** World position of the spot's fruit (for interaction prompts). */
    getAnchor(spotId) {
      const st = state.get(spotId);
      return st ? st.anchor.clone() : null;
    },

    isRipe(spotId) {
      return state.get(spotId)?.ripe ?? false;
    },

    update(dt, time) {
      for (const st of popping) {
        st.pop = Math.min(1, st.pop + dt / POP_TIME);
        writeFruit(st, easeOutBack(st.pop));
        if (st.pop >= 1) popping.delete(st);
      }
      // dragon fruit: slow spin + bob, pulsing glow, orbiting sparkles
      dragonMat.emissiveIntensity = FRUIT_GLOW.dragon + 0.25 * Math.sin(time * 2.4);
      if (!nDragon) return;
      for (const st of state.values()) {
        if (st.spot.type !== 'dragon') continue;
        const f = st.fruit[0];
        const k = st.ripe ? (popping.has(st) ? easeOutBack(st.pop) : 1) : 0;
        if (k > 0) {
          _q.setFromEuler(e.set(0, time * 0.6 + st.spot.id, 0));
          _v.copy(f.pos); _v.y += Math.sin(time * 1.8 + st.spot.id) * 0.03;
          dragons.setMatrixAt(f.index, m4.compose(_v, _q, s.setScalar(f.scale * k)));
        }
        for (let j = 0; j < SPARKLES_PER_DRAGON; j++) {
          const idx = st.sparkleBase + j;
          const ph = (time * 0.35 + j / SPARKLES_PER_DRAGON) % 1;
          const a = time * 0.9 + (j / SPARKLES_PER_DRAGON) * TAU;
          const r = 0.28 + 0.08 * Math.sin(time * 1.3 + j * 1.7);
          _v.set(f.pos.x + Math.cos(a) * r, f.pos.y - 0.2 + ph * 0.65, f.pos.z + Math.sin(a) * r);
          _q.setFromEuler(e.set(time * 2 + j, time * 3 + j, 0));
          const sc = Math.sin(Math.PI * ph) * k;
          sparkles.setMatrixAt(idx, m4.compose(_v, _q, s.setScalar(Math.max(0, sc))));
        }
      }
      dragons.instanceMatrix.needsUpdate = true;
      sparkles.instanceMatrix.needsUpdate = true;
    },
  };
}
