// Shared shape + material helpers for vegetation, rocks and fruit plants.
// Everything builds on the model kit (vertex colors, flat shading, no textures).

import { THREE, MAT, deform, paint, jitter, windMaterial } from '../../models/kit.js';

const _col = new THREE.Color();

/**
 * Faceted foliage clump: a jittered, squashed icosahedron with a flattened
 * underside. Color zones: light top, mid sides (two shades), dark underside.
 */
export function clump(r, {
  seed = 1, detail = 1, squash = 0.8, rough = 0.2, flatBottom = 0.45,
  top = '#8fd14f', mid = '#6cb83e', mid2 = '#62ad3a', bottom = '#4a8f33',
} = {}) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g = deform(g, (v) => {
    const ox = jitter(v, r * rough, seed), oy = jitter(v, r * rough, seed + 1), oz = jitter(v, r * rough, seed + 2);
    v.x += ox; v.y += oy; v.z += oz;
    v.y *= squash;
    const fb = -r * squash * flatBottom;
    if (v.y < fb) v.y = fb + (v.y - fb) * 0.3;
  });
  return paint(g, (c, n) => {
    if (n.y > 0.5) return top;
    if (n.y < -0.35) return bottom;
    if (n.y > 0.1) return jitter(c, 1, seed + 7) > -0.2 ? mid : top;
    return jitter(c, 1, seed + 9) > 0 ? mid : mid2;
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
  const tri = (a, b, c, hex) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    _col.set(hex);
    for (let k = 0; k < 3; k++) col.push(_col.r, _col.g, _col.b);
  };
  for (let i = 0; i < n - 1; i++) {
    const t = (i + 0.5) / (n - 1);
    const cl = color(t, 0), cr = color(t, 1);
    tri(M[i], L[i], L[i + 1], cl);
    tri(M[i], L[i + 1], M[i + 1], cl);
    tri(M[i], R[i + 1], R[i], cr);
    tri(M[i], M[i + 1], R[i + 1], cr);
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
      vertexColors: true, flatShading: true, roughness, metalness: 0,
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
  // 0 -> slightly blue-green/dark, 0.5 -> neutral, 1 -> warm yellow-green
  const t = hue;
  const r = 0.86 + 0.16 * t;
  const g = 0.93 + 0.07 * Math.sin(t * Math.PI);
  const b = 0.95 - 0.2 * t;
  return out.setRGB(Math.min(1, r), Math.min(1, g), Math.max(0.6, b));
}

export { THREE };
