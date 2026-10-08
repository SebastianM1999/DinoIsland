// Hand-held torch: a grooved wooden shaft, a pitch-soaked cloth head wrapped
// with rope, an animated additive flame (three layered shells + a soft halo)
// and a few rising sparks. Built from the model kit like the other tools.
//
// Local frame: the grip is the origin, +Y is up the shaft (handle from -0.30 to
// +0.30, head to about +0.50), the flame burns from `FLAME_Y`. The same model
// is used in the first-person viewmodel, on remote players' left hands and as
// the pickup on the ground.
//
//   const torch = makeTorch();
//   const level = torch.userData.update(time, dt, lit)   // call every frame; flame size/fade 0..1
//   torch.userData.head                                  // Object3D at the flame (light position)
//
// Everything that appears only during play (flame materials, halo texture,
// spark points) has a hidden copy in `Items` so `Renderer.prepare` compiles it.

import * as THREE from 'three';
import { MAT, deform, paint, place, part, merge, mesh, wrap, jitter } from './kit.js';
import { retainResource } from '../core/resources.js';

export const FLAME_Y = 0.47;
const SPARKS = 7;

// ------------------------------------------------------------ flicker

const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth 1D value noise in 0..1. */
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * Natural torch brightness, about 0.75..1.2: layered smooth noise at three
 * speeds plus slow gusts, never per-frame random jitter. `seed` decorrelates torches.
 */
export function torchFlicker(t, seed = 0) {
  const s = seed * 13.37;
  const fast = noise1(t * 17 + s) - 0.5, mid = noise1(t * 7.3 + s * 1.7 + 40) - 0.5, slow = noise1(t * 2.1 + s * 0.6 + 90) - 0.5;
  const gust = Math.pow(noise1(t * 0.55 + s + 200), 6);   // rare short dips
  return 1 + 0.12 * fast * 2 * 0.5 + 0.28 * mid + 0.2 * slow - 0.14 * gust;
}

// ------------------------------------------------------------ geometry

let handleCache, headCache, bodyCache, flameGeos, glowTexture, flameMats;
const keep = (r) => retainResource(r);

function handleGeometry() {
  return handleCache ??= keep((() => {
    let g = new THREE.CylinderGeometry(0.026, 0.032, 0.62, 12, 26);
    g = deform(g, (v) => {
      const r = Math.hypot(v.x, v.z) || 1;
      const a = Math.atan2(v.z, v.x);
      // twisting grooves along the grain, a few knots, a slightly bent shaft
      const groove = Math.sin(v.y * 44 + a * 2) * 0.0016 + Math.sin(a * 5 + v.y * 11) * 0.0011;
      const knot = Math.max(0, Math.sin(v.y * 31 + 1.3)) ** 24 * 0.0035 * (Math.sin(a * 3) > 0.4 ? 1 : 0.3);
      const k = (r + groove + knot) / r;
      v.x *= k; v.z *= k;
      v.x += Math.sin(v.y * 5) * 0.0025;
      v.x += jitter(v, 0.0008, 5); v.z += jitter(v, 0.0008, 6);
    });
    const tmp = new THREE.Color();
    return paint(g, (c) => {
      const a = Math.atan2(c.z, c.x);
      const t = 0.5 + 0.5 * Math.sin(a * 3 + c.y * 9);
      tmp.set('#6b4526').lerp(new THREE.Color('#9a6a3c'), t * 0.7 + (c.y > 0.1 ? 0.12 : 0));
      if (c.y > 0.14) tmp.multiplyScalar(0.55 + 0.45 * Math.max(0, 1 - (c.y - 0.14) / 0.12));   // soot under the head
      return tmp;
    });
  })());
}

function headGeometry() {
  return headCache ??= keep((() => {
    const tmp = new THREE.Color();
    // the wrapped, pitch-soaked rag: lumpy ellipsoid, charred and glowing on top
    let rag = new THREE.SphereGeometry(1, 16, 12);
    rag = deform(rag, (v) => {
      const a = Math.atan2(v.z, v.x);
      const lump = 1 + Math.sin(a * 4 + v.y * 5) * 0.07 + jitter(v, 0.06, 3);
      v.x *= 0.064 * lump; v.z *= 0.064 * lump;
      v.y = v.y * 0.1 + 0.4;
      if (v.y > 0.45) { const k = 1 - (v.y - 0.45) / 0.07 * 0.25; v.x *= k; v.z *= k; }
    });
    rag = paint(rag, (c) => {
      const a = Math.atan2(c.z, c.x);
      const cloth = Math.sin(a * 9 + c.y * 30) > 0.2 ? '#b99b66' : '#9a7e4f';
      tmp.set(cloth);
      const pitch = THREE.MathUtils.smoothstep(c.y, 0.37, 0.47);
      tmp.lerp(new THREE.Color('#1d130d'), pitch * 0.92);
      // glowing embers in the charred top
      const e = Math.sin(a * 7 + 1.1) * Math.sin(c.y * 90 + a * 3);
      if (c.y > 0.43 && e > 0.55) tmp.lerp(new THREE.Color('#e8561a'), 0.85);
      return tmp;
    });
    const rope = merge([
      place(wrap(0.0415, 0.05, 4, '#8b6b3e'), [0, 0.27, 0]),
      place(wrap(0.068, 0.07, 3, '#a58a56'), [0, 0.365, 0]),
    ]);
    const drips = [
      part(new THREE.SphereGeometry(0.018, 8, 6), '#1d130d', [0.052, 0.355, 0.012], [0, 0, 0], [1, 1.9, 1]),
      part(new THREE.SphereGeometry(0.015, 8, 6), '#1d130d', [-0.018, 0.345, 0.055], [0, 0, 0], [1, 2.2, 1]),
      part(new THREE.SphereGeometry(0.012, 8, 6), '#2a1b12', [-0.05, 0.37, -0.03], [0, 0, 0], [1, 1.7, 1]),
    ];
    return merge([rag, rope, ...drips]);
  })());
}

