import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Arm, HAND_POSES } from '../firearms/reference/hands.js';
import { blob, latheZ } from '../firearms/reference/geometry.js';
import { MAT } from '../kit.js';
import { fabric } from '../fabric.js';

/**
 * First-person arms: Claude-of-Duty's two-bone arm rig (`firearms/reference/hands.js`)
 * restyled as bare cartoon hands in the player colour. The rig is built with throwaway
 * sentinel materials, its glove details are cut away and everything left is vertex
 * coloured and drawn with the shared `MAT.standard`.
 */

/** Cartoon chunkiness: the whole hand, and the finger/thumb girth on top of it. */
export const HAND_SCALE = 1.05;
export const FINGER_THICK = 1.15;

const KNUCKLE = 0.098; // wrist -> knuckle line along the fingers, at scale 1
const HALF_PALM = 0.016; // back of hand -> palm surface, at scale 1
const SKIN_NAIL = 0.22; // nails: skin lerped this far to white
const CUFF_DARK = 0.78;
// Pattern cells of fabric() are ~0.1 units; this makes them a few cm on a sleeve.
const PATTERN_K = 3;

/** The index finger on the trigger: CoD's rest curl per joint and how much more a full pull adds (`arm.setTrigger`). */
const TRIGGER_REST = [0.55, 0.72, 0.34];
const TRIGGER_PULL = [0.3, 0.42, 0.3];

const _skin = new THREE.Color();
const _nail = new THREE.Color();
const _tmp = new THREE.Color();
const _pat = new THREE.Vector3();

