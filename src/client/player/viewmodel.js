// First-person arms + tool, on Claude-of-Duty's arm/hand/clip machinery.
//
// Scene: `root` (a child of the view camera, always identity) holds three two-bone cartoon arms
// (right, left, torch) and one object per held item (spear, bow, trap, knife, fruit holder, pistol,
// rifle, torch). Drawn in the renderer's separate viewmodel pass (never clips).
//
// "The tool drives, the hand follows": every frame each held item gets its own pose (per-tool base
// pose + the additive layers idle sway, walk bob, camera lag, recoil, jump/land, sprint, tool
// switch, motion clips), then each hand target = item matrix x grip spec (TOOL_GRIPS), and the arm
// is solved to it. The hands are therefore welded to the grips whatever the item does.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { TOPS } from '../../shared/outfits.js';
import { MAT, mesh } from '../models/kit.js';
import { spearGeometry, bowGeometry, arrowGeometry, trapGeometry, knifeGeometry, makeBowString, BOW_REST, ARROW_TIP_Y } from '../models/weapons.js';
import { SPEAR_THROW, spearReleaseRotation, cameraPlaneScale } from './spearThrow.js';
import { makeFirearm } from '../models/firearms/index.js';
import { makeFruitMesh } from '../models/fruit.js';
import { makeTorch, torchFlicker } from '../models/torch.js';
import { TORCH, leftHandBusy } from '../../shared/torch.js';
import {
  HAND_SCALE, makeCartoonArm, restyleSleeves, handBasis, scaledGrip, cylinderGrip, fitCylinderPose, fitTriggerFinger, wristTarget,
} from '../models/arms/cartoonArm.js';
import { Clip, buildClips, makeSampleResult } from '../models/firearms/reference/clips.js';
import { buildReloadClips, magInHand, RELOAD_TUNING } from './reloadClips.js';
import { Spring, Spring3, Noise1, damp, clamp, lerp, TAU } from '../models/firearms/reference/mathx.js';
import { HAND_POSES } from '../models/firearms/reference/hands.js';
import { Rng } from '../models/firearms/reference/rng.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sstep = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// scratch (the per-frame code allocates nothing)
const _p = V3(), _p2 = V3(), _d = V3(), _d2 = V3(), _f = V3(), _b = V3();
const _sh = new THREE.Vector3();
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _hq = new THREE.Quaternion();
const _e = new THREE.Euler();

/* ------------------------------------------------------------------------------------------------
 * Tuning
 * ---------------------------------------------------------------------------------------------- */

/** Shoulders in root (= camera) space; the arms solve from here (and may lunge forward, see solveArm). */
const SHOULDER_R = V3(0.205, -0.2, 0.06);
const SHOULDER_L = V3(-0.17, -0.24, 0.03);

/** Non-gun items get the gun layers scaled down: [idle sway, walk bob, camera lag, recoil/land]. */
const TOOL_MIX = [0.5, 0.6, 0.55, 0.5];
const KNIFE_MIX = [0.25, 0.3, 0.3, 0.3];
const SWITCH_DOWN = 7;        // 1/s: lowering a non-gun item
const SWITCH_UP = 5;          // 1/s: raising it

const SCALE = { bow: 0.7, trap: 0.3, torch: 0.75 };
/** Guns are drawn bigger than Claude-of-Duty's metres (the old viewmodel did too); their grips are scaled with them. */
export const GUN_SCALE = { pistol: 1.2, rifle: 1.15 };

/**
 * Every gun's bore axis (from `nodes.muzzle` along the gun's -Z) is solved each frame to pass through the camera-space
 * point (0, 0, -CONVERGE): the barrel is nearly parallel to the view axis and its vanishing point is the crosshair, so
 * the bullet that travels to the centre of the screen leaves along the drawn barrel.
 */
export const CONVERGE = 25;

/** Per-gun numbers: hip position, the roll `cant` about the bore (style only, never changes the aim), handling (from Claude-of-Duty's defs.js), recoil, magazine length. */
export const GUN_DEFS = {
  pistol: {
    hipPos: [0.085, -0.125, -0.36], cant: -0.08,
    reloadShoulderL: [-0.14, -0.30, 0.45],   // the support shoulder anchor while reloading (blended in with the reload; idle keeps SHOULDER_L)
    sprintPos: [0.09, -0.25, -0.28], sprintRot: [-0.42, 0.5, 0.14],
    swayScale: 1.15, bobScale: 1.1, magLen: 0.108,
    reloadTac: 1.6, reloadEmpty: 2.2, inspectTime: 2.6, drawTime: 0.42, holsterTime: 0.3,
    recoil: { pitch: 0.0125, yaw: 0.0032, kickBack: 0.012, kickUp: 0.0105, roll: 0.018, freq: 9.0, damping: 0.45 },
  },
  rifle: {
    hipPos: [0.13, -0.18, -0.33], cant: -0.08,
    // support shoulder nearer the middle: the forearm rises from below in line with the hand instead of bending the wrist from the left
    shoulderL: [-0.12, -0.26, 0.03],
    reloadShoulderL: [-0.14, -0.30, 0.40],   // idle keeps the approved anchor above
    sprintPos: [0.09, -0.262, -0.275], sprintRot: [-0.4, 0.6, 0.2],
    swayScale: 1, bobScale: 1, magLen: 0.212,
    reloadTac: 2.1, reloadEmpty: 2.9, inspectTime: 3.2, drawTime: 0.62, holsterTime: 0.4,
    recoil: { pitch: 0.0085, yaw: 0.0022, kickBack: 0.019, kickUp: 0.0072, roll: 0.032, freq: 8.5, damping: 0.42 },
  },
};
for (const def of Object.values(GUN_DEFS)) {
  def.hipP = V3(...def.hipPos);
  def.shoulderL = def.shoulderL ? V3(...def.shoulderL) : SHOULDER_L;
  def.reloadShoulderL = V3(...def.reloadShoulderL);
  def.sprintP = V3(...def.sprintPos);
  def.sprintQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.sprintRot, 'XYZ'));
}

const _bw = V3();
const BORE = V3(0, 0, -1);
const BORE_ROLL = V3(0, 0, 1);
const _aim = new THREE.Quaternion(), _rollQ = new THREE.Quaternion();

/**
 * The base rotation of a gun (before the additive layers): the bore axis through `muzzle` (gun space, drawn at
 * `scale` and placed at `pos` in camera space) passes through (0, 0, -converge). `roll` is a cant about the bore
 * axis itself and never changes where the barrel points. The muzzle moves with the rotation (it is off the gun's
 * origin), so this iterates; it converges to well below a micrometre.
 */
export function solveBoreQuat(out, pos, muzzle, scale, roll = 0, converge = CONVERGE) {
  _rollQ.setFromAxisAngle(BORE_ROLL, roll);
  out.copy(_rollQ);
  for (let i = 0; i < 12; i++) {
    _bw.set(muzzle[0], muzzle[1], muzzle[2]).multiplyScalar(scale).applyQuaternion(out).add(pos);
    _bw.set(-_bw.x, -_bw.y, -converge - _bw.z).normalize();
    out.copy(_aim.setFromUnitVectors(BORE, _bw)).multiply(_rollQ);
  }
  return out;
}

/** Local frame with +Y along `yDir` and +Z as close to `zHint` as possible. */
function aimY(yDir, zHint) {
  const y = V3(...yDir).normalize();
  const z = V3(...zHint);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// Base poses of the non-gun items (root space).
const SPEAR_GRIP_REST = V3(0.25, -0.2, -0.42);                                  // where the grip hand rests (as the old palm did)
const SPEAR_GRIP_Y = -0.2;                                                      // on the lower end of the wrap, a good length of shaft ahead of the hand
const SPEAR_DIR = V3(0, -0.02, -2.2).sub(SPEAR_GRIP_REST).normalize();           // tip toward the crosshair
const SPEAR_Q = aimY(SPEAR_DIR.toArray(), [0.55, 0.83, 0.1]);
const SPEAR_POS = SPEAR_GRIP_REST.clone().addScaledVector(SPEAR_DIR, -SPEAR_GRIP_Y); // the spear origin is 0.2 m ahead of the hand
const BOW_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.26, -0.12, 'XYZ'));
const BOW_Z = -0.8;
const ARROW_SCALE = 1.45;       // the nocked arrow's length, in bow space
const ARROW_THICK = 2.2;        // and its girth: a cartoon arrow, its shaft, head and fletching read at arm's length
const ARROW_HEAD = 1.7;         // arrowhead width on top (arrowGeometry), the tip stays at ARROW_TIP_Y
export const BOW_PULL = 0.36;   // string travel at full draw, bow space
const TRAP_POS = V3(0, -0.17, -0.6);
const TRAP_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0, 'XYZ'));
const KNIFE_DIR = [-0.1, -0.45, -0.89];                                         // blade forward and down
const KNIFE_Q = aimY(KNIFE_DIR, [0.3, 1, 0]);
const FRUIT_POS = V3(0.17, -0.1, -0.42);
const MOUTH_POS = V3(0, -0.13, -0.28);
const TORCH_HELD = V3(-0.27, -0.17, -0.55);
const TORCH_LOW = V3(-0.36, -0.7, -0.36);
const TORCH_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0.12, -0.2));

