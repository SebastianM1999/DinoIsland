// Shared attachment points: the grotto model and falling water use one lip.
export const SPRING_LIP_OFFSET = 0.45;
export const SPRING_FLOOR = -0.12;
export const SPRING_WATER_OFFSET = 0.04;

import { makeRng, smoothstep } from './rng.js';

// Pure geometry helpers: this shape is shared by the mesh and world collision.
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


export const ell3 = (x, y, z, a, b, c) => {
  const k0 = Math.hypot(x / a, y / b, z / c);
  const k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
  return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
};
export const ell2 = (x, y, a, b) => {
  const k0 = Math.hypot(x / a, y / b);
  const k1 = Math.hypot(x / (a * a), y / (b * b));
  return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
};
export const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};


/** Opening height above the lip. */
export const SPRING_OPENING_HEIGHT = 4.0;

/** Same position-derived variation used for the rendered grotto. */
export function springSeed(source) {
  return (Math.round((source.x ?? 0) * 13.1 + (source.z ?? 0) * 7.7) & 0xffff) + 1;
}

export function springSdf(width, seed) {
  const W = width;
  const hw = W / 2 + 1.0;                         // opening half-width (~ width + 2 m wide)
  const rng = makeRng(((seed | 0) * 2654435761 + 13) >>> 0);
  const masses = [
    { x: 0, y: 0.6, z: 2.7, rx: hw + 5.6, ry: 6.8, rz: 3.4 },                       // chunk of cliff face
    { x: -(hw + 1.3), y: 1.2, z: -0.5, rx: 2.1, ry: 4.0, rz: 2.3 },                  // cheeks
    { x: hw + 1.3, y: 1.4, z: -0.4, rx: 2.0, ry: 4.2, rz: 2.2 },
    { x: 0, y: 4.9, z: -0.5, rx: hw + 2.0, ry: 1.9, rz: 2.3 },                       // brow
    { x: -(hw + 2.4), y: -2.6, z: -0.3, rx: 1.8, ry: 2.3, rz: 1.8 },                 // stacked boulders below the cheeks
    { x: hw + 2.6, y: -2.9, z: -0.1, rx: 1.9, ry: 2.2, rz: 1.7 },
  ];
  // a few extra lumps on top and around the frame (never in the water's path)
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1;
    const top = k < 3;
    const r = 0.9 + rng() * 0.9;
    const x = top ? (rng() - 0.5) * (hw * 2 + 3) : side * (hw + 1.6 + rng() * 3.2);
    const y = top ? 5.6 + rng() * 1.0 : -3.5 + rng() * 8.5;
    masses.push({ x, y, z: -0.2 + rng() * 1.2, rx: r * (1 + rng() * 0.4), ry: r * (0.7 + rng() * 0.3), rz: r });
  }
  // stream bed: the opening, flat floor just below the lip, closed ~3 m in
  const cavity = (x, y, z) => {
    const c2 = Math.max(ell2(x, y - 0.4, hw, SPRING_OPENING_HEIGHT - 0.4), SPRING_FLOOR - y);
    return smax(c2 + 0.12 * noise3(x * 0.9, y * 0.9, z * 0.9, seed + 5), z - 2.1, 1.1);
  };
  const outer = (x, y, z) => {
    let d = 1e9;
    for (const m of masses) {
      const dx = x - m.x, dy = y - m.y, dz = z - m.z;
      if (Math.abs(dx) > m.rx + 2.5 || Math.abs(dy) > m.ry + 2.5 || Math.abs(dz) > m.rz + 2.5) continue;
      d = smin(d, ell3(dx, dy, dz, m.rx, m.ry, m.rz), 1.4);
    }
    d += 0.12 * Math.sin(y * 2.2 + 1.5 * noise3(x * 0.25, y * 0.1, z * 0.25, seed + 9));   // rock layers
    // calmer rock right at the lip so the water always leaves at the same spot
    const k = 0.2 + 0.8 * smoothstep(0.6, 2.4, Math.hypot(Math.max(0, Math.abs(x) - W / 2), y + 0.3, z + SPRING_LIP_OFFSET));
    return d - k * 0.4 * fbm3(x * 0.35, y * 0.35, z * 0.35, seed) - k * 0.2 * noise3(x * 0.15, y * 0.15, z * 0.15, seed + 3);
  };
  // keep the free-fall zone below the lip clear so the water never clips rock
  const chute = (x, y, z) => Math.max(Math.abs(x) - (W / 2 + 0.9), y - SPRING_FLOOR, z + SPRING_LIP_OFFSET - 0.5);
  const sdf = (x, y, z) => smax(smax(outer(x, y, z), -cavity(x, y, z), 0.5), -chute(x, y, z), 0.3);
  return { sdf, cavity, hw, bounds: { min: [-(hw + 8), -7, -4.2], max: [hw + 8, 8.4, 6.6] } };
}

/**
 * Solid vertical intervals of the rendered rock, rather than a box around the
 * opening. Small columns preserve the arched cavity and clear falling water.
 * Crossing heights are refined so the brow is also a usable landing surface.
 * THREE's Y rotation has the opposite sign to the collision box rotation.
 */
export function springColliders(source) {
  const width = Math.max(2, source.width ?? 4.5);
  const { sdf, bounds } = springSdf(width, springSeed(source));
  const step = 0.7, yStep = 0.3;
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / step);
  const nz = Math.ceil((bounds.max[2] - bounds.min[2]) / step);
  const sx = (bounds.max[0] - bounds.min[0]) / nx;
  const sz = (bounds.max[2] - bounds.min[2]) / nz;
  const ny = Math.ceil((bounds.max[1] - bounds.min[1]) / yStep);
  const sy = (bounds.max[1] - bounds.min[1]) / ny;
  const rot = source.rot || 0, cos = Math.cos(rot), sin = Math.sin(rot);
  const boxes = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const x = bounds.min[0] + (ix + 0.5) * sx;
    const z = bounds.min[2] + (iz + 0.5) * sz;
    const crossing = (a, b, aInside) => {
      for (let i = 0; i < 7; i++) {
        const m = (a + b) / 2;
        if ((sdf(x, m, z) < 0) === aInside) a = m; else b = m;
      }
      return (a + b) / 2;
    };
    const add = (bottom, top) => {
      if (top - bottom < 0.03) return;
      boxes.push({
        x: source.x + x * cos + z * sin,
        z: source.z - x * sin + z * cos,
        hw: sx / 2, hd: sz / 2, rot: -rot,
        bottom: (source.y ?? 0) + bottom,
        top: (source.y ?? 0) + top,
        kind: 'spring', stand: true,
      });
    };
    let lastY = bounds.min[1], inside = sdf(x, lastY, z) < 0;
    let bottom = inside ? lastY : null;
    for (let iy = 1; iy <= ny; iy++) {
      const y = bounds.min[1] + iy * sy;
      const nextInside = sdf(x, y, z) < 0;
      if (nextInside !== inside) {
        const edge = crossing(lastY, y, inside);
        if (nextInside) bottom = edge; else add(bottom, edge);
      }
      lastY = y;
      inside = nextInside;
    }
    if (inside) add(bottom, bounds.max[1]);
  }
  return boxes;
}
