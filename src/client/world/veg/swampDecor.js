// Swamp decor (Misty Swamp): lily pads and duckweed floating on the bogs'
// water, and fields of mangrove breathing roots (pneumatophores) poking out of
// the mud along their shores. Client-only decoration, placed from the island
// seed over Terrain.bogAt / bogLevelAt; each kind is one instanced mesh that
// vegetation.js hands to SpatialInstances (culled per chunk).

import * as THREE from 'three';
import { MAT, merge, place, paint, spike, deform } from '../../models/kit.js';
import { makeRng } from '../../../shared/rng.js';
import { insideSwampArena } from '../../../shared/swampArena.js';
import { instanced, LEAF_MAT } from './shapes.js';

const TAU = Math.PI * 2;
const cache = new Map();
const cached = (key, fn) => {
  let g = cache.get(key);
  if (!g) { g = fn(); g.userData.sharedResource = true; cache.set(key, g); }
  return g;
};

/** A lily pad (notched disc, radius 1) with a pale rim; every fourth has a flower. */
function lilyGeometry() {
  return cached('lily', () => {
    const pad = paint(new THREE.CircleGeometry(1, 14, 0.35, TAU - 0.5).rotateX(-Math.PI / 2),
      (c) => (Math.hypot(c.x, c.z) > 0.82 ? '#7d9a48' : '#4f7a34'));
    const flower = paint(new THREE.ConeGeometry(0.28, 0.32, 7).translate(0.25, 0.14, 0.2), (c) => (c.y > 0.22 ? '#f2e2ea' : '#e8a8c0'));
    return merge([pad, flower]);
  });
}

/** A ragged, flat patch of duckweed (radius ~1). */
function duckweedGeometry() {
  return cached('duckweed', () => {
    let g = new THREE.CircleGeometry(1, 18, 0, TAU).rotateX(-Math.PI / 2);
    g = deform(g, (v) => {
      const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
      const k = 1 + 0.28 * Math.sin(a * 3 + 1.3) + 0.16 * Math.sin(a * 7 + 0.4);
      v.x *= k; v.z *= k;
      v.y = r * 0.002;
    });
    return paint(g, (c) => (Math.sin(c.x * 9) * Math.cos(c.z * 7) > 0.3 ? '#a4c45a' : '#86ac44'));
  });
}

/** A field of breathing roots: thin dark spikes out of the mud (~0.7 m across). */
function pneumatophoreGeometry() {
  return cached('pneumatophores', () => {
    const rng = makeRng(911);
    const parts = [];
    for (let k = 0; k < 16; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 0.7;
      const h = 0.12 + rng() * 0.3;
      parts.push(place(spike(0.022 + rng() * 0.012, h, '#4a3c2c', '#6f6650', 4), [Math.cos(a) * r, -0.04, Math.sin(a) * r], [(rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25]));
    }
    return merge(parts);
  });
}

/**
 * Build the decor meshes (unfinished InstancedMesh sources for SpatialInstances).
 * @returns {THREE.InstancedMesh[]}
 */
export function buildSwampDecor(terrain, layout) {
  if (!terrain.bogMask) return [];
  const plan = layout.plan;
  const rng = makeRng(plan.seed ^ 0x11a7);
  const out = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const arena = layout.swampArena;
  const sample = (count, accept) => {
    const pts = [];
    for (let i = 0; i < count * 30 && pts.length < count; i++) {
      const x = rng.range(-plan.A, plan.A), z = rng.range(-plan.B, plan.B);
      const r = accept(x, z);
      if (r) pts.push(r);
    }
    return pts;
  };
  const offPath = (x, z, pad) => layout.distToPath(x, z) > pad;

  // floating: lily pads in the open water, duckweed patches in the still corners
  const onWater = (min, max) => (x, z) => {
    const b = terrain.bogAt(x, z), lvl = terrain.bogLevelAt(x, z);
    if (b < min || b > max || lvl === null || terrain.heightAt(x, z) > lvl - 0.04 || !offPath(x, z, 3)) return null;
    return { x, z, y: lvl + 0.012 };
  };
  const lilies = sample(520, onWater(0.55, 1.01));
  const duck = sample(240, onWater(0.3, 1.01));
  // the breathing roots stand in the mud of the shores (wet or just dry)
  const roots = sample(800, (x, z) => {
    const b = terrain.bogAt(x, z);
    if (b < 0.08 || b > 0.75 || !offPath(x, z, 2.6) || (arena && insideSwampArena(arena, x, z, -2))) return null;
    return { x, z, y: terrain.heightAt(x, z) };
  });

  const add = (list, geo, mat, name, scale, { cast = false } = {}) => {
    if (!list.length) return;
    const m = instanced(geo, mat, list.length, { cast, receive: true, name });
    list.forEach((o, i) => {
      e.set(0, rng() * TAU, 0); q.setFromEuler(e);
      const k = scale[0] + rng() * (scale[1] - scale[0]);
      m.setMatrixAt(i, m4.compose(p.set(o.x, o.y, o.z), q, s.set(k, k, k)));
    });
    out.push(m);
  };
  add(lilies, lilyGeometry(), LEAF_MAT, 'swamp-lilies', [0.28, 0.5]);
  add(duck, duckweedGeometry(), LEAF_MAT, 'swamp-duckweed', [0.8, 2.2]);
  add(roots, pneumatophoreGeometry(), MAT.standard, 'swamp-pneumatophores', [0.8, 1.4]);
  return out;
}
