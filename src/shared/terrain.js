// Deterministic island heightfield, shared by client (rendering, collision)
// and server (dinosaur movement). The island plan (shared/island.js) is
// sampled onto a grid once; heightAt() interpolates exactly like the
// rendered triangles.

import { CONFIG } from './config.js';
import { WORLD, HUT_GROUND, planIsland, islandHeight, riverQuery, poolAt, bogSample, bridgeAt } from './island.js';
import { smoothstep } from './rng.js';

/**
 * Heat (volcano): the ground near lava and fumaroles is hot – 1 right at the
 * lava, fading out over `reach` m (`fumarole` m round a fumarole). Effects in
 * CONFIG.volcano.heat (players) and sim/pathfind.js (dinosaurs).
 */
export const HEAT = { reach: 12, fumarole: 7 };

export class Terrain {
  /** @param {ReturnType<typeof planIsland>} [plan] defaults to level 1 */
  constructor(plan = planIsland(0, 1)) {
    this.plan = plan;
    const size = WORLD.size, segments = WORLD.segments;
    this.size = size;
    this.n = segments;
    this.cell = size / segments;
    this.half = size / 2;
    const n1 = segments + 1;
    this.heights = new Float32Array(n1 * n1);
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        this.heights[j * n1 + i] = islandHeight(plan, -this.half + i * this.cell, -this.half + j * this.cell);
      }
    }
    this.hutGround = HUT_GROUND;
    // the volcano path's lava pits (island.js lavaPits): the lava sheet ends where
    // the ground as sampled here rises above it, so no edge of it hangs in the air
    for (const p of plan.pools || []) {
      if (!p.pit) continue;
      const above = (r) => { for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; if (this.heightAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) < p.level) return false; } return true; };
      // (out into its rim first, then in)
      let r = p.r * 1.05;
      while (r < p.r * 1.55 && !above(r)) r += 0.1;
      if (!above(r)) { r = p.r * 1.05; while (r > p.r * 0.4 && !above(r)) r -= 0.1; }
      p.disc = r;
    }
    // bogs (swamp): how much bog each grid vertex lies in (0..1) and its water level (NaN = none)
    this.bogMask = null;
    this.bogLevel = null;
    if (plan.bogs?.length) {
      this.bogMask = new Float32Array(n1 * n1);
      this.bogLevel = new Float32Array(n1 * n1).fill(NaN);
      for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
          const s = bogSample(plan, -this.half + i * this.cell, -this.half + j * this.cell);
          if (!s || s.mask <= 0.001) continue;
          this.bogMask[j * n1 + i] = s.mask;
          this.bogLevel[j * n1 + i] = s.bog.level;
        }
      }
    }
    // heat (volcano): distance from every grid vertex to the nearest lava (two-pass chamfer)
    this.heatMask = null;
    if (plan.volcano) {
      const N = n1 * n1, dist = new Float32Array(N).fill(1e9);
      for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
          if (this.lavaLevelAt(-this.half + i * this.cell, -this.half + j * this.cell) !== null) dist[j * n1 + i] = 0;
        }
      }
      const c1 = this.cell, c2 = this.cell * Math.SQRT2;
      const relax = (k, kk, w) => { if (dist[kk] + w < dist[k]) dist[k] = dist[kk] + w; };
      for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
          const k = j * n1 + i;
          if (i > 0) relax(k, k - 1, c1);
          if (j > 0) { relax(k, k - n1, c1); if (i > 0) relax(k, k - n1 - 1, c2); if (i < segments) relax(k, k - n1 + 1, c2); }
        }
      }
      for (let j = segments; j >= 0; j--) {
        for (let i = segments; i >= 0; i--) {
          const k = j * n1 + i;
          if (i < segments) relax(k, k + 1, c1);
          if (j < segments) { relax(k, k + n1, c1); if (i < segments) relax(k, k + n1 + 1, c2); if (i > 0) relax(k, k + n1 - 1, c2); }
        }
      }
      this.heatMask = new Float32Array(N);
      for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
          const x = -this.half + i * this.cell, z = -this.half + j * this.cell;
          let h = 1 - smoothstep(0, HEAT.reach, dist[j * n1 + i]);
          for (const f of plan.fumaroles || []) h = Math.max(h, 0.85 * (1 - smoothstep(0.5, HEAT.fumarole, Math.hypot(x - f.x, z - f.z))));
          this.heatMask[j * n1 + i] = h;
        }
      }
    }
  }

  /** Heat of the ground at (x, z): 0 (cool) .. 1 (right at the lava). See HEAT. */
  heatAt(x, z) {
    const m = this.heatMask;
    if (!m) return 0;
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    const fx = gx - i, fz = gz - j, n1 = this.n + 1;
    const a = m[j * n1 + i], b = m[j * n1 + i + 1], c = m[(j + 1) * n1 + i], d = m[(j + 1) * n1 + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /**
   * How much of a bog (swamp) lies at (x, z): 0 on dry ground and on the
   * causeways, 1 in the middle of a bog. Wading through more than half is slow.
   */
  bogAt(x, z) {
    const m = this.bogMask;
    if (!m) return 0;
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    const fx = gx - i, fz = gz - j, n1 = this.n + 1;
    const a = m[j * n1 + i], b = m[j * n1 + i + 1], c = m[(j + 1) * n1 + i], d = m[(j + 1) * n1 + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /**
   * Walking speed factor at (x, z): CONFIG.player.swampSpeedMul in a bog (more than half
   * bog, so not on the causeways), else 1. The same rule slows players and dinosaurs.
   */
  swampSpeedAt(x, z) {
    return this.bogMask && this.bogAt(x, z) > 0.5 ? CONFIG.player.swampSpeedMul : 1;
  }

  /** Water level of the bog at (x, z), or null (the highest level among the cell's bog corners). */
  bogLevelAt(x, z) {
    const L = this.bogLevel;
    if (!L) return null;
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return null;
    const n1 = this.n + 1;
    let best = -Infinity;
    for (const k of [j * n1 + i, j * n1 + i + 1, (j + 1) * n1 + i, (j + 1) * n1 + i + 1]) if (L[k] > best) best = L[k];
    return best > -Infinity ? best : null;
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

  /** Surface of a river/pool of `kind` above the ground at (x, z), or null. */
  #flowLevelAt(x, z, g, kind) {
    const pool = poolAt(this.plan, x, z, kind);
    if (pool && g < pool.level) return pool.level;
    // (the lava runs under the basalt bridges)
    if (!(kind === 'lava' && this.plan.bridges?.length && bridgeAt(this.plan, x, z))) {
      const q = riverQuery(this.plan, x, z, 12, kind);
      if (q && q.d < q.width / 2 + 1.5 && g < q.surface) return q.surface;
    }
    if (kind === 'water' && this.bogMask) {
      const bl = this.bogLevelAt(x, z);
      if (bl !== null && g < bl && this.bogAt(x, z) > 0.02) return bl;
    }
    return null;
  }

  /** Water surface height at (x, z), or null when dry (lava is not water). */
  waterLevelAt(x, z) {
    const g = this.heightAt(x, z);
    const inland = this.#flowLevelAt(x, z, g, 'water');
    if (inland !== null) return inland;
    if (g < CONFIG.world.seaLevel) return CONFIG.world.seaLevel;
    return null;
  }

  /** Lava surface height at (x, z), or null. */
  lavaLevelAt(x, z) {
    return this.#flowLevelAt(x, z, this.heightAt(x, z), 'lava');
  }

  /** Depth of water above the ground (0 when dry). */
  waterDepthAt(x, z) {
    const w = this.waterLevelAt(x, z);
    return w === null ? 0 : w - this.heightAt(x, z);
  }

  /** Surface of the island's own water (river, lake, pools – not the sea) at (x, z), or null. */
  inlandWaterLevelAt(x, z) {
    return this.#flowLevelAt(x, z, this.heightAt(x, z), 'water');
  }

  /** Depth of the open sea at (x, z): 0 on land and in rivers/pools. Players may swim inland only. */
  seaDepthAt(x, z) {
    const g = this.heightAt(x, z);
    if (this.#flowLevelAt(x, z, g, 'water') !== null) return 0;
    return g < CONFIG.world.seaLevel ? CONFIG.world.seaLevel - g : 0;
  }

  /** True if a land creature may stand here (no deep water, no lava, not too steep). */
  isWalkable(x, z, maxDepth = 0.3, maxSlope = 1.2) {
    if (this.waterDepthAt(x, z) > maxDepth) return false;
    if (this.lavaLevelAt(x, z) !== null) return false;
    return this.slopeAt(x, z) <= maxSlope;
  }
}
