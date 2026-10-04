// Builds the smooth island mesh from the shared Terrain grid, colored with the
// biome's palette. The grid is indexed (shared vertices), so the ground is
// smooth-shaded; the triangulation matches Terrain.heightAt() exactly.
// Cells far out on the sea floor are skipped (the sea covers them).

import * as THREE from 'three';
import { fbm, smoothstep } from '../../shared/rng.js';
import { BIOMES } from '../../shared/levels.js';
import { causewayQuery } from '../../shared/bossArena.js';
import { withSurfaceDetail, setSurfaceBiome } from './surfaceDetail.js';

const JUNGLE = {
  sandDry: '#f6d08a', sand: '#efc176', sandWet: '#d9a862', seabed: '#e2bd7a', seabedDeep: '#b99a68',
  grass: '#7cc34a', grassLight: '#95d256', grassDark: '#5ea83a', floor: '#4c9434', high: '#86c650',
  rock: '#aa9fb4', rockDark: '#8d82a0', rockWarm: '#b59c90', dirt: '#c9985c', dirtDark: '#b0814c', riverbed: '#b3a27a',
};
// Boss arena ground (see world/bossArena.js): the volcano island's darkest stone
const VOLCANO = Object.fromEntries(['rock', 'rockDark', 'ash', 'scorch'].map((k) => [k, new THREE.Color(BIOMES.volcano.terrain[k]).multiplyScalar(0.7)]));
const EMBER = new THREE.Color('#7a2a12');
const CAUSEWAY = new THREE.Color('#6a5f62');
// Wet ground at the water line and under the waterfall
const WET = new THREE.Color();          // scratch: the ground's own colour, darkened
const WET_ROCK = new THREE.Color('#4a4652');
const WET_MOSS = new THREE.Color('#3f6e3a');

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
  const swamp = layout.biome.id === 'swamp';
  const P = Object.fromEntries(Object.entries({ ...JUNGLE, ...layout.biome.terrain }).map(([k, v]) => [k, new THREE.Color(v)]));
  const hut = layout.hut;
  const v = plan.volcano;
  const arena = layout.bossArena;
  const falls = (layout.waterfalls || []).filter((wf) => wf.kind !== 'lava' && wf.impact);

  const color = new THREE.Color();
  const base = new THREE.Color();
  const rock = new THREE.Color();
  const sand = new THREE.Color();
  // surface weights for the detail shader (surfaceDetail.js), written by vertexColor()
  const surf = { sand: 0, rock: 0, path: 0, forest: 0, wet: 0, ash: 0 };

  const vertexColor = (x, y, z, slope) => {
    surf.sand = surf.rock = surf.path = surf.forest = surf.wet = surf.ash = 0;
    const lava = terrain.lavaLevelAt(x, z);
    const water = terrain.waterLevelAt(x, z);
    if (water !== null && y < water) {
      // bog water (swamp): dark mud with leaf litter under a hand's breadth of water
      if (swamp && terrain.bogAt(x, z) > 0.02) {
        surf.wet = 1; surf.path = 0.7; surf.forest = 0.35;
        return color.copy(P.mud).lerp(P.bog, smoothstep(0.04, 0.26, water - y));
      }
      surf.sand = 1; surf.wet = 1;
      color.copy(water > 0.3 ? P.riverbed : P.seabed).lerp(P.seabedDeep, smoothstep(0.5, 8, water - y));
      return color;
    }
    if (lava !== null && y < lava + 0.2) { surf.rock = 1; surf.ash = 1; return color.copy(P.scorch || P.rockDark); }
    const noise = fbm(x * 0.04, z * 0.04, 3, S + 91) * 0.5 + 0.5;
    base.copy(P.grass).lerp(P.grassLight, smoothstep(0.45, 0.8, noise));
    base.lerp(P.grassDark, 1 - smoothstep(0.25, 0.5, noise));
    const dense = layout.jungleDensity(x, z);
    base.lerp(P.floor, smoothstep(0.55, 1, dense) * 0.75);
    surf.forest = smoothstep(0.45, 0.95, dense);
    base.lerp(P.high, smoothstep(14, 26, y) * (1 - smoothstep(0.45, 0.8, slope)) * 0.6);
    if (volcanic && P.ash) {
      // ash fields: patchy near the coast, total on the volcano flanks
      const patch = smoothstep(0.35, 0.7, fbm(x * 0.025 + 7, z * 0.025, 3, S + 97) * 0.5 + 0.5);
      let ash = patch * 0.85;
      if (v) ash = Math.max(ash, 1 - smoothstep(v.radius * 0.55, v.radius * 0.95, Math.hypot(x - v.x, z - v.z)));
      // the cooler green pockets (layout.greenPocket) keep some grass
      ash *= 1 - 0.8 * (layout.greenPocket?.(x, z) ?? 0);
      base.lerp(P.ash, ash);
      surf.ash = ash;
    }

    // Patchy hue variety in the greens (yellow-green clearings, teal shade).
    const hueN = fbm(x * 0.018 + 11, z * 0.018 - 4, 3, S + 98);
    base.offsetHSL(hueN * 0.035, fbm(x * 0.05, z * 0.05, 2, S + 99) * 0.08, 0);

    // (the swamp's lowland lies low: only a narrow strip at the sea is beach)
    const beachLine = swamp ? 0.95 + fbm(x * 0.05, z * 0.05, 2, S + 90) * 0.35 : 1.9 + fbm(x * 0.05, z * 0.05, 2, S + 90) * 0.6;
    sand.copy(P.sandWet).lerp(P.sandDry, smoothstep(0.35, 1.65, y));
    sand.lerp(P.sand, 0.25 + noise * 0.3);
    const grassK = smoothstep(beachLine - 0.7, beachLine + 0.9, y);
    color.copy(sand).lerp(base, grassK);
    surf.sand = 1 - grassK;

    // Cliffs and steep slopes: layered stone with warm and cool bands.
    const warp = fbm(x * 0.07, z * 0.07, 2, S + 95) * 2;
    const strata = Math.sin(y * 2.6 + warp);
    const band = Math.sin(y * 0.9 + warp * 0.5 + fbm(x * 0.02, z * 0.02, 2, S + 94) * 3);
    rock.copy(P.rock).lerp(P.rockWarm, smoothstep(0.2, 0.9, strata) * 0.55);
    rock.lerp(P.rockDark, smoothstep(0.3, -0.7, strata) * 0.45);
    rock.offsetHSL(band * 0.025, band * 0.05, band * 0.03);
    // mossy ledges on green islands
    if (!volcanic) rock.lerp(P.grassDark, smoothstep(0.5, 0.95, fbm(x * 0.09, z * 0.09, 2, S + 93) * 0.5 + 0.5) * 0.35);
    surf.rock = smoothstep(0.45, 1.15, slope) * smoothstep(1.5, 3.5, y);
    color.lerp(rock, surf.rock);

    // Muddy / sandy banks along the river and around pools.
    if (water === null) {
      const nearWater = terrain.waterLevelAt(x + 2.5, z) !== null || terrain.waterLevelAt(x - 2.5, z) !== null
        || terrain.waterLevelAt(x, z + 2.5) !== null || terrain.waterLevelAt(x, z - 2.5) !== null;
      if (nearWater && y > 1.5) color.lerp(P.riverbed, 0.55);
    }
    // Wet ground just above the water line: darker, glossier-looking sand and
    // banks where the surf and the ripples keep it wet (sea, pools, rivers).
    if (water === null && y < 3.5) {
      const wl = Math.max(0, ...[[2, 0], [-2, 0], [0, 2], [0, -2]].map(([ox, oz]) => terrain.waterLevelAt(x + ox, z + oz) ?? -Infinity));
      const above = y - wl;
      // darker in any biome (pale jungle sand and grey volcanic sand alike)
      if (above < 0.7) color.lerp(WET.copy(color).multiplyScalar(0.68), 1 - smoothstep(0.05, 0.7, above));
      surf.wet = 1 - smoothstep(0.05, 1.4, above);
    }
    // The rock the waterfall runs down: dark, wet stone with a little moss.
    for (const wf of falls) {
      const vx = wf.impact.x - wf.top.x, vz = wf.impact.z - wf.top.z;
      const L2 = vx * vx + vz * vz || 1;
      const u = Math.max(0, Math.min(1, ((x - wf.top.x) * vx + (z - wf.top.z) * vz) / L2));
      const d = Math.hypot(wf.top.x + vx * u - x, wf.top.z + vz * u - z);
      const k = (1 - smoothstep(wf.width * 0.5, wf.width * 0.5 + 2.2, d)) * (y > wf.impact.y - 0.2 && y < wf.top.y + 0.6 ? 1 : 0);
      if (k > 0) color.lerp(WET_ROCK, k * 0.7).lerp(WET_MOSS, k * 0.25 * smoothstep(0.3, 0.8, noise));
    }
    // Scorched ground round the lava and the fumaroles (Terrain.heatAt), with
    // glowing cracks right at the lava; the crater floor dark basalt; the
    // basalt bridges over the flows a lighter grey so the way across stands out.
    if (lava === null && volcanic) {
      const heat = terrain.heatAt(x, z);
      if (heat > 0.05) {
        color.lerp(P.scorch || P.rockDark, smoothstep(0.05, 0.7, heat) * 0.8);
        const crack = smoothstep(0.55, 0.85, Math.abs(fbm(x * 0.35, z * 0.35, 2, S + 87)) * 2.2);
        color.lerp(EMBER, smoothstep(0.6, 0.95, heat) * crack * 0.7);
        surf.ash = Math.max(surf.ash, smoothstep(0.05, 0.5, heat));
      }
      if (v && Math.hypot(x - v.x, z - v.z) < v.craterR) {
        color.lerp(base.copy(VOLCANO.rock).lerp(VOLCANO.rockDark, noise), 0.7);
        surf.ash = Math.max(surf.ash, 0.6);
      }
      // the small craters: scorched dark bowls, a glow of embers at the bottom of some
      for (const c of layout.craters || []) {
        if (Math.abs(x - c.x) > c.r * 1.4 || Math.abs(z - c.z) > c.r * 1.4) continue;
        const k = Math.hypot(x - c.x, z - c.z) / c.r;
        if (k > 1.4) continue;
        color.lerp(P.scorch || P.rockDark, (1 - smoothstep(0.7, 1.4, k)) * 0.85);
        if (c.ember) color.lerp(EMBER, (1 - smoothstep(0, 0.5, k)) * 0.6);
        surf.ash = Math.max(surf.ash, 1 - smoothstep(0.9, 1.4, k));
        surf.forest = 0;
      }
      for (const b of layout.bridges || []) {
        const k = 1 - smoothstep(b.r - 1.5, b.r + 1, Math.hypot(x - b.x, z - b.z));
        if (k > 0) color.lerp(base.copy(CAUSEWAY).lerp(VOLCANO.ash, 0.2 + noise * 0.3), k * 0.85);
      }
    }

    const pd = layout.distToPath(x, z);
    // trails are worn-in, not painted: varying width, patchy, fading in and out
    const pathW = 1.3 + fbm(x * 0.09, z * 0.09, 2, S + 92) * 0.9;
    const worn = smoothstep(-0.35, 0.35, fbm(x * 0.06 + 3, z * 0.06, 3, S + 89)) * 0.55 + 0.2;
    base.copy(P.dirt).lerp(P.dirtDark, 0.25 + noise * 0.3).lerp(color, 0.25);
    const trail = (1 - smoothstep(pathW - 0.5, pathW + 1.8, pd + fbm(x * 0.4, z * 0.4, 2, S + 88) * 0.8)) * worn;
    color.lerp(base, trail);
    const hd = Math.hypot(x - hut.campfire.x, z - hut.campfire.z);
    const camp = (1 - smoothstep(6, 13, hd)) * 0.9;
    color.lerp(base, camp);
    surf.path = Math.min(1, Math.max(trail, camp) * 1.3) * (1 - surf.rock);
    // bog shores and mud islands (swamp): dark wet mud, packed and glossy
    if (swamp) {
      const bog = terrain.bogAt(x, z);
      if (bog > 0.01) {
        const k = smoothstep(0.01, 0.45, bog);
        color.lerp(base.copy(P.mud).lerp(P.bog, noise * 0.4), k * 0.85);
        surf.wet = Math.max(surf.wet, k);
        surf.path = Math.max(surf.path, k * 0.6);
        surf.sand *= 1 - k;
      }
    }
    // the boss arena: dark basalt and ash like the volcano island, glowing-hot
    // scorch along the lava, a dark causeway – fading into the beach outside
    if (arena) {
      const ad = Math.hypot(x - arena.center.x, z - arena.center.z);
      const k = 1 - smoothstep(arena.outerR - 4, arena.outerR + 10, ad);
      if (k > 0) {
        const ashN = fbm(x * 0.06 + 5, z * 0.06, 3, S + 61) * 0.5 + 0.5;
        base.copy(VOLCANO.rock).lerp(VOLCANO.rockDark, smoothstep(0.3, 0.7, ashN)).lerp(VOLCANO.ash, smoothstep(0.6, 0.9, ashN) * 0.6);
        base.lerp(VOLCANO.scorch, smoothstep(0.8, 1.4, slope) * 0.5);
        const hot = lava !== null || terrain.lavaLevelAt(x + 3, z) !== null || terrain.lavaLevelAt(x - 3, z) !== null
          || terrain.lavaLevelAt(x, z + 3) !== null || terrain.lavaLevelAt(x, z - 3) !== null;
        if (hot) base.lerp(EMBER, 0.35).lerp(VOLCANO.scorch, 0.4);
        // the causeway: lighter, ash-grey basalt so the way across stands out from the dark rim
        if (causewayQuery(arena, x, z).d < arena.causewayW / 2 + 0.6) base.copy(CAUSEWAY).lerp(VOLCANO.ash, 0.2 + noise * 0.3);
        color.lerp(base, k);
        surf.ash = Math.max(surf.ash, k);
        surf.forest *= 1 - k;
      }
    }
    // fine speckle so large areas never look flat
    color.offsetHSL(0, fbm(x * 0.33, z * 0.33, 2, S + 97) * 0.03, fbm(x * 0.19, z * 0.19, 2, S + 96) * 0.03);
    return color;
  };

  // vertices (all of them; unused ones are cheap) + colors
  const pos = new Float32Array(stride * stride * 3);
  const col = new Float32Array(stride * stride * 3);
  const sf = new Float32Array(stride * stride * 4);
  const sf2 = new Float32Array(stride * stride * 2);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -half + i * cell, z = -half + j * cell;
      const y = terrain.h(i, j);
      const k = (j * stride + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const ks = (j * stride + i) * 4, k2 = (j * stride + i) * 2;
      if (y < -12) { col[k] = P.seabedDeep.r; col[k + 1] = P.seabedDeep.g; col[k + 2] = P.seabedDeep.b; sf[ks] = 1; sf2[k2] = 1; continue; }
      const dx = (terrain.h(i + 1, j) - terrain.h(i - 1, j)) / (2 * cell);
      const dz = (terrain.h(i, j + 1) - terrain.h(i, j - 1)) / (2 * cell);
      const c = vertexColor(x, y, z, Math.hypot(dx, dz));
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      sf[ks] = surf.sand; sf[ks + 1] = surf.rock; sf[ks + 2] = surf.path; sf[ks + 3] = surf.forest;
      sf2[k2] = surf.wet; sf2[k2 + 1] = surf.ash;
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
  geo.setAttribute('surface', new THREE.BufferAttribute(sf, 4));
  geo.setAttribute('surface2', new THREE.BufferAttribute(sf2, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();     // indexed -> smooth normals across cells
  geo.computeBoundingSphere();
  setSurfaceBiome(layout.biome);
  const mat = withSurfaceDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'terrain');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
