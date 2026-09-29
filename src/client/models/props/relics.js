// Relic models (the boat parts hidden on every island, see shared/relics.js).
//
// API (all return a THREE.Group, origin on the ground, model resting at y=0):
//   relicModel(kind)            static model (boat sockets, HUD previews)
//   relicMesh(kind, {glow})     pickup: model + (optional) light beam; call
//                               group.update(time) every frame – the model
//                               hovers, turns slowly and the beam pulses
//   relicGlow(kind)             only the beam + ground halo + rising sparkles;
//                               also has group.update(time)
// Models are 0.6–1.1 m. Geometry is built once per kind and shared.

import * as THREE from 'three';
import { MAT, deform, paint, place, part, merge, blob, limb, tube, rockGeometry, mesh } from '../kit.js';
import { RELICS } from '../../../shared/relics.js';
import { TAU, tintGlow, roundedBox, groundIt, noise3, smoothstep } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const lerpC = (a, b, t, out = new THREE.Color()) => out.copy(C(a)).lerp(C(b), Math.max(0, Math.min(1, t)));

// ------------------------------------------------------------ materials
const MATS = {
  gold: () => tintGlow(0.22, 0.22, 0.35),
  crystal: () => tintGlow(0.75, 0.2, 0),
  brass: () => tintGlow(0.14, 0.28, 0.35),
  wood: () => MAT.glossy,
  iron: () => tintGlow(0.06, 0.3, 0.3),
  cloth: () => MAT.standard,
  obsidian: () => tintGlow(0.16, 0.12, 0.1),
};

/** Parts of one relic: [{ geo, mat }] grouped per material. */
function build(kind) {
  const out = {};
  const add = (mat, g) => { (out[mat] ||= []).push(g); };
  BUILDERS[kind](add);
  // Merge per material, then ground the whole relic.
  const geos = Object.entries(out).map(([mat, list]) => ({ mat, geo: merge(list, kind === 'crystal' && mat === 'crystal' ? 0.9 : undefined) }));
  const k = SCALE[kind] || 1;
  const box = new THREE.Box3();
  for (const { geo } of geos) { geo.scale(k, k, k); geo.computeBoundingBox(); box.union(geo.boundingBox); }
  const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2;
  for (const { geo } of geos) { geo.translate(dx, dy, dz); geo.computeBoundingSphere(); }
  return { parts: geos, height: box.max.y - box.min.y };
}

/** Per-kind size tweak so every relic is ~0.8�1.1 m. */
const SCALE = { crystal: 0.8, rudder: 0.8 };

