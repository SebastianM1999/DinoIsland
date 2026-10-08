// Stone and crystal dressing of the Hollow Mountain from `layout.caveDecor`
// (shared/layout.js: same numbers as the colliders): stalactites hanging from the
// roof, stalagmites, floor-to-roof columns, crystal clusters with soft glow halos
// and bioluminescent mushrooms on the banks of the underground water.
//
// Everything is built once from smooth lathe shapes (wet stone with bands, pale
// flowstone, darker toward the roof), drawn with instancing and handed to
// SpatialInstances (80 m chunks, culled past the fog). Crystals and mushrooms
// use the vertex-colour glow material (emissive follows the colour); their
// halos are one additive Points draw (see glowPoints).
// Budgets: stalactite 216 tris, stalagmite 216, crystal cluster ~420, mushroom ~170.

import * as THREE from 'three';
import { makeRng, smoothstep, fbm } from '../../shared/rng.js';
import { merge, paint, place, smoothNormals } from '../models/kit.js';
import { glowMaterial } from './veg/shapes.js';
import { SpatialInstances } from './veg/spatialInstances.js';
import { retainResource } from '../core/resources.js';
import { glowColor } from './caveStyle.js';
import { withCaveSky } from './caveSky.js';

const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);

// ------------------------------------------------------------------ lathe
/**
 * Smooth solid of revolution (y up) from profile rows { y, r }, wobbled by a few
 * low sines (no per-vertex jitter), vertex colours from color(y01, angle).
 */
function lathe(profile, { radial = 12, lump = 0.08, seed = 1, color }) {
  const rows = profile.length, pos = [], col = [], idx = [];
  const tmp = new THREE.Color();
  const top = profile[profile.length - 1].y, bot = profile[0].y;
  for (let i = 0; i < rows; i++) {
    const { y, r } = profile[i];
    const t = (y - bot) / (top - bot || 1);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const w = 1 + lump * (Math.sin(a * 2 + seed + t * 4) * 0.6 + Math.sin(a * 3 - seed * 1.7 + t * 7) * 0.4);
      pos.push(Math.cos(a) * r * w, y, Math.sin(a) * r * w);
      tmp.set(color(t, a));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + (k + 1) % radial, c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WET = ['#6f6a74', '#938c8c', '#b3a89e', '#cfc4b8'];
const stoneColor = (t, a, hang) => {
  // bands of warm / cool stone and pale flowstone streaks; darker where it meets the roof or floor
  const band = Math.sin(t * 16 + a * 1.3) * 0.5 + 0.5;
  const c = C(WET[0]).lerp(C(WET[1]), band * 0.8).lerp(C(WET[2]), smoothstep(0.5, 0.95, t) * 0.55);
  if (Math.sin(a * 3 + t * 5) > 0.55) c.lerp(C(WET[3]), 0.4);
  c.offsetHSL(0.0, 0, (band - 0.5) * 0.06);
  const foot = hang ? 1 - t : t;                    // 1 at the attached end
  return c.multiplyScalar(0.62 + 0.38 * smoothstep(0.95, 0.1, foot));
};

/** A hanging cone, unit length and radius, origin at the roof, tip at y = -1. */
function stalactiteGeometry() {
  const profile = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                                   // 0 roof .. 1 tip
    const flare = 1 + 0.9 * Math.pow(Math.max(0, 1 - t * 7), 2);
    const r = (Math.pow(1 - t, 0.85) * 0.94 + 0.04 * (1 - t)) * flare;
    profile.push({ y: -t + 0.06 * (i === 0 ? 1 : 0), r: i === N ? 0 : r });
  }
  profile.reverse();
  return lathe(profile, { radial: 12, lump: 0.1, seed: 2.1, color: (t, a) => stoneColor(1 - t, a, true) });
}

/** A rising cone, origin on the floor, tip at y = 1. */
function stalagmiteGeometry() {
  const profile = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const flare = 1 + 0.7 * Math.pow(Math.max(0, 1 - t * 6), 2);
    profile.push({ y: t - (i === 0 ? 0.08 : 0), r: i === N ? 0 : (Math.pow(1 - t, 0.9) * 0.95 + 0.05 * (1 - t)) * flare });
  }
  return lathe(profile, { radial: 12, lump: 0.12, seed: 4.7, color: (t, a) => stoneColor(t, a, false) });
}

