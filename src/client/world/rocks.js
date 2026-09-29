// Rocks (faceted grey-violet boulders with moss) and the terraced sea stacks
// standing in the water around the island (with a palm or two on top).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng, hash2 } from '../../shared/rng.js';
import { MAT, deform, paint, place, merge, jitter } from '../models/kit.js';
import { treeGeometry, treeMatrix, TREE_WIND } from './veg/trees.js';
import { clump, windPair, LEAF_MAT, instanced, finishInstanced, foliageTint } from './veg/shapes.js';

const TAU = Math.PI * 2;
const ROCK_COLS = ['#9c93a8', '#8f86a0', '#a79c9a', '#958ba3'];
const ROCK_LOW = ['#7f7390', '#877b96'];
const MOSS = ['#7cc34a', '#69b53f'];
// terrain cliff palette
const CLIFF = { rock: '#9c8fa3', rockDark: '#7f7390', rockWarm: '#a88f86', top: '#86c650', top2: '#79bb48', wet: '#6c6480' };

const rockCache = new Map();
/** Rock geometry: 0 = rounded boulder, 1 = chunky block, 2 = flat slab. Radius ≈1.1. */
export function rockGeo(variant, mossy) {
  const key = `${variant}:${mossy ? 1 : 0}`;
  let g = rockCache.get(key);
  if (g) return g;
  const seed = 11 + variant * 7;
  const base = variant === 1 ? new THREE.DodecahedronGeometry(1.02, 0) : new THREE.IcosahedronGeometry(1, 1);
  const squash = [0.72, 0.88, 0.5][variant];
  const topCut = [0.52, 0.6, 0.32][variant];
  const stretch = [1, 0.95, 1.12][variant];
  g = deform(base, (v) => {
    v.x += jitter(v, 0.2, seed);
    v.y += jitter(v, 0.16, seed + 1);
    v.z += jitter(v, 0.2, seed + 2);
    v.x *= stretch;
    v.z *= 2 - stretch;
    v.y *= squash;
    if (v.y > topCut) v.y = topCut + (v.y - topCut) * 0.2;          // flat-ish top
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.2;                 // flat bottom sinks in
  });
  g = paint(g, (c, n) => {
    if (mossy && n.y > 0.72) return jitter(c, 1, seed + 4) > 0 ? MOSS[0] : MOSS[1];
    if (mossy && n.y > 0.5 && jitter(c, 1, seed + 6) > 0.1) return '#8db552';
    if (c.y < -0.02) return ROCK_LOW[Math.abs(Math.floor(jitter(c, 10, seed + 5))) % 2];
    return ROCK_COLS[Math.abs(Math.floor(jitter(c, 10, seed + 3))) % ROCK_COLS.length];
  });
  g.computeBoundingSphere();
  rockCache.set(key, g);
  return g;
}

/** One terraced sea stack in world space. */
function stackGeometry(st, idx, rng) {
  const parts = [];
  const tiers = 3 + (idx % 2);
  const weights = tiers === 3 ? [0.46, 0.31, 0.23] : [0.38, 0.26, 0.2, 0.16];
  const baseY = st.y - 1;
  const total = st.height - baseY;
  const seed = 400 + idx * 13;
  let y0 = baseY, ox = 0, oz = 0;
  const cs = Math.cos(st.rot), sn = Math.sin(st.rot);
  let top = null;
  for (let k = 0; k < tiers; k++) {
    const h = total * weights[k];
    const y1 = k === tiers - 1 ? st.height : y0 + h;
    const hh = y1 - y0;
    const rB = st.radius * (1 - k * 0.19) * (k === 0 ? 1.08 : 1);
    const rT = rB * (k === 0 ? 0.86 : 0.9);
    let g = new THREE.CylinderGeometry(rT, rB, hh, 11, 4);
    g = deform(g, (v) => {
      const onTop = Math.abs(v.y - hh / 2) < 1e-4;
      const rad = Math.hypot(v.x, v.z);
      if (rad > 1e-4) {
        const f = 1 + jitter(v, 0.13, seed + k);
        v.x *= f; v.z *= f;
      }
      if (!onTop && v.y > -hh / 2 + 1e-4) v.y += jitter(v, hh * 0.04, seed + k + 3);
    });
    const cx = st.x + ox * cs - oz * sn, cz = st.z + ox * sn + oz * cs;
    g = place(g, [cx, (y0 + y1) / 2, cz], [0, st.rot + k * 0.7, 0]);
    g = paint(g, (c, n) => {
      if (n.y > 0.72) return jitter(c, 1, seed) > 0 ? CLIFF.top : CLIFF.top2;
      if (c.y < 0.5) return CLIFF.wet;
      const band = Math.floor(c.y / 2.3);
      const hsh = hash2(band, idx, CONFIG.world.seed);
      if (hsh > 0.64) return CLIFF.rockWarm;
      return jitter(c, 1, seed + 2) > 0.45 || hsh < 0.25 ? CLIFF.rockDark : CLIFF.rock;
    });
    parts.push(g);
    // bushy green overhangs along the tier lip
    const lipR = rT * 0.93;
    const nb = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < nb; b++) {
      const a = rng() * TAU;
      const r = 0.7 + rng() * 0.8;
      parts.push(place(clump(r, { seed: seed + b * 3 + k, detail: 0, squash: 0.7, top: '#8fd052', mid: '#6cb842', mid2: '#5fa83c', bottom: '#467f32' }),
        [cx + Math.cos(a) * lipR, y1 + r * 0.15, cz + Math.sin(a) * lipR], [0, a, 0]));
    }
    top = { x: cx, z: cz, y: y1, r: rT };
    y0 = y1;
    ox += (rng() - 0.5) * st.radius * 0.18;
    oz += (rng() - 0.5) * st.radius * 0.18;
  }
  // rubble at the waterline
  const nr = 4 + Math.floor(rng() * 3);
  for (let b = 0; b < nr; b++) {
    const a = rng() * TAU;
    const r = st.radius * (1.0 + rng() * 0.25);
    const sc = 1.2 + rng() * 1.8;
    parts.push(place(rockGeo(b % 3, false).clone(), [st.x + Math.cos(a) * r, -0.35 * sc, st.z + Math.sin(a) * r], [0, rng() * TAU, 0], [sc, sc * 0.9, sc]));
  }
  return { geo: merge(parts), top };
}