// --------------------------------------------------------------- builders
const BUILDERS = {
  /** Shiny golden egg with a jeweled band. */
  egg(add) {
    let g = new THREE.SphereGeometry(1, 40, 28);
    g = deform(g, (v) => { const k = v.y > 0 ? 1 - 0.2 * v.y * v.y : 1 - 0.04 * v.y * v.y; v.x *= k; v.z *= k; });
    g.scale(0.3, 0.42, 0.3);
    g.translate(0, 0.42, 0);
    const tmp = new THREE.Color();
    add('gold', paint(g, (c) => {
      const t = c.y / 0.84;
      lerpC('#b9780e', '#ffd84d', smoothstep(0, 0.75, t), tmp);
      if (noise3(c.x * 14, c.y * 14, c.z * 14, 3) > 0.45) tmp.lerp(C('#fff3b0'), 0.6);
      return tmp;
    }));
    // band + little rubies
    const band = new THREE.TorusGeometry(0.296, 0.022, 12, 64);
    add('gold', part(band, '#ffe27a', [0, 0.4, 0], [Math.PI / 2, 0, 0]));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      add('crystal', place(blob(0.035, 0.035, 0.022, '#ff4d6d', { w: 10, h: 8 }), [Math.cos(a) * 0.315, 0.4, Math.sin(a) * 0.315], [0, -a + Math.PI / 2, 0]));
    }
  },

  /** Glowing cyan crystal cluster on a little rock. */
  crystal(add) {
    add('iron', place(rockGeometry({ radius: 0.34, seed: 5, squash: 0.45, colors: ['#6f6a7c', '#5d5968', '#7a7486'] }), [0, 0.05, 0]));
    const shards = [
      [0, 0, 0.13, 0.95, 0, 0], [0.16, 0.08, 0.09, 0.6, 0.35, 0.4], [-0.15, 0.04, 0.1, 0.7, -0.4, -0.2],
      [0.05, -0.16, 0.08, 0.5, 0.2, -0.45], [-0.06, 0.17, 0.07, 0.45, -0.3, 0.5], [0.2, -0.1, 0.06, 0.38, 0.55, -0.2],
    ];
    const tmp = new THREE.Color();
    for (const [x, z, r, h, tx, tz] of shards) {
      const body = new THREE.CylinderGeometry(r, r * 0.85, h, 6, 2);
      body.translate(0, h / 2, 0);
      const tip = new THREE.ConeGeometry(r, h * 0.32, 6, 1);
      tip.translate(0, h + h * 0.16, 0);
      let g = merge([paint(body, '#fff'), paint(tip, '#fff')], 0.9);
      g = paint(g, (c) => lerpC('#1b9cc9', '#c8f8ff', c.y / (h * 1.3), tmp));
      add('crystal', place(g, [x, 0.08, z], [tx, 0, tz]));
    }
  },

  /** Brass three-blade ship propeller, standing tilted on a blade. */
  propeller(add) {
    const tmp = new THREE.Color();
    const parts = [];
    parts.push(part(new THREE.SphereGeometry(0.11, 24, 16), '#e8bd5a', [0, 0, 0], [0, 0, 0], [1, 1, 1.35]));
    parts.push(place(limb(0.05, 0.045, 0.3, '#b98a2e', 12), [0, 0, -0.02], [-Math.PI / 2, 0, 0]));
    parts.push(place(new THREE.TorusGeometry(0.058, 0.014, 8, 24), [0, 0, -0.22]));
    parts[parts.length - 1] = paint(parts[parts.length - 1], '#f0cf78');
    for (let k = 0; k < 3; k++) {
      let b = new THREE.SphereGeometry(1, 24, 16);
      b = deform(b, (v) => {
        const t = (v.y + 1) / 2;                     // root .. tip
        const w = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15));
        v.x *= w;
        const tw = 0.35 + t * 0.5;                   // pitch twist
        const x = v.x * Math.cos(tw) - v.z * Math.sin(tw);
        const z = v.x * Math.sin(tw) + v.z * Math.cos(tw);
        v.x = x; v.z = z;
      });
      b.scale(0.15, 0.3, 0.035);
      b.translate(0, 0.36, 0);
      b = paint(b, (c) => lerpC('#b8841f', '#ffe08a', smoothstep(0.1, 0.62, c.y), tmp));
      parts.push(place(b, [0, 0, 0], [0, 0, (k / 3) * TAU]));
    }
    add('brass', place(merge(parts), [0, 0, 0], [-0.55, 0.3, 0]));
  },

  /** Wooden ship's wheel with turned handles and a brass hub. */
  wheel(add) {
    const wood = [], brass = [];
    const tmp = new THREE.Color();
    const woodCol = (c) => (noise3(c.x * 9, c.y * 9, c.z * 9, 4) > 0.25 ? '#7f4f26' : '#9a6632');
    wood.push(paint(new THREE.TorusGeometry(0.36, 0.045, 10, 48), woodCol));
    wood.push(paint(new THREE.TorusGeometry(0.15, 0.032, 8, 32), woodCol));
    brass.push(part(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 24), '#e2b24e', [0, 0, 0], [Math.PI / 2, 0, 0]));
    brass.push(part(new THREE.SphereGeometry(0.05, 16, 12), '#ffd978', [0, 0, 0.08]));
    const handleProfile = [];
    const hp = [[0.0, 0.0], [0.028, 0.0], [0.03, 0.03], [0.042, 0.06], [0.03, 0.1], [0.028, 0.13], [0.04, 0.16], [0.03, 0.19], [0.0, 0.2]];
    for (const [r, y] of hp) handleProfile.push(new THREE.Vector2(r, y));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const spoke = limb(0.026, 0.022, 0.32, '#8a5a2c', 10);
      wood.push(place(spoke, [0, 0, 0], [0, 0, a]));
      const h = paint(new THREE.LatheGeometry(handleProfile, 16), (c) => lerpC('#8a5a2c', '#b07a44', c.y / 0.2, tmp));
      wood.push(place(h, [-Math.sin(a) * 0.39, Math.cos(a) * 0.39, 0], [0, 0, a]));
      brass.push(place(paint(new THREE.TorusGeometry(0.03, 0.01, 8, 16), '#e2b24e'), [-Math.sin(a) * 0.36, Math.cos(a) * 0.36, 0], [Math.PI / 2, 0, a]));
    }
    add('wood', place(merge(wood), [0, 0, 0], [-0.18, 0, 0]));
    add('brass', place(merge(brass), [0, 0, 0], [-0.18, 0, 0]));
  },

  /** Iron anchor with a rope looped through the ring and coiled at its foot. */
  anchor(add) {
    const iron = [];
    const tmp = new THREE.Color();
    const ironCol = (c) => {
      const n = noise3(c.x * 11, c.y * 11, c.z * 11, 9);
      return n > 0.4 ? '#8a5a3c' : lerpC('#4f5764', '#8a95a4', smoothstep(0.1, 1.0, c.y), tmp);
    };
    iron.push(paint(limb(0.05, 0.04, 0.8, '#fff', 14), ironCol));
    iron.push(place(paint(new THREE.TorusGeometry(0.085, 0.024, 12, 32), ironCol), [0, 0.9, 0]));
    iron.push(place(paint(limb(0.028, 0.028, 0.62, '#fff', 12), ironCol), [0, 0.72, -0.31], [Math.PI / 2, 0, 0]));
    for (const s of [-1, 1]) iron.push(place(blob(0.04, 0.04, 0.04, '#5c6470', { w: 10, h: 8 }), [0, 0.72, s * 0.31]));
    const arm = [V(-0.4, 0.38, 0), V(-0.3, 0.14, 0), V(0, 0.04, 0), V(0.3, 0.14, 0), V(0.4, 0.38, 0)];
    iron.push(tube(arm, (t) => 0.05 - 0.018 * Math.abs(t - 0.5) * 2, { radial: 8, color: (t, a, p) => ironCol(p) }));
    iron.push(place(blob(0.07, 0.06, 0.06, '#5a626e', { w: 12, h: 8 }), [0, 0.05, 0]));
    for (const s of [-1, 1]) {
      let f = new THREE.SphereGeometry(1, 20, 12);
      f = deform(f, (v) => { if (v.y > 0) { v.x *= 1 - v.y * 0.7; } });
      f.scale(0.11, 0.15, 0.03);
      iron.push(place(paint(f, ironCol), [s * 0.4, 0.42, 0], [0, 0, -s * 0.55]));
    }
    add('iron', merge(iron));
    // rope: through the ring, down the shank, a coil on the ground
    const rope = [];
    const pts = [V(0, 0.98, 0.0), V(0.1, 0.9, 0.06), V(0.08, 0.7, 0.1), V(0.12, 0.45, 0.14), V(0.2, 0.22, 0.2), V(0.32, 0.06, 0.24)];
    const ropeCol = (t, a, p) => (Math.sin(t * 90 + a * 2) > 0 ? '#c9a46a' : '#a88450');
    rope.push(tube(pts, () => 0.018, { radial: 6, color: ropeCol }));
    const coil = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = t * TAU * 2.2;
      const r = 0.1 + t * 0.06;
      coil.push(V(0.32 + Math.cos(a) * r, 0.03 + t * 0.03, 0.34 + Math.sin(a) * r));
    }
    rope.push(tube(coil, () => 0.02, { radial: 6, color: ropeCol }));
    add('wood', merge(rope));
  },

  /** Folded, patched sail bundle tied with rope. */
  sail(add) {
    const cloth = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < 3; i++) {
      const w = 0.84 - i * 0.06, d = 0.54 - i * 0.03;
      const layer = roundedBox(w, 0.13, d, 0.055, (c, n) => lerpC('#e6d7b2', '#f7eed8', n.y * 0.5 + 0.5, tmp), (v) => {
        v.y += 0.03 * Math.cos((v.x / w) * Math.PI) * Math.cos((v.z / d) * Math.PI) * (v.y > 0 ? 1 : -0.3);
      });
      cloth.push(place(layer, [0.02 * (i % 2 ? -1 : 1), 0.07 + i * 0.125, 0.015 * i], [0, (i - 1) * 0.06, 0]));
    }
    // rolled edge
    cloth.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 20), '#efe3c4', [-0.42, 0.1, 0.0], [Math.PI / 2, 0, 0]));
    // patches
    const patches = [[0.18, 0.39, 0.08, '#d8b98a'], [-0.18, 0.39, -0.1, '#b9d3e6'], [0.3, 0.26, 0.22, '#e3a57e']];
    for (const [x, y, z, col] of patches) {
      cloth.push(place(roundedBox(0.2, 0.016, 0.15, 0.006, col), [x, y + 0.01, z], [0.05, 0.3 * x, 0]));
    }
    add('cloth', merge(cloth));
    const rope = [];
    for (const x of [-0.2, 0.22]) {
      const ring = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * TAU;
        ring.push(V(x, 0.24 + Math.sin(a) * 0.235, Math.cos(a) * 0.3));
      }
      rope.push(tube(ring, () => 0.022, { radial: 6, color: (t) => (Math.sin(t * 60) > 0 ? '#b88d52' : '#9c7440'), capStart: false, capEnd: false }));
      rope.push(place(blob(0.045, 0.035, 0.05, '#a88450', { w: 10, h: 8 }), [x, 0.47, 0]));
    }
    add('wood', merge(rope));
  },

  /** Glossy obsidian rudder with a purple sheen: blade, stock and tiller. */
  rudder(add) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.02);
    s.lineTo(0, 0.95);
    s.quadraticCurveTo(0.12, 0.98, 0.22, 0.84);
    s.quadraticCurveTo(0.44, 0.52, 0.46, 0.2);
    s.quadraticCurveTo(0.46, 0.0, 0.26, 0.0);
    s.lineTo(0.04, 0.0);
    s.closePath();
    let blade = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 20 });
    blade.translate(0.03, 0, -0.025);
    const tmp = new THREE.Color();
    const obs = (c, n) => {
      const sheen = Math.pow(Math.max(0, n.x * 0.5 + n.y * 0.6 + 0.3), 2);
      const streak = noise3(c.x * 7, c.y * 7, c.z * 7, 21);
      lerpC('#1a1424', '#3b2f4a', c.y, tmp).lerp(C('#8c68d8'), Math.min(0.75, sheen * 0.55 + (streak > 0.35 ? 0.3 : 0)));
      return tmp;
    };
    const parts = [paint(blade, obs)];
    parts.push(paint(limb(0.045, 0.04, 1.2, '#fff', 14), obs));
    parts.push(place(paint(limb(0.035, 0.024, 0.55, '#fff', 12), obs), [0, 1.14, 0], [0, 0, -Math.PI / 2 + 0.18]));
    parts.push(place(blob(0.04, 0.04, 0.04, '#6b4fb0', { w: 10, h: 8 }), [0.54, 1.24, 0]));
    for (const y of [0.25, 0.7]) parts.push(part(new THREE.TorusGeometry(0.052, 0.016, 10, 24), '#b89cff', [0, y, 0], [Math.PI / 2, 0, 0]));
    add('obsidian', place(merge(parts), [0, 0, 0], [0, 0.5, 0]));
  },
};

