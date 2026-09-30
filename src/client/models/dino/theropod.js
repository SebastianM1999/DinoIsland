// Shared builder for bipedal theropods (Velociraptor, T-Rex): countershaded
// torso, S-curved neck, big-jawed head with individual teeth, stiff/heavy
// tail, digitigrade legs with 3-toed clawed feet and small grasping arms.
// Species files (raptor.js, trex.js) only provide measurements + colors.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, blob, deform } from '../kit.js';
import { Rig, DinoAnimator } from './rig.js';
import { SkinBuilder, loft, restPoint } from './skin.js';
import { countershade, chain, sideEyes, teethRow, tube, spike, V } from './parts.js';
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
  parts.push(place(blob(r * 1.5, h * 0.55, r * 1.7, color, { w: 7, h: 5 }), [0, -h * 0.45, -r * 0.2]));
  // small back toe (hallux)
  parts.push(place(talon(r * 0.9, r * 0.35, clawColor, clawTip), [-side * r * 0.9, -h * 0.55, r * 0.9], [0, Math.PI + side * 0.6, 0]));
  if (sickle) {
    // raised killing claw on the inner toe: stands up, curving forward
    const sx = -side * r * 1.25;
    parts.push(place(blob(r * 0.75, r * 0.9, r * 1.1, color, { w: 6, h: 4 }), [sx, -h * 0.35, -r * 1.2]));
    parts.push(place(talon(r * 3.4, r * 0.6, '#f3ead6', clawTip, 6), [sx, -h * 0.1, -r * 1.5], [1.25, 0, 0]));
  }
  return merge(parts);
}

/** Joint chain without geometry (the skin covers it). dir: 'fwd' (-Z) or 'back' (+Z). */
export function jointChain(parent, segs, dir) {
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

/** Fill the rig with a theropod built from spec S (see raptor.js / trex.js). */
export function buildTheropod(S) {
  const C = S.col;
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, S.hipY, 0);
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;

  // ---------------------------------------------------------------- skeleton
  const N = S.neck;
  const neckBase = new THREE.Group();
  neckBase.position.set(0, N.base[0], N.base[1]);
  chest.add(neckBase);
  rig.neck = jointChain(neckBase, N.segs, 'fwd');

  const head = new THREE.Group();
  head.position.set(0, 0, -N.segs[N.segs.length - 1].len);
  head.rotation.x = S.head.rest;
  rig.neck[rig.neck.length - 1].add(head);
  rig.head = head;
  const { jaw, lids } = buildHead(head, S.head, C);
  rig.jaw = jaw;
  rig.eyelids.push(lids);

  const TL = S.tail;
  const tailBase = new THREE.Group();
  tailBase.position.set(0, TL.base[0], TL.base[1]);
  body.add(tailBase);
  rig.tail = jointChain(tailBase, TL.len.map((len, i) => ({ len, rx: TL.rx[i] })), 'back');

  for (const side of [-1, 1]) rig.legs.push(buildLeg(body, S.leg, side, C));
  rig.legs[0].offset = 0;
  rig.legs[1].offset = 0.5;
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

  rig.finalize({ gaps: false });
  // feet stand slightly in front of the hip joints (under the centre of mass)
  for (const leg of rig.legs) leg.restZ -= S.leg.footForward || 0;
  standPose(rig, S.anim);

  // ---------------------------------------------------------------- skin
  buildSkin(rig, S, { neckBase, tailBase });
  rig.fillHitGaps();
  return rig;
}

/**
 * The soft body as one skinned surface: head -> neck -> torso -> tail in one
 * loft, plus a loft per leg (thigh top buried in the hips) and per arm.
 */
