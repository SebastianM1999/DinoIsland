// Pteranodon: teal/turquoise membrane wings (lighter underside), cream body,
// backswept red-orange crest, long pointed beak, a visible finger bone along
// the wing's leading edge with small clawed fingers at the wrist, short hind
// legs. Walks on its hind legs with folded wings; the wings are animated by
// pteraExtraUpdate (flap / glide / dive / folded / limp) since the shared
// animator has no wing support. Same structure as brachio.js.

import * as THREE from 'three';
import { place, part, merge, mesh, tube, blob, spike, deform } from '../kit.js';
import { Rig } from './rig.js';
import { countershade, chain, sideEyes, claw, birdFoot, V } from './parts.js';
import { DS } from '../../../shared/protocol.js';

const COL = {
  main: '#f3e4c0',
  back: '#2fa3a2',
  belly: '#fbf1d8',
  teal: '#24a8aa',
  tealDark: '#157c85',
  tealLight: '#45c3bb',
  bone: '#10606b',
  under: '#c4ebdf',
  underCream: '#eef0d6',
  crest: '#ec5b2c',
  crestTip: '#b3341c',
  beak: '#f2c350',
  beakTip: '#b07c2c',
  leg: '#e6cf9e',
  claw: '#3a2c2a',
};

/** Pitch of the body on the ground (chest up); flight levels it out. */
const GROUND_PITCH = 0.5;

export const PTERA_ANIM = {
  gait: 'biped',
  walkSpeed: 1.2,
  walkStride: 0.85,
  runStride: 1.5,
  runSpeed: 3,
  walkDuty: 0.6,
  runDuty: 0.45,
  stepHeight: 0.1,
  bob: 0.035,
  sway: 0.06,
  tailSway: 0.1,
  tailFollow: 0.3,
  neckFollow: 0.3,
  breathe: 0.02,
  headLook: 0.7,
  neckDip: 0.3,
  jawOpen: 0.45,
  blinkEvery: 3.5,
};

// Wing joint lengths (right wing, pointing +X in the wing-base frame).
const HUM = 0.5, FORE = 0.8, FIN1 = 0.95, FIN2 = 0.92;

const MAT_TOP = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: THREE.FrontSide });
const MAT_BOT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: THREE.BackSide });

const wingColor = (t, a) => (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) > 1.9 ? COL.under : COL.teal);

