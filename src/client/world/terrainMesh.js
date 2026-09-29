// Builds the faceted island mesh from the shared Terrain grid.
// Non-indexed triangles with one color per face give the flat low-poly look.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { fbm, hash2, smoothstep } from '../../shared/rng.js';

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

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const color = new THREE.Color();
  let p = 0;

  const faceColor = (cx, cy, cz, ny, seedA, seedB) => {
    const jitter = (hash2(seedA, seedB, S) - 0.5) * 0.07;
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.05);
    const water = terrain.waterLevelAt(cx, cz);
    if (water !== null && cy < water) {
      const depth = water - cy;
      color.copy(PAL.seabed).lerp(PAL.seabedDeep, smoothstep(0.5, 8, depth));
    } else if (slope > 0.95) {
      // cliffs: violet-grey strata with warmer bands
      const band = Math.floor(cy / 2.3);
      const warm = hash2(band, 7, S) > 0.62;
      color.copy(warm ? PAL.rockWarm : PAL.rock).lerp(PAL.rockDark, hash2(band, 3, S) * 0.55);
    } else {
      const beachLine = 1.9 + fbm(cx * 0.05, cz * 0.05, 2, S + 90) * 0.6;
      const jd = layout.jungleDensity(cx, cz);
      if (cy < beachLine) {
        color.copy(cy < 0.55 ? PAL.sandWet : PAL.sandDry).lerp(PAL.sand, hash2(seedA, seedB, S + 1) * 0.6);
      } else {
        const g = fbm(cx * 0.04, cz * 0.04, 3, S + 91) * 0.5 + 0.5;
        color.copy(PAL.grass).lerp(PAL.grassLight, smoothstep(0.45, 0.8, g)).lerp(PAL.grassDark, smoothstep(0.5, 0.25, g) * 0.6);
        color.lerp(PAL.jungle, smoothstep(0.55, 1.0, jd) * 0.75);
        if (cy > 11 && slope < 0.5) color.lerp(PAL.mesaTop, 0.6);
        // mossy transition just below a cliff lip
        if (slope > 0.6) color.lerp(PAL.rock, smoothstep(0.6, 0.95, slope) * 0.8);
        // dirt paths + trampled hut clearing
        const pd = layout.distToPath(cx, cz);
        const pathW = 1.6 + fbm(cx * 0.2, cz * 0.2, 1, S + 92) * 0.7;
        if (pd < pathW) color.copy(PAL.dirt).lerp(PAL.dirtDark, hash2(seedA, seedB, S + 2) * 0.5);
        else if (pd < pathW + 1.2) color.lerp(PAL.dirt, 0.4);
        const hd = Math.hypot(cx - hut.campfire.x, cz - hut.campfire.z);
        if (hd < 9 + fbm(cx * 0.3, cz * 0.3, 1, S + 93) * 2) color.copy(PAL.dirt).lerp(PAL.grass, smoothstep(5, 10, hd) * 0.6);
        // sandy fringe near the lake shore
        if (Math.abs(cy - lake) < 0.9 && terrain.waterLevelAt(cx, cz) === null) {
          const dl = Math.hypot(cx - 57, cz + 7);
          if (dl < 26) color.lerp(PAL.sand, 0.55);
        }
      }
    }
    color.offsetHSL(0, 0, jitter);
    return color;
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -half + i * cell, x1 = x0 + cell;
      const z0 = -half + j * cell, z1 = z0 + cell;
      const h00 = terrain.h(i, j), h10 = terrain.h(i + 1, j), h01 = terrain.h(i, j + 1), h11 = terrain.h(i + 1, j + 1);
      // Matches Terrain.heightAt(): T1 = (00, 01, 10), T2 = (10, 01, 11)
      const tris = [
        [x0, h00, z0, x0, h01, z1, x1, h10, z0],
        [x1, h10, z0, x0, h01, z1, x1, h11, z1],
      ];
      for (let k = 0; k < 2; k++) {
        const t = tris[k];
        a.set(t[0], t[1], t[2]); b.set(t[3], t[4], t[5]); c.set(t[6], t[7], t[8]);
        e1.subVectors(b, a); e2.subVectors(c, a); nrm.crossVectors(e1, e2).normalize();
        if (nrm.y < 0) nrm.negate();
        const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
        const fc = faceColor(cx, cy, cz, nrm.y, i * 2 + k, j);
        for (let v = 0; v < 9; v++) pos[p + v] = t[v];
        for (let v = 0; v < 3; v++) { col[p + v * 3] = fc.r; col[p + v * 3 + 1] = fc.g; col[p + v * 3 + 2] = fc.b; }
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
