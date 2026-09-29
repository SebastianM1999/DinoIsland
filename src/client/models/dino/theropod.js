// Shared builder for bipedal theropods (Velociraptor, T-Rex): countershaded
// torso, S-curved neck, big-jawed head with individual teeth, stiff/heavy
// tail, digitigrade legs with 3-toed clawed feet and small grasping arms.
// Species files (raptor.js, trex.js) only provide measurements + colors.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, tube, blob, spike, deform } from '../kit.js';
import { Rig, DinoAnimator } from './rig.js';
import { countershade, chain, sideEyes, teethRow, V } from './parts.js';
import { DS } from '../../../shared/protocol.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** tube() angle -> 0 (top) .. PI (bottom) */
const vang = (a) => Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);

/**
 * Curved claw, base at the origin, pointing forward (-Z) and hooking down.
 * (parts.js `claw()` points backwards (+Z) – see report; this is the fixed variant.)
 */
export function talon(len, base, color = '#efe4cc', tip = '#2f2624', radial = 5) {
  let g = spike(base, len, color, tip, radial);
  g = deform(g, (v) => {
    const k = v.y / len;
    v.z -= k * k * len * 0.4;          // curve (becomes "down" after the rotation)
    v.x *= 0.75;                        // laterally flattened like a real claw
  });
  return place(g, [0, 0, 0], [-(Math.PI / 2 + 0.35), 0, 0]);
}

/**
 * Three-toed theropod foot, ankle (foot joint) at y=0, toes forward (-Z).
 * Same layout as parts.birdFoot but with forward-pointing claws, a small
 * back toe and an optional raised sickle claw on the inner toe.
 * @param side -1 left / +1 right (the sickle toe is the inner one)
 */
export function theroFoot({ toeLen, r, h, color, pad, clawColor = '#efe4cc', clawTip = '#2f2624', sickle = false, side = 1 }) {
  const parts = [];
  const toes = [[-0.38, 0.8], [0, 1], [0.38, 0.84]];
  for (const [ang, k] of toes) {
    const len = toeLen * k;
    // knuckled toe: rises a bit in the middle, touches the ground at the tip
    const toe = tube([V(0, -h * 0.55, 0.02), V(0, -h + r * 0.95, -len * 0.45), V(0, -h + r * 0.55, -len)],
      (t) => [r * (1.05 - t * 0.45), r * (0.95 - t * 0.4)], {
        radial: 6, up: V(0, 1, 0),
        color: (t, a) => (vang(a) > 2.2 ? pad : color),
      });
    const c = place(talon(r * 1.9, r * 0.5, clawColor, clawTip), [0, -h + r * 0.95, -len + r * 0.15]);
    parts.push(place(merge([toe, c]), [0, 0, 0], [0, ang, 0]));
  }
  // heel / ankle pad
  parts.push(part(blob(r * 1.5, h * 0.55, r * 1.7, color, { w: 7, h: 5 }), [0, -h * 0.45, -r * 0.2]));
  // small back toe (hallux)
  parts.push(place(talon(r * 0.9, r * 0.35, clawColor, clawTip), [-side * r * 0.9, -h * 0.55, r * 0.9], [0, Math.PI + side * 0.6, 0]));
  if (sickle) {
    // raised killing claw on the inner toe: stands up, curving forward
    const sx = -side * r * 1.25;
    parts.push(part(blob(r * 0.75, r * 0.9, r * 1.1, color, { w: 6, h: 4 }), [sx, -h * 0.35, -r * 1.2]));
    parts.push(place(talon(r * 3.4, r * 0.6, '#f3ead6', clawTip, 6), [sx, -h * 0.1, -r * 1.5], [1.25, 0, 0]));
  }
  return merge(parts);
}

