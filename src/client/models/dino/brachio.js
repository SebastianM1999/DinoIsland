// Brachiosaurus: blue-violet, cream belly and neck underside, very long curved
// neck, small head with a nostril dome, thick pillar legs, long tapering tail.
// See inspiration/model-art.png and inspiration/3-dino-models.png.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, tube, blob } from '../kit.js';
import { Rig } from './rig.js';
import { countershade, chain, sideEyes, teethRow, pillarFoot, V } from './parts.js';

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

export function buildBrachio() {
  const rig = new Rig();
  const body = rig.body;
  body.position.set(0, 3.75, 0);

  // ---- torso (in a chest group so it can breathe)
  const chest = new THREE.Group();
  body.add(chest);
  rig.chest = chest;
  const bodyColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, stripe: COL.stripe, stripes: 5, stripeWidth: 0.22, bellyFrom: 1.9, backTo: 0.7 });
  const torso = tube(
    [V(0, -0.05, 3.0), V(0, 0.1, 1.7), V(0, 0.25, 0.1), V(0, 0.65, -1.7), V(0, 1.0, -2.95)],
    (t) => {
      const r = t < 0.3 ? 0.85 + t * 2.2 : t < 0.6 ? 1.5 + (t - 0.3) * 0.8 : 1.74 - (t - 0.6) * 1.55;
      return [r * 0.92, r * (t > 0.25 && t < 0.75 ? 1.02 : 0.95)];
    },
    { radial: 12, color: bodyColor },
  );
  // shoulder + hip muscle bulges
  const bulges = [];
  for (const s of [-1, 1]) {
    bulges.push(part(blob(0.55, 0.9, 0.9, COL.main, { w: 8, h: 6 }), [s * 1.05, 0.2, -2.1]));
    bulges.push(part(blob(0.55, 0.85, 1.0, COL.main, { w: 8, h: 6 }), [s * 1.0, -0.05, 1.7]));
  }
  chest.add(mesh(merge([torso, ...bulges])));

  // ---- legs
  const mkLeg = (x, y, z, l1, l2, r1, r2, front, side) => {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    body.add(hip);
    const thighGeo = tube([V(0, 0.55, 0), V(0, -l1 * 0.5, 0), V(0, -l1 - r2 * 0.6, 0)], (t) => [r1 * (1.1 - t * 0.35), r1 * 1.15 * (1.1 - t * 0.35)], {
      radial: 9, up: V(0, 0, -1), color: (t, a) => (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) > 2.4 && t < 0.4 ? COL.belly : COL.leg),
    });
    hip.add(mesh(thighGeo));
    const knee = new THREE.Group();
    knee.position.y = -l1;
    hip.add(knee);
    const shinGeo = tube([V(0, r2 * 0.5, 0), V(0, -l2 * 0.5, 0), V(0, -l2 + 0.05, 0)], (t) => r2 * (1.05 - t * 0.1), {
      radial: 9, up: V(0, 0, -1), color: (t) => (t > 0.75 ? COL.legDark : COL.leg),
    });
    knee.add(mesh(shinGeo));
    const foot = new THREE.Group();
    foot.position.y = -l2;
    knee.add(foot);
    foot.add(mesh(pillarFoot(r2 * 1.1, 0.45, COL.legDark, COL.nail)));
    return { hip, knee, foot, l1, l2, footH: 0.45, kneeDir: front ? -1 : 1, front, side };
  };
  const LH = mkLeg(-1.0, -0.4, 1.75, 1.55, 1.38, 0.62, 0.44, false, -1);
  const RH = mkLeg(1.0, -0.4, 1.75, 1.55, 1.38, 0.62, 0.44, false, 1);
  const LF = mkLeg(-1.08, 0.0, -2.15, 1.78, 1.66, 0.55, 0.42, true, -1);
  const RF = mkLeg(1.08, 0.0, -2.15, 1.78, 1.66, 0.55, 0.42, true, 1);
  // lateral-sequence walk: LH, LF, RH, RF
  LH.offset = 0; LF.offset = 0.25; RH.offset = 0.5; RF.offset = 0.75;
  rig.legs.push(LH, LF, RH, RF);

  // ---- neck (6 segments rising in a gentle curve)
  const neckBase = new THREE.Group();
  neckBase.position.set(0, 1.15, -2.55);
  body.add(neckBase);
  const neckColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 1.7, backTo: 0.6 });
  const neckSegs = [
    { len: 1.3, r0: [0.95, 1.08], r1: [0.76, 0.86], rx: 0.72 },
    { len: 1.3, r0: [0.76, 0.86], r1: [0.63, 0.7], rx: 0.17 },
    { len: 1.25, r0: [0.63, 0.7], r1: [0.53, 0.58], rx: 0.13 },
    { len: 1.2, r0: [0.53, 0.58], r1: [0.45, 0.49], rx: 0.09 },
    { len: 1.15, r0: [0.45, 0.49], r1: [0.38, 0.41], rx: 0.02 },
    { len: 1.05, r0: [0.38, 0.41], r1: [0.31, 0.34], rx: -0.1 },
  ];
  rig.neck = chain(neckBase, neckSegs, { dir: 'fwd', color: neckColor, radial: 10, capFirst: false });

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 0, -neckSegs[neckSegs.length - 1].len);
  head.rotation.x = -1.12;
  rig.neck[rig.neck.length - 1].add(head);
  rig.head = head;
  const headColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, bellyFrom: 2.0, backTo: 0.8 });
  const skull = tube([V(0, 0.02, 0.28), V(0, 0.04, -0.3), V(0, -0.02, -0.75), V(0, -0.06, -1.02)],
    (t) => [0.34 - t * 0.14, 0.34 - t * 0.17], { radial: 10, color: headColor });
  const dome = part(blob(0.22, 0.2, 0.34, COL.main, { w: 8, h: 6 }), [0, 0.3, -0.38]);   // nostril arch
  const nostrils = merge([
    part(blob(0.05, 0.03, 0.07, '#2a2440'), [-0.08, 0.47, -0.52]),
    part(blob(0.05, 0.03, 0.07, '#2a2440'), [0.08, 0.47, -0.52]),
  ]);
  const cheeks = merge([
    part(blob(0.12, 0.13, 0.2, COL.main), [-0.24, -0.1, -0.2]),
    part(blob(0.12, 0.13, 0.2, COL.main), [0.24, -0.1, -0.2]),
  ]);
  const mouthLine = part(new THREE.BoxGeometry(0.5, 0.02, 0.62), '#3b3470', [0, -0.13, -0.66]);
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

  // ---- tail (8 segments tapering to a whip)
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.05, 2.75);
  body.add(tailBase);
  const tailColor = countershade({ main: COL.main, back: COL.back, belly: COL.belly, stripe: COL.stripe, stripes: 7, stripeWidth: 0.3, bellyFrom: 2.2, backTo: 0.7 });
  const tailSegs = [];
  const tr = [0.95, 0.78, 0.62, 0.48, 0.36, 0.26, 0.17, 0.1, 0.05];
  const tl = [1.3, 1.25, 1.2, 1.15, 1.05, 1.0, 0.95, 0.9];
  const trx = [0.22, 0.06, 0.02, -0.02, -0.04, -0.04, -0.03, -0.02];
  for (let i = 0; i < 8; i++) tailSegs.push({ len: tl[i], r0: [tr[i], tr[i] * 1.05], r1: [tr[i + 1], tr[i + 1] * 1.05], rx: trx[i] });
  rig.tail = chain(tailBase, tailSegs, { dir: 'back', color: tailColor, radial: 9, capFirst: false });

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

  return rig.finalize();
}
