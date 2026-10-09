// Shared look of the Hollow Mountain (biome 'cave'): the crystal / daylight colours and the
// glow sources (crystals, relic chambers, pools, daylight at the mouths). The volume mesh bakes
// them per vertex with line of sight (caveLight.js); `glowTexture` paints them into a 2D
// texture for the sea floor outside. THREE colours and maths only: used by caveTerrain,
// caveLight, caveDecor and caveFx.

import * as THREE from 'three';
import { smoothstep } from '../../shared/rng.js';

// ------------------------------------------------------------------ colours
const AMBER = new THREE.Color('#ffa63d');
const CYAN = new THREE.Color('#38d8ff');
const VIOLET = new THREE.Color('#9b66ff');
const MINT = new THREE.Color('#58ffb4');
const DAY = new THREE.Color('#ffe6bd');
const NEUTRAL = new THREE.Color('#6f93b4');

/** Crystal colour of a hue value 0..1 (three families: amber, cyan, violet), plus -1 = neutral. */
export function glowColor(hue, out = new THREE.Color()) {
  if (hue < 0) return out.copy(NEUTRAL);
  const a = smoothstep(0.30, 0.37, hue), b = smoothstep(0.63, 0.70, hue), c = smoothstep(0.93, 0.98, hue);
  out.copy(AMBER).lerp(CYAN, a).lerp(VIOLET, b).lerp(AMBER, c);
  return out;
}
export const GLOW_COLORS = { AMBER, CYAN, VIOLET, MINT, DAY, NEUTRAL };

// ------------------------------------------------------------------ baked glow
/**
 * The light sources that are painted into the terrain and the roof: crystal halls
 * and clusters, the pools of water, relic chambers, the daylight at the tunnel
 * mouths. Returns `{ sources, sample(x, y, z, nx, ny, nz, out) }`; `sample`
 * adds the glow (rgb, may exceed 1) reaching a surface point into `out`.
 */
export function buildGlowField(layout) {
  const sources = [];
  const col = (hue) => glowColor(hue, new THREE.Color());
  for (const l of layout.caveLights || []) {
    if (l.kind === 'tunnel' || l.kind === 'chamber') continue;
    const k = l.kind === 'daylight' ? 0.7 : l.kind === 'water' ? 0.55 : l.kind === 'relic' ? 0.7 : 0.8;
    const c = l.kind === 'daylight' ? DAY.clone() : l.kind === 'water' ? new THREE.Color('#35d6c4') : col(l.hue);
    sources.push({ x: l.x, y: l.y, z: l.z, r: l.r * 1.1, k, c });
  }
  for (const c of layout.caveDecor?.crystals || []) {
    sources.push({ x: c.x, y: c.y + 0.8 * c.scale, z: c.z, r: 6 + 3.5 * c.scale, k: (c.big ? 1.6 : 0.7) * Math.min(1.6, c.scale), c: col(c.hue) });
  }
  // the open ends: daylight pouring in at the entrance, the true exit and the false exits
  const day = (p, r, k) => { if (p) sources.push({ x: p.x, y: (p.y ?? 3) + 3, z: p.z, r, k, c: DAY.clone() }); };
  day(layout.caveEntrance, 15, 0.9);
  day(layout.caveExit, 18, 1.1);
  for (const f of layout.falseExits || []) day(f, 13, 0.8);

  /**
   * The glow as a texture over the whole island (RGB, 1 m texels, bilinear): the cave shader
   * reads it per pixel, so the glow of a crystal hall falls off smoothly over every wall,
   * roof and floor instead of showing the terrain's triangles. `half` is the island half size.
   */
  const glowTexture = (half, size = 1024) => {
    const data = new Uint8Array(size * size * 4);
    const acc = new Float32Array(size * size * 3);
    const step = (half * 2) / size;
    for (const s of sources) {
      const i0 = Math.max(0, Math.floor((s.x - s.r + half) / step)), i1 = Math.min(size - 1, Math.ceil((s.x + s.r + half) / step));
      const j0 = Math.max(0, Math.floor((s.z - s.r + half) / step)), j1 = Math.min(size - 1, Math.ceil((s.z + s.r + half) / step));
      for (let j = j0; j <= j1; j++) {
        const z = -half + (j + 0.5) * step;
        for (let i = i0; i <= i1; i++) {
          const x = -half + (i + 0.5) * step;
          const d = Math.hypot(x - s.x, z - s.z);
          if (d >= s.r) continue;
          const f = 1 - d / s.r, w = f * f * s.k;
          const o = (j * size + i) * 3;
          acc[o] += s.c.r * w; acc[o + 1] += s.c.g * w; acc[o + 2] += s.c.b * w;
        }
      }
    }
    // many overlapping crystals must add up to a brighter glow, never to a white one: compress the strongest
    // channel softly (hue kept) instead of clipping each channel on its own
    const soft = (m) => (m <= 0.55 ? m : 0.55 + 0.5 * (1 - Math.exp(-(m - 0.55) / 0.5)));
    for (let k = 0; k < size * size; k++) {
      const m = Math.max(acc[k * 3], acc[k * 3 + 1], acc[k * 3 + 2]);
      const g = m > 0 ? soft(m) / m / GLOW_RANGE * 255 : 0;
      data[k * 4] = Math.min(255, acc[k * 3] * g);
      data[k * 4 + 1] = Math.min(255, acc[k * 3 + 1] * g);
      data[k * 4 + 2] = Math.min(255, acc[k * 3 + 2] * g);
      data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    sources,
    glowTexture,
  };
}

/** The glow texture stores colour / GLOW_RANGE (so glow may exceed 1). */
export const GLOW_RANGE = 1.6;
