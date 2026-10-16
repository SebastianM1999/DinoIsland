import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TOPS } from '../src/shared/outfits.js';
import { MAT } from '../src/client/models/kit.js';
import { CONFIG } from '../src/shared/config.js';
import { Viewmodel, GUN_DEFS, GUN_SCALE } from '../src/client/player/viewmodel.js';
import { magInHand, RELOAD_TUNING } from '../src/client/player/reloadClips.js';
import { makeSampleResult } from '../src/client/models/firearms/reference/clips.js';
import { fabric } from '../src/client/models/fabric.js';
import {
  HAND_SCALE, FINGER_THICK, makeCartoonArm, restyleSleeves, handBasis, scaledGrip, cylinderGrip, fitCylinderPose,
} from '../src/client/models/arms/cartoonArm.js';

const SKIN = '#e0a070';
const top = (id) => TOPS.find((t) => t.id === id);
const meshesOf = (arm) => { const out = []; arm.root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const v3 = (a) => new THREE.Vector3().fromArray(a);
const near = (a, b, eps = 1e-5) => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
const allColors = (geo) => {
  const c = geo.getAttribute('color');
  return Array.from({ length: c.count }, (_, i) => new THREE.Color().fromBufferAttribute(c, i));
};
/** Colours of the vertices that lie away from the wrist cuff band. */
const bodyColors = (arm, mesh) => {
  const pos = mesh.geometry.getAttribute('position');
  const lim = -(arm.l2 - 0.034 * arm.scale);
  return allColors(mesh.geometry).filter((_, i) => pos.getZ(i) > lim + 0.01);
};

test('cartoon arm is bare: no pad or seam meshes, one shared vertex-coloured material, small draw budget', () => {
  for (const side of [-1, 1]) {
    const arm = makeCartoonArm(side, SKIN, top('safari'));
    const ms = meshesOf(arm);
    assert.ok(ms.length <= 18, `${ms.length} draw calls`);
    assert.ok(ms.length >= 15, 'palm, 12 finger segments, 2 thumb segments and 2 sleeves remain');
    for (const m of ms) {
      assert.equal(m.material, MAT.standard);
      assert.equal(m.geometry.getAttribute('color').itemSize, 3);
      assert.equal(m.castShadow, false);
      assert.equal(m.frustumCulled, false);
    }
    const skinC = new THREE.Color(SKIN);
    assert.ok(allColors(arm.glove.children.find((o) => o.isMesh).geometry).every((c) => near(c, skinC)));
    const distal = arm.fingers[1].joints[2].children.find((o) => o.isMesh).geometry;
    const cs = allColors(distal);
    assert.ok(cs.some((c) => near(c, skinC)));
    assert.ok(cs.some((c) => c.r > skinC.r && c.g > skinC.g && c.b > skinC.b), 'nail cap is lighter than skin');
    arm.dispose();
  }
});

test('bones are the CoD lengths scaled by HAND_SCALE and the fingers are thickened for the contact fit', () => {
  const arm = makeCartoonArm(1, SKIN, top('tank'));
  assert.ok(Math.abs(arm.l1 - 0.33 * HAND_SCALE) < 1e-9);
  assert.ok(Math.abs(arm.l2 - 0.3 * HAND_SCALE) < 1e-9);
  assert.ok(Math.abs(arm._segRadius[1][0] - 0.0104 * HAND_SCALE * FINGER_THICK) < 1e-9);
  const g = arm.fingers[1].joints[0].children.find((o) => o.isMesh).geometry;
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.x > 0.0104 * HAND_SCALE * 1.1, 'segment geometry is wider than the CoD finger');
});

