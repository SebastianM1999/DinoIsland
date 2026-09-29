// Builds the faceted island mesh from the shared Terrain grid.
// Non-indexed triangles keep faceted lighting, while shared vertex colors
// blend across cell boundaries so the ground reads as one landscape.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { fbm, smoothstep } from '../../shared/rng.js';

const C = (hex) => new THREE.Color(hex);
const PAL = {
  sandDry: C('#f6d08a'),
  sand: C('#efc176'),
  sandWet: C('#d9a862'),
  seabed: C('#e2bd7a'),
  seabedDeep: C('#b99a68'),
  grass: C('#7cc34a'),
  grassLight: C('#95d256'),
  grassDark: C('#5ea83a'),
  jungle: C('#4c9434'),
  mesaTop: C('#86c650'),
  rock: C('#aa9fb4'),
  rockDark: C('#8d82a0'),
  rockWarm: C('#b59c90'),
  dirt: C('#c9985c'),
  dirtDark: C('#b0814c'),
};

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @param {ReturnType<import('../../shared/layout.js').buildLayout>} layout
 */
export function buildTerrainMesh(terrain, layout) {
  const n = terrain.n, cell = terrain.cell, half = terrain.half;
  const triCount = n * n * 2;
  const pos = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const S = CONFIG.world.seed;
  const lake = CONFIG.world.lakeLevel;
  const hut = layout.hut;

  const color = new THREE.Color();
  const base = new THREE.Color();
  const rock = new THREE.Color();
  const sand = new THREE.Color();
  let p = 0;

  const vertexColor = (x, y, z, slope) => {
    const water = terrain.waterLevelAt(x, z);
    if (water !== null && y < water) {
      color.copy(PAL.seabed).lerp(PAL.seabedDeep, smoothstep(0.5, 8, water - y));
      return color;
    }
    const noise = fbm(x * 0.04, z * 0.04, 3, S + 91) * 0.5 + 0.5;
    base.copy(PAL.grass).lerp(PAL.grassLight, smoothstep(0.45, 0.8, noise));
    base.lerp(PAL.grassDark, 1 - smoothstep(0.25, 0.5, noise));
    base.lerp(PAL.jungle, smoothstep(0.55, 1, layout.jungleDensity(x, z)) * 0.75);
    base.lerp(PAL.mesaTop, smoothstep(10, 15, y) * (1 - smoothstep(0.45, 0.8, slope)) * 0.6);

    const beachLine = 1.9 + fbm(x * 0.05, z * 0.05, 2, S + 90) * 0.6;
    sand.copy(PAL.sandWet).lerp(PAL.sandDry, smoothstep(0.35, 1.65, y));
    sand.lerp(PAL.sand, 0.25 + noise * 0.3);
    color.copy(sand).lerp(base, smoothstep(beachLine - 0.7, beachLine + 0.9, y));

    // Continuous cliff and path masks avoid a checkerboard of colored faces.
    const strata = Math.sin(y * 2.6 + fbm(x * 0.07, z * 0.07, 2, S + 95) * 2);
    rock.copy(PAL.rock).lerp(PAL.rockWarm, smoothstep(0.2, 0.9, strata) * 0.45);
    rock.lerp(PAL.rockDark, smoothstep(0.3, -0.7, strata) * 0.35);
    color.lerp(rock, smoothstep(0.45, 1.15, slope) * smoothstep(1.5, 3.5, y));

    const pd = layout.distToPath(x, z);
    const pathW = 1.7 + fbm(x * 0.12, z * 0.12, 2, S + 92) * 0.5;
    base.copy(PAL.dirt).lerp(PAL.dirtDark, 0.25 + noise * 0.3);
    color.lerp(base, (1 - smoothstep(pathW - 0.35, pathW + 1.5, pd)) * 0.9);
    const hd = Math.hypot(x - hut.campfire.x, z - hut.campfire.z);
    color.lerp(base, (1 - smoothstep(6, 13, hd)) * 0.9);
    if (Math.hypot(x - 57, z + 7) < 27 && water === null) {
      color.lerp(PAL.sand, (1 - smoothstep(0.2, 1.7, Math.abs(y - lake))) * 0.45);
    }
    color.offsetHSL(0, 0, fbm(x * 0.19, z * 0.19, 2, S + 96) * 0.018);
    return color;
  };

  const stride = n + 1;
  const vertexColors = new Float32Array(stride * stride * 3);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -half + i * cell, z = -half + j * cell;
    const y = terrain.h(i, j);
    const dx = (terrain.h(i + 1, j) - terrain.h(i - 1, j)) / (2 * cell);
    const dz = (terrain.h(i, j + 1) - terrain.h(i, j - 1)) / (2 * cell);
    const c = vertexColor(x, y, z, Math.hypot(dx, dz));
    const k = (j * stride + i) * 3;
    vertexColors[k] = c.r; vertexColors[k + 1] = c.g; vertexColors[k + 2] = c.b;
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -half + i * cell, x1 = x0 + cell;
      const z0 = -half + j * cell, z1 = z0 + cell;
      const h00 = terrain.h(i, j), h10 = terrain.h(i + 1, j), h01 = terrain.h(i, j + 1), h11 = terrain.h(i + 1, j + 1);
      // Matches Terrain.heightAt(): T1 = (00, 01, 10), T2 = (10, 01, 11)
      const tris = [
        { coords: [x0, h00, z0, x0, h01, z1, x1, h10, z0], ids: [j * stride + i, (j + 1) * stride + i, j * stride + i + 1] },
        { coords: [x1, h10, z0, x0, h01, z1, x1, h11, z1], ids: [j * stride + i + 1, (j + 1) * stride + i, (j + 1) * stride + i + 1] },
      ];
      for (let k = 0; k < 2; k++) {
        const t = tris[k];
        for (let v = 0; v < 9; v++) pos[p + v] = t.coords[v];
        for (let v = 0; v < 3; v++) {
          const ci = t.ids[v] * 3;
          col[p + v * 3] = vertexColors[ci];
          col[p + v * 3 + 1] = vertexColors[ci + 1];
          col[p + v * 3 + 2] = vertexColors[ci + 2];
        }
        p += 9;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals(); // non-indexed => flat face normals
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
