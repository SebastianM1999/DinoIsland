// Shared shape + material helpers for vegetation, rocks and fruit plants.
// Everything builds on the model kit (vertex colors, smooth shading, no textures).

import { THREE, MAT, deform, paint, jitter, windMaterial, smoothNormals } from '../../models/kit.js';
import { noise3 } from '../../models/props/common.js';

const _col = new THREE.Color();

/**
 * Foliage clump: a softly lumped, squashed icosphere with a flattened
 * underside. Color zones: light top, mid sides (two shades), dark underside.
 */
export function clump(r, {
  seed = 1, detail = 1, squash = 0.8, rough = 0.2, flatBottom = 0.45, maxDetail = 4,
  top = '#8fd14f', mid = '#6cb83e', mid2 = '#62ad3a', bottom = '#4a8f33',
} = {}) {
  // enough subdivisions that even big canopy masses keep a round silhouette
  const sub = Math.min(maxDetail, Math.max(detail, r > 2.4 ? 4 : r > 1.0 ? 3 : r > 0.45 ? 2 : 1));
  let g = new THREE.IcosahedronGeometry(r, sub);
  g = deform(g, (v) => {
    // smooth low-frequency lumps: soft leafy bulges, no per-vertex noise
    const lump = noise3(v.x / r * 1.4 + seed * 1.7, v.y / r * 1.4, v.z / r * 1.4 - seed, seed)
      + 0.45 * Math.sin((v.x * 2.3 + v.z * 1.7) / r + seed) * Math.cos((v.y * 2.9 - v.x) / r + seed * 0.7);
    v.multiplyScalar(1 + rough * 1.2 * lump);
    v.y *= squash;
    const fb = -r * squash * flatBottom;
    if (v.y < fb) v.y = fb + (v.y - fb) * 0.3;
  });
  g = smoothNormals(g, Math.PI);
  const low = new THREE.Color(bottom), lower = new THREE.Color(mid2);
  const upper = new THREE.Color(mid), high = new THREE.Color(top);
  const out = new THREE.Color();
  return paint(g, (v) => {
    const h = Math.max(0, Math.min(1, (v.y / (r * squash) + 1) * 0.5));
    const noise = jitter(v, 0.035, seed + 7);
    const blotch = noise3(v.x / r * 2.2, v.y / r * 2.2, v.z / r * 2.2, seed + 13);
    const t = Math.max(0, Math.min(1, h + noise + blotch * 0.12));
    if (t < 0.32) out.copy(low).lerp(lower, t / 0.32);
    else if (t < 0.67) out.copy(lower).lerp(upper, (t - 0.32) / 0.35);
    else out.copy(upper).lerp(high, (t - 0.67) / 0.33);
    return out.multiplyScalar(0.96 + 0.08 * blotch);
  });
}

/**
 * Leaf strip along a path (palm fronds, fern fronds, big leaves).
 * Cross-section is an inverted V (center ridge up, edges drooping); edges
 * alternate width for a serrated leaflet silhouette.
 * @param {THREE.Vector3[]} pts path points
 * @param {(t:number)=>number} width half-width at t
 * @param {{side:THREE.Vector3, ridge?:number, serrate?:number, color?:(t:number, half:number)=>any}} opts
 */