test('sleeves follow the top and restyleSleeves switches them', () => {
  const arm = makeCartoonArm(-1, SKIN, top('safari'));
  const skinC = new THREE.Color(SKIN);
  const cloth = new THREE.Color(top('safari').color);
  assert.ok(bodyColors(arm, arm.fore).every((c) => near(c, cloth)), 'long: fabric forearm');
  assert.ok(bodyColors(arm, arm.upper).every((c) => near(c, cloth)));
  const cuff = allColors(arm.fore.geometry).filter((c) => near(c, cloth.clone().multiplyScalar(0.78)));
  assert.ok(cuff.length > 20, 'darker cuff band at the wrist');

  restyleSleeves(arm, SKIN, top('explorer'));
  const shirt = new THREE.Color(top('explorer').color);
  assert.ok(allColors(arm.fore.geometry).every((c) => near(c, skinC)), 'short: bare forearm');
  assert.ok(allColors(arm.upper.geometry).every((c) => near(c, shirt)), 'short: fabric upper sleeve');

  restyleSleeves(arm, SKIN, top('vest'));
  assert.ok(allColors(arm.upper.geometry).every((c) => near(c, new THREE.Color(top('vest').sleeveColor))));

  restyleSleeves(arm, SKIN, top('tank'));
  assert.ok(allColors(arm.upper.geometry).every((c) => near(c, skinC)), 'none: bare upper arm');
  assert.ok(allColors(arm.fore.geometry).every((c) => near(c, skinC)));

  restyleSleeves(arm, SKIN, top('flannel'));
  assert.equal(typeof fabric(top('flannel')), 'function');
  const plaid = new Set(allColors(arm.fore.geometry).map((c) => c.getHexString()));
  assert.ok(plaid.size >= 3, 'plaid shows several shades');
  arm.dispose();
});

test('restyleSleeves disposes the geometry it replaces but keeps the CoD bases for later outfits', () => {
  const arm = makeCartoonArm(1, SKIN, top('explorer'));
  const bare = arm.fore.geometry;
  const bareCount = bare.getAttribute('position').count;
  let disposed = 0;
  bare.addEventListener('dispose', () => disposed++);
  restyleSleeves(arm, SKIN, top('safari'));
  assert.equal(disposed, 1);
  assert.ok(arm.fore.geometry.getAttribute('position').count > bareCount);
  restyleSleeves(arm, SKIN, top('explorer'));
  restyleSleeves(arm, SKIN, top('safari'));
  assert.ok(arm.fore.geometry.getAttribute('position').count > bareCount, 'base survived two restyles');
});

test('custom poses live on the arm and all four apply', () => {
  const arm = makeCartoonArm(1, SKIN, top('tank'), { pose: 'fist' });
  assert.equal(arm.pose, 'fist');
  const other = makeCartoonArm(1, SKIN, top('tank'));
  assert.equal(other.pose, 'relaxed');
  for (const name of ['fist', 'relaxed', 'hold', 'hook']) {
    other.setPose(name);
    assert.equal(other.pose, name);
    assert.equal(other.fingers[0].joints[0].rotation.x, -other.poses[name].fingers[0][0]);
  }
  other.setPose('hook');
  assert.ok(other.fingers[1].joints[1].rotation.x < -1.2, 'hook curls the middle joints');
  other.setPose('fist');
  assert.ok(other.fingers[3].joints[0].rotation.x < -1.2);
});

test('handBasis points -Z along the fingers and +Y along the back', () => {
  const q = handBasis(new THREE.Quaternion(), [0, -0.315, -0.949], [0.98, 0.1, -0.2]);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const b = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  assert.ok(f.distanceTo(new THREE.Vector3(0, -0.315, -0.949).normalize()) < 1e-6);
  assert.ok(Math.abs(f.dot(b)) < 1e-9);
  assert.ok(b.x > 0.9);
});

test('scaledGrip keeps the knuckle line; only the thicker palm shifts the wrist along the back', () => {
  const grip = { pos: [0.0251, 0.06, 0.1223], finger: [0.05, -0.55, -0.833], back: [1, 0.03, 0.04] };
  const g = scaledGrip(grip, HAND_SCALE);
  const f = v3(grip.finger).normalize();
  const back = v3(g.back);
  const k0 = v3(grip.pos).addScaledVector(f, 0.098);
  const k1 = v3(g.pos).addScaledVector(v3(g.finger), 0.098 * HAND_SCALE);
  const d = k1.clone().sub(k0);
  assert.ok(Math.abs(d.dot(f)) < 1e-9, 'knuckle unchanged along the fingers');
  assert.ok(Math.abs(d.dot(back) - 0.016 * (HAND_SCALE - 1)) < 1e-9);
  assert.ok(d.clone().addScaledVector(back, -d.dot(back)).length() < 1e-9, 'no sideways drift');
  assert.ok(v3(scaledGrip(grip, 1).pos).distanceTo(v3(grip.pos)) < 1e-12, 'scale 1 is the identity');
});

