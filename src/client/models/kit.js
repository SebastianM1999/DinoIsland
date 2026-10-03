import { retainResource } from '../core/resources.js';
// Model kit: small helpers for building soft, rounded models in code.
//
// Workflow: start from a primitive geometry, shape it with deform(), paint
// color zones with paint(), place it with place(), then merge() all parts of
// one rigid piece into a single geometry that uses the shared smooth-shaded
// vertex-color material. merge() welds normals across faces (up to a crease
// angle), so curved shapes render smooth while real corners stay crisp.
// No textures.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Shared materials. Everything uses vertex colors + smooth shading. */
export const MAT = {
  standard: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
  glossy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }),
  /** Unlit-ish glow for fruit, fire, eye highlights. */
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.35 }),
};

for (const material of Object.values(MAT)) retainResource(material);

/** Default crease angle: faces meeting at a sharper angle keep a hard edge. */
export const CREASE = (72 * Math.PI) / 180;

/**
 * Smooth vertex normals for a (non-indexed) geometry: each vertex gets the
 * area-weighted average of the face normals sharing its position, skipping
 * faces that meet at more than `crease` radians (box corners stay sharp).
 */
export function smoothNormals(geo, crease = CREASE) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const n = p.count;
  const faces = n / 3;
  const fn = new Float32Array(faces * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
  const keys = new Array(n);
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    keys[i] = `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
  }
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
    e1.subVectors(b, a); e2.subVectors(c, a);
    cr.crossVectors(e1, e2);                     // length = 2 * area -> area weighting
    fn[f * 3] = cr.x; fn[f * 3 + 1] = cr.y; fn[f * 3 + 2] = cr.z;
    for (let k = 0; k < 3; k++) {
      const id = keys[f * 3 + k];
      let list = buckets.get(id);
      if (!list) { list = []; buckets.set(id, list); }
      list.push(f);
    }
  }
  const cosC = Math.cos(crease);
  const out = new Float32Array(n * 3);
  const own = new THREE.Vector3(), other = new THREE.Vector3(), sum = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const f = (i / 3) | 0;
    own.set(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]);
    const ol = own.length() || 1;
    sum.set(0, 0, 0);
    for (const f2 of buckets.get(keys[i])) {
      other.set(fn[f2 * 3], fn[f2 * 3 + 1], fn[f2 * 3 + 2]);
      const len = other.length();
      if (len < 1e-12) continue;
      if (own.dot(other) / (ol * len) >= cosC) sum.add(other);
    }
    if (sum.lengthSq() < 1e-20) sum.copy(own);
    sum.normalize();
    out[i * 3] = sum.x; out[i * 3 + 1] = sum.y; out[i * 3 + 2] = sum.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/** Shared wind uniforms – Game updates time every frame. */
export const WIND = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
};

/**
 * Make a material sway in the wind. Vertices sway proportionally to their
 * local height above `pivotY` (so trunks stay planted). Works with
 * InstancedMesh (uses the instance position as phase offset).
 */
export function windMaterial(base, { strength = 0.08, pivotY = 0, frequency = 1.6, heightScale = 0.25 } = {}) {
  const mat = base.clone();
  // clone() drops per-instance hooks: keep the base's own shader patch (e.g. surface detail)
  const own = (k) => (Object.prototype.hasOwnProperty.call(base, k) ? base[k] : null);
  const prev = own('onBeforeCompile'), prevKey = own('customProgramCacheKey');
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uTime = WIND.uTime;
    shader.uniforms.uWindDir = WIND.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec2 uWindDir;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wpos = vec3(0.0);
          #ifdef USE_INSTANCING
            wpos = instanceMatrix[3].xyz;
          #endif
          wpos += (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float h = max(0.0, position.y - ${pivotY.toFixed(3)}) * ${heightScale.toFixed(3)};
          float ph = dot(wpos.xz, vec2(0.13, 0.17)) + position.y * 0.3;
          float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wpos.x * 0.02);
          float sway = (sin(uTime * ${frequency.toFixed(3)} + ph) * 0.7 + sin(uTime * ${(frequency * 2.3).toFixed(3)} + ph * 1.7) * 0.3) * gust;
          transformed.xz += uWindDir * sway * h * h * ${strength.toFixed(4)} * 10.0;
        }`);
  };
  mat.customProgramCacheKey = () => `wind-${strength}-${pivotY}-${frequency}-${heightScale}|${prevKey ? prevKey.call(base) : ''}`;
  return mat;
}

/** Ensure geometry is non-indexed with position/normal/color only. */
export function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  }
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return g;
}

/**
 * Move vertices. fn(v: Vector3, i) mutates v in place (local space).
 * Returns a non-indexed geometry with recomputed flat normals.
 */
