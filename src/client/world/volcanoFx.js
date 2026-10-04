// The volcano's life (Ashfall Isle), client side of sim/volcano.js:
//
// - ash flakes drift down round the camera all the time – a few when it is
//   calm, a thick fall during the ash rain, when the fog draws in too
//   (onFog blends the biome's sky toward ashSky);
// - fumaroles steam; the vents the lava flows well out of are glowing
//   spatter cones; lava bombs still glow in some of the small craters;
// - an eruption throws lava up out of the crater; every lava bomb gets a red
//   warning circle where it will land, flies in glowing, bursts and leaves a
//   scorched, glowing mark that cools and fades.
//
// State comes from the server (setState on welcome, setPhase / bomb on its
// events). How many flakes and puffs follows the graphics tier.

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { MAT, paint, place, merge, mesh } from '../models/kit.js';

const TAU = Math.PI * 2;
// [ash flakes, fumarole puffs each, crater spray]
const TIER = { Low: [160, 3, 60], Medium: [320, 4, 110], High: [600, 6, 160], Ultra: [900, 7, 220] };
const ASH_BOX = 36;              // half size of the box of ash round the camera (m)
const FUMAROLE_RANGE = 170;      // fumaroles further away do not steam
const BOMB_FLIGHT = 1.7;         // the last seconds of a bomb's warning: it flies in from the crater
const MAX_BOMBS = 32;
const MAX_MARKS = 40;            // scorch marks left by bomb impacts
const MARK_LIFE = 90;            // seconds until a scorch mark has faded

