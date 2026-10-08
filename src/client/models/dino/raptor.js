// Velociraptor: orange with dark-brown stripes over back and tail, cream
// belly/throat, slim body, long stiff horizontal tail, raised sickle claw on
// each foot, grasping clawed hands, yellow eyes, open toothy mouth.
// See inspiration/model-art.png and inspiration/3-dino-models.png.

import { buildTheropod, theropodExtra, DS } from './theropod.js';

const COL = {
  main: '#ee8b3a',
  back: '#dd7430',
  stripe: '#7a3b1e',
  belly: '#f6e0b5',
  leg: '#e47e34',
  legDark: '#cf6a2b',
  pad: '#b95a28',
  claw: '#6e5d55',
  clawTip: '#241c1b',
  mouth: '#a53b3d',
  tongue: '#d4686b',
  throat: '#5a1e22',
  tooth: '#fbf6e6',
  iris: '#f7c61a',
};

export const RAPTOR_ANIM = {
  gait: 'biped',
  walkSpeed: 3.2,      // server walk speed (preview uses it)
  walkStride: 1.5,     // one full cycle (two steps) in metres
  runStride: 2.8,
  runSpeed: 10.2,
  walkDuty: 0.58,
  runDuty: 0.34,
  stepHeight: 0.15,
  bob: 0.03,
  sway: 0.03,
  tailSway: 0.05,      // stiff tail: little wave
  tailFollow: 0.3,
  neckFollow: 0.35,
  breathe: 0.03,
  headLook: 0.8,
  neckDip: 0.35,
  jawOpen: 0.6,
  blinkEvery: 3,
};

const SPEC = {
  col: COL,
  anim: RAPTOR_ANIM,
  hipY: 0.95,
  torso: {
    path: [[0.02, 0.36], [0.03, 0.08], [0.0, -0.2], [0.07, -0.45]],
    radius: (t) => {
      const b = Math.sin(Math.PI * Math.min(1, t * 1.08));
      return [0.115 + 0.09 * b, 0.125 + 0.1 * b];
    },
    radial: 11,
    bellyY: -0.03,
    bellyDrop: 1.2,
    stripes: 5,
    stripeWidth: 0.42,
    hipBulge: { x: 0.1, y: 0.0, z: 0.07, r: [0.09, 0.14, 0.16] },
  },
  neck: {
    base: [0.08, -0.4],
    segs: [
      { len: 0.17, r0: [0.11, 0.13], r1: [0.085, 0.1], rx: 0.95 },
      { len: 0.15, r0: [0.085, 0.1], r1: [0.07, 0.085], rx: -0.25 },
      { len: 0.12, r0: [0.07, 0.085], r1: [0.064, 0.078], rx: -0.35 },
    ],
    radial: 9,
    stripes: 2,
  },
  head: {
    rest: -0.4,
    L: 0.34, back: 0.07,
    W: 0.072, H: 0.068, tipW: 0.03, tipH: 0.034, taper: 0.85,
    mouthY: -0.03,
    radial: 10,
    hingeT: 0.1, jawLen: 0.33, jawDepth: 0.034, jawRest: 0.16, jawCream: 1.45,
    eye: { t: 0.2, up: 0.38, size: 0.022, yaw: 0.3 },
    nostril: 0.009,
    cheek: { t: 0.12, r: [0.028, 0.03, 0.045], up: 0.3 },
    horn: { t: 0.22, r: [0.02, 0.012, 0.045], x: 0.6, up: 0.98 },
    stripes: true,
    teeth: { from: 0.94, to: 0.42, upper: 6, lower: 5, front: 3, size: 0.022, lowFrom: 0.92, lowTo: 0.42 },
  },
  tail: {
    base: [0.03, 0.3],
    len: [0.24, 0.23, 0.22, 0.21, 0.2, 0.19, 0.18],
    r: [0.12, 0.1, 0.082, 0.066, 0.052, 0.04, 0.028, 0.01],
    rx: [-0.08, -0.02, 0, 0, 0, 0.01, 0.01],
    flat: 1.15,
    radial: 8,
    stripes: 9,
  },
  leg: {
    x: 0.1, y: -0.02, z: 0.04,
    l1: 0.38, l2: 0.43, l3: 0.24, metaAngle: 0.35,
    thighR: 0.12, thighBulk: 1.15, shinR: 0.06, metaR: 0.03,
    toeLen: 0.12, toeR: 0.02, footH0: 0.035,
    sickle: true, footForward: 0.05, thighStripes: 3, radial: 8,
  },
  arm: {
    x: 0.1, y: -0.06, z: -0.36,
    rest: -0.25, splay: 0.2, elbow: 1.25,
    upper: 0.13, fore: 0.12, r: 0.024,
    fingers: 3, finger: 0.045, claw: 0.036,
  },
  hit: {
    head: [[0, 0.02, -0.12], 0.14],
    snout: [[0, 0, -0.27], 0.08],
    neck: [0.11, 0.1, 0.09],
    body: [[[0, 0, 0.1], 0.24], [[0, 0.01, -0.22], 0.24]],
    thigh: 0.13,
    shin: 0.08,
  },
};

