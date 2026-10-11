import { retainResource } from '../../core/resources.js';
// Map resource models (config.js loot: resin, ironwood, herb): built once per kind and
// shared by the spots on the island (world/resourceNodes.js) and by dropped items
// (entities/items.js). Each kind has its own softly glowing material, so it stands
// out a little among the plants; resourceMaterial(kind).emissiveIntensity pulses.

import { THREE, deform, paint, place, merge, blob, tube } from '../kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const geoCache = new Map();
const matCache = new Map();
const cached = (cache, k, fn) => retainResource(cache.has(k) ? cache.get(k) : (cache.set(k, fn()), cache.get(k)));

/** Resting glow per kind (resourceMaterial pulses around it). */
export const RESOURCE_GLOW = { resin: 0.45, ironwood: 0.12, herb: 0.14 };
const EMISSIVE = { resin: '#ff8a10', ironwood: '#5a3a20', herb: '#2fd06a' };

/** Small pointed leaf along +X from the origin (light top, darker underside). */
function leaf(len, width, top, bottom) {
  let g = new THREE.SphereGeometry(1, 6, 4);
  g = deform(g, (v) => {
    const t = (v.x + 1) / 2;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * width;
    v.set(t * len, v.y * width * 0.2 + Math.sin(t * Math.PI) * width * 0.35, v.z * w);
  });
  return paint(g, (c, n) => (n.y > 0 ? top : bottom));
}

/**
 * Resin: a fat amber drop with two smaller runs below it, on the bark. Local frame:
 * the bark is the plane z = 0, the drops bulge out along +Z; y is up.
 */
function resinGeometry() {
  const amber = (c) => (c.y > 0.05 ? '#ffd166' : c.y > -0.08 ? '#f5a524' : '#d9770f');
  const drop = (rx, ry, x, y) => place(deform(blob(rx, ry, rx * 0.7, amber, { w: 7, h: 6 }), (v) => {
    if (v.y < 0) v.y *= 1.5;                         // a teardrop: running down the bark
  }), [x, y, rx * 0.45]);
  return merge([
    drop(0.1, 0.12, 0, 0.02),
    drop(0.055, 0.07, -0.07, -0.2),
    drop(0.045, 0.06, 0.06, -0.26),
    drop(0.035, 0.045, 0.02, 0.17),
  ]);
}

/** Ironwood: a heavy, gnarled near-black branch lying on the ground (along X), a stub on one side. */
function ironwoodGeometry() {
  const bark = (t, a) => ((Math.floor(t * 14) + Math.floor(a * 2)) % 3 === 0 ? '#3b2e26' : '#241c18');
  const log = tube([V(-0.55, 0.09, 0.02), V(-0.2, 0.11, -0.05), V(0.18, 0.1, 0.04), V(0.55, 0.08, -0.02)],
    (t) => 0.1 - 0.025 * t, { radial: 7, color: bark });
  const stub = tube([V(0.05, 0.11, 0.02), V(0.22, 0.2, 0.2), V(0.3, 0.25, 0.34)], (t) => 0.045 - 0.02 * t, { radial: 5, color: bark });
  // cut ends: pale heartwood rings show the hard grain
  const ring = (x, r) => place(paint(new THREE.CylinderGeometry(r, r, 0.02, 10), (c) => (Math.hypot(c.x, c.z) < r * 0.45 ? '#8a6a48' : '#5c4532')), [x, 0.09, 0], [0, 0, Math.PI / 2]);
  return merge([log, stub, ring(-0.56, 0.095), ring(0.555, 0.072)]);
}

/** Healing herb: a low rosette of soft leaves with three lavender flower heads on thin stems. */
function herbGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + (i % 2) * 0.2;
    parts.push(place(leaf(0.26 + (i % 3) * 0.05, 0.085, '#3fb85a', '#23803a'), [0, 0.02, 0], [0, a, 0.35 + (i % 2) * 0.2]));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5, r = 0.06, h = 0.32 + k * 0.05;
    const top = V(Math.cos(a) * r * 1.6, h, Math.sin(a) * r * 1.6);
    parts.push(tube([V(Math.cos(a) * r * 0.3, 0, Math.sin(a) * r * 0.3), V(Math.cos(a) * r, h * 0.55, Math.sin(a) * r), top], () => 0.01, { radial: 4, color: () => '#6aa84a', capStart: false }));
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * TAU;
      parts.push(place(blob(0.034, 0.013, 0.024, '#c9b2ff', { w: 5, h: 4 }), [top.x + Math.cos(pa) * 0.03, top.y + 0.01, top.z + Math.sin(pa) * 0.03], [0, -pa, 0]));
    }
    parts.push(place(blob(0.018, 0.016, 0.018, '#ffffff', { w: 5, h: 4 }), [top.x, top.y + 0.022, top.z]));
  }
  return merge(parts);
}

const BUILD = { resin: resinGeometry, ironwood: ironwoodGeometry, herb: herbGeometry };

/** Shared geometry of a resource kind (null for an unknown kind). */
export function resourceGeometry(kind) {
  return BUILD[kind] ? cached(geoCache, kind, BUILD[kind]) : null;
}

/** Shared material of a resource kind: vertex colours with a soft glow of its own. */
export function resourceMaterial(kind) {
  return cached(matCache, kind, () => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: kind === 'resin' ? 0.25 : 0.8,
    metalness: 0,
    emissive: new THREE.Color(EMISSIVE[kind] || '#ffffff'),
    emissiveIntensity: RESOURCE_GLOW[kind] ?? 0.2,
  }));
}

/** A ready mesh of a resource kind (dropped items), or null. */
export function makeResourceMesh(kind) {
  const g = resourceGeometry(kind);
  if (!g) return null;
  const m = new THREE.Mesh(g, resourceMaterial(kind));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
