// Stylized water and lava.
//
// Water (sea, pools, rivers): turquoise shallows fading to deep blue, foam at
// the shoreline, smooth analytic wave normals (no faceting), sun glints and a
// fresnel sky tint. Every water surface uses the same shader program; the
// shader samples a terrain height texture to know the depth per pixel, so a
// surface simply disappears where the ground rises above it.
// Rivers are ribbons (see rivers.js) whose foam streaks and ripples scroll
// downstream; steep stretches turn into white rapids and carry a little silt.
// On top: three ripple octaves (the finest only up close), wind gusts that
// sweep choppier patches across, a fresnel reflection of the sky from horizon
// to zenith, sun caustics on shallow beds, ring ripples from footsteps,
// wading and splashes (ripple()/splash()), and the churning plunge under the
// waterfall.
// Lava (rivers + pools): opaque glowing molten core with dark cooling crust
// plates drifting downstream, lightly fogged.
// Waterfalls: vertical streak curtains from a mountain opening straight into
// the basin, with splash droplets and mist at the plunge.
// TODO(water-sim): the water is not simulated – no real flow around obstacles,
// no wakes behind dinosaurs, no puddles from rain; ripples are shader rings.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeRng } from '../../shared/rng.js';
import { SPRING_WATER_OFFSET } from '../../shared/springShape.js';
import { riverGeometry, discGeometry, withSheetAttrs } from './rivers.js';

/** Ring ripples alive at once (footsteps, wading, splashes) – shader array size. */
const MAX_RIPPLES = 8;
const smoothstepJS = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Fallback palette (= the jungle biome) when the layout has no biome.
const DEFAULT_WATER = { shallow: '#57e6dc', mid: '#1fb4e0', deep: '#1560c4', foam: '#f4fcff', sky: '#a9dcf8' };
const DEFAULT_SUN = '#fff4d8';
const LAVA = {
  crust: '#1c1412', crustHot: '#6a1a0a', hot: '#e8400c', core: '#ffc23a',
};

// ---------------------------------------------------------------- GLSL chunks

const NOISE = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// value noise + analytic derivatives (x = value, yz = d/dp); C1 -> smooth normals
vec3 vnoised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y,
              du * vec2(b - a + k * u.y, c - a + k * u.x));
}`;

const HEIGHT = /* glsl */`
uniform sampler2D uHeight;
uniform float uHalf;
uniform float uCell;
uniform float uN1;
float groundAt(vec2 xz) {
  vec2 g = (xz + uHalf) / uCell;
  if (g.x < 0.0 || g.y < 0.0 || g.x > uN1 - 1.0 || g.y > uN1 - 1.0) return -30.0;
  return texture2D(uHeight, (g + 0.5) / uN1).r;
}`;

// Sum of directional sines; returns (height, dh/dx, dh/dz) so the fragment
// shader can build an exact, smooth normal.
const WAVES = /* glsl */`
void addWave(inout vec3 r, vec2 p, float t, float A, vec2 k, float w) {
  float ph = dot(k, p) + w * t;
  r.x += A * sin(ph);
  r.yz += A * cos(ph) * k;
}
vec3 waves(vec2 p, float t) {
  vec3 r = vec3(0.0);
  addWave(r, p, t, 0.5, vec2(0.11, 0.0), 1.05);
  addWave(r, p, t, 0.5, vec2(0.04, 0.087), -0.8);
  addWave(r, p, t, 0.22, vec2(0.23, 0.23), 1.7);
  addWave(r, p, t, 0.1, vec2(-0.31, 0.19), 2.2);
  return r;
}`;

const SURF_VERT = /* glsl */`
uniform float uTime;
uniform float uWaveAmp;
attribute vec3 aFlow;
attribute vec3 aRiver;
varying vec3 vWorld;
varying float vSurfY;
varying vec2 vUv;
varying vec3 vFlow;
varying vec3 vRiver;
${HEIGHT}
${WAVES}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSurfY = wp.y;
  float depth = wp.y - groundAt(wp.xz);
  float amp = clamp(depth * 0.3, 0.0, 1.0) * uWaveAmp;
  wp.y += waves(wp.xz, uTime).x * amp;
  vWorld = wp.xyz;
  vUv = uv;
  vFlow = aFlow;
  vRiver = aRiver;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Expanding rings (footsteps, wading, things falling in) and the churning
