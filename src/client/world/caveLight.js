// Baked lighting of the Hollow Mountain's volume mesh: per vertex, from the very SDF the mesh was cut from
// (shared/caveVolume.js volumeLattice), made once when the mesh is built (offline for the fixed map: scripts/bakeCave.mjs,
// stored in the bake file as two vertex attributes; live for any other variant).
//
//   lt = (ao, sky, shimmer)
//     ao       0..1  ambient occlusion: how much of the hemisphere above the surface is free. SDF-marched along the normal
//                    and along six tilted directions, compared with the open plane (a flat floor reads 1, a corner or a crevice
//                    less, a narrow slot near 0). Scales the indirect light and a little of the direct light.
//     sky      0..1  daylight reaching the surface: the geodesic sky field of caveSky.js (daylit coves and mouths, falling to dark
//                    through the tunnels), taken per vertex instead of per pixel from a 2D texture; a surface above the roof sees the sky.
//     shimmer  0..1  how much the water's moving reflection reaches the surface (near flooded water, the sea line): the shader
//                    animates it. Only faint.
//   gl = RGB glow of the light sources (crystals, relic chambers, pools, daylight at the mouths) with line of sight through the SDF:
//        a pool of light on the floor and walls round a crystal that never leaks through the rock. Stored over 0..1 (x GLOW_RANGE).
//
// Torch, wall torches and the pooled crystal lights stay dynamic on top of this (caveFx.js, wallTorches.js).
// Deterministic, no randomness.

import { smoothstep } from '../../shared/rng.js';
import { GLOW_RANGE } from './caveStyle.js';

/** Bump when anything below changes what it makes (the bake's key also hashes a probe of the sources). */
export const LIGHT_VERSION = 2;

/** Out-of-band samples of the lattice are signs only; for marching they count as this far from the surface (m). */
const FAR = 3.5;

/** Trilinear SDF sampler over the lattice (field values are about metres near the surface). */
export function latticeSampler(lat) {
  const { V, x0, z0, NI, NK, avail, jlo, jhi, off, vals, Y0 } = lat;
  const inv = 1 / V;
  const last = [0, 0, 0, 0];
  return function field(x, y, z) {
    const u = (x - x0) * inv, w = (z - z0) * inv;
    const i = Math.floor(u), k = Math.floor(w);
    if (i < 0 || k < 0 || i >= NI - 1 || k >= NK - 1) return 8;
    const q = k * NI + i;
    if (!(avail[q] && avail[q + 1] && avail[q + NI] && avail[q + NI + 1])) return 8;
    const fx = u - i, fz = w - k, h = (y - Y0) * inv, j = Math.floor(h), fy = h - j;
    last[0] = q; last[1] = q + 1; last[2] = q + NI; last[3] = q + NI + 1;
    let acc = 0;
    for (let c = 0; c < 4; c++) {
      const qq = last[c];
      const wc = ((c & 1) ? fx : 1 - fx) * ((c & 2) ? fz : 1 - fz);
      const lo = jlo[qq], hi = jhi[qq], o = off[qq] - lo;
      const a = j < lo ? -FAR : j > hi ? FAR : vals[o + j];
      const b = j + 1 < lo ? -FAR : j + 1 > hi ? FAR : vals[o + j + 1];
      acc += wc * (a + (b - a) * fy);
    }
    return acc;
  };
}

const TILT = 0.8, SIN = Math.sin(TILT), COS = Math.cos(TILT);
const AO_DIRS = 6;
const AO_H = [0.45, 1.3, 2.9];
const AO_W = [1, 0.75, 0.5];

/**
 * Bake the light attributes of the volume's chunks.
 * @param {object} lat volumeLattice(plan, half)
 * @param {{pos:Float32Array, nor:Float32Array}[]} chunks from meshCaveVolume; each gets `lt` (Float32 x3) and `gl` (Float32 x3)
 * @param {{sources:{x:number,y:number,z:number,r:number,k:number,c:{r:number,g:number,b:number}}[], visAt:(x:number,y:number,z:number)=>number, waterAt:(x:number,z:number)=>number|null}} src
 */
