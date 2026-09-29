// Procedural creature rig + animator shared by all dinosaurs.
//
// A species builder returns a `Rig` (joint hierarchy + meshes). The animator
// drives it every frame from a few inputs (speed, state, turn rate, look):
//   * gait phase advances by distance walked (phase += dist / stride) so the
//     stance feet stay planted – no sliding
//   * legs use analytic 2-bone IK (thigh + shin) toward per-foot targets that
//     follow the terrain; digitigrade legs add a metatarsus + flat toes
//   * body bob / sway / pitch, neck + tail follow-through with lag,
//     breathing, blinking, head look, jaw, death roll, trap struggle.
// Conventions: creatures face -Z. Legs hang along -Y from their joints and +X
// rotation swings them forward. Necks/heads/jaws point forward (or up) and +X
// rotation lifts them (jaw: -X opens). Tails point backward (+Z); +X droops them.

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const TAU = Math.PI * 2;

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth01 = (t) => t * t * (3 - 2 * t);

/**
 * @typedef {Object} LegSpec
 * @property {THREE.Object3D} hip    thigh joint (rotation.x animated)
 * @property {THREE.Object3D} knee   shin joint
 * @property {THREE.Object3D} [ankle] metatarsus joint (digitigrade)
 * @property {THREE.Object3D} [foot] foot/toes joint (kept flat)
 * @property {number} l1 thigh length
 * @property {number} l2 shin length
 * @property {number} [l3] metatarsus length (digitigrade)
 * @property {number} [metaAngle] forward slant of the metatarsus from vertical (radians)
 * @property {number} kneeDir +1 knee points forward, -1 backward
 * @property {number} offset gait phase offset (0..1)
 * @property {boolean} [front]
 */

export class Rig {
  constructor() {
    this.root = new THREE.Group();   // placed + yawed by the owner
    this.tilt = new THREE.Group();   // death roll / trapped sink
    this.body = new THREE.Group();   // pelvis: bob, sway, pitch
    this.root.add(this.tilt);
    this.tilt.add(this.body);
    this.chest = null;               // optional: breathing scale
    this.neck = [];                  // joints from base to head
    this.head = null;
    this.jaw = null;
    this.tail = [];                  // joints from base to tip
    /** @type {LegSpec[]} */
    this.legs = [];
    this.eyelids = [];               // meshes scaled on Y to blink
    this.wings = null;               // pteranodon: { left:[joints], right:[joints] }
    this.arms = [];                  // small theropod arms (joints)
    /** hit zones: { zone, joint, offset:Vector3, radius } */
    this.hitZones = [];
    this.rest = new Map();           // joint -> rest Euler (captured by finalize)
  }

  /** Capture the rest pose after building; also leg rest positions. */
  finalize() {
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      this.rest.set(o, o.rotation.clone());
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    for (const leg of this.legs) {
      leg.hip.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      leg.restX = _v.x;
      leg.restZ = _v.z;
      leg.hipHeight = _v.y;
    }
    this.bodyRestY = this.body.position.y;
    this.#fillHitGaps();
    return this;
  }

  /**
   * The hand-placed hit zones cover the main masses; this adds spheres wherever
   * visible geometry still sticks out (feet, tail tips, spikes, arms), attached
   * to the joint that carries that geometry so they follow the animation. Each
   * new sphere inherits the zone of the nearest hand-placed sphere.
   */
  #fillHitGaps() {
    if (!this.hitZones.length) return;
    const base = this.hitSpheres([]).map((s) => ({ zone: s.zone, center: s.center.clone(), radius: s.radius }));
    const size = new THREE.Box3().setFromObject(this.root).getSize(_w);
    const tol = Math.min(0.2, Math.max(0.05, Math.max(size.x, size.y, size.z) * 0.02));
    const maxR = Math.max(...base.map((s) => s.radius)) * 0.8;
    const nearest = (p) => {
      let best = null, bd = Infinity;
      for (const s of base) {
        const d = p.distanceTo(s.center) - s.radius;
        if (d < bd) { bd = d; best = s; }
      }
      return { s: best, d: bd };
    };