// ------------------------------------------------------------------ cache
const cache = new Map();
function relicParts(kind) {
  if (!BUILDERS[kind]) throw new Error(`unknown relic kind: ${kind}`);
  let r = cache.get(kind);
  if (!r) { r = build(kind); cache.set(kind, r); }
  return r;
}

/** Height of a relic model (m), e.g. to put a label above it. */
export function relicHeight(kind) {
  return relicParts(kind).height;
}

/** Static relic model: THREE.Group resting on y=0. */
export function relicModel(kind) {
  const group = new THREE.Group();
  group.name = `relic-${kind}`;
  for (const { mat, geo } of relicParts(kind).parts) group.add(mesh(geo, MATS[mat]()));
  return group;
}

// ------------------------------------------------------------------- glow
const glowTime = { value: 0 };
const beamMats = new Map();
function beamMaterial(color) {
  let m = beamMats.get(color);
  if (m) return m;
  const uniforms = { uColor: { value: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25) }, uTime: glowTime };
  m = {
    beam: new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main() {
          vH = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz; vN = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime;
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float fall = pow(1.0 - vH, 1.8) * smoothstep(0.0, 0.08, vH);
          float pulse = 0.72 + 0.28 * sin(uTime * 2.2 - vH * 7.0);
          float a = 0.55 * fall * pow(facing, 1.6) * pulse;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
    halo: new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime; varying vec2 vP;
        void main() {
          float r = length(vP);
          float ring = exp(-pow((r - 0.75 - 0.06 * sin(uTime * 2.2)) * 7.0, 2.0));
          float a = (0.35 * (1.0 - smoothstep(0.0, 1.0, r)) + 0.45 * ring);
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    sparks: new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        uniform float uTime; attribute vec3 aSeed; varying float vA;
        void main() {
          float t = fract(aSeed.y + uTime * (0.08 + 0.05 * aSeed.z));
          vec3 p = vec3(aSeed.x * cos(aSeed.z * 9.0 + uTime * 0.7), t * 5.5, aSeed.x * sin(aSeed.z * 9.0 + uTime * 0.7));
          vA = sin(3.14159 * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (70.0 + 50.0 * aSeed.z) / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = vA * smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4((uColor + 0.35) * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  };
  beamMats.set(color, m);
  return m;
}

let beamGeo = null, haloGeo = null, sparkGeo = null;
function glowGeometry() {
  if (!beamGeo) {
    beamGeo = new THREE.CylinderGeometry(0.55, 0.85, 16, 24, 1, true);
    beamGeo.translate(0, 8, 0);
    haloGeo = new THREE.CircleGeometry(1.2, 40);
    haloGeo.rotateX(-Math.PI / 2);
    sparkGeo = new THREE.BufferGeometry();
    const n = 14, seeds = new Float32Array(n * 3), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = 0.15 + ((i * 0.618) % 1) * 0.55;
      seeds[i * 3 + 1] = (i * 0.377) % 1;
      seeds[i * 3 + 2] = (i * 0.731) % 1;
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 4);
  }
  return { beamGeo, haloGeo, sparkGeo };
}

/**
 * Soft vertical light beam (16 m), ground halo and rising sparkles in the
 * relic's color. Additive, no depth writes, no shadows. group.update(time).
 */
export function relicGlow(kind) {
  const m = beamMaterial(RELICS[kind]?.color || '#ffffff');
  const g = glowGeometry();
  const group = new THREE.Group();
  group.name = `relic-glow-${kind}`;
  const beam = new THREE.Mesh(g.beamGeo, m.beam);
  const halo = new THREE.Mesh(g.haloGeo, m.halo);
  halo.position.y = 0.04;
  const sparks = new THREE.Points(g.sparkGeo, m.sparks);
  for (const o of [beam, halo, sparks]) { o.renderOrder = 3; o.castShadow = false; o.receiveShadow = false; group.add(o); }
  group.update = (time) => { glowTime.value = time; };
  return group;
}

/**
 * Pickup relic: static model that hovers and slowly turns, plus the glow.
 * Returns a THREE.Group with update(time); group.userData.kind = kind.
 */
export function relicMesh(kind, { glow = true } = {}) {
  const group = new THREE.Group();
  group.name = `relic-pickup-${kind}`;
  group.userData.kind = kind;
  const model = relicModel(kind);
  group.add(model);
  const beam = glow ? relicGlow(kind) : null;
  if (beam) group.add(beam);
  const phase = kind.length * 1.7;
  group.update = (time) => {
    model.position.y = 0.16 + Math.sin(time * 1.8 + phase) * 0.08;
    model.rotation.y = time * 0.6 + phase;
    if (beam) beam.update(time);
  };
  group.update(0);
  return group;
}
