// Weapons and tools: spear, bow, arrow, trap, meat bait.
// Built once, geometry cached. Orientation: tools point along +Y from the grip.

import * as THREE from 'three';
import { MAT, deform, paint, place, part, merge, mesh, tube, wrap, spike, jitter } from './kit.js';

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

const WOOD = '#8a5a35';
const WOOD_DARK = '#6b4228';
const WOOD_LIGHT = '#b07a48';
const ROPE = '#c7995a';
const STONE = '#b8b4c4';
const STONE_DARK = '#8f8aa0';

/** Spear: ~2 m. Origin at the grip (about 40% up the shaft), tip at +Y. */
export function spearGeometry() {
  return cached('spear', () => {
    const len = 2.0;
    const grip = 0.75;
    const shaft = paint(deform(new THREE.CylinderGeometry(0.022, 0.03, len, 7, 4), (v) => {
      v.x += jitter(v, 0.003, 2);
      v.z += jitter(v, 0.003, 3);
    }), (c) => (Math.abs(Math.sin(c.y * 9)) > 0.93 ? WOOD_DARK : WOOD));
    const tipLen = 0.3;
    let tip = new THREE.OctahedronGeometry(1, 0);
    tip = deform(tip, (v) => {
      v.y = v.y > 0 ? v.y * tipLen * 0.8 : v.y * tipLen * 0.25;
      v.x *= 0.075;
      v.z *= 0.03;
    });
    tip = paint(tip, (c, n) => (n.x > 0 ? STONE : STONE_DARK));
    return merge([
      place(shaft, [0, len / 2 - grip, 0]),
      place(tip, [0, len - grip + tipLen * 0.12, 0]),
      place(wrap(0.034, 0.1, 4, ROPE), [0, len - grip - 0.1, 0]),        // tip lashing
      place(wrap(0.036, 0.28, 7, '#9a6b3c'), [0, -0.14, 0]),              // hand grip wrap
      place(wrap(0.03, 0.03, 2, ROPE), [0, -grip + 0.08, 0]),
    ]);
  });
}

/** Bow: limb curves toward -Z, string on +Z side. Origin at the grip, limbs along Y. */
export function bowGeometry() {
  return cached('bow', () => {
    const pts = [];
    const H = 0.62;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = (t - 0.5) * 2 * H;
      const z = -Math.cos((t - 0.5) * Math.PI) * 0.16 + 0.16 * (Math.abs(t - 0.5) > 0.42 ? (Math.abs(t - 0.5) - 0.42) * 6 : 0);
      pts.push(new THREE.Vector3(0, y, -z + 0.16));
    }
    const limbGeo = tube(pts, (t) => 0.012 + 0.014 * (1 - Math.abs(t - 0.5) * 2), {
      radial: 6,
      color: (t) => (Math.abs(t - 0.5) < 0.08 ? '#5b3a22' : Math.abs(t - 0.5) > 0.46 ? WOOD_DARK : WOOD_LIGHT),
    });
    return merge([
      limbGeo,
      place(wrap(0.03, 0.14, 5, '#5b3a22'), [0, -0.07, 0.0]),
    ]);
  });
}

/** Bow string as two segments meeting at the nock point (animated by the viewmodel). */
export function makeBowString() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f5ecd8' }));
  line.frustumCulled = false;
  const top = new THREE.Vector3(0, 0.6, 0.165);
  const bottom = new THREE.Vector3(0, -0.6, 0.165);
  line.userData.setPull = (pull) => {
    const p = geo.attributes.position;
    p.setXYZ(0, top.x, top.y, top.z);
    p.setXYZ(1, 0, 0, 0.165 + pull);
    p.setXYZ(2, bottom.x, bottom.y, bottom.z);
    p.needsUpdate = true;
  };
  line.userData.setPull(0);
  return line;
}