function bodyGeometry() {
  return bodyCache ??= keep(merge([handleGeometry(), headGeometry()]));
}

/** Teardrop flame shell: wide near the base, a soft point on top; height 1, base radius 1. */
function flameShell() {
  const profile = [[0, 0], [0.55, 0.05], [0.95, 0.2], [1, 0.38], [0.8, 0.62], [0.42, 0.84], [0.12, 0.96], [0, 1]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 12);
}

function sharedFlame() {
  if (flameMats) return;
  const add = (color, opacity) => retainResource(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flameMats = [add('#ff5a10', 0.5), add('#ffa326', 0.7), add('#fff0b0', 0.9)];
  const shell = keep(flameShell());
  flameGeos = shell;
}

function haloTexture() {
  if (glowTexture !== undefined) return glowTexture;
  if (typeof document === 'undefined') return (glowTexture = null);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return keep(glowTexture);
}

// ------------------------------------------------------------ the torch

/**
 * @param {{ flame?: boolean }} [opts] flame false: the bare unlit torch (no effects)
 * @returns {THREE.Group} with `userData`: `head`, `update(time, dt, lit)`, `level` (smoothed 0..1)
 */
export function makeTorch({ flame = true } = {}) {
  const root = new THREE.Group();
  const wood = mesh(bodyGeometry(), MAT.standard, { cast: false });
  root.add(wood);
  const head = new THREE.Object3D();
  head.position.set(0, FLAME_Y, 0);
  root.add(head);
  const state = { head, level: 0, update: () => 0, wood };
  root.userData = state;
  if (!flame) return root;

  sharedFlame();
  const fx = new THREE.Group();
  fx.position.set(0, FLAME_Y - 0.03, 0);
  head.parent.add(fx);
  const layers = flameMats.map((m, i) => {
    const s = [1, 0.74, 0.46][i];
    const shell = new THREE.Mesh(flameGeos, m);
    shell.scale.set(0.066 * s, 0.28 * s * (i === 2 ? 0.8 : 1), 0.066 * s);
    shell.position.y = i === 2 ? 0.0 : 0.005 * i;
    shell.renderOrder = 4 + i;
    shell.frustumCulled = false;
    fx.add(shell);
    return { shell, base: shell.scale.clone(), phase: i * 2.3 };
  });
  const tex = haloTexture();
  let halo = null;
  if (tex) {
    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: '#ff8a30', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.position.y = 0.1;
    halo.scale.setScalar(0.6);
    halo.renderOrder = 3;
    halo.frustumCulled = false;
    fx.add(halo);
  }

  // sparks / embers: local-space points that drift up, flare and fade
  const pos = new Float32Array(SPARKS * 3), col = new Float32Array(SPARKS * 3);
  const age = new Float32Array(SPARKS), life = new Float32Array(SPARKS), seed = new Float32Array(SPARKS);
  let counter = 0;
  const respawn = (i, stagger) => {
    counter++;
    seed[i] = hash(counter * 3.7 + i);
    life[i] = 0.7 + hash(counter * 1.3 + i * 9) * 0.9;
    age[i] = stagger ? life[i] * hash(i + 4.2) : 0;
  };
  for (let i = 0; i < SPARKS; i++) respawn(i, true);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.011, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 6;
  fx.add(sparks);

  let k = 0, time = 0;
  state.update = (t, dt, lit) => {
    time = t;
    k += ((lit ? 1 : 0) - k) * Math.min(1, dt * (lit ? 9 : 14));
    if (k < 0.004) k = 0;
    state.level = k;
    fx.visible = k > 0;
    if (k === 0) return 0;
    const f = torchFlicker(t);
    for (const l of layers) {
      const sway = Math.sin(t * 5.1 + l.phase) * 0.12 + (noise1(t * 6 + l.phase * 3) - 0.5) * 0.3;
      const grow = (0.82 + 0.5 * (f - 0.75)) * (0.9 + 0.12 * Math.sin(t * 11.7 + l.phase * 1.9));
      l.shell.scale.set(l.base.x * (1.05 - 0.1 * grow) * k, l.base.y * grow * k, l.base.z * (1.05 - 0.1 * grow) * k);
      l.shell.rotation.set(sway * 0.35, t * 0.9 + l.phase, -sway * 0.45);
    }
    if (halo) {
      halo.material.opacity = 0.65 * k * f;
      halo.scale.setScalar((0.55 + 0.18 * f) * (0.5 + 0.5 * k));
    }
    for (let i = 0; i < SPARKS; i++) {
      age[i] += dt;
      if (age[i] > life[i]) respawn(i, false);
      const a = age[i], u = a / life[i];
      const x = (seed[i] - 0.5) * 0.05 + Math.sin(a * 6 + seed[i] * 30) * 0.012 * u;
      const z = (hash(seed[i] * 91) - 0.5) * 0.05 + Math.cos(a * 5 + seed[i] * 17) * 0.012 * u;
      const y = 0.06 + a * (0.1 + seed[i] * 0.16);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const fade = (1 - u) * (1 - u) * Math.min(1, a * 8) * k;
      col[i * 3] = fade; col[i * 3 + 1] = fade * (0.45 + 0.3 * (1 - u)); col[i * 3 + 2] = fade * 0.12;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
    return k * f;
  };
  state.time = () => time;
  return root;
}
