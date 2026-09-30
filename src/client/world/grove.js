// The Primeval Grove's look (first island): a ring of old standing stones with
// glowing runes, a faint shimmering barrier between them, glowing mushrooms
// and blossoms on the floor, drifting light motes and a low mist. The grove's
// data (stones, flora, giant plants) comes from the shared layout; the ground
// tint is painted in terrainMesh.js. See shared/grove.js for the rules.

import * as THREE from 'three';
import { MAT, deform, paint, place, merge, jitter } from '../models/kit.js';
import { instanced, finishInstanced } from './veg/shapes.js';

const TAU = Math.PI * 2;
const STONE = ['#6f6a7e', '#5f5a6e', '#78728a'];
const RUNE = new THREE.Color('#7ff2ff');

/** One weathered standing stone (local: base at y=0, height 1, width 1). */
function stoneGeometry(seed) {
  let g = new THREE.BoxGeometry(1, 1, 0.6, 2, 4, 2);
  g.translate(0, 0.5, 0);
  g = deform(g, (v) => {
    const k = v.y;                                  // taper toward a rounded top
    v.x *= 1 - k * 0.3;
    v.z *= 1 - k * 0.25;
    if (k > 0.85) v.y -= Math.abs(v.x) * 0.25;
    v.x += jitter(v, 0.06, seed);
    v.z += jitter(v, 0.05, seed + 1);
  });
  return paint(g, (c, n) => (n.y > 0.6 ? '#5f8a4a' : STONE[Math.abs(Math.floor(jitter(c, 9, seed + 2))) % STONE.length]));
}

/** Rune strips carved into the stone's front face (drawn glowing). */
function runeGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const w = i % 2 ? 0.16 : 0.34;
    parts.push(place(new THREE.PlaneGeometry(w, 0.05), [((i * 37) % 5 - 2) * 0.04, 0.3 + i * 0.13, 0.305]));
  }
  parts.push(place(new THREE.PlaneGeometry(0.05, 0.42), [0, 0.5, 0.305]));
  return merge(parts);
}

/** Glowing mushroom: pale stem, luminous cap. */
function shroomGeometry() {
  const stem = paint(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6).translate(0, 0.175, 0), '#e8e4f4');
  const cap = paint(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.33, 0), '#ffffff');
  return merge([stem, cap]);
}

/** Glowing blossom: a little cluster of bulbs on a stalk. */
function bloomGeometry() {
  const parts = [paint(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5).translate(0, 0.25, 0), '#6fd08a')];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    parts.push(paint(new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(a) * 0.08, 0.52 + (k % 2) * 0.05, Math.sin(a) * 0.08), '#ffffff'));
  }
  return merge(parts);
}

