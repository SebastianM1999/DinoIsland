import { retainResource } from '../../core/resources.js';
// Shared helpers for the site props (boat, relics, cave, ruins, nest, volcano):
// smooth 3D noise, soft-beveled blocks, an SDF -> smooth mesh mesher (surface
// nets, used for the cave), orienting parts along a direction, per-grid cloth
// normals and a few cached materials. Builds on the model kit.

import * as THREE from 'three';
import { MAT, prep, paint } from '../kit.js';

export const TAU = Math.PI * 2;
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ noise
function hash3(x, y, z, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth 3D value noise in [-1, 1]. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  ) * 2 - 1;
}

/** Two-octave smooth noise, roughly [-1, 1]. */
export function fbm3(x, y, z, seed = 0) {
  return noise3(x, y, z, seed) * 0.68 + noise3(x * 2.03 + 5.2, y * 2.03, z * 2.03 - 1.7, seed + 7) * 0.32;
}

// ------------------------------------------------------------ materials
const mats = new Map();
const cachedMat = (key, make) => {
  let m = mats.get(key);
  if (!m) { m = make(); mats.set(key, m); }
  return retainResource(m);
};

/**
 * Vertex-colored material whose emissive glow follows the vertex color
 * (gold glints gold, crystals glow cyan). Cached per setting.
 */
export function tintGlow(intensity = 0.4, roughness = 0.35, metalness = 0) {
  return cachedMat(`tint:${intensity}:${roughness}:${metalness}`, () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, emissive: 0xffffff, emissiveIntensity: intensity });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;',
      );
    };
    m.customProgramCacheKey = () => 'props-vcolor-glow';
    return retainResource(m);
  });
}

/** Double-sided version of a kit material (cloth, leaves, thin shells). */
export function doubleSided(base = MAT.standard) {
  return cachedMat(`ds:${base.uuid}`, () => {
    const m = base.clone();
    m.side = THREE.DoubleSide;
    return retainResource(m);
  });
}

// --------------------------------------------------------------- shapes
/**
 * Box with softly rounded edges (a bevel of radius r). Origin at the center.
 * warp(v) may bend the result (weathered stone). Color: hex or paint() fn.
 * thin = true builds a cheaper version for flat slabs (60 instead of 108
 * tris): the vertical edges stay rounded, top/bottom edges get one chamfer.
 */
export function roundedBox(w, h, d, r, color, warp = null, thin = false) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.min(r, hx * 0.95, hy * 0.95, hz * 0.95);
  const g = prep(new THREE.BoxGeometry(2, 2, 2, 3, thin ? 1 : 3, 3));
  const p = g.attributes.position;
  const map = (c, half) => {
    const a = Math.abs(c);
    const m = a > 0.99 ? half : a > 0.3 ? half - r : 0;
    return Math.sign(c) * m;
  };
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(map(p.getX(i), hx), map(p.getY(i), hy), map(p.getZ(i), hz));
    inner.set(
      Math.max(-(hx - r), Math.min(hx - r, v.x)),
      Math.max(-(hy - r), Math.min(hy - r, v.y)),
      Math.max(-(hz - r), Math.min(hz - r, v.z)),
    );
    v.sub(inner);
    if (v.lengthSq() > 1e-12) v.setLength(r);
    v.add(inner);
    if (warp) warp(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return paint(g, color);
}

const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
/**
 * Point a part built along +Y at `dir` (and spin it around that axis), then
 * move it to `pos`. scale: number or [x, y, z] applied before turning.
 */
export function orient(geo, pos, dir, scale = 1, spin = 0) {
  const g = prep(geo);
  if (spin) g.rotateY(spin);
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_up, _d);
  if (typeof scale === 'number') _s.setScalar(scale); else _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Move a geometry so it rests on y=0 and is centered in x/z. */