/**
 * Where the string-hook fingers touch the nock, in hand space: the hand's "hook" pose has its middle
 * joints 0.158 m along the fingers from the wrist and 0.012 m toward the palm; the wrist sits
 * behind the string.
 */
export const HOOK_CONTACT = [0, -0.012, -0.158];
const HOOK_BACK = [0.25, 0.97, 0];                                          // bow space: back of the hand up and a little right, so the curled fingers are seen
const HOOK_Q = handBasis(new THREE.Quaternion(), [0, 0, -1], HOOK_BACK);   // fingers along the arrow

/* ------------------------------------------------------------------------------------------------
 * Grips: wrist target { pos, quat } of a hand in the ITEM's local space (applied with the item's
 * matrix, scale included), plus how to fit the fingers round the cylinder it holds.
 * ---------------------------------------------------------------------------------------------- */

const toGrip = (g, extra = {}) => ({
  pos: V3(...g.pos), quat: handBasis(new THREE.Quaternion(), g.finger, g.back), finger: g.finger, back: g.back, ...extra,
});
const cyl = (scale, o) => cylinderGrip({ ...o, scale: HAND_SCALE / scale });   // local units of an item scaled by `scale

let gripTable = null;

/**
 * The grip table, built once (it needs the firearm nodes). Entries: `{ R?, L? }` per item; each grip has
 * `pos` (Vector3) and `quat` in item space and, when the fingers close round a cylinder, `fit`
 * `{ name, base, point, axis, radius, scale }` (tool-local numbers) for the matching arm's pose.
 *
 * Choices (hand space: -Z fingers, +Y back of the hand; right hand thumb at -X, left at +X):
 * - spear: right hand overhand on the wrap (axis +Y, y -0.12, r 0.036); the back of the hand faces up/out
 *   (local +Z of SPEAR_Q), fingers go over the top and down the far (left) side, wrist to the lower right
 *   where the forearm comes from; thumb below, toward the butt. The throw slides the hand back to y -0.34.
 * - bow: left fist on the riser (axis Y, y -0.075, r 0.036), back of the hand to the left, fingers round the
 *   front, wrist toward the archer; the right hand hooks the string (HOOK_CONTACT) with the back of the hand to the right.
 * - trap: both fists on the side bars (axis Z), back of the hands up, fingers pointing inward, wrists outside.
 * - knife: right fist on the handle, back of the hand up, fingers over the far side.
 * - torch: left fist on the shaft below the rag, back of the hand to the left, fingers forward.
 * - fruit: right hand palm up under the fruit, fingers forward and slightly up.
 * - guns: the CoD nodes through scaledGrip (the hands are 10% bigger than CoD's).
 */
export function toolGrips() {
  if (gripTable) return gripTable;
  const nodes = {};
  for (const kind of ['pistol', 'rifle']) nodes[kind] = makeFirearm(kind).userData.nodes;
  const gunGrip = (n, kind) => toGrip(scaledGrip(n, HAND_SCALE, GUN_SCALE[kind]));
  const fruitFinger = V3(0, 0.15, -0.99).normalize().toArray();
  const fruitBack = [0, -1, 0];
  const palm = V3(0, -0.05, 0.02).addScaledVector(V3(...fruitFinger), -0.06).addScaledVector(V3(...fruitBack), 0.0176);
  const rifleHg = nodes.rifle.handguard;
  const g = {
    pistol: { R: gunGrip(nodes.pistol.gripR, 'pistol'), L: gunGrip(nodes.pistol.gripL, 'pistol'), rPose: 'grip:pistol', lPose: 'cup', nodes: nodes.pistol },
    rifle: {
      R: gunGrip(nodes.rifle.gripR, 'rifle'),
      rPose: 'grip:rifle',
      L: gunGrip(nodes.rifle.gripL, 'rifle'),
      lPose: 'clamp:rifle',
      nodes: nodes.rifle,
    },
    spear: { R: null },
    bow: { L: null },
    trap: { L: null, R: null },
    knife: { R: null },
    torch: { L: null },
    fruit: { R: toGrip({ pos: palm.toArray(), finger: fruitFinger, back: fruitBack }) },
  };
  for (const kind of ['pistol', 'rifle']) {
    const w = FIRING_GRIP[kind];
    g[kind].R.fit = { name: g[kind].rPose, base: 'grip', point: w.point, axis: w.axis, radius: w.radius, scale: GUN_SCALE[kind], trigger: w.trigger, keepThumb: true, thumb: w.thumb, thumbBase: w.thumbBase,
      grip: scaledGrip(nodes[kind].gripR, HAND_SCALE, GUN_SCALE[kind]) };
  }
  g.rifle.L.fit = { name: 'clamp:rifle', base: 'clamp', point: rifleHg.axis, axis: rifleHg.dir, radius: rifleHg.r, scale: GUN_SCALE.rifle, grip: scaledGrip(nodes.rifle.gripL, HAND_SCALE, GUN_SCALE.rifle),
    tuck: SUPPORT_TUCK };
  const cylGrip = (scale, name, base, o) => {
    const raw = cyl(scale, o);
    return toGrip(raw, { fit: { name, base, point: o.point, axis: o.axis, radius: o.fitRadius ?? o.radius, scale, grip: raw } });
  };
  g.spear.R = cylGrip(1, 'fist:spear', 'fist', { point: [0, SPEAR_GRIP_Y, 0], axis: [0, 1, 0], radius: 0.036, normal: [0, 0, 1], wrap: -1 });
  g.bow.L = cylGrip(SCALE.bow, 'fist:bow', 'fist', { point: [0, -0.075, 0], axis: [0, 1, 0], radius: 0.036, normal: [-1, 0, 0.1], wrap: -1 });
  for (const [side, key, name] of [[1, 'R', 'fist:trapR'], [-1, 'L', 'fist:trapL']]) {
    g.trap[key] = cylGrip(SCALE.trap, name, 'fist', { point: [side * 0.99, 0.18, 0], axis: [0, 0, 1], radius: 0.032 + 0.02 / SCALE.trap, fitRadius: 0.032, normal: [side * 0.2, 1, 0], wrap: side });   // thin handle: the palm stands 20 mm off it so the thick fingers can wrap
  }
  g.knife.R = cylGrip(1, 'fist:knife', 'fist', { point: [0, -0.01, 0], axis: [0, 1, 0], radius: 0.02, normal: [0, 0, 1], wrap: -1 });
  g.torch.L = cylGrip(SCALE.torch, 'fist:torch', 'fist', { point: [0, -0.1, 0], axis: [0, 1, 0], radius: 0.03, normal: [-1, 0, 0.25], wrap: -1 });
  return (gripTable = g);
}

/**
 * The firing hand's wrap: the pistol grip as a cylinder (gun space: a point on its axis, the axis down the rake, the
 * radius of the 31 mm section with its rubber) and where the index finger pad meets the trigger blade.
 */
const FIRING_GRIP = {
  // the pistol's thumb: CoD's lies along the left of the frame, but the bigger hand sits up at the slide, so it is turned in
  // and down to stay inside the slide (it poked out of both sides of it)
  pistol: { point: [0, 0.022, 0.016], axis: [0, -0.949, 0.314], radius: 0.0165, trigger: [0.004, 0.014, -0.0145], thumb: [0.5, 0.34], thumbBase: [0.15, -0.95, -0.95] },
  rifle: { point: [0, 0.035, 0.015], axis: [0, -0.929, 0.371], radius: 0.0165, trigger: [0.004, 0.0345, -0.0035] },
};

