// Procedural fallback for the Crystal Plodder (used while its GLB is missing or failed to load): the stegosaurus rig
// shrunk to ~5.7 m, repainted slate with `DINO_PALETTES['crystal-plodder']`, with glowing crystal clusters on its back.
// The crystals use an unlit material like the GLB's `PlodCrystal`: emissive-only, never a light.

import * as THREE from 'three';
import { paint, place, merge } from '../kit.js';
import { buildStego, STEGO_ANIM } from './stego.js';
import { paintSkinDetails } from './skinStyle.js';

export const CRYSTAL_PLODDER_ANIM = { ...STEGO_ANIM, walkSpeed: 1.1, runSpeed: 3.4, walkStride: 1.0, runStride: 1.8 };

const SCALE = 0.72;
const CYAN = ['#0a6a78', '#2fe3da', '#c4fff6'], VIOLET = ['#4a2a98', '#9d62ff', '#e6d2ff'];

/** One hexagonal prism with a pointed cap, base at the origin, pointing +Y, painted root -> tip. */
function crystalGeo(len, r, [base, mid, tip]) {
  const prism = new THREE.CylinderGeometry(r * 0.9, r, len * 0.78, 6).translate(0, len * 0.39, 0);
  const cap = new THREE.ConeGeometry(r * 0.9, len * 0.22, 6).translate(0, len * 0.78 + len * 0.11, 0);
  const c0 = new THREE.Color(base), c1 = new THREE.Color(mid), c2 = new THREE.Color(tip), out = new THREE.Color();
  const color = (v) => { const t = v.y / len; return t < 0.3 ? out.copy(c0).lerp(c1, t / 0.3) : out.copy(c1).lerp(c2, Math.min(1, (t - 0.3) / 0.7) * 0.8); };
  return [paint(prism, color), paint(cap, color)];
}

export function buildCrystalPlodder() {
  const rig = buildStego();
  rig.root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) paintSkinDetails(o.geometry, 'crystal-plodder'); });
  // crystal clusters over the back: (z along the body, x across, height m, count)
  const parts = [];
  const sites = [[-0.2, 0, 0.7, 5], [0.5, 0.35, 0.5, 4], [0.5, -0.35, 0.45, 4], [-0.9, 0.2, 0.5, 4], [1.2, -0.1, 0.4, 3], [-0.6, -0.4, 0.38, 3]];
  sites.forEach(([z, x, h, n], si) => {
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + si, l = h * (i ? 0.45 + 0.1 * ((i * 7) % 5) : 1), r = 0.07 + l * 0.07;
      const ox = i ? Math.cos(a) * 0.22 : 0, oz = i ? Math.sin(a) * 0.22 : 0;
      const col = (si * 3 + i) % 7 === 0 ? VIOLET : CYAN;
      for (const g of crystalGeo(l, r, col)) parts.push(place(g, [x + ox, 0.82 + 0.1 * Math.cos(z), z + oz], [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35]));
    }
  });
  const crystals = new THREE.Mesh(merge(parts, 0), new THREE.MeshBasicMaterial({ vertexColors: true }));
  rig.body.add(crystals);
  rig.root.scale.multiplyScalar(SCALE);
  return rig;
}