test('cylinderGrip puts the knuckles on the tube with the fingers wrapping round it', () => {
  const axis = [0, 0, -1];
  const point = [0, 0.1, -0.2];
  const grip = cylinderGrip({ point, axis, radius: 0.02, normal: [-0.6, 0.8, 0], wrap: -1 });
  const rel = v3(grip.pos).addScaledVector(v3(grip.finger), 0.098 * HAND_SCALE).sub(v3(point));
  rel.z = 0; // distance from the axis line
  assert.ok(Math.abs(rel.length() - (0.02 + 0.0145 * HAND_SCALE)) < 1e-9);
  const finger = v3(grip.finger);
  assert.ok(Math.abs(finger.dot(v3(axis))) < 1e-9, 'fingers perpendicular to the axis');
  assert.ok(Math.abs(finger.length() - 1) < 1e-9);
  assert.ok(Math.abs(finger.dot(v3(grip.back))) < 1e-9);
  const other = cylinderGrip({ point, axis, radius: 0.02, normal: [-0.6, 0.8, 0], wrap: 1 });
  assert.ok(v3(other.finger).dot(finger) < -0.99, 'wrap flips the finger direction');
  const rolled = cylinderGrip({ point, axis, radius: 0.02, normal: [0, 1, 0], roll: 0.3, tilt: 0.2 });
  assert.ok(v3(rolled.finger).dot(v3(axis)) > 0.29, 'roll turns the fingers toward +axis');
  assert.ok(v3(rolled.back).dot(v3(axis)) < -0.19, 'tilt leans the back toward -axis');
});

test('fitCylinderPose closes the fingers round the tube and later arms reuse the cached result', () => {
  const axisPoint = [0, 0, 0];
  const axisDir = [0, 0, -1];
  const grip = cylinderGrip({ point: axisPoint, axis: axisDir, radius: 0.025, normal: [0, 1, 0], wrap: 1 });
  const a = makeCartoonArm(1, SKIN, top('tank'));
  const pose = fitCylinderPose(a, 'test-tube', grip, axisPoint, axisDir, 0.025);
  assert.equal(pose.fingers.length, 4);
  assert.equal(a.pose, 'relaxed', 'previous pose restored');
  assert.deepEqual(a.poses['test-tube'], pose);
  assert.ok(pose.fingers.every((f) => f.every(Number.isFinite)));
  assert.ok(pose.fingers.some((f) => f[0] > 0.3), 'fingers curl');

  const b = makeCartoonArm(1, SKIN, top('tank'));
  let calls = 0;
  b.fitToCylinder = () => { calls++; };
  const again = fitCylinderPose(b, 'test-tube', grip, axisPoint, axisDir, 0.025);
  assert.equal(calls, 0);
  assert.deepEqual(again, pose);
  assert.notEqual(again, pose, 'each arm gets its own copy');

  const left = makeCartoonArm(-1, SKIN, top('tank'));
  let leftCalls = 0;
  const fit = left.fitToCylinder.bind(left);
  left.fitToCylinder = (...args) => { leftCalls++; return fit(...args); };
  fitCylinderPose(left, 'test-tube', grip, axisPoint, axisDir, 0.025);
  assert.equal(leftCalls, 1, 'the other side is fitted on its own');
});

/* ------------------------------------------------------------------------------------------------
 * The first-person viewmodel on top of the arms (src/client/player/viewmodel.js)
 * ---------------------------------------------------------------------------------------------- */

const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
const makeVm = (slot = 0) => new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, slot);
const run = (vm, n, s = idle, dt = 1 / 60) => { for (let i = 0; i < n; i++) vm.update(dt, s); };
const worldOf = (o) => o.getWorldPosition(new THREE.Vector3());