/** One wing (built pointing +X; the left one is mirrored by its base group). */
function buildWing(body, side) {
  const base = new THREE.Group();
  base.position.set(side * 0.15, 0.1, -0.24);
  if (side < 0) base.scale.x = -1;
  body.add(base);

  const S = new THREE.Group();
  S.rotation.order = 'ZYX';
  base.add(S);
  S.add(mesh(merge([
    tube([V(-0.06, 0, 0), V(HUM * 0.5, 0.01, 0.01), V(HUM + 0.04, 0, 0)], (t) => [0.075 - t * 0.02, 0.065 - t * 0.02], { radial: 7, up: V(0, 1, 0), color: wingColor }),
    part(blob(0.11, 0.09, 0.12, COL.back, { w: 7, h: 5 }), [0.02, 0.02, 0.02]),
  ])));

  const E = new THREE.Group();
  E.rotation.order = 'ZYX';
  E.position.x = HUM;
  S.add(E);
  E.add(mesh(merge([
    tube([V(-0.03, 0, 0), V(FORE * 0.5, 0, 0), V(FORE + 0.02, 0, 0)], (t) => [0.055 - t * 0.012, 0.05 - t * 0.012], { radial: 7, color: wingColor }),
    part(blob(0.06, 0.055, 0.06, COL.tealDark, { w: 6, h: 4 }), [0, 0, 0]),
  ])));

  // wrist + the long wing finger
  const W = new THREE.Group();
  W.rotation.order = 'ZYX';
  W.position.x = FORE;
  E.add(W);
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const f = tube([V(0, 0, 0), V(0.02, -0.01, -0.06), V(0.03, -0.02, -0.11)], (t) => 0.018 * (1 - t * 0.5), { radial: 5, color: () => COL.main });
    const c = place(claw(0.055, 0.014, '#e8dcc0', COL.claw), [0.03, -0.02, -0.11], [0, 0, 0]);
    fingers.push(place(merge([f, c]), [0.02, 0.01 - i * 0.02, -0.02], [0, -0.35 + i * 0.35, 0]));
  }
  W.add(mesh(merge([
    part(blob(0.065, 0.055, 0.07, COL.tealDark, { w: 7, h: 5 }), [0, 0, 0]),
    tube([V(0, 0.005, 0), V(FIN1 * 0.5, 0.012, 0.005), V(FIN1 + 0.02, 0.008, 0)], (t) => [0.04 - t * 0.01, 0.036 - t * 0.008], { radial: 6, color: () => COL.bone }),
    part(blob(0.035, 0.03, 0.035, COL.main), [FIN1, 0.008, 0]),
    ...fingers,
  ])));

  const F = new THREE.Group();
  F.rotation.order = 'ZYX';
  F.position.x = FIN1;
  W.add(F);
  F.add(mesh(tube([V(0, 0.008, 0), V(FIN2 * 0.55, 0.01, 0.01), V(FIN2, 0.004, 0.035)], (t) => [0.03 - t * 0.024, 0.028 - t * 0.022], { radial: 6, color: () => COL.bone })));

  // membrane anchor points: [joint, local offset] along the leading and trailing edges
  const L = [[S, V(0, 0, 0)], [E, V(0, 0, 0)], [W, V(0, 0, 0)], [F, V(0, 0, 0)], [F, V(FIN2, 0, 0.035)]];
  const T = [[base, V(0.02, -0.05, 0.5)], [S, V(0.4, 0, 0.62)], [E, V(0.6, 0, 0.6)], [W, V(0.65, 0, 0.42)], [F, V(0.62, 0, 0.18)]];
  // triangles per span: leading strip + scalloped trailing strip (5 tris), mid row M, scallop C
  const nSpan = 4;
  const triCount = nSpan * 5;
  const pos = new THREE.BufferAttribute(new Float32Array(triCount * 9), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const mkGeo = (colFn) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos);
    const col = new Float32Array(triCount * 9);
    const c = new THREE.Color();
    for (let s = 0; s < nSpan; s++) {
      for (let k = 0; k < 5; k++) {
        c.set(colFn(s, k));
        for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], ((s * 5 + k) * 3 + v) * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.5, 0, 0.3), 3.5);
    return g;
  };
  // top: darker teal toward the leading edge, lighter band near the trailing edge
  const top = new THREE.Mesh(mkGeo((s, k) => (k < 2 ? (s === 0 ? COL.teal : COL.tealDark) : (k === 2 ? COL.tealLight : COL.teal))), MAT_TOP);
  const bot = new THREE.Mesh(mkGeo((s, k) => (k < 2 ? COL.under : COL.underCream)), MAT_BOT);
  for (const m of [top, bot]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    base.add(m);
  }
  return { base, joints: [S, E, W, F], L, T, pos, top, bot, side };
}

const _a = new THREE.Vector3(), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
const _L = Array.from({ length: 5 }, () => new THREE.Vector3());
const _T = Array.from({ length: 5 }, () => new THREE.Vector3());
const _M = Array.from({ length: 5 }, () => new THREE.Vector3());
const _C = new THREE.Vector3(), _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();

/** Rebuild one membrane from the current joint transforms (matrixWorld must be current). */
function updateMembrane(w) {
  _inv.copy(w.base.matrixWorld).invert();
  const toBase = (pair, out) => {
    _m.multiplyMatrices(_inv, pair[0].matrixWorld);
    return out.copy(pair[1]).applyMatrix4(_m);
  };
  for (let i = 0; i < 5; i++) {
    toBase(w.L[i], _L[i]);
    toBase(w.T[i], _T[i]);
  }
  // mid row with a slight billow below the surface
  for (let i = 0; i < 5; i++) {
    const i2 = Math.min(4, i + 1), i1 = i2 - 1;
    _e1.subVectors(_L[i2], _L[i1]);
    _e2.subVectors(_T[i], _L[i]);
    _n.crossVectors(_e2, _e1);
    const len = _n.length();
    if (len > 1e-6) _n.multiplyScalar(1 / len); else _n.set(0, 1, 0);
    _M[i].lerpVectors(_L[i], _T[i], 0.45).addScaledVector(_n, -0.035 * Math.min(1, _e2.length()));
  }
  const a = w.pos.array;
  let o = 0;
  const tri = (p, q, r) => {
    a[o++] = p.x; a[o++] = p.y; a[o++] = p.z;
    a[o++] = q.x; a[o++] = q.y; a[o++] = q.z;
    a[o++] = r.x; a[o++] = r.y; a[o++] = r.z;
  };
  for (let i = 0; i < 4; i++) {
    const L0 = _L[i], L1 = _L[i + 1], M0 = _M[i], M1 = _M[i + 1], T0 = _T[i], T1 = _T[i + 1];
    // scallop: trailing edge between the anchors curves in toward the bones
    _C.lerpVectors(T0, T1, 0.5).lerp(_a.lerpVectors(M0, M1, 0.5), 0.22);
    // wound so the front face is the top of the wing
    tri(L0, M1, L1);
    tri(L0, M0, M1);
    tri(M0, _C, M1);
    tri(M0, T0, _C);
    tri(M1, _C, T1);
  }
  w.pos.needsUpdate = true;
}