    // uncovered vertices, grouped by the joint that carries them (joint-local)
    const groups = new Map();
    this.root.traverse((o) => {
      const pos = o.isMesh && o.visible && o.geometry.attributes.position;
      if (!pos || pos.usage === THREE.DynamicDrawUsage) return; // skip rebuilt geometry (wing membranes)
      const step = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += step) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        o.localToWorld(p);
        const n = nearest(p);
        if (n.d <= tol) continue;
        if (!groups.has(o.parent)) groups.set(o.parent, []);
        groups.get(o.parent).push({ local: o.parent.worldToLocal(p.clone()), zone: n.s.zone });
      }
    });

    const emit = (joint, pts, depth) => {
      const bb = new THREE.Box3();
      for (const p of pts) bb.expandByPoint(p.local);
      const c = bb.getCenter(new THREE.Vector3()), ext = bb.getSize(new THREE.Vector3());
      let r = 0, inner = Infinity;
      for (const p of pts) {
        const d = p.local.distanceTo(c);
        r = Math.max(r, d);
        inner = Math.min(inner, d);
      }
      const axis = ext.x >= ext.y && ext.x >= ext.z ? 'x' : ext.y >= ext.z ? 'y' : 'z';
      const sorted = [ext.x, ext.y, ext.z].sort((a, b) => b - a);
      const elongated = sorted[0] > sorted[1] * 1.4 + tol;
      // points on opposite sides of a body (a hollow cluster) would give a sphere that bulges out
      const hollow = inner > r * 0.5;
      if (depth < 7 && pts.length > 3 && (((elongated || hollow) && r > tol * 2.5) || r > maxR)) {
        pts.sort((a, b) => a.local[axis] - b.local[axis]);
        const mid = pts.length >> 1;
        emit(joint, pts.slice(0, mid), depth + 1);
        emit(joint, pts.slice(mid), depth + 1);
        return;
      }
      if (pts.length < 2) return;
      const votes = {};
      for (const p of pts) votes[p.zone] = (votes[p.zone] || 0) + 1;
      const zone = Object.keys(votes).reduce((a, b) => (votes[a] >= votes[b] ? a : b));
      // joint-local radius -> unscaled rig radius (hitSpheres multiplies by root scale)
      const k = joint.getWorldScale(_v).x / this.root.getWorldScale(_w).x;
      this.hitZones.push({ zone, joint, offset: c, radius: Math.max(r, tol) * k, auto: true });
    };
    for (const [joint, pts] of groups) emit(joint, pts, 0);
  }

  restX(o) { return this.rest.get(o)?.x ?? 0; }
  restY(o) { return this.rest.get(o)?.y ?? 0; }
  restZ(o) { return this.rest.get(o)?.z ?? 0; }

  /** World-space hit spheres (writes into `out` array of {zone, center, radius}). */
  hitSpheres(out) {
    let i = 0;
    for (const hz of this.hitZones) {
      const s = out[i] || (out[i] = { zone: hz.zone, center: new THREE.Vector3(), radius: 0 });
      s.zone = hz.zone;
      s.joint = hz.joint;
      s.center.copy(hz.offset);
      hz.joint.localToWorld(s.center);
      s.radius = hz.radius * this.root.scale.x;
      i++;
    }
    out.length = i;
    return out;
  }
}

const DEFAULTS = {
  gait: 'quad',
  walkStride: 3,
  runStride: 6,
  runSpeed: 6,           // speed at which the run stride/duty are fully used
  walkDuty: 0.65,
  runDuty: 0.42,
  stepHeight: 0.3,
  bob: 0.08,
  sway: 0.02,
  tailSway: 0.12,
  tailFollow: 0.35,
  neckFollow: 0.25,
  breathe: 0.02,
  blinkEvery: 4,
  headLook: 0.6,
  neckDip: 0.2,          // how far each neck joint bends down for headDown (grazing)
  jawOpen: 0.55,
};

export class DinoAnimator {
  /**
   * @param {Rig} rig
   * @param {object} params species tuning (see DEFAULTS)
   */
  constructor(rig, params = {}) {
    this.rig = rig;
    this.p = { ...DEFAULTS, ...params };
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.amp = 0;            // gait amplitude (0 standing .. 1 walking)
    this.runBlend = 0;
    this.yawRate = 0;
    this.blink = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.dead = 0;
    this.trapped = 0;
    // smoothed pose controls (0..1 unless noted)
    this.c = { neckRaise: 0, headDown: 0, jaw: 0, crouch: 0, attack: 0, alert: 0, lookYaw: 0, lookPitch: 0, charge: 0, tailSwing: 0, roar: 0 };
    this.target = { ...this.c };
    this.idleLookT = 0;
    this.idleLook = 0;
  }