/** Fill the rig with a theropod built from spec S (see raptor.js / trex.js). */
export function buildTheropod(S) {
  const C = S.col;
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, S.hipY, 0);

  // ---------------------------------------------------------------- torso
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;
  const T = S.torso;
  const bodyColor = countershade({ main: C.main, back: C.back, belly: C.belly, stripe: C.stripe, stripes: T.stripes, stripeWidth: T.stripeWidth ?? 0.4, bellyFrom: T.bellyFrom ?? 2.05, backTo: 0.7, stripePhase: 0.3 });
  let torso = tube(T.path.map((p) => V(0, p[0], p[1])), (t) => T.radius(t), { radial: T.radial ?? 12, color: bodyColor });
  // deeper, rounder belly
  torso = deform(torso, (v) => {
    if (v.y < T.bellyY) v.y = T.bellyY + (v.y - T.bellyY) * (T.bellyDrop ?? 1.15);
  });
  const torsoParts = [torso];
  // hip + shoulder muscle bulges hide the thigh tops
  for (const s of [-1, 1]) {
    torsoParts.push(part(blob(...T.hipBulge.r, C.main, { w: 8, h: 6 }), [s * T.hipBulge.x, T.hipBulge.y, T.hipBulge.z]));
    // a few dark stripes over the hips
    for (let i = 0; i < 2; i++) {
      const b = T.hipBulge.r;
      torsoParts.push(part(new THREE.BoxGeometry(b[0] * 0.25, b[1] * 0.9, b[2] * 0.22), C.stripe,
        [s * (T.hipBulge.x + b[0] * 0.72), T.hipBulge.y + b[1] * 0.25, T.hipBulge.z - b[2] * 0.25 + i * b[2] * 0.55], [0.35, 0, s * 0.45]));
    }
  }
  chest.add(mesh(merge(torsoParts)));

  // ---------------------------------------------------------------- neck
  const N = S.neck;
  const neckBase = new THREE.Group();
  neckBase.position.set(0, N.base[0], N.base[1]);
  body.add(neckBase);
  const neckColor = countershade({ main: C.main, back: C.back, belly: C.belly, stripe: C.stripe, stripes: N.stripes ?? 2, stripeWidth: 0.3, bellyFrom: N.bellyFrom ?? 1.75, backTo: 0.65, stripePhase: 0.55 });
  rig.neck = chain(neckBase, N.segs, { dir: 'fwd', color: neckColor, radial: N.radial ?? 10, capFirst: false });

  // ---------------------------------------------------------------- head
  const head = new THREE.Group();
  head.position.set(0, 0, -N.segs[N.segs.length - 1].len);
  head.rotation.x = S.head.rest;
  rig.neck[rig.neck.length - 1].add(head);
  rig.head = head;
  const { jaw, lids } = buildHead(head, S.head, C);
  rig.jaw = jaw;
  rig.eyelids.push(lids);

  // ---------------------------------------------------------------- tail
  const TL = S.tail;
  const tailBase = new THREE.Group();
  tailBase.position.set(0, TL.base[0], TL.base[1]);
  body.add(tailBase);
  const tailColor = countershade({ main: C.main, back: C.back, belly: C.belly, stripe: C.stripe, stripes: TL.stripes, stripeWidth: TL.stripeWidth ?? 0.42, bellyFrom: 2.25, backTo: 0.7, stripePhase: 0.15 });
  const tailSegs = [];
  for (let i = 0; i < TL.len.length; i++) {
    const r0 = TL.r[i], r1 = TL.r[i + 1];
    tailSegs.push({ len: TL.len[i], r0: [r0, r0 * TL.flat], r1: [r1, r1 * TL.flat], rx: TL.rx[i] });
  }
  rig.tail = chain(tailBase, tailSegs, { dir: 'back', color: tailColor, radial: TL.radial ?? 9, capFirst: false });

  // ---------------------------------------------------------------- legs
  for (const side of [-1, 1]) rig.legs.push(buildLeg(body, S.leg, side, C));
  rig.legs[0].offset = 0;
  rig.legs[1].offset = 0.5;

  // ---------------------------------------------------------------- arms
  for (const side of [-1, 1]) rig.arms.push(buildArm(chest, S.arm, side, C));

  // ---------------------------------------------------------------- hit zones
  const HZ = S.hit;
  rig.hitZones.push({ zone: 'head', joint: head, offset: V(...HZ.head[0]), radius: HZ.head[1] });
  if (HZ.snout) rig.hitZones.push({ zone: 'head', joint: head, offset: V(...HZ.snout[0]), radius: HZ.snout[1] });
  rig.neck.forEach((j, i) => rig.hitZones.push({ zone: 'neck', joint: j, offset: V(0, 0, -N.segs[i].len * 0.5), radius: HZ.neck[i] }));
  for (const [o, r] of HZ.body) rig.hitZones.push({ zone: 'body', joint: body, offset: V(...o), radius: r });
  for (const leg of rig.legs) {
    rig.hitZones.push({ zone: 'leg', joint: leg.hip, offset: V(0, -leg.l1 * 0.45, 0), radius: HZ.thigh });
    rig.hitZones.push({ zone: 'leg', joint: leg.knee, offset: V(0, -leg.l2 * 0.5, 0), radius: HZ.shin });
  }
  rig.tail.slice(0, 4).forEach((j, i) => rig.hitZones.push({ zone: 'tail', joint: j, offset: V(0, 0, TL.len[i] * 0.5), radius: TL.r[i] * 1.05 }));

  rig.finalize();
  // feet stand slightly in front of the hip joints (under the centre of mass)
  for (const leg of rig.legs) leg.restZ -= S.leg.footForward || 0;
  standPose(rig, S.anim);
  return rig;
}

