import { retainResource } from '../../core/resources.js';
// Pteranodon: teal/turquoise membrane wings (lighter underside), cream body,
// backswept red-orange crest, long pointed beak, short hind legs. Walks on its
// hind legs with folded wings; the wings are animated by pteraExtraUpdate
// (flap / glide / dive / landing flare / folded / limp) since the shared
// animator has no wing support.
//
// The soft body (head-neck-torso-tail, both legs, both wing arms) is ONE set of
// smooth lofts bound to the joints as a SkinnedMesh (see skin.js), so the neck,
// shoulders, elbows and knees bend like flesh. Only the rigid anatomy (skull,
// beak, jaw, eyes, feet, wrist claws) stays as normal meshes on its joint. The
// wing membrane is still a separate dynamic mesh rebuilt every frame from the
// posed arm; its leading edge runs along the bone centre line (inside the skinned
// arm) and its inner edge is buried in the torso, so no gap can show.

import * as THREE from 'three';
import { place, merge, mesh, blob } from '../kit.js';
import { Rig } from './rig.js';
import { SkinBuilder, loft, restPoint } from './skin.js';
import { talon } from './theropod.js';
import { countershade, sideEyes, birdFoot, tube, V } from './parts.js';
import { DS } from '../../../shared/protocol.js';
import { paintSkinDetails } from './skinStyle.js';

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

// Smooth-shaded membrane (normals are recomputed every frame from the posed wing).
const MAT_TOP = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.FrontSide, shadowSide: THREE.DoubleSide });
const MAT_BOT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.BackSide });

retainResource(MAT_TOP); retainResource(MAT_BOT);

// Membrane grid: SUB columns per bone span (4 spans) × ROWS rows from the leading to the trailing edge.
const SUB = 6, ROWS = 7;
const COLS = 4 * SUB + 1;

