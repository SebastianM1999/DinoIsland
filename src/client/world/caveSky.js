// Sky light of the Hollow Mountain: SPATIAL, never tied to where the camera is.
//
// `buildSkyField` bakes, per terrain vertex, how much open sky a point of the cave air
// sees: 1 out in the coves and in the open canyon in front of a tunnel mouth, falling to
// 0 within a few metres inside (geodesic distance through the tunnels from the nearest
// opening), plus the visual roof height. Both go into one RG half-float texture
// (`uSkyTex`) that every cave material reads per pixel (`withCaveSky`):
//   * the sun and the sky light of a pixel scale with the sky visibility,
//   * a pixel above the roof (the mountain's own skin, seen from outside) always sees
//     the sky; a pixel under it only what leaks in through the openings,
//   * the fog colour fades to dark in the interior, so no fog makes the tunnels look bright
//     from outside.
// Dynamic things (dinosaurs, players, items) use the scene's lights, which follow
// the camera's own sky visibility (`CAVE_SKY.setCamera`, caveFx.js).

import * as THREE from 'three';
import { smoothstep } from '../../shared/rng.js';
import { caveOpenSdf, caveRoofBase } from '../../shared/caveField.js';

/** How far into the mountain a mouth's daylight counts as open sky (metres): the sky field's sources. */
export const ARCH_DEPTH = 2;
/** The mouth's daylight reaches this far (metres through the tunnel) before it is dark. */
const DAYLIGHT_REACH = 13;

/** Shared uniforms of the cave materials. */
export const CAVE_SKY = {
  uSkyTex: { value: null },
  uSkyRect: { value: new THREE.Vector3(-1000, -1000, 1e-3) },     // x0, z0, 1 / size
  // x: 1 / sun scale of the scene's sun, y: the interior's share of the outdoor sky light,
  // z: the scene's current sky-light scale (both so a pixel's light is independent of the camera)
  uCaveL: { value: new THREE.Vector4(1, 0.4, 1, 0) },
};

/** Sky visibility from a distance through the tunnels (metres). */
export const visFromDistance = (D) => { const k = 1 - smoothstep(1, DAYLIGHT_REACH, D); return k * k; };

export function buildSkyField(terrain, layout) {
  const { n, cell, half } = terrain;
  const n1 = n + 1, plan = layout.plan, depthAt = plan.cave.depthAt;
  const N = n1 * n1;
  const depth = new Float32Array(N), open = new Uint8Array(N), roof = new Float32Array(N);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * n1 + i, x = -half + i * cell, z = -half + j * cell;
      const d = depth[k] = depthAt(x, z);
      if (d > 0) {
        roof[k] = caveRoofBase(plan, x, z);
        open[k] = caveOpenSdf(plan, x, z) < 1.5 ? 1 : 0;
      } else roof[k] = -1000;
    }
  }
  // geodesic distance through the open space from the mouths (open cells in the first metres of rock)
  const D = new Float32Array(N).fill(Infinity);
  const heap = [];
  const push = (k, v) => { heap.push([v, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let m = c; const a = 2 * c + 1, b = a + 1; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  for (let k = 0; k < N; k++) {
    if (depth[k] <= 0 || (open[k] && depth[k] <= ARCH_DEPTH + 1)) { D[k] = 0; push(k, 0); }
  }
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  while (heap.length) {
    const [v, k] = pop();
    if (v > D[k]) continue;
    const i = k % n1, j = (k / n1) | 0;
    for (const [di, dj] of DIRS) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > n || b > n) continue;
      const q = b * n1 + a;
      if (!open[q] && depth[q] > 0) continue;
      const nv = v + (di && dj ? 1.4142 : 1) * cell;
      if (nv < D[q] && nv < DAYLIGHT_REACH * 1.6) { D[q] = nv; push(q, nv); }
    }
  }
  // the walls: the light of the nearest open cell (three rings is plenty: walls are a few metres)
  for (let pass = 0; pass < 3; pass++) {
    const next = D.slice();
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * n1 + i;
        if (depth[k] <= 0 || open[k]) continue;
        let best = next[k];
        for (const [di, dj] of DIRS) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a > n || b > n) continue;
          const v = D[b * n1 + a] + (di && dj ? 1.4142 : 1) * cell;
          if (v < best) best = v;
        }
        next[k] = best;
      }
    }
    D.set(next);
  }
  const vis = new Float32Array(N);
  for (let k = 0; k < N; k++) vis[k] = depth[k] <= 0 ? 1 : visFromDistance(D[k]);

  const data = new Uint16Array(N * 2);
  for (let k = 0; k < N; k++) {
    data[k * 2] = THREE.DataUtils.toHalfFloat(vis[k]);
    data[k * 2 + 1] = THREE.DataUtils.toHalfFloat(Math.max(-500, Math.min(500, roof[k])));
  }
  const tex = new THREE.DataTexture(data, n1, n1, THREE.RGFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  // texel (i, j) sits at the vertex: sample at the vertex centre of the grid
  const texel = 1 / n1;
  tex.userData.sharedResource = false;

  const bilinear = (arr, x, z) => {
    const gx = Math.min(n - 1e-6, Math.max(0, (x + half) / cell)), gz = Math.min(n - 1e-6, Math.max(0, (z + half) / cell));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, k = j * n1 + i;
    return (arr[k] * (1 - fx) + arr[k + 1] * fx) * (1 - fz) + (arr[k + n1] * (1 - fx) + arr[k + n1 + 1] * fx) * fz;
  };
  return {
    tex, vis, roof, depth, open,
    /** uniform rect for the shader (the texel centres span 0.5/n1 .. 1 - 0.5/n1) */
    rect: new THREE.Vector3(-half - cell * 0.5, -half - cell * 0.5, 1 / (n1 * cell)),
    texel,
    /** Sky visibility 0..1 of the cave air at a point (a point above the roof sees the sky). */
    visAt(x, y, z) {
      if (y > bilinear(roof, x, z) + 0.6) return 1;
      return bilinear(vis, x, z);
    },
    roofAt: (x, z) => bilinear(roof, x, z),
  };
}

