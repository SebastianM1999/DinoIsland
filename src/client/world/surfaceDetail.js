// Procedural surface detail for the big generated surfaces: terrain (grass,
// forest floor, trails, sand, cliffs, ash), boulders, sea stacks, tree crowns and bushes.
// Vertex colours only resolve the ~2.7 m terrain grid (and one flat tone per
// rock / crown), so the fragment shader adds the small scale on top: patterns
// in world or object space that tint the vertex colour, a little bump so light
// catches the grain, and a roughness change (wet sand shines). Still no
// textures: everything is noise computed per pixel.
//
// Hooks into any MeshStandardMaterial via onBeforeCompile. The detail fades
// out with distance (no shimmer far away) and follows the graphics tier
// through the shared SURFACE uniforms (see setSurfaceQuality).

import * as THREE from 'three';
import { retainResource } from '../core/resources.js';

/** Shared uniforms: detail level 0 (macro only) .. 2 (patterns + bump), fade distance. */
export const SURFACE = {
  uSdLevel: { value: 2 },
  uSdFar: { value: 90 },
  uSdGreen: { value: 1 },      // 1 = green island (moss, lichen, blossoms), 0 = volcanic
  uSdAsh: { value: 0 },        // volcano: fresh ash lying on everything facing up (world/volcanoFx.js)
};

/** Follow the graphics tier (core/renderer.js onGraphics): Low = macro only, Medium = no bump. */
export function setSurfaceQuality(g = {}) {
  const name = g.name || 'High';
  SURFACE.uSdLevel.value = name === 'Low' ? 0 : name === 'Medium' ? 1 : 2;
  SURFACE.uSdFar.value = name === 'Ultra' ? 120 : name === 'High' ? 95 : 70;
}

/** Green or volcanic look for the island being built. */
export function setSurfaceBiome(biome) {
  SURFACE.uSdGreen.value = biome?.id === 'volcano' ? 0 : 1;
  SURFACE.uSdAsh.value = 0;
}

// ------------------------------------------------------------------ GLSL