/** One wing (built pointing +X; the left one is mirrored by its base group). The arm itself is skinned later. */
function buildWing(body, side) {
  const base = new THREE.Group();
  base.position.set(side * 0.15, 0.1, -0.24);
  if (side < 0) base.scale.x = -1;
  body.add(base);

  const S = new THREE.Group();
  S.rotation.order = 'ZYX';
  base.add(S);
  const E = new THREE.Group();
  E.rotation.order = 'ZYX';
  E.position.x = HUM;
  S.add(E);
  // wrist + the long wing finger
  const W = new THREE.Group();
  W.rotation.order = 'ZYX';
  W.position.x = FORE;
  E.add(W);
  const F = new THREE.Group();
  F.rotation.order = 'ZYX';
  F.position.x = FIN1;
  W.add(F);

  // wrist knob and the three small clawed fingers (rigid, they stick out of the skin)
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const f = tube([V(0, 0, 0), V(0.008, -0.004, -0.05), V(0.016, -0.012, -0.095)], (t) => 0.017 * (1 - t * 0.45), { radial: 5, color: () => COL.main });
    const c = place(talon(0.06, 0.013, '#efe4cc', COL.claw), [0.016, -0.012, -0.095]);
    fingers.push(place(merge([f, c]), [0.0, 0.0 - i * 0.012, -0.03], [0, -0.42 + i * 0.42, 0]));
  }
  W.add(mesh(merge([place(blob(0.056, 0.05, 0.06, COL.tealDark, { w: 8, h: 6 }), [0, 0, -0.012]), ...fingers])));

  // membrane anchor points: [joint, local offset] along the leading and trailing edges
  const L = [[S, V(0, 0, 0)], [E, V(0, 0, 0)], [W, V(0, 0, 0)], [F, V(0, 0, 0)], [F, V(FIN2, 0, 0.035)]];
  const T = [[base, V(-0.12, -0.07, 0.46)], [S, V(0.4, 0, 0.62)], [E, V(0.6, 0, 0.6)], [W, V(0.65, 0, 0.42)], [F, V(0.62, 0, 0.18)]];
  // smooth, subdivided membrane: shared position + normal buffers, rebuilt per frame
  const nv = COLS * (ROWS + 1);
  const pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const nrm = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
  nrm.setUsage(THREE.DynamicDrawUsage);
  const idx = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i, b = a + 1, c = a + COLS, d = c + 1;
      // wound so the front face is the top of the wing
      idx.push(a, d, b, a, c, d);
    }
  }
  const index = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  const mkGeo = (colFn) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nrm);
    g.setIndex(index);
    const col = new Float32Array(nv * 3);
    const c = new THREE.Color();
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        colFn(i / (COLS - 1), j / ROWS, c);
        col.set([c.r, c.g, c.b], (j * COLS + i) * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.5, 0, 0.3), 3.5);
    return g;
  };
  const cTeal = new THREE.Color(COL.teal), cDark = new THREE.Color(COL.tealDark), cLight = new THREE.Color(COL.tealLight);
  const cUnder = new THREE.Color(COL.under), cUnderCream = new THREE.Color(COL.underCream);
  const sm = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  // top: darker teal along the bones, lighter band toward the trailing edge, soft gradients
  const top = new THREE.Mesh(mkGeo((u, v, c) => {
    c.copy(cDark).lerp(cTeal, sm(0.0, 0.35, v) * 0.85 + sm(0, 0.3, 1 - u) * 0.15);
    c.lerp(cLight, sm(0.45, 0.8, v) * (1 - sm(0.9, 1.0, v) * 0.5));
    // Clear finger rays and mottled bands remain attached to the membrane grid.
    c.lerp(cDark, Math.pow(Math.max(0, Math.cos(u * Math.PI * 8)), 8) * v * .5);
    c.lerp(cUnderCream, sm(.82, .96, v) * .65);
    c.multiplyScalar(.93 + .07 * Math.sin(u * 37 + v * 9));
  }), MAT_TOP);
  const bot = new THREE.Mesh(mkGeo((u, v, c) => { c.copy(cUnder).lerp(cUnderCream, sm(0.3, 0.85, v)); }), MAT_BOT);
  // The two sides are coincident: only the top casts (both faces, see MAT_TOP.shadowSide) and
  // neither receives, so the thin membrane never shadows itself (no acne).
  for (const m of [top, bot]) {
    m.castShadow = m === top;
    m.receiveShadow = false;
    m.frustumCulled = false;
    base.add(m);
  }
  return { base, joints: [S, E, W, F], L, T, pos, top, bot, side };
}

const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
const _L = Array.from({ length: 5 }, () => new THREE.Vector3());
const _T = Array.from({ length: 5 }, () => new THREE.Vector3());
const _lead = Array.from({ length: COLS }, () => new THREE.Vector3());
const _trail = Array.from({ length: COLS }, () => new THREE.Vector3());
const _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3();
const _trailCurve = new THREE.CatmullRomCurve3(_T, false, 'centripetal');

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
  for (let i = 0; i < COLS; i++) {
    const span = Math.min(3, Math.floor(i / SUB)), f = i / SUB - span;
    // leading edge follows the (straight) bones exactly
    _lead[i].lerpVectors(_L[span], _L[span + 1], f);
    // trailing edge: smooth curve through the anchors, scalloped in between them
    const sf = span + f;
    _trailCurve.getPoint(sf / 4, _trail[i]);
    _trail[i].lerp(_lead[i], 0.2 * Math.sin(Math.PI * f));
  }
  const a = w.pos.array;
  for (let i = 0; i < COLS; i++) {
    // billow direction: below the local wing plane
    const i0 = Math.max(0, i - 1), i1 = Math.min(COLS - 1, i + 1);
    _e1.subVectors(_lead[i1], _lead[i0]);
    _e2.subVectors(_trail[i], _lead[i]);
    _n.crossVectors(_e2, _e1);
    const len = _n.length();
    if (len > 1e-6) _n.multiplyScalar(1 / len); else _n.set(0, 1, 0);
    const chord = _e2.length();
    const tipFade = Math.min(1, (COLS - 1 - i) / SUB + 0.25);
    for (let j = 0; j <= ROWS; j++) {
      const v = j / ROWS;
      _p.lerpVectors(_lead[i], _trail[i], v).addScaledVector(_n, -0.05 * Math.min(1, chord) * Math.sin(Math.PI * v) * (1 - v * 0.4) * tipFade);
      const o = (j * COLS + i) * 3;
      a[o] = _p.x; a[o + 1] = _p.y; a[o + 2] = _p.z;
    }
  }
  w.pos.needsUpdate = true;
  w.top.geometry.computeVertexNormals();   // writes into the shared normal buffer
  w.top.geometry.attributes.normal.needsUpdate = true;
}

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
/** Piecewise profile through keys [pos, a, b] (pos ascending) with smoothstep between the keys. */
function profile(keys, x) {
  if (x <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const k = sstep(keys[i - 1][0], keys[i][0], x);
      return [lerp(keys[i - 1][1], keys[i][1], k), lerp(keys[i - 1][2], keys[i][2], k)];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2]];
}
const vang = (a) => Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);