/** Solve the leg IK once so the rest pose (and bounding box) is a proper stance. */
function standPose(rig, params) {
  const a = new DinoAnimator(rig, params);
  a.update(0, { speed: 0, dist: 0, yawRate: 0, dead: false, trapped: false, groundAt: () => 0 });
  const keep = new Map();
  for (const leg of rig.legs) for (const j of [leg.hip, leg.knee, leg.ankle, leg.foot]) if (j) keep.set(j, j.rotation.clone());
  for (const [o, r] of rig.rest) if (!keep.has(o)) o.rotation.copy(r);
  for (const [o, r] of keep) o.rotation.copy(r);
  rig.body.position.y = rig.bodyRestY;
  if (rig.chest) rig.chest.scale.set(1, 1, 1);
  rig.tilt.position.set(0, 0, 0);
}

function buildHead(head, P, C) {
  const span = P.back + P.L;
  const zAt = (t) => P.back - t * span;
  const tAt = (z) => (P.back - z) / span;
  const rxAt = (t) => (t < 0.18 ? P.W * (0.78 + (t / 0.18) * 0.22) : lerp(P.W, P.tipW, Math.pow((t - 0.18) / 0.82, P.taper ?? 0.9)));
  const ryAt = (t) => (t < 0.12 ? P.H * (0.8 + (t / 0.12) * 0.2) : t < 0.3 ? P.H : lerp(P.H, P.tipH, (t - 0.3) / 0.7));
  const cyAt = (t) => P.mouthY + ryAt(t) * 0.8;

  // ---- skull + upper jaw
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(V(0, cyAt(t), zAt(t)));
  }
  let skull = tube(pts, (t) => [rxAt(t), ryAt(t)], {
    radial: P.radial ?? 10,
    color: (t, a) => {
      const aa = vang(a);
      if (aa > 2.3) return C.mouth;            // palate
      if (aa > 1.75) return C.lip ?? C.main;
      if (aa < 0.55 && t < 0.75) return C.back;
      if (P.stripes && aa < 1.4 && t < 0.2 && ((t * 12) % 1) < 0.45) return C.stripe;
      return C.main;
    },
  });
  const mY = P.mouthY;
  skull = deform(skull, (v) => {
    if (v.y < mY) v.y = mY - (mY - v.y) * 0.12;
    // squarer, flatter skull roof (esp. T-Rex)
    const top = v.y - mY;
    if (P.flatTop && top > 0) v.y = mY + top * (1 - P.flatTop * Math.max(0, top / (P.H * 2) - 0.6));
  });
  const parts = [skull];

  // nostrils
  const tn = 0.93;
  for (const s of [-1, 1]) {
    parts.push(part(blob(P.nostril, P.nostril * 0.55, P.nostril * 1.2, '#3a1f18', { w: 6, h: 4 }),
      [s * rxAt(tn) * 0.55, cyAt(tn) + ryAt(tn) * 0.72, zAt(tn)], [0.3, 0, 0]));
  }
  // cheek bumps (jugal) behind/below the eye
  for (const s of [-1, 1]) {
    const tc = P.cheek.t;
    parts.push(part(blob(...P.cheek.r, C.main, { w: 7, h: 5 }), [s * rxAt(tc) * 0.92, mY + ryAt(tc) * P.cheek.up, zAt(tc)]));
  }
  // horns / brow bosses above the eyes and bumps along the snout
  const te = P.eye.t;
  for (const s of [-1, 1]) {
    if (P.horn) parts.push(part(blob(...P.horn.r, C.back, { w: 6, h: 4 }), [s * rxAt(P.horn.t) * P.horn.x, cyAt(P.horn.t) + ryAt(P.horn.t) * P.horn.up, zAt(P.horn.t)], [0.2, 0, s * 0.3]));
    for (const b of P.bumps || []) parts.push(part(blob(b.r, b.r * 0.7, b.r * 1.3, C.back, { w: 5, h: 4 }), [s * rxAt(b.t) * b.x, cyAt(b.t) + ryAt(b.t) * 0.9, zAt(b.t)]));
  }

  // upper teeth: rows along both lip edges + a few across the tip
  const TE = P.teeth;
  const ty = mY + TE.size * 0.15;
  const t0 = TE.from, t1 = TE.to;
  for (const s of [-1, 1]) {
    parts.push(teethRow(V(s * rxAt(t0) * 0.86, ty, zAt(t0)), V(s * rxAt(t1) * 0.86, ty, zAt(t1)), TE.upper, TE.size, -1, C.tooth));
  }
  const tf = 0.975;
  parts.push(teethRow(V(-rxAt(tf) * 0.55, ty, zAt(tf)), V(rxAt(tf) * 0.55, ty, zAt(tf)), TE.front, TE.size * 0.75, -1, C.tooth));
  // dark throat backing so the open mouth doesn't look hollow
  parts.push(part(blob(P.W * 0.7, P.H * 0.55, P.H * 0.6, C.throat ?? '#5a2226', { w: 7, h: 5 }), [0, mY - P.H * 0.25, zAt(0.1)]));
  head.add(mesh(merge(parts)));

  // eyes, lids, brow ridges
  const ey = cyAt(te) + ryAt(te) * P.eye.up;
  const ex = rxAt(te) * Math.sqrt(1 - P.eye.up * P.eye.up) * 0.92;
  const lids = sideEyes(head, { x: ex, y: ey, z: zAt(te), size: P.eye.size, iris: C.iris, lid: C.back, yaw: P.eye.yaw ?? 0.3, pitch: 0 });

  // ---- lower jaw
  const jaw = new THREE.Group();
  const hingeZ = zAt(P.hingeT);
  jaw.position.set(0, mY - 0.001, hingeZ);
  jaw.rotation.x = -P.jawRest;
  head.add(jaw);
  const jLen = P.jawLen;
  const jd = (t) => P.jawDepth * (1 - t * 0.45);
  const jrx = (t) => rxAt(tAt(hingeZ - t * jLen)) * 0.9;
  const jpts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    jpts.push(V(0, -jd(t) * 0.55, -t * jLen + (i === 0 ? P.back * 0.35 : 0)));
  }
  let jawGeo = tube(jpts, (t) => [jrx(t), jd(t)], {
    radial: P.radial ?? 10,
    color: (t, a) => {
      const aa = vang(a);
      if (aa < 1.0) return C.tongue;
      if (aa > (P.jawCream ?? 1.7)) return C.belly;
      return C.main;
    },
  });
  jawGeo = deform(jawGeo, (v) => { if (v.y > 0) v.y *= 0.12; });
  const jparts = [jawGeo];
  const jt0 = TE.lowFrom, jt1 = TE.lowTo;
  for (const s of [-1, 1]) {
    jparts.push(teethRow(V(s * jrx(jt0) * 0.8, -TE.size * 0.1, -jt0 * jLen), V(s * jrx(jt1) * 0.8, -TE.size * 0.1, -jt1 * jLen), TE.lower, TE.size * 0.9, 1, C.tooth));
  }
  jparts.push(teethRow(V(-jrx(0.97) * 0.45, -TE.size * 0.1, -0.97 * jLen), V(jrx(0.97) * 0.45, -TE.size * 0.1, -0.97 * jLen), 2, TE.size * 0.7, 1, C.tooth));
  // chin / throat pouch in cream
  jparts.push(part(blob(jrx(0.2) * 0.85, P.jawDepth * 0.7, jLen * 0.3, C.belly, { w: 8, h: 5 }), [0, -P.jawDepth * 0.75, -jLen * 0.22]));
  jaw.add(mesh(merge(jparts)));
  return { jaw, lids };
}

