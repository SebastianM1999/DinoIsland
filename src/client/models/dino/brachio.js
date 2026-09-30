// Brachiosaurus: blue-violet, cream belly and neck underside, very long curved
// neck, small head with a nostril dome, thick pillar legs, long tapering tail.
// See inspiration/model-art.png and inspiration/3-dino-models.png.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, blob } from '../kit.js';
import { Rig } from './rig.js';
import { SkinBuilder, loft, restPoint } from './skin.js';
import { jointChain, standPose } from './theropod.js';
import { countershade, sideEyes, teethRow, pillarFoot, tube, V } from './parts.js';

const COL = {
  main: '#8089dc',
  back: '#6c73c8',
  stripe: '#6269bb',
  belly: '#f4e0b8',
  leg: '#7982d6',
  legDark: '#6a72c6',
  nail: '#efe3c6',
};

export const BRACHIO_ANIM = {
  gait: 'quad',
  walkStride: 4.4,
  runStride: 7.5,
  runSpeed: 6,
  walkDuty: 0.68,
  runDuty: 0.5,
  stepHeight: 0.5,
  bob: 0.1,
  sway: 0.03,
  tailSway: 0.09,
  tailFollow: 0.5,
  neckFollow: 0.45,
  breathe: 0.014,
  headLook: 0.5,
  neckDip: 0.2,
  jawOpen: 0.4,
  blinkEvery: 5,
};

const STOMP_WINDUP = 0.8;   // matches CONFIG.dinos.brachio.stompWindup on the server

/**
 * Defensive stomp: rear up on the hind legs (front legs lifted and folded),
 * then slam down with a heavy footfall. Driven by the ATTACK state.
 */
export function brachioExtraUpdate(view, dt) {
  const rig = view.rig;
  const s = view._stomp || (view._stomp = { t: -1, rear: 0, slammed: false });
  if (view.st === 5 /* DS.ATTACK */) {
    if (s.t < 0) { s.t = 0; s.slammed = false; }
    s.t += dt;
  } else s.t = -1;
  let target = 0;
  if (s.t >= 0) {
    if (s.t < STOMP_WINDUP) target = Math.sin((s.t / STOMP_WINDUP) * Math.PI * 0.5);   // rise
    else target = Math.max(0, 1 - (s.t - STOMP_WINDUP) / 0.15);                         // slam
    if (!s.slammed && s.t >= STOMP_WINDUP + 0.12) {
      s.slammed = true;
      view.ctx.onStep?.(view);
      view.ctx.onStep?.(view);
    }
  }
  // fast down, smooth up
  s.rear += (target - s.rear) * Math.min(1, dt * (target < s.rear ? 22 : 7));
  if (s.rear < 0.001) return;
  const r = s.rear;
  rig.body.rotation.x += r * 0.42;
  rig.body.position.y += r * 1.1;
  for (const leg of rig.legs) {
    if (!leg.front) continue;
    leg.hip.rotation.x += r * 0.9;
    leg.knee.rotation.x -= r * 1.3;
  }
  for (const j of rig.neck) j.rotation.x += r * 0.06;
  if (rig.jaw) rig.jaw.rotation.x -= r * 0.25;
}

