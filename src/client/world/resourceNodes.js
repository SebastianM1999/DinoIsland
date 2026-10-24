// Map resources on the island (shared/layout.js resourceSpots, config.js loot):
// amber resin on the bark of round and tall trees, dark ironwood branches beside
// the rocks on the hillsides, healing herbs on the meadows and river banks. One
// InstancedMesh per kind; a gathered spot hides (setUp) and pops back in when the
// server says it grew back. Their materials glow softly, with a slow pulse.

import * as THREE from 'three';
import { TRUNKS, treeVariant, TREE_SINK } from '../../shared/treeShapes.js';
import { resourceGeometry, resourceMaterial, RESOURCE_GLOW } from '../models/props/resources.js';
import { treeMatrix } from './veg/trees.js';
import { instanced, finishInstanced } from './veg/shapes.js';

const POP_TIME = 0.35;
/** Visual scale per kind (the models are life-size; a little bigger is easier to spot). */
const SCALE = { resin: 1.5, ironwood: 1.25, herb: 1.7, crystal: 1.6 };
/** Height of the resin on the bark, above the ground (m). */
const RESIN_HEIGHT = 1.15;

const easeOutBack = (t) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Point on the visible trunk of `tree` at `height` above its foot, facing world angle `side`. */
function barkPoint(tree, height, side, out) {
  const shape = TRUNKS[tree.type][treeVariant(tree)];
  const sink = tree.sink ?? TREE_SINK;
  const ly = (height + sink) / tree.scale;                   // local height (the tree mesh is scaled)
  const pts = shape.pts;
  let i = 1;
  while (i < pts.length - 1 && pts[i][1] < ly) i++;
  const k = Math.max(0, Math.min(1, (ly - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1] || 1)));
  const ax = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, az = pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * k;
  const r = shape.r(Math.min(1, ly / pts[pts.length - 1][1])) * tree.scale;
  // the trunk's axis there (bent, leaning, turned: the tree's own frame), then out to the bark in world space
  out.set(ax, ly, az).applyMatrix4(treeMatrix(tree, new THREE.Matrix4()));
  out.x += Math.cos(side) * r;
  out.z += Math.sin(side) * r;
  return out;
}

export function buildResourceNodes(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'resource-nodes';
  const spots = layout.resourceSpots || [];
  const treesById = new Map(layout.trees.map((t) => [t.id, t]));
  const kinds = new Map();
  for (const type of new Set(spots.map((s) => s.type))) {
    const geo = resourceGeometry(type);
    if (!geo) continue;
    const n = spots.filter((s) => s.type === type).length;
    kinds.set(type, { mesh: instanced(geo, resourceMaterial(type), n, { cast: type !== 'resin', name: `resource-${type}` }), used: 0 });
  }

  /** @type {Map<number, {kind:object, index:number, pos:THREE.Vector3, quat:THREE.Quaternion, scale:number, up:boolean, pop:number}>} */
  const state = new Map();
  const m4 = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  for (const spot of spots) {
    const kind = kinds.get(spot.type);
    if (!kind) continue;
    const pos = new THREE.Vector3(spot.x, spot.y, spot.z);
    const quat = new THREE.Quaternion();
    const tree = spot.type === 'resin' && treesById.get(Number(String(spot.host).split(':')[1]));
    if (tree) {
      // on the bark, bulging out away from the trunk: the yaw turns the model's +Z to (cos side, sin side)
      barkPoint(tree, RESIN_HEIGHT, spot.side, pos);
      quat.setFromEuler(e.set(0, Math.atan2(Math.cos(spot.side), Math.sin(spot.side)), 0));
    } else {
      pos.y -= spot.type === 'ironwood' ? 0.04 : 0.02;
      quat.setFromEuler(e.set(0, spot.rot ?? 0, 0));
    }
    state.set(spot.id, { kind, index: kind.used++, pos, quat, scale: SCALE[spot.type] ?? 1, up: true, pop: 1 });
  }

  const write = (st, k = 1) => {
    st.kind.mesh.setMatrixAt(st.index, m4.compose(st.pos, st.quat, s.setScalar(st.scale * (st.up ? k : 0))));
    st.kind.mesh.instanceMatrix.needsUpdate = true;
  };
  for (const st of state.values()) write(st);
  for (const k of kinds.values()) group.add(finishInstanced(k.mesh));

  const popping = new Set();
  return {
    group,

    /** Show whether a spot's resource is there (the server's EV.RESOURCE / fullState). */
    setUp(spotId, up) {
      const st = state.get(spotId);
      if (!st || st.up === !!up) return;
      st.up = !!up;
      if (st.up) {
        st.pop = 0;
        popping.add(st);
        write(st, 0);
      } else {
        popping.delete(st);
        write(st);
      }
    },

    /** Whether a spot's resource is there to gather. */
    isUp(spotId) {
      return !!state.get(spotId)?.up;
    },

    /** World position of a spot's resource (resin hangs on the bark). */
    getAnchor(spotId) {
      const st = state.get(spotId);
      return st ? st.pos.clone() : null;
    },

    update(dt, time) {
      for (const st of popping) {
        st.pop = Math.min(1, st.pop + dt / POP_TIME);
        write(st, easeOutBack(st.pop));
        if (st.pop >= 1) popping.delete(st);
      }
      // a soft pulse in each kind's own glow, so a resource catches the eye among the plants
      for (const type of kinds.keys()) {
        resourceMaterial(type).emissiveIntensity = (RESOURCE_GLOW[type] ?? 0.2) * (1 + 0.35 * Math.sin(time * 2.2 + type.length));
      }
    },
  };
}