function buildLeg(body, L, side, C) {
  const hip = new THREE.Group();
  hip.position.set(side * L.x, L.y, L.z);
  body.add(hip);
  const legColor = (stripes) => (t, a) => {
    const aa = vang(a); // 0 = front (-Z), PI = back
    if (stripes && aa > 1.25 && ((t * stripes + 0.15) % 1) < 0.3) return C.stripe;
    if (aa < 0.5 && t < 0.5) return C.main;
    return t > 0.85 ? C.legDark : C.leg;
  };
  // thigh: muscular drumstick, overlaps up into the hip bulge
  const thigh = tube([V(0, L.thighR * 0.6, L.thighR * 0.1), V(0, -L.l1 * 0.4, -L.thighR * 0.12), V(0, -L.l1, 0)],
    (t) => { const k = t < 0.35 ? 1 : 1 - (t - 0.35) * 0.95; return [L.thighR * k * 0.82, L.thighR * k]; },
    { radial: L.radial ?? 9, up: V(0, 0, -1), color: legColor(L.thighStripes ?? 3) });
  hip.add(mesh(thigh));

  const knee = new THREE.Group();
  knee.position.y = -L.l1;
  hip.add(knee);
  const shin = tube([V(0, L.shinR * 0.9, 0), V(0, -L.l2 * 0.35, L.shinR * 0.15), V(0, -L.l2, 0)],
    (t) => [L.shinR * (1.05 - t * 0.45), L.shinR * (1.15 - t * 0.5)],
    { radial: L.radial ?? 9, up: V(0, 0, -1), color: legColor(0) });
  const kneeCap = part(blob(L.shinR * 0.95, L.shinR * 1.0, L.shinR * 1.05, C.leg, { w: 7, h: 5 }), [0, 0, -L.shinR * 0.2]);
  knee.add(mesh(merge([shin, kneeCap])));

  const ankle = new THREE.Group();
  ankle.position.y = -L.l2;
  knee.add(ankle);
  const meta = tube([V(0, L.metaR * 0.6, 0), V(0, -L.l3 * 0.5, 0), V(0, -L.l3 + L.metaR * 0.3, 0)],
    (t) => [L.metaR * (1.05 - t * 0.15), L.metaR * (1.2 - t * 0.25)],
    { radial: 7, up: V(0, 0, -1), color: () => C.legDark });
  const ankleKnob = part(blob(L.metaR * 1.3, L.metaR * 1.3, L.metaR * 1.4, C.legDark, { w: 6, h: 5 }), [0, 0, L.metaR * 0.1]);
  ankle.add(mesh(merge([meta, ankleKnob])));

  const foot = new THREE.Group();
  foot.position.y = -L.l3;
  ankle.add(foot);
  const footGeo = theroFoot({ toeLen: L.toeLen, r: L.toeR, h: L.footH0, color: C.legDark, pad: C.pad ?? C.legDark, clawColor: C.claw, clawTip: C.clawTip, sickle: L.sickle, side });
  footGeo.computeBoundingBox();
  foot.add(mesh(footGeo));
  const footH = -footGeo.boundingBox.min.y;
  return { hip, knee, ankle, foot, l1: L.l1, l2: L.l2, l3: L.l3, metaAngle: L.metaAngle, footH, kneeDir: 1, front: false, side };
}

