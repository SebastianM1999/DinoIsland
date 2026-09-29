// Volcano effects above the crater (the lava surface is built elsewhere):
// a tall drifting smoke plume (pooled soft puffs, one InstancedMesh with a
// per-instance fade), rising glowing embers (one additive InstancedMesh), a
// warm glow haze and one flickering orange PointLight in the crater.
// Cheap: fixed pools, typed arrays, no per-frame allocations.
//
// API: buildVolcanoFx(v) -> { group, update(dt, time, camPos) }
//   v = { x, z, craterY, craterR }; group sits at (x, craterY, z).
//   camPos (THREE.Vector3, optional) only throttles updates when far away.

import * as THREE from 'three';
import { deform, paint } from '../kit.js';
import { noise3 } from './common.js';

const PUFFS = 44;
const EMBERS = 70;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function puffGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g = deform(g, (v) => { v.multiplyScalar(1 + 0.16 * noise3(v.x * 1.6, v.y * 1.6, v.z * 1.6, 5)); });
  g = paint(g, (c, n) => {
    const k = 0.78 + 0.22 * (n.y * 0.5 + 0.5);
    return _c.setRGB(k, k, k);
  });
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

function smokeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.62, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  m.customProgramCacheKey = () => 'volcano-smoke';
  return m;
}

export function buildVolcanoFx(v) {
  const group = new THREE.Group();
  group.name = 'volcano-fx';
  group.position.set(v.x, v.craterY, v.z);
  const R = v.craterR || 10;

  // ---------------------------------------------------------------- smoke
  const geo = puffGeometry();
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
  geo.setAttribute('aFade', fade);
  const smoke = new THREE.InstancedMesh(geo, smokeMaterial(), PUFFS);
  smoke.castShadow = false; smoke.receiveShadow = false;
  smoke.frustumCulled = false;
  smoke.renderOrder = 2;
  const age = new Float32Array(PUFFS), life = new Float32Array(PUFFS);
  const ox = new Float32Array(PUFFS), oz = new Float32Array(PUFFS), spin = new Float32Array(PUFFS), size = new Float32Array(PUFFS);
  const respawn = (i, t0) => {
    life[i] = 20 + Math.random() * 8;
    age[i] = t0;
    const a = Math.random() * Math.PI * 2, r = Math.random() * R * 0.35;
    ox[i] = Math.cos(a) * r; oz[i] = Math.sin(a) * r;
    spin[i] = Math.random() * 6.28;
    size[i] = 0.8 + Math.random() * 0.5;
  };
  for (let i = 0; i < PUFFS; i++) respawn(i, (i / PUFFS) * 24);
  smoke.setColorAt(0, _c.setRGB(1, 1, 1));
  group.add(smoke);

  // --------------------------------------------------------------- embers
  const eGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const eMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const embers = new THREE.InstancedMesh(eGeo, eMat, EMBERS);
  embers.castShadow = false; embers.receiveShadow = false;
  embers.frustumCulled = false;
  const ex = new Float32Array(EMBERS), ey = new Float32Array(EMBERS), ez = new Float32Array(EMBERS);
  const vx = new Float32Array(EMBERS), vy = new Float32Array(EMBERS), vz = new Float32Array(EMBERS);
  const eAge = new Float32Array(EMBERS), eLife = new Float32Array(EMBERS);
  const spark = (i, t0 = 0) => {
    const a = Math.random() * Math.PI * 2, r = Math.random() * R * 0.5;
    ex[i] = Math.cos(a) * r; ey[i] = Math.random() * 2; ez[i] = Math.sin(a) * r;
    vx[i] = (Math.random() - 0.5) * 4; vz[i] = (Math.random() - 0.5) * 4; vy[i] = 7 + Math.random() * 10;
    eLife[i] = 2.5 + Math.random() * 3.5;
    eAge[i] = t0;
  };
  for (let i = 0; i < EMBERS; i++) { spark(i, Math.random() * 5); embers.setColorAt(i, _c.setRGB(1, 0.6, 0.2)); }
  group.add(embers);

  // ----------------------------------------------------------- glow + light
  const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  haze.scale.set(R * 0.95, R * 0.4, R * 0.95);
  haze.position.y = 1;
  haze.renderOrder = 1;
  group.add(haze);
  const light = new THREE.PointLight(0xff6a2a, 60, R * 7, 1.4);
  light.position.set(0, 3, 0);
  light.castShadow = false;
  group.add(light);

  const wind = new THREE.Vector2(0.8, 0.6).normalize();
  let acc = 0, frame = 0;

  const update = (dt, time, camPos) => {
    dt = Math.min(dt, 0.1);
    acc += dt;
    frame++;
    if (camPos) {
      const d = Math.hypot(camPos.x - v.x, camPos.z - v.z);
      if (d > 450 && frame % 4) return;                  // far away: update every 4th frame
    }
    const step = acc; acc = 0;

    for (let i = 0; i < PUFFS; i++) {
      let a = age[i] + step;
      if (a > life[i]) { respawn(i, 0); a = 0; }
      age[i] = a;
      const t = a / life[i];
      const rise = a * 3.2 + t * t * 10;
      const drift = t * t * 38;
      _p.set(ox[i] * (1 + t * 2) + wind.x * drift + Math.sin(a * 0.3 + spin[i]) * 2, 2 + rise, oz[i] * (1 + t * 2) + wind.y * drift);
      const s = R * size[i] * (0.35 + 1.25 * Math.sqrt(t));
      _s.set(s, s * 0.8, s);
      _e.set(0, spin[i] + a * 0.05, 0);
      _q.setFromEuler(_e);
      smoke.setMatrixAt(i, _m.compose(_p, _q, _s));
      const g = 0.2 + 0.28 * Math.min(1, t * 1.5);
      const warm = Math.max(0, 1 - t * 5);
      smoke.setColorAt(i, _c.setRGB(g + warm * 0.35, g + warm * 0.1, g * 0.98));
      fade.array[i] = Math.min(1, t / 0.06) * (1 - Math.max(0, (t - 0.55) / 0.45));
    }
    smoke.instanceMatrix.needsUpdate = true;
    smoke.instanceColor.needsUpdate = true;
    fade.needsUpdate = true;

    for (let i = 0; i < EMBERS; i++) {
      let a = eAge[i] + step;
      if (a > eLife[i]) { spark(i); a = 0; }
      eAge[i] = a;
      vy[i] -= 3.5 * step;
      ex[i] += (vx[i] + wind.x * 2) * step; ey[i] += vy[i] * step; ez[i] += (vz[i] + wind.y * 2) * step;
      const t = a / eLife[i];
      const s = (1 - t) * (0.7 + 0.5 * Math.sin(time * 20 + i));
      _p.set(ex[i], ey[i], ez[i]);
      _s.setScalar(Math.max(0.01, s));
      _q.identity();
      embers.setMatrixAt(i, _m.compose(_p, _q, _s));
      embers.setColorAt(i, _c.setRGB(1, 0.85 - t * 0.6, 0.35 - t * 0.3));
    }
    embers.instanceMatrix.needsUpdate = true;
    embers.instanceColor.needsUpdate = true;

    light.intensity = 60 * (0.8 + 0.12 * Math.sin(time * 2.3) + 0.08 * Math.sin(time * 7.1));
    haze.material.opacity = 0.24 + 0.05 * Math.sin(time * 1.7);
  };
  update(0.016, 0);
  return { group, update };
}
