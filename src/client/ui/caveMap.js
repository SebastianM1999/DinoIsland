// The Hollow Mountain's map: the two coves, the sea and the mountain are painted
// once like on every island, but everything inside the mountain stays under a
// dark cover until the team has walked there (fog of war), so the maze stays a
// maze. `revealMap` clears the cover round the player as they move (a soft disc
// of CAVE_MAP.reveal metres, nothing is shown through the rock beyond it);
// minimap.js draws `base.fog` over the base image.

import { smoothstep } from '../../shared/rng.js';

/** Metres revealed round the player; explored discs are kept for the whole visit. */
export const CAVE_MAP = { reveal: 15, step: 1.6 };

const PALETTE = {
  deep: [14, 38, 62], sea: [26, 70, 98], shallow: [52, 120, 134],
  sand: [158, 148, 122], sandWet: [112, 108, 96],
  cliff: [78, 80, 94], rock: [96, 98, 110], top: [112, 114, 124],
  floor: [150, 138, 120], floorLight: [176, 164, 142], tunnelWater: [48, 136, 146], flowstone: [188, 180, 184],
  cover: [10, 14, 22],
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @returns {{canvas:HTMLCanvasElement, size:number, half:number, res:number, mpp:number, island:{A:number,B:number}, fog:object}}
 */
export function buildCaveMapBase(terrain, layout, res = 640) {
  const size = terrain.size, half = size / 2, mpp = size / res;
  const depthAt = layout.plan.cave.depthAt;
  const cv = document.createElement('canvas');
  cv.width = cv.height = res;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(res, res);
  const d = img.data;
  const lx = -0.7, lz = -0.7;
  for (let py = 0; py < res; py++) {
    const z = -half + (py + 0.5) * mpp;
    for (let px = 0; px < res; px++) {
      const x = -half + (px + 0.5) * mpp;
      const h = terrain.heightAt(x, z), w = terrain.waterLevelAt(x, z);
      const ceil = terrain.ceilingAt(x, z);
      let col;
      if (w !== null && w - h > 0.05) {
        const depth = w - h;
        col = ceil !== Infinity ? PALETTE.tunnelWater : depth < 2.2 ? mix(PALETTE.shallow, PALETTE.sea, clamp01(depth / 2.2)) : mix(PALETTE.sea, PALETTE.deep, clamp01((depth - 2.2) / 8));
      } else if (ceil !== Infinity && h < ceil - 1.5) {
        // inside the mountain: the open space (tunnels and chambers) is the bright part
        col = mix(PALETTE.floor, PALETTE.floorLight, clamp01((h - 2) * 0.4));
      } else {
        const slope = terrain.slopeAt(x, z);
        if (h < 1.4) col = PALETTE.sandWet;
        else if (h < 4.5 && slope < 0.5) col = mix(PALETTE.sand, PALETTE.sandWet, clamp01((2.4 - h) * 0.5));
        else col = mix(PALETTE.cliff, h > 38 ? PALETTE.top : PALETTE.rock, clamp01((h - 8) / 40));
        const g = terrain.gradientAt(x, z, 1.2);
        const shade = 1 + clamp01(-(g.x * lx + g.z * lz) * 0.5 + 0.5) * 0.35 - 0.18;
        col = [col[0] * shade, col[1] * shade, col[2] * shade];
      }
      const i = (py * res + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // the cover over everything inside the mountain (soft at its outer edge, the cove side)
  const fogCv = document.createElement('canvas');
  fogCv.width = fogCv.height = res;
  const fctx = fogCv.getContext('2d');
  const fimg = fctx.createImageData(res, res);
  const f = fimg.data;
  for (let py = 0; py < res; py++) {
    const z = -half + (py + 0.5) * mpp;
    for (let px = 0; px < res; px++) {
      const x = -half + (px + 0.5) * mpp;
      const k = smoothstep(-2, 9, depthAt(x, z));
      const n = ((px * 7 + py * 13) % 5) * 1.5;          // a little grain so the cover is not a flat colour
      const i = (py * res + px) * 4;
      f[i] = PALETTE.cover[0] + n; f[i + 1] = PALETTE.cover[1] + n; f[i + 2] = PALETTE.cover[2] + n * 1.4;
      f[i + 3] = Math.round(k * 250);
    }
  }
  fctx.putImageData(fimg, 0, 0);

  return {
    canvas: cv, size, half, res, mpp,
    island: { A: layout.plan.A, B: layout.plan.B },
    fog: { canvas: fogCv, ctx: fctx, lastX: NaN, lastZ: NaN },
  };
}

/** Clear the cover round (x, z) (when the player has moved a little since the last reveal). */
export function revealMap(base, x, z) {
  const fog = base?.fog;
  if (!fog || !Number.isFinite(x)) return;
  if (Math.hypot(x - fog.lastX, z - fog.lastZ) < CAVE_MAP.step) return;
  fog.lastX = x; fog.lastZ = z;
  const c = fog.ctx, px = (x + base.half) / base.mpp, py = (z + base.half) / base.mpp, r = CAVE_MAP.reveal / base.mpp;
  c.save();
  c.globalCompositeOperation = 'destination-out';
  const g = c.createRadialGradient(px, py, r * 0.45, px, py, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(px - r, py - r, r * 2, r * 2);
  c.restore();
}
