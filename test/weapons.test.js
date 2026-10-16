import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPEAR_THROW, spearLaunch } from '../src/client/player/spearThrow.js';
import { CONFIG } from '../src/shared/config.js';
import { Projectiles } from '../src/client/entities/projectiles.js';
import { Viewmodel, HOOK_CONTACT } from '../src/client/player/viewmodel.js';
import { BOW_REST, ARROW_TIP_Y } from '../src/client/models/weapons.js';
import { PlayerModel } from '../src/client/models/playerModel.js';
import { HAND_SCALE } from '../src/client/models/arms/cartoonArm.js';

const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
const make = () => new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, 0);
function settle(vm, tool) {
  vm.setTool(tool);
  for (let i = 0; i < 50; i++) vm.update(1 / 60, idle);
}
function near(a, b, tol = 1e-6) { assert.ok(a.distanceTo(b) < tol, `contact gap: ${a.distanceTo(b)}`); }
const world = (object) => object.getWorldPosition(new THREE.Vector3());

test('butchering makes one sustained stroke tied to action progress, with no looping', () => {
  const vm = make();
  vm.setKnife(true, 0);
  for (let i = 0; i < 30; i++) vm.update(1 / 60, idle);
  let lastX = vm.rHand.position.x;
  for (let i = 1; i <= 20; i++) {
    vm.setKnife(true, i / 20);
    vm.update(1 / 60, idle);
    assert.ok(vm.rHand.position.x < lastX, 'carving progresses across the carcass without restarting');
    lastX = vm.rHand.position.x;
  }
  const end = vm.rHand.position.clone();
  for (let i = 0; i < 120; i++) vm.update(1 / 60, idle);
  near(vm.rHand.position, end, 0.01);   // holds at the end of the stroke (idle sway only)
  vm.setKnife(false);
  for (let i = 0; i < 30; i++) vm.update(1 / 60, idle);
  assert.equal(vm.knife.visible, false);
  vm.setKnife(true, 0);
  for (let i = 0; i < 30; i++) vm.update(1 / 60, idle);
  assert.ok(vm.rHand.position.x > end.x + 0.19, 'a new carcass starts a fresh stroke');
});

test('bow string, arrow nock, and the hooked fingers share a contact through draw and sway; the left fist stays on the riser', () => {
  const vm = make(); settle(vm, 'bow');
  for (const draw of [0, 0.25, 0.6, 1]) {
    vm.setDraw(draw);
    for (let i = 0; i < 30; i++) {
      vm.update(1 / 60, { ...idle, speed: 5, lookX: i * 3, lookY: -i });
      vm.root.updateMatrixWorld(true);
      const nock = new THREE.Vector3().fromBufferAttribute(vm.string.geometry.attributes.position, 1);
      const string = vm.bow.localToWorld(nock);
      near(string, vm.rHand.localToWorld(new THREE.Vector3(...HOOK_CONTACT)));
      near(vm.nocked.getWorldPosition(new THREE.Vector3()), string);
      near(vm.bow.localToWorld(vm.grips.bow.L.pos.clone()), world(vm.lHand));
    }
  }
  assert.equal(vm.armR.pose, 'hook'); assert.equal(vm.armL.pose, 'fist:bow');
});

test('both hands stay on trap handles during walking, switching, and placement', () => {
  const vm = make(); settle(vm, 'trap'); vm.place();
  for (let i = 0; i < 40; i++) {
    vm.update(1 / 60, { ...idle, speed: 5, sprint: true });
    vm.root.updateMatrixWorld(true);
    for (const [key, hand] of [['L', vm.lHand], ['R', vm.rHand]]) {
      near(vm.trap.localToWorld(vm.grips.trap[key].pos.clone()), world(hand));
    }
  }
  // the knuckles sit on the side bar: wrist + 0.098 m (scaled) along the fingers is a hand's thickness off the bar's axis
  vm.root.updateMatrixWorld(true);
  for (const [side, key, hand] of [[-1, 'L', vm.lHand], [1, 'R', vm.rHand]]) {
    const knuckle = hand.localToWorld(new THREE.Vector3(0, 0, -0.098 * HAND_SCALE));
    const bar = vm.trap.localToWorld(new THREE.Vector3(side * 0.99, 0.18, 0));
    const along = new THREE.Vector3(0, 0, 1).transformDirection(vm.trap.matrixWorld);
    const off = knuckle.sub(bar); off.addScaledVector(along, -off.dot(along));
    assert.ok(Math.abs(off.length() - (0.032 * 0.3 + 0.02 + 0.0145 * HAND_SCALE)) < 1e-6, `${key} knuckle distance ${off.length()}`);
  }
});