export function buildBrachio() {
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, 3.75, 0);

  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;

  // ---------------------------------------------------------------- skeleton
  // legs: rigid pillar feet on the joints, the soft leg is part of the skin
  const mkLeg = (x, y, z, l1, l2, r1, r2, front, side) => {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    body.add(hip);
    const knee = new THREE.Group();
    knee.position.y = -l1;
    hip.add(knee);
    const foot = new THREE.Group();
    foot.position.y = -l2;
    knee.add(foot);
    foot.add(mesh(pillarFoot(r2 * 1.1, 0.45, COL.legDark, COL.nail)));
    return { hip, knee, foot, l1, l2, r1, r2, footH: 0.45, kneeDir: front ? -1 : 1, front, side };
  };
  const LH = mkLeg(-1.0, -0.4, 1.75, 1.55, 1.38, 0.62, 0.44, false, -1);
  const RH = mkLeg(1.0, -0.4, 1.75, 1.55, 1.38, 0.62, 0.44, false, 1);
  const LF = mkLeg(-1.08, 0.0, -2.15, 1.78, 1.66, 0.55, 0.42, true, -1);
  const RF = mkLeg(1.08, 0.0, -2.15, 1.78, 1.66, 0.55, 0.42, true, 1);
  // lateral-sequence walk: LH, LF, RH, RF
  LH.offset = 0; LF.offset = 0.25; RH.offset = 0.5; RF.offset = 0.75;
  rig.legs.push(LH, LF, RH, RF);

  // ---- neck (6 joints rising in a gentle curve)
  const neckBase = new THREE.Group();
  neckBase.position.set(0, 1.15, -2.55);
  body.add(neckBase);
  const neckSegs = [
    { len: 1.3, r0: [0.95, 1.08], r1: [0.76, 0.86], rx: 0.72 },
    { len: 1.3, r0: [0.76, 0.86], r1: [0.63, 0.7], rx: 0.17 },
    { len: 1.25, r0: [0.63, 0.7], r1: [0.53, 0.58], rx: 0.13 },
    { len: 1.2, r0: [0.53, 0.58], r1: [0.45, 0.49], rx: 0.09 },
    { len: 1.15, r0: [0.45, 0.49], r1: [0.38, 0.41], rx: 0.02 },
    { len: 1.05, r0: [0.38, 0.41], r1: [0.31, 0.34], rx: -0.1 },
  ];
  rig.neck = jointChain(neckBase, neckSegs, 'fwd');

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 0, -neckSegs[neckSegs.length - 1].len);
  head.rotation.x = -1.12;
  rig.neck[rig.neck.length - 1].add(head);
  rig.head = head;
  const headColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.0, backTo: 0.8 });
  const skull = tube([V(0, 0.02, 0.28), V(0, 0.04, -0.3), V(0, -0.02, -0.75), V(0, -0.06, -1.02)],
    (t) => [0.34 - t * 0.14, 0.34 - t * 0.17], { radial: 12, color: headColor });
  const dome = place(blob(0.22, 0.17, 0.4, COL.main, { w: 10, h: 8 }), [0, 0.22, -0.38]);   // nostril arch
  const nostrils = merge([
    place(blob(0.05, 0.03, 0.07, '#2a2440'), [-0.08, 0.36, -0.52]),
    place(blob(0.05, 0.03, 0.07, '#2a2440'), [0.08, 0.36, -0.52]),
  ]);
  const cheeks = merge([
    place(blob(0.12, 0.13, 0.2, COL.main), [-0.24, -0.1, -0.2]),
    place(blob(0.12, 0.13, 0.2, COL.main), [0.24, -0.1, -0.2]),
  ]);
  const mouthLine = place(blob(0.25, 0.014, 0.31, '#3b3470'), [0, -0.13, -0.66]);
  head.add(mesh(merge([skull, dome, nostrils, cheeks, mouthLine])));
  rig.eyelids.push(sideEyes(head, { x: 0.27, y: 0.12, z: -0.12, size: 0.085, iris: '#3d2715', lid: COL.back, yaw: 0.35 }));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.02);
  head.add(jaw);
  rig.jaw = jaw;
  const jawGeo = tube([V(0, 0, 0.08), V(0, -0.05, -0.45), V(0, -0.04, -0.9)], (t) => [0.25 - t * 0.1, 0.1 - t * 0.03], {
    radial: 8, color: (t, a) => (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) > 1.5 ? COL.belly : COL.main),
  });
  jaw.add(mesh(merge([jawGeo, teethRow(V(-0.14, 0.05, -0.55), V(0.14, 0.05, -0.55), 5, 0.06, 1)])));

  // ---- tail (8 joints tapering to a whip)
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.05, 2.75);
  body.add(tailBase);
  const tr = [0.95, 0.78, 0.62, 0.48, 0.36, 0.26, 0.17, 0.1, 0.05];
  const tl = [1.3, 1.25, 1.2, 1.15, 1.05, 1.0, 0.95, 0.9];
  const trx = [0.22, 0.06, 0.02, -0.02, -0.04, -0.04, -0.03, -0.02];
  rig.tail = jointChain(tailBase, tl.map((len, i) => ({ len, rx: trx[i] })), 'back');

  // ---- hit zones (weak spots: head, neck)
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(0, 0.1, -0.45), radius: 0.62 });
  rig.neck.forEach((j, i) => rig.hitZones.push({ zone: 'neck', joint: j, offset: V(0, 0, -neckSegs[i].len * 0.5), radius: 0.85 - i * 0.08 }));
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.55, -1.6), radius: 1.75 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.3, 0.4), radius: 1.85 });
  rig.hitZones.push({ zone: 'body', joint: body, offset: V(0, 0.05, 2.1), radius: 1.35 });
  for (const leg of rig.legs) {
    rig.hitZones.push({ zone: 'leg', joint: leg.hip, offset: V(0, -0.8, 0), radius: 0.62 });
    rig.hitZones.push({ zone: 'leg', joint: leg.knee, offset: V(0, -0.8, 0), radius: 0.48 });
  }
  rig.tail.slice(0, 5).forEach((j, i) => rig.hitZones.push({ zone: 'tail', joint: j, offset: V(0, 0, tl[i] * 0.5), radius: tr[i] * 0.95 }));

  rig.finalize({ gaps: false });
  standPose(rig, BRACHIO_ANIM);

  // ---------------------------------------------------------------- skin
  const at = (obj, x = 0, y = 0, z = 0) => restPoint(rig.root, obj, [x, y, z]);
  const st = [];
  const add = (p, rx, ry, bone, rb = ry) => st.push({ p, rx, ry, rb, bone });
  // head end: the neck runs into the back of the skull
  add(at(head, 0, 0.03, -0.02), 0.27, 0.27, head);
  add(at(head, 0, 0.03, 0.22), 0.31, 0.31, head);
  // neck, head end first (stations at the middle of each bone)
  for (let i = neckSegs.length - 1; i >= 0; i--) {
    const g = neckSegs[i];
    const rx = (g.r0[0] + g.r1[0]) / 2, ry = (g.r0[1] + g.r1[1]) / 2;
    add(at(rig.neck[i], 0, 0, -g.len * 0.5), rx, ry, rig.neck[i], ry * 1.1);
  }
  add(at(neckBase), 1.05, 1.1, chest, 1.25);
  // torso, front to back
  const path = new THREE.CatmullRomCurve3([V(0, -0.05, 3.0), V(0, 0.1, 1.7), V(0, 0.25, 0.1), V(0, 0.65, -1.7), V(0, 1.0, -2.95)]);
  const girth = (t) => (t < 0.3 ? 0.85 + t * 2.2 : t < 0.6 ? 1.5 + (t - 0.3) * 0.8 : 1.74 - (t - 0.6) * 1.55);
  for (let u = 0.8; u >= 0.1; u -= 0.1) {
    const q = path.getPoint(u);
    const r = girth(u);
    add(at(body, 0, q.y, q.z), r * 0.92, r * (u > 0.25 && u < 0.75 ? 1.02 : 0.95), q.z < -0.5 ? chest : body, r * 1.08);
  }
  // tail
  add(at(tailBase), tr[0], tr[0] * 1.05, body, tr[0] * 1.08);
  tl.forEach((len, i) => {
    const r = (tr[i] + tr[i + 1]) / 2;
    add(at(rig.tail[i], 0, 0, len * 0.5), r, r * 1.05, rig.tail[i]);
  });
  add(at(rig.tail[7], 0, 0, tl[7]), tr[8], tr[8] * 1.05, rig.tail[7]);

  const bodyColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, stripe: COL.stripe, stripes: 14, stripeWidth: 0.22, bellyFrom: 1.9, backTo: 0.7, stripePhase: 0.3 });
  const skin = new SkinBuilder(rig.root);
  skin.loft(loft(st, { radial: 28, segs: 7, color: bodyColor, capStart: true, capEnd: true, dome: 0.8 }));

  // legs: massive pillars, thigh / shoulder buried in the body
  const legColor = (t) => (t < 0.22 ? COL.main : t > 0.72 ? COL.legDark : COL.leg);
  for (const leg of rig.legs) {
    const { l1, l2, r1, r2 } = leg;
    const ls = [];
    const push = (p, rx, ry, bone, rb = ry) => ls.push({ p, rx, ry, rb, bone });
    push(at(leg.hip, 0, r1 * 0.8, 0), r1 * 1.05, r1 * 1.2, body, r1 * 1.15);
    push(at(leg.hip, 0, -l1 * 0.15, 0), r1 * 1.05, r1 * 1.12, leg.hip, r1 * 1.1);
    push(at(leg.hip, 0, -l1 * 0.6, 0), r1 * 0.82, r1 * 0.85, leg.hip);
    push(at(leg.hip, 0, -l1 * 0.93, 0), r2 * 1.3, r2 * 1.32, leg.hip);
    push(at(leg.knee, 0, -l2 * 0.08, 0), r2 * 1.3, r2 * 1.32, leg.knee);
    push(at(leg.knee, 0, -l2 * 0.5, 0), r2 * 1.0, r2 * 1.02, leg.knee);
    push(at(leg.knee, 0, -l2 * 0.92, 0), r2 * 1.08, r2 * 1.08, leg.knee);
    push(at(leg.foot, 0, -0.1, 0), r2 * 1.08, r2 * 1.08, leg.foot);
    skin.loft(loft(ls, { up: V(0, 0, -1), radial: 18, segs: 6, color: legColor, dome: 0.7 }));
  }
  rig.skin = skin.build();
  rig.fillHitGaps();
  return rig;
}
