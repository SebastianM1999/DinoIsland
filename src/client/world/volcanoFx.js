// The volcano's life (Ashfall Isle), client side of sim/volcano.js:
//
// - ash flakes drift down round the camera all the time – a few when it is
//   calm, a thick, wind-blown fall during the ash rain (after an eruption or
//   on the wind), with grey curtains of falling ash further off; the fog draws
//   in (onFog blends the biome's sky toward ashSky) and fresh ash settles on
//   everything facing up (SURFACE.uSdAsh, world/surfaceDetail.js), fading
//   again once the rain has passed;
// - fumaroles steam;
// - lava geysers: a glowing mouth in the path that bubbles (warning), then
//   a spout of lava shoots up (geyser; onGeyser for the sound and the shake);
// - an eruption throws lava up out of the crater; every lava bomb gets a red
//   warning circle where it will land, flies in glowing and bursts.
//
// State comes from the server (setState on welcome, setPhase / bomb on
// its events). How many flakes and puffs follows the graphics tier.

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { SURFACE } from './surfaceDetail.js';
import { CONFIG } from '../../shared/config.js';

const TAU = Math.PI * 2;
// [ash flakes, fumarole puffs each, crater spray, ash curtains]
const TIER = { Low: [320, 3, 60, 0], Medium: [700, 4, 110, 36], High: [1300, 6, 160, 64], Ultra: [2000, 7, 220, 96] };
const ASH_BOX = 45;              // half size of the box of ash round the camera (m)
const ASH_CALM = 0.15;           // share of the flakes still falling when there is no ash rain
const CURTAIN_BOX = 70;          // half size of the box of ash curtains round the camera (m)
const ASH_COVER = 0.7;           // how thick fresh ash lies at most; it settles in ~40 s, fades in ~60 s
const FUMAROLE_RANGE = 170;      // fumaroles further away do not steam
const BOMB_FLIGHT = 1.7;         // the last seconds of a bomb's warning: it flies in from the crater
const MAX_BOMBS = 24;

/** The air in the ash rain: close, grey-brown, the sun a dull disc. */
export function ashSky(sky) {
  return { ...sky, fogNear: 15, fogFar: 110, fog: '#5c504c', background: '#4a3f3c', sunIntensity: (sky.sunIntensity ?? 1.6) * 0.55, exposure: (sky.exposure ?? 0.9) * 0.92 };
}