test('the knife, spear and grips of every tool stay welded to their hands through sway, bob and lag', () => {
  const vm = make();
  const walk = (i) => ({ ...idle, speed: 5, lookX: Math.sin(i) * 20, lookY: Math.cos(i) * 10 });
  settle(vm, 'spear');
  for (let i = 0; i < 40; i++) {
    vm.update(1 / 60, walk(i)); vm.root.updateMatrixWorld(true);
    near(vm.spear.localToWorld(vm.grips.spear.R.pos.clone()), world(vm.rHand));
  }
  assert.equal(vm.armR.pose, 'fist:spear');
  vm.stab();
  for (let i = 0; i < 30; i++) {
    vm.update(1 / 60, walk(i)); vm.root.updateMatrixWorld(true);
    near(vm.spear.localToWorld(vm.grips.spear.R.pos.clone()), world(vm.rHand));
  }
  vm.setKnife(true, 0.3);
  for (let i = 0; i < 60; i++) vm.update(1 / 60, idle);
  for (let i = 0; i < 40; i++) {
    vm.setKnife(true, 0.3 + i / 100);
    vm.update(1 / 60, walk(i)); vm.root.updateMatrixWorld(true);
    near(vm.knife.localToWorld(vm.grips.knife.R.pos.clone()), world(vm.rHand));
  }
  assert.equal(vm.armR.pose, 'fist:knife');
  vm.setKnife(false); vm.setTool('fruit', { fruitType: 'mango' });
  for (let i = 0; i < 90; i++) vm.update(1 / 60, idle);
  vm.root.updateMatrixWorld(true);
  near(vm.fruitHolder.localToWorld(vm.grips.fruit.R.pos.clone()), world(vm.rHand));
  assert.equal(vm.armR.pose, 'hold');
});

test('optimistic inventory removal preserves spear until its throw release', () => {
  const vm = make(); vm.throwSpear(); vm.setTool('spear', { hasSpear: false });
  vm.update(0.05, idle); assert.equal(vm.spear.visible, true);
  for (let i = 0; i < 5; i++) vm.update(0.05, idle);
  assert.equal(vm.spear.visible, false);
  for (let i = 0; i < 50; i++) vm.update(1 / 60, idle);
  assert.equal(vm.spear.visible, false);
});

test('remote bow and trap grips follow both arms and spear points forward', () => {
  const model = new PlayerModel(0);
  for (const eq of ['bow', 'trap', 'spear', 'fruit', 'bow']) {
    model.animate(1 / 60, { eq, spd: 5, pitch: 0.3, drawing: eq === 'bow', eating: false, attacking: false, carry: 0, alive: true, grounded: true });
    model.root.updateMatrixWorld(true);
    if (eq === 'bow' || eq === 'trap') {
      for (const [side, arm] of [[-1, model.armL], [1, model.armR]]) {
        const target = eq === 'trap' ? new THREE.Vector3(side * 0.99 * 0.35, 0.18 * 0.35, 0)
          : side === -1 ? new THREE.Vector3() : new THREE.Vector3(BOW_REST.x, BOW_REST.y, 0.4);
        near(model.toolRig.localToWorld(target), arm.localToWorld(new THREE.Vector3(0, -0.46, 0)));
      }
    }
    if (eq === 'spear') assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(model.held.spear.quaternion).z < 0);
  }
});


test('arrow shaft touches its bow rest and arrowhead projects to screen center throughout draw and sway', () => {
  const vm = make(); settle(vm, 'bow');
  for (const draw of [0, 0.25, 0.6, 1]) {
    vm.setDraw(draw);
    for (let i = 0; i < 40; i++) {
      vm.update(1 / 60, { ...idle, speed: 5, lookX: i * 3, lookY: -i });
      vm.root.updateMatrixWorld(true);
      const nock = vm.nocked.getWorldPosition(new THREE.Vector3());
      const rest = vm.bow.localToWorld(BOW_REST.clone());
      const tip = vm.nocked.localToWorld(new THREE.Vector3(0, ARROW_TIP_Y, 0));
      const shaft = tip.clone().sub(nock);
      const distance = rest.clone().sub(nock).cross(shaft).length() / shaft.length();
      assert.ok(distance < 1e-6, `arrow misses bow rest by ${distance}`);
      const along = rest.clone().sub(nock).dot(shaft) / shaft.lengthSq();
      assert.ok(along > 0 && along < 1, 'bow rest must touch the shaft between nock and tip');
      const projected = tip.clone().project(vm.gfx.viewCamera);
      assert.ok(Math.hypot(projected.x, projected.y) < 1e-6, `arrowhead off center: ${projected.x}, ${projected.y}`);
    }
  }
});


