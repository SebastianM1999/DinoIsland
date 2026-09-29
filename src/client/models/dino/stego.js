// Stegosaurus: olive/moss green with a cream belly, two alternating rows of
// orange-red back plates (biggest over the hips), four tail spikes, a small low
// head with a beak, a heavy arched back, short front legs and longer hind legs.
// Same structure as brachio.js; styled after inspiration/3-dino-models.png.

import * as THREE from 'three';
import { paint, place, part, merge, mesh, blob, deform } from '../kit.js';
import { Rig } from './rig.js';
import { countershade, chain, sideEyes, teethRow, tube, spike, roundFoot, V } from './parts.js';
import { DS } from '../../../shared/protocol.js';

const COL = {
  main: '#86a03c',
  back: '#6f8a2f',
  stripe: '#62792a',
  belly: '#f3e3b6',
  leg: '#7f9838',
  legDark: '#6b8230',
  nail: '#efe3c6',
  plate: '#f07c36',
  plateMid: '#e2582b',
  plateTip: '#a93420',
  beak: '#d9c089',
  beakTip: '#8f7a4c',
  mouth: '#3f4a1c',
};

export const STEGO_ANIM = {
  gait: 'quad',
  walkSpeed: 1.6,
  walkStride: 2.3,
  runStride: 4.2,
  runSpeed: 7,
  walkDuty: 0.66,
  runDuty: 0.42,
  stepHeight: 0.26,
  bob: 0.07,
  sway: 0.035,
  tailSway: 0.1,
  tailFollow: 0.45,
  neckFollow: 0.3,
  breathe: 0.016,
  headLook: 0.55,
  neckDip: 0.3,
  jawOpen: 0.35,
  blinkEvery: 4,
};

// Torso profile along Z (front -> back): [z, centreY, radiusY, radiusX] in body space.
const TORSO = [
  [-1.8, -0.34, 0.46, 0.48],
  [-1.15, -0.13, 0.66, 0.7],
  [-0.35, 0.05, 0.8, 0.84],
  [0.45, 0.12, 0.84, 0.84],
  [1.2, 0.02, 0.68, 0.66],
  [1.8, -0.06, 0.48, 0.48],
];