  /**
   * @param {number} dt
   * @param {{speed:number, dist:number, yawRate:number, dead:boolean, trapped:boolean,
   *          pose?:object, groundAt?:(x:number,z:number)=>number, groundPitch?:number}} s
   *   pose: target values for neckRaise, headDown, jaw, crouch, attack, alert, lookYaw, lookPitch, charge, tailSwing, roar
   */
  update(dt, s) {
    const p = this.p;
    const rig = this.rig;
    this.time += dt;

    // ---- blend controls
    const runT = Math.min(1, Math.max(0, (s.speed - p.runSpeed * 0.45) / (p.runSpeed * 0.55)));
    this.runBlend = damp(this.runBlend, runT, 4, dt);
    this.amp = damp(this.amp, s.speed > 0.15 ? 1 : 0, 5, dt);
    this.yawRate = damp(this.yawRate, s.yawRate || 0, 3, dt);
    this.dead = damp(this.dead, s.dead ? 1 : 0, 1.6, dt);
    this.trapped = damp(this.trapped, s.trapped ? 1 : 0, 6, dt);
    Object.assign(this.target, { neckRaise: 0, headDown: 0, jaw: 0, crouch: 0, attack: 0, alert: 0, lookYaw: 0, lookPitch: 0, charge: 0, tailSwing: 0, roar: 0 }, s.pose || {});
    for (const k in this.c) this.c[k] = damp(this.c[k], this.target[k], k === 'attack' || k === 'tailSwing' ? 14 : 5, dt);
    const c = this.c;

    // idle head wander
    this.idleLookT -= dt;
    if (this.idleLookT <= 0) {
      this.idleLookT = 2 + Math.random() * 4;
      this.idleLook = (Math.random() - 0.5) * 0.9 * (1 - this.amp);
    }

    // ---- gait phase: distance based
    const stride = p.walkStride + (p.runStride - p.walkStride) * this.runBlend;
    const duty = p.walkDuty + (p.runDuty - p.walkDuty) * this.runBlend;
    if (!s.dead && !s.trapped) this.phase = (this.phase + (s.dist || 0) / stride) % 1;
    const amp = this.amp * (1 - this.dead) * (1 - this.trapped);
    const L = duty * stride;

    // ---- body
    const scale = rig.root.scale.x || 1;
    const gaitBob = p.gait === 'biped'
      ? Math.cos(this.phase * TAU * 2) * p.bob
      : Math.cos(this.phase * TAU * 2) * p.bob * 0.6;
    const breathe = Math.sin(this.time * (1.6 + this.runBlend * 2)) * p.breathe * (1 + this.runBlend);
    const struggle = this.trapped * Math.sin(this.time * 17) * 0.05;
    rig.body.position.y = rig.bodyRestY + (gaitBob * amp * (1 + this.runBlend * 0.5) - c.crouch * rig.bodyRestY * 0.12 - this.trapped * rig.bodyRestY * 0.1);
    rig.body.rotation.z = rig.restZ(rig.body) + Math.sin(this.phase * TAU) * p.sway * amp + struggle;
    rig.body.rotation.x = rig.restX(rig.body) + (s.groundPitch || 0) + c.charge * 0.12 - c.attack * 0.08 + this.runBlend * amp * 0.05;
    rig.body.rotation.y = -this.yawRate * 0.08;
    if (rig.chest) {
      const b = 1 + breathe;
      rig.chest.scale.set(b, 1 + breathe * 0.6, 1);
    }

    // death roll onto the side
    rig.tilt.rotation.z = this.dead * Math.PI * 0.46;
    rig.tilt.position.y = -this.dead * rig.bodyRestY * 0.35;

    // ---- legs
    rig.root.updateMatrixWorld(true);
    for (const leg of rig.legs) this.#leg(leg, amp, L, duty, s, scale);

    // ---- tail: follow-through + sway
    const n = rig.tail.length;
    for (let i = 0; i < n; i++) {
      const j = rig.tail[i];
      const k = (i + 1) / n;
      const wave = Math.sin(this.time * (1.3 + amp * 1.5) - i * 0.55) * p.tailSway * (0.4 + amp * 0.6);
      j.rotation.y = rig.restY(j) + (-this.yawRate * p.tailFollow * k + wave * k) * (1 - this.dead * 0.8)
        + c.tailSwing * 0.45 * Math.sin(k * 1.2);
      j.rotation.x = rig.restX(j) + Math.sin(this.phase * TAU * 2 - i * 0.5) * 0.025 * amp + this.dead * 0.04 - c.tailSwing * 0.02;
    }

    // ---- neck + head
    const nn = rig.neck.length;
    const look = (c.lookYaw + this.idleLook + this.yawRate * p.neckFollow) * p.headLook;
    for (let i = 0; i < nn; i++) {
      const j = rig.neck[i];
      const k = (i + 1) / nn;
      j.rotation.y = rig.restY(j) + look / Math.max(1, nn) * (0.6 + k);
      j.rotation.x = rig.restX(j)
        + c.neckRaise * 0.14
        - c.headDown * p.neckDip
        - c.charge * 0.1
        + c.roar * 0.12
        + gaitBob * amp * 0.6           // counter the body bob a little
        - this.dead * 0.12;
    }
    if (rig.head) {
      rig.head.rotation.x = rig.restX(rig.head) + c.lookPitch * 0.5 - c.headDown * 0.35 + c.alert * 0.15 + c.roar * 0.35
        + Math.sin(this.time * 0.9) * 0.03 * (1 - amp) - c.attack * 0.25;
      rig.head.rotation.z = rig.restZ(rig.head) + Math.sin(this.time * 0.6) * 0.04 * (1 - amp) + this.trapped * Math.sin(this.time * 13) * 0.15;
    }
    if (rig.jaw) {
      const chew = c.headDown > 0.5 ? (Math.sin(this.time * 6) * 0.5 + 0.5) * 0.25 : 0;
      rig.jaw.rotation.x = rig.restX(rig.jaw) - (Math.max(c.jaw, chew) * p.jawOpen + this.dead * 0.25);
    }
    for (const a of rig.arms) {
      a.rotation.x = rig.restX(a) + Math.sin(this.phase * TAU + (a.userData.side || 0)) * 0.15 * amp + c.attack * 0.5 + this.trapped * Math.sin(this.time * 15) * 0.4;
    }

    // ---- blink
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = p.blinkEvery * (0.5 + Math.random());
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const lid = s.dead ? 1 : Math.max(0.12, this.blink > 0.5 ? (1 - this.blink) * 2 : this.blink * 2);
    for (const e of rig.eyelids) e.scale.y = lid;
  }

