// T-Rex: heavy red-orange apex predator with a continuous countershaded hide,
// deep skull, broad jaw, tiny two-fingered arms and a muscular balancing tail.
// Uses the same shaped, jointed theropod anatomy as the Velociraptor.

import { buildTheropod, theropodExtra } from './theropod.js';

const COL = {
  main: '#d96843', back: '#a94335', stripe: '#81362f', belly: '#f2d8ac',
  leg: '#c75a3b', legDark: '#a74635', pad: '#874333',
  claw: '#dfd2b4', clawTip: '#332a2a',
  mouth: '#622a31', throat: '#3d1e27', tongue: '#c76b70',
  tooth: '#fff1d7', iris: '#cf9b38',
};

export const TREX_ANIM = {
  gait: 'biped', walkSpeed: 2.6, walkStride: 3.8,
  runStride: 5.5, runSpeed: 7.6, walkDuty: 0.65, runDuty: 0.45,
  stepHeight: 0.42, bob: 0.11, sway: 0.035,
  tailSway: 0.035, tailFollow: 0.38, neckFollow: 0.23,
  breathe: 0.012, headLook: 0.42, neckDip: 0.24,
  jawOpen: 0.8, blinkEvery: 5,
};

const SPEC = {
  col: COL, anim: TREX_ANIM, hipY: 3.1,
  torso: {
    path: [[0.02, 1.65], [0.0, 0.95], [0.0, 0.15], [0.1, -0.65], [0.2, -1.4]],
    radius: (t) => {
      const bulk = Math.sin(Math.PI * Math.min(1, t * 0.92));
      return [0.58 + 0.46 * bulk, 0.56 + 0.45 * bulk];
    },
    radial: 14, bellyY: -0.15, bellyDrop: 1.22,
    stripes: 7, stripeWidth: 0.3,
    hipBulge: { x: 0.72, y: -0.17, z: 0.72, r: [0.4, 0.6, 0.68] },
  },
  neck: {
    base: [0.22, -1.35],
    segs: [
      { len: 0.55, r0: [0.53, 0.58], r1: [0.49, 0.5], rx: 0.12 },
      { len: 0.48, r0: [0.49, 0.5], r1: [0.42, 0.44], rx: -0.08 },
      { len: 0.42, r0: [0.42, 0.44], r1: [0.37, 0.39], rx: -0.12 },
    ],
    radial: 12, stripes: 2,
  },
  head: {
    rest: -0.1, L: 1.65, back: 0.34,
    W: 0.48, H: 0.43, tipW: 0.32, tipH: 0.27,
    taper: 0.65, flatTop: 0.35, mouthY: -0.18, radial: 14,
    hingeT: 0.12, jawLen: 1.56, jawDepth: 0.25, jawRest: 0.12,
    jawCream: 1.6,
    eye: { t: 0.2, up: 0.44, size: 0.1, yaw: 0.25 },
    nostril: 0.04,
    cheek: { t: 0.2, r: [0.18, 0.2, 0.29], up: 0.2 },
    horn: { t: 0.17, r: [0.15, 0.09, 0.24], x: 0.55, up: 0.9 },
    bumps: [{ t: 0.42, r: 0.06, x: 0.85 }, { t: 0.67, r: 0.045, x: 0.82 }],
    stripes: true,
    teeth: { from: 0.96, to: 0.36, upper: 11, lower: 10, front: 4,
      size: 0.14, lowFrom: 0.93, lowTo: 0.35 },
  },
  tail: {
    base: [0.03, 1.52],
    len: [0.86, 0.83, 0.77, 0.71, 0.65, 0.57, 0.5],
    r: [0.72, 0.62, 0.5, 0.39, 0.29, 0.2, 0.12, 0.035],
    rx: [-0.06, -0.03, 0, 0.01, 0.01, 0.02, 0.02],
    flat: 1.1, radial: 11, stripes: 10,
  },
  leg: {
    x: 0.78, y: -0.12, z: 0.7,
    l1: 1.3, l2: 1.22, l3: 0.46, metaAngle: 0.4,
    thighR: 0.48, shinR: 0.21, metaR: 0.11,
    toeLen: 0.55, toeR: 0.095, footH0: 0.12,
    sickle: false, footForward: 0.23, thighStripes: 3, radial: 10,
  },
  arm: {
    x: 0.8, y: 0.04, z: -1.25,
    rest: -0.5, splay: 0.18, elbow: 1.2,
    upper: 0.34, fore: 0.27, r: 0.085,
    fingers: 2, finger: 0.13, claw: 0.09,
  },
  hit: {
    head: [[0, 0.12, -0.3], 0.72],
    snout: [[0, -0.1, -1.05], 0.4],
    neck: [0.54, 0.5, 0.45],
    body: [[[0, 0, 0.75], 1.1], [[0, 0.05, -0.45], 1.1]],
    thigh: 0.53, shin: 0.26,
  },
};

export function buildTrex() { return buildTheropod(SPEC); }

const EXTRA = { lunge: 0.42, attackNeck: 0.32, runNeck: 0.15,
  runTail: 0.11, deadSide: 0.55, limp: [0.5, -0.9, 0.55, 0.2] };

export function trexExtraUpdate(view, dt) {
  theropodExtra(view, dt, EXTRA);
  if (view.rig.jaw && view.anim.c.roar > 0) {
    view.rig.jaw.rotation.x -= view.anim.c.roar * 0.38;
  }
}