test('the viewmodel builds three arms from the player colour and restyles all of them with the outfit', () => {
  const vm = makeVm(2);
  assert.deepEqual([vm.armR.side, vm.armL.side, vm.armT.side], [1, -1, -1]);
  assert.equal(vm.rHand, vm.armR.hand); assert.equal(vm.lHand, vm.armL.hand);
  assert.equal(vm.root.parent, vm.gfx.viewCamera);
  assert.ok(vm.root.quaternion.equals(new THREE.Quaternion()) && vm.root.position.length() === 0);
  vm.setOutfit({ top: TOPS.findIndex((t) => t.id === 'tank') });
  const skin = new THREE.Color(CONFIG.playerColors[2]);
  for (const arm of vm.arms) assert.ok(allColors(arm.fore.geometry).every((c) => near(c, skin)), 'bare skin');
  vm.setOutfit({ top: TOPS.findIndex((t) => t.id === 'safari') });
  const cloth = new THREE.Color(top('safari').color);
  for (const arm of vm.arms) assert.ok(bodyColors(arm, arm.fore).every((c) => near(c, cloth)));
});

test('a rifle reload: the magazine follows the left hand while it is carried, is gone while stowed and seated again at the end', () => {
  const vm = makeVm();
  vm.setTool('rifle'); run(vm, 200);
  assert.equal(vm.phase, 'hold');
  const gun = vm.guns.rifle, mag = gun.userData.parts.magazine, seat = gun.userData.magSeatPos;
  const clip = vm.clips.rifle.reloadTac;
  const step = (f) => { vm.setGunPose(false, f, false); vm.update(1 / 60, idle); vm.root.updateMatrixWorld(true); };
  assert.ok(mag.position.distanceTo(seat) < 1e-9 && mag.visible, 'seated before the reload');
  const hold = magInHand(GUN_DEFS.rifle.magLen * GUN_SCALE.rifle, RELOAD_TUNING.rifle.spin);
  const inHand = () => vm.lHand.localToWorld(hold.pos.clone());
  const events = Object.fromEntries(clip.events.map((e) => [e.name, e.t / clip.duration]));
  step(0.01);
  for (const f of [events.magout + 0.04, (events.magout + events.magdrop) / 2]) {
    step(f);
    assert.ok(mag.visible);
    assert.ok(mag.position.distanceTo(seat) > 0.03, `away from the seat at ${f}`);
    assert.ok(worldOf(mag).distanceTo(inHand()) < 1e-6, `in the left hand at ${f}`);
  }
  step((events.magdrop + events.fetch) / 2);
  assert.equal(mag.visible, false, 'the old magazine is stowed while the hand is off screen');
  for (const f of [events.fetch + 0.03, events.fetch + 0.1]) {
    step(f);
    assert.ok(mag.visible && mag.position.distanceTo(seat) > 0.03, `fresh magazine on its way at ${f}`);
    assert.ok(worldOf(mag).distanceTo(inHand()) < 1e-6, `in the left hand at ${f}`);
  }
  step(events.magin + 0.01);
  assert.ok(mag.position.distanceTo(seat) < 1e-6, 'seated at magin');
  step(0.98);
  assert.ok(mag.visible && mag.position.distanceTo(seat) < 1e-9, 'seated at the end');
  vm.setGunPose(false, 0, false); run(vm, 5);
  assert.ok(mag.position.distanceTo(seat) < 1e-9);
});

test('the reload fraction maps onto the clip: 0.5 samples the clip at half its duration, an empty magazine picks the empty clip', () => {
  for (const kind of ['pistol', 'rifle']) {
    const vm = makeVm(); vm.setTool(kind); run(vm, 200);
    for (const [empty, name] of [[false, 'reloadTac'], [true, 'reloadEmpty']]) {
      const clip = vm.clips[kind][name], expected = makeSampleResult();
      vm.setGunPose(false, 0, false); run(vm, 3);
      vm.setGunPose(false, 0.5, empty); vm.update(1 / 60, idle);
      clip.sample(0.5 * clip.duration, expected);
      assert.deepEqual(vm.res.lhand, expected.lhand, `${kind} ${name}`);
      assert.deepEqual(vm.res.parts, expected.parts);
      assert.deepEqual(vm.res.pos, expected.pos);
      // latched: the clip does not change when the magazine count does mid-reload
      vm.setGunPose(false, 0.5, !empty); vm.update(1 / 60, idle);
      assert.deepEqual(vm.res.lhand, expected.lhand, 'latched at the start of the reload');
      vm.setGunPose(false, 0, false); run(vm, 3);
    }
    assert.equal(vm.clips[kind].reloadEmpty.duration, vm.clips[kind].reloadTac.duration, 'both fit the reload time of the weapon');
    assert.notEqual(vm.clips[kind].reloadEmpty, vm.clips[kind].reloadTac);
  }
});

