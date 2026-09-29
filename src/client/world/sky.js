// Stylized sky: gradient dome with a soft sun, drifting low-poly clouds and
// distant hazy islands (incl. a smoking volcano) on the horizon.

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { deform, paint, place, merge, jitter } from '../models/kit.js';

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

export function buildSky(gfx) {
  const group = new THREE.Group();
  group.name = 'sky';
  const rng = makeRng(777);

  // --- dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uZenith: { value: new THREE.Color('#2f8fe6') },
      uHorizon: { value: new THREE.Color('#b9e6fb') },
      uGround: { value: new THREE.Color('#8fd0ef') },
      uSunColor: { value: new THREE.Color('#fff2cf') },
      uSunDir: { value: gfx.sunDir.clone() },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);
  gfx.scene.background = null;

  // --- clouds: puffy clusters of faceted blobs, white tops, soft blue-grey bellies
  const cloudMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, fog: false,
    emissive: new THREE.Color('#e8f2fb'), emissiveIntensity: 0.95,
  });
  const cloudGeos = [];
  for (let v = 0; v < 4; v++) {
    const parts = [];
    const n = 4 + v;
    for (let i = 0; i < n; i++) {
      const r = 9 + rng() * 9 * (1 - Math.abs(i - n / 2) / n);
      let g = new THREE.IcosahedronGeometry(r, 1);
      g = deform(g, (p) => {
        p.x += jitter(p, r * 0.12, v * 10 + i);
        p.y += jitter(p, r * 0.1, v * 10 + i + 3);
        if (p.y < -r * 0.25) p.y = -r * 0.25 + (p.y + r * 0.25) * 0.15; // flat bottoms
      });
      parts.push(place(g, [(i - n / 2) * 13 + rng() * 5, rng() * 5, rng() * 10 - 5], [0, rng() * 6, 0], [1.2, 0.75, 1]));
    }
    const merged = paint(merge(parts), (c) => (c.y < -2 ? '#c9dcf0' : c.y < 3 ? '#eef5fc' : '#ffffff'));
    cloudGeos.push(merged);
  }
  {
    const clouds = [];
    for (let i = 0; i < 18; i++) {
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
  const haze = new THREE.Color('#b9e6fb');
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false });
  const tint = (hex, k) => new THREE.Color(hex).lerp(haze, k);
  const farParts = [];
  const islands = [
    { a: -2.2, d: 640, w: 80, h: 38, k: 0.45 },
    { a: -1.2, d: 700, w: 60, h: 26, k: 0.55 },
    { a: 0.3, d: 620, w: 70, h: 30, k: 0.5 },
    { a: 1.6, d: 680, w: 90, h: 22, k: 0.55 },
    { a: 2.6, d: 600, w: 50, h: 34, k: 0.45 },
  ];
  for (const [idx, isl] of islands.entries()) {
    let g = new THREE.CylinderGeometry(isl.w * 0.55, isl.w, isl.h, 9, 3);
    g = deform(g, (p) => {
      p.x += jitter(p, isl.w * 0.08, idx);
      p.z += jitter(p, isl.w * 0.08, idx + 1);
      if (p.y > isl.h * 0.3) p.y += jitter(p, 4, idx + 2);
    });
    g = paint(g, (c, n) => (n.y > 0.7 ? tint('#78b857', isl.k) : c.y < -isl.h * 0.35 ? tint('#e8c98a', isl.k) : tint('#9a8fa6', isl.k)));
    farParts.push(place(g, [Math.cos(isl.a) * isl.d, isl.h / 2 - 3, Math.sin(isl.a) * isl.d], [0, idx, 0]));
  }
  // Volcano to the north-west, like the reference backdrop.
  const vA = -2.0, vD = 720;
  const vx = Math.cos(vA) * vD, vz = Math.sin(vA) * vD;
  {
    let g = new THREE.CylinderGeometry(14, 120, 95, 12, 4, true);
    g = deform(g, (p) => {
      p.x += jitter(p, 6, 41);
      p.z += jitter(p, 6, 42);
    });
    g = paint(g, (c) => {
      const lava = c.y > 20 && Math.abs(Math.atan2(c.z, c.x) - 0.9) < 0.12 + (c.y - 20) * 0.001;
      if (lava) return tint('#ff6a2a', 0.2);
      return c.y > 30 ? tint('#6f6680', 0.4) : c.y > -20 ? tint('#8a7f95', 0.45) : tint('#6fae52', 0.5);
    });
    farParts.push(place(g, [vx, 44, vz]));
  }
  const far = new THREE.Mesh(merge(farParts), farMat);
  group.add(far);

  // Volcano smoke plume.
  const smokeGeo = new THREE.IcosahedronGeometry(1, 0);
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#b3aeb8', emissive: '#6d6874', emissiveIntensity: 0.4, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false, fog: false, roughness: 1 });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, 14);
  smoke.frustumCulled = false;
  group.add(smoke);
  const puffs = [];
  for (let i = 0; i < 14; i++) puffs.push({ t: i / 14, off: rng() * 10 });
  const dummy = new THREE.Object3D();

  return {
    group,
    update(dt, time, camPos) {
      dome.position.copy(camPos);
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