/** Joint chain without geometry (the skin covers it). dir: 'fwd' (-Z) or 'back' (+Z). */
function jointChain(parent, segs, dir) {
  const joints = [];
  let p = parent;
  segs.forEach((g, i) => {
    const j = new THREE.Group();
    if (i > 0) j.position.z = (dir === 'fwd' ? -1 : 1) * segs[i - 1].len;
    j.rotation.set(g.rx || 0, g.ry || 0, g.rz || 0);
    p.add(j);
    joints.push(j);
    p = j;
  });
  return joints;
}

// Head geometry (head-local: -Z forward, +Y up). The skull and the beak are ONE smooth tube.
const SK = { back: 0.13, tip: -0.86, mouthY: -0.02, hinge: 0.05 };
const SK_LEN = SK.back - SK.tip;
/** Mouth line height at z: flat, tilting up a little toward the beak tip. */
const mouthAt = (z) => SK.mouthY + 0.045 * Math.pow(sstep(-0.35, SK.tip, z), 1.6);
/** Skull/beak half-width and half-height at z (keys by -z ascending). */
const SKULL_KEYS = [[-0.13, 0.072, 0.082], [-0.06, 0.092, 0.105], [0.04, 0.09, 0.098], [0.14, 0.066, 0.072], [0.3, 0.046, 0.05], [0.55, 0.03, 0.03], [0.78, 0.013, 0.012], [0.86, 0.005, 0.005]];
const skullAt = (z) => profile(SKULL_KEYS, -z);
// the beak sits on the mouth line, the skull is centred higher
const skullY = (z) => {
  const ry = skullAt(z)[1];
  return lerp(0.03, mouthAt(z) + ry, sstep(-0.05, -0.3, z));
};
const JAW_KEYS = [[-0.03, 0.04, 0.03], [0.15, 0.042, 0.03], [0.4, 0.028, 0.02], [0.7, 0.012, 0.011], [0.81, 0.005, 0.005]];