export function buildPtera() {
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, 0.68, 0);
  body.rotation.x = GROUND_PITCH;

  // ---- torso: small, deep chest, cream with a teal saddle
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;
  const bodyColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.2, backTo: 0.55 });
  const torso = tube([V(0, 0.0, 0.52), V(0, 0.0, 0.26), V(0, 0.02, -0.08), V(0, 0.05, -0.36)], (t) => {
    const r = t < 0.35 ? 0.07 + t * 0.34 : t < 0.75 ? 0.19 + (t - 0.35) * 0.08 : 0.222 - (t - 0.75) * 0.3;
    return [r * 0.95, r * 1.08];
  }, { radial: 10, color: bodyColor });
  const keel = part(blob(0.13, 0.12, 0.16, COL.belly, { w: 8, h: 5 }), [0, -0.1, -0.22]);
  chest.add(mesh(merge([torso, keel])));

  // ---- legs (short, bird-like feet)
  const mkLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, -0.08, 0.22);
    body.add(hip);
    const l1 = 0.27, l2 = 0.27;
    hip.add(mesh(merge([
      tube([V(0, 0.05, 0), V(0, -l1 * 0.5, 0), V(0, -l1 - 0.02, 0)], (t) => [0.065 - t * 0.025, 0.07 - t * 0.025], { radial: 7, up: V(0, 0, -1), color: () => COL.main }),
    ])));
    const knee = new THREE.Group();
    knee.position.y = -l1;
    hip.add(knee);
    knee.add(mesh(tube([V(0, 0.02, 0), V(0, -l2 * 0.5, 0), V(0, -l2, 0)], (t) => 0.035 - t * 0.01, { radial: 6, up: V(0, 0, -1), color: () => COL.leg })));
    const foot = new THREE.Group();
    foot.position.y = -l2;
    knee.add(foot);
    foot.add(mesh(birdFoot(0.13, 0.026, COL.leg, COL.claw)));
    return { hip, knee, foot, l1, l2, footH: 0.02, kneeDir: 1, front: false };
  };
  const LL = mkLeg(-0.11), RL = mkLeg(0.11);
  LL.offset = 0; RL.offset = 0.5;
  rig.legs.push(LL, RL);

  // ---- short tail stub
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.0, 0.5);
  body.add(tailBase);
  rig.tail = chain(tailBase, [
    { len: 0.14, r0: 0.06, r1: 0.035 },
    { len: 0.12, r0: 0.035, r1: 0.01 },
  ], { dir: 'back', color: countershade({ main: COL.main, back: COL.back, belly: COL.belly }), radial: 6, capFirst: false });

  // ---- neck
  const neckBase = new THREE.Group();
  neckBase.position.set(0, 0.08, -0.33);
  body.add(neckBase);
  const neckSegs = [
    { len: 0.2, r0: [0.1, 0.11], r1: [0.075, 0.08], rx: 0.35 },
    { len: 0.18, r0: [0.075, 0.08], r1: [0.06, 0.065], rx: 0.1 },
  ];
  rig.neck = chain(neckBase, neckSegs, { dir: 'fwd', color: countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 1.8, backTo: 0.5 }), radial: 8, capFirst: false });

  // ---- head: long pointed beak, backswept crest
  const head = new THREE.Group();
  head.position.set(0, 0, -neckSegs[1].len);
  head.rotation.x = -0.95;
  rig.neck[1].add(head);
  rig.head = head;
  const headColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.0, backTo: 0.7 });
  const skull = tube([V(0, 0.0, 0.12), V(0, 0.03, -0.02), V(0, 0.02, -0.14)], (t) => [0.085 - t * 0.02, 0.1 - t * 0.02], { radial: 8, color: headColor });
  const upperBeak = tube([V(0, 0.02, -0.1), V(0, 0.0, -0.36), V(0, -0.03, -0.62), V(0, -0.06, -0.8)], (t) => [0.06 * (1 - t) + 0.004, 0.055 * (1 - t) + 0.004], {
    radial: 6, color: (t) => (t > 0.8 ? COL.beakTip : COL.beak),
  });
  const crest = tube([V(0, 0.07, 0.02), V(0, 0.14, 0.2), V(0, 0.22, 0.4), V(0, 0.3, 0.56)], (t) => [0.03 - t * 0.022, 0.085 - t * 0.07], {
    radial: 6, color: (t) => (t > 0.7 ? COL.crestTip : COL.crest),
  });
  const crestBase = part(blob(0.06, 0.06, 0.1, COL.crest, { w: 6, h: 4 }), [0, 0.08, 0.02]);
  const nostrils = merge([
    part(blob(0.012, 0.01, 0.03, '#3a2a1a'), [-0.035, 0.03, -0.3]),
    part(blob(0.012, 0.01, 0.03, '#3a2a1a'), [0.035, 0.03, -0.3]),
  ]);
  const cheeks = merge([
    part(blob(0.04, 0.035, 0.06, COL.main), [-0.07, -0.04, -0.02]),
    part(blob(0.04, 0.035, 0.06, COL.main), [0.07, -0.04, -0.02]),
  ]);
  head.add(mesh(merge([skull, upperBeak, crest, crestBase, nostrils, cheeks])));
  rig.eyelids.push(sideEyes(head, { x: 0.075, y: 0.035, z: 0.0, size: 0.04, iris: '#e3a21c', lid: COL.back, yaw: 0.3 }));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.045, 0.02);
  head.add(jaw);
  rig.jaw = jaw;
  jaw.add(mesh(tube([V(0, 0, 0.04), V(0, -0.02, -0.2), V(0, -0.03, -0.5), V(0, -0.035, -0.7)], (t) => [0.05 * (1 - t) + 0.004, 0.028 * (1 - t) + 0.004], {
    radial: 6, color: (t) => (t > 0.8 ? COL.beakTip : COL.beak),
  })));

  // ---- wings
  const right = buildWing(body, 1);
  const left = buildWing(body, -1);
  rig.wings = { left: left.joints, right: right.joints, sides: [left, right] };

  // ---- hit zones
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.03, -0.05), radius: 0.17 });
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, -0.02, -0.42), radius: 0.12 });
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.18, 0.32), radius: 0.12 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.02, -0.05), radius: 0.3 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.0, 0.32), radius: 0.2 });
  rig.hitZones.push({ zone: 'body', joint: rig.neck[0], offset: V(0, 0, -0.15), radius: 0.14 });
  for (const w of [left, right]) {
    const [S, E, Wr, F] = w.joints;
    rig.hitZones.push({ zone: 'wing', joint: S, offset: V(0.28, 0, 0.26), radius: 0.3 });
    rig.hitZones.push({ zone: 'wing', joint: E, offset: V(0.4, 0, 0.28), radius: 0.34 });
    rig.hitZones.push({ zone: 'wing', joint: Wr, offset: V(0.3, 0, 0.24), radius: 0.3 });
    rig.hitZones.push({ zone: 'wing', joint: Wr, offset: V(0.75, 0, 0.16), radius: 0.24 });
    rig.hitZones.push({ zone: 'wing', joint: F, offset: V(0.35, 0, 0.1), radius: 0.2 });
    rig.hitZones.push({ zone: 'wing', joint: F, offset: V(0.72, 0, 0.04), radius: 0.14 });
  }

  // start folded
  const pose = new Float32Array(12);
  foldedPose(pose, 0);
  applyWingPose(rig, pose, pose);
  rig.finalize();
  for (const w of rig.wings.sides) updateMembrane(w);
  return rig;
}