// ------------------------------------------------------------------ shader patch
const VERT_PARS = 'varying vec3 vCaveW;\n';
const VERT_MAIN = `
{
  vec4 cw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    cw = instanceMatrix * cw;
  #endif
  vCaveW = (modelMatrix * cw).xyz;
}
`;
const FRAG_PARS = `
varying vec3 vCaveW;
uniform sampler2D uSkyTex;
uniform vec3 uSkyRect;
uniform vec4 uCaveL;
uniform float uSkyMode;
float caveSkyVis() {
  vec2 t = texture2D(uSkyTex, (vCaveW.xz - uSkyRect.xy) * uSkyRect.z).rg;
  float v = t.r;
  if (uSkyMode < 0.5) v = mix(v, 1.0, smoothstep(t.g + 0.1, t.g + 1.4, vCaveW.y));   // above the roof: the mountain's skin
  else if (uSkyMode > 1.5) v = mix(v, 1.0, smoothstep(t.g + 1.0, t.g + 2.6, vCaveW.y));   // the volume: its roof lies at t.g (+- the noise), the skin well above it
  else if (!gl_FrontFacing) v = 0.0;
  return v;
}
/** The baked crystal glow lights what is under the roof, never the mountain's skin above it. */
float caveGlowK() {
  if (uSkyMode > 0.5 && uSkyMode < 1.5) return gl_FrontFacing ? 1.0 : 0.0;
  float roofY = texture2D(uSkyTex, (vCaveW.xz - uSkyRect.xy) * uSkyRect.z).g;
  if (uSkyMode > 1.5) return 1.0 - smoothstep(roofY + 1.0, roofY + 2.6, vCaveW.y);
  return 1.0 - smoothstep(roofY + 0.1, roofY + 1.4, vCaveW.y);
}
`;

const CH = THREE.ShaderChunk;
const LIGHTS_BEGIN = CH.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cSunK;',
);
// (head under water, uCaveL.w = how deep under: the fog takes the water's colour, but deep in the mountain that water
// is as dark as the cave air around it - only near the openings does daylight reach into it)
const FOG = CH.fog_fragment.replace('fogColor, fogFactor', 'fogColor * mix(mix(0.07, 1.0, cVis), mix(0.18, 1.0, cVis), uCaveL.w), fogFactor');

/**
 * Make `mat` light itself by the sky field. mode: 0 = terrain (a pixel above the roof is the
 * mountain's skin, 1 outside), 1 = under the roof (always the field: roof, stalactites, columns),
 * 2 = the volume mesh (the whole mountain: roof, walls, floors under the roof line, the skin above it).
 * Call BEFORE `withSurfaceDetail` (that one wraps this hook).
 */
export function withCaveSky(mat, mode) {
  const prev = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uSkyTex = CAVE_SKY.uSkyTex;
    shader.uniforms.uSkyRect = CAVE_SKY.uSkyRect;
    shader.uniforms.uCaveL = CAVE_SKY.uCaveL;
    shader.uniforms.uSkyMode = { value: mode };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <lights_fragment_begin>', `float cVis = caveSkyVis();\n\tfloat cSunK = cVis * uCaveL.x;\n\tfloat cAmbK = mix(uCaveL.y, 1.0, cVis) / uCaveL.z;\n${LIGHTS_BEGIN}`)
      .replace('#include <lights_fragment_end>', `#if defined( RE_IndirectDiffuse )\n\tirradiance *= cAmbK;\n#endif\n#include <lights_fragment_end>`)
      .replace('#include <fog_fragment>', FOG);
  };
  mat.customProgramCacheKey = () => `cavesky-${mode}`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Tell the shaders how the scene's own lights are scaled right now (set each frame by caveFx):
 * `sun` = scale of the scene sun against the outdoor sun (0.04..1), `ambIn` = the interior's share
 * of the sky light, `amb` = the scene's sky-light scale against outdoors (1 .. ambIn).
 */
export function setCaveLights(sun, ambIn, amb) {
  CAVE_SKY.uCaveL.value.set(1 / sun, ambIn, amb, CAVE_SKY.uCaveL.value.w);
}

/** The camera's head is under water (0..1): the cave fog takes the water's colour instead of fading to black. */
export function setCaveUnderwater(k) {
  CAVE_SKY.uCaveL.value.w = k;
}
