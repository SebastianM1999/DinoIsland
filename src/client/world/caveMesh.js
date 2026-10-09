// The roof of the Hollow Mountain: a smooth, down-facing mesh built from
// Terrain.ceilings (same grid and triangle split as Terrain.ceilingAt), drawn
// only where the roof can be seen: over the tunnels, the chambers and the first
// rows of cells inside the rock. The terrain wall crosses the roof inside those
// cells, so the two surfaces overlap and no sky shows through; cells deep in
// solid rock and the open canyons / coves (ceiling >= CAVE_SKY) get no roof.
//
// Each cell is split 2x2 and given a few low bumps; vertex colours: dark wet stone
// with bands, pale flowstone streaks, a darker rim where the roof meets the walls,
// the baked crystal / daylight glow comes per pixel from the shared glow texture (caveStyle.js). The mesh
// is cut into chunks so the camera culls it.

import * as THREE from 'three';
import { fbm, smoothstep } from '../../shared/rng.js';
import { ROOF_EDGE } from './caveSky.js';

const CHUNK = 10;          // grid cells per chunk side
const SUB = 2;             // subdivision per cell

function cellHasRoof(terrain, sky, n1, i, j) {
  let open = false;
  for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const k = (j + dj) * n1 + i + di;
    if (sky.depth[k] < ROOF_EDGE) return false;
    // a corner inside a tunnel or chamber (the open-space field); low ground near the outer cliff is no tunnel:
    // a roof there poked out of the mountain's flank as dark triangles
    if (sky.open[k] && terrain.h(i + di, j + dj) <= sky.roof[k] + 1.5) open = true;
  }
  return open;
}

/** Number of grid cells that get a roof (for tests / stats). */
export function roofCells(terrain, sky) {
  const { n } = terrain, n1 = n + 1, out = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (cellHasRoof(terrain, sky, n1, i, j)) out.push(j * n + i);
  return out;
}

/**
 * @returns {THREE.Group} chunked roof meshes
 */
export function buildCaveRoof(terrain, layout, material, sky) {
  const group = new THREE.Group();
  group.name = 'cave-roof';
  const n = terrain.n, n1 = n + 1, cell = terrain.cell, half = terrain.half;
  const S = layout.plan.seed;
  const P = Object.fromEntries(Object.entries(layout.biome.terrain).map(([k, v]) => [k, new THREE.Color(v)]));

  // the roof (the shared field without its open-sky term), bilinear on the grid's triangle split
  const C = sky.roof;
  const raw = (x, z) => {
    const gx = (x + half) / cell, gz = (z + half) / cell;
    const i = Math.min(n - 1, Math.max(0, Math.floor(gx))), j = Math.min(n - 1, Math.max(0, Math.floor(gz)));
    const fx = gx - i, fz = gz - j;
    const c00 = C[j * n1 + i], c10 = C[j * n1 + i + 1], c01 = C[(j + 1) * n1 + i], c11 = C[(j + 1) * n1 + i + 1];
    return fx + fz < 1 ? c00 + (c10 - c00) * fx + (c01 - c00) * fz : c11 + (c01 - c11) * (1 - fx) + (c10 - c11) * (1 - fz);
  };
  // low, broad hollows and ridges in the stone (never up: nobody's head meets the roof)
  const bump = (x, z) => 0.5 * (fbm(x * 0.11 + 3, z * 0.11, 2, S + 301) * 0.5 + 0.5) + 0.35 * (fbm(x * 0.3, z * 0.3 + 5, 2, S + 302) * 0.5 + 0.5);
  const roofY = (x, z) => raw(x, z) - bump(x, z);

  const color = new THREE.Color(), tint = new THREE.Color();
  const E = 0.6;

  const chunks = new Map();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!cellHasRoof(terrain, sky, n1, i, j)) continue;
      const key = `${Math.floor(i / CHUNK)}:${Math.floor(j / CHUNK)}`;
      let l = chunks.get(key);
      if (!l) chunks.set(key, l = []);
      l.push(i, j);
    }
  }

  for (const cells of chunks.values()) {
    const count = cells.length / 2;
    const vcount = count * (SUB + 1) * (SUB + 1);
    const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3);
    const sf = new Float32Array(vcount * 4), sf2 = new Float32Array(vcount * 2);
    const idx = [];
    let v = 0;
    for (let c = 0; c < count; c++) {
      const ci = cells[c * 2], cj = cells[c * 2 + 1];
      const base = v;
      for (let b = 0; b <= SUB; b++) {
        for (let a = 0; a <= SUB; a++) {
          const x = -half + (ci + a / SUB) * cell, z = -half + (cj + b / SUB) * cell;
          const y = roofY(x, z);
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          // analytic down-facing normal
          const dx = (roofY(x + E, z) - roofY(x - E, z)) / (2 * E), dz = (roofY(x, z + E) - roofY(x, z - E)) / (2 * E);
          const nl = Math.hypot(dx, 1, dz);
          nor[v * 3] = dx / nl; nor[v * 3 + 1] = -1 / nl; nor[v * 3 + 2] = dz / nl;

          // ---- colour: dark wet stone, bands, flowstone, darker at the wall joins
          const gap = y - terrain.heightAt(x, z);                    // distance floor/wall -> roof
          const noise = fbm(x * 0.05, z * 0.05, 3, S + 311) * 0.5 + 0.5;
          const warp = fbm(x * 0.06, z * 0.06, 2, S + 312) * 2;
          const band = Math.sin(x * 0.11 + z * 0.07 + warp * 2.2);
          color.copy(P.rockDark).lerp(P.rock, 0.25 + 0.4 * noise);
          color.lerp(P.rockWarm, smoothstep(0.2, 0.9, band) * 0.35);
          color.offsetHSL(band * 0.02, 0, band * 0.025);
          color.multiplyScalar(0.66);
          const streak = smoothstep(0.62, 0.85, fbm(x * 0.12 + z * 0.1, z * 0.045, 3, S + 313) * 0.5 + 0.5);
          color.lerp(tint.copy(P.flowstone).multiplyScalar(0.8), streak * 0.4);
          color.multiplyScalar(0.55 + 0.45 * smoothstep(0.2, 6.5, gap));   // AO toward the walls
          col[v * 3] = color.r; col[v * 3 + 1] = color.g; col[v * 3 + 2] = color.b;
          sf[v * 4 + 1] = 1; sf[v * 4 + 3] = streak * 0.8;
          sf2[v * 2] = 0.55 + 0.4 * streak;
          v++;
        }
      }
      const w = SUB + 1;
      for (let b = 0; b < SUB; b++) {
        for (let a = 0; a < SUB; a++) {
          const p00 = base + b * w + a, p10 = p00 + 1, p01 = p00 + w, p11 = p01 + 1;
          // the grid's split (10 - 01) seen from below
          idx.push(p00, p10, p01, p10, p11, p01);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('surface', new THREE.BufferAttribute(sf, 4));
    geo.setAttribute('surface2', new THREE.BufferAttribute(sf2, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material);
    m.castShadow = false;
    m.receiveShadow = false;
    m.name = 'cave-roof';
    group.add(m);
  }
  group.userData.roofY = roofY;
  return group;
}
