// Stylized water: turquoise shallows fading to deep blue, animated foam at the
// shoreline, gentle faceted waves and sun glints. The shader samples a
// terrain height texture to know the water depth per pixel.
// Also builds the lake surface and the waterfall (scrolling shader + splash).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { FEATURES } from '../../shared/terrain.js';
import { makeRng } from '../../shared/rng.js';

const NOISE = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
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

const WATER_VERT = /* glsl */`
uniform float uTime;
uniform float uLevel;
uniform float uWaveAmp;
varying vec3 vWorld;
${HEIGHT}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = uLevel - groundAt(wp.xz);
  float amp = clamp(depth * 0.3, 0.0, 1.0) * uWaveAmp;
  float w = sin(wp.x * 0.11 + uTime * 1.05) * 0.5
          + sin(wp.z * 0.087 - uTime * 0.8 + wp.x * 0.04) * 0.5
          + sin((wp.x + wp.z) * 0.23 + uTime * 1.7) * 0.22;
  wp.y += w * amp;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform float uLevel;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
${HEIGHT}
${NOISE}
#include <fog_pars_fragment>
void main() {
  float depth = uLevel - groundAt(vWorld.xz);
  // faceted normal from screen-space derivatives -> low-poly look
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (N.y < 0.0) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);

  vec3 col = mix(uShallow, uMid, smoothstep(0.3, 3.0, depth));
  col = mix(col, uDeep, smoothstep(3.5, 16.0, depth));

  // lighting: soft diffuse facet shading + sun glint + fresnel sky reflection
  float diff = 0.78 + 0.22 * max(dot(N, uSunDir), 0.0);
  col *= diff;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col = mix(col, uSky, fres * 0.45);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.2;
  col += uSunColor * spec;

  // sparkles on the open water
  float sp = vnoise(vWorld.xz * 0.9 + vec2(uTime * 0.6, -uTime * 0.4));
  col += uSunColor * smoothstep(0.96, 0.995, sp) * 0.25 * smoothstep(1.0, 4.0, depth);

  // shoreline foam: a solid edge plus bands rolling toward the beach
  float n = vnoise(vWorld.xz * 0.35 + uTime * 0.15);
  float edge = 1.0 - smoothstep(0.08, 0.32 + n * 0.18, depth);
  float band = smoothstep(0.82, 0.97, sin(depth * 5.0 - uTime * 1.9 + n * 3.0)) * (1.0 - smoothstep(0.35, 1.5, depth));
  float foam = max(edge, band * 0.85);
  foam *= smoothstep(-0.05, 0.02, depth);
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

  float alpha = mix(0.55, 0.94, smoothstep(0.0, 2.6, depth));
  alpha = max(alpha, foam);
  alpha *= smoothstep(-0.12, 0.02, depth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    // lighter fog on water so the open sea stays vivid blue
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.5);
  #endif
}`;

const FALL_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FALL_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}
#include <fog_pars_fragment>
void main() {
  // streaks scrolling down (uv.y = 1 at the top)
  float x = vUv.x * 9.0;
  float streak = vnoise(vec2(x, vUv.y * 2.0 + uTime * 2.6));
  streak = smoothstep(0.35, 0.8, streak + vnoise(vec2(x * 2.3, vUv.y * 5.0 + uTime * 4.0)) * 0.4);
  vec3 col = mix(uColA, uColB, streak);
  float topFoam = smoothstep(0.9, 1.0, vUv.y);
  float bottomFoam = 1.0 - smoothstep(0.0, 0.18, vUv.y);
  col = mix(col, uFoam, max(topFoam, bottomFoam) * 0.9);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  gl_FragColor = vec4(col, 0.88 * edge);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

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

function waterMaterial(terrain, heightTex, sunDir, level, waveAmp) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uLevel: { value: level },
    uWaveAmp: { value: waveAmp },
    uHeight: { value: null },
    uHalf: { value: terrain.half },
    uCell: { value: terrain.cell },
    uN1: { value: terrain.n + 1 },
    uShallow: { value: new THREE.Color('#57e6dc') },
    uMid: { value: new THREE.Color('#1fb4e0') },
    uDeep: { value: new THREE.Color('#1560c4') },
    uFoam: { value: new THREE.Color('#f4fcff') },
    uSky: { value: new THREE.Color('#a9dcf8') },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color('#fff4d8') },
  }]);
  uniforms.uHeight.value = heightTex; // merge() clones textures – keep the shared one
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms,
    transparent: true,
    fog: true,
  });
}