const NOISE = /* glsl */ `
uniform float uSdLevel;
uniform float uSdFar;
uniform float uSdGreen;
uniform float uSdAsh;
float sdHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 sdHash2(vec2 p) { float h = sdHash(p); return vec2(h, sdHash(p + h * 17.13 + 3.7)); }
float sdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sdHash(i), sdHash(i + vec2(1.0, 0.0)), u.x), mix(sdHash(i + vec2(0.0, 1.0)), sdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * sdNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; }
  return s / 0.9375;
}
float sdNoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float z0 = mix(mix(sdHash(i.xy + i.z * 31.7), sdHash(i.xy + vec2(1.0, 0.0) + i.z * 31.7), u.x),
                 mix(sdHash(i.xy + vec2(0.0, 1.0) + i.z * 31.7), sdHash(i.xy + vec2(1.0, 1.0) + i.z * 31.7), u.x), u.y);
  float z1 = mix(mix(sdHash(i.xy + (i.z + 1.0) * 31.7), sdHash(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 31.7), u.x),
                 mix(sdHash(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 31.7), sdHash(i.xy + vec2(1.0, 1.0) + (i.z + 1.0) * 31.7), u.x), u.y);
  return mix(z0, z1, u.z);
}
// Voronoi: x = distance to the nearest point, y = edge distance (F2 - F1), z = cell id 0..1
vec3 sdVoronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = sdHash2(i + g);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = sdHash(i + g + 0.5); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2 - d1, id);
}
vec3 sdBumpNormal(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

// Rock pattern (cliffs and boulders). p = world position, n = world normal,
// kind 0 granite, 1 sandstone, 2 basalt, 3 limestone. Tints c, returns height.
const ROCK = /* glsl */ `
float sdRockPattern(vec2 q, float kind, float near) {
  bool basalt = kind > 1.5 && kind < 2.5;
  // cracks wander (warped cells) and only run through some patches, never a closed net
  vec2 wq = q + vec2(sdNoise(q * 0.7), sdNoise(q * 0.7 + 9.0)) * 0.8;
  vec3 v = sdVoronoi(wq * (basalt ? 0.8 : 0.45));
  float mask = smoothstep(basalt ? 0.3 : 0.45, basalt ? 0.55 : 0.7, sdFbm(q * 0.22 + 4.0));
  float crack = (1.0 - smoothstep(0.0, basalt ? 0.06 : 0.03, v.y)) * mask;
  float grain = sdNoise(q * 7.0) * near;
  float blot = sdFbm(q * 0.8);
  return blot * 0.6 + grain * 0.25 - crack * 0.6;
}
vec3 sdRock(vec3 c, vec3 p, vec3 n, float kind, float near, inout float h, inout float rough) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  float hx = sdRockPattern(p.zy, kind, near), hy = sdRockPattern(p.xz, kind, near), hz = sdRockPattern(p.xy, kind, near);
  float rh = hx * w.x + hy * w.y + hz * w.z;
  float bands = sin(p.y * (kind > 0.5 && kind < 1.5 ? 4.2 : 2.3) + sdFbm(p.xz * 0.15) * 4.0);
  float spk = sdNoise(p.xz * 11.0 + p.y * 3.0) * near;
  // shared: blotchy tone and dark cracks
  c *= 0.86 + 0.26 * smoothstep(-0.4, 0.8, rh);
  if (kind < 0.5) {                 // granite: salt-and-pepper speckle
    c *= 0.9 + 0.22 * step(0.72, spk) - 0.14 * step(spk, 0.18);
  } else if (kind < 1.5) {          // sandstone: warm layered bands
    c *= vec3(1.06, 0.98, 0.9) * (0.9 + 0.12 * bands);
    rh += bands * 0.25;
  } else if (kind < 2.5) {          // basalt: dark, columnar cracks
    c *= 0.82;
    rough = min(1.0, rough + 0.05);
  } else {                          // limestone: pale with pits
    vec3 v = sdVoronoi(p.xz * 2.2 + p.y);
    float pit = 1.0 - smoothstep(0.05, 0.16, v.x);
    c = mix(c * 1.1, c * 0.62, pit * near * step(0.55, v.z));
    rh -= pit * 0.5;
  }
  // lichen and moss on the tops of green islands
  float up = smoothstep(0.55, 0.9, n.y);
  float lich = smoothstep(0.62, 0.8, sdFbm(p.xz * 0.9 + p.y * 0.3)) * uSdGreen;
  c = mix(c, vec3(0.74, 0.76, 0.52) * (0.8 + 0.3 * spk), lich * 0.45 * (0.4 + 0.6 * up));
  h += rh;
  return c;
}
`;

// ------------------------------------------------------------------ hooks

const VERT_PARS = /* glsl */ `
varying vec3 vSdPos;
varying vec3 vSdNormal;
varying vec3 vSdLocal;
varying float vSdSeed;
varying vec3 vSdInst;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 sdW = vec4(transformed, 1.0);
  vec3 sdN = objectNormal;
  vec3 sdO = vec3(0.0);
  #ifdef USE_INSTANCING
    sdW = instanceMatrix * sdW;
    sdN = mat3(instanceMatrix) * sdN;
    sdO = instanceMatrix[3].xyz;
  #endif
  sdW = modelMatrix * sdW;
  sdO += modelMatrix[3].xyz;
  vSdPos = sdW.xyz;
  vSdNormal = normalize(mat3(modelMatrix) * sdN);
  vSdLocal = position;
  vSdSeed = fract(sin(dot(sdO, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  #ifdef USE_INSTANCING_COLOR
    vSdInst = instanceColor;
  #else
    vSdInst = vec3(-1.0);
  #endif
}
`;

/** Fragment bodies per kind: tint diffuseColor.rgb, set sdH (height) and sdRough (roughness factor). */
const FRAG = {
  terrain: /* glsl */ `
  {
    vec3 p = vSdPos;
    vec2 q = p.xz;
    float near = 1.0 - smoothstep(uSdFar * 0.35, uSdFar, sdDist);
    float close = 1.0 - smoothstep(10.0, 40.0, sdDist);
    vec3 c = diffuseColor.rgb;
    // macro: big rotated patches that ignore the grid, so no cell ever reads as a tile
    vec2 mq = mat2(0.8, 0.6, -0.6, 0.8) * q;
    float macro = sdFbm(mq * 0.045);
    float mid = sdNoise(mq * 0.33 + 3.1);
    c *= 0.95 + 0.1 * macro + 0.05 * (mid - 0.5);
    if (uSdLevel > 0.5) {
      float wSand = vSdSurf.x, wRock = vSdSurf.y, wPath = vSdSurf.z, wForest = vSdSurf.w;
      float wWet = vSdSurf2.x, wAsh = vSdSurf2.y;
      float wGround = (1.0 - wSand) * (1.0 - wRock) * (1.0 - wPath);
      // grass: clumps, blade streaks along the wind, yellow and teal patches, mossy hollows
      if (wGround * (1.0 - wAsh) > 0.01) {
        float clumpN = sdFbm(q * 0.55);
        float blade = sdNoise(vec2(q.x * 9.0 + q.y * 3.0, q.y * 2.0 - q.x * 0.6)) * close;
        vec3 g = c * (0.94 + 0.1 * clumpN);
        g = mix(g, g * vec3(1.06, 1.03, 0.86), smoothstep(0.62, 0.85, sdFbm(q * 0.11 + 9.0)) * 0.35);
        g = mix(g, g * vec3(0.94, 1.0, 1.04), smoothstep(0.65, 0.88, sdFbm(q * 0.09 - 4.0)) * 0.3);
        g *= 1.0 - 0.08 * smoothstep(0.55, 0.95, blade) + 0.03 * smoothstep(0.2, 0.0, blade);
        float moss = smoothstep(0.6, 0.78, sdFbm(q * 0.7 + 13.0)) * near;
        g = mix(g, g * vec3(0.92, 0.97, 0.9), moss * 0.35);
        // forest floor: dark soil patches strewn with fallen leaves (two loose layers,
        // brown, yellow and dark green, never a closed pattern)
        vec3 soil = g * mix(vec3(0.72, 0.68, 0.6), vec3(0.9, 0.95, 0.85), sdFbm(q * 0.35 + 6.0));
        vec2 wq = q + vec2(sdNoise(q * 0.9), sdNoise(q * 0.9 + 5.0)) * 0.6;
        vec3 l1 = sdVoronoi(mat2(1.6, 0.9, -0.5, 2.3) * wq), l2 = sdVoronoi(mat2(2.4, -1.4, 0.9, 3.1) * wq + 11.0);
        float m1 = (1.0 - smoothstep(0.18, 0.32, l1.x)) * step(0.55, l1.z);
        float m2 = (1.0 - smoothstep(0.15, 0.26, l2.x)) * step(0.7, l2.z);
        vec3 t1 = mix(vec3(1.3, 0.95, 0.55), vec3(0.75, 0.9, 0.62), fract(l1.z * 7.0));
        vec3 t2 = mix(vec3(1.35, 1.15, 0.55), vec3(0.95, 0.7, 0.5), fract(l2.z * 5.0));
        vec3 floorC = mix(soil, c * t1, m1 * near);
        floorC = mix(floorC, c * t2, m2 * near * (1.0 - m1 * 0.5));
        g = mix(g, floorC, wForest * 0.8);
        float gh = blade * 0.35 + clumpN * 0.4 + (m1 * 0.5 + m2 * 0.4) * wForest;
        c = mix(c, g, wGround * (1.0 - wAsh));
        sdH += gh * wGround * (1.0 - wAsh);
      }
      // ash: coarse grain and dark clinker
      if (wAsh * wGround > 0.01) {
        // clinker: odd-sized lumps in loose patches (warped cells), never an even dot grid
        vec2 aq = q + vec2(sdNoise(q * 0.8), sdNoise(q * 0.8 + 7.0)) * 0.9;
        vec3 av = sdVoronoi(aq * 1.2);
        float size = 0.1 + 0.22 * fract(av.z * 13.0);
        float clink = (1.0 - smoothstep(size * 0.55, size, av.x)) * step(0.62, av.z)
          * smoothstep(0.4, 0.7, sdFbm(q * 0.12 + 2.0));
        float grain = sdNoise(q * 6.0) * near;
        float mottle = sdFbm(q * 0.5 + 8.0);
        vec3 a = c * (0.84 + 0.2 * grain + 0.14 * (mottle - 0.5)) * (1.0 - clink * 0.4);
        c = mix(c, a, wAsh * wGround);
        sdH += (grain * 0.3 + clink * 0.8) * wAsh * wGround;
      }
      // sand: ripples parallel to the shore, grain, shells and pebbles, a tide line of weed
      if (wSand > 0.01) {
        // a slowly turning direction field (continuous, so ripples never jump at a cell edge)
        float ang = sdFbm(q * 0.012 + 3.0) * 6.2832;
        vec2 dir = vec2(cos(ang), sin(ang));
        float warp = sdFbm(q * 0.22) * 6.0;
        float rip = sin(dot(q, dir) * 3.2 + warp);
        rip = (rip * 0.6 + 0.4 * rip * rip * rip) * near;
        float ripK = (1.0 - wWet * 0.7) * (0.6 + 0.4 * sdNoise(q * 0.2));
        vec3 s = c * (1.0 + 0.07 * rip * ripK);
        float grain = sdNoise(q * 15.0) * close;
        s *= 0.96 + 0.08 * grain;
        vec3 sv = sdVoronoi(q * 1.1);
        float patchK = smoothstep(0.6, 0.85, sdFbm(q * 0.08 + 2.0));
        float dot1 = (1.0 - smoothstep(0.05, 0.11, sv.x)) * patchK * near;
        vec3 shell = vec3(0.98, 0.92, 0.86), pebble = c * 0.55 + vec3(0.06, 0.06, 0.07);
        s = mix(s, sv.z > 0.8 ? shell : pebble, dot1 * step(0.65, sv.z));
        // tide line: a ragged band of dark weed and drift a little above the wet edge
        float tide = smoothstep(0.08, 0.25, wWet) * (1.0 - smoothstep(0.3, 0.5, wWet));
        float weed = smoothstep(0.5, 0.8, sdNoise(q * 3.5)) * smoothstep(0.3, 0.6, sdNoise(q * 0.4 + 5.0));
        s = mix(s, vec3(0.22, 0.24, 0.12) + c * 0.15, tide * weed * 0.8 * uSdGreen);
        s = mix(s, s * 0.5, tide * weed * 0.5 * (1.0 - uSdGreen));
        c = mix(c, s, wSand);
        sdH += (rip * ripK * 0.6 + grain * 0.15 + dot1 * 0.6) * wSand;
      }
      // trails and the camp ground: packed earth – mottled, darker worn tracks, fine
      // grit and hairline dry cracks in patches; a stray pebble only here and there
      if (wPath > 0.01) {
        float mott = sdFbm(q * 0.45 + 21.0);
        float track = smoothstep(0.55, 0.85, sdNoise(vec2(q.x * 0.35 + q.y * 0.9, q.y * 0.35 - q.x * 0.9) + sdFbm(q * 0.3) * 1.5));
        float grit = sdNoise(q * 9.0) * close;
        vec3 cr = sdVoronoi(q * 0.9 + vec2(sdNoise(q * 1.3), sdNoise(q * 1.3 + 4.0)) * 0.5);
        float crack = (1.0 - smoothstep(0.0, 0.03, cr.y)) * smoothstep(0.55, 0.75, sdFbm(q * 0.2 + 30.0)) * smoothstep(0.6, 0.95, wPath) * near;
        vec3 pv = sdVoronoi(q * 1.7);
        float peb = (1.0 - smoothstep(0.08, 0.16, pv.x)) * step(0.94, pv.z) * near;
        vec3 d = c * (0.82 + 0.26 * mott) * (1.0 - 0.14 * track) * (0.95 + 0.1 * grit);
        d *= 1.0 - crack * 0.16;
        d = mix(d, c * 0.75 + vec3(0.1), peb);
        c = mix(c, d, wPath);
        sdH += (grit * 0.25 - crack * 0.6 - track * 0.3 + peb * 0.8) * wPath;
      }
      // cliffs and steep ground: triplanar rock, the kind drifting across the island
      wRock = smoothstep(0.12, 0.55, wRock);
      if (wRock > 0.01) {
        float kind = floor(sdNoise(q * 0.012 + 40.0) * 3.99);
        float rh = 0.0, rr = 0.0;
        vec3 r = sdRock(c, p, normalize(vSdNormal), kind, near, rh, rr);
        c = mix(c, r, wRock);
        sdH += rh * wRock * 1.4;
      }
      // wet ground shines
      sdRough = mix(1.0, 0.45, wWet * (1.0 - wRock));
    }
    sdH *= near;
    diffuseColor.rgb = c;
  }
  `,
  rock: /* glsl */ `
  {
    float near = 1.0 - smoothstep(uSdFar * 0.35, uSdFar, sdDist);
    vec3 c = diffuseColor.rgb;
    // the stone kind comes from the per-rock tint (shared/levels.js biome.rocks.kinds):
    // warm = sandstone, dark = basalt, light = limestone, else granite; merged rock
    // (sea stacks) drifts between kinds across the island instead
    float kind;
    if (vSdInst.x < 0.0) kind = floor(sdNoise(vSdPos.xz * 0.02 + 40.0) * 3.99);
    else {
      float lum = dot(vSdInst, vec3(0.3, 0.59, 0.11));
      kind = vSdInst.r - vSdInst.b > 0.25 ? 1.0 : lum < 0.8 ? 2.0 : lum > 1.07 ? 3.0 : 0.0;
    }
    if (uSdLevel > 0.5) {
      float rh = 0.0, rr = 0.0;
      c = sdRock(c, vSdPos + vSdSeed * 37.0, normalize(vSdNormal), kind, near, rh, rr);
      sdH = rh * 1.6 * near;
      sdRough = 1.0 + rr;
    } else {
      c *= 0.9 + 0.2 * sdNoise(vSdPos.xz * 0.6 + vSdPos.y);
    }
    diffuseColor.rgb = c;
  }
  `,
  foliage: /* glsl */ `
  {
    float near = 1.0 - smoothstep(uSdFar * 0.3, uSdFar * 0.85, sdDist);
    vec3 c = diffuseColor.rgb;
    vec3 lp = vSdLocal + vSdSeed * 13.0;
    // leaf clusters: small bright tips, dark gaps between the clusters
    float cl = sdNoise3(lp * 4.5) * 0.65 + sdNoise3(lp * 10.0 + 3.0) * 0.35 * near;
    float big = sdNoise3(lp * 0.8 + 4.0);
    c *= 0.82 + 0.32 * smoothstep(0.3, 0.8, cl) * (0.5 + 0.5 * near) + 0.12 * (big - 0.5);
    // one tree in many leans warmer or cooler as a whole
    c *= mix(vec3(0.9, 1.0, 1.08), vec3(1.1, 1.02, 0.84), vSdSeed);
    if (uSdLevel > 0.5) {
      // speckled lighter leaves
      float sp = sdNoise3(lp * 9.0);
      c *= 1.0 + 0.12 * smoothstep(0.7, 0.95, sp) * near;
      // a few blossoming trees on green islands: pink or orange flecks in the crown
      float bloom = step(0.93, vSdSeed) * uSdGreen;
      float fleck = smoothstep(0.78, 0.86, sdNoise3(lp * 4.5 + 2.0)) * smoothstep(0.0, 0.5, vSdLocal.y);
      vec3 bc = fract(vSdSeed * 37.0) > 0.5 ? vec3(0.98, 0.55, 0.68) : vec3(1.0, 0.62, 0.25);
      c = mix(c, bc, bloom * fleck * 0.85);
      sdH = (cl * 0.6 + sp * 0.2 * near) * near;
    }
    diffuseColor.rgb = c;
  }
  `,
};

/** Fresh ash (volcano's ash rain): a dull grey dusting on what faces up, patchy where it is thin. */
const ASH = /* glsl */ `
  if (uSdAsh > 0.001) {
    float sdUp = smoothstep(0.3, 0.8, normalize(vSdNormal).y);
    float sdPatch = smoothstep(0.2, 0.7, sdFbm(vSdPos.xz * 0.35) - 0.45 + uSdAsh * 0.9);
    float sdA = uSdAsh * sdUp * mix(0.35, 1.0, sdPatch);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.23, 0.22) * (0.85 + 0.3 * sdNoise(vSdPos.xz * 2.7)), sdA);
    sdRough = mix(sdRough, 1.3, sdA);
  }