/** Arrow: ~0.8 m along +Y, tip at +Y end, origin at the nock. */
export function arrowGeometry() {
  return cached('arrow', () => {
    const L = 0.8;
    let head = new THREE.OctahedronGeometry(1, 0);
    head = paint(deform(head, (v) => {
      v.y = v.y > 0 ? v.y * 0.09 : v.y * 0.03;
      v.x *= 0.028;
      v.z *= 0.012;
    }), (c, n) => (n.x > 0 ? STONE : STONE_DARK));
    const fl = [];
    for (let i = 0; i < 3; i++) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.04, 0.02, 0, 0, 0.17, 0, 0, 0, 0, 0, 0.17, 0, 0.04, 0.02, 0], 3));
      tri.computeVertexNormals();
      fl.push(part(tri, i === 0 ? '#e8403a' : '#f7f1e4', [0, 0.03, 0], [0, (i / 3) * Math.PI * 2, 0]));
    }
    return merge([
      part(new THREE.CylinderGeometry(0.009, 0.009, L, 5), '#c99a62', [0, L / 2, 0]),
      place(head, [0, L + 0.03, 0]),
      place(wrap(0.012, 0.02, 2, ROPE), [0, L - 0.03, 0]),
      ...fl,
    ]);
  });
}

/** Trap: wooden frame with sharpened stakes and rope, ~1.6 m wide, sits on the ground. */
export function trapGeometry(sprung = false) {
  return cached(`trap-${sprung}`, () => {
    const parts = [];
    const logs = [
      [[0, 0.1, 0.75], [0, 0, Math.PI / 2], 1.7],
      [[0, 0.1, -0.75], [0, 0, Math.PI / 2], 1.7],
      [[0.8, 0.14, 0], [Math.PI / 2, 0, 0], 1.6],
      [[-0.8, 0.14, 0], [Math.PI / 2, 0, 0], 1.6],
    ];
    for (const [pos, rot, len] of logs) {
      parts.push(place(paint(new THREE.CylinderGeometry(0.08, 0.09, len, 7), (c) => (Math.abs(c.y) > len / 2 - 0.02 ? WOOD_LIGHT : WOOD)), pos, rot));
    }
    // stakes pointing inward/up (jaws)
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 5; i++) {
        const x = -0.6 + i * 0.3;
        const tilt = sprung ? side * -0.25 : side * 0.9;
        parts.push(place(spike(0.05, 0.55, WOOD, '#e3c9a0', 5), [x, 0.12, side * 0.7], [tilt, 0, 0]));
      }
    }
    // rope lashings at the corners + trigger cord
    for (const [x, z] of [[0.8, 0.75], [-0.8, 0.75], [0.8, -0.75], [-0.8, -0.75]]) {
      parts.push(place(wrap(0.1, 0.05, 2, ROPE), [x, 0.08, z]));
    }
    parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 4), ROPE, [0, 0.12, 0], [0, 0, Math.PI / 2]));
    return merge(parts);
  });
}

/** Meat chunk (loot + bait): a chunky red steak with a cream bone. ~0.35 m. */
export function meatGeometry() {
  return cached('meat', () => {
    let m = new THREE.IcosahedronGeometry(0.17, 1);
    m = deform(m, (v) => {
      v.x *= 1.25;
      v.y *= 0.7;
      v.x += jitter(v, 0.02, 5);
      v.z += jitter(v, 0.02, 6);
    });
    m = paint(m, (c, n) => (n.y > 0.55 && Math.abs(c.x) < 0.12 ? '#ff8f8f' : n.y < -0.3 ? '#b8262e' : '#e23b3f'));
    const bone = merge([
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), '#f4ead2', [0.22, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.SphereGeometry(0.045, 6, 4), '#f4ead2', [0.34, 0.025, 0]),
      part(new THREE.SphereGeometry(0.045, 6, 4), '#f4ead2', [0.34, -0.025, 0]),
    ]);
    return merge([m, bone]);
  });
}

export function makeSpear() { return mesh(spearGeometry()); }
export function makeBow() { return mesh(bowGeometry()); }
export function makeArrow() { return mesh(arrowGeometry()); }
export function makeTrap(sprung = false) { return mesh(trapGeometry(sprung)); }
export function makeMeat() { return mesh(meatGeometry(), MAT.glossy); }
