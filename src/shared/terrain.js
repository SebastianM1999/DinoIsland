// Deterministic island heightfield, shared by client (rendering, collision)
// and server (dinosaur movement). The analytic function is sampled onto a grid
// once; heightAt() interpolates exactly like the rendered triangles.

import { CONFIG } from './config.js';
import { fbm, valueNoise, clamp, smoothstep, lerp } from './rng.js';

// Hand-placed landmark features. Coordinates: x = east, z = south (-z is north).
export const FEATURES = {
  hut: { x: 4, z: 92, radius: 20 },
  mountain: { x: -18, z: -62, radius: 82, height: 56 },
  spur: { x: 36, z: -30, radius: 33, height: 34 },          // mesa next to the lake (waterfall cliff)
  lake: { x: 57, z: -7, radius: 16 },
  westHills: { x: -112, z: 28, radius: 58, height: 17 },
  eastMeadow: { x: 92, z: 52, radius: 60 },
  stegoMeadow: { x: -70, z: -8, radius: 26 },
  raptorJungle: { x: -62, z: 62, radius: 34 },
};

const S = CONFIG.world.seed;

function mesa(x, z, f, terraceStep, sharp) {
  const dx = x - f.x, dz = z - f.z;
  const ang = Math.atan2(dz, dx);
  const warp = 1 + 0.18 * valueNoise(Math.cos(ang) * 2.3 + f.x * 0.01, Math.sin(ang) * 2.3, S + 7)
    + 0.08 * valueNoise(Math.cos(ang) * 6.1, Math.sin(ang) * 6.1 + f.z * 0.01, S + 8);
  const r = Math.sqrt(dx * dx + dz * dz) / (f.radius * warp);
  if (r >= 1) return 0;
  let h = f.height * Math.pow(1 - smoothstep(0.12, 1.0, r), 0.75);
  h += fbm(x * 0.03, z * 0.03, 3, S + 11) * 3 * (1 - r);
  if (terraceStep > 0) {
    const t = h / terraceStep;
    const fl = Math.floor(t);
    const fr = t - fl;
    h = terraceStep * (fl + smoothstep(sharp, 1.0, fr)) + fr * 0.6;
  }
  return Math.max(0, h);
}

/** Raw analytic island height at (x, z). */
export function islandHeight(x, z) {
  const R = CONFIG.world.islandRadius;
  const ang = Math.atan2(z, x);
  const coastWarp = 1 + 0.13 * valueNoise(Math.cos(ang) * 1.7 + 3, Math.sin(ang) * 1.7, S + 1)
    + 0.06 * valueNoise(Math.cos(ang) * 5 + 9, Math.sin(ang) * 5, S + 2);
  const d = Math.sqrt(x * x + z * z) / coastWarp;

  // Base land: beach ring rising into rolling lowland.
  const inland = (R - d) / 45;
  let h;
  if (inland < 0) {
    h = inland * 45 * 0.16;                                    // sea floor slope
    h = Math.max(h, -16);
    h += fbm(x * 0.02, z * 0.02, 2, S + 3) * 1.2;
  } else {
    const t = clamp(inland, 0, 1);
    h = 0.35 + 1.6 * smoothstep(0, 0.45, t) + 2.2 * smoothstep(0.35, 1, t);
    h += fbm(x * 0.018, z * 0.018, 4, S + 4) * 3.2 * smoothstep(0.3, 1, t);
    h += fbm(x * 0.07, z * 0.07, 2, S + 5) * 0.5 * t;
  }
  // Very gentle coastal shelf so the shallows are turquoise.
  if (inland < 0 && inland > -0.5) h = lerp(h, -0.9 + inland * 3, 0.4);

  // Mountain massif and the waterfall spur: terraced mesas with cliff risers.
  const m = mesa(x, z, FEATURES.mountain, 12, 0.84);
  const sp = mesa(x, z, FEATURES.spur, 11, 0.82);
  h += Math.max(m, sp * 0.95);

  // Gentle western hills.
  {
    const f = FEATURES.westHills;
    const r = Math.hypot(x - f.x, z - f.z) / f.radius;
    if (r < 1) h += f.height * Math.pow(1 - smoothstep(0, 1, r), 1.4) * (0.85 + 0.3 * fbm(x * 0.05, z * 0.05, 2, S + 12));
  }

  // Lake: raise surroundings to a small plateau, then carve a bowl.
  {
    const f = FEATURES.lake;
    const lakeLevel = CONFIG.world.lakeLevel;
    const dd = Math.hypot(x - f.x, z - f.z);
    const rim = 1 - smoothstep(f.radius * 1.2, f.radius * 2.4, dd);
    h = lerp(h, Math.max(h, lakeLevel + 0.9 + fbm(x * 0.1, z * 0.1, 2, S + 13) * 0.4), rim);
    const bowl = 1 - smoothstep(f.radius * 0.55, f.radius * 1.05, dd);
    h = lerp(h, lakeLevel - 3.2, bowl);
  }

  // Hut clearing: flatten.
  {
    const f = FEATURES.hut;
    const dd = Math.hypot(x - f.x, z - f.z);
    const w = 1 - smoothstep(f.radius * 0.75, f.radius * 1.5, dd);
    h = lerp(h, HUT_GROUND, w);
  }
  return h;
}

const HUT_GROUND = 3.1;

export class Terrain {
  constructor() {
    const { size, segments } = CONFIG.world;
    this.size = size;
    this.n = segments;
    this.cell = size / segments;
    this.half = size / 2;
    const n1 = segments + 1;
    this.heights = new Float32Array(n1 * n1);
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        this.heights[j * n1 + i] = islandHeight(-this.half + i * this.cell, -this.half + j * this.cell);
      }
    }
    this.hutGround = HUT_GROUND;
  }

  /** Height of grid vertex (i, j). */
  h(i, j) {
    const n = this.n;
    i = i < 0 ? 0 : i > n ? n : i;
    j = j < 0 ? 0 : j > n ? n : j;
    return this.heights[j * (n + 1) + i];
  }

  /** Height exactly matching the rendered triangle mesh. */
  heightAt(x, z) {
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -16;
    const fx = gx - i, fz = gz - j;
    const h00 = this.h(i, j), h10 = this.h(i + 1, j), h01 = this.h(i, j + 1), h11 = this.h(i + 1, j + 1);
    if (fx + fz < 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Surface gradient (dh/dx, dh/dz) sampled over ~1m. */
  gradientAt(x, z, e = 0.8) {
    return {
      x: (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      z: (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    };
  }

  slopeAt(x, z) {
    const g = this.gradientAt(x, z);
    return Math.hypot(g.x, g.z);
  }

  /** Water surface height at (x, z), or null when dry. */
  waterLevelAt(x, z) {
    const g = this.heightAt(x, z);
    const f = FEATURES.lake;
    if (Math.hypot(x - f.x, z - f.z) < f.radius * 1.3 && g < CONFIG.world.lakeLevel) return CONFIG.world.lakeLevel;
    if (g < CONFIG.world.seaLevel) return CONFIG.world.seaLevel;
    return null;
  }

  /** Depth of water above the ground (0 when dry). */
  waterDepthAt(x, z) {
    const w = this.waterLevelAt(x, z);
    return w === null ? 0 : w - this.heightAt(x, z);
  }

  /** True if a land creature may stand here. */
  isWalkable(x, z, maxDepth = 0.3, maxSlope = 1.2) {
    if (this.waterDepthAt(x, z) > maxDepth) return false;
    return this.slopeAt(x, z) <= maxSlope;
  }
}