function setColor(geo, color) {
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Colour by `at(x, y, z)`; per triangle (centroid, non-indexed geometry) or per vertex. */
function colorize(geo, at, perFace) {
  const pos = geo.getAttribute('position');
  const step = perFace ? 3 : 1;
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += step) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < step; k++) { x += pos.getX(i + k); y += pos.getY(i + k); z += pos.getZ(i + k); }
    const c = at(x / step, y / step, z / step);
    for (let k = 0; k < step; k++) { a[(i + k) * 3] = c.r; a[(i + k) * 3 + 1] = c.g; a[(i + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Smooth closed tapered tube along -Z (elbow at z = 0, wrist at z = -len), uncoloured. */
function smoothTube(len, r0, r1) {
  const g = latheZ([
    [0, 0],
    [r0 * 0.35, r0 * 0.8],
    [r0 * 0.7, r0 * 0.97],
    [len * 0.5, (r0 + r1) * 0.5 * 1.04],
    [len - r1 * 0.7, r1 * 0.97],
    [len - r1 * 0.35, r1 * 0.8],
    [len, 0],
  ], 16);
  g.rotateY(Math.PI);
  return g;
}

/** The same, skin coloured. */
function bareTube(len, r0, r1, skin) {
  return setColor(smoothTube(len, r0, r1), _skin.set(skin));
}

/** The sleeve's colours at a point of its local space: fabric (or sleeveColor), darker cuff band. */
function sleeveAt(top, cuffZ) {
  const f = top.sleeveColor ? new THREE.Color(top.sleeveColor) : fabric(top);
  return (x, y, z) => {
    const c = typeof f === 'function' ? f(_pat.set(Math.atan2(y, x) * 0.04 * PATTERN_K, -z * PATTERN_K, 0)) : f;
    return z < cuffZ ? _tmp.copy(c).multiplyScalar(CUFF_DARK) : c;
  };
}

function sleeveGeometry(base, top, cuffZ, edge) {
  const patterned = top.pattern === 'plaid' || top.pattern === 'stripes';
  // Flat colour per triangle needs small triangles to give crisp stripes and a straight cuff edge.
  const fine = patterned || cuffZ > -Infinity;
  const g = fine ? new TessellateModifier(edge, 6).modify(base) : base.clone();
  return colorize(g, sleeveAt(top, cuffZ), fine);
}

/** Dispose a derived geometry unless it is one of the kept CoD sleeve bases. */
function replaceGeometry(m, geo, st) {
  const old = m.geometry;
  m.geometry = geo;
  if (old !== st.upperBase && old !== st.foreBase) old.dispose();
}

/** Rebuild/recolour both sleeves for a new outfit (and skin). */
export function restyleSleeves(arm, skin, top) {
  const st = arm._cartoon;
  st.skin = skin;
  st.top = top;
  const s = arm.scale;
  const sleeve = top.sleeve ?? 'short';
  replaceGeometry(arm.upper, sleeve === 'none'
    ? bareTube(arm.l1, 0.036 * s, 0.031 * s, skin)
    : sleeveGeometry(st.upperBase, top, -Infinity, 0.012), st);
  replaceGeometry(arm.fore, sleeve === 'long'
    ? sleeveGeometry(st.foreBase, top, -(arm.l2 - 0.034 * s), 0.008)
    : bareTube(arm.l2 + 0.004 * s, 0.031 * s, 0.025 * s, skin), st);
  return arm;
}

const POSES = {
  // Power-grip fist, thumb across the curled fingers.
  fist: {
    fingers: [[1.4, 1.55, 0.85], [1.45, 1.6, 0.9], [1.45, 1.6, 0.9], [1.4, 1.55, 0.85]],
    thumb: [0.55, 0.5],
    thumbBase: [0.2, -1.0, -0.7],
  },
  relaxed: {
    fingers: [[0.35, 0.4, 0.2], [0.42, 0.45, 0.22], [0.5, 0.5, 0.25], [0.58, 0.55, 0.28]],
    thumb: [0.2, 0.15],
    thumbBase: [0.1, -0.8, -0.35],
  },
  // Cupped palm-up fruit hold, thumb out.
  hold: {
    fingers: [[0.7, 0.75, 0.4], [0.78, 0.8, 0.42], [0.84, 0.85, 0.45], [0.9, 0.9, 0.48]],
    thumb: [0.15, 0.12],
    thumbBase: [0.05, -0.6, -0.25],
  },
  // Bow-string hook: three fingers hooked at the middle joints, little finger tucked, thumb along the index.
  hook: {
    fingers: [[0.35, 1.3, 0.6], [0.4, 1.4, 0.65], [0.4, 1.35, 0.6], [1.2, 1.3, 0.9]],
    thumb: [0.3, 0.2],
    thumbBase: [0.1, -0.45, -0.2],
  },
};

/** Distal segment of a digit: thicken, then merge in a lighter nail cap on the dorsal side. */
function nailedTip(mesh, len, r2, r3, thick, scale) {
  const seg = mesh.geometry;
  const r = ((r2 + r3) * 0.5) * 0.88 * thick; // dorsal surface height, finger is 0.88 deep
  // a small rounded nail, mostly sunk into the fingertip so only a subtle plate shows
  const nail = blob(r * 0.95, 0.006 * scale, len * 0.42, 0.0028 * scale, 3);
  nail.translate(0, r - 0.0012 * scale, -len * 0.52);
  setColor(nail, _nail.copy(_skin).lerp(new THREE.Color(1, 1, 1), SKIN_NAIL));
  // rounded boxes are non-indexed, lathes are indexed: merge needs both alike
  const flat = (g) => (g.index ? g.toNonIndexed() : g);
  mesh.geometry = mergeGeometries([flat(seg), flat(nail)], false);
  seg.dispose();
  nail.dispose();
}

/**
 * A CoD `Arm` restyled as a bare cartoon arm: skin from `skin` (hex), sleeves from `top`
 * (an entry of TOPS), poses 'fist' / 'relaxed' / 'hold' / 'hook' in `arm.poses`.
 */
export function makeCartoonArm(side, skin, top, opts = {}) {
  const mats = { glove: new THREE.MeshBasicMaterial(), pad: new THREE.MeshBasicMaterial(),
    seam: new THREE.MeshBasicMaterial(), sleeve: new THREE.MeshBasicMaterial() };
  const arm = new Arm(side, mats, { ...opts, scale: HAND_SCALE, pose: 'wrap' });
  const s = arm.scale;
  _skin.set(skin);

  // Cartoon hands have no glove details.
  const drop = [];
  arm.root.traverse((o) => { if (o.isMesh && (o.material === mats.pad || o.material === mats.seam)) drop.push(o); });
  for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }

  // The palm shell is the whole hand. The open wrist cuff pipe is dropped: its rim flared out of the forearm
  // like a spike and showed its hollow inside; the smooth forearm tube meets the palm directly.
  const [shell, cuff] = arm.glove.children.filter((o) => o.isMesh && o.material === mats.glove);
  setColor(shell.geometry, _skin);
  cuff.geometry.dispose();
  arm.glove.remove(cuff);

  // Chunkier digits; fitToCylinder reads _segRadius, so it stays consistent.
  const digits = [
    ...arm.fingers.map((f, i) => ({ joints: f.joints, len: arm._segLength[i][2], r2: arm._segRadius[i][2], r3: arm._segRadius[i][3] })),
    { joints: arm.thumb.joints, len: 0.032 * s, r2: 0.0102 * s, r3: 0.0078 * s },
  ];
  arm._segRadius = arm._segRadius.map((a) => a.map((v) => v * FINGER_THICK));
  for (const d of digits) {
    d.joints.forEach((j, k) => {
      const m = j.children.find((o) => o.isMesh && o.material === mats.glove);
      m.geometry.scale(FINGER_THICK, FINGER_THICK, 1);
      setColor(m.geometry, _skin);
      if (k === d.joints.length - 1) nailedTip(m, d.len, d.r2, d.r3, FINGER_THICK, s);
    });
  }

  // The CoD sleeves have fold rings and wrinkle ridges that read as spikes this close to the camera:
  // sleeves here are smooth tapered tubes (cuff band and fabric come from the vertex colours).
  arm.upper.geometry.dispose();
  arm.fore.geometry.dispose();
  arm.upper.geometry = smoothTube(arm.l1, 0.034 * s, 0.03 * s);
  arm.fore.geometry = smoothTube(arm.l2 + 0.004 * s, 0.027 * s, 0.023 * s);
  arm._cartoon = { skin, top, upperBase: arm.upper.geometry, foreBase: arm.fore.geometry };
  const dispose = arm.dispose.bind(arm);
  arm.dispose = () => { dispose(); arm._cartoon.upperBase.dispose(); arm._cartoon.foreBase.dispose(); };
  restyleSleeves(arm, skin, top);

  arm.root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = MAT.standard;
    o.castShadow = false;
    o.frustumCulled = false;
  });
  for (const m of Object.values(mats)) m.dispose();

  for (const [name, pose] of Object.entries(POSES)) arm.poses[name] = structuredClone(pose);
  // The trigger finger starts from the CURRENT pose's own rest curl (a gun grip fits it onto its trigger, `fitTriggerFinger`).
  arm.setTrigger = function setTrigger(t) {
    const rest = this.poses[this.pose]?.trigger ?? TRIGGER_REST;
    const joints = this.fingers[0].joints;
    for (let j = 0; j < 3; j++) joints[j].rotation.x = -(rest[j] + t * TRIGGER_PULL[j]);
  };
  return arm.setPose(opts.pose ?? 'relaxed');
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Right-handed hand basis: local -Z = `finger`, +Y = `back` (made perpendicular to the finger). */
export function handBasis(out, finger, back) {
  _v.set(-finger[0], -finger[1], -finger[2]).normalize(); // hand +Z
  _v2.set(back[0], back[1], back[2]);
  _v2.addScaledVector(_v, -_v2.dot(_v));
  if (_v2.lengthSq() < 1e-8) _v2.set(0, 1, 0).addScaledVector(_v, -_v.y);
  _v2.normalize(); // hand +Y
  _v3.crossVectors(_v2, _v).normalize(); // hand +X
  _m.makeBasis(_v3, _v2, _v);
  return out.setFromRotationMatrix(_m);
}

/**
 * CoD wrist targets are authored for scale 1 (knuckle line 0.098 m along `finger`, palm surface
 * 0.016 m below the back). Move the wrist so the scaled hand keeps its knuckles on the same line
 * and its palm on the same surface.
 */
export function scaledGrip(grip, scale = HAND_SCALE, itemScale = 1) {
  const f = new THREE.Vector3().fromArray(grip.finger).normalize();
  const b = new THREE.Vector3().fromArray(grip.back);
  b.addScaledVector(f, -b.dot(f)).normalize();
  const pos = new THREE.Vector3().fromArray(grip.pos)
    .addScaledVector(f, KNUCKLE * (1 - scale))
    .addScaledVector(b, HALF_PALM * (scale - 1));
  if (itemScale !== 1) pos.addScaledVector(f, KNUCKLE * scale * (1 - 1 / itemScale));
  return { pos: pos.toArray(), finger: f.toArray(), back: b.toArray() };
}

const _ww = new THREE.Vector3();
const _wb = new THREE.Vector3();

/**
 * Allocation-free `scaledGrip` + `handBasis` for per-frame targets (clip keys): writes the scaled wrist
 * position into `outPos` and the hand orientation into `outQuat` from CoD arrays `pos`, `finger`, `back`.
 */
export function wristTarget(outPos, outQuat, pos, finger, back, scale = HAND_SCALE, itemScale = 1) {
  _ww.fromArray(finger).normalize();
  _wb.fromArray(back);
  _wb.addScaledVector(_ww, -_wb.dot(_ww)).normalize();
  outPos.fromArray(pos).addScaledVector(_ww, KNUCKLE * (1 - scale)).addScaledVector(_wb, HALF_PALM * (scale - 1));
  if (itemScale !== 1) outPos.addScaledVector(_ww, KNUCKLE * scale * (1 - 1 / itemScale));
  return handBasis(outQuat, finger, back);
}

/**
 * Wrist target for a hand closing round a cylinder (tool-local coords): back of hand = `normal`
 * (outward, perpendicular to `axis`, tilted `tilt` rad toward -axis), fingers wrap around it
 * (`wrap` = +1/-1 direction, rolled `roll` rad toward +axis), knuckles touch the surface.
 */
export function cylinderGrip({ point, axis, radius, normal, wrap = 1, roll = 0, tilt = 0, scale = HAND_SCALE }) {
  const a = new THREE.Vector3().fromArray(axis).normalize();
  const n = new THREE.Vector3().fromArray(normal);
  n.addScaledVector(a, -n.dot(a)).normalize();
  const f = new THREE.Vector3().crossVectors(a, n).multiplyScalar(wrap).normalize()
    .multiplyScalar(Math.cos(roll)).addScaledVector(a, Math.sin(roll));
  const back = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(a, -Math.sin(tilt));
  const c = new THREE.Vector3().fromArray(point).addScaledVector(n, radius + 0.0145 * scale);
  const pos = c.addScaledVector(f, -KNUCKLE * scale);
  return { pos: pos.toArray(), finger: f.toArray(), back: back.toArray() };
}

// Fitted poses per `${side}:${name}:${HAND_SCALE}`; a new Viewmodel per island reuses them.
const fitted = new Map();
const _q = new THREE.Quaternion();
const _hp = new THREE.Vector3();

/**
 * Close the arm's fingers round a cylinder (axisPoint/axisDir/radius in tool space = arm-root
 * space) at the wrist target `grip`, store the result as `arm.poses[name]` and return it.
 * `base` seeds the curl for a new name.
 */
export function fitCylinderPose(arm, name, grip, axisPoint, axisDir, radius, base = 'wrap') {
  const key = `${arm.side}:${name}:${HAND_SCALE}`;
  if (!fitted.has(key)) {
    arm.poses[name] ??= structuredClone(arm.poses[base] ?? HAND_POSES[base] ?? HAND_POSES.wrap);
    const prev = arm.pose;
    const savedPos = arm.hand.position.clone();
    const savedQuat = arm.hand.quaternion.clone();
    arm.fitToCylinder(_hp.fromArray(grip.pos), handBasis(_q, grip.finger, grip.back), axisPoint, axisDir, radius,
      { clearance: 0.001, poseName: name });
    fitted.set(key, structuredClone(arm.poses[name]));
    arm.setPose(prev);
    arm.hand.position.copy(savedPos);
    arm.hand.quaternion.copy(savedQuat);
  } else arm.poses[name] = structuredClone(fitted.get(key));
  return arm.poses[name];
}

const _tp = new THREE.Vector3();
const _tInv = new THREE.Matrix4();

/**
 * Put the index fingertip pad of `arm` on `target` (arm-root space) with the hand at wrist target `grip`: scans one
 * curl factor on the trigger finger's rest curl, stores the best as `arm.poses[name].trigger` (so `setTrigger`
 * keeps the finger on it) and returns the miss in metres. The pose `name` must exist (see `fitCylinderPose`).
 */
export function fitTriggerFinger(arm, name, grip, target) {
  const key = `${arm.side}:${name}:trigger:${HAND_SCALE}`;
  const pose = arm.poses[name];
  if (fitted.has(key)) { pose.trigger = fitted.get(key).trigger.slice(); pose.fingers[0] = fitted.get(key).finger.slice(); return fitted.get(key).miss; }
  const prev = arm.pose;
  const savedPos = arm.hand.position.clone();
  const savedQuat = arm.hand.quaternion.clone();
  arm.hand.position.fromArray(grip.pos);
  arm.hand.quaternion.copy(handBasis(_q, grip.finger, grip.back));
  arm.root.updateMatrixWorld(true);
  _tInv.copy(arm.root.matrixWorld).invert();
  const f = arm.fingers[0];
  const rr = arm._segRadius[0][3], ll = arm._segLength[0][2];
  let best = 1, bestMiss = Infinity;
  for (let i = 0; i <= 120; i++) {
    const k = 0.2 + (i / 120) * 2.2;
    for (let j = 0; j < 3; j++) f.joints[j].rotation.x = -TRIGGER_REST[j] * k;
    f.joints[2].updateWorldMatrix(true, true);
    const miss = _tp.set(0, -rr * 1.05, -ll * 0.5).applyMatrix4(f.joints[2].matrixWorld).applyMatrix4(_tInv).distanceTo(_tt.fromArray(target));
    if (miss < bestMiss) { bestMiss = miss; best = k; }
  }
  const trigger = TRIGGER_REST.map((v) => v * best);
  pose.trigger = trigger;
  pose.fingers[0] = trigger.slice();
  fitted.set(key, { trigger, finger: trigger, miss: bestMiss });
  arm.setPose(prev);
  arm.hand.position.copy(savedPos);
  arm.hand.quaternion.copy(savedQuat);
  return bestMiss;
}
const _tt = new THREE.Vector3();