export function groundIt(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------- SDF mesher
/**
 * Smooth mesh of the solid where sdf(x, y, z) < 0 (naive surface nets).
 * Vertices are projected onto the surface and get normals from the SDF
 * gradient, so the result is perfectly smooth. color(p, n) -> hex|Color.
 * Returns an indexed BufferGeometry with position/normal/color.
 */
export function sdfMesh(sdf, { min, max, step, color }) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    val[id(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  }
  const cx = nx - 1, cy = ny - 1;
  const cellId = (i, j, k) => i + cx * (j + cy * k);
  const cell = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const eps = step * 0.2;
  const grad = (x, y, z, out) => out.set(
    sdf(x + eps, y, z) - sdf(x - eps, y, z),
    sdf(x, y + eps, z) - sdf(x, y - eps, z),
    sdf(x, y, z + eps) - sdf(x, y, z - eps),
  );
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  const g = new THREE.Vector3();
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) {
      cv[c] = val[id(i + C[c][0], j + C[c][1], k + C[c][2])];
      if (cv[c] < 0) neg++;
    }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t;
      sy += C[a][1] + (C[b][1] - C[a][1]) * t;
      sz += C[a][2] + (C[b][2] - C[a][2]) * t;
      n++;
    }
    let x = min[0] + (i + sx / n) * step, y = min[1] + (j + sy / n) * step, z = min[2] + (k + sz / n) * step;
    // one Newton step onto the surface
    const d = sdf(x, y, z);
    grad(x, y, z, g);
    const gl = g.lengthSq();
    if (gl > 1e-12) {
      const f = (d * 2 * eps) / gl;
      const mx = Math.max(-step * 0.5, Math.min(step * 0.5, g.x * f));
      const my = Math.max(-step * 0.5, Math.min(step * 0.5, g.y * f));
      const mz = Math.max(-step * 0.5, Math.min(step * 0.5, g.z * f));
      x -= mx; y -= my; z -= mz;
    }
    cell[cellId(i, j, k)] = pos.length / 3;
    pos.push(x, y, z);
  }
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    grad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], g).normalize();
    nrm[v * 3] = g.x; nrm[v * 3 + 1] = g.y; nrm[v * 3 + 2] = g.z;
  }
  const index = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    for (const [p0, p1, p2] of [[a, b, c], [a, c, d]]) {
      // wind so the face normal agrees with the SDF gradient
      const ax = pos[p1 * 3] - pos[p0 * 3], ay = pos[p1 * 3 + 1] - pos[p0 * 3 + 1], az = pos[p1 * 3 + 2] - pos[p0 * 3 + 2];
      const bx = pos[p2 * 3] - pos[p0 * 3], by = pos[p2 * 3 + 1] - pos[p0 * 3 + 1], bz = pos[p2 * 3 + 2] - pos[p0 * 3 + 2];
      const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
      const dot = fx * (nrm[p0 * 3] + nrm[p1 * 3] + nrm[p2 * 3]) + fy * (nrm[p0 * 3 + 1] + nrm[p1 * 3 + 1] + nrm[p2 * 3 + 1]) + fz * (nrm[p0 * 3 + 2] + nrm[p1 * 3 + 2] + nrm[p2 * 3 + 2]);
      if (dot >= 0) index.push(p0, p1, p2); else index.push(p0, p2, p1);
    }
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if ((val[id(i, j, k)] < 0) !== (val[id(i + 1, j, k)] < 0)) {
      quad(cell[cellId(i, j - 1, k - 1)], cell[cellId(i, j, k - 1)], cell[cellId(i, j, k)], cell[cellId(i, j - 1, k)]);
    }
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    if ((val[id(i, j, k)] < 0) !== (val[id(i, j + 1, k)] < 0)) {
      quad(cell[cellId(i - 1, j, k - 1)], cell[cellId(i, j, k - 1)], cell[cellId(i, j, k)], cell[cellId(i - 1, j, k)]);
    }
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    if ((val[id(i, j, k)] < 0) !== (val[id(i, j, k + 1)] < 0)) {
      quad(cell[cellId(i - 1, j - 1, k)], cell[cellId(i, j - 1, k)], cell[cellId(i, j, k)], cell[cellId(i - 1, j, k)]);
    }
  }
  const col = new Float32Array(count * 3);
  const c3 = new THREE.Color(), p3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  for (let v = 0; v < count; v++) {
    p3.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    n3.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
    c3.set(color(p3, n3));
    col[v * 3] = c3.r; col[v * 3 + 1] = c3.g; col[v * 3 + 2] = c3.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** First point where a ray (origin o, unit dir d) enters the solid, or null. */
export function sdfRay(sdf, o, d, maxDist = 30, step = 0.15) {
  let prev = sdf(o[0], o[1], o[2]);
  if (prev < 0) return null;
  for (let t = step; t <= maxDist; t += step) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    const v = sdf(x, y, z);
    if (v < 0) {
      const k = prev / (prev - v);
      const tt = t - step + step * k;
      return [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt];
    }
    prev = v;
  }
  return null;
}

// ---------------------------------------------------------- cloth grids
/**
 * Smooth normals for an indexed PlaneGeometry-style grid (cols+1 x rows+1
 * vertices, row-major) from central differences. No allocations.
 */
export function gridNormals(pos, nrm, cols, rows) {
  const a = pos.array, n = nrm.array;
  const w = cols + 1;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(cols, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(rows, j + 1);
      const A = (j * w + i1) * 3, B = (j * w + i0) * 3, Cc = (j0 * w + i) * 3, D = (j1 * w + i) * 3;
      const ux = a[A] - a[B], uy = a[A + 1] - a[B + 1], uz = a[A + 2] - a[B + 2];
      const vx = a[Cc] - a[D], vy = a[Cc + 1] - a[D + 1], vz = a[Cc + 2] - a[D + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const o = (j * w + i) * 3;
      n[o] = nx / l; n[o + 1] = ny / l; n[o + 2] = nz / l;
    }
  }
  nrm.needsUpdate = true;
}

/** Soft additive material for light beams, glows and sparks. */
export function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  });
}

export { THREE };
