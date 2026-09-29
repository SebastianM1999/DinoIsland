// Co-op explorer character (see inspiration/model-art.png): chunky body, big
// round head in the player color, black oval eyes, hat per player, short-
// sleeved shirt with cross-body strap, belt, brown shorts, white socks, brown
// boots and a backpack. Rigged with simple pivots and procedurally animated.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { MAT, deform, paint, place, part, merge, mesh, blob, limb, jitter } from './kit.js';
import { spearGeometry, bowGeometry, trapGeometry, meatGeometry } from './weapons.js';

const LOOKS = [
  { shirt: '#f2e3a2', pack: '#3d3c44', packDark: '#2a2930', hat: 'ranger' },
  { shirt: '#ffb52e', pack: '#9a2f2b', packDark: '#6f201d', hat: 'cap' },
  { shirt: '#f4ecd6', pack: '#5c4a2e', packDark: '#3f321f', hat: 'helmet' },
  { shirt: '#f3d27e', pack: '#2f4c44', packDark: '#20352f', hat: 'bucket' },
];
const SHORTS = '#6e482a';
const BOOT = '#6b4226';
const BOOT_DARK = '#4b2e1a';
const STRAP = '#3b2a1e';

const geoCache = new Map();

function shade(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

function hatGeometry(kind) {
  if (kind === 'ranger') {
    const brim = paint(deform(new THREE.CylinderGeometry(0.56, 0.58, 0.05, 12), (v) => {
      v.y += (Math.abs(v.x) > 0.3 ? 0.03 : 0) + jitter(v, 0.01, 1);
    }), '#8b5a2b');
    const crown = paint(deform(new THREE.CylinderGeometry(0.27, 0.33, 0.26, 10), (v) => {
      if (v.y > 0.1) v.y -= Math.max(0, 0.08 - Math.abs(v.x) * 0.3); // pinched top
    }), (c) => (c.y < -0.06 ? '#5a3419' : '#9a6632'));
    return merge([brim, place(crown, [0, 0.14, 0])]);
  }
  if (kind === 'cap') {
    const dome = paint(new THREE.SphereGeometry(0.39, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#f4efe3');
    const bill = paint(deform(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10, 1, false, Math.PI * 0.5, Math.PI), (v) => { v.x *= 1.1; }), '#ece4d2');
    const patch = part(new THREE.BoxGeometry(0.14, 0.12, 0.03), '#ff8a2a', [0, 0.18, -0.33], [-0.5, 0, 0]);
    const button = part(new THREE.SphereGeometry(0.04, 6, 4), '#ff8a2a', [0, 0.39, 0]);
    return merge([dome, place(bill, [0, 0.02, -0.28]), patch, button]);
  }
  if (kind === 'helmet') {
    const dome = paint(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#eadbb0');
    const brim = paint(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 12), '#e0cf9e');
    const band = paint(new THREE.CylinderGeometry(0.405, 0.405, 0.07, 12, 1, true), '#8a6a3a');
    const top = part(new THREE.SphereGeometry(0.05, 6, 4), '#d8c690', [0, 0.4, 0]);
    return merge([dome, brim, place(band, [0, 0.06, 0]), top]);
  }
  // bucket hat
  const body = paint(new THREE.CylinderGeometry(0.3, 0.37, 0.28, 10), (c) => (c.y < -0.08 ? '#3f7a39' : '#4f9444'));
  const brim = paint(deform(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 12), (v) => { if (Math.abs(v.x) + Math.abs(v.z) > 0.4) v.y -= 0.05; }), '#468a3c');
  return merge([place(body, [0, 0.14, 0]), brim]);
}

function buildParts(slot) {
  const key = slot;
  if (geoCache.has(key)) return geoCache.get(key);
  const look = LOOKS[slot % LOOKS.length];
  const skin = CONFIG.playerColors[slot % 4];
  const skinDark = shade(skin, 0.82);
  const skinBase = new THREE.Color(skin);
  const skinBlend = new THREE.Color();

  // --- head (big round, slightly squashed) with eyes looking -Z
  const headG = merge([
    paint(deform(new THREE.IcosahedronGeometry(0.36, 2), (v) => {
      v.y *= 0.95;
      if (v.y < -0.2) v.z *= 0.92;
    }), (c) => skinBlend.copy(skinDark).lerp(skinBase, Math.max(0, Math.min(1, (c.y + 0.3) / 0.2)))),
    place(blob(0.045, 0.075, 0.03, '#15131c'), [-0.12, 0.03, -0.335], [0.1, -0.3, 0]),
    place(blob(0.045, 0.075, 0.03, '#15131c'), [0.12, 0.03, -0.335], [0.1, 0.3, 0]),
    place(blob(0.014, 0.018, 0.01, '#ffffff'), [-0.11, 0.06, -0.36]),
    place(blob(0.014, 0.018, 0.01, '#ffffff'), [0.13, 0.06, -0.36]),
  ]);
  const hatG = hatGeometry(look.hat);

  // --- torso: shirt, collar, strap, belt
  const shirt = new THREE.Color(look.shirt), shirtDark = shade(look.shirt, 0.92), shirtBlend = new THREE.Color();
  const torso = paint(deform(new THREE.CylinderGeometry(0.25, 0.28, 0.5, 10, 2), (v) => {
    v.z *= 0.82;
    if (v.y > 0.2) { v.x *= 0.95; }
  }), (c) => shirtBlend.copy(shirt).lerp(shirtDark, Math.max(0, Math.min(1, (c.y - 0.12) / 0.16))));
  const collar = part(new THREE.ConeGeometry(0.2, 0.12, 8, 1, true), shade(look.shirt, 0.85), [0, 0.27, 0], [Math.PI, 0, 0]);
  const strap = part(new THREE.BoxGeometry(0.06, 0.66, 0.5), STRAP, [0, 0.02, 0], [0, 0, 0.72]);
  const belt = part(new THREE.CylinderGeometry(0.285, 0.29, 0.07, 10, 1, true), '#4a3020', [0, -0.21, 0]);
  const buckle = part(new THREE.BoxGeometry(0.08, 0.07, 0.03), '#d9b24a', [0, -0.21, -0.24]);
  const pocket = part(new THREE.BoxGeometry(0.1, 0.09, 0.02), shade(look.shirt, 0.88), [0.12, 0.1, -0.225]);
  const torsoG = merge([torso, collar, strap, belt, buckle, pocket]);

  // --- backpack (on +Z = back)
  const packG = merge([
    part(deform(new THREE.BoxGeometry(0.42, 0.46, 0.22, 2, 2, 1), (v) => { v.x += jitter(v, 0.01, 3); if (v.y > 0.15) v.z *= 0.85; }), look.pack, [0, 0, 0]),
    part(new THREE.BoxGeometry(0.3, 0.2, 0.08), look.packDark, [0, -0.08, 0.13]),
    part(new THREE.BoxGeometry(0.44, 0.08, 0.2), look.packDark, [0, 0.22, 0.02]),
    part(new THREE.BoxGeometry(0.05, 0.05, 0.03), '#d9b24a', [0, -0.02, 0.18]),
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 7), '#6c8a3c', [0, 0.3, 0.02], [0, 0, Math.PI / 2]),  // bedroll
  ]);

  // --- arm: short sleeve + skin arm + round hand (hangs down from the shoulder pivot)
  const armG = merge([
    part(new THREE.CylinderGeometry(0.1, 0.09, 0.16, 8), look.shirt, [0, -0.07, 0]),
    place(limb(0.065, 0.075, 0.3, skin, 7), [0, -0.44, 0]),
    part(new THREE.IcosahedronGeometry(0.085, 1), skin, [0, -0.46, 0]),
  ]);

  // --- leg: shorts, knee, white sock, boot (from hip pivot down to the ground)
  const legG = merge([
    part(new THREE.CylinderGeometry(0.12, 0.11, 0.24, 8), SHORTS, [0, -0.1, 0]),
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 7), skin, [0, -0.27, 0]),
    part(new THREE.CylinderGeometry(0.085, 0.08, 0.12, 7), '#f7f3ea', [0, -0.38, 0]),
    part(deform(new THREE.BoxGeometry(0.17, 0.14, 0.27, 2, 1, 2), (v) => { if (v.z < 0 && v.y > 0) v.y -= 0.03; }), (c) => (c.y < -0.04 ? BOOT_DARK : BOOT), [0, -0.49, -0.04]),
  ]);

  const res = { headG, hatG, torsoG, packG, armG, legG, skin };
  geoCache.set(key, res);
  return res;
}