export function bakeCaveLight(lat, chunks, { sources, visAt, waterAt }) {
  const t0 = performance.now();
  const field = latticeSampler(lat);
  // sources in a coarse grid
  const CELL = 24, grid = new Map(), key = (i, j) => i * 4096 + j;
  for (const s of sources) {
    for (let i = Math.floor((s.x - s.r) / CELL); i <= Math.floor((s.x + s.r) / CELL); i++) {
      for (let j = Math.floor((s.z - s.r) / CELL); j <= Math.floor((s.z + s.r) / CELL); j++) {
        let l = grid.get(key(i, j));
        if (!l) grid.set(key(i, j), l = []);
        l.push(s);
      }
    }
  }
  const soft = (m) => (m <= 0.55 ? m : 0.55 + 0.5 * (1 - Math.exp(-(m - 0.55) / 0.5)));
  const dirs = [];   // (cos phi, sin phi) of the tilted directions
  for (let a = 0; a < AO_DIRS; a++) dirs.push([Math.cos(a * Math.PI * 2 / AO_DIRS + 0.3), Math.sin(a * Math.PI * 2 / AO_DIRS + 0.3)]);
  let verts = 0, glowVerts = 0, shimVerts = 0, aoSum = 0;

  for (const ch of chunks) {
    const m = ch.pos.length / 3;
    const lt = new Float32Array(m * 3), gl = new Float32Array(m * 3);
    for (let v = 0; v < m; v++) {
      const x = ch.pos[v * 3], y = ch.pos[v * 3 + 1], z = ch.pos[v * 3 + 2];
      const nx = ch.nor[v * 3], ny = ch.nor[v * 3 + 1], nz = ch.nor[v * 3 + 2];
      // --- ambient occlusion
      // tangent frame
      let tx, ty, tz;
      if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 0; ty = -nz; tz = ny; }
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      let occ = 0, wsum = 0;
      for (let s = 0; s < AO_H.length; s++) {
        const h = AO_H[s];
        // along the normal: the field there should be about h
        const dn = field(x + nx * h, y + ny * h, z + nz * h);
        occ += AO_W[s] * Math.max(0, Math.min(1, (h - dn) / h)) * 1.5;
        wsum += AO_W[s] * 1.5;
        for (let a = 0; a < AO_DIRS; a++) {
          const c = dirs[a][0] * SIN, sn = dirs[a][1] * SIN;
          const dx = nx * COS + (tx * c + bx * sn), dy = ny * COS + (ty * c + by * sn), dz = nz * COS + (tz * c + bz * sn);
          const e = h * COS;   // the open plane's distance at that point
          const d = field(x + dx * h, y + dy * h, z + dz * h);
          occ += AO_W[s] * Math.max(0, Math.min(1, (e - d) / e));
          wsum += AO_W[s];
        }
      }
      const ao = Math.max(0, Math.min(1, 1 - 1.25 * occ / wsum));
      aoSum += ao;
      lt[v * 3] = ao;
      // --- daylight
      lt[v * 3 + 1] = visAt(x, y, z);
      // --- water shimmer: a surface just above flooded water (or the sea at the coves)
      let sh = 0;
      if (y < 9) {
        let near = 0, lvl = -Infinity;
        for (let r = 0; r < 9; r++) {
          const rr = r === 0 ? 0 : r <= 4 ? 1.8 : 4;
          const a = (r <= 4 ? r - 1 : r - 5) * Math.PI / 2 + 0.4;
          const w = waterAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
          if (w !== null && w !== undefined) { near++; if (w > lvl) lvl = w; }
        }
        if (near > 0) {
          const h = y - lvl;
          if (h > -0.3 && h < 3.4) sh = (1 - smoothstep(0.2, 3.4, h)) * Math.min(1, near / 2.5) * (1 - 0.85 * lt[v * 3 + 1]);
        }
      }
      if (sh > 0.01) shimVerts++;
      lt[v * 3 + 2] = sh;
      // --- glow of the sources, with line of sight
      const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (list) {
        let r = 0, g = 0, b = 0;
        const sx = x + nx * 0.35, sy = y + ny * 0.35, sz = z + nz * 0.35;
        for (const s of list) {
          const dx = s.x - x, dy = s.y - y, dz = s.z - z;
          const d2 = dx * dx + dy * dy * 0.6 + dz * dz;
          if (d2 >= s.r * s.r) continue;
          const d = Math.sqrt(d2) || 1e-3;
          const facing = (nx * dx + ny * dy + nz * dz) / Math.hypot(dx, dy, dz);
          if (facing < -0.35) continue;   // (the far side of a wall)
          // line of sight: march from just off the surface to the source
          const ex = s.x - sx, ey = s.y - sy, ez = s.z - sz, len = Math.hypot(ex, ey, ez);
          let minF = 9;
          const n = Math.max(2, Math.min(40, Math.ceil(len / 0.8)));
          for (let i = 1; i < n; i++) {
            const t = i / n, f = field(sx + ex * t, sy + ey * t, sz + ez * t);
            if (f < minF) { minF = f; if (minF < 0) break; }
          }
          const vis = smoothstep(0.0, 0.5, minF);
          if (vis <= 0) continue;
          const f = 1 - d / s.r;
          const w = f * f * s.k * (0.55 + 0.45 * Math.max(0, facing)) * vis;
          r += s.c.r * w; g += s.c.g * w; b += s.c.b * w;
        }
        const mx = Math.max(r, g, b);
        if (mx > 0.002) {
          const k = soft(mx) / mx / GLOW_RANGE;
          gl[v * 3] = Math.min(1, r * k); gl[v * 3 + 1] = Math.min(1, g * k); gl[v * 3 + 2] = Math.min(1, b * k);
          glowVerts++;
        }
      }
    }
    ch.lt = lt; ch.gl = gl;
    verts += m;
  }
  return { vertices: verts, glowVertices: glowVerts, shimmerVertices: shimVerts, meanAo: aoSum / Math.max(1, verts), ms: performance.now() - t0 };
}

/** Numbers of the sources for the bake's key (positions and strengths: a changed decor layout makes a stale bake). */
export function sourceProbe(sources) {
  const out = [LIGHT_VERSION, sources.length];
  for (let i = 0; i < sources.length; i += Math.max(1, Math.floor(sources.length / 40))) {
    const s = sources[i];
    out.push(s.x, s.y, s.z, s.r, s.k, s.c.r, s.c.g, s.c.b);
  }
  return out;
}
