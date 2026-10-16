// Reload choreography of the two guns, authored for THIS game's viewmodel (our own clips, built on Claude-of-Duty's `Clip`).
//
// Claude-of-Duty's reload keys were written for its own higher, more central hip pose and 1.6-2.9 s reloads: on our guns
// (lower right, 1.25 / 1.65 s) they roll the gun 45-90 degrees and drop it off the bottom of the screen, so the magazine
// swap happened off-screen. These clips keep the gun in view: it lifts toward the middle of the screen, cants a little and
// stays there while the support hand pulls the old magazine (tactical) or lets it fall (empty), fetches a new one below the
// frame, brings it up into the magwell, pushes it home and slaps it; an empty reload then frees the slide (pistol: the
// hand racks it over the top; rifle: the hand pulls the charging handle and the bolt drops).
//
// Every key is a FRACTION of the reload (the viewmodel samples a clip at `reloadFraction x duration`, the duration being
// the weapon's `reloadTime`), so the same beats fit 1.25 s and 1.65 s. Hand keys are in weapon space relative to the
// magwell (`magSeat`), so one builder serves both guns; the tuning tables below hold the per-gun numbers.
import * as THREE from 'three';
import { Clip } from '../models/firearms/reference/clips.js';
import { wristTarget, handBasis, HAND_SCALE } from '../models/arms/cartoonArm.js';

/** Metres a released magazine falls per second squared (a touch lighter than 9.8: it reads better over 0.15 s). */
export const MAG_FALL_G = 9.8;

/**
 * How the support hand holds a magazine: a fist round a vertical bar. The magazine's length runs across the palm (along
 * the hand's lateral X axis, its top toward +X: the thumb side, so the thumb is up when the magazine stands in the well),
 * the fingers wrap round it toward the palm; `tilt` leans the magazine's top toward the fingers so the fingers rise with
 * the forearm (a straight wrist) while the magazine is upright. `along`: the grip sits that fraction of the length down
 * from the top, `palm`: standoff of the magazine's axis from the palm plane, `ahead`: how far along the fingers (metres,
 * the last two scaled with the hand). The hand's back faces left while the magazine stands upright.
 */
export const MAG_GRIP = { along: 0.86, palm: 0.016, ahead: 0.062, roll: -Math.PI / 2, tilt: 0.6 };

/** The magazine's pose in the hand's frame, for a magazine `magLen` metres long (as drawn): { pos (metres), quat }. */
export function magInHand(magLen, spin) {
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), MAG_GRIP.tilt)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), MAG_GRIP.roll))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);               // the magazine's top, in the hand's frame
  const pos = new THREE.Vector3(0, -MAG_GRIP.palm, -MAG_GRIP.ahead * HAND_SCALE).addScaledVector(up, MAG_GRIP.along * magLen);
  return { pos, quat };
}

/**
 * Per-gun tuning. `lift` is the weapon-channel pose of the reload (camera space, metres / radians: toward the middle of
 * the screen, up, canted `roll` and tipped `pitch`); `fetch` is where the hand collects the new magazine, as multiples of
 * the magazine length down the magwell axis plus a weapon-space offset.
 */
export const RELOAD_TUNING = {
  pistol: {
    spin: 1.0,   // turn of the fist round the magazine (keeps the wrist straight)
    lift: { p: [-0.03, 0.105, 0.03], r: [-0.25, 0.55, -0.3] },
    racking: { p: [0.0, 0.03, 0.0], r: [-0.05, 0.1, -0.05] },
    fetch: { s: 1.5, off: [-0.02, 0, 0.05], finger: [0.35, 0.5, -0.8], back: [-0.9, 0.3, 0.1] },
    out: 1.25,
  },
  rifle: {
    spin: 0.6,
    lift: { p: [-0.1, 0.15, -0.08], r: [0.38, 0.5, -0.3] },
    racking: { p: [-0.08, 0.13, -0.08], r: [0.33, 0.4, -0.1] },
    fetch: { s: 2.0, off: [-0.03, 0, 0.06], finger: [0.35, 0.5, -0.8], back: [-0.9, 0.3, 0.1] },
    release: { point: [-0.0135, 0.0545, -0.018], finger: [0.6, 0.5, -0.6], back: [-0.7, 0.4, 0.2], len: 0.07 },
    out: 1.2,
  },
};

