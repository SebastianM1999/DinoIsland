// The Hollow Mountain's ground: the two coves (dark sand, wet rock, weed), the
// mountain's outside (a massive banded cliff face) and everything inside it
// (mud and gravel floors, wet layered walls with warm and cool bands, flowstone
// streaks, moss and algae at the water, ambient occlusion where wall meets
// floor). Same grid and triangulation as terrainMesh.js / Terrain.heightAt();
// the fine grain comes from the 'cave' kind of surfaceDetail.js. Crystal and
// daylight glow is baked into the `caveGlow` attribute (caveStyle.js).
//
// surface (sand, cliff, mud, flowstone), surface2 (wet, moss) feed the shader.

import * as THREE from 'three';
import { fbm, smoothstep } from '../../shared/rng.js';
import { caveFloorBase, caveCeiling, caveRockTop } from '../../shared/caveField.js';
import { withSurfaceDetail, setSurfaceBiome, CAVE_GLOW } from './surfaceDetail.js';
import { buildGlowField } from './caveStyle.js';
import { buildSkyField, withCaveSky, CAVE_SKY, ARCH_DEPTH } from './caveSky.js';

const C = (hex) => new THREE.Color(hex);

export function buildCaveTerrainMesh(terrain, layout) {
  const n = terrain.n, cell = terrain.cell, half = terrain.half, stride = n + 1;
  const plan = layout.plan, S = plan.seed;
  const depthAt = plan.cave.depthAt;
  const P = Object.fromEntries(Object.entries(layout.biome.terrain).map(([k, v]) => [k, C(v)]));
  const glow = buildGlowField(layout);

  const color = new THREE.Color(), tmp = new THREE.Color(), rock = new THREE.Color();
  const surf = { sand: 0, cliff: 0, mud: 0, flow: 0, wet: 0, moss: 0 };
  const g = new THREE.Color();

  const nearWater = (x, z, r) => {
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) {
      if (terrain.waterLevelAt(x + ox, z + oz) !== null) return true;
    }
    return false;
  };

  const vertexColor = (x, y, z, slope) => {
    surf.sand = surf.cliff = surf.mud = surf.flow = surf.wet = surf.moss = 0;
    const water = terrain.waterLevelAt(x, z);
    const d = depthAt(x, z);
    const floorB = caveFloorBase(plan, x, z);
    const above = y - floorB;                          // height over the nominal tunnel floor
    const noise = fbm(x * 0.04, z * 0.04, 3, S + 191) * 0.5 + 0.5;
    const warp = fbm(x * 0.05, z * 0.05, 2, S + 195) * 2;

    // ---- wet stone and strata, shared by cliffs and walls
    const strata = Math.sin(y * 1.9 + warp);
    const band = Math.sin(y * 0.65 + warp * 0.6 + fbm(x * 0.02, z * 0.02, 2, S + 194) * 3);
    rock.copy(P.rock).lerp(P.rockWarm, smoothstep(0.1, 0.9, strata) * 0.6);
    rock.lerp(P.rockDark, smoothstep(0.3, -0.8, strata) * 0.5);
    rock.offsetHSL(band * 0.03, band * 0.05, band * 0.035);

    if (water !== null && y < water) {
      surf.wet = 1; surf.sand = 1;
      color.copy(P.riverbed).lerp(P.seabedDeep, smoothstep(0.4, 7, water - y));
      color.lerp(P.moss, 0.25 * smoothstep(0.3, 0.9, noise) * (1 - smoothstep(0.2, 2.5, water - y)));
      return color;
    }

    // ---- outside / inside: above the tunnel roof is the mountain's skin
    const isCliff = d > -3 && above > 9 + 3 * (1 - smoothstep(0, 24, d));   // the rock above the roof line
    const cliffK = smoothstep(7, 14, above) * smoothstep(-6, 4, d);

    // ---- cove ground (outside the mountain)
    const beachK = (1 - smoothstep(0.2, 0.75, slope)) * (1 - smoothstep(4.5, 7, y)) * (1 - cliffK);
    if (beachK > 0.01 && d < 40) {
      const wetK = 1 - smoothstep(0.1, 1.6, y - (terrain.seaLevel ?? 0));
      color.copy(P.sandWet).lerp(P.sandDry, smoothstep(0.4, 2.6, y)).lerp(P.sand, 0.25 + noise * 0.3).multiplyScalar(0.78);
      color.lerp(tmp.copy(color).multiplyScalar(0.62), wetK * 0.8);
      // greenish weed and dark wet rock fragments along the tide line
      color.lerp(P.moss, 0.22 * smoothstep(0.55, 0.85, fbm(x * 0.09, z * 0.09, 2, S + 197) * 0.5 + 0.5) * (1 - wetK * 0.3));
      surf.sand = beachK; surf.wet = wetK * beachK;
    }

    // ---- rock: the mountain face and the cave walls
    let k = Math.max(cliffK, smoothstep(0.25, 0.85, slope));
    if (beachK > 0.01) k = Math.min(k, 1 - beachK + 0.0);
    // the outside is lighter, weathered, mossy on ledges, wet and dark at the sea
    if (cliffK > 0.01) {
      // the layered stone is painted per pixel (surfaceDetail.js): the vertices carry only the broad light and dark,
      // a band sampled once per 2.7 m cell would stripe a steep face
      rock.lerp(tmp.copy(P.rock).lerp(P.rockWarm, 0.3 + 0.4 * noise), cliffK);
      const seaDark = 1 - smoothstep(1.5, 9, y);
      rock.multiplyScalar(0.9 + 0.35 * smoothstep(8, 60, y));
      rock.lerp(P.rockDark, seaDark * 0.5);
      const ledge = smoothstep(0.4, 0.9, fbm(x * 0.07, z * 0.07, 2, S + 193) * 0.5 + 0.5) * (1 - smoothstep(0.3, 0.8, slope));
      rock.lerp(P.moss, ledge * 0.5 * (1 - smoothstep(30, 60, y)));
      surf.cliff = cliffK;
    }
    if (cliffK < 0.99) {
      // ---- cave interior: warmer mineral bands, darker at the foot, wet low down
      const foot = 1 - smoothstep(0.2, 2.4, above);
      const streakN = fbm(x * 0.22 + z * 0.17, y * 0.09, 3, S + 201) * 0.5 + 0.5;
      const flow = smoothstep(0.6, 0.85, streakN) * smoothstep(0.35, 0.8, slope);
      rock.multiplyScalar(0.62 + 0.14 * noise);
      rock.lerp(P.rockDark, foot * 0.35);
      rock.lerp(P.flowstone, flow * 0.5);
      surf.flow = flow * (1 - cliffK);
    }

    // ---- floors: mud and gravel, flowstone sheets by the walls, moss near water
    const wetNear = nearWater(x, z, 3.4);
    const floorN = fbm(x * 0.12, z * 0.12, 3, S + 203) * 0.5 + 0.5;
    g.copy(P.dirt).lerp(P.rockDark, 0.62).lerp(P.dirtDark, 0.2 + 0.4 * floorN).lerp(P.mud, smoothstep(0.55, 0.8, fbm(x * 0.05 + 3, z * 0.05, 2, S + 205) * 0.5 + 0.5) * 0.7);
    g.lerp(P.rockDark, 0.4 * smoothstep(0.5, 0.75, fbm(x * 0.2, z * 0.2, 2, S + 207) * 0.5 + 0.5));   // gravel
    const sheet = smoothstep(0.62, 0.8, fbm(x * 0.035 + 9, z * 0.035, 3, S + 209) * 0.5 + 0.5) * 0.55;
    g.lerp(P.flowstone, sheet * 0.55);
    let wet = 0;
    if (wetNear) {
      wet = 1;
      g.multiplyScalar(0.62);
      g.lerp(P.moss, 0.55 * smoothstep(0.35, 0.8, floorN));
      surf.moss = Math.max(surf.moss, 0.9);
    } else {
      wet = smoothstep(0.62, 0.85, fbm(x * 0.06 + 1, z * 0.06, 2, S + 211) * 0.5 + 0.5) * 0.7;   // damp patches
      g.multiplyScalar(1 - 0.28 * wet);
    }
    surf.mud = 1; surf.flow = Math.max(surf.flow, sheet * 0.7 * (1 - cliffK));
    surf.wet = Math.max(surf.wet, wet * (1 - cliffK) * (1 - beachK));

    // blend: floor (colour g) ↔ rock by slope, beaches stay beaches
    const rockK = Math.max(cliffK, smoothstep(0.3, 0.9, slope));
    color.copy(g).lerp(rock, rockK);
    if (beachK > 0.01) {
      // keep the cove sand where the ground is flat: hand over from the cave floor colours
      const sandCol = tmp.copy(P.sandWet).lerp(P.sandDry, smoothstep(0.4, 2.6, y)).lerp(P.sand, 0.25 + noise * 0.3).multiplyScalar(0.78);
      sandCol.lerp(g.copy(sandCol).multiplyScalar(0.6), 1 - smoothstep(0.1, 1.6, y));
      color.lerp(sandCol, beachK * (1 - rockK));
      surf.mud *= 1 - beachK;
    }
    surf.mud *= 1 - rockK;
    surf.moss *= 1 - rockK * 0.5;

    // ---- ambient occlusion in the corners (wall meets floor) and under overhangs
    const corner = smoothstep(0.15, 0.55, slope) * (1 - smoothstep(0.55, 0.95, slope));
    color.multiplyScalar(1 - 0.32 * corner * (1 - cliffK));
    // fine speckle so large areas never look flat
    color.offsetHSL(fbm(x * 0.21, z * 0.21, 2, S + 213) * 0.012, fbm(x * 0.31, z * 0.31, 2, S + 214) * 0.035, fbm(x * 0.19, z * 0.19, 2, S + 215) * 0.03);
    return color;
  };

  const sky = buildSkyField(terrain, layout);
  CAVE_SKY.uSkyTex.value = sky.tex;
  CAVE_SKY.uSkyRect.value.copy(sky.rect);

  const pos = new Float32Array(stride * stride * 3);
  const col = new Float32Array(stride * stride * 3);
  const sf = new Float32Array(stride * stride * 4);
  const sf2 = new Float32Array(stride * stride * 2);
  /** colour and surface weights of one vertex at height y with the given slope into the arrays at index v */
  const fillVertex = (A, v, x, y, z, slope) => {
    const k = v * 3, ks = v * 4, k2 = v * 2;
    A.pos[k] = x; A.pos[k + 1] = y; A.pos[k + 2] = z;
    if (y < -12) { A.col[k] = P.seabedDeep.r; A.col[k + 1] = P.seabedDeep.g; A.col[k + 2] = P.seabedDeep.b; A.sf[ks] = 1; A.sf2[k2] = 1; return; }
    const c = vertexColor(x, y, z, slope);
    A.col[k] = c.r; A.col[k + 1] = c.g; A.col[k + 2] = c.b;
    A.sf[ks] = surf.sand; A.sf[ks + 1] = surf.cliff; A.sf[ks + 2] = surf.mud; A.sf[ks + 3] = surf.flow;
    A.sf2[k2] = surf.wet; A.sf2[k2 + 1] = surf.moss;
  };
  const T = { pos, col, sf, sf2 };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -half + i * cell, z = -half + j * cell;
      const dx = (terrain.h(i + 1, j) - terrain.h(i - 1, j)) / (2 * cell);
      const dz = (terrain.h(i, j + 1) - terrain.h(i, j - 1)) / (2 * cell);
      fillVertex(T, j * stride + i, x, terrain.h(i, j), z, Math.hypot(dx, dz));
    }
  }

  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      if (pos[a * 3 + 1] < -15.8 && pos[b * 3 + 1] < -15.8 && pos[c * 3 + 1] < -15.8 && pos[d * 3 + 1] < -15.8) continue;   // (the shelf bottoms out at -16: the seabed reaches out until it is flat)
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('surface', new THREE.BufferAttribute(sf, 4));
  geo.setAttribute('surface2', new THREE.BufferAttribute(sf2, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  setSurfaceBiome(layout.biome);
  // one look, three sky behaviours (caveSky.js): the ground (above the roof it is the mountain's skin),
  // the roof and everything under it, the shell over the tunnels
  const material = (mode, side) => withSurfaceDetail(withCaveSky(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side }), mode), 'cave');
  const mats = { terrain: material(0, THREE.FrontSide), roof: material(1, THREE.DoubleSide), shell: material(2, THREE.DoubleSide) };
  mats.shell.polygonOffset = true; mats.shell.polygonOffsetFactor = -1; mats.shell.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mats.terrain);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.caveMats = mats;
  mesh.userData.sky = sky;

  // ---- the shell: the mountain's skin over every tunnel and chamber, continuing the rock exactly
  const shell = buildShell({ terrain, layout, sky, geo, T, fillVertex, material: mats.shell });
  if (shell) mesh.add(shell);

  const glowTex = glow.glowTexture(half);
  CAVE_GLOW.uCaveGlow.value = glowTex;
  CAVE_GLOW.uCaveGlowRect.value.set(-half, -half, 1 / (half * 2));
  mesh.userData.glowTexture = glowTex;
  return mesh;
}