function buildArm(chest, A, side, C) {
  const sh = new THREE.Group();
  sh.position.set(side * A.x, A.y, A.z);
  sh.rotation.set(A.rest, 0, side * A.splay);
  sh.userData.side = side < 0 ? 0 : Math.PI;
  chest.add(sh);
  const upper = tube([V(0, A.r * 0.8, 0), V(0, -A.upper * 0.5, 0), V(0, -A.upper, 0)], (t) => A.r * (1.15 - t * 0.35),
    { radial: 7, up: V(0, 0, -1), color: (t, a) => (vang(a) < 1.2 ? C.main : C.leg) });
  sh.add(mesh(upper));
  const elbow = new THREE.Group();
  elbow.position.y = -A.upper;
  elbow.rotation.x = A.elbow;
  sh.add(elbow);
  const fore = tube([V(0, A.r * 0.7, 0), V(0, -A.fore * 0.5, 0), V(0, -A.fore, 0)], (t) => A.r * (0.9 - t * 0.3),
    { radial: 7, up: V(0, 0, -1), color: () => C.leg });
  const hand = [fore];
  const n = A.fingers;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.5;
    const fl = A.finger * (1 - Math.abs(k) * 0.3);
    const f = tube([V(0, 0, 0), V(0, -fl * 0.6, -fl * 0.15), V(0, -fl, -fl * 0.1)], (t) => A.r * 0.38 * (1 - t * 0.3),
      { radial: 5, up: V(0, 0, -1), color: () => C.leg });
    const c = place(talon(A.claw, A.r * 0.26, C.claw, C.clawTip), [0, -fl, -fl * 0.1], [-1.1, 0, 0]);
    hand.push(place(merge([f, c]), [k * A.r * 1.3 * side, -A.fore * 0.95, 0], [0.25, 0, k * 0.4]));
  }
  elbow.add(mesh(merge(hand)));
  return sh;
}