function prof(z) {
  if (z <= TORSO[0][0]) return TORSO[0];
  for (let i = 1; i < TORSO.length; i++) {
    const a = TORSO[i - 1], b = TORSO[i];
    if (z <= b[0]) {
      const k = (z - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return TORSO[TORSO.length - 1];
}

/** Rounded, slightly back-leaning bony plate with a soft rim, base at y=0 (bury it a little). */
function plateGeo(h, w, lean = 0.18) {
  let g = new THREE.SphereGeometry(1, 18, 12);
  g = deform(g, (v) => {
    const k = (v.y + 1) / 2;                 // 0 bottom .. 1 top
    v.x *= 0.035 + h * 0.03;
    v.z *= (w / 2) * (k < 0.55 ? 1 : 1 - (k - 0.55) * 0.9);
    v.y = k * h;
    v.z += k * k * lean * h;                 // lean backward
  });
  const base = new THREE.Color(COL.plate), mid = new THREE.Color(COL.plateMid), tip = new THREE.Color(COL.plateTip);
  const out = new THREE.Color();
  return paint(g, (c) => {
    const k = Math.max(0, Math.min(1, c.y / h));
    return k < 0.58 ? out.copy(base).lerp(mid, k / 0.58) : out.copy(mid).lerp(tip, (k - 0.58) / 0.42);
  });
}

/** Curved tail spike pointing along `dir` (joint space). */
function tailSpike(len, base, dir) {
  let g = spike(base, len, COL.plate, COL.plateTip, 7, 8);
  g = deform(g, (v) => { const k = v.y / len; v.z += k * k * len * 0.12; });
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return place(g, [0, 0, 0], [e.x, e.y, e.z]);
}

/** Stubby elephant-like foot with separate toes and nails, ankle at y=0, sole at y=-h. */
function stubbyFoot(r, h, toes, color, nail) {
  let g = roundFoot(r * 0.85, r * 1.1, h, color);
  g = deform(g, (v) => { if (v.z < 0) v.z *= 1.15; });
  const parts = [place(g, [0, 0, -r * 0.1])];
  for (let i = 0; i < toes; i++) {
    const a = (i / (toes - 1) - 0.5) * (toes > 3 ? 1.5 : 1.1);
    const x = Math.sin(a) * r * 0.95, z = -Math.cos(a) * r * 0.95 - r * 0.12;
    parts.push(place(blob(r * 0.3, r * 0.26, r * 0.36, color), [x, -h + r * 0.22, z]));
    parts.push(place(blob(r * 0.2, r * 0.16, r * 0.2, nail), [x * 1.12, -h + r * 0.15, z - r * 0.26]));
  }
  return merge(parts);
}

export function buildStego() {
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, 1.95, 0);

  // ---- torso: heavy arched back peaking over the hips
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;
  const z0 = TORSO[0][0], z1 = TORSO[TORSO.length - 1][0];
  const bodyColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, stripe: COL.stripe, stripes: 6, stripeWidth: 0.26, bellyFrom: 2.05, backTo: 0.7 });
  const torso = tube(TORSO.map((r) => V(0, r[1], r[0])), (t) => {
    const p = prof(z0 + (z1 - z0) * t);
    return [p[3], p[2]];
  }, { radial: 12, color: bodyColor, smoothColors: true });
  const bulges = [];
  for (const s of [-1, 1]) {
    bulges.push(place(blob(0.36, 0.62, 0.72, COL.main, { w: 8, h: 6 }), [s * 0.66, -0.02, 0.62]));   // thigh muscle
    bulges.push(place(blob(0.27, 0.48, 0.48, COL.main, { w: 8, h: 6 }), [s * 0.55, -0.22, -1.1]));      // shoulder
  }
  chest.add(mesh(merge([torso, ...bulges])));

  // ---- back plates (two alternating rows, big over the hips)
  const plates = [];
  const plateH = (z) => 0.34 + 0.8 * Math.exp(-(((z - 0.35) / 1.25) ** 2));
  const zs = [-1.55, -1.1, -0.62, -0.12, 0.38, 0.88, 1.36];
  zs.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const zz = z + (s > 0 ? 0.24 : 0);
      const h = plateH(zz) * (s > 0 ? 0.94 : 1);
      const p = prof(zz);
      plates.push(place(plateGeo(h, h * 0.9), [s * 0.11, p[1] + p[2] - 0.12, zz], [0, 0, -s * 0.13]));
    }
  });
  body.add(mesh(merge(plates)));

  // ---- legs
  const mkLeg = (x, y, z, l1, l2, r1, r2, front) => {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    body.add(hip);
    const thighGeo = tube([V(0, 0.4, 0), V(0, -l1 * 0.5, 0), V(0, -l1 - r2 * 0.5, 0)], (t) => [r1 * (1.1 - t * 0.4), r1 * 1.2 * (1.1 - t * 0.4)], {
      radial: 9, up: V(0, 0, -1), color: (t, a) => (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) > 2.4 && t > 0.15 && t < 0.4 ? COL.belly : COL.leg),
    });
    hip.add(mesh(thighGeo));
    const knee = new THREE.Group();
    knee.position.y = -l1;
    hip.add(knee);
    const shinGeo = tube([V(0, r2 * 0.5, 0), V(0, -l2 * 0.5, 0), V(0, -l2 + 0.04, 0)], (t) => r2 * (1.05 - t * 0.15), {
      radial: 8, up: V(0, 0, -1), color: (t) => (t > 0.7 ? COL.legDark : COL.leg),
    });
    // knee ball keeps the bent joint rounded
    knee.add(mesh(merge([shinGeo, place(blob(r2 * 1.12, r2 * 1.15, r2 * 1.12, COL.leg), [0, 0, 0])])));
    const foot = new THREE.Group();
    foot.position.y = -l2;
    knee.add(foot);
    const footH = 0.2;
    foot.add(mesh(stubbyFoot(r2 * 1.12, footH, front ? 4 : 3, COL.legDark, COL.nail)));
    return { hip, knee, foot, l1, l2, footH, kneeDir: front ? -1 : 1, front };
  };
  // hind: hip joint ~1.75 m above ground; front legs shorter
  const LH = mkLeg(-0.66, -0.2, 0.62, 0.86, 0.8, 0.36, 0.25, false);
  const RH = mkLeg(0.66, -0.2, 0.62, 0.86, 0.8, 0.36, 0.25, false);
  const LF = mkLeg(-0.6, -0.45, -1.12, 0.7, 0.66, 0.27, 0.2, true);
  const RF = mkLeg(0.6, -0.45, -1.12, 0.7, 0.66, 0.27, 0.2, true);
  LH.offset = 0; LF.offset = 0.25; RH.offset = 0.5; RF.offset = 0.75;   // lateral sequence
  rig.legs.push(LH, LF, RH, RF);

  // ---- neck (short, sloping down) with small plates
  const neckBase = new THREE.Group();
  neckBase.position.set(0, -0.32, -1.62);
  body.add(neckBase);
  const neckColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 1.9, backTo: 0.65 });
  const neckSegs = [
    { len: 0.5, r0: [0.44, 0.44], r1: [0.35, 0.34], rx: -0.42 },
    { len: 0.45, r0: [0.35, 0.34], r1: [0.27, 0.26], rx: -0.14 },
  ];
  neckSegs[0].ex = [place(plateGeo(0.3, 0.26), [-0.08, 0.33, -0.12], [0, 0, 0.12]), place(plateGeo(0.26, 0.22), [0.08, 0.3, 0.1], [0, 0, -0.12])];
  neckSegs[1].ex = [place(plateGeo(0.22, 0.2), [-0.07, 0.24, -0.18], [0, 0, 0.12]), place(plateGeo(0.19, 0.18), [0.07, 0.23, 0.02], [0, 0, -0.12])];
  rig.neck = chain(neckBase, neckSegs, { dir: 'fwd', color: neckColor, radial: 10, capFirst: false });

  // ---- head: small, low, beaked
  const head = new THREE.Group();
  head.position.set(0, 0, -neckSegs[1].len);
  head.rotation.x = 0.36;
  rig.neck[1].add(head);
  rig.head = head;
  const headColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.0, backTo: 0.8 });
  const skull = tube([V(0, 0.02, 0.2), V(0, 0.04, -0.18), V(0, -0.0, -0.48), V(0, -0.05, -0.64)],
    (t) => [0.22 - t * 0.11, 0.22 - t * 0.12], { radial: 10, color: headColor });
  const beak = place(deform(spike(0.12, 0.2, COL.beak, COL.beakTip, 7), (v) => { v.x *= 0.9; v.z *= 0.6; }), [0, -0.07, -0.6], [-Math.PI / 2 - 0.25, 0, 0]);
  const nostrils = merge([
    place(blob(0.035, 0.025, 0.05, '#2c3614'), [-0.07, 0.04, -0.55]),
    place(blob(0.035, 0.025, 0.05, '#2c3614'), [0.07, 0.04, -0.55]),
  ]);
  const cheeks = merge([
    place(blob(0.09, 0.1, 0.14, COL.main), [-0.17, -0.07, -0.1]),
    place(blob(0.09, 0.1, 0.14, COL.main), [0.17, -0.07, -0.1]),
  ]);
  const crown = place(blob(0.15, 0.1, 0.2, COL.back, { w: 8, h: 5 }), [0, 0.17, 0.02]);
  const mouthLine = place(blob(0.14, 0.014, 0.2, COL.mouth), [0, -0.09, -0.36]);
  head.add(mesh(merge([skull, beak, nostrils, cheeks, crown, mouthLine])));
  rig.eyelids.push(sideEyes(head, { x: 0.165, y: 0.07, z: -0.1, size: 0.066, iris: '#8a4a16', lid: COL.back, yaw: 0.35 }));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.06);
  head.add(jaw);
  rig.jaw = jaw;
  const jawGeo = tube([V(0, 0, 0.06), V(0, -0.04, -0.3), V(0, -0.02, -0.58)], (t) => [0.16 - t * 0.08, 0.07 - t * 0.02], {
    radial: 8, color: (t, a) => (t > 0.85 ? COL.beak : Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) > 1.5 ? COL.belly : COL.main),
  });
  jaw.add(mesh(merge([jawGeo, teethRow(V(-0.09, 0.03, -0.42), V(0.09, 0.03, -0.42), 4, 0.04, 1)])));

  // ---- tail: thick base with plates, thagomizer at the end
  const tailBase = new THREE.Group();
  tailBase.position.set(0, -0.06, 1.66);
  body.add(tailBase);
  const tailColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, stripe: COL.stripe, stripes: 6, stripeWidth: 0.3, bellyFrom: 2.2, backTo: 0.7 });
  const tr = [0.5, 0.42, 0.34, 0.26, 0.19, 0.13, 0.07];
  const tl = [0.55, 0.52, 0.5, 0.46, 0.44, 0.42];
  const trx = [0.1, -0.06, -0.06, -0.04, -0.02, 0];
  const tailSegs = [];
  for (let i = 0; i < 6; i++) tailSegs.push({ len: tl[i], r0: [tr[i], tr[i] * 1.05], r1: [tr[i + 1], tr[i + 1] * 1.05], rx: trx[i] });
  // tail plates (continuing the two rows, shrinking)
  const tp = [[0.5, 0.44], [0.36, 0.3], [0.24]];
  tp.forEach((hs, i) => {
    tailSegs[i].ex = hs.map((h, k) => {
      const s = k === 0 ? -1 : 1;
      const z = k === 0 ? 0.08 : 0.3;
      const r = tr[i] + (tr[i + 1] - tr[i]) * (z / tl[i]);
      return place(plateGeo(h, h * 0.9, 0.3), [s * 0.08, r * 1.05 - 0.07, z], [0, 0, -s * 0.13]);
    });
  });
  // thagomizer: four spikes, two pairs, pointing out, up and back
  tailSegs[4].ex = [-1, 1].map((s) => place(tailSpike(0.68, 0.075, V(s * 0.8, 0.5, 0.35)), [s * 0.1, 0.06, 0.3]));
  tailSegs[5].ex = [-1, 1].map((s) => place(tailSpike(0.6, 0.065, V(s * 0.75, 0.45, 0.6)), [s * 0.07, 0.04, 0.22]));
  rig.tail = chain(tailBase, tailSegs, { dir: 'back', color: tailColor, radial: 9, capFirst: false });

  // ---- hit zones: plates on top (protect from above/behind), flanks + neck are weak spots
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.02, -0.3), radius: 0.36 });
  rig.neck.forEach((j, i) => rig.hitZones.push({ zone: 'neck', joint: j, offset: V(0, 0, -neckSegs[i].len * 0.5), radius: 0.46 - i * 0.07 }));
  for (const z of [-1.2, -0.55, 0.1, 0.75, 1.35]) {
    const p = prof(z);
    rig.hitZones.push({ zone: 'plates', joint: body, offset: V(0, p[1] + p[2] + plateH(z) * 0.45, z), radius: 0.3 + plateH(z) * 0.4 });
  }
  rig.hitZones.push({ zone: 'plates', joint: rig.tail[0], offset: V(0, 0.55, 0.2), radius: 0.38 });
  rig.hitZones.push({ zone: 'plates', joint: rig.tail[1], offset: V(0, 0.4, 0.2), radius: 0.3 });
  for (const s of [-1, 1]) {
    rig.hitZones.push({ zone: 'flank', joint: body, offset: V(s * 0.5, -0.02, -0.55), radius: 0.6 });
    rig.hitZones.push({ zone: 'flank', joint: body, offset: V(s * 0.5, 0.02, 0.3), radius: 0.62 });
  }
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, -0.35, -1.15), radius: 0.62 });   // chest
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, -0.35, -0.1), radius: 0.66 });    // belly
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.3, -0.15), radius: 0.7 });      // spine core
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.15, 1.2), radius: 0.62 });      // rump
  for (const leg of rig.legs) {
    rig.hitZones.push({ zone: 'leg', joint: leg.hip, offset: V(0, -leg.l1 * 0.45, 0), radius: leg.front ? 0.32 : 0.4 });
    rig.hitZones.push({ zone: 'leg', joint: leg.knee, offset: V(0, -leg.l2 * 0.5, 0), radius: leg.front ? 0.26 : 0.3 });
  }
  rig.tail.forEach((j, i) => rig.hitZones.push({ zone: 'tail', joint: j, offset: V(0, 0, tl[i] * 0.5), radius: Math.max(0.22, tr[i] * 0.95) }));

  return rig.finalize();
}

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * Extra drama for the tail strike: the tail sweeps hard to one side with a
 * whip-like follow-through (spring per joint, the tip lags and overshoots),
 * the hips twist away and the head turns to keep watching the target.
 */
