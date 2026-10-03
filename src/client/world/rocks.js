// Rocks (smooth boulders in the biome's stone colors, with moss) and the
// terraced sea stacks standing in the water around the island (with a palm
// or two on top on green islands).

import * as THREE from 'three';
import { makeRng, hash2, fbm } from '../../shared/rng.js';
import { MAT, deform, paint, place, merge, jitter, smoothNormals } from '../models/kit.js';
import { treeGeometry, treeMatrix, TREE_WIND } from './veg/trees.js';
import { clump, windPair, LEAF_MAT, instanced, finishInstanced, foliageTint } from './veg/shapes.js';
import { rockTable } from '../../shared/rockShapes.js';
import { SpatialInstances } from './veg/spatialInstances.js';
import { detailMaterial } from './surfaceDetail.js';

const TAU = Math.PI * 2;
const DEFAULT_ROCKS = { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845' };
const DEFAULT_KINDS = [[1, 1, 1]];
/** Share of each stone kind (biome.rocks.kinds order: granite, sandstone, basalt, limestone). */
const KIND_WEIGHTS = [0.4, 0.25, 0.2, 0.15];

const rockCache = new Map();
/**
 * Rock geometry built from the shared ring table (see shared/rockShapes.js), so
 * the walkable surface matches the mesh exactly. 0 = rounded boulder,
 * 1 = chunky block, 2 = flat slab, 3 = stepped rock, 4 = rock formation.
 * `palette` = biome.rocks ({ colors, moss }).
 */
export function rockGeo(variant, mossy, palette = DEFAULT_ROCKS) {
  const key = `${variant}:${mossy ? 1 : 0}:${palette.colors.join()}`;
  let g = rockCache.get(key);
  if (g) return g;
  const c0 = new THREE.Color(palette.colors[0]), c1 = new THREE.Color(palette.colors[1]), c2 = new THREE.Color(palette.colors[2]);
  const low = c1.clone().multiplyScalar(0.82);
  const moss = new THREE.Color(palette.moss), mossLight = moss.clone().offsetHSL(0, 0, 0.06);
  const tmp = new THREE.Color();
  const seed = 11 + variant * 7;
  const t = rockTable(variant);
  const P = (k, j) => {
    const a = (j / t.sides) * TAU;
    return [t.rad[k][j] * Math.cos(a), t.h[k][j], t.rad[k][j] * Math.sin(a)];
  };
  const pos = [];
  const tri = (a, b, c) => {
    // wind every face outward/upward
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    const flip = nx * mx + ny * (0.5 * Math.hypot(mx, mz) + 0.05) + nz * mz < 0;
    pos.push(...a, ...(flip ? c : b), ...(flip ? b : c));
  };
  for (let k = 0; k < t.rad.length - 1; k++) {
    for (let j = 0; j < t.sides; j++) {
      const j1 = (j + 1) % t.sides;
      const a = P(k, j), b = P(k, j1), c = P(k + 1, j1), d = P(k + 1, j);
      if (k > 0) tri(a, b, c);
      tri(a, c, d);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g = smoothNormals(g, (60 * Math.PI) / 180);        // round flanks, crisp ledges
  g = paint(g, (c, n) => {
    // soft color drift over the stone, darker at the foot, moss on top
    const t = fbm(c.x * 1.7 + seed, c.z * 1.7, 2, seed) * 0.5 + 0.5;
    tmp.copy(c0).lerp(c2, t).lerp(c1, Math.max(0, Math.sin(c.y * 5 + c.x * 2) * 0.3));
    tmp.lerp(low, Math.max(0, Math.min(1, (0.05 - c.y) * 6)));
    if (mossy) {
      const m = Math.max(0, Math.min(1, (n.y - 0.55) / 0.25 + jitter(c, 0.15, seed + 4)));
      tmp.lerp(t > 0.5 ? mossLight : moss, m);
    }
    return tmp;
  });
  g.computeBoundingSphere();
  g.userData.sharedResource = true;
  rockCache.set(key, g);
  return g;
}

/** One terraced sea stack in world space. */
function stackGeometry(st, idx, rng, CLIFF, seedBase, green) {
  const parts = [], greens = [];
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
    let g = new THREE.CylinderGeometry(rT, rB, hh, 28, 6);
    g = deform(g, (v) => {
      const onTop = Math.abs(v.y - hh / 2) < 1e-4;
      const rad = Math.hypot(v.x, v.z);
      if (rad > 1e-4) {
        // smooth lumpy outline (low-frequency), not per-vertex spikes
        const a = Math.atan2(v.z, v.x);
        const f = 1 + 0.08 * Math.sin(a * 3 + seed + k) + 0.05 * Math.sin(a * 7 - seed) + 0.03 * Math.sin(v.y * 0.8 + a * 2);
        v.x *= f; v.z *= f;
      }
      if (onTop && rad > 1e-4) v.y -= 0.25 * (rad / rT) ** 2;   // rounded lip
    });
    g = smoothNormals(g, (50 * Math.PI) / 180);
    const cx = st.x + ox * cs - oz * sn, cz = st.z + ox * sn + oz * cs;
    g = place(g, [cx, (y0 + y1) / 2, cz], [0, st.rot + k * 0.7, 0]);
    g = paint(g, (c, n) => {
      if (n.y > 0.72) return jitter(c, 1, seed) > 0 ? CLIFF.top : CLIFF.top2;
      if (c.y < 0.5) return CLIFF.wet;
      const band = Math.floor(c.y / 2.3);
      const hsh = hash2(band, idx, seedBase);
      if (hsh > 0.64) return CLIFF.rockWarm;
      return jitter(c, 1, seed + 2) > 0.45 || hsh < 0.25 ? CLIFF.rockDark : CLIFF.rock;
    });
    parts.push(g);
    // bushy green overhangs along the tier lip
    const lipR = rT * 0.93;
    const nb = green ? 3 + Math.floor(rng() * 3) : 0;
    for (let b = 0; b < nb; b++) {
      const a = rng() * TAU;
      const r = 0.7 + rng() * 0.8;
      greens.push(place(clump(r, { seed: seed + b * 3 + k, detail: 0, squash: 0.7, top: '#8fd052', mid: '#6cb842', mid2: '#5fa83c', bottom: '#467f32' }),
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
    parts.push(place(rockGeo(b % 3, false, CLIFF.palette).clone(), [st.x + Math.cos(a) * r, -0.35 * sc, st.z + Math.sin(a) * r], [0, rng() * TAU, 0], [sc, sc * 0.9, sc]));
  }
  return { geo: merge(parts), green: greens.length ? merge(greens) : null, top };
}

export function buildRocks(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'rocks';
  const spatial = new SpatialInstances(group);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const rockMat = detailMaterial(MAT.standard, 'rock');

  const palette = layout.biome?.rocks || DEFAULT_ROCKS;
  const T = layout.biome?.terrain || {};
  const green = layout.biome?.id !== 'volcano';
  const seed = layout.plan.seed;
  const kinds = palette.kinds || DEFAULT_KINDS;
  const stoneKind = (r) => {
    // fbm clusters around 0.5: stretch it so every kind gets its own patches
    const region = Math.min(0.999, Math.max(0, (fbm(r.x * 0.018, r.z * 0.018, 2, seed + 71) + 0.6) / 1.2));
    let u = hash2(r.id, 11, seed) < 0.3 ? hash2(r.id, 17, seed) : region;
    for (let k = 0; k < kinds.length; k++) {
      const w = KIND_WEIGHTS[k] ?? 0;
      if (u < w || k === kinds.length - 1) return k;
      u -= w;
    }
    return 0;
  };
  const CLIFF = {
    rock: palette.colors[0], rockDark: palette.colors[1], rockWarm: T.rockWarm || '#a88f86',
    top: green ? '#86c650' : (T.ash || '#6f686c'), top2: green ? '#79bb48' : (T.rockDark || '#35303b'),
    wet: T.rockDark || '#6c6480', palette,
  };

  // ------------------------------------------------------------- rocks
  const buckets = new Map();
  for (const r of layout.rocks) {
    const key = `${r.variant}:${r.mossy ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  for (const [key, list] of buckets) {
    const [variant, mossy] = key.split(':').map(Number);
    const m = instanced(rockGeo(variant, !!mossy, palette), rockMat, list.length, { name: `rocks-${key}` });
    list.forEach((r, i) => {
      // fx/fy/fz/by come from placeRock() in the layout (shared with the walkable surface)
      const { fx, fy, fz } = r;
      p.set(r.x, r.by, r.z);
      e.set((r.sx - 1.1) * 0.15, r.rot, (r.sz - 1.05) * 0.15); q.setFromEuler(e);
      m.setMatrixAt(i, m4.compose(p, q, s.set(fx, fy, fz)));
      // stone kind: neighbouring rocks tend to share one (a patch of the same
      // geology), with a few strays; the tint also picks the shader's stone pattern
      const tint = kinds[stoneKind(r)] || kinds[0];
      const b = 0.94 + 0.12 * hash2(r.id, 3, seed);
      m.setColorAt(i, col.setRGB(tint[0] * b, tint[1] * b, tint[2] * b));
    });
    spatial.add(m);
  }

  // --------------------------------------------------------- sea stacks
  const rng = makeRng(layout.plan.seed ^ 0x57ac);
  const stackParts = [], stackGreen = [];
  const palms = [];
  layout.seaStacks.forEach((st, i) => {
    const { geo, green: greenGeo, top } = stackGeometry(st, i, rng, CLIFF, layout.plan.seed, green);
    stackParts.push(geo);
    if (greenGeo) stackGreen.push(greenGeo);
    const n = green ? 1 + (i % 2) : 0;
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, r = top.r * (0.15 + rng() * 0.35);
      palms.push({ x: top.x + Math.cos(a) * r, z: top.z + Math.sin(a) * r, y: top.y, rot: rng() * TAU, lean: (rng() - 0.5) * 0.25, scale: 0.85 + rng() * 0.3, hue: rng() });
    }
  });
  if (stackParts.length) {
    const stacks = new THREE.Mesh(merge(stackParts), rockMat);
    stacks.name = 'sea-stacks';
    stacks.castShadow = true;
    stacks.receiveShadow = true;
    group.add(stacks);
  }
  if (stackGreen.length) {
    const bushes = new THREE.Mesh(merge(stackGreen), detailMaterial(MAT.standard, 'foliage'));
    bushes.name = 'sea-stack-bushes';
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    group.add(bushes);
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
    spatial.add(trunk, { wind: TREE_WIND.palm });
    spatial.add(leaves, { wind: TREE_WIND.palm, geometries: [geo.foliage, treeGeometry('palm', 1, 1).foliage, treeGeometry('palm', 1, 2).foliage] });
  }

  return { group, spatial, update(dt, time, cam) { if (cam) spatial.update(cam); }, setQuality(q) { spatial.setQuality(q); } };
}