/**
 * Shared extra motion: attack lunge, run lean (neck down / tail up),
 * a clean death pose (body lies on its side, limp legs).
 * cfg: { lunge, attackNeck, runNeck, runTail, deadSide, limp:[hip,knee,ankle] }
 */
export function theropodExtra(view, dt, cfg) {
  const a = view.anim, rig = view.rig;
  if (!a || !rig) return;
  const c = a.c;
  const moving = a.amp * (1 - a.dead) * (1 - a.trapped);
  const run = a.runBlend * moving;

  // attack: lunge forward from the hips, neck thrusts horizontally
  rig.body.position.z = -c.attack * cfg.lunge;
  const nn = rig.neck.length;
  rig.neck.forEach((j, i) => {
    j.rotation.x += (-c.attack * cfg.attackNeck - run * cfg.runNeck) / nn * (i === 0 ? 1.6 : 0.7);
  });
  if (rig.head) rig.head.rotation.x += run * cfg.runNeck * 0.6 + c.attack * cfg.attackNeck * 0.3;
  // tail: counterbalance – raised when running / lunging
  rig.tail.forEach((j, i) => {
    j.rotation.x -= (run * cfg.runTail + c.attack * cfg.runTail * 0.6) * (i === 0 ? 1 : 0.12);
  });

  // death: roll fully onto the side and relax the legs
  const d = a.dead;
  if (d > 0.001) {
    const h = rig.bodyRestY;
    rig.tilt.position.y = d * (cfg.deadSide - h * Math.cos(Math.PI * 0.46));
    const k = clamp01(d * 1.3);
    rig.legs.forEach((leg, i) => {
      const w = i === 0 ? 1 : 0.8;
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, cfg.limp[0] * w, k);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, cfg.limp[1] * w, k);
      if (leg.ankle) leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, cfg.limp[2], k);
      if (leg.foot) leg.foot.rotation.x = lerp(leg.foot.rotation.x, cfg.limp[3], k);
    });
    rig.arms.forEach((arm) => { arm.rotation.x = lerp(arm.rotation.x, rig.restX(arm) + 0.6, k); });
  }
}

export { DS, lerp, clamp01 };
