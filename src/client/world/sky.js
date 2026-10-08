// Stylized sky: gradient dome with a soft sun, drifting soft rounded clouds
// and distant hazy islands (incl. a smoking volcano) on the horizon.
// Colors come from the level biome (layout.biome.sky / .terrain); everything
// is smooth-shaded (no faceted low-poly look).

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { paint, place, merge, prep } from '../models/kit.js';

// Fallback palette (= the jungle biome) when no layout/biome is given.
const DEFAULT_SKY = {
  background: '#7cc8f5', fog: '#a8dcf7',
  top: '#4fb0f0', horizon: '#a8dcf7', cloud: '#ffffff', sun: '#fff0d6',
};
const DEFAULT_LAND = { grass: '#78b857', sand: '#e8c98a', rock: '#9a8fa6' };

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.62, h), 0.8));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 3.5 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.06);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Smooth, low-frequency bump (unlike kit.jitter, which is per-vertex noise). */
function bump(v, scale, seed) {
  return Math.sin(v.x * scale + seed * 1.7) * Math.sin(v.y * scale * 1.3 + seed * 2.3) * Math.sin(v.z * scale * 0.9 + seed * 0.7)
    + 0.5 * Math.sin(v.x * scale * 2.1 - seed) * Math.sin(v.z * scale * 1.9 + seed * 3.1);
}