  #leg(leg, amp, L, duty, s, scale) {
    const rig = this.rig;
    const ph = (this.phase + leg.offset) % 1;
    let fwd, lift;
    if (ph < duty) {
      const t = ph / duty;
      fwd = L * (0.5 - t);
      lift = 0;
    } else {
      const t = (ph - duty) / (1 - duty);
      fwd = L * (-0.5 + smooth01(t));
      lift = Math.sin(Math.PI * t) * this.p.stepHeight * (0.7 + this.runBlend * 0.6);
    }
    fwd *= amp;
    lift *= amp;
    if (this.trapped > 0.01 && !leg.front) lift += this.trapped * (Math.sin(this.time * 14 + leg.offset * 9) * 0.5 + 0.5) * this.p.stepHeight * 0.6;

    // foot target in root space (the root sits on the ground at the dino's centre)
    const tx = leg.restX, tz = leg.restZ - fwd / scale;
    let ty = (lift + (leg.footH || 0)) / scale;
    if (s.groundAt && this.dead < 0.5) {
      _w.set(tx, 0, tz);
      rig.root.localToWorld(_w);
      const g = s.groundAt(_w.x, _w.z);
      ty += (g - rig.root.position.y) / scale;
    }
    // hip position in root space
    leg.hip.getWorldPosition(_v);
    rig.root.worldToLocal(_v);
    // vector hip -> target, expressed in the hip's parent frame
    _w.set(tx - _v.x, ty - _v.y, tz - _v.z);
    leg.hip.parent.getWorldQuaternion(_q);
    rig.root.getWorldQuaternion(_qr);
    _q.premultiply(_qr.invert()).invert();
    _w.applyQuaternion(_q);

    let forward = -_w.z, down = -_w.y;
    const l1 = leg.l1, l2 = leg.l2;
    let metaRot = 0;
    if (leg.ankle && leg.l3) {
      // aim the knee chain at the ankle: behind + above the foot
      const phi = leg.metaAngle ?? 0.5;
      forward += Math.sin(phi) * leg.l3 * -1;
      down -= Math.cos(phi) * leg.l3;
      metaRot = phi;
    }
    let d = Math.hypot(forward, down);
    d = Math.min(d, (l1 + l2) * 0.999);
    d = Math.max(d, Math.abs(l1 - l2) + 0.001);
    const a = Math.atan2(forward, down);
    const alpha = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const beta = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    const thigh = a + leg.kneeDir * alpha;
    const knee = -leg.kneeDir * (Math.PI - beta);
    leg.hip.rotation.x = thigh;
    leg.knee.rotation.x = knee;
    let sum = thigh + knee;
    if (leg.ankle) {
      leg.ankle.rotation.x = metaRot - sum;
      sum = metaRot;
    }
    if (leg.foot) {
      // keep the foot flat, roll the toes a little during the swing
      leg.foot.rotation.x = -sum - (lift > 0.01 ? Math.min(0.5, lift * 1.5) : 0);
    }
  }
}
