// Builds the smooth island mesh from the shared Terrain grid, colored with the
// biome's palette. The grid is indexed (shared vertices), so the ground is
// smooth-shaded; the triangulation matches Terrain.heightAt() exactly.
// Cells far out on the sea floor are skipped (the sea covers them).

import * as THREE from 'three';
import { fbm, smoothstep } from '../../shared/rng.js';

const JUNGLE = {
  sandDry: '#f6d08a', sand: '#efc176', sandWet: '#d9a862', seabed: '#e2bd7a', seabedDeep: '#b99a68',
  grass: '#7cc34a', grassLight: '#95d256', grassDark: '#5ea83a', floor: '#4c9434', high: '#86c650',
  rock: '#aa9fb4', rockDark: '#8d82a0', rockWarm: '#b59c90', dirt: '#c9985c', dirtDark: '#b0814c', riverbed: '#b3a27a',
};

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @param {ReturnType<import('../../shared/layout.js').buildLayout>} layout
 */
export function buildTerrainMesh(terrain, layout) {
  const n = terrain.n, cell = terrain.cell, half = terrain.half;
  const stride = n + 1;
  const plan = layout.plan;
  const S = plan.seed;
  const volcanic = layout.biome.id === 'volcano';
  const P = Object.fromEntries(Object.entries({ ...JUNGLE, ...layout.biome.terrain }).map(([k, v]) => [k, new THREE.Color(v)]));
  const hut = layout.hut;
  const v = plan.volcano;

  const color = new THREE.Color();
  const base = new THREE.Color();
  const rock = new THREE.Color();
  const sand = new THREE.Color();

  const vertexColor = (x, y, z, slope) => {
    const lava = terrain.lavaLevelAt(x, z);
    const water = terrain.waterLevelAt(x, z);
    if (water !== null && y < water) {
      color.copy(water > 0.3 ? P.riverbed : P.seabed).lerp(P.seabedDeep, smoothstep(0.5, 8, water - y));
      return color;
    }
    if (lava !== null && y < lava + 0.2) return color.copy(P.scorch || P.rockDark);
    const noise = fbm(x * 0.04, z * 0.04, 3, S + 91) * 0.5 + 0.5;
    base.copy(P.grass).lerp(P.grassLight, smoothstep(0.45, 0.8, noise));
    base.lerp(P.grassDark, 1 - smoothstep(0.25, 0.5, noise));
    base.lerp(P.floor, smoothstep(0.55, 1, layout.jungleDensity(x, z)) * 0.75);
    base.lerp(P.high, smoothstep(14, 26, y) * (1 - smoothstep(0.45, 0.8, slope)) * 0.6);
    if (volcanic && P.ash) {
      // ash fields: patchy near the coast, total on the volcano flanks
      const patch = smoothstep(0.35, 0.7, fbm(x * 0.025 + 7, z * 0.025, 3, S + 97) * 0.5 + 0.5);
      let ash = patch * 0.85;
      if (v) ash = Math.max(ash, 1 - smoothstep(v.radius * 0.55, v.radius * 0.95, Math.hypot(x - v.x, z - v.z)));
      base.lerp(P.ash, ash);
    }

    // Patchy hue variety in the greens (yellow-green clearings, teal shade).
    const hueN = fbm(x * 0.018 + 11, z * 0.018 - 4, 3, S + 98);
    base.offsetHSL(hueN * 0.035, fbm(x * 0.05, z * 0.05, 2, S + 99) * 0.08, 0);

    const beachLine = 1.9 + fbm(x * 0.05, z * 0.05, 2, S + 90) * 0.6;
    sand.copy(P.sandWet).lerp(P.sandDry, smoothstep(0.35, 1.65, y));
    sand.lerp(P.sand, 0.25 + noise * 0.3);
    color.copy(sand).lerp(base, smoothstep(beachLine - 0.7, beachLine + 0.9, y));

    // Cliffs and steep slopes: layered stone with warm and cool bands.
    const warp = fbm(x * 0.07, z * 0.07, 2, S + 95) * 2;
    const strata = Math.sin(y * 2.6 + warp);
    const band = Math.sin(y * 0.9 + warp * 0.5 + fbm(x * 0.02, z * 0.02, 2, S + 94) * 3);
    rock.copy(P.rock).lerp(P.rockWarm, smoothstep(0.2, 0.9, strata) * 0.55);
    rock.lerp(P.rockDark, smoothstep(0.3, -0.7, strata) * 0.45);
    rock.offsetHSL(band * 0.025, band * 0.05, band * 0.03);
    // mossy ledges on green islands
    if (!volcanic) rock.lerp(P.grassDark, smoothstep(0.5, 0.95, fbm(x * 0.09, z * 0.09, 2, S + 93) * 0.5 + 0.5) * 0.35);
    color.lerp(rock, smoothstep(0.45, 1.15, slope) * smoothstep(1.5, 3.5, y));

    // Muddy / sandy banks along the river and around pools.
    if (water === null) {
      const nearWater = terrain.waterLevelAt(x + 2.5, z) !== null || terrain.waterLevelAt(x - 2.5, z) !== null
        || terrain.waterLevelAt(x, z + 2.5) !== null || terrain.waterLevelAt(x, z - 2.5) !== null;
      if (nearWater && y > 1.5) color.lerp(P.riverbed, 0.55);
    }
    // Scorched ground next to lava.
    if (lava === null && volcanic) {
      const hot = terrain.lavaLevelAt(x + 3, z) !== null || terrain.lavaLevelAt(x - 3, z) !== null
        || terrain.lavaLevelAt(x, z + 3) !== null || terrain.lavaLevelAt(x, z - 3) !== null;
      if (hot) color.lerp(P.scorch || P.rockDark, 0.75);
    }

    const pd = layout.distToPath(x, z);
    const pathW = 1.7 + fbm(x * 0.12, z * 0.12, 2, S + 92) * 0.5;
    base.copy(P.dirt).lerp(P.dirtDark, 0.25 + noise * 0.3);
    color.lerp(base, (1 - smoothstep(pathW - 0.35, pathW + 1.5, pd)) * 0.9);
    const hd = Math.hypot(x - hut.campfire.x, z - hut.campfire.z);
    color.lerp(base, (1 - smoothstep(6, 13, hd)) * 0.9);
    // fine speckle so large areas never look flat
    color.offsetHSL(0, fbm(x * 0.33, z * 0.33, 2, S + 97) * 0.03, fbm(x * 0.19, z * 0.19, 2, S + 96) * 0.03);
    return color;
  };

  // vertices (all of them; unused ones are cheap) + colors
  const pos = new Float32Array(stride * stride * 3);
  const col = new Float32Array(stride * stride * 3);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -half + i * cell, z = -half + j * cell;
      const y = terrain.h(i, j);
      const k = (j * stride + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      if (y < -12) { col[k] = P.seabedDeep.r; col[k + 1] = P.seabedDeep.g; col[k + 2] = P.seabedDeep.b; continue; }
      const dx = (terrain.h(i + 1, j) - terrain.h(i - 1, j)) / (2 * cell);
      const dz = (terrain.h(i, j + 1) - terrain.h(i, j - 1)) / (2 * cell);
      const c = vertexColor(x, y, z, Math.hypot(dx, dz));
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }

  // Matches Terrain.heightAt(): T1 = (00, 01, 10), T2 = (10, 01, 11)
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      // skip cells entirely on the deep sea floor
      if (pos[a * 3 + 1] < -13 && pos[b * 3 + 1] < -13 && pos[c * 3 + 1] < -13 && pos[d * 3 + 1] < -13) continue;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();     // indexed -> smooth normals across cells
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