export function leafStrip(pts, width, { side, ridge = 0.3, serrate = 0.35, color = (t, h) => (h ? '#5bb035' : '#3f8f2c') }) {
  const n = pts.length;
  const L = [], R = [], M = [];
  const tan = new THREE.Vector3(), up = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (i < n - 1) tan.subVectors(pts[i + 1], pts[i]); else tan.subVectors(pts[i], pts[i - 1]);
    tan.normalize();
    up.crossVectors(side, tan).normalize();
    let w = width(t);
    if (i > 0 && i < n - 1 && i % 2 === 0) w *= 1 - serrate;
    const p = pts[i];
    M.push(p.clone().addScaledVector(up, ridge * w * 0.35));
    L.push(p.clone().addScaledVector(side, -w).addScaledVector(up, -ridge * w));
    R.push(p.clone().addScaledVector(side, w).addScaledVector(up, -ridge * w));
  }
  const pos = [], col = [];
  const tri = (a, b, c, ca, cb, cc) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (const shade of [ca, cb, cc]) {
      _col.set(shade);
      col.push(_col.r, _col.g, _col.b);
    }
  };
  for (let i = 0; i < n - 1; i++) {
    const t0 = i / (n - 1), t1 = (i + 1) / (n - 1);
    const l0 = new THREE.Color(color(t0, 0)), l1 = new THREE.Color(color(t1, 0));
    const r0 = new THREE.Color(color(t0, 1)), r1 = new THREE.Color(color(t1, 1));
    const m0 = l0.clone().lerp(r0, 0.5), m1 = l1.clone().lerp(r1, 0.5);
    tri(M[i], L[i], L[i + 1], m0, l0, l1);
    tri(M[i], L[i + 1], M[i + 1], m0, l1, m1);
    tri(M[i], R[i + 1], R[i], m0, r1, r0);
    tri(M[i], M[i + 1], R[i + 1], m0, m1, r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Points along an arching path: starts at `from`, heads out along (dirX,dirZ). */
export function arcPath(from, dirX, dirZ, length, rise, droop, segs = 7) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const d = length * t;
    pts.push(new THREE.Vector3(from.x + dirX * d, from.y + length * (rise * t - droop * t * t), from.z + dirZ * d));
  }
  return pts;
}

/** Materials (cached so identical settings share one shader program). */
const matCache = new Map();
export function sharedMat(key, make) {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}

/** Base material for thin leaves (double sided). */
export const LEAF_MAT = MAT.standard.clone();
LEAF_MAT.side = THREE.DoubleSide;

/** Wind material + matching shadow depth material so shadows sway too. */
export function windPair(base, params) {
  const key = `wind:${base.uuid}:${JSON.stringify(params)}`;
  return sharedMat(key, () => {
    const mat = windMaterial(base, params);
    const depthBase = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const depth = windMaterial(depthBase, params);
    return { mat, depth };
  });
}

/**
 * Glowing material whose emissive color follows the vertex (and instance)
 * color, so fruit glows in its own hue instead of washing out to white.
 */
export function glowMaterial(intensity = 0.45, roughness = 0.35) {
  return sharedMat(`glow:${intensity}:${roughness}`, () => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: intensity,
    });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;',
      );
    };
    m.customProgramCacheKey = () => 'vcolor-glow';
    return m;
  });
}

/** InstancedMesh helper. */
export function instanced(geo, mat, count, { cast = true, receive = true, depth = null, name = '' } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.count = count;
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (depth) m.customDepthMaterial = depth;
  m.name = name;
  return m;
}

/** Finish an InstancedMesh after all matrices/colors are written. */
export function finishInstanced(m) {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  m.computeBoundingBox?.();
  return m;
}

/** Soft tint (multiplied onto vertex colors) from a 0..1 hue value. */
export function foliageTint(hue, out = new THREE.Color()) {
  // 0 -> blue-green/dark, 0.5 -> neutral, 1 -> warm yellow-green; a few trees get
  // a stronger autumn-ish or teal accent so the canopy is never one flat green
  const t = hue;
  let r = 0.8 + 0.26 * t;
  let g = 0.9 + 0.1 * Math.sin(t * Math.PI);
  let b = 0.98 - 0.3 * t;
  const accent = (t * 7.31) % 1;
  if (accent > 0.9) { r *= 1.12; g *= 0.97; b *= 0.8; }         // sunlit yellow-green
  else if (accent < 0.08) { r *= 0.85; g *= 0.98; b *= 1.1; }  // cool teal
  return out.setRGB(Math.min(1, r), Math.min(1, g), Math.max(0.55, Math.min(1, b)));
}

export { THREE };