/** A column from the floor to the roof: waisted, flared at both ends, with fluted flowstone. */
function columnGeometry(r, h, seed) {
  const profile = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const end = Math.min(t, 1 - t);
    const flare = 1 + 1.15 * Math.pow(Math.max(0, 1 - end * 5.5), 2);
    const waist = 0.82 + 0.18 * Math.cos((t - 0.5) * 7.0 + seed) * Math.cos(t * 3);
    profile.push({ y: (t - 0.0) * h, r: r * waist * flare });
  }
  return lathe(profile, {
    radial: 18, lump: 0.1, seed,
    color: (t, a) => {
      const flute = Math.sin(a * 6 + Math.sin(t * 9) * 1.4) * 0.5 + 0.5;
      const c = C(WET[1]).lerp(C(WET[3]), 0.3 + 0.4 * flute).lerp(C(WET[0]), Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.6);
      c.offsetHSL(0.02 * Math.sin(t * 12), 0, (flute - 0.5) * 0.04);
      return c.multiplyScalar(0.95);
    },
  });
}

// ------------------------------------------------------------------ crystals
/** One hexagonal crystal: prism with a pointed two-step top, base at y=0, height h. */
function crystalPrism(h, r, tilt, yaw, pos) {
  const g = new THREE.CylinderGeometry(r * 0.78, r, h, 6, 1, false);   // y -h/2 .. h/2
  g.translate(0, h / 2, 0);
  // pointed termination: pull the top ring in (a flat-topped hexagonal tip, like real quartz)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > h * 0.99) { p.setX(i, p.getX(i) * 0.18); p.setZ(i, p.getZ(i) * 0.18); p.setY(i, h * 1.18); }
  }
  g.computeVertexNormals();
  const tipC = C('#ffffff'), baseC = C('#6a7a8c');
  const tmp = new THREE.Color();
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / (h * 1.18)));
    tmp.copy(baseC).lerp(tipC, smoothstep(0.1, 1, t));
    col.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return place(g, pos, [tilt[0], yaw, tilt[1]], 1);
}

/** A cluster of 6 prisms of different size, 1 m tall at scale 1. */
function crystalClusterGeometry(seed) {
  const rng = makeRng(seed);
  const parts = [];
  const spec = [[1.0, 0.17, 0, 0, [0, 0]], [0.72, 0.13, 0.5, 0.0, [0.1, 0.15]], [0.6, 0.12, -0.45, 0.1, [-0.12, 0.2]], [0.5, 0.1, 0.1, 0.5, [0.18, -0.15]], [0.42, 0.09, -0.2, -0.45, [-0.2, -0.22]], [0.3, 0.08, 0.35, -0.35, [0.3, 0.3]]];
  for (const [h, r, ox, oz, tilt] of spec) {
    parts.push(crystalPrism(h, r, [tilt[0] + (rng() - 0.5) * 0.25, tilt[1] + (rng() - 0.5) * 0.25], rng() * TAU, [ox * 0.5, 0, oz * 0.5]));
  }
  return merge(parts, 1.05);   // keep the facets crisp (only real corners)
}

// ------------------------------------------------------------------ mushrooms
function mushroomGeometry() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.26, 10, 3);
  stem.translate(0, 0.13, 0);
  parts.push(paint(stem, (v) => C('#cfe8e4').lerp(C('#7aa8a8'), 1 - Math.min(1, v.y / 0.26))));
  const cap = new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI * 0.55);
  cap.scale(0.17, 0.11, 0.17);
  cap.translate(0, 0.25, 0);
  parts.push(paint(cap, (v) => C('#ffffff').lerp(C('#9fd8e8'), 1 - smoothstep(0.25, 0.36, v.y))));
  return merge(parts);
}