/** A soft round sprite for motes and mist (radial falloff). */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The barrier: an open cylinder that shimmers faintly and flares where it is struck. */
function barrierMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHit: { value: new THREE.Vector3(0, -999, 0) },   // world point of the last strike
      uHitT: { value: 99 },                              // seconds since
      uFlash: { value: 0 },                              // whole-barrier flash (player bumped into it)
      uColor: { value: new THREE.Color('#78e8ff') },
    },
    vertexShader: `
      varying vec3 vWorld; varying float vH; varying float vA;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vH = uv.y; vA = uv.x;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime, uHitT, uFlash; uniform vec3 uHit, uColor;
      varying vec3 vWorld; varying float vH; varying float vA;
      void main() {
        float fade = (1.0 - smoothstep(0.0, 1.0, vH)) * smoothstep(0.0, 0.04, vH);
        float streaks = 0.5 + 0.5 * sin(vA * 480.0 + uTime * 0.7 + sin(vH * 9.0 + uTime) * 2.0);
        float wave = 0.5 + 0.5 * sin(vH * 30.0 - uTime * 2.2);
        float a = fade * (0.05 + 0.07 * streaks * wave);
        // ripple ring spreading from the last strike
        float d = distance(vWorld, uHit);
        float ring = exp(-pow((d - uHitT * 7.0) * 1.4, 2.0)) * exp(-uHitT * 2.2);
        a += ring * 0.9 + uFlash * fade * 0.35;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

export function buildGrove(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'primeval-grove';
  const g = layout.grove;
  if (!g) return { group, update() {}, strike() {}, flash() {} };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  // ------------------------------------------------------ standing stones
  const stones = instanced(stoneGeometry(7), MAT.standard, g.stones.length, { name: 'grove-stones' });
  const runeMat = new THREE.MeshBasicMaterial({ color: RUNE, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const withRunes = g.stones.filter((st) => st.runes);
  const runes = instanced(runeGeometry(), runeMat, withRunes.length, { cast: false, receive: false, name: 'grove-runes' });
  let ri = 0;
  g.stones.forEach((st, i) => {
    // the carved face looks out, away from the grove
    const face = Math.atan2(st.x - g.x, st.z - g.z);
    e.set(st.tilt, face + st.tilt * 3, st.tilt * 0.5, 'YXZ');
    q.setFromEuler(e);
    p.set(st.x, st.y - 0.25, st.z);
    s.set(st.w, st.h, st.w);
    m4.compose(p, q, s);
    stones.setMatrixAt(i, m4);
    stones.setColorAt(i, col.setScalar(0.85 + ((i * 0.37) % 1) * 0.15));
    if (st.runes) runes.setMatrixAt(ri++, m4);
  });
  group.add(finishInstanced(stones), finishInstanced(runes));

  // ------------------------------------------------------ barrier curtain
  const height = 10;
  const barrierMat = barrierMaterial();
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, height, 128, 1, true), barrierMat);
  curtain.position.set(g.x, g.y - 1 + height / 2, g.z);
  curtain.renderOrder = 5;
  curtain.frustumCulled = false;
  group.add(curtain);

  // ------------------------------------------------------ glowing flora
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const shroomsList = g.glow.filter((f) => f.kind === 'shroom');
  const bloomsList = g.glow.filter((f) => f.kind === 'bloom');
  const flora = [
    [instanced(shroomGeometry(), glowMat, shroomsList.length, { cast: false, name: 'grove-shrooms' }), shroomsList, ['#7ff2ff', '#b78cff', '#6dffc8']],
    [instanced(bloomGeometry(), glowMat, bloomsList.length, { cast: false, name: 'grove-blooms' }), bloomsList, ['#ff8ad8', '#8cc8ff', '#fff27a']],
  ];
  for (const [mesh, list, colors] of flora) {
    list.forEach((f, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, f.rot);
      m4.compose(p.set(f.x, f.y - 0.02, f.z), q, s.setScalar(f.s * 1.6));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(colors[Math.floor(f.hue * colors.length) % colors.length]));
    });
    group.add(finishInstanced(mesh));
  }

  // ------------------------------------------------------ light motes
  const soft = softTexture();
  const MOTES = 260;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = [];
  for (let i = 0; i < MOTES; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * g.r * 0.95;
    const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
    moteSeed.push({ x, z, y: terrain.heightAt(x, z) + 0.4 + Math.random() * 7, ph: Math.random() * TAU, sp: 0.2 + Math.random() * 0.5 });
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    map: soft, color: '#b9fbff', size: 0.45, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false;
  group.add(motes);

  // ------------------------------------------------------ low mist
  const mistMat = new THREE.MeshBasicMaterial({ map: soft, color: '#bfe9e6', transparent: true, opacity: 0.22, depthWrite: false });
  const mists = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + Math.random(), r = g.r * (0.2 + Math.random() * 0.6);
    const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mistMat);
    const size = g.r * (0.6 + Math.random() * 0.4);
    m.scale.set(size, 1, size);
    m.position.set(x, terrain.heightAt(x, z) + 0.6 + Math.random() * 0.6, z);
    m.userData = { x, z, ph: Math.random() * TAU };
    m.renderOrder = 4;
    mists.push(m);
    group.add(m);
  }

  return {
    group,
    update(dt, time) {
      barrierMat.uniforms.uTime.value = time;
      barrierMat.uniforms.uHitT.value += dt;
      barrierMat.uniforms.uFlash.value = Math.max(0, barrierMat.uniforms.uFlash.value - dt * 1.5);
      runeMat.opacity = 0.6 + 0.3 * Math.sin(time * 1.3);
      for (let i = 0; i < MOTES; i++) {
        const m = moteSeed[i];
        const t = time * m.sp + m.ph;
        motePos[i * 3] = m.x + Math.sin(t) * 1.2;
        motePos[i * 3 + 1] = m.y + Math.sin(t * 1.7) * 0.6;
        motePos[i * 3 + 2] = m.z + Math.cos(t * 0.8) * 1.2;
      }
      moteGeo.attributes.position.needsUpdate = true;
      for (const m of mists) {
        const u = m.userData;
        m.position.x = u.x + Math.sin(time * 0.05 + u.ph) * 3;
        m.position.z = u.z + Math.cos(time * 0.04 + u.ph) * 3;
      }
    },
    /** Something struck the barrier at world point `pt`: a ripple spreads from there. */
    strike(pt) {
      barrierMat.uniforms.uHit.value.copy(pt);
      barrierMat.uniforms.uHitT.value = 0;
    },
    /** The player bumped into the barrier: the whole curtain lights up for a moment. */
    flash() { barrierMat.uniforms.uFlash.value = 1; },
  };
}