const HELD = {
  spear: () => mesh(spearGeometry()),
  bow: () => mesh(bowGeometry()),
  trap: () => { const m = mesh(trapGeometry(false)); m.scale.setScalar(0.35); return m; },
  bait: () => mesh(meatGeometry(), MAT.glossy),
  fruit: null,
};

export class PlayerModel {
  constructor(slot) {
    const g = buildParts(slot);
    this.slot = slot;
    this.root = new THREE.Group();      // positioned/rotated by the owner
    this.body = new THREE.Group();      // tilts over on death
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 0.6;
    this.body.add(this.hips);

    this.torso = mesh(g.torsoG);
    this.torso.position.y = 0.25;
    this.hips.add(this.torso);

    this.pack = mesh(g.packG);
    this.pack.position.set(0, 0.3, 0.3);
    this.hips.add(this.pack);

    // Carried loot bundle strapped onto the backpack.
    this.loot = mesh(meatGeometry(), MAT.glossy);
    this.loot.position.set(0, 0.62, 0.34);
    this.loot.visible = false;
    this.hips.add(this.loot);

    this.neck = new THREE.Group();
    this.neck.position.y = 0.52;
    this.hips.add(this.neck);
    this.head = mesh(g.headG);
    this.head.position.y = 0.3;
    this.neck.add(this.head);
    this.hat = mesh(g.hatG);
    // each hat sits at its own height on the round head (head centre is at 0.3)
    this.hat.position.y = { ranger: 0.5, cap: 0.36, helmet: 0.38, bucket: 0.47 }[LOOKS[slot % LOOKS.length].hat];
    this.hat.position.z = 0.02;
    this.neck.add(this.hat);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.33, 0.44, 0);
    this.armR.position.set(0.33, 0.44, 0);
    this.armL.add(mesh(g.armG));
    this.armR.add(mesh(g.armG));
    this.hips.add(this.armL, this.armR);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.46, 0);
    this.armR.add(this.hand);

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0, 0);
    this.legR.position.set(0.13, 0, 0);
    this.legL.add(mesh(g.legG));
    this.legR.add(mesh(g.legG));
    this.hips.add(this.legL, this.legR);

    this.held = {};
    this.equipped = null;
    this.phase = 0;
    this.walkBlend = 0;
    this.deadBlend = 0;
    this.attackT = 0;
    this.eatT = 0;
    this.time = Math.random() * 10;
  }

  setEquipped(name) {
    if (this.equipped === name) return;
    if (this.equipped && this.held[this.equipped]) this.held[this.equipped].visible = false;
    this.equipped = name;
    if (!HELD[name]) return;
    if (!this.held[name]) {
      const m = HELD[name]();
      if (name === 'spear') m.rotation.set(Math.PI / 2, 0, 0);
      if (name === 'bow') m.rotation.set(0, Math.PI / 2, 0);
      if (name === 'bait') m.position.set(0, -0.05, 0);
      this.hand.add(m);
      this.held[name] = m;
    }
    this.held[name].visible = true;
  }

  /**
   * @param {number} dt
   * @param {{spd:number, pitch:number, eq:string, drawing:boolean, eating:boolean, attacking:boolean, carry:number, alive:boolean, grounded:boolean}} s
   */
  animate(dt, s) {
    this.time += dt;
    const walk = Math.min(1, s.spd / 5);
    this.walkBlend += (walk - this.walkBlend) * Math.min(1, dt * 8);
    this.phase += dt * (3 + s.spd * 1.35);
    const w = this.walkBlend;
    const sw = Math.sin(this.phase);
    const run = Math.min(1, Math.max(0, (s.spd - 5) / 3));

    this.setEquipped(s.eq);
    this.loot.visible = s.carry > 0;

    // death: tip over
    this.deadBlend += ((s.alive ? 0 : 1) - this.deadBlend) * Math.min(1, dt * 4);
    this.body.rotation.x = -this.deadBlend * Math.PI / 2 * 0.95;
    this.body.position.y = this.deadBlend * 0.25;

    // legs + body bob
    this.legL.rotation.x = sw * 0.75 * w;
    this.legR.rotation.x = -sw * 0.75 * w;
    this.hips.position.y = 0.6 + Math.abs(Math.cos(this.phase)) * 0.06 * w - 0.03 * w;
    this.hips.rotation.x = -0.12 * run;
    this.hips.rotation.y = sw * 0.08 * w;
    if (!s.grounded) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
    }

    // breathing + head look (pitch)
    const breathe = Math.sin(this.time * 2.2) * 0.012;
    this.torso.scale.set(1 + breathe, 1, 1 + breathe);
    this.neck.rotation.x = -s.pitch * 0.6 + Math.sin(this.phase * 2) * 0.03 * w;

    // arms: swing when walking; right arm holds the tool forward
    this.armL.rotation.x = -sw * 0.7 * w;
    this.armL.rotation.z = -0.1;
    let rx = sw * 0.5 * w, rz = 0.1;
    if (s.eq === 'spear') rx = -0.5 + sw * 0.15 * w;
    if (s.eq === 'bow') { rx = -0.9 - s.pitch * 0.5; rz = 0.2; }
    if (s.drawing) { rx = -1.5 - s.pitch; this.armL.rotation.x = -1.3 - s.pitch; this.armL.rotation.z = 0.6; }
    if (s.attacking) this.attackT = 0.35;
    if (this.attackT > 0) {
      this.attackT -= dt;
      const k = Math.sin((1 - this.attackT / 0.35) * Math.PI);
      rx = -0.5 - k * 1.1;
    }
    if (s.eating) {
      this.eatT += dt;
      rx = -2.0 + Math.sin(this.eatT * 14) * 0.15;
      rz = -0.35;
    } else this.eatT = 0;
    this.armR.rotation.x = rx;
    this.armR.rotation.z = rz;
  }
}