// ------------------------------------------------------------------ glow halos
const HALO_VERT = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uFade;
uniform vec2 uRange;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pulse = 0.82 + 0.18 * sin(uTime * (0.7 + aSeed * 0.9) + aSeed * 40.0);
  gl_PointSize = min(aSize * uScale * pulse / max(0.5, -mv.z), 520.0);
  vCol = aColor;
  // (a halo fades out when the camera is right at it: no screen-filling blob clipped by the wall)
  vA = uFade * smoothstep(uRange.y, uRange.x, -mv.z) * smoothstep(1.5, 8.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.2) * 0.9 + pow(max(0.0, 1.0 - d), 8.0) * 0.6;
  gl_FragColor = vec4(vCol * a * vA, a * vA);
}`;

/** One additive Points draw of soft glow discs: halos = [{x,y,z,size,color(THREE.Color),seed}]. */
export function glowPoints(halos, { name = 'glow-halos', scale = 900, range = [40, 120] } = {}) {
  const n = halos.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
  halos.forEach((h, i) => {
    pos.set([h.x, h.y, h.z], i * 3);
    col.set([h.color.r, h.color.g, h.color.b], i * 3);
    size[i] = h.size; seed[i] = h.seed ?? (i * 0.6180339) % 1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: scale }, uFade: { value: 1 }, uRange: { value: new THREE.Vector2(range[0], range[1]) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = name;
  pts.renderOrder = 5;
  return pts;
}

// ------------------------------------------------------------------ build
let cache = null;
function geometries() {
  if (cache) return cache;
  cache = {
    stalactite: stalactiteGeometry(),
    stalagmite: stalagmiteGeometry(),
    crystals: [crystalClusterGeometry(11), crystalClusterGeometry(23), crystalClusterGeometry(37)],
    mushroom: mushroomGeometry(),
  };
  for (const g of [cache.stalactite, cache.stalagmite, cache.mushroom, ...cache.crystals]) { g.userData.sharedResource = true; retainResource(g); }
  return cache;
}
const stoneMat = (() => {
  const m = withCaveSky(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 }), 1);   // (lit by the sky field under the roof)
  retainResource(m);
  return m;
})();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Tint (instance colour) of a stone instance from its hue 0..1: slightly warm or cool, a little lighter or darker. */
function stoneTint(hue, out) {
  const w = hue - 0.5;
  return out.setRGB(0.95 + 0.14 * w, 0.97 + 0.04 * Math.sin(hue * 9), 1.0 - 0.16 * w);
}

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @param {object} layout
 * @param {{roofY:(x:number,z:number)=>number, tier:{decor:number, halos:boolean}}} opts
 */
export function buildCaveDecor(terrain, layout, { roofY, tier }) {
  const group = new THREE.Group();
  group.name = 'cave-decor';
  const spatial = new SpatialInstances(group);
  const geo = geometries();
  const decor = layout.caveDecor;
  const share = tier.decor;                       // 1 = all, lower tiers drop a share of the small things
  const S = layout.plan.seed;
  const keep = (i, f) => ((i * 0.61803398875) % 1) < f;
  const halos = [];
  const stats = { stalactites: 0, stalagmites: 0, columns: 0, crystals: 0, mushrooms: 0 };

  // --- stalactites (hang from the roof; the roof bumps a little, sink their top in)
  {
    const list = decor.stalactites.filter((s, i) => keep(i, share));
    const mesh = new THREE.InstancedMesh(geo.stalactite, stoneMat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((s, i) => {
      const y = roofY(s.x, s.z) + 0.1;
      const len = Math.min(s.len, Math.max(0.5, y - terrain.heightAt(s.x, s.z) - 1.2));
      _q.setFromAxisAngle(UP, s.rot);
      _m.compose(_p.set(s.x, y, s.z), _q, _s.set(s.r * 1.1, len, s.r * 1.1));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, stoneTint(s.hue, _c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = 'stalactites';
    if (list.length) spatial.add(mesh, { geometries: [geo.stalactite] }); else mesh.dispose();
    stats.stalactites = list.length;
  }

  // --- stalagmites
  {
    const list = decor.stalagmites.filter((s, i) => keep(i + 7, share));
    const mesh = new THREE.InstancedMesh(geo.stalagmite, stoneMat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((s, i) => {
      _q.setFromAxisAngle(UP, s.rot);
      _m.compose(_p.set(s.x, terrain.heightAt(s.x, s.z) - 0.05, s.z), _q, _s.set(s.r * 1.2, s.h, s.r * 1.2));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, stoneTint(s.hue, _c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = 'stalagmites';
    if (list.length) spatial.add(mesh, { geometries: [geo.stalagmite] }); else mesh.dispose();
    stats.stalagmites = list.length;
  }

  // --- columns: one lathe each (few), reaching exactly from the floor to the bumpy roof
  const columnGeos = decor.columns.map((c, i) => {
    const floor = terrain.heightAt(c.x, c.z) - 0.3, top = roofY(c.x, c.z) + 0.4;
    const g = columnGeometry(c.r, top - floor, i * 1.3 + 0.5);
    g.translate(c.x, floor, c.z);
    return g;
  });
  if (columnGeos.length) {
    const merged = merge(columnGeos, Math.PI);
    smoothNormals(merged, Math.PI);
    const mesh = new THREE.Mesh(merged, stoneMat);
    mesh.name = 'columns';
    mesh.userData.sharedResource = false;
    group.add(mesh);
    stats.columns = columnGeos.length;
  }

  // --- crystals: glowing clusters (on the floor or leaning out of a wall) + halos
  {
    const mat = glowMaterial(0.95, 0.22);
    const per = geo.crystals.map(() => []);
    decor.crystals.forEach((c, i) => { if (c.big || keep(i + 3, share)) per[i % per.length].push(c); });
    geo.crystals.forEach((g, gi) => {
      const list = per[gi];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((c, i) => {
        const col = glowColor(c.hue, new THREE.Color());
        const y = terrain.heightAt(c.x, c.z);
        if (c.wall) _q.setFromUnitVectors(UP, _p.set(c.nx * 0.85, 0.5, c.nz * 0.85).normalize());
        else _q.setFromEuler(_e.set((i % 3 - 1) * 0.12, c.rot, ((i * 7) % 3 - 1) * 0.12));
        const sc = c.scale * (c.big ? 1.9 : 1.1);
        _m.compose(_p.set(c.x, c.wall ? c.y : y - 0.08, c.z), _q, _s.set(sc, sc, sc));
        mesh.setMatrixAt(i, _m);
        // bright, saturated: the vertex colour (white tip -> blue-grey base) times the hue
        mesh.setColorAt(i, col.clone().multiplyScalar(1.15));
        if (tier.halos) halos.push({ x: c.x, y: (c.wall ? c.y : y) + 0.7 * sc, z: c.z, size: (c.big ? 7 : 3.2) * c.scale, color: col.clone().multiplyScalar(c.big ? 0.8 : 0.5), seed: (i * 0.37 + gi * 0.19) % 1 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.name = 'crystals';
      spatial.add(mesh, { geometries: [g] });
      stats.crystals += list.length;
    });
  }

  // --- mushrooms and algae glow on the banks of the underground water
  {
    const spots = mushroomSpots(terrain, layout, S, share);
    if (spots.length) {
      const mat = glowMaterial(0.8, 0.5);
      const mesh = new THREE.InstancedMesh(geo.mushroom, mat, spots.length);
      spots.forEach((m, i) => {
        _q.setFromAxisAngle(UP, m.rot);
        _m.compose(_p.set(m.x, m.y - 0.02, m.z), _q, _s.set(m.s, m.s * (0.9 + 0.3 * m.t), m.s));
        mesh.setMatrixAt(i, _m);
        const col = m.t > 0.66 ? C('#ff8ad8') : m.t > 0.33 ? C('#6fffd0') : C('#6ac8ff');
        mesh.setColorAt(i, col);
        if (tier.halos && i % 2 === 0) halos.push({ x: m.x, y: m.y + 0.3 * m.s, z: m.z, size: 1.6 * m.s, color: col.clone().multiplyScalar(0.6), seed: (i * 0.29) % 1 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.name = 'mushrooms';
      spatial.add(mesh, { geometries: [geo.mushroom] });
      stats.mushrooms = spots.length;
    }
  }

  spatial.setCullDistance(120);
  const points = halos.length ? glowPoints(halos) : null;
  if (points) group.add(points);
  return {
    group, stats, points,
    update(dt, time, cam) {
      spatial.update(cam);
      if (points) points.material.uniforms.uTime.value = time;
    },
  };
}

/** Deterministic clusters of mushrooms along the dry banks of the cave's water. */
function mushroomSpots(terrain, layout, seed, share) {
  const rng = makeRng(seed ^ 0x77a1);
  const out = [];
  const n = terrain.n, cell = terrain.cell, half = terrain.half;
  const limit = Math.round(90 * share);
  for (let j = 2; j < n - 2 && out.length < limit; j += 1) {
    for (let i = 2; i < n - 2 && out.length < limit; i += 1) {
      const x = -half + i * cell, z = -half + j * cell;
      if (terrain.ceilingAt(x, z) === Infinity) continue;
      const w = terrain.waterLevelAt(x, z);
      const hh = terrain.h(i, j);
      if (w !== null) continue;
      // dry cell next to water, low above it
      let near = null;
      for (const [ox, oz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) {
        const wl = terrain.waterLevelAt(x + ox, z + oz);
        if (wl !== null) { near = wl; break; }
      }
      if (near === null || hh - near > 1.4 || hh - near < 0) continue;
      if (rng() > 0.2) continue;
      const k = 3 + Math.floor(rng() * 4);
      for (let m = 0; m < k; m++) {
        const mx = x + (rng() - 0.5) * 3.2, mz = z + (rng() - 0.5) * 3.2;
        const wl = terrain.waterLevelAt(mx, mz);
        const my = terrain.heightAt(mx, mz);
        if (wl !== null && my < wl + 0.05) continue;
        if (terrain.slopeAt?.(mx, mz) > 0.9) continue;
        out.push({ x: mx, y: my, z: mz, s: 0.8 + rng() * 1.7, rot: rng() * TAU, t: rng() });
      }
    }
  }
  return out;
}

export { fbm };