/** Displace an (indexed) geometry per unique vertex, keeping it welded. */
function smoothDeform(geo, fn) {
  const g = prep(geo);
  const p = g.attributes.position;
  const cache = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let out = cache.get(key);
    if (!out) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      fn(v);
      out = [v.x, v.y, v.z];
      cache.set(key, out);
    }
    p.setXYZ(i, out[0], out[1], out[2]);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function buildSky(gfx, layout = null) {
  const group = new THREE.Group();
  group.name = 'sky';
  const rng = makeRng(777);
  const biome = layout?.biome || {};
  // (the Hollow Mountain's dome is the dusk of its coves, biome.skyOutside; inside the mountain the roof hides it)
  const sky = { ...DEFAULT_SKY, ...(biome.skyOutside || biome.sky || {}) };
  const land = biome.terrain || {};
  const volcanic = biome.id === 'volcano';
  const cave = biome.id === 'cave';
  const C = (hex, fb) => {
    const c = new THREE.Color();
    try { c.set(hex ?? fb); } catch { c.set(fb); }
    return c;
  };

  const zenith = C(sky.top, DEFAULT_SKY.top);
  const horizon = C(sky.horizon, DEFAULT_SKY.horizon);
  const background = C(sky.background, DEFAULT_SKY.background);
  const cloudCol = C(sky.cloud, DEFAULT_SKY.cloud);
  const sunCol = C(sky.sun, DEFAULT_SKY.sun);

  // --- dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uZenith: { value: zenith.clone() },
      uHorizon: { value: horizon.clone() },
      uGround: { value: horizon.clone().lerp(background, 0.5) },
      uSunColor: { value: sunCol.clone() },
      uSunDir: { value: gfx.sunDir.clone() },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);
  gfx.scene.background = null;

  // --- clouds: soft rounded clusters, bright tops, bellies tinted toward the sky
  const cloudTop = cloudCol.clone();
  const cloudMid = cloudCol.clone().lerp(horizon, 0.12);
  const cloudBelly = cloudCol.clone().lerp(volcanic ? zenith : horizon, 0.35).multiplyScalar(0.88);
  const cloudMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, fog: false,
    emissive: cloudCol.clone().lerp(horizon, 0.15), emissiveIntensity: volcanic ? 0.7 : 0.9,
  });
  const cloudEmissive = cloudMat.emissive.clone(), cloudGlow = cloudMat.emissiveIntensity;
  const cloudGeos = [];
  for (let v = 0; v < 4; v++) {
    const parts = [];
    const n = 4 + v;
    for (let i = 0; i < n; i++) {
      const r = 9 + rng() * 9 * (1 - Math.abs(i - n / 2) / n);
      const seed = v * 10 + i;
      let g = new THREE.IcosahedronGeometry(r, 3);
      g = smoothDeform(g, (p) => {
        const k = 1 + bump(p, 2.2 / r, seed) * 0.08;
        p.multiplyScalar(k);
        // soft flattened belly (smooth blend instead of a hard cut)
        const floor = -r * 0.3;
        if (p.y < floor + r * 0.2) {
          const t = Math.min(1, (floor + r * 0.2 - p.y) / (r * 0.9));
          p.y = p.y + (floor - p.y) * t * t * (3 - 2 * t) * 0.85;
        }
      });
      parts.push(place(g, [(i - n / 2) * 13 + rng() * 5, rng() * 5, rng() * 10 - 5], [0, rng() * 6, 0], [1.2, 0.75, 1]));
    }
    const merged = paint(merge(parts, Math.PI), (c) => {
      const t = THREE.MathUtils.smoothstep(c.y, -5, 6);
      return t < 0.5 ? cloudBelly.clone().lerp(cloudMid, t * 2) : cloudMid.clone().lerp(cloudTop, (t - 0.5) * 2);
    });
    cloudGeos.push(merged);
  }
  {
    const clouds = [];
    const count = volcanic ? 22 : 18;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 260 + rng() * 430;
      const m = new THREE.Mesh(cloudGeos[i % cloudGeos.length], cloudMat);
      m.position.set(Math.cos(a) * r, 120 + rng() * 90, Math.sin(a) * r);
      const s = 0.8 + rng() * 1.2;
      m.scale.set(s, s * (0.8 + rng() * 0.4), s);
      m.rotation.y = rng() * Math.PI * 2;
      m.userData.speed = 1 + rng() * 1.5;
      group.add(m);
      clouds.push(m);
    }
    group.userData.clouds = clouds;
  }

  // --- distant islands + volcano (fog-free, pre-tinted toward the haze)
  const haze = horizon.clone();
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false });
  const tint = (hex, fb, k) => C(hex, fb).lerp(haze, k);
  const grassHex = land.grass || DEFAULT_LAND.grass;
  const sandHex = land.sand || DEFAULT_LAND.sand;
  const rockHex = land.rock || DEFAULT_LAND.rock;
  const farParts = [];
  const islands = [
    { a: -2.2, d: 640, w: 80, h: 38, k: 0.45 },
    { a: -1.2, d: 700, w: 60, h: 26, k: 0.55 },
    { a: 0.3, d: 620, w: 70, h: 30, k: 0.5 },
    { a: 1.6, d: 680, w: 90, h: 22, k: 0.55 },
    { a: 2.6, d: 600, w: 50, h: 34, k: 0.45 },
  ];
  for (const [idx, isl] of islands.entries()) {
    // smooth dome (upper hemisphere) sinking a little below the sea line
    let g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g = smoothDeform(g, (p) => {
      const b = bump(p, 3.1, idx + 1);
      p.set(p.x * isl.w * (1 + b * 0.06), p.y * isl.h * (1 + b * 0.12) - 4, p.z * isl.w * (1 + b * 0.06));
    });
    g = paint(g, (c) => {
      const t = (c.y + 4) / isl.h;
      if (t < 0.12) return tint(sandHex, DEFAULT_LAND.sand, isl.k);
      if (t > 0.78 && volcanic) return tint(rockHex, DEFAULT_LAND.rock, isl.k);
      return tint(grassHex, DEFAULT_LAND.grass, isl.k).lerp(tint(rockHex, DEFAULT_LAND.rock, isl.k), THREE.MathUtils.smoothstep(t, 0.55, 0.95) * 0.6);
    });
    farParts.push(place(g, [Math.cos(isl.a) * isl.d, 0, Math.sin(isl.a) * isl.d], [0, idx, 0]));
  }
  // Volcano to the north-west: smooth concave cone with a crater lip.
  const vA = -2.0, vD = 720;
  const vx = Math.cos(vA) * vD, vz = Math.sin(vA) * vD;
  {
    const profile = [];
    const H = 95;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      // radius 120 at the base easing to 16 at the rim (concave flanks)
      profile.push(new THREE.Vector2(16 + 104 * Math.pow(1 - t, 1.8), -H / 2 + t * H));
    }
    profile.push(new THREE.Vector2(13, H / 2 - 3));   // crater lip
    let g = new THREE.LatheGeometry(profile, 32);
    g = smoothDeform(g, (p) => {
      const b = bump(p, 0.05, 41);
      p.x *= 1 + b * 0.05;
      p.z *= 1 + b * 0.05;
    });
    const rockV = volcanic ? '#4b4452' : '#8a7f95';
    const rockTop = volcanic ? '#35303b' : '#6f6680';
    const foot = volcanic ? (land.floor || '#4f5a36') : '#6fae52';
    g = paint(g, (c) => {
      const lava = c.y > 20 && Math.abs(Math.atan2(c.z, c.x) - 0.9) < 0.12 + (c.y - 20) * 0.001;
      if (lava) return tint('#ff6a2a', '#ff6a2a', 0.2);
      const k = THREE.MathUtils.smoothstep(c.y, -30, 35);
      return tint(foot, '#6fae52', 0.5).lerp(tint(rockV, rockV, 0.45), THREE.MathUtils.smoothstep(c.y, -35, -10))
        .lerp(tint(rockTop, rockTop, 0.4), k * 0.8);
    });
    if (!cave) farParts.push(place(g, [vx, 44, vz]));   // (the Hollow Mountain has no smoking volcano on its horizon)
  }
  const far = new THREE.Mesh(merge(farParts, Math.PI * 0.55), farMat);
  group.add(far);

  // Volcano smoke plume: soft smooth puffs.
  const smokeGeo = new THREE.SphereGeometry(1, 16, 12);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: volcanic ? '#6e6468' : '#b3aeb8', emissive: volcanic ? '#4a4044' : '#6d6874', emissiveIntensity: 0.4,
    transparent: true, opacity: volcanic ? 0.6 : 0.5, depthWrite: false, fog: false, roughness: 1,
  });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, 14);
  smoke.frustumCulled = false;
  smoke.visible = !cave;
  group.add(smoke);
  const puffs = [];
  for (let i = 0; i < 14; i++) puffs.push({ t: i / 14, off: rng() * 10 });
  const dummy = new THREE.Object3D();

  return {
    group,
    /** Colors this sky was built with (the integrator may reuse them for fog/background). */
    colors: { zenith, horizon, background, cloud: cloudCol, sun: sunCol, fog: C(sky.fog, DEFAULT_SKY.fog) },
    /**
     * Darken the dome toward `dark` (a biome sky: top / horizon) by k (0..1):
     * the local mood near the boss arena. k = 0 restores this sky.
     */
    mood(k, dark) {
      const u = skyMat.uniforms;
      if (k <= 0 || !dark) {
        u.uZenith.value.copy(zenith);
        u.uHorizon.value.copy(horizon);
        u.uGround.value.copy(horizon).lerp(background, 0.5);
        cloudMat.emissive.copy(cloudEmissive);
        cloudMat.emissiveIntensity = cloudGlow;
        return;
      }
      u.uZenith.value.copy(zenith).lerp(C(dark.top, DEFAULT_SKY.top), k);
      u.uHorizon.value.copy(horizon).lerp(C(dark.horizon, DEFAULT_SKY.horizon), k);
      u.uGround.value.copy(u.uHorizon.value).lerp(C(dark.background, DEFAULT_SKY.background), 0.5);
      // clouds turn to ash: smoky grey lit red from below
      cloudMat.emissive.copy(cloudEmissive).lerp(C(dark.cloud, DEFAULT_SKY.cloud), k);
      cloudMat.emissiveIntensity = cloudGlow * (1 - k * 0.75);
    },
    update(dt, time, camPos) {
      if (camPos) dome.position.copy(camPos);
      for (const c of group.userData.clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 720) c.position.x = -720;
      }
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        p.t = (p.t + dt * 0.035) % 1;
        const s = 10 + p.t * 34;
        dummy.position.set(vx + p.t * 90 + Math.sin(p.off + time * 0.2) * 6, 96 + p.t * 140, vz + p.t * 30);
        dummy.scale.set(s, s * 0.8, s);
        dummy.rotation.set(p.off, p.off * 2 + time * 0.05, 0);
        dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    },
  };
}