// plunge where a waterfall meets its basin. Shared by every water surface.
const RIPPLES = /* glsl */`
#define MAX_RIPPLES ${MAX_RIPPLES}
uniform vec4 uRipples[MAX_RIPPLES];   // x, z, start time, strength (0 = free slot)
uniform vec4 uImpact;                 // x, z, radius, churn (radius 0 = no waterfall)
// one ring spreading from c, \`age\` seconds old: bends the normal, adds a little foam
void ring(inout vec2 grad, inout float foam, vec2 p, vec2 c, float age, float str, float speed) {
  if (age < 0.0 || age > 2.6 || str <= 0.0) return;
  vec2 d = p - c;
  float r = length(d) + 1e-4;
  float x = (r - age * speed) / (0.18 + age * 0.22);
  float env = exp(-x * x) * str * (1.0 - age / 2.6);
  grad += d / r * cos(x * 2.4) * env * 0.55;
  foam += env * 0.35 * (1.0 - smoothstep(0.0, 0.7, age));
}
void ripples(inout vec2 grad, inout float foam, vec2 p, float t) {
  for (int i = 0; i < MAX_RIPPLES; i++) {
    vec4 rp = uRipples[i];
    ring(grad, foam, p, rp.xy, t - rp.z, rp.w, 1.4);
    ring(grad, foam, p, rp.xy, t - rp.z - 0.28, rp.w * 0.55, 1.4);   // a weaker echo ring behind
  }
}
// the plunge: boiling, foamy water under the fall and rings rolling away from it
void plunge(inout vec2 grad, inout float foam, vec2 p, float t) {
  if (uImpact.z <= 0.0) return;
  vec2 d = p - uImpact.xy;
  float r = length(d);
  float R = uImpact.z;
  if (r > R * 4.0) return;
  float core = 1.0 - smoothstep(R * 0.35, R * 1.15, r);
  vec3 b1 = vnoised(p * 2.3 + vec2(t * 1.7, -t * 2.1));
  vec3 b2 = vnoised(p * 4.1 - vec2(t * 2.6, t * 1.4) + 9.0);
  grad += (b1.yz * 0.6 + b2.yz * 0.4) * core * 1.4 * uImpact.w;
  float boil = smoothstep(0.35, 0.8, b1.x * 0.6 + b2.x * 0.5);
  foam += core * (0.55 + 0.45 * boil) * uImpact.w;
  for (int k = 0; k < 4; k++) {
    float age = fract(t * 0.55 + float(k) * 0.25) * 2.4;
    ring(grad, foam, p, uImpact.xy, age, 0.55 * uImpact.w, R * 0.9 + 0.9);
  }
}`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform float uMode;        // 0 = sheet (sea / pool), 1 = river ribbon
uniform float uWaveAmp;
uniform float uRipple;
uniform float uFlowRef;
uniform float uFogAmount;
uniform vec2 uAlpha;        // alpha in the shallows / in deep water
uniform float uGloss;       // sun glints and sparkles (dull bog water: low)
uniform float uFoamAmt;     // shoreline foam strength
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSkyTop;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
varying float vSurfY;
varying vec2 vUv;
varying vec3 vFlow;
varying vec3 vRiver;
${HEIGHT}
${NOISE}
${WAVES}
${RIPPLES}
// sunlight focused by the ripples onto a shallow bed: thin bright lines where two
// drifting noise layers cross
float caustics(vec2 p, float t) {
  vec2 q = p * 0.6;
  float a = vnoise(q + vec2(t * 0.22, t * 0.15));
  float b = vnoise(q * 1.6 - vec2(t * 0.17, -t * 0.24) + 4.3);
  return pow(clamp(1.0 - abs(a - b) * 6.0, 0.0, 1.0), 8.0);
}
#include <fog_pars_fragment>
void main() {
  float depth = vSurfY - groundAt(vWorld.xz);
  float amp = clamp(depth * 0.3, 0.0, 1.0) * uWaveAmp;
  vec2 grad = waves(vWorld.xz, uTime).yz * amp;
  float fade = 1.0;
  float flowFoam = 0.0;
  float shoreBands = 1.0;
  float camDist = length(cameraPosition - vWorld);
  // fine detail only up close (no shimmering far away); wind gusts sweep
  // darker, choppier patches across open water
  float lod = 1.0 - smoothstep(30.0, 110.0, camDist);
  float gust = vnoise(vWorld.xz * 0.025 + uTime * vec2(0.045, 0.02));

  if (uMode > 0.5) {
    // river: ripples + foam streaks in the (across, along) frame, scrolling downstream
    vec2 f = normalize(vFlow.xy + vec2(1e-5, 0.0));
    vec2 s = vec2(-f.y, f.x);
    float along = (vRiver.z - uTime) * uFlowRef;
    float rapid = smoothstep(0.03, 0.14, vFlow.z);
    vec3 r1 = vnoised(vec2(vUv.x * 0.9, along * 0.45));
    vec3 r2 = vnoised(vec2(vUv.x * 2.1 + 5.0, along * 1.1));
    vec2 lg = r1.yz * vec2(0.9, 0.45) + r2.yz * vec2(2.1, 1.1) * 0.5;
    lg *= uRipple * (1.0 + rapid * 1.5);
    grad += s * lg.x + f * lg.y;
    float st = vnoise(vec2(vUv.x * 1.4, along * 0.16));
    float streak = smoothstep(0.66, 0.86, st) * (0.3 + rapid * 0.7);
    float wn = vnoise(vec2(vUv.x * 0.8, along * 0.6) + 11.0);
    float white = smoothstep(0.62 - rapid * 0.4, 0.8 - rapid * 0.3, wn) * rapid;
    flowFoam = max(streak, white);
    fade = vRiver.y;
    shoreBands = 0.0;
  } else {
    vec3 r1 = vnoised(vWorld.xz * 0.45 + uTime * vec2(0.15, 0.1));
    vec3 r2 = vnoised(vWorld.xz * 1.1 - uTime * vec2(0.08, 0.2));
    vec3 r3 = vnoised(vWorld.xz * 2.7 + uTime * vec2(-0.32, 0.21));
    grad += (r1.yz * 0.45 + r2.yz * 0.55 + r3.yz * 0.3 * lod) * uRipple * (0.65 + gust * 0.7);
  }
  // footsteps, wading, splashes and the waterfall's plunge
  float ringFoam = 0.0;
  ripples(grad, ringFoam, vWorld.xz, uTime);
  plunge(grad, ringFoam, vWorld.xz, uTime);

  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = normalize(cameraPosition - vWorld);

  vec3 col = mix(uShallow, uMid, smoothstep(0.3, 3.0, depth));
  col = mix(col, uDeep, smoothstep(3.5, 16.0, depth));
  // rivers carry a little silt: greener, less clear
  if (uMode > 0.5) col = mix(col, col * vec3(0.86, 1.0, 0.88), 0.45);
  // sun caustics dancing on the bed of shallow water
  float shallow = smoothstep(0.03, 0.25, depth) * (1.0 - smoothstep(0.4, 2.6, depth));
  col += uSunColor * caustics(vWorld.xz + grad * 0.6, uTime) * shallow * 0.18 * lod;

  // lighting: soft diffuse + fresnel reflection of the sky (zenith to horizon)
  // + sun glint
  float diff = 0.8 + 0.2 * max(dot(N, uSunDir), 0.0);
  col *= diff;
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 skyCol = mix(uSky, uSkyTop, smoothstep(0.05, 0.7, R.y));
  // (less in the shallows, where you mostly look through to the sand)
  col = mix(col, skyCol, clamp(fres * 0.85 + 0.06, 0.0, 0.62) * mix(0.45, 1.0, smoothstep(0.2, 1.5, depth)));
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 180.0) * 1.8;
  col += uSunColor * spec * uGloss;

  // sparkles on open water (more where a gust ruffles it)
  float sp = vnoise(vWorld.xz * 0.9 + vec2(uTime * 0.6, -uTime * 0.4));
  col += uSunColor * smoothstep(0.96 - gust * 0.03, 0.995, sp) * 0.25 * smoothstep(1.0, 4.0, depth) * lod * uGloss;

  // shoreline foam: a solid edge plus (on sheets) bands rolling toward the beach
  float n = vnoise(vWorld.xz * 0.35 + uTime * 0.15);
  // a thin, lacy line at the water's edge that laps up and back (on a flat
  // beach a fixed depth band would turn metres of shallows white)
  float lap = 0.05 + 0.05 * sin(uTime * 0.9 + n * 4.0);
  float lace = smoothstep(0.25, 0.65, vnoise(vWorld.xz * 1.3 + vec2(uTime * 0.2, 0.0)));
  float edge = (1.0 - smoothstep(lap * 0.5, lap + 0.04 + n * 0.05, depth)) * (0.55 + 0.45 * lace);
  float band = smoothstep(0.82, 0.97, sin(depth * 5.0 - uTime * 1.9 + n * 3.0)) * (1.0 - smoothstep(0.35, 1.5, depth)) * shoreBands;
  float foam = max(max(edge, band * 0.85) * uFoamAmt, max(flowFoam, ringFoam));
  foam *= smoothstep(-0.05, 0.02, depth);
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

  float alpha = mix(uAlpha.x, uAlpha.y, smoothstep(0.0, 2.6, depth));
  // grazing views reflect more and see less of the bed
  alpha = max(alpha, min(0.97, fres * 1.2) * smoothstep(0.15, 1.0, depth));
  alpha = max(alpha, foam);
  alpha *= smoothstep(-0.12, 0.02, depth) * fade;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFogAmount);
  #endif
}`;

const LAVA_FRAG = /* glsl */`
uniform float uTime;
uniform float uMode;        // 0 = pool (slow swirl around uCenter), 1 = river
uniform float uFlowRef;
uniform float uGlow;
uniform float uFogAmount;
uniform vec2 uCenter;
uniform vec2 uEdge;         // pool: the depth over which the crust gives way to molten lava
uniform float uPlates;      // how much of the surface crust plates may cover (1 = all they would)
uniform vec3 uCrust;
uniform vec3 uCrustHot;
uniform vec3 uHot;
uniform vec3 uCore;
varying vec3 vWorld;
varying float vSurfY;
varying vec2 vUv;
varying vec3 vFlow;
varying vec3 vRiver;
${HEIGHT}
${NOISE}
// cellular noise: (F1, F2, random id of the nearest cell)
vec3 worley(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash22(i + g) - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = hash12(i + g + 17.0); }
      else if (d < f2) { f2 = d; }
    }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