function buildSkin(rig, S, { neckBase, tailBase }) {
  const C = S.col, T = S.torso, N = S.neck, TL = S.tail, H = S.head, L = S.leg, A = S.arm;
  const root = rig.root, body = rig.body, chest = rig.chest, head = rig.head;
  const at = (obj, x = 0, y = 0, z = 0) => restPoint(root, obj, [x, y, z]);
  const pair = (r) => (Array.isArray(r) ? r : [r, r]);
  const st = [];
  const add = (p, rx, ry, bone, rb = ry) => st.push({ p, rx, ry, rb, bone });

  // head: the neck runs into the back of the skull (hidden inside it)
  const cy = H.mouthY + H.H * 0.75;
  add(at(head, 0, cy, -H.L * 0.28), H.W * 0.7, H.H * 0.6, head);
  add(at(head, 0, cy - H.H * 0.05, H.back * 0.2), H.W * 0.92, H.H * 0.88, head, H.H * 1.0);
  // neck, head end first (stations at the middle of each bone)
  for (let i = N.segs.length - 1; i >= 0; i--) {
    const g = N.segs[i];
    const r0 = pair(g.r0), r1 = pair(g.r1);
    add(at(rig.neck[i], 0, 0, -g.len * 0.5), (r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2, rig.neck[i], (r0[1] + r1[1]) / 2 * 1.08);
  }
  const nb = pair(N.segs[0].r0);
  add(at(neckBase), nb[0] * 1.05, nb[1], chest, nb[1] * 1.15);
  // torso, front to back, between the neck base and the tail base
  const nbz = at(neckBase).z, tbz = at(tailBase).z;
  const curve = new THREE.CatmullRomCurve3(T.path.map((q) => V(0, q[0], q[1])));
  for (let k = 8; k >= 0; k--) {
    const u = k / 8;
    const q = curve.getPoint(u);
    const p = at(body, 0, q.y, q.z);
    if (p.z < nbz + (tbz - nbz) * 0.12 || p.z > tbz - (tbz - nbz) * 0.1) continue;
    const [rx, ry] = pair(T.radius(u));
    add(p, rx, ry, q.z < 0 ? chest : body, ry * (T.bellyDrop ?? 1.15));
  }
  // tail
  add(at(tailBase), TL.r[0] * 1.05, TL.r[0] * TL.flat, body, TL.r[0] * TL.flat * 1.05);
  TL.len.forEach((len, i) => {
    const r = (TL.r[i] + TL.r[i + 1]) / 2;
    add(at(rig.tail[i], 0, 0, len * 0.5), r, r * TL.flat, rig.tail[i]);
  });
  const last = rig.tail.length - 1;
  add(at(rig.tail[last], 0, 0, TL.len[last]), TL.r[last + 1], TL.r[last + 1] * TL.flat, rig.tail[last]);

  const stripes = (T.stripes ?? 5) + (TL.stripes ?? 8) + (N.stripes ?? 2);
  const bodyColor = countershade({ main: C.main, back: C.back, belly: C.belly, stripe: C.stripe, stripes, stripeWidth: T.stripeWidth ?? 0.4, bellyFrom: T.bellyFrom ?? 2.0, backTo: 0.72, stripePhase: 0.2 });
  const skin = new SkinBuilder(root);
  skin.loft(loft(st, { radial: T.radial ? T.radial * 2 : 24, segs: 7, color: bodyColor, capStart: true, capEnd: true, dome: 0.8 }));

  // legs: drumstick thigh buried in the hip, slim shin, metatarsus into the foot
  const legColor = (t, a) => {
    const aa = vang(a); // 0 = front, PI = back
    const stripeK = L.thighStripes && t < 0.42 && aa > 1.3 && ((t * 7 + 0.2) % 1) < 0.35;
    if (stripeK) return C.stripe;
    if (t < 0.15) return C.main;
    return t > 0.7 ? C.legDark : C.leg;
  };
  for (const leg of rig.legs) {
    const ls = [];
    const push = (p, rx, ry, bone, rb = ry) => ls.push({ p, rx, ry, rb, bone });
    // two stations per bone (near both ends): the bone stays firm, the skin
    // only blends across the knee / ankle instead of bending like a hose
    const tr = L.thighR * (L.thighBulk ?? 1);
    push(at(leg.hip, 0, tr * 0.8, tr * 0.2), tr * 0.8, tr * 0.85, body);
    push(at(leg.hip, 0, -L.l1 * 0.18, -tr * 0.08), tr * 0.95, tr * 1.1, leg.hip);
    push(at(leg.hip, 0, -L.l1 * 0.55, -tr * 0.02), tr * 0.72, tr * 0.86, leg.hip);
    push(at(leg.hip, 0, -L.l1 * 0.9, 0), L.shinR * 1.25, L.shinR * 1.4, leg.hip);
    push(at(leg.knee, 0, -L.l2 * 0.14, L.shinR * 0.1), L.shinR * 1.12, L.shinR * 1.25, leg.knee);
    push(at(leg.knee, 0, -L.l2 * 0.55, L.shinR * 0.05), L.shinR * 0.9, L.shinR * 1.0, leg.knee);
    push(at(leg.knee, 0, -L.l2 * 0.9, 0), L.metaR * 1.4, L.metaR * 1.5, leg.knee);
    push(at(leg.ankle, 0, -L.l3 * 0.15, 0), L.metaR * 1.2, L.metaR * 1.3, leg.ankle);
    push(at(leg.ankle, 0, -L.l3 * 0.85, 0), L.metaR * 0.95, L.metaR * 1.05, leg.ankle);
    push(at(leg.foot, 0, -L.footH0 * 0.4, -L.metaR * 0.3), L.metaR * 1.15, L.metaR * 0.95, leg.foot);
    skin.loft(loft(ls, { up: V(0, 0, -1), radial: 16, segs: 6, color: legColor, dome: 0.7 }));
  }
  // arms: shoulder buried in the chest
  for (const sh of rig.arms) {
    const elbow = sh.children.find((c) => c.name === 'elbow');
    const as = [];
    const push = (p, r, bone) => as.push({ p, rx: r, ry: r, rb: r, bone });
    push(at(sh, 0, A.r * 1.6, 0), A.r * 1.3, chest);
    push(at(sh, 0, -A.upper * 0.45, 0), A.r * 1.1, sh);
    push(at(elbow, 0, -A.fore * 0.45, 0), A.r * 0.85, elbow);
    push(at(elbow, 0, -A.fore * 0.92, 0), A.r * 0.75, elbow);
    skin.loft(loft(as, { up: V(0, 0, -1), radial: 12, segs: 5, color: (t, a) => (vang(a) < 1.2 && t < 0.6 ? C.main : C.leg), dome: 0.6 }));
  }
  rig.skin = skin.build();
}

/** Solve the leg IK once so the rest pose (and bounding box) is a proper stance. */
export function standPose(rig, params) {
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
  /** skull surface height at t for a point at lateral fraction xk (0 centre .. 1 side), capped at `up`. */
  const flat = (y) => {
    const top = y - mY;
    return P.flatTop && top > 0 ? mY + top * (1 - P.flatTop * Math.max(0, top / (P.H * 2) - 0.6)) : y;
  };
  const surfY = (t, xk, up) => flat(cyAt(t) + ryAt(t) * Math.min(up, Math.sqrt(Math.max(0, 1 - xk * xk))));

  // nostrils
  const tn = 0.93;
  for (const s of [-1, 1]) {
    parts.push(place(blob(P.nostril, P.nostril * 0.55, P.nostril * 1.2, '#3a1f18', { w: 6, h: 4 }),
      [s * rxAt(tn) * 0.55, cyAt(tn) + ryAt(tn) * 0.72, zAt(tn)], [0.3, 0, 0]));
  }
  // cheek bumps (jugal) behind/below the eye
  for (const s of [-1, 1]) {
    const tc = P.cheek.t;
    parts.push(place(blob(...P.cheek.r, C.main, { w: 10, h: 7 }), [s * rxAt(tc) * 0.88, mY + ryAt(tc) * P.cheek.up, zAt(tc)]));
  }
  // horns / brow bosses above the eyes and bumps along the snout
  const te = P.eye.t;
  for (const s of [-1, 1]) {
    // sit on the (flattened) skull surface so nothing floats above the head
    if (P.horn) parts.push(place(blob(...P.horn.r, C.back, { w: 8, h: 6 }), [s * rxAt(P.horn.t) * P.horn.x, surfY(P.horn.t, P.horn.x, P.horn.up) - P.horn.r[1] * 0.35, zAt(P.horn.t)], [0.2, 0, s * 0.3]));
    for (const b of P.bumps || []) parts.push(place(blob(b.r, b.r * 0.7, b.r * 1.3, C.back), [s * rxAt(b.t) * b.x, surfY(b.t, b.x, 1) - b.r * 0.3, zAt(b.t)]));
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
  parts.push(place(blob(P.W * 0.7, P.H * 0.55, P.H * 0.6, C.throat ?? '#5a2226', { w: 7, h: 5 }), [0, mY - P.H * 0.25, zAt(0.1)]));
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
  jparts.push(place(blob(jrx(0.2) * 0.85, P.jawDepth * 0.7, jLen * 0.3, C.belly, { w: 8, h: 5 }), [0, -P.jawDepth * 0.75, -jLen * 0.22]));
  jaw.add(mesh(merge(jparts)));
  return { jaw, lids };
}

function buildLeg(body, L, side, C) {
  const hip = new THREE.Group();
  hip.position.set(side * L.x, L.y, L.z);
  body.add(hip);
  const knee = new THREE.Group();
  knee.position.y = -L.l1;
  hip.add(knee);
  const ankle = new THREE.Group();
  ankle.position.y = -L.l2;
  knee.add(ankle);
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
  const elbow = new THREE.Group();
  elbow.name = 'elbow';
  elbow.position.y = -A.upper;
  elbow.rotation.x = A.elbow;
  sh.add(elbow);
  // hand: fingers + claws (the forearm itself is part of the skin)
  const hand = [];
  const n = A.fingers;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.5;
    const fl = A.finger * (1 - Math.abs(k) * 0.3);
    const f = tube([V(0, fl * 0.2, 0), V(0, -fl * 0.6, -fl * 0.15), V(0, -fl, -fl * 0.1)], (t) => A.r * 0.4 * (1 - t * 0.3),
      { radial: 5, up: V(0, 0, -1), color: () => C.leg });
    const c = place(talon(A.claw, A.r * 0.26, C.claw, C.clawTip), [0, -fl, -fl * 0.1], [-1.1, 0, 0]);
    hand.push(place(merge([f, c]), [k * A.r * 1.3 * side, -A.fore * 0.9, 0], [0.25, 0, k * 0.4]));
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