/**
 * The terrain heightfield over a tunnel is the tunnel's floor, so from above you would look into it.
 * The shell is an upward-facing skin at the rock's own height (`caveRockTop`, the very function the
 * ground rises to between the tunnels) over every cell that touches open space. Over the first
 * metres behind a tunnel mouth it hugs the roof (a lintel), rising to the rock, so the opening reads
 * as a dark arch under an overhang. Where it meets solid ground its vertices ARE the terrain's.
 * Returns the mesh (null if nothing is open); `userData.cells` lists the covered cells for tests.
 */
function buildShell({ terrain, layout, sky, geo, T, fillVertex, material }) {
  const { n, cell, half } = terrain, n1 = n + 1, plan = layout.plan;
  const { depth, roof } = sky;
  const S = new Float32Array(n1 * n1);
  const lifted = new Uint8Array(n1 * n1);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * n1 + i, h = terrain.h(i, j), d = depth[k];
      S[k] = h;
      if (d <= 0.5) continue;
      const x = -half + i * cell, z = -half + j * cell;
      const top = caveRockTop(plan, x, z);
      const lintel = roof[k] + 0.3 + 2.0 * Math.max(0, d - ARCH_DEPTH - 2);
      const y = Math.max(h, Math.min(top, lintel));
      if (y > h + 0.05) { S[k] = y; lifted[k] = 1; }
    }
  }
  // cells that need the skin: all corners inside the mountain's edge, some corner lifted by more than a touch
  const need = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n1 + i, ks = [a, a + 1, a + n1, a + n1 + 1];
      if (ks.some((k) => depth[k] <= 0.5)) continue;
      if (ks.some((k) => S[k] - terrain.h(k % n1, (k / n1) | 0) > 0.3)) need[j * n + i] = 1;
    }
  }
  // the skin runs two cells beyond the lifted ones: its normals and colours come from the skin itself
  // (a vertex on a tunnel wall's crest has the wall in its terrain normal: dark slits along the skin)
  const cells = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let hit = need[j * n + i] === 1;
      for (let dj = -2; dj <= 2 && !hit; dj++) for (let di = -2; di <= 2 && !hit; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < n && b < n && need[b * n + a]) hit = true;
      }
      if (!hit) continue;
      const q = j * n1 + i, corners = [q, q + 1, q + n1, q + n1 + 1];
      if (corners.some((k) => depth[k] <= 0.5)) continue;
      // (a cell with no lifted corner lies exactly on the terrain: drawn twice, with the shell's outdoor light, it
      // shows as bright zigzag slivers on the walls - the terrain draws it; the normals below still use the whole skin)
      if (!corners.some((k) => lifted[k])) continue;
      cells.push([i, j]);
    }
  }
  if (!cells.length) return null;
  const remap = new Map(), order = [];
  const id = (k) => { let v = remap.get(k); if (v === undefined) { v = order.length; remap.set(k, v); order.push(k); } return v; };
  const idx = [];
  for (const [i, j] of cells) {
    const a = id(j * n1 + i), b = id(j * n1 + i + 1), c = id((j + 1) * n1 + i), d = id((j + 1) * n1 + i + 1);
    idx.push(a, c, b, b, c, d);
  }
  const m = order.length;
  const A = { pos: new Float32Array(m * 3), col: new Float32Array(m * 3), sf: new Float32Array(m * 4), sf2: new Float32Array(m * 2) };
  const nor = new Float32Array(m * 3);
  const at = (i, j) => S[Math.min(n, Math.max(0, j)) * n1 + Math.min(n, Math.max(0, i))];
  order.forEach((k, v) => {
    const i = k % n1, j = (k / n1) | 0, x = -half + i * cell, z = -half + j * cell;
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * cell), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * cell);
    fillVertex(A, v, x, S[k], z, Math.hypot(gx, gz));
    const l = Math.hypot(gx, 1, gz);
    nor[v * 3] = -gx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -gz / l;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(A.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(A.col, 3));
  g.setAttribute('surface', new THREE.BufferAttribute(A.sf, 4));
  g.setAttribute('surface2', new THREE.BufferAttribute(A.sf2, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'cave-shell';
  mesh.receiveShadow = true;
  mesh.userData.cells = cells;
  return mesh;
}

export { caveCeiling };