test('an empty magazine locks the slide or bolt back; the shot cycle moves it and it comes home', () => {
  for (const [kind, part] of [['pistol', 'slide'], ['rifle', 'bolt']]) {
    const vm = makeVm(); vm.setTool(kind); run(vm, 200);
    const p = vm.guns[kind].userData.parts[part], rest = p.userData.rest.z;
    assert.ok(Math.abs(p.position.z - rest) < 1e-9);
    vm.fireGun(); let moved = 0;
    for (let i = 0; i < 30; i++) { vm.update(1 / 60, idle); moved = Math.max(moved, p.position.z - rest); }
    assert.ok(moved > 0.01, `${part} cycles back by ${moved}`);
    assert.ok(Math.abs(p.position.z - rest) < 1e-9, 'and forward again');
    vm.setGunPose(false, 0, true); run(vm, 5);
    assert.ok(p.position.z - rest > 0.02, 'locked back while empty');
  }
});

test('arm bones are never stretched: shoulder-elbow = l1 and elbow-hand <= l2 for every tool, throw, stab, eat and reload', () => {
  const vm = makeVm(); vm.setTorch(true, true);
  const check = (tag) => {
    vm.root.updateMatrixWorld(true);
    for (const arm of vm.arms) {
      if (!arm.root.visible) continue;
      const shoulder = arm.upperPivot.position, elbow = arm.forePivot.position;
      assert.ok(shoulder.distanceTo(elbow) <= arm.l1 + 1e-6, `${tag} upper arm ${shoulder.distanceTo(elbow)}`);
      assert.ok(elbow.distanceTo(arm.hand.position) <= arm.l2 + 1e-6, `${tag} forearm ${elbow.distanceTo(arm.hand.position)}`);
    }
  };
  const move = { speed: 6, sprint: true, grounded: true, lookX: 30, lookY: -20 };
  for (const tool of ['spear', 'bow', 'trap', 'fruit', 'pistol', 'rifle', 'spear']) {
    vm.setTool(tool, { fruitType: 'mango' });
    for (let i = 0; i < 100; i++) { vm.update(1 / 60, i % 20 < 10 ? move : { ...move, lookX: -40, sprint: false }); check(`${tool} ${i}`); }
  }
  vm.setTool('bow'); vm.setDraw(1); for (let i = 0; i < 100; i++) { vm.update(1 / 60, move); check('bow draw'); }
  vm.release(); for (let i = 0; i < 30; i++) { vm.update(1 / 60, idle); check('bow release'); }
  vm.setTool('spear'); run(vm, 100);
  vm.stab(); for (let i = 0; i < 40; i++) { vm.update(1 / 60, move); check('stab'); }
  vm.throwSpear(); vm.setTool('spear', { hasSpear: false });
  for (let i = 0; i < 60; i++) { vm.update(1 / 60, move); check('throw'); }
  vm.setTool('trap'); run(vm, 100); vm.place(); for (let i = 0; i < 40; i++) { vm.update(1 / 60, move); check('place'); }
  vm.setTool('spear'); vm.eat('mango', 1.1); for (let i = 0; i < 80; i++) { vm.update(1 / 60, idle); check('eat'); }
  vm.setKnife(true, 0); run(vm, 60);
  for (let i = 0; i <= 30; i++) { vm.setKnife(true, i / 30); vm.update(1 / 60, idle); check('knife'); }
  vm.setKnife(false);
  for (const kind of ['pistol', 'rifle']) {
    vm.setTool(kind); run(vm, 200);
    for (const empty of [false, true]) {
      for (let f = 0; f <= 0.98; f += 0.02) { vm.setGunPose(false, f, empty); vm.update(1 / 60, move); check(`${kind} reload ${f}`); }
      vm.setGunPose(false, 0, false); run(vm, 10);
    }
    vm.inspect(); for (let i = 0; i < 200; i++) { vm.update(1 / 60, idle); check(`${kind} inspect`); }
  }
});