// ---------------------------------------------------------------------------
// Wing poses: 4 joints (shoulder, elbow, wrist/finger, finger tip) × [x, y, z]
// in the joint's local ZYX Euler (z: raise, y: sweep forward(+)/back(-), x: twist).

function setJ(p, j, x, y, z) { p[j * 3] = x; p[j * 3 + 1] = y; p[j * 3 + 2] = z; }

function foldedPose(p, t) {
  setJ(p, 0, -0.2, -1.2, 0.55);
  setJ(p, 1, 0.1, 2.55, -0.35);
  setJ(p, 2, -0.1, -2.75, 0.2);
  setJ(p, 3, 0, -0.08, 0.02 + Math.sin(t * 1.1) * 0.01);
}

function glidePose(p, t) {
  const s = Math.sin(t * 1.3) * 0.03;
  setJ(p, 0, -0.04, 0.12, 0.07 + s);
  setJ(p, 1, 0, -0.06, 0.03);
  setJ(p, 2, 0, -0.14, 0.05 - s * 0.5);
  setJ(p, 3, 0, -0.06, 0.1 + s * 0.8);
}

function flapPose(p, ph) {
  const up = Math.max(0, Math.cos(ph));   // upstroke: fold the wing a little
  setJ(p, 0, -0.12 * Math.cos(ph), 0.12 - up * 0.1, 0.12 + 0.62 * Math.sin(ph));
  setJ(p, 1, 0, -0.06 + up * 0.3, 0.2 * Math.sin(ph - 0.7));
  setJ(p, 2, 0, -0.14 - up * 0.55, 0.26 * Math.sin(ph - 1.3));
  setJ(p, 3, 0, -0.06 - up * 0.1, 0.1 + 0.22 * Math.sin(ph - 1.9));
}