const v3 = (x, y, z) => [x, y, z];
const _a = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3();
const _outQ = new THREE.Quaternion(), _hq = new THREE.Quaternion();

/** A clip with one extra channel: `parts.drop`, the metres a released magazine has fallen (in camera space) while it drops. */
class ReloadClip extends Clip {
  constructor(name, duration, channels, fall = null, hidden = []) {
    super(name, duration, channels);
    this.hidden = hidden;   // [from, to) seconds in which no magazine is drawn (the old one is stowed, the new one not yet out)
    this.fall = fall;   // [let go, gone] seconds of the clip, or null
  }

  sample(t, out) {
    super.sample(t, out);
    const f = this.fall;
    out.parts.drop = f === null || t <= f[0] || t >= f[1] ? 0 : 0.5 * MAG_FALL_G * (t - f[0]) ** 2;
    out.parts.magVisible = !this.hidden.some(([a, b]) => t >= a && t < b);   // (the base clip's blend flickers between equal keys)
    return out;
  }
}

/**
 * Both reload clips of one gun. `gunScale` is the viewmodel's scale of the gun (hand keys are in gun units).
 * @returns {{ reloadTac: Clip, reloadEmpty: Clip }}
 */
export function buildReloadClips(nodes, def, kind, gunScale, duration) {
  const tune = RELOAD_TUNING[kind];
  const seat = nodes.magSeat.pos;
  const seatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nodes.magSeat.rot, 'XYZ'));
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(seatQ);          // the magazine's length axis, out of the well
  const magLen = def.magLen;                                                 // gun units (the mesh is that long)
  const grip = nodes.gripL;
  const wrapFinger = grip.finger ?? v3(0.82, 0.5, -0.28);
  const wrapBack = grip.back ?? v3(-0.5, 0.32, -0.8);
  // the hand orientation that holds a magazine upright in the well: seat orientation = hand x magazine-in-hand
  const held = magInHand(def.magLen * gunScale, tune.spin);
  const handQ = seatQ.clone().multiply(held.quat.clone().invert());
  const fingerQ = new THREE.Vector3(0, 0, -1).applyQuaternion(handQ).toArray();
  const backQ = new THREE.Vector3(0, 1, 0).applyQuaternion(handQ).toArray();

  /** Wrist key of the hand that holds a magazine whose top is `s` magazine lengths down the well (+ weapon-space `off`). */
  const hold = (s, off = [0, 0, 0], pose = 'pinch', ease, orient = null) => {
    const finger = orient?.finger ?? fingerQ, back = orient?.back ?? backQ;
    handBasis(_hq, finger, back);
    _o.set(seat[0] + off[0], seat[1] + off[1], seat[2] + off[2]).addScaledVector(down, s * magLen);
    // the viewmodel puts the magazine origin at wrist + hand orientation x held.pos / gunScale
    _a.copy(held.pos).multiplyScalar(1 / gunScale).applyQuaternion(_hq);
    _p.copy(_o).sub(_a);
    wristTarget(_o, _outQ, [0, 0, 0], finger, back, HAND_SCALE, gunScale);   // the wrist target's own offset
    _p.sub(_o);
    return { p: _p.toArray(), finger, back, pose, ease };
  };
  // while the hand fetches the new magazine its orientation is free: fingers along the forearm (up and forward, in view
  // space), so the wrist stays straight; view space -> weapon space through the lifted gun's rotation
  const liftQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...tune.lift.r, 'XYZ')).invert();
  const toGun = (v) => new THREE.Vector3(...v).applyQuaternion(liftQ).toArray();
  const fetchOrient = { finger: toGun(tune.fetch.finger), back: toGun(tune.fetch.back) };
  const home = (pose = 'wrap', ease) => ({ p: grip.pos, finger: wrapFinger, back: wrapBack, pose, ease });
  const fetchOff = tune.fetch.off;
  const atFetch = (pose) => hold(tune.fetch.s, fetchOff, pose, undefined, fetchOrient);
  const out = tune.out;

  /* ---- weapon pose: lift toward the middle, cant, hold, settle ---- */
  const L = tune.lift, R = tune.racking;
  const pose = (t, k, ease) => ({ t, p: k.p, r: k.r, ease });
  const rest = { p: v3(0, 0, 0), r: v3(0, 0, 0) };
  const kickR = { p: [R.p[0], R.p[1] - 0.008, R.p[2] + 0.02], r: [R.r[0] + 0.12, R.r[1], R.r[2] - 0.05] };
  const kick = { p: [L.p[0], L.p[1] - 0.012, L.p[2] + 0.014], r: [L.r[0] + 0.05, L.r[1], L.r[2] - 0.06] };


  // the rifle's bolt catch is slapped by the palm from below (wrist = palm point - along the fingers)
  const reach = (point, finger, back, len) => ({
    p: point.map((v, i) => v - finger[i] * len + back[i] * 0.015), finger, back,
  });
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const slapAt = tune.release && reach(tune.release.point, norm(tune.release.finger), norm(tune.release.back), tune.release.len);
  const slapAway = slapAt && { ...slapAt, p: [slapAt.p[0] - 0.035, slapAt.p[1] - 0.03, slapAt.p[2] + 0.01] };

  /** Keys are written in fractions of the reload; this makes a clip of `duration` seconds out of them. */
  const make = (name, spec, fall, hidden) => {
    const sec = (track) => track?.map((k) => ({ ...k, t: k.t * duration }));
    return new ReloadClip(name, duration, {
      weapon: sec(spec.weapon), lhand: sec(spec.lhand), parts: sec(spec.parts),
      events: spec.events.map(([t, n]) => ({ t: t * duration, name: n })),
    }, fall && [fall[0] * duration, fall[1] * duration], [hidden.map((x) => x * duration)]);
  };

  /* ---------------------------------------------------------------- tactical */
  const reloadTac = make('reloadTac', {
    weapon: [
      pose(0, rest), pose(0.14, L), pose(0.70, L), pose(0.745, kick, 'back'), pose(0.80, L), pose(0.95, rest),
    ],
    lhand: [
      { t: 0, ...home() },
      { t: 0.06, ...home('open') },
      { t: 0.21, ...hold(0.04, [0, 0, 0], 'pinch', 'out') },           // closes round the magazine in the well
      { t: 0.24, ...hold(0.04) },
      { t: 0.34, ...hold(out, [0, 0, 0], 'pinch', 'out') },            // pulls it out down the well
      { t: 0.46, ...atFetch('pinch') },                                // carries it away below the frame
      { t: 0.50, ...atFetch('open') },                                 // stows it, reaches for the new one
      { t: 0.54, ...atFetch('pinch') },                                // new magazine in hand: it enters from below
      { t: 0.66, ...hold(out, [0, 0, 0], 'pinch', 'out') },            // up under the magwell
      { t: 0.735, ...hold(0, [0, 0, 0], 'pinch', 'linear') },          // pushed home
      { t: 0.80, ...hold(-0.12, [0, 0, 0], 'open', 'out') },           // slap
      { t: 0.84, ...hold(0.6, [0, 0, 0], 'open') },
      { t: 0.95, ...home('wrap', 'out') },
    ],
    parts: [
      { t: 0, mag: 0, magVisible: 1 },
      { t: 0.215, mag: 0, magVisible: 1 },
      { t: 0.22, mag: 1, magVisible: 1 },
      { t: 0.47, mag: 1, magVisible: 1, ease: 'linear' },
      { t: 0.475, mag: 1, magVisible: 0 },                              // old magazine stowed
      { t: 0.535, mag: 1, magVisible: 0 },
      { t: 0.54, mag: 1, magVisible: 1 },
      { t: 0.735, mag: 1, magVisible: 1, ease: 'linear' },
      { t: 0.74, mag: 0, magVisible: 1 },
      { t: 1, mag: 0, magVisible: 1 },
    ],
    events: [[0.02, 'start'], [0.22, 'magout'], [0.475, 'magdrop'], [0.54, 'fetch'], [0.74, 'magin'], [0.78, 'slap'], [0.995, 'end']],
  }, null, [0.475, 0.54]);

  /* ------------------------------------------------------------------ empty */
  const reloadEmpty = make('reloadEmpty', {
    weapon: [
      pose(0, rest), pose(0.12, L), pose(0.56, L), pose(0.595, kick, 'back'), pose(0.64, L),
      pose(0.70, R), pose(0.755, R), pose(0.785, kickR, 'back'), pose(0.84, R),   // the slide drops: the gun bucks
      pose(0.95, rest),
    ],
    lhand: [
      { t: 0, ...home() },
      { t: 0.03, ...home('open') },
      { t: 0.12, ...hold(0.5, fetchOff, 'open', undefined, fetchOrient) },
      { t: 0.24, ...atFetch('open') },                                 // straight down for a new magazine
      { t: 0.34, ...atFetch('pinch') },
      { t: 0.47, ...hold(out, [0, 0, 0], 'pinch', 'out') },
      { t: 0.54, ...hold(0, [0, 0, 0], 'pinch', 'linear') },
      { t: 0.60, ...hold(-0.12, [0, 0, 0], 'open', 'out') },
      { t: 0.66, ...hold(0.6, [0, 0, 0], 'open') },
      ...(slapAt ? [
        { t: 0.70, ...slapAway, pose: 'open', ease: 'out' },           // up to the bolt catch ...
        { t: 0.765, ...slapAt, pose: 'open', ease: 'linear' },         // ... and a palm slap on it
        { t: 0.82, ...slapAway, pose: 'open', ease: 'out' },
      ] : [
        { t: 0.74, ...home('wrap', 'out') },                           // back round the grip: the thumb drops the slide
      ]),
      { t: 0.95, ...home('wrap', 'out') },
    ],
    parts: [
      { t: 0, mag: 0, magVisible: 1, bolt: 1 },
      { t: 0.17, mag: 0, magVisible: 1, bolt: 1 },
      { t: 0.31, mag: 0, magVisible: 1, bolt: 1 },                      // falling out of the frame
      { t: 0.315, mag: 0, magVisible: 0, bolt: 1 },
      { t: 0.335, mag: 0, magVisible: 0, bolt: 1 },
      { t: 0.34, mag: 1, magVisible: 1, bolt: 1 },                      // new magazine in hand
      { t: 0.535, mag: 1, magVisible: 1, bolt: 1, ease: 'linear' },
      { t: 0.54, mag: 0, magVisible: 1, bolt: 1 },
      { t: 0.75, mag: 0, magVisible: 1, bolt: 1, charge: 0 },
      { t: slapAt ? 0.765 : 0.78, mag: 0, magVisible: 1, bolt: 1, charge: 0 },
      { t: slapAt ? 0.785 : 0.80, mag: 0, magVisible: 1, bolt: 0, charge: 0, ease: 'back' },
      { t: 1, mag: 0, magVisible: 1, bolt: 0, charge: 0 },
    ],
    events: [[0.02, 'start'], [0.17, 'magout'], [0.315, 'magdrop'], [0.34, 'fetch'], [0.54, 'magin'], [0.58, 'slap'],
      [slapAt ? 0.785 : 0.80, 'boltrelease'], [0.995, 'end']],
  }, [0.17, 0.34], [0.315, 0.34]);

  return { reloadTac, reloadEmpty };
}