/** A soft round sprite (radial falloff). */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Falling ash: thin vertical streaks, soft at the top and bottom (for the curtains). */
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const rng = makeRng(0x5a5);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + rng() * 0.22})`;
    g.fillRect(rng() * 64, rng() * 256, 1 + rng() * 1.5, 10 + rng() * 60);
  }
  // soft at the sides (the top and bottom fade in the vertex colours)
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.3, 'rgba(0,0,0,1)'); h.addColorStop(0.7, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Ash flakes, moved on the GPU: each one falls (and drifts on the wind) through
 * a box that wraps round the camera, turning as it goes – edge-on it is a thin sliver.
 */
function flakeMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() },
      uBox: { value: ASH_BOX }, uSize: { value: 0.32 }, uViewH: { value: 800 },
      uColor: { value: new THREE.Color('#8f8681') }, uOpacity: { value: 0.8 },
    }]),
    vertexShader: /* glsl */`
      attribute vec4 aSeed;        // x, y, z in 0..1 (place in the box), w: fall speed
      uniform float uTime, uBox, uSize, uViewH;
      uniform vec3 uCam;
      uniform vec2 uWind;
      varying float vRot, vShape, vFade;
      #include <fog_pars_vertex>
      float wrapTo(float v, float c, float h) { return c + mod(v - c + h, 2.0 * h) - h; }
      void main() {
        float t = uTime * aSeed.w;
        float ph = aSeed.x * 61.0 + aSeed.z * 17.0;
        float hy = uBox * 0.6;
        vec3 p = vec3(aSeed.x * 2.0 * uBox + uWind.x * t + sin(t * 0.9 + ph) * 1.2,
                      aSeed.y * 2.0 * hy - t * 1.4,
                      aSeed.z * 2.0 * uBox + uWind.y * t + cos(t * 0.7 + ph) * 1.2);
        p = vec3(wrapTo(p.x, uCam.x, uBox), wrapTo(p.y, uCam.y, hy), wrapTo(p.z, uCam.z, uBox));
        vec3 rel = abs(p - uCam) / vec3(uBox, hy, uBox);
        vFade = 1.0 - smoothstep(0.7, 1.0, max(max(rel.x, rel.y), rel.z));
        vShape = fract(ph * 0.37);
        vRot = ph + uTime * (1.2 + vShape * 2.4);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(uSize * (0.75 + 0.6 * vShape) * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mvPosition.z), 1.0, 48.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vRot, vShape, vFade;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float c = cos(vRot), s = sin(vRot);
        q = mat2(c, -s, s, c) * q;
        q.x *= 1.0 + 2.2 * abs(sin(vRot * 0.6));   // turning: thin when edge-on
        float a = (1.0 - smoothstep(0.25, 0.5, length(q))) * uOpacity * vFade;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor * (0.8 + 0.35 * vShape), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @param {object} layout
 * @param {THREE.Camera} camera
 * @param {{ onFog?: (k:number) => void, onImpact?: (x:number, y:number, z:number) => void }} [hooks]
 */
export function buildVolcanoFx(terrain, layout, camera, { onFog = null, onImpact = null, onGeyser = null } = {}) {
  const group = new THREE.Group();
  group.name = 'volcano-fx';
  const none = { group, update() {}, setQuality() {}, setState() {}, setPhase() {}, bomb() {}, geyser() {}, ashRaining: () => false };
  if (!layout.plan.volcano || typeof document === 'undefined') return none;
  const plan = layout.plan;
  const rng = makeRng(plan.seed ^ 0xa5f);
  const tex = softTexture();
  const v = plan.volcano;
  const crater = { x: v.x, y: v.rimY + 6, z: v.z };

  let [nAsh, nPuff, nSpray, nCurtain] = TIER.High;
  let phase = 'calm', phaseLeft = 0, fogK = -1;
  const wind = new THREE.Vector2(0.8, 0.5);         // m/s; each ash rain brings its own
  SURFACE.uSdAsh.value = 0;

  // ------------------------------------------------------------- ash flakes
  const maxAsh = TIER.Ultra[0];
  const ashSeed = new Float32Array(maxAsh * 4);
  for (let i = 0; i < maxAsh; i++) ashSeed.set([rng(), rng(), rng(), 0.6 + rng() * 0.8], i * 4);
  const ashGeo = new THREE.BufferGeometry();
  // (the shader places each flake from aSeed; position only sizes the draw)
  ashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxAsh * 3), 3));
  ashGeo.setAttribute('aSeed', new THREE.BufferAttribute(ashSeed, 4));
  const ashMat = flakeMaterial();
  const ash = new THREE.Points(ashGeo, ashMat);
  ash.frustumCulled = false;
  ash.renderOrder = 5;
  const viewSize = new THREE.Vector2();
  ash.onBeforeRender = (renderer) => { ashMat.uniforms.uViewH.value = renderer.getDrawingBufferSize(viewSize).y; };
  group.add(ash);

  // ------------------------------------- ash curtains (further off, rain only)
  const maxCurtain = TIER.Ultra[3];
  const curtains = Array.from({ length: maxCurtain }, () => ({ x: rng() * 2 * CURTAIN_BOX, z: rng() * 2 * CURTAIN_BOX, w: 10 + rng() * 14, h: 22 + rng() * 12, sp: 0.7 + rng() * 0.6 }));
  // each curtain: three rows of two vertices – dense near the ground, fading out up in the sky
  const curtainPos = new Float32Array(maxCurtain * 6 * 3);
  const curtainCol = new Float32Array(maxCurtain * 6 * 4);
  const curtainUv = new Float32Array(maxCurtain * 6 * 2);
  const curtainIdx = [];
  for (let i = 0; i < maxCurtain; i++) {
    const o = i * 6;
    curtainIdx.push(o, o + 1, o + 3, o, o + 3, o + 2, o + 2, o + 3, o + 5, o + 2, o + 5, o + 4);
  }
  const curtainGeo = new THREE.BufferGeometry();
  curtainGeo.setAttribute('position', new THREE.BufferAttribute(curtainPos, 3));
  curtainGeo.setAttribute('color', new THREE.BufferAttribute(curtainCol, 4));
  curtainGeo.setAttribute('uv', new THREE.BufferAttribute(curtainUv, 2));
  curtainGeo.setIndex(curtainIdx);
  const curtainMat = new THREE.MeshBasicMaterial({ map: streakTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide });
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  curtain.frustumCulled = false;
  curtain.renderOrder = 4;
  curtain.visible = false;
  group.add(curtain);
  const curtainColor = new THREE.Color('#8e8580');
  const wrapTo = (u, c, h) => c + ((((u - c + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
  /** Lay the curtains out round the camera, each turned to face it (k: how thick the rain is). */
  const updateCurtains = (cx, cy, cz, time, k) => {
    const n = k > 0.01 ? nCurtain : 0;
    curtain.visible = n > 0;
    curtainGeo.setDrawRange(0, n * 12);
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const c = curtains[i];
      const x = wrapTo(c.x + wind.x * time * 0.8, cx, CURTAIN_BOX), z = wrapTo(c.z + wind.y * time * 0.8, cz, CURTAIN_BOX);
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
      // none right on top of the camera, thin at the edge of the box
      const a = k * 0.22 * Math.min(1, Math.max(0, (d - 14) / 10)) * Math.min(1, Math.max(0, (CURTAIN_BOX - Math.max(Math.abs(dx), Math.abs(dz))) / 14));
      const rx = -dz / d * c.w / 2, rz = dx / d * c.w / 2;
      const y0 = Math.max(0, terrain.heightAt(x, z)) - 1, ym = y0 + c.h * 0.35, y1 = y0 + c.h;
      curtainPos.set([x - rx, y0, z - rz, x + rx, y0, z + rz, x - rx, ym, z - rz, x + rx, ym, z + rz, x - rx, y1, z - rz, x + rx, y1, z + rz], i * 18);
      const v = i * 0.37 - time * 0.18 * c.sp;
      curtainUv.set([0, v, 1, v, 0, v + 0.35, 1, v + 0.35, 0, v + 1, 1, v + 1], i * 12);
      const r = curtainColor.r, g = curtainColor.g, b = curtainColor.b;
      curtainCol.set([r, g, b, a * 0.8, r, g, b, a * 0.8, r, g, b, a, r, g, b, a, r, g, b, 0, r, g, b, 0], i * 24);
    }
    curtainGeo.attributes.position.needsUpdate = true;
    curtainGeo.attributes.uv.needsUpdate = true;
    curtainGeo.attributes.color.needsUpdate = true;
  };

  // ---------------------------------------------------------- fumarole smoke
  const puffMat = new THREE.MeshBasicMaterial({ map: tex, color: '#d8d2cc', transparent: true, opacity: 0.32, depthWrite: false, fog: true });
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const fumaroles = (layout.fumaroles || []).map((f) => ({
    ...f,
    puffs: Array.from({ length: TIER.Ultra[1] }, (_, i) => {
      const m = new THREE.Mesh(puffGeo, puffMat);
      m.visible = false;
      m.renderOrder = 4;
      m.userData = { t: i / TIER.Ultra[1], life: 5 + rng() * 3, ox: rng() * 2 - 1, oz: rng() * 2 - 1 };
      group.add(m);
      return m;
    }),
  }));

  // ------------------------------------------------------ eruption: crater spray
  const maxSpray = TIER.Ultra[2];
  const sprayPos = new Float32Array(maxSpray * 3), sprayCol = new Float32Array(maxSpray * 3);
  const spraySeed = Array.from({ length: maxSpray }, () => ({ x: 0, y: -1e4, z: 0, vx: 0, vy: 0, vz: 0, age: 99, life: 1 }));
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setAttribute('color', new THREE.BufferAttribute(sprayCol, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ size: 1.6, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  spray.frustumCulled = false;
  group.add(spray);
  const craterLight = new THREE.PointLight(0xff5a1c, 0, 160, 1.6);
  craterLight.position.set(crater.x, crater.y + 4, crater.z);
  group.add(craterLight);

  // ------------------------------------------------------------------ bombs
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const rockGeo = new THREE.IcosahedronGeometry(0.75, 1);
  const flashGeo = new THREE.SphereGeometry(1, 16, 10);
  const bombs = Array.from({ length: MAX_BOMBS }, () => {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff2a12', transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#ff3a14', transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
    const rock = new THREE.Mesh(rockGeo, new THREE.MeshBasicMaterial({ color: '#ffb04a', fog: true }));
    const glow = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ff6a1c', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ffb060', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const smoke = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#3a3230', transparent: true, opacity: 0, depthWrite: false, fog: true }));
    for (const m of [ring, disc, rock, glow, flash, smoke]) { m.visible = false; m.renderOrder = 6; group.add(m); }
    return { ring, disc, rock, glow, flash, smoke, active: false, t: 0, at: 0, x: 0, y: 0, z: 0, r: 4, from: new THREE.Vector3(), landed: false };
  });
  // ---------------------------------------------------------------- geysers
  const GY = CONFIG.volcano.geyser;
  const spoutGeo = new THREE.CylinderGeometry(0.55, 1, 1, 18, 4, true).translate(0, 0.5, 0);
  const geysers = (layout.geysers || []).map((g) => {
    const vent = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff5a1c', transparent: true, opacity: 0.35, depthWrite: false, fog: true }));
    const mouth = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#2a1410', transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
    // (a red-orange sheath of lava round a white-hot core, a splash on top)
    const jet = new THREE.Mesh(spoutGeo, new THREE.MeshBasicMaterial({ color: '#d8361a', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    const core = new THREE.Mesh(spoutGeo, new THREE.MeshBasicMaterial({ color: '#ffc24a', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const cap = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ff7a24', transparent: true, opacity: 0.9, depthWrite: false, fog: true }));
    vent.position.set(g.x, g.y + 0.08, g.z);
    vent.scale.setScalar(g.r);
    mouth.position.set(g.x, g.y + 0.06, g.z);
    mouth.scale.setScalar(g.r * 0.85);
    for (const m of [jet, core, cap]) { m.visible = false; m.position.set(g.x, g.y, g.z); }
    for (const m of [vent, mouth, jet, core, cap]) { m.renderOrder = 6; group.add(m); }
    return { ...g, vent, mouth, jet, core, cap, t: -1, eta: 0, blown: false };
  });

  let clock = 0;

  const setPhase = (p, left = 0) => {
    // each ash rain blows in on a wind of its own
    if (p === 'ash' && phase !== 'ash') { const a = rng() * TAU, sp = 1.6 + rng() * 1.6; wind.set(Math.cos(a) * sp, Math.sin(a) * sp); }
    phase = p; phaseLeft = left;
  };

  return {
    group,
    setQuality(g = {}) {
      [nAsh, nPuff, nSpray, nCurtain] = TIER[g.name] || TIER.High;
      ashGeo.setDrawRange(0, nAsh);
      sprayGeo.setDrawRange(0, nSpray);
      for (const f of fumaroles) f.puffs.forEach((m, i) => { if (i >= nPuff) m.visible = false; });
    },
    /** The server's volcano state (welcome): its phase. */
    setState(s) {
      if (!s) return;
      setPhase(s.phase, s.left);
    },
    setPhase,
    /** Is it raining ash (sim/volcano.js phase 'ash')? */
    ashRaining: () => phase === 'ash',
    /** Lava geyser m.id spouts in m.eta seconds (it bubbles till then). */
    geyser(m) {
      const g = geysers[m.id];
      if (g) Object.assign(g, { t: 0, eta: m.eta, blown: false });
    },
    /** A lava bomb lands at (x, z) in m.eta seconds. */
    bomb(m) {
      const b = bombs.find((q) => !q.active) || bombs.reduce((a, q) => (q.at < a.at ? q : a));
      Object.assign(b, { active: true, landed: false, t: 0, at: m.eta, x: m.x, y: m.y, z: m.z, r: m.r || 4 });
      // launched from somewhere on the crater's rim
      const a = rng() * TAU;
      b.from.set(crater.x + Math.cos(a) * v.craterR * 0.6, crater.y, crater.z + Math.sin(a) * v.craterR * 0.6);
      b.ring.visible = b.disc.visible = true;
      b.ring.position.set(m.x, m.y + 0.15, m.z);
      b.disc.position.copy(b.ring.position);
      b.ring.scale.setScalar(b.r);
      b.disc.scale.setScalar(b.r);
    },
    update(dt, time) {
      clock += dt;
      phaseLeft = Math.max(0, phaseLeft - dt);
      const cam = camera;
      if (!cam) return;
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      // --- the air: thick in the ash rain (eased in and out)
      const want = phase === 'ash' ? 1 : phase === 'erupt' ? 0.35 : 0;
      const k = fogK < 0 ? want : fogK + (want - fogK) * Math.min(1, dt * 0.35);
      if (onFog && Math.abs(k - fogK) > 0.002) { fogK = k; onFog(k); } else if (!onFog) fogK = k;
      // --- ash flakes: a box of them that wraps round the camera (moved in the shader)
      const rainK = Math.max(fogK, phase === 'erupt' ? 0.5 : 0);
      ashGeo.setDrawRange(0, Math.round(nAsh * (ASH_CALM + (1 - ASH_CALM) * rainK)));
      const u = ashMat.uniforms;
      u.uTime.value = time;
      u.uCam.value.set(cx, cy, cz);
      u.uWind.value.copy(wind).multiplyScalar(0.3 + 0.7 * rainK);
      u.uOpacity.value = 0.6 + 0.3 * rainK;
      updateCurtains(cx, cy, cz, time, phase === 'ash' ? fogK : 0);
      // --- fresh ash settles while it rains, and blows away after
      const cover = SURFACE.uSdAsh.value, settle = phase === 'ash' ? ASH_COVER : 0;
      SURFACE.uSdAsh.value = settle > cover ? Math.min(settle, cover + dt * ASH_COVER / 40) : Math.max(settle, cover - dt * ASH_COVER / 60);
      // --- fumaroles near the camera steam
      for (const f of fumaroles) {
        const near = Math.hypot(f.x - cx, f.z - cz) < FUMAROLE_RANGE;
        for (let i = 0; i < f.puffs.length; i++) {
          const m = f.puffs[i], u = m.userData;
          m.visible = near && i < nPuff;
          if (!m.visible) continue;
          u.t += dt / u.life;
          if (u.t > 1) { u.t -= 1; u.ox = rng() * 2 - 1; u.oz = rng() * 2 - 1; }
          const s = 1.2 + u.t * 5;
          m.position.set(f.x + u.ox * (0.4 + u.t * 2) + u.t * 2, f.y + 0.6 + u.t * 9, f.z + u.oz * (0.4 + u.t * 2));
          m.scale.set(s, s, 1);
          m.quaternion.copy(cam.quaternion);
        }
      }
      puffMat.opacity = 0.3;
      // --- the eruption: lava thrown up out of the crater, the crater glows
      const erupting = phase === 'erupt';
      craterLight.intensity += ((erupting ? 900 : phase === 'rumble' ? 120 : 0) - craterLight.intensity) * Math.min(1, dt * 2);
      // never toggle `visible`: a light joining or leaving the scene changes the light count and
      // recompiles every lit program (a multi-second freeze). A dark light costs next to nothing.
      for (let i = 0; i < nSpray; i++) {
        const s = spraySeed[i];
        s.age += dt;
        if (s.age > s.life) {
          if (!erupting || rng() > 0.35) { sprayPos[i * 3 + 1] = -1e4; continue; }
          const a = rng() * TAU, r = rng() * v.craterR * 0.5;
          Object.assign(s, { x: crater.x + Math.cos(a) * r, y: crater.y - 4, z: crater.z + Math.sin(a) * r, vx: Math.cos(a) * (3 + rng() * 9), vz: Math.sin(a) * (3 + rng() * 9), vy: 18 + rng() * 22, age: 0, life: 2.5 + rng() * 2 });
        }
        s.vy -= 14 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        const t = s.age / s.life;
        sprayPos[i * 3] = s.x; sprayPos[i * 3 + 1] = s.y; sprayPos[i * 3 + 2] = s.z;
        sprayCol[i * 3] = 1; sprayCol[i * 3 + 1] = 0.75 - t * 0.5; sprayCol[i * 3 + 2] = 0.3 - t * 0.25;
      }
      sprayGeo.attributes.position.needsUpdate = true;
      sprayGeo.attributes.color.needsUpdate = true;
      // --- geysers: a glowing mouth; it bubbles, then spouts
      for (const g of geysers) {
        if (g.t < 0) { g.vent.material.opacity = 0.28 + 0.08 * Math.sin(time * 1.3 + g.id); continue; }
        g.t += dt;
        if (g.t < g.eta) {
          const k = g.t / g.eta;
          g.vent.material.opacity = 0.45 + 0.5 * k * (0.5 + 0.5 * Math.sin(g.t * (10 + 14 * k)));
          g.vent.scale.setScalar(g.r * (1 + 0.12 * Math.sin(g.t * 18)));
          continue;
        }
        const s = g.t - g.eta;
        if (!g.blown) { g.blown = true; onGeyser?.(g.x, g.y, g.z); }
        if (s > GY.spout) { g.t = -1; g.jet.visible = g.core.visible = g.cap.visible = false; g.vent.scale.setScalar(g.r); continue; }
        const k = Math.min(1, s / 0.2) * Math.min(1, (GY.spout - s) / 0.4);
        const h = GY.height * k, w = 1 + 0.08 * Math.sin(time * 25 + g.id);
        g.jet.visible = g.core.visible = g.cap.visible = h > 0.05;
        g.jet.scale.set(g.r * 0.85 * w, h, g.r * 0.85 * w);
        g.core.scale.set(g.r * 0.5 / w, h * 0.92, g.r * 0.5 / w);
        g.cap.position.y = g.y + h;
        g.cap.scale.setScalar(g.r * (0.9 + 0.3 * Math.sin(time * 18)));
        g.vent.material.opacity = 0.95;
      }
      // --- bombs: warning circle, flight from the crater, burst
      for (const b of bombs) {
        if (!b.active) continue;
        b.t += dt;
        const left = b.at - b.t;
        if (!b.landed) {
          const pulse = 0.5 + 0.5 * Math.sin(b.t * (8 + 10 * Math.max(0, 1 - left / b.at)));
          b.ring.material.opacity = 0.55 + 0.4 * pulse;
          b.disc.material.opacity = 0.12 + 0.2 * Math.max(0, 1 - left / b.at);
          const fly = left < BOMB_FLIGHT;
          b.rock.visible = b.glow.visible = fly;
          if (fly) {
            const u = 1 - left / BOMB_FLIGHT;
            const x = b.from.x + (b.x - b.from.x) * u, z = b.from.z + (b.z - b.from.z) * u;
            const y = b.from.y + (b.y - b.from.y) * u + Math.sin(u * Math.PI) * 30;
            b.rock.position.set(x, y, z);
            b.rock.rotation.set(time * 3, time * 2, 0);
            b.glow.position.set(x, y, z);
            b.glow.scale.setScalar(2.2 + Math.sin(time * 30) * 0.3);
          }
          if (left <= 0) {
            b.landed = true;
            b.t = 0;
            b.ring.visible = b.disc.visible = b.rock.visible = b.glow.visible = false;
            b.flash.visible = b.smoke.visible = true;
            b.flash.position.set(b.x, b.y + 0.5, b.z);
            b.smoke.position.set(b.x, b.y + 1, b.z);
            onImpact?.(b.x, b.y, b.z);
          }
        } else {
          const t = b.t;
          b.flash.scale.setScalar(b.r * (0.4 + Math.min(1, t / 0.25) * 1.2));
          b.flash.material.opacity = Math.max(0, 0.9 - t * 2.2);
          b.smoke.scale.setScalar(b.r * (0.6 + t * 0.7));
          b.smoke.position.y = b.y + 1 + t * 2.2;
          b.smoke.material.opacity = Math.max(0, 0.55 - t * 0.18);
          if (t > 3) { b.active = false; b.flash.visible = b.smoke.visible = false; }
        }
      }
    },
  };
}