export function buildRaptor() {
  return buildTheropod(SPEC);
}

/** Procedural fallback for the Gloom Raptor (cave raptor): the raptor body with a pale cave palette and a longer, narrower snout. */
const GLOOM_COL = {
  ...COL, main: '#e3deec', back: '#aaa2bf', stripe: '#857da0', belly: '#fbfaff', leg: '#bcb4cc', legDark: '#aaa2bf', pad: '#7b7390',
  claw: '#4a4352', clawTip: '#cbc4cf', mouth: '#b0707e', tongue: '#cf8a94', throat: '#6d4658', tooth: '#efe9d8', iris: '#dfe2ea',
};
export function buildGloomRaptor() {
  return buildTheropod({ ...SPEC, col: GLOOM_COL, head: { ...SPEC.head, L: 0.4, W: 0.062, H: 0.062, taper: 0.8, eye: { ...SPEC.head.eye, size: 0.012 }, nostril: 0.018 } });
}

const EXTRA = { lunge: 0.28, attackNeck: 0.55, runNeck: 0.3, runTail: 0.12, deadSide: 0.19, limp: [0.7, -1.2, 1.0, 0.3] };

/** Bird-like head twitches when standing / alert, panting when running. */
export function raptorExtraUpdate(view, dt) {
  theropodExtra(view, dt, EXTRA);
  const a = view.anim, rig = view.rig;
  if (!a || !rig.head) return;
  const tw = view._twitch || (view._twitch = { t: 0.5, y: 0, p: 0, cy: 0, cp: 0 });
  const still = (1 - a.amp) * (1 - a.dead) * (1 - a.trapped);
  const alert = view.st === DS.ALERT;
  tw.t -= dt;
  if (tw.t <= 0) {
    tw.t = alert ? 0.25 + Math.random() * 0.6 : 0.6 + Math.random() * 1.8;
    tw.y = (Math.random() - 0.5) * (alert ? 0.9 : 0.6);
    tw.p = (Math.random() - 0.4) * 0.25;
  }
  const k = 1 - Math.exp(-dt * 22);          // snappy, bird-like
  tw.cy += (tw.y * still - tw.cy) * k;
  tw.cp += (tw.p * still - tw.cp) * k;
  rig.head.rotation.y = rig.restY(rig.head) + tw.cy;
  rig.head.rotation.x += tw.cp;
  // panting jaw while running
  if (rig.jaw) {
    const run = a.runBlend * a.amp * (1 - a.dead);
    rig.jaw.rotation.x -= run * (0.12 + 0.06 * Math.sin(a.time * 14));
  }
}