/**
 * The rifle support hand's fingers fold further than the cylinder fit (knuckles, more toward the little finger, and the
 * middle joints): the fit hugs the tube surface and the rear fingers then lay over the top of the handguard in plain
 * view; folded, their tips end inside the far side of it.
 */
export const SUPPORT_TUCK = { knuckle: 0.525, middle: 1.6 };

/** Fit `arm`'s fingers for `grip.fit` (arm-root space = item space scaled to the world). */
function fitGrip(arm, item) {
  const f = item.fit;
  const k = f.scale;
  const sc = (a) => a.map((v) => v * k);
  const wrist = { pos: sc(f.grip.pos), finger: f.grip.finger, back: f.grip.back };
  const pose = fitCylinderPose(arm, f.name, wrist, sc(f.point), f.axis, f.radius * k, f.base);
  if (f.keepThumb) { pose.thumb = (f.thumb ?? HAND_POSES.grip.thumb).slice(); pose.thumbBase = (f.thumbBase ?? HAND_POSES.grip.thumbBase).slice(); }   // CoD's thumb lies along the left of the frame; the fitted one stands up
  if (f.tuck) pose.fingers = pose.fingers.map((c, i) => [c[0] + f.tuck.knuckle * (0.3 + i / 3), c[1] * f.tuck.middle, c[2]]);
  if (f.trigger) fitTriggerFinger(arm, f.name, wrist, sc(f.trigger));
}

/* ------------------------------------------------------------------------------------------------
 * Non-gun motion clips (additive pose of the item in root space)
 * ---------------------------------------------------------------------------------------------- */

const STAB_TIME = 0.38;
const PLACE_TIME = 0.5;
const EAT_TILT = 0.45;

const stabClip = new Clip('stab', STAB_TIME, {
  weapon: [
    { t: 0, p: [0, 0, 0], r: [0, 0, 0] },
    { t: STAB_TIME / 2, p: [SPEAR_DIR.x * 0.42, SPEAR_DIR.y * 0.42 + 0.04, SPEAR_DIR.z * 0.42], r: [0, 0, 0] },
    { t: STAB_TIME, p: [0, 0, 0], r: [0, 0, 0] },
  ],
});
const placeClip = new Clip('place', PLACE_TIME, {
  weapon: [
    { t: 0, p: [0, 0, 0], r: [0, 0, 0] },
    { t: PLACE_TIME / 2, p: [0, -0.25, 0], r: [0, 0, 0] },
    { t: PLACE_TIME, p: [0, 0, 0], r: [0, 0, 0] },
  ],
});

/** Fruit to the mouth, a few bites (small wobble), back down; `d` = seconds. */
function eatClip(d) {
  const into = Math.min(0.22, d * 0.25);
  const m = [MOUTH_POS.x - FRUIT_POS.x, MOUTH_POS.y - FRUIT_POS.y, MOUTH_POS.z - FRUIT_POS.z];
  const r = [EAT_TILT, 0, 0];
  const keys = [{ t: 0, p: [0, 0, 0], r: [0, 0, 0] }, { t: into, p: m, r }];
  for (let t = into + 0.1, i = 0; t < d - into - 0.05; t += 0.12, i++) {
    keys.push({ t, p: [m[0], m[1] + (i % 2 ? 0.014 : -0.01), m[2]], r });
  }
  keys.push({ t: d - into, p: m, r }, { t: d, p: [0, 0, 0], r: [0, 0, 0] });
  return new Clip('eat', d, {
    weapon: keys,
    rhand: [{ t: 0, p: [0, 0, 0], pose: 'hold' }, { t: d, p: [0, 0, 0], pose: 'hold' }],
  });
}

const isGun = (t) => t === 'pistol' || t === 'rifle';