function buildHead(head, headColor) {
  const pts = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const z = SK.back - (i / N) * SK_LEN;
    pts.push(V(0, skullY(z), z));
  }
  const cBeak = new THREE.Color(COL.beak), cTip = new THREE.Color(COL.beakTip), cLow = new THREE.Color('#f7dc86');
  const cCrest = new THREE.Color(COL.crest), cCrestTip = new THREE.Color(COL.crestTip);
  const out = new THREE.Color();
  const skull = tube(pts, (t) => skullAt(SK.back - t * SK_LEN), {
    radial: 8,
    color: (t, a, p) => {
      out.copy(headColor(t, a));
      out.lerp(vang(a) > 2.2 ? cLow : cBeak, sstep(-0.1, -0.24, p.z));
      return out.lerp(cTip, sstep(-0.62, -0.84, p.z));
    },
  });
  // backswept blade crest, rooted inside the skull
  const crest = tube([V(0, 0.06, -0.03), V(0, 0.11, 0.12), V(0, 0.19, 0.32), V(0, 0.25, 0.54)], (t) => [0.03 * (1 - t) + 0.006, 0.07 * (1 - t * 0.85) + 0.008], {
    radial: 6, up: V(0, 1, 0), color: (t) => out.copy(cCrest).lerp(cCrestTip, sstep(0.55, 0.95, t)),
  });
  const nostrils = merge([-1, 1].map((s) => place(blob(0.011, 0.008, 0.03, '#3a2a1a', { w: 6, h: 4 }), [s * 0.028, skullY(-0.3) + 0.03, -0.3], [0.1, 0, 0])));
  head.add(mesh(merge([skull, crest, nostrils])));
  const lids = sideEyes(head, { x: 0.083, y: 0.04, z: -0.005, size: 0.054, iris: '#e3a21c', lid: COL.back, yaw: 0.3 });

  // lower jaw: a slim tube hanging off the mouth line
  const jaw = new THREE.Group();
  jaw.position.set(0, mouthAt(SK.hinge), SK.hinge);
  head.add(jaw);
  const jpts = [];
  for (let i = 0; i <= 6; i++) {
    const zr = 0.03 - (i / 6) * 0.84;
    const ry = profile(JAW_KEYS, -zr)[1];
    jpts.push(V(0, mouthAt(SK.hinge + zr) - mouthAt(SK.hinge) - ry, zr));
  }
  jaw.add(mesh(tube(jpts, (t) => profile(JAW_KEYS, t * 0.84 - 0.03), {
    radial: 6, color: (t, a) => out.set(vang(a) > 2.0 ? '#f7dc86' : COL.beak).lerp(cTip, sstep(0.75, 0.97, t)),
  })));
  return { jaw, lids };
}