function divePose(p, t) {
  const f = Math.sin(t * 23) * 0.025;
  setJ(p, 0, -0.1, -0.75, 0.22 + f);
  setJ(p, 1, 0, 0.95, -0.1);
  setJ(p, 2, 0, -1.95, 0.1 + f);
  setJ(p, 3, 0, -0.1, 0.05);
}

function limpPose(p) {
  setJ(p, 0, 0.1, -0.25, -0.3);
  setJ(p, 1, 0, 0.35, -0.12);
  setJ(p, 2, 0.05, -0.75, -0.12);
  setJ(p, 3, 0, -0.1, -0.08);
}

function applyWingPose(rig, pl, pr) {
  const { left, right } = rig.wings;
  for (let j = 0; j < 4; j++) {
    left[j].rotation.set(pl[j * 3], pl[j * 3 + 1], pl[j * 3 + 2]);
    right[j].rotation.set(pr[j * 3], pr[j * 3 + 1], pr[j * 3 + 2]);
  }
}

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const _pf = new Float32Array(12), _pg = new Float32Array(12), _pd = new Float32Array(12), _pl = new Float32Array(12), _pfl = new Float32Array(12);
const LEG_AIR = [-1.3, 0.35, 0.9];   // hip, knee, foot: legs trail backward in flight

/**
 * Per-frame wing + flight posture. Call after the DinoAnimator update.
 * Uses view.st (DS), view.pos (y for climb/descent), view.anim, view.rig.
 */