export class Viewmodel {
  constructor(gfx, slot) {
    this.gfx = gfx;
    this.root = new THREE.Group();
    gfx.viewCamera.add(this.root);
    const skin = CONFIG.playerColors[slot % 4];
    this.skin = skin;
    this.grips = toolGrips();
    this.rng = new Rng(0x5eed1e5 ^ (slot * 0x9e37));

    // ---- arms ----
    this.armR = makeCartoonArm(1, skin, TOPS[0], { shoulderX: 0.205, shoulderY: -0.2, shoulderZ: 0.06, pose: 'relaxed' });
    this.armL = makeCartoonArm(-1, skin, TOPS[0], { shoulderX: 0.17, shoulderY: -0.24, shoulderZ: 0.03, pose: 'relaxed' });
    this.armT = makeCartoonArm(-1, skin, TOPS[0], { shoulderX: 0.17, shoulderY: -0.24, shoulderZ: 0.03, pose: 'fist' });
    this.arms = [this.armR, this.armL, this.armT];
    this.rHand = this.armR.hand;
    this.lHand = this.armL.hand;
    this.tHand = this.armT.hand;
    for (const arm of this.arms) this.root.add(arm.root);
    const g = this.grips;
    fitGrip(this.armR, g.spear.R);
    fitGrip(this.armR, g.trap.R);
    fitGrip(this.armR, g.knife.R);
    fitGrip(this.armL, g.bow.L);
    fitGrip(this.armL, g.trap.L);
    fitGrip(this.armL, g.rifle.L);
    fitGrip(this.armR, g.pistol.R);
    fitGrip(this.armR, g.rifle.R);
    fitGrip(this.armT, g.torch.L);

    // ---- items: each a direct child of root, posed by `update` ----
    this.spear = mesh(spearGeometry(), MAT.standard, { cast: false });
    this.spear.quaternion.copy(SPEAR_Q);
    this.restSpear = new THREE.Object3D();     // where the spear would be: the empty hand rests on it
    this.bow = new THREE.Group();
    this.bow.add(mesh(bowGeometry(), MAT.standard, { cast: false }));
    this.string = makeBowString();
    this.bow.add(this.string);
    this.nocked = mesh(arrowGeometry(ARROW_HEAD), MAT.standard, { cast: false });
    this.nocked.scale.set(ARROW_THICK, ARROW_SCALE, ARROW_THICK);
    this.nocked.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(0, 0, -1));   // +Y (tip) -> -Z (forward)
    this.bow.add(this.nocked);
    this.bow.scale.setScalar(SCALE.bow);
    this.trap = mesh(trapGeometry(false), MAT.standard, { cast: false });
    this.trap.scale.setScalar(SCALE.trap);
    this.knife = mesh(knifeGeometry(), MAT.standard, { cast: false });
    this.fruitHolder = new THREE.Group();
    this.fruitMeshes = {};
    this.guns = { pistol: makeFirearm('pistol'), rifle: makeFirearm('rifle') };
    this.clips = {};
    for (const [kind, gun] of Object.entries(this.guns)) {
      gun.traverse((o) => { o.castShadow = false; });
      const flash = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6),
        new THREE.MeshBasicMaterial({ color: '#ffcf72', transparent: true, opacity: 0.9, depthWrite: false }));
      flash.rotation.x = -Math.PI / 2;
      flash.position.fromArray(gun.userData.nodes.muzzle); flash.position.z -= 0.04;
      flash.visible = false; gun.add(flash); gun.userData.flash = flash;
      const nodes = gun.userData.nodes;
      gun.userData.magSeatPos = V3(...nodes.magSeat.pos);
      gun.userData.magSeatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nodes.magSeat.rot, 'XYZ'));
      gun.userData.magHold = magInHand(GUN_DEFS[kind].magLen * GUN_SCALE[kind], RELOAD_TUNING[kind].spin);   // where the support hand holds it
      this.clips[kind] = buildClips(nodes, GUN_DEFS[kind]);   // draw, holster, inspect (Claude-of-Duty's) ...
      Object.assign(this.clips[kind], buildReloadClips(nodes, GUN_DEFS[kind], kind, GUN_SCALE[kind], CONFIG.weapons[kind].reloadTime));   // ... the reloads are ours
    }
    this.torch = makeTorch();
    this.torch.scale.setScalar(SCALE.torch);
    this.torch.traverse((o) => { o.castShadow = false; });
    this.root.add(this.spear, this.bow, this.trap, this.knife, this.fruitHolder, this.guns.pistol, this.guns.rifle, this.torch);

    // ---- state ----
    this.tool = 'spear';
    this.shown = 'spear';             // the item in the hands (the knife and eating override `tool`)
    this.pendingTool = null;
    this.phase = 'hold';              // 'hold' | 'lower' | 'raise'
    this.switchT = 0;                 // 1 = fully lowered (a gun's holster/draw clip maps onto it)
    this.timed = null;                // a gun clip playing by time: { clip, t }
    this.hasSpear = true;
    this.hasArrow = true;
    this.fruitType = null;
    this.knifeWanted = false;
    this.knifeProgress = 0;
    this.stabT = 0;
    this.placeT = 0;
    this.eatT = 0; this.eatDur = 1; this.eatClip = null;
    this.draw = 0; this.drawVis = 0; this.arrowHide = 0;
    this.throwT = 0;
    this.throwElapsed = 0; this.throwReleased = false; this.throwRelease = null;
    this.throwStart = V3(); this.throwStartRotation = new THREE.Quaternion();
    this.throwPose = new THREE.Matrix4(); this.throwProjection = new THREE.Matrix4();
    this.throwRotation = new THREE.Quaternion(); this.throwPosition = V3();
    this.throwWind = V3(0.27, -0.12, -0.34);
    this.throwWindRotation = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(-0.1, 0.13, -1).normalize());
    this.throwEnd = V3(...SPEAR_THROW.origin);
    this.throwUnit = V3(1, 1, 1);
    this.rHandRest = V3();            // the empty right hand's rest wrist target (updated each frame)
    this.rHandRestQuat = new THREE.Quaternion();

    // gun state
    this.flashT = 0;
    this.reload = 0; this.empty = false;
    this.reloading = false; this.reloadEmpty = false;
    this.boltCycle = 0; this.sinceShot = 9; this.triggerPulse = 0; this.triggerT = 0;
    this.res = makeSampleResult();
    this.motion = makeSampleResult();
    this.lhandPos = V3(); this.lhandQuat = new THREE.Quaternion();   // the left hand in gun space
    this.onClipEvent = null;
    this._clipPrev = -1;

    // layers
    this.time = 0; this.noiseT = 0; this.bobPhase = 0; this.sprintT = 0; this.wasGrounded = true;
    this.noise = Array.from({ length: 6 }, () => new Noise1(this.rng, 512));
    this.noiseRates = [0.13, 0.19, 0.271, 0.083, 0.117, 0.163];
    this.av = { yaw: 0, pitch: 0 };
    this.lag = new Spring3(5.4, 0.46);
    this.lagRot = new Spring3(6.2, 0.42);
    this.recPos = new Spring3(9, 0.42);
    this.recRot = new Spring3(9, 0.42);
    this.settle = new Spring3(2.2, 0.7);
    this.jumpSpring = new Spring(5.5, 0.5);
    this.landSpring = new Spring(7.5, 0.55);
    this.idleL = new Float64Array(6); this.bobL = new Float64Array(6);
    this.lagL = new Float64Array(6); this.recL = new Float64Array(6);
    this.mixed = new Float64Array(6);
    this.flat = false;                // tests: no sway, bob, lag or recoil on a gun (its pose is the solved base pose)

    this.#buildTorchRig();
    this.armR.setPose('relaxed');
    this.applyVisibility();
  }

  /**
   * Off-hand torch: own arm (`armT`) and torch object, posed in `updateTorch` independently of
   * `this.tool` (the main tool may still use `armL`).
   */
  #buildTorchRig() {
    this.torchOwned = false;
    this.torchLit = false;
    this.torchRaise = 0;     // 0 lowered out of view .. 1 held up
    this.torchLevel = 0;     // 0 off, ember..1 light strength (read by entities/torches.js)
    this.torchFlicker = 1;
    this.torchHeadView = V3();
    this.torch.visible = false;
    this.armT.root.visible = false;
  }

  /** The torch is owned / lit (from the inventory and the L key). */
  setTorch(owned, lit) {
    this.torchOwned = !!owned;
    this.torchLit = !!owned && !!lit;
  }

  /** The torch flame's position in the world (for the light pool); updates the cached matrices. */
  torchHeadWorld(out, camera) {
    camera.updateMatrixWorld();
    this.root.updateMatrixWorld(true);
    this.torch.userData.head.getWorldPosition(out);   // viewmodel space: the view camera sits at the origin
    return out.applyMatrix4(camera.matrixWorld);
  }

  /** Match the first-person sleeves to the chosen shirt/jacket. */
  setOutfit(outfit) {
    const top = TOPS[outfit?.top] || TOPS[0];
    for (const arm of this.arms) restyleSleeves(arm, this.skin, top);
  }

  setTool(tool, { hasSpear = true, fruitType = null, hasArrow = true } = {}) {
    this.hasSpear = hasSpear;
    this.hasArrow = hasArrow;
    if (fruitType !== this.fruitType) {
      this.fruitType = fruitType;
      this.applyVisibility();
    }
    this.pendingTool = tool === this.tool ? null : tool;
  }

  /** Butchering with the knife (V): the held tool is put away meanwhile. */
  setKnife(on, progress = 0) {
    this.knifeWanted = !!on;
    if (on) this.knifeProgress = clamp(progress, 0, 1);
  }

  /** The item the hands should hold: the knife while butchering, a fruit while eating, else the selected tool. */
  #wanted() {
    if (this.knifeWanted) return 'knife';
    if (this.eatT > 0 && this.fruitType) return 'fruit';
    return this.pendingTool ?? this.tool;
  }

  #fruitMesh() {
    if (!this.fruitType) return null;
    if (!this.fruitMeshes[this.fruitType]) {
      const m = makeFruitMesh(this.fruitType);
      m.traverse((o) => { o.castShadow = false; });
      m.scale.setScalar(0.45);
      this.fruitHolder.add(m);
      this.fruitMeshes[this.fruitType] = m;
    }
    return this.fruitMeshes[this.fruitType];
  }

  applyVisibility() {
    const t = this.shown;
    this.knife.visible = t === 'knife';
    this.spear.visible = t === 'spear' && ((this.throwT > 0 && !this.throwReleased) || (this.hasSpear && this.throwT === 0));
    this.bow.visible = t === 'bow';
    this.nocked.visible = t === 'bow' && this.hasArrow && this.arrowHide <= 0;
    this.trap.visible = t === 'trap';
    this.fruitHolder.visible = t === 'fruit';
    for (const k in this.fruitMeshes) this.fruitMeshes[k].visible = false;
    if (t === 'fruit') { const m = this.#fruitMesh(); if (m) m.visible = true; }
    for (const [kind, gun] of Object.entries(this.guns)) gun.visible = t === kind;
    // the left arm helps with the bow, the trap and the guns; a pistol is one-handed while the torch is up (not for the reload)
    const pistolAlone = t === 'pistol' && this.torchRaise > 0.02 && !this.reloading;
    this.armL.root.visible = t === 'bow' || t === 'trap' || (isGun(t) && !pistolAlone);
    this.armR.root.visible = true;
  }

  stab() { if (this.stabT <= 0) this.stabT = 1; }
  throwSpear(onRelease) {
    this.throwT = 1; this.throwElapsed = 0; this.throwReleased = false; this.throwRelease = onRelease;
    this.throwStart.copy(this.spear.position);
    this.throwStartRotation.copy(this.spear.quaternion);
  }
  setDraw(frac) { this.draw = clamp(frac, 0, 1); }
  release() {
    this.draw = 0;
    this.arrowHide = 0.25;
    this.#kick(this.recPos, this.recRot, 9, 0.42, [0.002, 0.008, 0.05], [0.06, 0, 0.03]);
  }
  eat(type, duration) {
    this.fruitType = type;
    this.eatT = this.eatDur = duration;
    this.eatClip = eatClip(duration);
    this.applyVisibility();
  }
  place() { this.placeT = 1; }

  /** Gun recoil impulse (Claude-of-Duty's addRecoil with a deterministic Rng), bolt cycle, trigger pull, flash. */
  fireGun() {
    this.flashT = 0.055;
    const kind = isGun(this.shown) ? this.shown : this.tool;
    const def = GUN_DEFS[kind];
    if (!def) return;
    const r = def.recoil;
    const first = this.sinceShot > 0.35;
    this.sinceShot = 0;
    const scale = first ? 1.18 : 1;
    const jit = 0.86 + this.rng.float() * 0.3;
    const wp = TAU * r.freq, wr = TAU * r.freq * 0.92;
    this.recPos.f = r.freq; this.recPos.z = r.damping;
    this.recRot.f = r.freq * 0.92; this.recRot.z = r.damping;
    const yaw = this.rng.signed() * r.yaw * 2;
    this.recPos.kick(this.rng.signed() * r.kickBack * 0.2 * scale * wp, r.kickUp * scale * jit * wp, r.kickBack * scale * jit * wp);
    this.recRot.kick((r.pitch * 6.9) * scale * jit * wr, (-yaw * 4.5 - this.rng.signed() * r.yaw * 0.8) * scale * wr,
      (this.rng.signed() * 0.4 + 0.6) * r.roll * scale * wr);
    const ws = TAU * this.settle.f;
    this.settle.kick(this.rng.signed() * 0.0012 * scale * ws, 0.0018 * scale * ws, this.rng.signed() * 0.003 * scale * ws);
    this.boltCycle = 1;
    this.triggerPulse = 1;
  }

  /** A short impulse on the shared recoil springs (position then rotation, metres/radians). */
  #kick(pos, rot, f, z, p, r) {
    pos.f = f; pos.z = z; rot.f = f; rot.z = z;
    const w = TAU * f;
    pos.kick(p[0] * w, p[1] * w, p[2] * w);
    rot.kick(r[0] * w, r[1] * w, r[2] * w);
  }

  /**
   * @param {boolean} aim ignored (guns are fired from the hip)
   * @param {number} reload 0 = none, else the 0..1 fraction of the running reload
   * @param {boolean} empty the magazine is empty (the slide is locked back; a reload that starts empty plays the long clip)
   */
  setGunPose(aim, reload = 0, empty = false) { this.reload = reload; this.empty = !!empty; }

  /** Play the inspect clip of the gun in hand (when nothing else is going on). */
  inspect() {
    if (!isGun(this.shown) || this.phase !== 'hold' || this.reloading || this.timed) return;
    this.#play('inspect', 0);
  }

  muzzlePosition(out) {
    const gun = this.guns[this.tool] ?? this.guns[this.shown];
    this.root.updateMatrixWorld(true);
    return gun.localToWorld(out.fromArray(gun.userData.nodes.muzzle));
  }

  #play(name, t0 = 0) {
    this.timed = { clip: this.clips[this.shown][name], t: t0 };
    this._clipPrev = t0 - 1e-6;
  }

  /* ----------------------------------------------------------------------------------------------
   * Frame update
   * -------------------------------------------------------------------------------------------- */

  /** @param {{speed:number, sprint:boolean, grounded:boolean, lookX:number, lookY:number}} s */
  update(dt, s) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    this.#layers(dt, s);
    this.#stepSwitch(dt);

    this.stabT = Math.max(0, this.stabT - dt / STAB_TIME);
    this.placeT = Math.max(0, this.placeT - dt / PLACE_TIME);
    this.eatT = Math.max(0, this.eatT - dt);
    this.arrowHide = Math.max(0, this.arrowHide - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.sinceShot += dt;
    this.triggerPulse = Math.max(0, this.triggerPulse - dt / 0.09);
    this.triggerT = damp(this.triggerT, this.triggerPulse > 0 ? 1 : 0, 26, dt);
    if (this.throwT > 0) {
      this.throwElapsed += dt;
      this.throwT = Math.max(0, 1 - this.throwElapsed / SPEAR_THROW.duration);
    }
    this.drawVis = damp(this.drawVis, this.draw, 18, dt);

    const res = this.#sampleClips(dt);
    this.applyVisibility();

    switch (this.shown) {
      case 'spear': this.#poseSpear(); break;
      case 'bow': this.#poseBow(); break;
      case 'trap': this.#poseTrap(); break;
      case 'knife': this.#poseKnife(); break;
      case 'fruit': this.#poseFruit(); break;
      default: this.#poseGun(dt, res);
    }
    for (const [kind, gun] of Object.entries(this.guns)) if (kind !== this.shown) gun.userData.flash.visible = false;
    this.#updateTorch(dt, s);

    // Launch after the release pose is evaluated, in the same animation frame.
    if (this.throwT > 0 && !this.throwReleased && this.throwElapsed + 1e-9 >= SPEAR_THROW.release) {
      this.throwReleased = true; this.spear.visible = false;
      const release = this.throwRelease; this.throwRelease = null; release?.();
    }
  }

  /**
   * The additive layers, advanced once per frame: idle sway (noise), walk bob, camera lag
   * (springs fed by the mouse turn rate), recoil/settle/jump/land. Kept apart in four 6-vectors
   * [x y z pitch yaw roll] and mixed per item by `#mix`.
   */
  #layers(dt, s) {
    // turn rate from this frame's mouse pixels (about 0.0022 rad each), low-passed and clamped like CoD
    if (dt > 1e-5) {
      const dy = clamp(-(s.lookX || 0) * 0.0022 / dt, -9, 9);
      const dp = clamp(-(s.lookY || 0) * 0.0022 / dt, -9, 9);
      this.av.yaw = damp(this.av.yaw, dy, 18, dt);
      this.av.pitch = damp(this.av.pitch, dp, 18, dt);
    }
    this.sprintT = damp(this.sprintT, s.sprint && !this.reloading && !this.timed ? 1 : 0, 9, dt);
    // idle
    const t = (this.noiseT += dt);
    const n = this.noise, nr = this.noiseRates;
    const swayX = n[0].fbm(t * nr[0], 3) * 0.55 + n[3].fbm(t * nr[3] * 2.3, 2) * 0.45;
    const swayY = n[1].fbm(t * nr[1], 3) * 0.55 + n[4].fbm(t * nr[4] * 2.1, 2) * 0.45;
    const swayZ = n[2].fbm(t * nr[2], 2) * 0.6 + n[5].fbm(t * nr[5] * 1.7, 2) * 0.4;
    const breath = Math.sin(t * 1.38) * 0.5 + Math.sin(t * 0.61 + 1.1) * 0.25;
    const I = this.idleL;
    I[0] = swayX * 0.0075; I[1] = swayY * 0.006 + breath * 0.0022; I[2] = swayZ * 0.004;
    I[3] = swayY * 0.021 + breath * 0.006; I[4] = swayX * 0.028; I[5] = swayZ * 0.017;
    // bob
    const speed = s.speed ?? 0;
    const bobAmt = clamp(speed / CONFIG.player.walkSpeed, 0, 1) * (s.grounded ? 1 : 0.25);
    if (speed > 0.05) {
      this.bobPhase += dt * (3.1 + speed * 0.72) * (s.sprint ? 1.05 : 1);
      if (this.bobPhase > TAU * 64) this.bobPhase -= TAU * 64;
    }
    const bp = this.bobPhase, B = this.bobL;
    B[0] = Math.sin(bp) * 0.0165 * bobAmt; B[1] = (Math.abs(Math.cos(bp)) - 0.6) * 0.0125 * bobAmt; B[2] = Math.sin(bp * 2) * 0.0055 * bobAmt;
    B[3] = Math.cos(bp * 2) * 0.014 * bobAmt; B[4] = Math.sin(bp + 0.6) * 0.019 * bobAmt; B[5] = Math.sin(bp) * 0.031 * bobAmt;
    // lag
    const av = this.av;
    // CoD's numbers, signed so the item TRAILS the view: turn right -> it drifts left and its muzzle swings left (CoD's own
    // position/yaw signs lead the turn instead)
    this.lag.step(dt, clamp(av.yaw * 0.019, -0.05, 0.05), clamp(-av.pitch * 0.014, -0.04, 0.04), clamp(-Math.abs(av.yaw) * 0.006, -0.03, 0.03));
    this.lagRot.step(dt, clamp(-av.pitch * 0.075, -0.24, 0.24), clamp(-av.yaw * 0.085, -0.3, 0.3), clamp(-av.yaw * 0.055, -0.2, 0.2));
    const L = this.lagL;
    L[0] = this.lag.x; L[1] = this.lag.y; L[2] = this.lag.z; L[3] = this.lagRot.x; L[4] = this.lagRot.y; L[5] = this.lagRot.z;
    // jump / land from the grounded edges
    if (this.wasGrounded && !s.grounded) this.jumpSpring.kick(-1.2);
    if (!this.wasGrounded && s.grounded) this.landSpring.kick(2.4);   // CoD: clamp(0.45 * fall speed, 0.4, 3.4); the fall speed is not known here
    this.wasGrounded = !!s.grounded;
    // recoil
    this.recPos.step(dt, 0, 0, 0);
    this.recRot.step(dt, 0, 0, 0);
    this.settle.step(dt, 0, 0, 0);
    this.jumpSpring.step(dt, 0);
    this.landSpring.step(dt, 0);
    const R = this.recL;
    R[0] = this.recPos.x; R[1] = this.recPos.y - (this.landSpring.x * 0.014 + this.jumpSpring.x * 0.006); R[2] = this.recPos.z;
    R[3] = this.recRot.x + this.settle.y - this.landSpring.x * 0.05; R[4] = this.recRot.y + this.settle.x; R[5] = this.recRot.z + this.settle.z;
  }

  /** mixed = idle*ks + bob*kb + lag*kl + recoil*kr */
  #mix(ks, kb, kl, kr) {
    const m = this.mixed;
    for (let i = 0; i < 6; i++) m[i] = this.idleL[i] * ks + this.bobL[i] * kb + this.lagL[i] * kl + this.recL[i] * kr;
    return m;
  }

  /** The non-gun layers for the current frame, plus the sprint dip (only `lowerY`-style offsets are the caller's). */
  #toolLayers(mix = TOOL_MIX) {
    const m = this.#mix(mix[0] * lerp(1, 1.5, this.sprintT), mix[1], mix[2], mix[3]);
    return m;
  }

  /** Sampled motion clip (stab / place / eat) of the item in hand into `this.motion`; null when none runs. */
  #motionClip() {
    const m = this.motion;
    let clip = null, t = 0;
    if (this.shown === 'spear' && this.stabT > 0 && this.hasSpear) { clip = stabClip; t = (1 - this.stabT) * STAB_TIME; }
    else if (this.shown === 'trap' && this.placeT > 0) { clip = placeClip; t = (1 - this.placeT) * PLACE_TIME; }
    else if (this.shown === 'fruit' && this.eatT > 0 && this.eatClip) { clip = this.eatClip; t = this.eatDur - this.eatT; }
    if (!clip) {
      m.pos[0] = m.pos[1] = m.pos[2] = m.rot[0] = m.rot[1] = m.rot[2] = 0;
      m.rhand.pose = null; m.rhand.weight = 0;
      return null;
    }
    return clip.sample(clamp(t, 0, clip.duration), m);
  }

  /** Lower/raise offset of a non-gun item while switching. */
  #lowered() { return this.phase === 'hold' ? 0 : sstep(this.switchT); }

  /**
   * Place a non-gun item: base pose + layers (+ clip, sprint, lowering). Layer rotations are applied in
   * root space (camera-relative), so lag and bob read the same for every item. Returns the layer vector.
   */
  #placeItem(item, basePos, baseQuat, { mix = TOOL_MIX, sprintDip = 0.05, sprintTilt = 0.12, motion = true } = {}) {
    const m = this.#toolLayers(mix);
    const c = motion ? this.#motionClip() : null;
    const low = this.#lowered();
    const sp = this.sprintT;
    item.position.set(
      basePos.x + m[0] + (c ? this.motion.pos[0] : 0),
      basePos.y + m[1] + (c ? this.motion.pos[1] : 0) - sprintDip * sp - 0.42 * low,
      basePos.z + m[2] + (c ? this.motion.pos[2] : 0),
    );
    _e.set(m[3] - sprintTilt * sp - 0.5 * low + (c ? this.motion.rot[0] : 0), m[4] + (c ? this.motion.rot[1] : 0),
      m[5] + sprintTilt * sp + (c ? this.motion.rot[2] : 0), 'XYZ');
    item.quaternion.copy(_q.setFromEuler(_e)).multiply(baseQuat);
    return m;
  }

  /* ---- hands ---- */

  /**
   * Solve an arm to a wrist target. The shoulder is body-fixed, but when the target would be beyond
   * 96% of the reach (a lunge, a spear throw) the shoulder leans toward it instead, so the bones are
   * never stretched and the hand stays welded to the grip. The shift is invisible (the shoulder is off screen).
   */
  #solveArm(arm, base, pos, quat) {
    const reach = (arm.l1 + arm.l2) * 0.96;
    arm.shoulder.copy(base);
    _d2.copy(pos).sub(base);
    const len = _d2.length();
    if (len > reach) {
      arm.shoulder.addScaledVector(_d2, Math.min(len - reach, 0.5) / len);
      _d2.copy(pos).sub(arm.shoulder);
      const left = _d2.length();
      if (left > reach) pos.copy(arm.shoulder).addScaledVector(_d2, reach / left);   // last resort: the hand stops short
    }
    arm.solve(pos, quat);
  }

  /** Hand at `grip` of `item` (matrix incl. scale); fingers by `pose`. */
  #hand(arm, base, item, grip, pose, localPos = grip.pos, itemQuat = item.quaternion) {
    _p.copy(localPos).applyMatrix4(item.matrix);
    _hq.copy(itemQuat).multiply(grip.quat);
    this.#setPose(arm, pose);
    this.#solveArm(arm, base, _p, _hq);
  }

  #setPose(arm, pose) { if (arm.pose !== pose) arm.setPose(pose); }

  /* ---- spear ---- */

  /** Spear base pose + layers into `obj`, without the throw. */
  #spearPose(obj) {
    this.#placeItem(obj, SPEAR_POS, SPEAR_Q, { motion: obj === this.spear });
    obj.scale.set(1, 1, 1);
    obj.updateMatrix();
  }

  #poseSpear() {
    // the empty hand rests where the spear would be
    this.#spearPose(this.restSpear);
    const grip = this.grips.spear.R;
    _p2.copy(grip.pos).applyMatrix4(this.restSpear.matrix);
    this.rHandRest.copy(_p2);
    this.rHandRestQuat.copy(this.restSpear.quaternion).multiply(grip.quat);

    if (this.throwT > 0) return this.#poseThrow();
    this.spear.matrixAutoUpdate = true;
    if (!this.hasSpear) {
      this.#hand(this.armR, SHOULDER_R, this.restSpear, grip, 'relaxed');
      return;
    }
    this.#spearPose(this.spear);
    this.#hand(this.armR, SHOULDER_R, this.spear, grip, 'fist:spear');
  }

  /** poseSpearThrow's math from before, unchanged: the spear matrix is the throw pose, the hand follows its grip. */
  #poseThrow() {
    const t = this.throwElapsed;
    const k = sstep(t / SPEAR_THROW.release);
    const plane = 1 + (cameraPlaneScale(this.gfx.viewCamera, this.gfx.camera) - 1) * k;
    if (t < SPEAR_THROW.windup) {
      const u = sstep(t / SPEAR_THROW.windup);
      this.throwPosition.copy(this.throwStart).lerp(this.throwWind, u);
      this.throwRotation.copy(this.throwStartRotation).slerp(this.throwWindRotation, u);
    } else {
      // Accelerate out of the modest shoulder wind-up; settle rotation by release.
      const u = Math.min(1, (t - SPEAR_THROW.windup) / (SPEAR_THROW.release - SPEAR_THROW.windup));
      this.throwPosition.copy(this.throwWind).lerp(this.throwEnd, u * u);
      this.throwRotation.copy(this.throwWindRotation).slerp(spearReleaseRotation, sstep(u));
    }
    this.throwPose.compose(this.throwPosition, this.throwRotation, this.throwUnit);
    this.throwProjection.makeScale(plane, plane, 1);
    this.throwPose.premultiply(this.throwProjection);
    this.spear.matrixAutoUpdate = false;
    this.spear.matrix.copy(this.throwPose);

    // The hand slides back along the shaft while the arm stretches out, so the grip stays within reach.
    const grip = this.grips.spear.R;
    _d.set(0, -0.14 * k, 0);
    const local = _p2.copy(grip.pos).add(_d);
    _p.copy(local).applyMatrix4(this.throwPose);
    _hq.copy(this.throwRotation).multiply(grip.quat);
    if (t <= SPEAR_THROW.release - 0.02) this.#setPose(this.armR, 'fist:spear');
    else this.#setPose(this.armR, 'open');
    if (t > SPEAR_THROW.release) {
      const u = (t - SPEAR_THROW.release) / (SPEAR_THROW.duration - SPEAR_THROW.release);
      // Extend the empty hand briefly, then recover smoothly to its rest pose.
      if (u < 0.3) _p.z -= Math.sin(u / 0.3 * Math.PI / 2) * 0.15;
      else { _p.z -= 0.15; _p.lerp(this.rHandRest, sstep((u - 0.3) / 0.7)); }
      _hq.slerp(this.rHandRestQuat, sstep(u));
      if (u > 0.35) this.#setPose(this.armR, 'relaxed');
    }
    this.#solveArm(this.armR, SHOULDER_R, _p, _hq);
  }

  /* ---- bow ---- */

  #poseBow() {
    const bow = this.bow;
    const pull = this.drawVis * BOW_PULL;
    const m = this.#toolLayers();
    const low = this.#lowered();
    _e.set(m[3] - 0.5 * low, m[4], m[5], 'XYZ');
    bow.quaternion.copy(_q.setFromEuler(_e)).multiply(BOW_Q);
    // The arrow passes through BOTH its nock and BOW_REST along bow -Z. The bow stays put while drawing, so the arrow,
    // string and hand visibly come back; it is placed so the arrowhead lands exactly on the camera axis at FULL draw.
    _d.set(BOW_REST.x, BOW_REST.y, 0.16 + BOW_PULL - ARROW_SCALE * ARROW_TIP_Y).multiplyScalar(SCALE.bow).applyQuaternion(bow.quaternion);
    bow.position.set(-_d.x, -_d.y - 0.42 * low, BOW_Z + m[2]);
    bow.updateMatrix();
    this.string.userData.setPull(pull);
    this.nocked.position.set(BOW_REST.x, BOW_REST.y, 0.16 + pull);

    // left fist on the riser
    this.#hand(this.armL, SHOULDER_L, bow, this.grips.bow.L, 'fist:bow', undefined, bow.quaternion);
    // right hand hooks the string: the contact (fingers) at the nock, the wrist behind it
    _b.set(BOW_REST.x, BOW_REST.y, 0.16 + pull).applyMatrix4(bow.matrix);
    _f.set(0, 0, -1).applyQuaternion(bow.quaternion);
    _d.fromArray(HOOK_BACK).normalize().applyQuaternion(bow.quaternion);
    _p.copy(_b).addScaledVector(_f, HOOK_CONTACT[2]).addScaledVector(_d, -HOOK_CONTACT[1]);
    _hq.copy(bow.quaternion).multiply(HOOK_Q);
    this.#setPose(this.armR, 'hook');
    this.#solveArm(this.armR, SHOULDER_R, _p, _hq);
  }

  /* ---- trap ---- */

  #poseTrap() {
    this.#placeItem(this.trap, TRAP_POS, TRAP_Q);
    this.trap.updateMatrix();
    this.#hand(this.armR, SHOULDER_R, this.trap, this.grips.trap.R, 'fist:trapR');
    this.#hand(this.armL, SHOULDER_L, this.trap, this.grips.trap.L, 'fist:trapL');
  }

  /* ---- knife ---- */

  /** One sustained carving stroke spans the entire server-confirmed action (hand x decreases with progress). */
  #poseKnife() {
    const pr = this.knifeProgress;
    const u = pr * pr * (3 - 2 * pr);
    const press = Math.sin(u * Math.PI);
    _d.set(0.22 - u * 0.2, -0.17 - press * 0.035, -0.5 - press * 0.08);
    _e.set(-press * 0.1, 0.25 - u * 0.25, 0, 'XYZ');
    _q2.setFromEuler(_e).multiply(KNIFE_Q);
    this.#placeItem(this.knife, _d, _q2, { mix: KNIFE_MIX, sprintDip: 0, sprintTilt: 0 });
    this.knife.updateMatrix();
    this.#hand(this.armR, SHOULDER_R, this.knife, this.grips.knife.R, 'fist:knife');
  }

  /* ---- fruit ---- */

  #poseFruit() {
    this.fruitHolder.scale.set(1, 1, 1);
    this.#placeItem(this.fruitHolder, FRUIT_POS, _q2.identity());
    this.fruitHolder.updateMatrix();
    const r = this.motion.rhand;
    this.#hand(this.armR, SHOULDER_R, this.fruitHolder, this.grips.fruit.R, r.weight > 0.5 && r.pose ? r.pose : 'hold');
  }

  /* ---- guns ---- */

  /**
   * Resolve the gun clip for this frame into `this.res`: the reload (driven by the 0..1 fraction from the
   * game, so it is time-scaled to the weapon's reload time) wins over the timed clips (draw, holster, inspect).
   */
  #sampleClips(dt) {
    const res = this.res;
    const gun = isGun(this.shown) ? this.shown : null;
    const wasReloading = this.reloading;
    this.reloading = !!gun && this.phase === 'hold' && this.reload > 0;
    let clip = null, t = 0;
    if (this.reloading) {
      if (!wasReloading) { this.reloadEmpty = this.empty; this.timed = null; }
      clip = this.clips[gun][this.reloadEmpty ? 'reloadEmpty' : 'reloadTac'];
      t = clamp(this.reload, 0, 1) * clip.duration;
    } else if (this.timed) {
      this.timed.t += dt;
      clip = this.timed.clip;
      t = Math.min(this.timed.t, clip.duration);
    }
    if (!clip) {
      res.active = false;
      res.pos[0] = res.pos[1] = res.pos[2] = res.rot[0] = res.rot[1] = res.rot[2] = 0;
      res.lhand.weight = 0;
      res.parts.mag = 0; res.parts.drop = 0; res.parts.magVisible = true; res.parts.charge = 0; res.parts.bolt = 0; res.parts.slide = 0;
      this._clipPrev = -1;
      return res;
    }
    res.parts.drop = 0;
    clip.sample(t, res);
    if (this.timed && this.phase === 'hold' && this.timed.t >= clip.duration) this.timed = null;   // inspect is over
    for (const ev of clip.events) if (ev.t > this._clipPrev && ev.t <= t) this.onClipEvent?.(ev.name, clip.name);
    this._clipPrev = t;
    return res;
  }

  /** Switch state machine: lower (a gun plays `holster`), swap, raise (a gun plays `draw`). */
  #stepSwitch(dt) {
    const want = this.#wanted();
    const busyThrowing = this.throwT > 0 && this.shown === 'spear';
    if (want !== this.shown && !busyThrowing && (this.phase === 'hold' || this.phase === 'raise')) {
      this.phase = 'lower';
      this.reloading = false;
      if (isGun(this.shown)) this.#play('holster', this.switchT * this.clips[this.shown].holster.duration);
      else this.timed = null;
    }
    if (this.phase === 'lower') {
      if (isGun(this.shown) && this.timed) {
        // the clip advances in #sampleClips; mirror its progress here from the previous frame's time
        const c = this.timed.clip;
        const t = this.timed.t + dt;
        this.switchT = clamp(t / c.duration, 0, 1);
        if (t >= c.duration) this.#swap();
      } else {
        this.switchT = Math.min(1, this.switchT + dt * SWITCH_DOWN);
        if (this.switchT >= 1) this.#swap();
      }
    } else if (this.phase === 'raise') {
      if (isGun(this.shown) && this.timed) {
        const c = this.timed.clip;
        const t = this.timed.t + dt;
        this.switchT = clamp(1 - t / c.duration, 0, 1);
        if (t >= c.duration) { this.phase = 'hold'; this.switchT = 0; this.timed = null; }
      } else {
        this.switchT = Math.max(0, this.switchT - dt * SWITCH_UP);
        if (this.switchT <= 0) this.phase = 'hold';
      }
    }
  }

  #swap() {
    const want = this.#wanted();
    this.shown = want;
    if (this.pendingTool === want) { this.tool = want; this.pendingTool = null; }
    this.draw = this.drawVis = 0;
    this.arrowHide = 0;
    this.phase = 'raise';
    this.switchT = 1;
    this.timed = null;
    if (isGun(want)) this.#play('draw', 0);
  }

  #poseGun(dt, res) {
    const kind = this.shown;
    const gun = this.guns[kind];
    const def = GUN_DEFS[kind];
    const grips = this.grips[kind];
    const nodes = grips.nodes;
    // base pose: the hip position with the rotation SOLVED from it (bore through the crosshair's far point), blended toward the sprint pose
    _p.copy(def.hipP);
    if (this.sprintT > 1e-3) _p.lerp(def.sprintP, this.sprintT);
    solveBoreQuat(_q2, _p, nodes.muzzle, GUN_SCALE[kind], def.cant);
    if (this.sprintT > 1e-3) _q2.slerp(def.sprintQ, this.sprintT);
    const m = this.flat ? this.mixed.fill(0) : this.#mix(def.swayScale * lerp(1, 1.5, this.sprintT), def.bobScale, 1, 1);
    gun.scale.setScalar(GUN_SCALE[kind]);
    gun.position.set(_p.x + m[0] + res.pos[0], _p.y + m[1] + res.pos[1], _p.z + m[2] + res.pos[2]);
    _e.set(m[3] + res.rot[0], m[4] + res.rot[1], m[5] + res.rot[2], 'XYZ');
    gun.quaternion.copy(_q2).multiply(_q.setFromEuler(_e));
    gun.updateMatrix();
    gun.userData.flash.visible = this.flashT > 0;

    // ---- hands (the left one first: it may carry the magazine) ----
    this.#setPose(this.armR, grips.rPose);
    this.armR.setTrigger(this.triggerT);
    _p.copy(grips.R.pos).applyMatrix4(gun.matrix);
    _hq.copy(gun.quaternion).multiply(grips.R.quat);
    this.#solveArm(this.armR, SHOULDER_R, _p, _hq);

    const pose = grips.lPose;
    if (res.active && res.lhand.weight > 0.5) {
      // clip key in gun space (CoD scale-1 wrist targets -> our hands)
      wristTarget(this.lhandPos, this.lhandQuat, res.lhand.pos, res.lhand.finger, res.lhand.back, HAND_SCALE, GUN_SCALE[kind]);
      const p = res.lhand.pose;
      this.#setPose(this.armL, p === 'wrap' || p === 'clamp' ? pose : p);
    } else {
      this.lhandPos.copy(grips.L.pos);
      this.lhandQuat.copy(grips.L.quat);
      this.#setPose(this.armL, pose);
    }
    _p.copy(this.lhandPos).applyMatrix4(gun.matrix);
    _hq.copy(gun.quaternion).multiply(this.lhandQuat);
    let shoulder = def.shoulderL;
    if (this.reloading) {
      // the reload's longer reach wants the anchor further back; ease it in and out so the idle grip is unchanged
      const f = this.reload, w = smooth01(f / 0.06) * (1 - smooth01((f - 0.88) / 0.09));
      shoulder = _sh.lerpVectors(def.shoulderL, def.reloadShoulderL, w);
    }
    this.#solveArm(this.armL, shoulder, _p, _hq);

    this.#updateParts(gun, nodes, def, kind, dt, res);
  }

  /** Slide/bolt cycle, charging handle, trigger, and the magazine (seated, in the left hand, or gone). */
  #updateParts(gun, nodes, def, kind, dt, res) {
    const parts = gun.userData.parts;
    if (this.boltCycle > 0) {
      const cycle = Math.max(0.045, CONFIG.weapons[kind].cooldown * 0.62);
      this.boltCycle = Math.max(0, this.boltCycle - dt / cycle);
    }
    const cyc = this.boltCycle;
    const stroke = cyc > 0.55 ? (1 - cyc) / 0.45 : cyc / 0.55;   // out fast, back with a small bounce
    // Locked back while the magazine is empty; an empty reload follows the clip's bolt until the release.
    let locked = this.empty && !this.reloading ? 1 : 0;
    if (this.reloading) locked = this.reloadEmpty ? res.parts.bolt : 0;
    const off = Math.max(stroke, locked);
    if (parts.bolt) parts.bolt.position.set(parts.bolt.userData.rest.x + nodes.boltTravel[0] * off, parts.bolt.userData.rest.y + nodes.boltTravel[1] * off, parts.bolt.userData.rest.z + nodes.boltTravel[2] * off);
    if (parts.slide) parts.slide.position.set(parts.slide.userData.rest.x + nodes.slideTravel[0] * off, parts.slide.userData.rest.y + nodes.slideTravel[1] * off, parts.slide.userData.rest.z + nodes.slideTravel[2] * off);
    if (parts.charging) {
      const pull = res.active ? res.parts.charge : 0;
      const rest = parts.charging.userData.rest;
      parts.charging.position.set(rest.x + nodes.chargePull[0] * pull, rest.y + nodes.chargePull[1] * pull, rest.z + nodes.chargePull[2] * pull);
    }
    if (parts.trigger) parts.trigger.rotation.x = nodes.triggerPull * this.triggerT;
    const mag = parts.magazine;
    if (mag) {
      const inHand = res.active ? res.parts.mag : 0;
      mag.visible = res.active ? res.parts.magVisible : true;
      if (inHand > 1e-4) {
        // the hand target is a wrist: the magazine stands in the fist (its length across the palm, see MAG_GRIP)
        const hold = gun.userData.magHold;
        _p.copy(hold.pos).multiplyScalar(1 / GUN_SCALE[kind]).applyQuaternion(this.lhandQuat).add(this.lhandPos);
        mag.position.lerpVectors(gun.userData.magSeatPos, _p, inHand);
        mag.quaternion.copy(gun.userData.magSeatQuat).slerp(_q.copy(this.lhandQuat).multiply(hold.quat), inHand);
      } else {
        mag.position.copy(gun.userData.magSeatPos);
        mag.quaternion.copy(gun.userData.magSeatQuat);
        const fall = res.active ? res.parts.drop : 0;
        if (fall > 0) {
          // released: it falls straight down in view space (gravity) and tumbles a little
          _p.set(0, -fall, 0).applyQuaternion(_q.copy(gun.quaternion).invert()).multiplyScalar(1 / GUN_SCALE[kind]);
          mag.position.add(_p);
          mag.rotateX(fall * 3);
        }
      }
    }
  }

  /* ---- off-hand torch ---- */

  /**
   * Off-hand torch. Held up in the left of the view while lit; lowered out of view
   * (the light dims to an ember) while the main tool needs the left hand: bow, trap,
   * rifle, eating or a reload. A pistol is one-handed meanwhile. The torch object itself is posed
   * (own sway) and the torch arm's fist is welded to it.
   */
  #updateTorch(dt, s) {
    const tool = this.pendingTool ?? this.tool;
    const busy = leftHandBusy(tool, this.eatT > 0) || this.reloading;
    const up = this.torchOwned && this.torchLit && !busy;
    this.torchRaise = damp(this.torchRaise, up ? 1 : 0, up ? 7 : 9, dt);
    if (this.torchRaise < 0.002) this.torchRaise = 0;
    const lightTarget = !this.torchLit ? 0 : busy ? TORCH.light.ember : 1;
    this.torchLevel = damp(this.torchLevel, lightTarget, 6, dt);
    if (this.torchLevel < 0.002) this.torchLevel = 0;

    const lit = this.torchLit;
    // flame fade follows how far the torch is raised; a lit torch below the screen needs no flame drawing
    this.torch.userData.update(this.time, dt, lit && this.torchRaise > 0.02);
    this.torchFlicker = torchFlicker(this.time, 0);
    const shown = this.torchRaise > 0.002 && this.torchOwned;
    this.torch.visible = shown;
    this.armT.root.visible = shown;
    if (shown) {
      const k = sstep(this.torchRaise);
      const torch = this.torch;
      const p = torch.position.copy(TORCH_LOW).lerp(TORCH_HELD, k);
      // own motion: slower breathing sway, a gentle walk bob out of phase with the right hand, camera lag at half strength
      const t = this.time;
      const walk = clamp(s.speed / CONFIG.player.walkSpeed, 0, 1) * (s.grounded ? 1 : 0.2);
      const lag = this.lagL, bob = this.bobL;
      p.x += bob[0] * -0.6 + lag[0] * 0.7 + Math.sin(t * 1.15) * 0.004;
      p.y += bob[1] * 0.7 + lag[1] * 0.7 + Math.sin(t * 1.55 + 1) * 0.005 + Math.sin(this.bobPhase * 2 + 1.2) * 0.006 * walk - (s.sprint ? 0.03 : 0);
      p.z += Math.sin(t * 0.9 + 2) * 0.003;
      _e.set(Math.sin(t * 1.7 + 0.5) * 0.02 - lag[1] * 1.2 + (1 - k) * 0.6, 0,
        Math.sin(t * 1.3) * 0.025 + lag[0] * 1.5 + (s.sprint ? 0.12 : 0), 'XYZ');
      torch.quaternion.copy(TORCH_TILT).multiply(_q.setFromEuler(_e));
      torch.updateMatrix();
      this.#hand(this.armT, SHOULDER_L, torch, this.grips.torch.L, 'fist:torch');
    }
    // the warm glow on hands and weapon follows the flame
    const glow = this.gfx.viewTorch;
    if (glow) {
      this.torch.userData.head.getWorldPosition(this.torchHeadView);   // matrices are one frame old: fine for a glow
      glow.position.copy(this.torchHeadView);
      glow.intensity = this.torchRaise * (lit ? 1.1 : 0) * (0.8 + 0.4 * this.torchFlicker);
    }
  }
}