export function buildPtera() {
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, 0.68, 0);
  body.rotation.x = GROUND_PITCH;

  // ---- skeleton (the skin covers it)
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;

  // short tail stub
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.0, 0.5);
  body.add(tailBase);
  const TAIL = [{ len: 0.14, r0: 0.05, r1: 0.032 }, { len: 0.12, r0: 0.032, r1: 0.009 }];
  rig.tail = jointChain(tailBase, TAIL, 'back');

  // neck: three links with a gentle S, the head hangs off the last
  const neckBase = new THREE.Group();
  neckBase.position.set(0, 0.08, -0.33);
  chest.add(neckBase);
  const NECK = [
    { len: 0.17, rx: 0.3, r: 0.1 },
    { len: 0.17, rx: 0.12, r: 0.08 },
    { len: 0.15, rx: 0.03, r: 0.064 },
  ];
  rig.neck = jointChain(neckBase, NECK, 'fwd');
  const head = new THREE.Group();
  head.position.set(0, 0, -NECK[NECK.length - 1].len);
  head.rotation.x = -0.95;
  rig.neck[NECK.length - 1].add(head);
  rig.head = head;
  const headColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.0, backTo: 0.7 });
  const { jaw, lids } = buildHead(head, headColor);
  rig.jaw = jaw;
  rig.eyelids.push(lids);

  // legs (short, bird-like feet)
  const mkLeg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, -0.08, 0.22);
    body.add(hip);
    const l1 = 0.27, l2 = 0.27;
    const knee = new THREE.Group();
    knee.position.y = -l1;
    hip.add(knee);
    const foot = new THREE.Group();
    foot.position.y = -l2;
    knee.add(foot);
    foot.add(mesh(birdFoot(0.13, 0.026, COL.leg, COL.claw)));
    return { hip, knee, foot, l1, l2, footH: 0.02, kneeDir: 1, front: false };
  };
  const LL = mkLeg(-0.11), RL = mkLeg(0.11);
  LL.offset = 0; RL.offset = 0.5;
  rig.legs.push(LL, RL);

  // wings
  const right = buildWing(body, 1);
  const left = buildWing(body, -1);
  rig.wings = { left: left.joints, right: right.joints, sides: [left, right] };

  // ---- hit zones
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.03, -0.05), radius: 0.17 });
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, -0.02, -0.42), radius: 0.12 });
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.18, 0.32), radius: 0.12 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.02, -0.05), radius: 0.3 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.0, 0.32), radius: 0.2 });
  rig.neck.forEach((j, i) => rig.hitZones.push({ zone: 'body', joint: j, offset: V(0, 0, -NECK[i].len * 0.5), radius: NECK[i].r * 1.6 }));
  for (const w of [left, right]) {
    const [S, E, Wr, F] = w.joints;
    rig.hitZones.push({ zone: 'wing', joint: S, offset: V(0.28, 0, 0.26), radius: 0.3 });
    rig.hitZones.push({ zone: 'wing', joint: E, offset: V(0.4, 0, 0.28), radius: 0.34 });
    rig.hitZones.push({ zone: 'wing', joint: Wr, offset: V(0.3, 0, 0.24), radius: 0.3 });
    rig.hitZones.push({ zone: 'wing', joint: Wr, offset: V(0.75, 0, 0.16), radius: 0.24 });
    rig.hitZones.push({ zone: 'wing', joint: F, offset: V(0.35, 0, 0.1), radius: 0.2 });
    rig.hitZones.push({ zone: 'wing', joint: F, offset: V(0.72, 0, 0.04), radius: 0.14 });
  }

  // bind the skin with the wings outstretched (straight arms), then fold them
  const neutral = new Float32Array(12);
  applyWingPose(rig, neutral, neutral);
  rig.finalize({ gaps: false });
  buildSkin(rig, { neckBase, tailBase, NECK, TAIL, headColor });
  rig.fillHitGaps();
  const pose = new Float32Array(12);
  foldedPose(pose, 0);
  applyWingPose(rig, pose, pose);
  for (const w of rig.wings.sides) {
    // finalize() enables shadows on every mesh; the membrane must not shadow itself
    w.bot.castShadow = false;
    w.top.receiveShadow = w.bot.receiveShadow = false;
  }
  rig.root.updateMatrixWorld(true);
  for (const w of rig.wings.sides) updateMembrane(w);
  return rig;
}