export function buildWater(terrain, layout, sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize()) {
  const group = new THREE.Group();
  group.name = 'water';
  const heightTex = heightTexture(terrain);
  const mats = [];

  // --- sea
  const seaMat = waterMaterial(terrain, heightTex, sunDir, CONFIG.world.seaLevel, 0.22);
  mats.push(seaMat);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500, 230, 230).rotateX(-Math.PI / 2), seaMat);
  sea.renderOrder = 1;
  group.add(sea);

  // --- lake
  const lf = FEATURES.lake;
  const lakeMat = waterMaterial(terrain, heightTex, sunDir, CONFIG.world.lakeLevel, 0.06);
  lakeMat.uniforms.uMid.value.set('#22bde0');
  mats.push(lakeMat);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(lf.radius * 1.45, 40, 0).rotateX(-Math.PI / 2), lakeMat);
  lake.position.set(lf.x, CONFIG.world.lakeLevel, lf.z);
  lake.renderOrder = 1;
  group.add(lake);

  // --- waterfall
  const fallMats = [];
  const splash = { mesh: null, parts: [] };
  const wf = layout.waterfall;
  if (wf) {
    const fallMat = new THREE.ShaderMaterial({
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color('#5fd0f2') },
        uColB: { value: new THREE.Color('#dff6ff') },
        uFoam: { value: new THREE.Color('#ffffff') },
      }]),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    fallMats.push(fallMat);

    // Curve: from a little behind the lip, over the edge, arcing down into the lake.
    const dir = new THREE.Vector3(wf.dirX, 0, wf.dirZ).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const top = new THREE.Vector3(wf.top.x, wf.top.y + 0.25, wf.top.z);
    const drop = wf.top.y - wf.bottom.y;
    const pts = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // parabolic fall: moves outward quickly at first, then mostly straight down
      const out = -1.5 + Math.sqrt(t) * 5.0;
      pts.push(top.clone().addScaledVector(dir, out).setY(top.y - (t < 0.08 ? t * 2 : t * t * 0.35 + t * 0.65) * (drop + 0.3)));
    }
    const width = wf.width;
    const pos = [], uvs = [], idx = [];
    const cols = 6;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= cols; j++) {
        const s = (j / cols - 0.5) * width * (1 + (i / steps) * 0.35);
        const p = pts[i].clone().addScaledVector(side, s);
        pos.push(p.x, p.y, p.z);
        uvs.push(j / cols, 1 - i / steps);
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fall = new THREE.Mesh(g, fallMat);
    fall.renderOrder = 2;
    group.add(fall);

    // Stream on the plateau feeding the waterfall.
    const streamLen = 16;
    const streamPos = [], streamUv = [], streamIdx = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const c = top.clone().addScaledVector(dir, -1.5 - t * streamLen);
      c.y = Math.max(terrain.heightAt(c.x, c.z) + 0.12, top.y - 0.1 + 0.0);
      const w = width * (1 - t * 0.45);
      for (let j = 0; j <= 1; j++) {
        const p = c.clone().addScaledVector(side, (j - 0.5) * w);
        streamPos.push(p.x, p.y, p.z);
        streamUv.push(j, 1 + t * 2);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 2;
      streamIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(streamPos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(streamUv, 2));
    sg.setIndex(streamIdx);
    const stream = new THREE.Mesh(sg, fallMat);
    stream.renderOrder = 2;
    group.add(stream);

    // Splash + mist: pooled faceted droplets bouncing at the base.
    const bottom = pts[steps].clone();
    bottom.y = CONFIG.world.lakeLevel;
    const splashMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.85, roughness: 0.6, emissive: '#cfefff', emissiveIntensity: 0.4 });
    const count = 46;
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), splashMat, count);
    inst.frustumCulled = false;
    const rng = makeRng(99);
    for (let i = 0; i < count; i++) {
      splash.parts.push({ t: rng(), life: 0.9 + rng() * 0.9, sx: (rng() - 0.5) * width * 1.1, vx: rng() - 0.5, vz: rng() * 0.8, vy: 1.5 + rng() * 3.5, s: 0.35 + rng() * 0.6 });
    }
    splash.mesh = inst;
    splash.origin = bottom;
    splash.dir = dir;
    splash.side = side;
    group.add(inst);
  }

  const dummy = new THREE.Object3D();
  return {
    group,
    heightTex,
    update(dt, time) {
      for (const m of mats) m.uniforms.uTime.value = time;
      for (const m of fallMats) m.uniforms.uTime.value = time;
      if (splash.mesh) {
        const { origin, dir, side } = splash;
        for (let i = 0; i < splash.parts.length; i++) {
          const p = splash.parts[i];
          p.t += dt / p.life;
          if (p.t > 1) p.t -= 1;
          const t = p.t * p.life;
          const x = origin.x + side.x * p.sx + dir.x * (p.vz * t * 3 + 0.5) + p.vx * t * 2;
          const z = origin.z + side.z * p.sx + dir.z * (p.vz * t * 3 + 0.5) + p.vx * t * 2 * 0.5;
          const y = origin.y + p.vy * t - 4.9 * t * t * 0.6;
          const s = p.s * (1 - p.t * 0.6);
          dummy.position.set(x, Math.max(origin.y - 0.2, y), z);
          dummy.scale.setScalar(s);
          dummy.rotation.set(t * 3, i, 0);
          dummy.updateMatrix();
          splash.mesh.setMatrixAt(i, dummy.matrix);
        }
        splash.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