export function buildRocks(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'rocks';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  // ------------------------------------------------------------- rocks
  const buckets = new Map();
  for (const r of layout.rocks) {
    const key = `${r.variant}:${r.mossy ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  for (const [key, list] of buckets) {
    const [variant, mossy] = key.split(':').map(Number);
    const m = instanced(rockGeo(variant, !!mossy), MAT.standard, list.length, { name: `rocks-${key}` });
    list.forEach((r, i) => {
      const slope = terrain.slopeAt(r.x, r.z);
      const fx = r.scale * (1 + (r.sx - 1.1) * 0.4);
      const fz = r.scale * (1 + (r.sz - 1.05) * 0.4);
      const fy = r.scale * (0.85 + 0.3 * ((r.id * 0.618) % 1));
      p.set(r.x, r.y - r.scale * (0.12 + Math.min(0.35, slope * 0.3)), r.z);
      e.set((r.sx - 1.1) * 0.15, r.rot, (r.sz - 1.05) * 0.15); q.setFromEuler(e);
      m.setMatrixAt(i, m4.compose(p, q, s.set(fx, fy, fz)));
      const b = 0.88 + 0.12 * ((r.id * 0.377) % 1);
      m.setColorAt(i, col.setRGB(b, b * (0.97 + 0.03 * (r.id % 2)), b));
    });
    group.add(finishInstanced(m));
  }

  // --------------------------------------------------------- sea stacks
  const rng = makeRng(CONFIG.world.seed ^ 0x57ac);
  const stackParts = [];
  const palms = [];
  layout.seaStacks.forEach((st, i) => {
    const { geo, top } = stackGeometry(st, i, rng);
    stackParts.push(geo);
    const n = 1 + (i % 2);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, r = top.r * (0.15 + rng() * 0.35);
      palms.push({ x: top.x + Math.cos(a) * r, z: top.z + Math.sin(a) * r, y: top.y, rot: rng() * TAU, lean: (rng() - 0.5) * 0.25, scale: 0.85 + rng() * 0.3, hue: rng() });
    }
  });
  if (stackParts.length) {
    const stacks = new THREE.Mesh(merge(stackParts), MAT.standard);
    stacks.name = 'sea-stacks';
    stacks.castShadow = true;
    stacks.receiveShadow = true;
    group.add(stacks);
  }
  if (palms.length) {
    const geo = treeGeometry('palm', 1);
    const tw = windPair(MAT.standard, TREE_WIND.palm);
    const fw = windPair(LEAF_MAT, TREE_WIND.palm);
    const trunk = instanced(geo.trunk, tw.mat, palms.length, { depth: tw.depth, name: 'stack-palm-trunk' });
    const leaves = instanced(geo.foliage, fw.mat, palms.length, { depth: fw.depth, name: 'stack-palm-leaves' });
    palms.forEach((t, i) => {
      treeMatrix(t, m4, 0.05);
      trunk.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, foliageTint(t.hue, col));
    });
    group.add(finishInstanced(trunk), finishInstanced(leaves));
  }

  return { group };
}