/** The soft body as skinned lofts: head-neck-torso-tail, a loft per leg and per wing arm. */
function buildSkin(rig, { neckBase, tailBase, NECK, TAIL, headColor }) {
  const root = rig.root, body = rig.body, chest = rig.chest, head = rig.head;
  const at = (obj, x = 0, y = 0, z = 0) => restPoint(root, obj, [x, y, z]);
  const skin = new SkinBuilder(root);

  // ---- main body loft: head (hidden in the skull) -> neck -> torso -> tail
  const st = [];
  const add = (p, rx, ry, bone, rb = ry) => st.push({ p, rx, ry, rb, bone });
  add(at(head, 0, 0.03, -0.06), 0.055, 0.062, head);
  add(at(head, 0, 0.03, 0.07), 0.075, 0.085, head);
  for (let i = NECK.length - 1; i >= 0; i--) {
    const r = NECK[i].r;
    add(at(rig.neck[i], 0, 0, -NECK[i].len * 0.5), r * 0.92, r, rig.neck[i], r * 1.08);
  }
  add(at(neckBase), 0.13, 0.13, chest, 0.145);
  // torso: deep chest with a keel, tapering into the hips (z, y, half width, half height above, below)
  for (const [z, y, rx, ry, rb, b] of [
    [-0.17, 0.03, 0.17, 0.165, 0.215, chest],
    [-0.01, 0.02, 0.19, 0.18, 0.22, chest],
    [0.15, 0.0, 0.16, 0.145, 0.16, body],
    [0.31, 0.0, 0.1, 0.092, 0.092, body],
  ]) add(at(body, 0, y, z), rx, ry, b, rb);
  // tail stub
  add(at(tailBase), TAIL[0].r0, TAIL[0].r0, body);
  TAIL.forEach((g, i) => {
    const r = (g.r0 + g.r1) / 2;
    add(at(rig.tail[i], 0, 0, g.len * 0.5), r, r, rig.tail[i]);
  });
  const lt = TAIL.length - 1;
  add(at(rig.tail[lt], 0, 0, TAIL[lt].len), TAIL[lt].r1, TAIL[lt].r1, rig.tail[lt]);
  skin.loft(loft(st, { radial: 22, segs: 7, color: headColor, capStart: true, capEnd: true, dome: 0.8 }));

  // ---- legs: two stations per bone keep the bones firm, the skin blends only across knee and foot
  for (const leg of rig.legs) {
    const ls = [];
    const push = (p, rx, ry, bone, rb = ry) => ls.push({ p, rx, ry, rb, bone });
    push(at(leg.hip, 0, 0.13, 0), 0.07, 0.075, body);
    push(at(leg.hip, 0, -leg.l1 * 0.3, 0), 0.066, 0.076, leg.hip);
    push(at(leg.hip, 0, -leg.l1 * 0.6, 0), 0.05, 0.056, leg.hip);
    push(at(leg.hip, 0, -leg.l1 * 0.93, 0), 0.04, 0.045, leg.hip);
    push(at(leg.knee, 0, -leg.l2 * 0.1, 0), 0.04, 0.044, leg.knee);
    push(at(leg.knee, 0, -leg.l2 * 0.5, 0), 0.03, 0.032, leg.knee);
    push(at(leg.knee, 0, -leg.l2 * 0.95, 0), 0.024, 0.026, leg.knee);
    push(at(leg.foot, 0, -0.012, 0), 0.022, 0.024, leg.foot);
    skin.loft(loft(ls, { up: V(0, 0, -1), radial: 12, segs: 5, color: (t) => (t < 0.3 ? COL.main : COL.leg), dome: 0.7 }));
  }

  // ---- wing arms: root buried in the shoulder, blends into the torso
  const cBack = new THREE.Color(COL.back), cTeal = new THREE.Color(COL.teal), cDark = new THREE.Color(COL.tealDark), cBone = new THREE.Color(COL.bone);
  const cUnder = new THREE.Color(COL.under), cMain = new THREE.Color(COL.main), cMix = new THREE.Color(), out = new THREE.Color();
  const armColor = (t, a) => {
    out.copy(cBack).lerp(cTeal, sstep(0.02, 0.12, t)).lerp(cDark, sstep(0.25, 0.5, t)).lerp(cBone, sstep(0.5, 0.75, t));
    // the underside starts out cream like the belly and turns pale teal like the membrane underside
    cMix.copy(cMain).lerp(cUnder, sstep(0.1, 0.3, t));
    return out.lerp(cMix, sstep(1.6, 2.4, vang(a)) * (1 - sstep(0.4, 0.6, t)));
  };
  for (const w of rig.wings.sides) {
    const [S, E, Wr, F] = w.joints;
    const as = [];
    const push = (p, rx, ry, bone) => as.push({ p, rx, ry, rb: ry, bone });
    push(at(w.base, -0.07, 0, 0), 0.085, 0.085, body);
    push(at(S, 0.05, 0, 0), 0.092, 0.084, S);
    push(at(S, 0.3, 0, 0), 0.078, 0.07, S);
    push(at(S, HUM * 0.9, 0, 0), 0.066, 0.062, S);
    push(at(E, 0.06, 0, 0), 0.06, 0.058, E);
    push(at(E, FORE * 0.45, 0, 0), 0.054, 0.05, E);
    push(at(E, FORE * 0.92, 0, 0), 0.05, 0.048, E);
    push(at(Wr, 0.06, 0, 0), 0.046, 0.042, Wr);
    push(at(Wr, FIN1 * 0.5, 0, 0), 0.038, 0.034, Wr);
    push(at(Wr, FIN1 * 0.9, 0, 0), 0.033, 0.03, Wr);
    push(at(F, 0.07, 0, 0), 0.03, 0.027, F);
    push(at(F, FIN2 * 0.55, 0, 0.012), 0.02, 0.018, F);
    push(at(F, FIN2 * 0.96, 0.002, 0.034), 0.01, 0.009, F);
    skin.loft(loft(as, { radial: 14, segs: 5, color: armColor, capStart: true, capEnd: true, dome: 0.9 }));
  }
  rig.skin = skin.build();
  paintSkinDetails(rig.skin.geometry, 'ptera', { preserve: true });
}