`;

const BUMP = { terrain: 0.9, rock: 1.2, foliage: 0.7 };

/**
 * Add procedural surface detail of `kind` ('terrain' | 'rock' | 'foliage')
 * to a MeshStandardMaterial (in place; returns it). Chains an existing
 * onBeforeCompile (e.g. from kit.windMaterial) and extends the program cache key.
 * The terrain kind expects `surface` (vec4) and `surface2` (vec2) attributes.
 */
export function withSurfaceDetail(mat, kind) {
  const prev = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
  const terrain = kind === 'terrain';
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uSdLevel = SURFACE.uSdLevel;
    shader.uniforms.uSdFar = SURFACE.uSdFar;
    shader.uniforms.uSdGreen = SURFACE.uSdGreen;
    shader.uniforms.uSdAsh = SURFACE.uSdAsh;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}${terrain ? 'attribute vec4 surface;\nattribute vec2 surface2;\nvarying vec4 vSdSurf;\nvarying vec2 vSdSurf2;\n' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_MAIN}${terrain ? 'vSdSurf = surface; vSdSurf2 = surface2;\n' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}${terrain ? 'varying vec4 vSdSurf;\nvarying vec2 vSdSurf2;\n' : ''}${NOISE}${terrain || kind === 'rock' ? ROCK : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float sdDist = length(vViewPosition);
  float sdH = 0.0;
  float sdRough = 1.0;
  ${FRAG[kind]}
  ${ASH}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * sdRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uSdLevel > 1.5) normal = sdBumpNormal(-vViewPosition, normal, sdH * ${BUMP[kind].toFixed(2)} * 0.06, faceDirection);`);
  };
  mat.customProgramCacheKey = () => `sd-${kind}|${prevKey ? prevKey.call(mat) : ''}`;
  mat.needsUpdate = true;
  return mat;
}

const cache = new Map();
/** Cached detail copy of a shared base material (marked as a shared resource). */
export function detailMaterial(base, kind) {
  const key = `${base.uuid}:${kind}`;
  let m = cache.get(key);
  if (!m) {
    m = withSurfaceDetail(base.clone(), kind);
    m.userData.sharedResource = true;
    retainResource(m);
    cache.set(key, m);
  }
  return m;
}