export function stegoExtraUpdate(view, dt) {
  const rig = view.rig;
  const anim = view.anim;
  dt = Math.min(dt, 0.05);
  let s = view._stego;
  if (!s) {
    s = view._stego = { x: rig.tail.map(() => 0), v: rig.tail.map(() => 0), twist: 0, side: 1, was: false };
  }
  const striking = view.st === DS.TAIL;
  if (striking && !s.was) s.side = -s.side;   // alternate sides between strikes
  s.was = striking;
  const sw = striking ? (anim?.c.tailSwing ?? 1) : 0;   // animator-smoothed 0..1
  const n = rig.tail.length;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    const target = sw * s.side * (0.28 + 0.1 * k);
    // stiffer at the base, looser toward the tip -> whip + overshoot
    const stiff = 150 - 95 * k, dampK = 17 - 9 * k;
    s.v[i] += (stiff * (target - s.x[i]) - dampK * s.v[i]) * dt;
    s.x[i] += s.v[i] * dt;
    rig.tail[i].rotation.y += s.x[i];
    rig.tail[i].rotation.x -= Math.abs(s.x[i]) * 0.15;   // tail lifts a little in the swing
  }
  s.twist = damp(s.twist, sw * s.side, 9, dt);
  rig.body.rotation.y -= s.twist * 0.22;     // hips swing away, tail follows
  rig.body.rotation.z += s.twist * 0.05;     // weight shifts onto the planted side
  for (const j of rig.neck) j.rotation.y += s.twist * 0.2;   // head keeps looking at the target
}