// ---------------------------------------------------------------------------
// Wing poses: 4 joints (shoulder, elbow, wrist/finger, finger tip) × [x, y, z]
// in the joint's local ZYX Euler (z: raise, y: sweep forward(+)/back(-), x: twist).

function setJ(p, j, x, y, z) { p[j * 3] = x; p[j * 3 + 1] = y; p[j * 3 + 2] = z; }

function foldedPose(p, t) {
  // Z-fold like a real pterosaur: elbow out and back, wrist up front, the wing finger folded back along the flank
  const br = Math.sin(t * 1.1) * 0.012;
  setJ(p, 0, -0.1, -1.3, 0.3 + br);
  setJ(p, 1, 0, 2.65, -0.2);
  setJ(p, 2, 0, -2.92, 0.1);
  setJ(p, 3, 0, 3.0, br);
}

function glidePose(p, t) {
  const s = Math.sin(t * 1.3) * 0.03;
  setJ(p, 0, -0.04, 0.12, 0.07 + s);
  setJ(p, 1, 0, -0.06, 0.03);
  setJ(p, 2, 0, -0.14, 0.05 - s * 0.5);
  setJ(p, 3, 0, -0.06, 0.1 + s * 0.8);
}

function flapPose(p, ph0, k = 1) {
  // quicker upstroke than downstroke; every joint lags the one before, so a wave runs out to the tip
  const ph = ph0 + 0.22 * Math.sin(ph0);
  const up = Math.max(0, Math.cos(ph));   // upstroke: fold the wing a little
  setJ(p, 0, -0.14 * Math.cos(ph) * k, 0.12 - up * 0.1 * k, 0.12 + 0.66 * k * Math.sin(ph));
  setJ(p, 1, 0, -0.06 + up * 0.3 * k, 0.3 * k * Math.sin(ph - 0.8));
  setJ(p, 2, 0, -0.14 - up * 0.55 * k, 0.36 * k * Math.sin(ph - 1.5));
  setJ(p, 3, 0, -0.06 - up * 0.1 * k, 0.1 + 0.3 * k * Math.sin(ph - 2.2));
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
      fly: 0, dive: 0, fold: 1, dead: 0, flap: 1, cycleT: 0, struggle: 0, display: 0, flare: 0, launch: 0, walk: 0,
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

  // landing flare (sinking close to the ground: wings spread and beating, nose up, feet reaching down)
  // and take-off (climbing out low: deep, powerful strokes)
  const clearance = terrain ? view.pos.y - terrain.heightAt(view.pos.x, view.pos.z) : 99;
  const low = airborne && st !== DS.DIVE && clearance < 4.5;
  s.flare = damp(s.flare, low && s.vy < -0.25 ? 1 : 0, 4, dt);
  s.launch = damp(s.launch, low && s.vy > 0.5 ? 1 : 0, 4, dt);
  const walkAmp = anim && !airborne && !dead ? anim.amp * (1 - anim.trapped) : 0;
  s.walk = damp(s.walk, walkAmp, 6, dt);

  // flap vs glide: flap while climbing, glide while sinking, else alternate
  s.cycleT += dt;
  const cyc = s.cycleT % 5.2;
  let flapT = cyc < 2.6 ? 1 : 0;   // ~4 beats, then a glide
  if (s.vy > 0.4) flapT = 1;
  else if (s.vy < -0.9) flapT = 0;
  flapT = Math.max(flapT, s.flare, s.launch);
  s.flap = damp(s.flap, flapT, 1.8, dt);
  s.ph += dt * Math.PI * 2 * (1.55 + 0.25 * s.flap + 0.5 * Math.max(s.flare, s.launch));

  // ---- target wing pose = weighted blend of the pose library
  flapPose(_pf, s.ph, 1 + 0.3 * Math.max(s.flare, s.launch));
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
    if (i === 2 && s.walk > 0.01) ground += Math.sin(anim.phase * Math.PI * 2) * 0.05 * s.walk;
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
  const beat = Math.max(s.flare, s.launch);
  if (air > 0.001) {
    const fl = s.flap * s.fly;
    const flapBob = -Math.sin(s.ph) * (0.07 + 0.03 * beat) * fl;
    rig.body.position.y += ((rig.bodyRestY + flapBob) - rig.body.position.y) * air;
    const climb = Math.max(-0.35, Math.min(0.35, s.vy * 0.05)) * s.fly;
    // nose up for the landing flare / take-off, dips a little with each downstroke
    rig.body.rotation.x += -GROUND_PITCH * air + climb - 0.55 * s.dive + 0.45 * s.flare * s.fly + 0.05 * Math.sin(s.ph - 0.4) * fl;
    const bank = Math.max(-0.6, Math.min(0.6, (anim?.yawRate || 0) * 0.35));
    const sway = Math.sin(s.t * 0.9) * 0.025 * (1 - fl);
    rig.body.rotation.z += (bank + sway - rig.body.rotation.z) * air;
    // neck stretches forward, head stays level (the neck ripples against the wing beat)
    rig.neck.forEach((j, i) => {
      j.rotation.x -= (0.2 / rig.neck.length) * air;
      j.rotation.x += 0.05 * Math.sin(s.ph - 0.6 - i * 0.5) * fl;
    });
    rig.head.rotation.x += 0.55 * air - 0.2 * s.dive - 0.35 * s.flare * s.fly - 0.04 * Math.sin(s.ph - 1.6) * fl;
    const legAir = air * (1 - 0.85 * s.flare);   // landing gear comes down for the flare
    for (const leg of rig.legs) {
      leg.hip.rotation.x += (LEG_AIR[0] - leg.hip.rotation.x) * legAir;
      leg.knee.rotation.x += (LEG_AIR[1] - leg.knee.rotation.x) * legAir;
      leg.foot.rotation.x += (LEG_AIR[2] - leg.foot.rotation.x) * legAir;
      leg.hip.rotation.x += 0.1 * Math.sin(s.ph - 1.2 - leg.offset) * fl * legAir;
      leg.knee.rotation.x += 0.08 * Math.sin(s.ph - 1.8) * fl * legAir;
    }
    rig.tail.forEach((j, i) => {
      j.rotation.y *= 1 - air * 0.7;
      j.rotation.x += air * (0.12 * Math.sin(s.ph - 1.2 - i * 0.6) * fl - 0.1 * s.dive);
    });
  }
  // walking: the head pecks forward with every step like a wading bird
  if (s.walk > 0.01) {
    const bobPh = anim.phase * Math.PI * 2 * 2;
    rig.neck.forEach((j, i) => { j.rotation.x += Math.sin(bobPh - i * 0.5) * 0.07 * s.walk; });
    rig.head.rotation.x += Math.sin(bobPh - 1.5) * 0.08 * s.walk;
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