test('the torch arm shows only while the left hand is free', () => {
  const vm = makeVm(); vm.setTorch(true, true);
  const free = { spear: true, fruit: true, pistol: true, bow: false, trap: false, rifle: false };
  for (const [tool, up] of Object.entries(free)) {
    vm.setTool(tool, { fruitType: 'mango' }); run(vm, 200);
    assert.equal(vm.armT.root.visible, up, `${tool}: torch arm`);
    assert.equal(vm.torch.visible, up, `${tool}: torch`);
    if (up) assert.ok(worldOf(vm.tHand).distanceTo(vm.torch.localToWorld(vm.grips.torch.L.pos.clone())) < 1e-6, `${tool}: fist welded to the torch`);
    assert.equal(vm.armL.root.visible, tool === 'bow' || tool === 'trap' || tool === 'rifle', `${tool}: left arm`);
  }
  // eating needs the left hand too, a reload as well; a put-out torch is never shown
  vm.setTool('spear'); run(vm, 200); assert.equal(vm.armT.root.visible, true);
  vm.eat('mango', 1.1); run(vm, 55); assert.equal(vm.armT.root.visible, false, 'eating');
  run(vm, 120); assert.equal(vm.armT.root.visible, true);
  vm.setTool('pistol'); run(vm, 200); assert.equal(vm.armT.root.visible, true);
  vm.setGunPose(false, 0.4, false); run(vm, 55); assert.equal(vm.armT.root.visible, false, 'pistol reload');
  assert.equal(vm.armL.root.visible, true, 'the reload uses the left hand');
  vm.setGunPose(false, 0, false); run(vm, 100); assert.equal(vm.armT.root.visible, true);
  vm.setTorch(true, false); run(vm, 100); assert.equal(vm.armT.root.visible, false);
  assert.equal(vm.torchLevel, 0);
});

test('switching from a pistol to the spear plays the holster clip, then shows the spear; a gun is drawn with its draw clip', () => {
  const vm = makeVm();
  vm.setTool('pistol'); run(vm, 150);
  assert.equal(vm.shown, 'pistol'); assert.equal(vm.tool, 'pistol');
  vm.setTool('spear');
  vm.update(1 / 60, idle);
  assert.equal(vm.timed.clip.name, 'holster'); assert.equal(vm.pendingTool, 'spear'); assert.equal(vm.tool, 'pistol');
  assert.equal(vm.guns.pistol.visible, true);
  let last = vm.switchT;
  for (let i = 0; i < 60 && vm.shown === 'pistol'; i++) { vm.update(1 / 60, idle); assert.ok(vm.switchT >= last - 1e-9, 'lowering'); last = vm.switchT; }
  assert.equal(vm.shown, 'spear'); assert.equal(vm.tool, 'spear'); assert.equal(vm.pendingTool, null);
  assert.equal(vm.spear.visible, true); assert.equal(vm.guns.pistol.visible, false);
  run(vm, 40); assert.equal(vm.switchT, 0); assert.equal(vm.phase, 'hold');
  // drawing a rifle: the draw clip maps onto switchT, 1 -> 0, below the fire gate only at the end
  vm.setTool('rifle');
  const seen = new Set();
  let gate = null;
  for (let i = 0; i < 200; i++) {
    vm.update(1 / 60, idle);
    if (vm.timed) seen.add(vm.timed.clip.name);
    if (vm.shown === 'rifle' && vm.tool === 'rifle' && vm.switchT < 0.05 && gate === null) gate = i;
  }
  assert.deepEqual([...seen], ['draw']);
  assert.ok(gate !== null && vm.phase === 'hold' && vm.switchT === 0);
  assert.equal(vm.guns.rifle.visible, true);
  assert.equal(vm.armL.root.visible, true, 'the left arm lifts into its grip');
});

test('a throw keeps its release contract while a tool switch waits: the spear does not lower mid-throw', () => {
  const vm = makeVm(); run(vm, 60);
  let released = 0;
  vm.throwSpear(() => released++); vm.setTool('bow');
  for (let i = 0; i < 20; i++) { vm.update(1 / 60, idle); assert.equal(vm.shown, 'spear'); }
  while (vm.throwT > 0) vm.update(1 / 60, idle);
  assert.equal(released, 1);
  run(vm, 80); assert.equal(vm.shown, 'bow'); assert.equal(vm.tool, 'bow');
});