export function deform(geo, fn) {
  const g = prep(geo);
  const p = g.attributes.position;
  // Deform per unique position so shared corners stay welded.
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let out = cache.get(key);
    if (!out) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i));
      fn(_v, i);
      out = [_v.x, _v.y, _v.z];
      cache.set(key, out);
    }
    p.setXYZ(i, out[0], out[1], out[2]);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * Paint vertex colors. `color` is a hex/Color, or fn(pos, normal, faceCenter) -> hex|Color.
 * Function colors are evaluated per vertex so adjacent faces share a blended
 * color, while their normals remain faceted. Solid colors stay solid.
 */
export function paint(geo, color) {
  const g = prep(geo);
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = g.attributes.color;
  const fnMode = typeof color === 'function';
  if (!fnMode) _c.set(color);
  const center = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    if (fnMode) {
      center.set(p.getX(i), p.getY(i), p.getZ(i));
      _n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      _c.set(color(center, _n, center));
    }
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
  return g;
}

/** Apply position [x,y,z], rotation [x,y,z] (radians, XYZ) and scale (number or [x,y,z]). */
export function place(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const g = prep(geo);
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Shorthand: paint + place. */
export function part(geo, color, pos, rot, scale) {
  return place(paint(geo, color), pos, rot, scale);
}

/** Merge prepared geometries into one, with smooth (creased) normals. */
export function merge(geos, crease = CREASE) {
  const list = geos.filter(Boolean).map(prep);
  const g = smoothNormals(mergeGeometries(list, false), crease);
  g.computeBoundingSphere();
  return g;
}

/** Mesh with the shared material, casting + receiving shadows. */
export function mesh(geo, mat = MAT.standard, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Deterministic jitter for organic shapes: returns a small offset for a vertex. */
export function jitter(v, amount, seed = 1) {
  const s = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed * 11.13) * 43758.5453;
  return ((s - Math.floor(s)) - 0.5) * 2 * amount;
}

/**
 * Low-poly faceted rock: a jittered icosahedron, flattened a bit,
 * optionally with mossy green on the upward facing faces.
 */
export function rockGeometry({ radius = 1, detail = 0, seed = 1, squash = 0.7, colors = ['#9c93a8', '#8a8199', '#a79c9a'], moss = null } = {}) {
  let g = new THREE.IcosahedronGeometry(radius, detail + 2);
  g = deform(g, (v) => {
    // smooth, pebble-like lumps: low-frequency offsets instead of per-vertex spikes
    const dx = v.x / radius, dy = v.y / radius, dz = v.z / radius;
    const bump = Math.sin(dx * 2.1 + seed) * Math.cos(dz * 1.7 - seed * 0.7) * 0.12 + Math.sin(dy * 3.1 + dx * 1.3 + seed * 2.3) * 0.06;
    v.multiplyScalar(1 + bump);
    v.y *= squash;
    if (v.y < -radius * 0.15) v.y = -radius * 0.15 - (v.y + radius * 0.15) * 0.2; // flat bottom sinks in
  });
  g = smoothNormals(g);
  const c0 = new THREE.Color(colors[0]), c1 = new THREE.Color(colors[1 % colors.length]), c2 = new THREE.Color(colors[2 % colors.length]);
  const mc = moss ? new THREE.Color(moss) : null, tmp = new THREE.Color();
  return paint(g, (c, n) => {
    const t = Math.sin((c.x * 3.1) / radius + seed) * 0.5 + Math.cos((c.z * 2.7) / radius - seed) * 0.5;
    tmp.copy(c0).lerp(c1, Math.max(0, t)).lerp(c2, Math.max(0, -t) * 0.7);
    if (mc) tmp.lerp(mc, Math.max(0, Math.min(1, (n.y - 0.55) / 0.3)));
    return tmp;
  });
}

/**
 * Tube along a path with a radius profile – the workhorse for creature bodies,
 * necks, tails and limbs.
 * @param {THREE.Vector3[]} points path (at least 2)
 * @param {(t:number)=>number|[number,number]} radius radius (or [rx, ry]) at t in [0,1]
 * @param {{radial?:number, color?:(t:number, angle:number, pos:THREE.Vector3)=>any, capStart?:boolean, capEnd?:boolean, up?:THREE.Vector3, smoothColors?:boolean}} opts
 *   angle: 0 = top (+up), PI = bottom. Use it for countershading.
 */
export function tube(points, radius, { radial = 10, color = () => '#ffffff', capStart = true, capEnd = true, up = new THREE.Vector3(0, 1, 0), smoothColors = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = Math.max(4, (points.length - 1) * 5);
  radial = Math.max(8, Math.round(radial * 1.6));
  const rings = [];
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3();
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    upv.crossVectors(side, tangent).normalize();
    let r = radius(t);
    const rx = Array.isArray(r) ? r[0] : r, ry = Array.isArray(r) ? r[1] : r;
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const p = c.clone()
        .addScaledVector(upv, Math.cos(a) * ry)
        .addScaledVector(side, Math.sin(a) * rx);
      ring.push({ p, a, t });
    }
    rings.push({ ring, c: c.clone(), t });
  }
  const pos = [];
  const cols = [];
  const pushTri = (A, B, C, ca, cb = ca, cc = ca) => {
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
    for (const c of [ca, cb, cc]) cols.push(c.r, c.g, c.b);
  };
  const colAt = (t, a, p) => _c.set(color(t, a, p)).clone();
  for (let s = 0; s < segs; s++) {
    const r0 = rings[s].ring, r1 = rings[s + 1].ring;
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      const a = r0[k].p, b = r0[k2].p, c = r1[k].p, d = r1[k2].p;
      // counter-clockwise seen from outside -> outward normals
      if (smoothColors) {
        const ca = colAt(rings[s].t, r0[k].a, a);
        const cb = colAt(rings[s].t, r0[k2].a, b);
        const cc = colAt(rings[s + 1].t, r1[k].a, c);
        const cd = colAt(rings[s + 1].t, r1[k2].a, d);
        pushTri(a, b, c, ca, cb, cc);
        pushTri(b, d, c, cb, cd, cc);
      } else {
        const tm = (rings[s].t + rings[s + 1].t) / 2;
        const am = (r0[k].a + (k2 === 0 ? Math.PI * 2 : r0[k2].a)) / 2;
        const colr = colAt(tm, am, a.clone().add(d).multiplyScalar(0.5));
        pushTri(a, b, c, colr);
        pushTri(b, d, c, colr);
      }
    }
  }
  const cap = (rg, reverse) => {
    const center = rg.c;
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      const colr = colAt(rg.t, Math.PI, center);
      if (reverse) pushTri(center, rg.ring[k].p, rg.ring[k2].p, colr);
      else pushTri(center, rg.ring[k2].p, rg.ring[k].p, colr);
    }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[rings.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return smoothNormals(g);
}