/** The air in the ash rain: close, grey-brown, the sun a dull disc. */
export function ashSky(sky) {
  return { ...sky, fogNear: 6, fogFar: 72, fog: '#5c504c', background: '#4a3f3c', sunIntensity: (sky.sunIntensity ?? 1.6) * 0.55, exposure: (sky.exposure ?? 0.9) * 0.92 };
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

/** A vent's spatter cone (local, ground at y = 0): a ring of dark slag round a glowing mouth. */
function ventGeometry() {
  const cone = new THREE.CylinderGeometry(1.5, 3.4, 1.6, 14, 2, true).translate(0, 0.6, 0);
  const slag = paint(cone, (c) => (c.y > 1.2 ? '#4a2a22' : '#2a2224'));
  const lip = paint(new THREE.TorusGeometry(1.5, 0.35, 5, 14).rotateX(Math.PI / 2).translate(0, 1.4, 0), '#3a2a28');
  return merge([slag, lip]);
}

/** A scorched blast mark (flat disc, local XZ): dark, a glowing ring of embers that cools. */
function markMaterial() {
  return new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHeat: { value: 1 }, uAlpha: { value: 1 } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uHeat, uAlpha;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float n = hash(floor(p * 9.0));
        float edge = 1.0 - smoothstep(0.55 + n * 0.3, 1.0, r);
        vec3 col = mix(vec3(0.05, 0.04, 0.04), vec3(0.14, 0.11, 0.1), smoothstep(0.0, 0.9, r));
        float embers = step(0.72, n) * (1.0 - smoothstep(0.2, 0.8, r));
        col = mix(col, vec3(1.0, 0.35, 0.06) * 1.6, embers * uHeat);
        gl_FragColor = vec4(col, edge * 0.85 * uAlpha);
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
export function buildVolcanoFx(terrain, layout, camera, { onFog = null, onImpact = null } = {}) {
  const group = new THREE.Group();
  group.name = 'volcano-fx';
  const none = { group, update() {}, setQuality() {}, setState() {}, setPhase() {}, bomb() {} };
  if (!layout.plan.volcano || typeof document === 'undefined') return none;
  const plan = layout.plan;
  const rng = makeRng(plan.seed ^ 0xa5f);
  const tex = softTexture();
  const v = plan.volcano;
  const crater = { x: v.x, y: v.rimY + 6, z: v.z };

  let [nAsh, nPuff, nSpray] = TIER.High;
  let phase = 'calm', phaseLeft = 0, fogK = -1;

  // ------------------------------------------------------------- ash flakes
  const maxAsh = TIER.Ultra[0];
  const ashPos = new Float32Array(maxAsh * 3);
  const ashSeed = Array.from({ length: maxAsh }, () => ({ x: (rng() * 2 - 1) * ASH_BOX, y: rng() * 30, z: (rng() * 2 - 1) * ASH_BOX, sp: 0.6 + rng() * 0.8, ph: rng() * TAU }));
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ashMat = new THREE.PointsMaterial({ size: 0.16, map: tex, color: '#b8aea8', transparent: true, opacity: 0.85, depthWrite: false, fog: true });
  const ash = new THREE.Points(ashGeo, ashMat);
  ash.frustumCulled = false;
  ash.renderOrder = 5;
  group.add(ash);

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

  // ----------------------------------------------- vents and glowing craters
  // spatter cones where the lava flows well out of the flanks; a lava bomb
  // still glowing in some of the small craters
  {
    const cones = [], glow = [];
    for (const f of plan.flows || []) {
      if (f.ring || !f.vent) continue;
      const y = terrain.heightAt(f.vent.x, f.vent.z);
      cones.push(place(ventGeometry(), [f.vent.x, y - 0.3, f.vent.z], [0, f.vent.x * 0.7, 0]));
      glow.push(place(paint(new THREE.CircleGeometry(1.45, 14).rotateX(-Math.PI / 2), '#ff8a2a'), [f.vent.x, y + 0.85, f.vent.z]));
    }
    for (const c of layout.craters || []) {
      if (!c.ember) continue;
      const r = 0.45 + c.r * 0.12;
      const rock = paint(new THREE.IcosahedronGeometry(r, 1), (p) => (Math.sin(p.x * 9 + p.z * 7) > 0.55 ? '#ff6a1c' : '#2a2022'));
      glow.push(place(rock, [c.x, c.y - c.depth + r * 0.5, c.z], [c.id, c.id * 2, 0]));
    }
    if (cones.length) group.add(mesh(merge(cones), MAT.standard));
    if (glow.length) {
      const g = mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), { cast: false });
      g.name = 'volcano-embers';
      group.add(g);
    }
  }

  // --------------------------------------------------- bomb scorch marks
  const markGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const marks = Array.from({ length: MAX_MARKS }, () => {
    const m = new THREE.Mesh(markGeo, markMaterial());
    m.visible = false;
    m.renderOrder = 3;
    group.add(m);
    return { m, age: 0 };
  });
  let nextMark = 0;
  const scorch = (x, y, z, r) => {
    const k = marks[nextMark];
    nextMark = (nextMark + 1) % MAX_MARKS;
    k.age = 0;
    k.m.visible = true;
    k.m.position.set(x, y + 0.08, z);
    k.m.scale.setScalar(r * 0.95);
    k.m.rotation.y = Math.random() * TAU;
  };

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
  let clock = 0;

  const setPhase = (p, left = 0) => { phase = p; phaseLeft = left; };

  return {
    group,
    setQuality(g = {}) {
      [nAsh, nPuff, nSpray] = TIER[g.name] || TIER.High;
      ashGeo.setDrawRange(0, nAsh);
      sprayGeo.setDrawRange(0, nSpray);
      for (const f of fumaroles) f.puffs.forEach((m, i) => { if (i >= nPuff) m.visible = false; });
    },
    /** The server's volcano state (welcome): its phase. */
    setState(s) {
      if (s) setPhase(s.phase, s.left);
    },
    setPhase,
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
      // --- ash flakes: a box of them that wraps round the camera
      const shown = Math.round(nAsh * (0.25 + 0.75 * Math.max(fogK, phase === 'erupt' ? 0.5 : 0)));
      ashGeo.setDrawRange(0, shown);
      ashMat.opacity = 0.55 + 0.35 * fogK;
      for (let i = 0; i < shown; i++) {
        const s = ashSeed[i];
        s.y -= dt * s.sp * 1.1;
        if (s.y < -6) s.y += 36;
        const wrap = (u, c0) => ((((u - c0) % (2 * ASH_BOX)) + 3 * ASH_BOX) % (2 * ASH_BOX)) - ASH_BOX + c0;
        const x = wrap(s.x + Math.sin(time * 0.4 + s.ph) * 1.5 + time * 0.8, cx);
        const z = wrap(s.z + Math.cos(time * 0.3 + s.ph) * 1.5 + time * 0.5, cz);
        ashPos[i * 3] = x; ashPos[i * 3 + 1] = cy - 6 + s.y; ashPos[i * 3 + 2] = z;
      }
      ashGeo.attributes.position.needsUpdate = true;
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
      // --- scorch marks cool and fade
      for (const k of marks) {
        if (!k.m.visible) continue;
        k.age += dt;
        const u = k.m.material.uniforms;
        u.uHeat.value = Math.max(0, 1 - k.age / 12) * (0.75 + 0.25 * Math.sin(time * 6 + k.m.position.x));
        u.uAlpha.value = 1 - Math.max(0, (k.age - MARK_LIFE * 0.7) / (MARK_LIFE * 0.3));
        if (k.age > MARK_LIFE) k.m.visible = false;
      }
      // --- the eruption: lava thrown up out of the crater, the crater glows
      const erupting = phase === 'erupt';
      craterLight.intensity += ((erupting ? 900 : phase === 'rumble' ? 120 : 0) - craterLight.intensity) * Math.min(1, dt * 2);
      craterLight.visible = craterLight.intensity > 1;
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
            scorch(b.x, b.y, b.z, b.r);
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