#include <fog_pars_fragment>
void main() {
  float depth = vSurfY - groundAt(vWorld.xz);
  vec2 q;
  float edge;
  float rapid = 0.0;
  float fade = 1.0;
  if (uMode > 0.5) {
    q = vec2(vUv.x, (vRiver.z - uTime) * uFlowRef);
    edge = clamp(abs(vUv.x) / max(vRiver.x, 0.5), 0.0, 1.5);
    rapid = smoothstep(0.04, 0.2, vFlow.z);
    fade = vRiver.y;
  } else {
    float a = uTime * 0.012;
    float c = cos(a), s = sin(a);
    q = mat2(c, -s, s, c) * (vWorld.xz - uCenter);
    edge = 1.0 - smoothstep(uEdge.x, uEdge.y, depth);
  }
  // organic plate shapes: domain-warped cells
  vec2 wq = q + (vec2(vnoise(q * 0.15 + 3.1), vnoise(q * 0.15 + 7.7)) - 0.5) * 3.0;
  vec3 wc = worley(wq * 0.3);
  float crack = wc.y - wc.x;
  float coverage = (mix(0.3, 0.95, smoothstep(0.25, 1.0, edge)) - rapid * 0.35) * uPlates;
  float plate = step(wc.z, coverage);
  float plateMask = plate * smoothstep(0.04, 0.16, crack);

  // molten flow: streaky, brightest in the middle of the stream
  float m1 = vnoise(vec2(q.x * 0.6, q.y * 0.25));
  float m2 = vnoise(q * 1.3 + vec2(0.0, uTime * 0.3));
  float heat = clamp(m1 * 0.7 + m2 * 0.45, 0.0, 1.0);
  float center = 1.0 - smoothstep(0.0, 0.9, edge);
  vec3 molten = mix(uHot, uCore, smoothstep(0.35, 0.95, heat * 0.75 + center * 0.45));
  float pulse = 0.9 + 0.1 * sin(uTime * 1.7 + m1 * 6.2832);
  molten *= uGlow * pulse;

  // crust plates: dark with a warm rim close to the cracks
  float tex = vnoise(q * 2.2);
  vec3 crust = mix(uCrust, uCrust * 1.8, tex);
  crust = mix(uCrustHot, crust, smoothstep(0.05, 0.32, crack));
  vec3 col = mix(molten, crust, plateMask);

  // cooling along the banks
  float bank = 1.0 - smoothstep(0.0, 0.4, depth);
  col = mix(col, mix(uCrust, uCrustHot, 0.4), bank * 0.75);

  float alpha = smoothstep(-0.15, 0.02, depth) * fade;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFogAmount);
  #endif
}`;

const FALL_VERT = /* glsl */`
attribute vec3 aFall;      // (fraction down the fall, metres down the fall, 1 = running over rock)
varying vec2 vUv;
varying vec3 vFall;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vFall = aFall;
  vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FALL_FRAG = /* glsl */`
uniform float uTime;
uniform float uGlow;
uniform float uOpacity;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vFall;
${NOISE}
#include <fog_pars_fragment>
void main() {
  // streaks scrolling down the water's path (metres, so long cascades don't stretch)
  float x = vUv.x * 9.0;
  float m = vFall.y;
  float rock = vFall.z;
  float streak = vnoise(vec2(x, m * 0.55 - uTime * 2.6));
  streak = smoothstep(0.35, 0.8, streak + vnoise(vec2(x * 2.3, m * 1.4 - uTime * 4.0)) * 0.4);
  vec3 col = mix(uColA, uColB, streak);
  // where it tumbles over rock it breaks up into white water, torn and patchy
  float tumble = vnoise(vec2(x * 1.7, m * 2.2 - uTime * 3.3));
  float white = rock * smoothstep(0.3, 0.75, tumble);
  float topFoam = 1.0 - smoothstep(0.0, 0.06, vFall.x);
  float bottomFoam = smoothstep(0.86, 1.0, vFall.x);
  col = mix(col, uFoam, clamp(max(max(topFoam, bottomFoam) * 0.9, white * 0.85), 0.0, 1.0)) * uGlow;
  float edge = smoothstep(0.0, 0.1 + rock * 0.12, vUv.x) * smoothstep(1.0, 0.9 - rock * 0.12, vUv.x);
  // thin, glassy film over the rock: more see-through between the white patches
  float alpha = uOpacity * edge * mix(1.0, 0.55 + 0.45 * smoothstep(0.2, 0.7, tumble + streak * 0.3), rock);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------- helpers

function heightTexture(terrain) {
  const n1 = terrain.n + 1;
  const data = new Uint16Array(n1 * n1);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(terrain.heights[i]);
  const tex = new THREE.DataTexture(data, n1, n1, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const color = (hex, fallback) => {
  const c = new THREE.Color();
  try { c.set(hex ?? fallback); } catch { c.set(fallback); }
  return c;
};

function fogUniforms() {
  return {
    fogDensity: { value: 0.00025 },
    fogNear: { value: 1 },
    fogFar: { value: 2000 },
    fogColor: { value: new THREE.Color(0xffffff) },
  };
}

/**
 * Bog water (swamp): a quad at the bog's level over each terrain cell that
 * has bog water in it (Terrain.bogLevel), or null on islands without bogs.
 * Where the mud rises above the level the terrain hides the sheet.
 */
export function bogGeometry(terrain) {
  const L = terrain.bogLevel;
  if (!L) return null;
  const n = terrain.n, n1 = n + 1, cell = terrain.cell, half = terrain.half;
  const pos = [], idx = [];
  const verts = new Map();
  const vert = (i, j, y) => {
    const k = `${j * n1 + i}:${y}`;
    let v = verts.get(k);
    if (v === undefined) { v = pos.length / 3; pos.push(-half + i * cell, y, -half + j * cell); verts.set(k, v); }
    return v;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = [j * n1 + i, j * n1 + i + 1, (j + 1) * n1 + i, (j + 1) * n1 + i + 1];
      let level = -Infinity;
      for (const k of c) if (L[k] > level) level = L[k];
      if (level === -Infinity) continue;
      if (Math.min(...c.map((k) => terrain.heights[k])) >= level) continue;
      const a = vert(i, j, level), b = vert(i + 1, j, level), cc = vert(i, j + 1, level), d = vert(i + 1, j + 1, level);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return withSheetAttrs(geo);
}

// ---------------------------------------------------------------- build

export function buildWater(terrain, layout = {}, sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize()) {
  const group = new THREE.Group();
  group.name = 'water';
  const heightTex = heightTexture(terrain);
  const biome = layout?.biome || {};
  const pal = { ...DEFAULT_WATER, ...(biome.water || {}) };
  const sunHex = biome.sky?.sun || DEFAULT_SUN;
  const seaLevel = CONFIG.world?.seaLevel ?? 0;

  // Uniform objects shared by every water/lava material (one update per frame).
  const shared = {
    ...fogUniforms(),
    uTime: { value: 0 },
    uHeight: { value: heightTex },
    uHalf: { value: terrain.half },
    uCell: { value: terrain.cell },
    uN1: { value: terrain.n + 1 },
    uSunDir: { value: sunDir.clone().normalize() },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uImpact: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  let nextRipple = 0;
  const waterColors = {
    uShallow: { value: color(pal.shallow, DEFAULT_WATER.shallow) },
    uMid: { value: color(pal.mid, DEFAULT_WATER.mid) },
    uDeep: { value: color(pal.deep, DEFAULT_WATER.deep) },
    uFoam: { value: color(pal.foam, DEFAULT_WATER.foam) },
    uSky: { value: color(pal.sky, DEFAULT_WATER.sky) },
    // reflections looking up: the biome's zenith, a little lighter
    uSkyTop: { value: color(biome.sky?.top, '#4fb0f0').lerp(color(pal.sky, DEFAULT_WATER.sky), 0.35) },
    uSunColor: { value: color(sunHex, DEFAULT_SUN) },
  };
  const lavaColors = {
    uCrust: { value: color(LAVA.crust) },
    uCrustHot: { value: color(LAVA.crustHot) },
    uHot: { value: color(LAVA.hot) },
    uCore: { value: color(LAVA.core) },
    uGlow: { value: 1.7 },
  };

  // Same shader source for every water surface -> one compiled program;
  // only the small per-surface uniforms differ.
  const waterMaterial = ({ mode = 0, waveAmp = 0.22, ripple = 0.25, alpha = [0.55, 0.94], fog = 0.5, flowRef = 1.6, gloss = 1, foam = 1 } = {}) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        ...shared,
        ...waterColors,
        uMode: { value: mode },
        uWaveAmp: { value: waveAmp },
        uRipple: { value: ripple },
        uAlpha: { value: new THREE.Vector2(alpha[0], alpha[1]) },
        uFogAmount: { value: fog },
        uFlowRef: { value: flowRef },
        uGloss: { value: gloss },
        uFoamAmt: { value: foam },
      },
      transparent: true,
      fog: true,
    });
    return m;
  };
  const lavaMaterial = ({ mode = 0, center = [0, 0], flowRef = 0.45, edge = [0.3, 3.0], plates = 1 } = {}) => new THREE.ShaderMaterial({
    vertexShader: SURF_VERT,
    fragmentShader: LAVA_FRAG,
    uniforms: {
      ...shared,
      ...lavaColors,
      uMode: { value: mode },
      uWaveAmp: { value: 0 },
      uCenter: { value: new THREE.Vector2(center[0], center[1]) },
      uEdge: { value: new THREE.Vector2(edge[0], edge[1]) },
      uPlates: { value: plates },
      uFlowRef: { value: flowRef },
      uFogAmount: { value: 0.3 },
    },
    transparent: true,     // only for the soft bank / river-end fade; alpha is ~1 elsewhere
    fog: true,
  });

  // --- sea
  const seaSize = Math.max(1500, terrain.half * 2 + 900);
  const seaSegs = Math.min(320, Math.round(seaSize / 6.5));
  const seaMat = waterMaterial({ waveAmp: 0.22, ripple: 0.25 });
  const sea = new THREE.Mesh(withSheetAttrs(new THREE.PlaneGeometry(seaSize, seaSize, seaSegs, seaSegs).rotateX(-Math.PI / 2)), seaMat);
  sea.position.y = seaLevel;
  sea.renderOrder = 1;
  sea.name = 'sea';
  group.add(sea);

  // --- pools (waterfall basins, crater lava lake)
  for (const pool of layout?.pools || []) {
    if (!pool || !Number.isFinite(pool.x) || !Number.isFinite(pool.z) || !(pool.r > 0)) continue;
    const level = Number.isFinite(pool.level) ? pool.level : seaLevel;
    const lava = pool.kind === 'lava';
    const mat = lava
      // (a small crater's shallow lava glows molten almost to its rim, a few thin plates on it)
      ? lavaMaterial({ mode: 0, center: [pool.x, pool.z], ...(pool.small ? { edge: [0.05, 0.6], plates: 0.3 } : {}) })
      : waterMaterial({ waveAmp: 0.05, ripple: 0.18, alpha: [0.5, 0.92] });
    const rad = pool.disc ?? pool.r * 1.4;
    const mesh = new THREE.Mesh(discGeometry(rad, 56, Math.max(6, Math.min(16, Math.round(rad / 3)))), mat);
    mesh.position.set(pool.x, level, pool.z);
    mesh.renderOrder = 2;
    mesh.name = lava ? 'lavaPool' : 'pool';
    group.add(mesh);
  }

  // --- bogs (swamp): one sheet over every grid cell their water covers, at
  // each field's level; murky, dull, a faint foam line at the mud
  const bogGeo = bogGeometry(terrain);
  if (bogGeo) {
    const mesh = new THREE.Mesh(bogGeo, waterMaterial({ waveAmp: 0.01, ripple: 0.1, alpha: [0.8, 0.94], gloss: 0.25, foam: 0.35 }));
    mesh.renderOrder = 2;
    mesh.name = 'bogs';
    group.add(mesh);
  }

  // --- rivers
  for (const river of layout?.rivers || []) {
    const lava = river?.kind === 'lava';
    const geo = riverGeometry(river, lava
      ? { speed: (s) => Math.min(1.6, 0.35 + s * 6), fadeStart: 2, fadeEnd: 5, widthScale: 1.25, widthPad: 0.6 }
      : { speed: (s) => Math.min(6, 1.2 + s * 30), fadeStart: 3, fadeEnd: 8 });
    if (!geo) continue;
    const mat = lava
      ? lavaMaterial({ mode: 1, flowRef: 0.45 })
      : waterMaterial({ mode: 1, waveAmp: 0.03, ripple: 0.3, alpha: [0.42, 0.86], flowRef: 1.6 });
    // Rivers join pools / the sea at the same height: pull them forward in
    // depth and draw them after the sheets so the joint does not flicker.
    mat.depthWrite = lava;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    mesh.name = lava ? 'lavaRiver' : 'river';
    group.add(mesh);
  }

  // --- waterfalls
  const falls = layout?.waterfalls || (layout?.waterfall ? [layout.waterfall] : []);
  const fallMatFor = (kind) => new THREE.ShaderMaterial({
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    uniforms: {
      ...fogUniforms(),
      uTime: shared.uTime,
      uGlow: { value: kind === 'lava' ? 1.6 : 1 },
      uOpacity: { value: kind === 'lava' ? 1 : 0.88 },
      uColA: { value: kind === 'lava' ? color('#e8400c') : color(pal.mid, DEFAULT_WATER.mid).lerp(new THREE.Color('#ffffff'), 0.35) },
      uColB: { value: kind === 'lava' ? color('#ffc23a') : new THREE.Color('#dff6ff') },
      uFoam: { value: kind === 'lava' ? color('#ffe28a') : new THREE.Color('#ffffff') },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true,
  });
  const fallMats = {};
  const emitters = [];   // splash emitters (water falls only)
  for (const wf of falls) {
    if (!wf?.top || !wf?.bottom) continue;
    const kind = wf.kind === 'lava' ? 'lava' : 'water';
    const fallMat = fallMats[kind] || (fallMats[kind] = fallMatFor(kind));
    let dx = wf.dirX ?? 0, dz = wf.dirZ ?? 0;
    if (Math.hypot(dx, dz) < 1e-6) { dx = wf.bottom.x - wf.top.x; dz = wf.bottom.z - wf.top.z; }
    if (Math.hypot(dx, dz) < 1e-6) dx = 1;
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const top = new THREE.Vector3(wf.top.x, wf.top.y + SPRING_WATER_OFFSET, wf.top.z);
    const width = wf.width > 0 ? wf.width : 4;
    // where the water meets its basin (layout: a little way out into the pool)
    const end = new THREE.Vector3(wf.impact?.x ?? wf.bottom.x, wf.impact?.y ?? wf.bottom.y, wf.impact?.z ?? wf.bottom.z);
    const run = Math.max(1, (end.x - top.x) * dir.x + (end.z - top.z) * dir.z);

    // Mountain water falls straight down into the pool. Legacy lava cascades
    // retain their terrain-following path when they have no vertical flag.
    const v0 = 2.6;                                            // m/s over the lip
    const s0 = 0;                                              // attached to the grotto's lip
    const steps = Math.max(24, Math.ceil((wf.vertical ? top.y - end.y : run - s0) / 0.45)), cols = 8;
    const pos = [], uvs = [], fall = [], idx = [];
    const prevY = new Array(cols + 1).fill(Infinity);
    const rowArc = [0];
    let lastC = null;
    const rows = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = s0 + (run - s0) * t;
      const free = top.y - (s > 0 ? 4.9 * (s / v0) ** 2 : 0);
      // spreads a little as it falls, gathers again into the plunge
      const spread = (1 + t * 0.35) * (1 - smoothstepJS(0.82, 1, t) * 0.45);
      const row = [];
      for (let j = 0; j <= cols; j++) {
        const a = (j / cols - 0.5) * width * spread;
        const x = top.x + dir.x * (wf.vertical ? 0 : s) + side.x * a, z = top.z + dir.z * (wf.vertical ? 0 : s) + side.z * a;
        const ground = terrain.heightAt(x, z) + 0.12;
        let y = wf.vertical ? THREE.MathUtils.lerp(top.y, end.y + 0.02, t) : Math.max(free, end.y + 0.02);
        if (i === steps) y = end.y + 0.02;
        y = Math.min(y, prevY[j]);                             // water never climbs ...
        if (!wf.vertical) y = Math.max(y, ground);                               // ... nor sinks into the rock
        prevY[j] = y;
        const contact = !wf.vertical && s > 0 && i < steps ? THREE.MathUtils.clamp((ground - free) / 0.5, 0, 1) : 0;
        row.push([x, y, z, contact]);
      }
      const c = row[cols >> 1];
      if (lastC) rowArc.push(rowArc[rowArc.length - 1] + Math.hypot(c[0] - lastC[0], c[1] - lastC[1], c[2] - lastC[2]));
      lastC = c;
      rows.push(row);
    }
    const total = rowArc[rowArc.length - 1] || 1;
    let rockRun = 0;
    rows.forEach((row, i) => {
      for (let j = 0; j <= cols; j++) {
        const [x, y, z, contact] = row[j];
        pos.push(x, y, z);
        uvs.push(j / cols, 1 - i / steps);
        fall.push(rowArc[i] / total, rowArc[i], contact);
        if (j === cols >> 1 && contact > 0.5) rockRun++;
      }
    });
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, fallMat);
    mesh.renderOrder = 4;
    mesh.name = kind === 'lava' ? 'lavafall' : 'waterfall';
    group.add(mesh);
    // for the audio: how much of it tumbles over rock (a cascade) vs falls freely
    wf.cascade = rockRun / (steps + 1);

    if (kind === 'water') {
      emitters.push({ origin: end.clone(), dir, side, width });
      // the plunge: churn and rings around the impact (water shader)
      shared.uImpact.value.set(end.x, end.z, wf.plunge?.r ?? 1.8, wf.plunge?.churn ?? 0.7);
    }
  }

  // Splash droplets + mist puffs: soft smooth spheres, pooled for all falls.
  const splash = [];
  const rng = makeRng(99);
  const dropsPer = 40, mistPer = 10;
  let drops = null, mist = null;
  const dropMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, roughness: 0.4, emissive: '#cfefff', emissiveIntensity: 0.45, depthWrite: false });
  if (emitters.length) {
    const mistMat = new THREE.MeshStandardMaterial({ color: '#f4fbff', transparent: true, opacity: 0.22, roughness: 1, emissive: '#e6f6ff', emissiveIntensity: 0.6, depthWrite: false });
    drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), dropMat, dropsPer * emitters.length);
    mist = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mistMat, mistPer * emitters.length);
    drops.frustumCulled = mist.frustumCulled = false;
    drops.renderOrder = mist.renderOrder = 5;
    for (const e of emitters) {
      for (let i = 0; i < dropsPer; i++) {
        splash.push({ e, mesh: drops, mist: false, t: rng(), life: 0.9 + rng() * 0.9, sx: (rng() - 0.5) * e.width * 1.1, vx: rng() - 0.5, vz: rng() * 0.8, vy: 1.5 + rng() * 3.5, s: 0.2 + rng() * 0.35 });
      }
      for (let i = 0; i < mistPer; i++) {
        splash.push({ e, mesh: mist, mist: true, t: rng(), life: 2.2 + rng() * 1.8, sx: (rng() - 0.5) * e.width * 1.3, vx: rng() - 0.5, vz: 0.3 + rng() * 0.6, vy: 0.6 + rng() * 0.8, s: 1.2 + rng() * 1.4 });
      }
    }
    group.add(drops, mist);
  }

  // One-off splashes (a player jumping in, an arrow hitting the water): a short
  // burst of droplets from a small shared pool.
  const BURST = 64;
  const burstMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, BURST);
  burstMesh.frustumCulled = false;
  burstMesh.renderOrder = 5;
  const bursts = Array.from({ length: BURST }, () => ({ age: 1, life: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  let nextBurst = 0, burstsLive = false;
  group.add(burstMesh);
  const dummy = new THREE.Object3D();
  dummy.scale.setScalar(0.0001);
  dummy.updateMatrix();
  for (let i = 0; i < BURST; i++) burstMesh.setMatrixAt(i, dummy.matrix);     // all hidden until a splash
  return {
    group,
    heightTex,
    /**
     * A ring ripple spreading from (x, z) on whatever water is there (footsteps,
     * wading, things falling in). strength ~0.3 (step) .. 1.5 (big splash).
     */
    ripple(x, z, strength = 1) {
      shared.uRipples.value[nextRipple++ % MAX_RIPPLES].set(x, z, shared.uTime.value, strength);
    },
    /** Something broke the surface at (x, y, z): droplets fly up, a ring spreads. strength 0..1.5. */
    splash(x, y, z, strength = 1) {
      this.ripple(x, z, 0.6 + strength * 0.6);
      const n = Math.round(5 + strength * 14);
      for (let i = 0; i < n; i++) {
        const b = bursts[nextBurst++ % BURST];
        const a = Math.random() * Math.PI * 2, out = (0.6 + Math.random() * 1.4) * (0.5 + strength * 0.5);
        Object.assign(b, {
          age: 0, life: 0.45 + Math.random() * 0.45, x, y: y + 0.05, z,
          vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: (1.8 + Math.random() * 2.8) * (0.55 + strength * 0.45),
          s: (0.05 + Math.random() * 0.08) * (0.7 + strength * 0.4), floor: y,
        });
      }
      burstsLive = true;
    },
    update(dt, time) {
      shared.uTime.value = time;
      if (burstsLive) {
        burstsLive = false;
        for (let i = 0; i < BURST; i++) {
          const b = bursts[i];
          if (b.age < 1) {
            b.age += dt / b.life;
            b.vy -= 9.8 * dt;
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            if (b.y < b.floor) b.age = 1;
            burstsLive = true;
          }
          dummy.position.set(b.x, b.y, b.z);
          dummy.scale.setScalar(b.age < 1 ? b.s * (1 - b.age * 0.5) : 0.0001);
          dummy.updateMatrix();
          burstMesh.setMatrixAt(i, dummy.matrix);
        }
        burstMesh.instanceMatrix.needsUpdate = true;
      }
      if (!splash.length) return;
      let di = 0, mi = 0;
      for (const p of splash) {
        const { origin, dir, side } = p.e;
        p.t += dt / p.life;
        if (p.t > 1) p.t -= 1;
        const t = p.t * p.life;
        const x = origin.x + side.x * p.sx + dir.x * (p.vz * t * 3 + 0.5) + p.vx * t * 2 * (p.mist ? 0.5 : 1);
        const z = origin.z + side.z * p.sx + dir.z * (p.vz * t * 3 + 0.5) + p.vx * t * (p.mist ? 0.5 : 1);
        let y, s;
        if (p.mist) {
          y = origin.y + 0.3 + p.vy * t;
          s = p.s * (0.6 + p.t * 0.9) * Math.sin(Math.PI * p.t);   // swell in, fade out
        } else {
          y = Math.max(origin.y - 0.2, origin.y + p.vy * t - 2.94 * t * t);
          s = p.s * (1 - p.t * 0.6);
        }
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(Math.max(0.001, s));
        dummy.updateMatrix();
        if (p.mist) p.mesh.setMatrixAt(mi++, dummy.matrix);
        else p.mesh.setMatrixAt(di++, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
      mist.instanceMatrix.needsUpdate = true;
    },
  };
}