export function pteraExtraUpdate(view, dt) {
  const rig = view.rig;
  const anim = view.anim;
  dt = Math.min(Math.max(dt, 0), 0.1);
  let s = view._wing;
  if (!s) {
    s = view._wing = {
      t: Math.random() * 10, ph: 0, vy: 0, lastY: view.pos.y,
      fly: 0, dive: 0, fold: 1, dead: 0, flap: 1, cycleT: 0, struggle: 0, display: 0,
      cur: new Float32Array(12), curL: new Float32Array(12), init: false,
    };
  }
  s.t += dt;
  const st = view.st;

  // vertical speed (server moves the root in 3D)
  if (dt > 0) s.vy = damp(s.vy, (view.pos.y - s.lastY) / dt, 4, dt);
  s.lastY = view.pos.y;

  // airborne? flight states, or clearly above the terrain (e.g. attacking mid-air)
  let airborne = st === DS.FLY || st === DS.DIVE;
  const terrain = view.ctx?.terrain;
  if (!airborne && terrain && st !== DS.DEAD && st !== DS.TRAPPED) {
    airborne = view.pos.y - terrain.heightAt(view.pos.x, view.pos.z) > 1.5;
  }
  const dead = st === DS.DEAD;
  const tDive = !dead && st === DS.DIVE ? 1 : 0;
  const tFly = !dead && airborne && !tDive ? 1 : 0;
  const tDead = dead ? 1 : 0;
  s.fly = damp(s.fly, tFly, 3.5, dt);
  s.dive = damp(s.dive, tDive, 4.5, dt);
  s.dead = damp(s.dead, tDead, 2.2, dt);
  s.fold = damp(s.fold, 1 - tFly - tDive - tDead, 3.5, dt);
  s.struggle = damp(s.struggle, st === DS.TRAPPED ? 1 : 0, 5, dt);
  s.display = damp(s.display, !airborne && !dead && anim && (anim.c.attack > 0.3 || anim.c.roar > 0.3 || st === DS.ALERT) ? 1 : 0, 5, dt);

  // flap vs glide: flap while climbing, glide while sinking, else alternate
  s.cycleT += dt;
  const cyc = s.cycleT % 5.2;
  let flapT = cyc < 2.6 ? 1 : 0;   // ~4 beats, then a glide
  if (s.vy > 0.4) flapT = 1;
  else if (s.vy < -0.9) flapT = 0;
  s.flap = damp(s.flap, flapT, 1.8, dt);
  s.ph += dt * Math.PI * 2 * (1.55 + 0.25 * s.flap);

  // ---- target wing pose = weighted blend of the pose library
  flapPose(_pf, s.ph);
  glidePose(_pg, s.t);
  divePose(_pd, s.t);
  limpPose(_pl);
  foldedPose(_pfl, s.t);
  const wsum = s.fly + s.dive + s.fold + s.dead || 1;
  const wf = s.fly / wsum, wd = s.dive / wsum, wo = s.fold / wsum, wx = s.dead / wsum;
  const cur = s.cur;
  for (let i = 0; i < 12; i++) {
    const air = _pf[i] * s.flap + _pg[i] * (1 - s.flap);
    let ground = _pfl[i];
    // half-open threat display / trapped flailing on the ground
    const open = Math.max(s.display * 0.55, s.struggle * (0.45 + 0.35 * Math.sin(s.t * 11)));
    ground += (_pg[i] - ground) * open;
    cur[i] = air * wf + _pd[i] * wd + ground * wo + _pl[i] * wx;
  }
  if (s.struggle > 0.01) cur[2] += s.struggle * Math.sin(s.t * 14) * 0.35;
  const curL = s.curL;
  curL.set(cur);
  // trapped: wings flail out of sync
  if (s.struggle > 0.01) curL[2] += s.struggle * Math.sin(s.t * 14 + 1.7) * 0.35 - s.struggle * Math.sin(s.t * 14) * 0.35;
  applyWingPose(rig, curL, cur);

  // ---- flight posture: level body, legs tucked back, bank into turns
  const air = Math.min(1, s.fly + s.dive);
  if (air > 0.001) {
    const flapBob = -Math.sin(s.ph) * 0.07 * s.flap * s.fly;
    rig.body.position.y += ((rig.bodyRestY + flapBob) - rig.body.position.y) * air;
    const climb = Math.max(-0.35, Math.min(0.35, s.vy * 0.05)) * s.fly;
    rig.body.rotation.x += -GROUND_PITCH * air + climb - 0.55 * s.dive;
    const bank = Math.max(-0.6, Math.min(0.6, (anim?.yawRate || 0) * 0.35));
    rig.body.rotation.z += (bank - rig.body.rotation.z) * air;
    // neck stretches forward, head stays level
    rig.neck[0].rotation.x -= 0.2 * air;
    rig.head.rotation.x += 0.55 * air - 0.2 * s.dive;
    for (const leg of rig.legs) {
      leg.hip.rotation.x += (LEG_AIR[0] - leg.hip.rotation.x) * air;
      leg.knee.rotation.x += (LEG_AIR[1] - leg.knee.rotation.x) * air;
      leg.foot.rotation.x += (LEG_AIR[2] - leg.foot.rotation.x) * air;
    }
    for (const j of rig.tail) j.rotation.y *= 1 - air * 0.7;
  }
  // dead: lie mostly on the belly with the wings spread instead of rolling over
  if (s.dead > 0.001) {
    rig.tilt.rotation.z *= 1 - 0.75 * s.dead;
    rig.body.rotation.x -= GROUND_PITCH * 0.9 * s.dead;
    rig.tilt.position.y -= 0.12 * s.dead;
  }

  rig.root.updateMatrixWorld(true);
  for (const w of rig.wings.sides) updateMembrane(w);
}