/** A small ellipsoid (shaped sphere) – eyes, cheeks, bumps, fruit. */
export function blob(rx, ry, rz, color, { w = 8, h = 6 } = {}) {
  const g = new THREE.SphereGeometry(1, Math.max(12, Math.round(w * 1.75)), Math.max(8, Math.round(h * 1.6)));
  g.scale(rx, ry, rz);
  return paint(g, color);
}

/** Cone pointing +Y (claws, teeth, spikes), base at y=0. `tip` colors the top half. */
export function spike(radius, height, color, tip = null, radial = 5) {
  const g = new THREE.ConeGeometry(radius, height, Math.max(8, radial * 2), 2);
  g.translate(0, height / 2, 0);
  return paint(g, tip ? (c) => (c.y > height * 0.55 ? tip : color) : color);
}

/** Tapered cylinder along +Y from y=0 to y=height. */
export function limb(r0, r1, height, color, radial = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, height, Math.max(12, radial * 2), 1);
  g.translate(0, height / 2, 0);
  return paint(g, color);
}

/** Eye: white ball + colored iris + dark pupil + tiny highlight, looking +Z. */
export function eye(size, iris = '#3a2a1a', { pupil = '#141018', highlight = true } = {}) {
  const parts = [
    blob(size, size, size * 0.8, '#fbf7ee', { w: 8, h: 6 }),
    place(blob(size * 0.62, size * 0.62, size * 0.3, iris, { w: 8, h: 5 }), [0, 0, size * 0.62]),
    place(blob(size * 0.34, size * 0.4, size * 0.2, pupil, { w: 6, h: 4 }), [0, 0, size * 0.8]),
  ];
  if (highlight) parts.push(place(blob(size * 0.14, size * 0.14, size * 0.08, '#ffffff', { w: 5, h: 3 }), [size * 0.2, size * 0.24, size * 0.9]));
  return merge(parts);
}

/** Wrap / lashing band around a Y axis (spear grips, bow grips, stake ropes). */
export function wrap(radius, height, turns, color) {
  const parts = [];
  for (let i = 0; i < turns; i++) {
    const g = new THREE.TorusGeometry(radius, radius * 0.28, 8, 16);
    parts.push(part(g, color, [0, (i / Math.max(1, turns - 1)) * height, 0], [Math.PI / 2 + (i % 2 ? 0.25 : -0.25), 0, 0]));
  }
  return merge(parts);
}

export { THREE };