test('the entire held spear matches the first flying frame across both camera projections', () => {
  for (const aspect of [1.6, 0.65]) for (const fov of [74, 85]) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
    camera.position.set(3, 2, -6); camera.rotation.set(0.4, 1.2, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const viewCamera = new THREE.PerspectiveCamera(62, aspect, 0.01, 10);
    const vm = new Viewmodel({ viewCamera, camera }, 0); settle(vm, 'spear');
    let releases = 0, launch;
    vm.throwSpear(() => { releases++; launch = spearLaunch(camera); });
    vm.setTool('spear', { hasSpear: false });
    while (vm.throwElapsed < SPEAR_THROW.release - 0.001) vm.update(Math.min(1 / 120, SPEAR_THROW.release - vm.throwElapsed), { ...idle, speed: 5, lookX: 12, lookY: 8 });
    vm.root.updateMatrixWorld(true);
    assert.equal(releases, 1); assert.equal(vm.spear.visible, false);
    const worldRotation = launch.rotation;
    for (const point of [[0, 1.5, 0], [0, -0.75, 0], [0.08, 1.25, 0.03], [0, 0, 0]]) {
      const held = vm.spear.localToWorld(new THREE.Vector3(...point)).project(viewCamera);
      const flying = new THREE.Vector3(...point).applyQuaternion(worldRotation).add(launch.origin).project(camera);
      assert.ok(Math.hypot(held.x - flying.x, held.y - flying.y) < 1e-6, `release projection: ${held.toArray()} / ${flying.toArray()}, t=${vm.throwElapsed}`);
    }
    for (let i = 0; i < 100; i++) vm.update(1 / 120, idle);
    assert.equal(releases, 1);
    assert.ok(vm.rHand.position.distanceTo(vm.rHandRest) < 0.02, 'the empty hand recovers to its rest target');
  }
});

test('release stays synchronized at different frame rates and hand recovery stays continuous', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const vm = make(); settle(vm, 'spear'); let releases = 0;
    vm.throwSpear(() => releases++); vm.setTool('spear', { hasSpear: false });
    let last = vm.rHand.position.clone(), opened = false;
    while (vm.throwT > 0) {
      vm.update(dt, idle);
      if (vm.throwElapsed < SPEAR_THROW.release - 1e-9) { assert.equal(releases, 0); assert.equal(vm.spear.visible, true); }
      else { assert.equal(releases, 1); assert.equal(vm.spear.visible, false); }
      assert.ok(vm.rHand.position.distanceTo(last) < dt * 12 + 0.01, 'hand path must not snap');
      if (vm.armR.pose === 'open') opened = true;
      last.copy(vm.rHand.position);
    }
    assert.equal(opened, true, 'the hand opens at release'); assert.equal(vm.armR.pose, 'relaxed', 'and relaxes afterwards');
  }
});

test('own spear renders at the release pose before advancing along its ballistic path', () => {
  const game = { gfx: { scene: new THREE.Scene() }, net: { on() {}, act() {} },
    terrain: { waterLevelAt: () => -100 }, dinos: { map: new Map() }, layout: { colliders: { circles: [], boxes: [] }, groundAt: () => -100 } };
  const projectiles = new Projectiles(game);
  const origin = new THREE.Vector3(0.25, 5, -0.55), velocity = new THREE.Vector3(0, 1.5, -CONFIG.weapons.spear.throwSpeed);
  projectiles.fire('spear', origin, velocity);
  const p = projectiles.list[0]; projectiles.update(1 / 60);
  near(p.obj.position, origin); assert.equal(p.t, 0);
  projectiles.update(1 / 60);
  assert.ok(p.obj.position.z < origin.z); assert.ok(p.vel.y < velocity.y);
});