test('eating puts the fruit in hand (lowering the tool) and brings it to the mouth; the knife overrides the tool and gives it back', () => {
  const vm = makeVm(); vm.setTool('fruit', { fruitType: 'mango' }); run(vm, 100);
  const rest = vm.fruitHolder.position.clone();
  vm.setTool('bow', { fruitType: 'mango' }); run(vm, 100);
  vm.eat('mango', 1.1);
  run(vm, 25);
  assert.equal(vm.shown, 'fruit'); assert.equal(vm.tool, 'bow'); assert.equal(vm.fruitHolder.visible, true);
  assert.equal(vm.bow.visible, false); assert.equal(vm.armL.root.visible, false);
  let near_mouth = 0;
  for (let i = 0; i < 30; i++) { vm.update(1 / 60, idle); near_mouth = Math.max(near_mouth, rest.distanceTo(vm.fruitHolder.position)); }
  assert.ok(near_mouth > 0.08, `the fruit travels ${near_mouth}`);
  assert.equal(vm.armR.pose, 'hold');
  run(vm, 150); assert.equal(vm.shown, 'bow'); assert.equal(vm.tool, 'bow'); assert.equal(vm.fruitHolder.visible, false);
  vm.setKnife(true, 0); run(vm, 60);
  assert.equal(vm.shown, 'knife'); assert.equal(vm.tool, 'bow'); assert.equal(vm.armL.root.visible, false);
  vm.setKnife(false); run(vm, 80);
  assert.equal(vm.shown, 'bow'); assert.equal(vm.bow.visible, true);
});

test('the stab thrusts along the shaft and back; a throw goes closed fist, open hand, relaxed hand', () => {
  const vm = makeVm(); run(vm, 60);
  const home = vm.spear.position.clone();
  vm.stab();
  let far = 0;
  for (let i = 0; i < 30; i++) { vm.update(1 / 60, idle); far = Math.max(far, vm.spear.position.distanceTo(home)); }
  assert.ok(far > 0.36 && far < 0.5, `thrust ${far}`);
  assert.ok(vm.spear.position.distanceTo(home) < 0.02, 'and back');
  const poses = [];
  vm.throwSpear(() => {}); vm.setTool('spear', { hasSpear: false });
  while (vm.throwT > 0) { vm.update(1 / 120, idle); if (poses.at(-1) !== vm.armR.pose) poses.push(vm.armR.pose); }
  run(vm, 5); if (poses.at(-1) !== vm.armR.pose) poses.push(vm.armR.pose);
  assert.deepEqual(poses, ['fist:spear', 'open', 'relaxed']);
});

test('the layers react: a recoil kicks the gun back and returns it, turning the view lags the gun, a landing dips it', () => {
  const vm = makeVm(); vm.setTool('rifle'); run(vm, 200);
  const gun = vm.guns.rifle;
  let rest = gun.position.clone();
  vm.fireGun(); let back = 0;
  for (let i = 0; i < 12; i++) { vm.update(1 / 60, idle); back = Math.max(back, gun.position.z - rest.z); }
  assert.ok(back > 0.004, `kick ${back}`);
  run(vm, 300); rest = gun.position.clone();
  const x0 = gun.position.x;
  for (let i = 0; i < 10; i++) vm.update(1 / 60, { ...idle, lookX: 40 });
  assert.ok(gun.position.x < x0 - 0.002, 'turning right drags the gun left');
  run(vm, 300, { ...idle, grounded: false }); rest = gun.position.clone();
  vm.update(1 / 60, idle);
  let dip = 0; for (let i = 0; i < 20; i++) { vm.update(1 / 60, idle); dip = Math.max(dip, rest.y - gun.position.y); }
  assert.ok(dip > 1e-4, `landing dip ${dip}`);   // subtle by design (CoD: 14 mm per unit of spring)
});

test('the rifle support wrist stays nearly straight: the forearm runs in line with the hand', () => {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 10) }, 0);
  vm.flat = true; vm.setTool('rifle');
  for (let i = 0; i < 60; i++) vm.update(1 / 60, { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 });
  const fore = new THREE.Vector3(0, 0, -1).applyQuaternion(vm.armL.forePivot.quaternion);
  const hand = new THREE.Vector3(0, 0, -1).applyQuaternion(vm.armL.hand.quaternion);
  const bend = THREE.MathUtils.radToDeg(fore.angleTo(hand));
  assert.ok(bend < 20, `support wrist bent ${bend.toFixed(1)} degrees`);
});
