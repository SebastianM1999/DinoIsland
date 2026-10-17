import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Viewmodel, GUN_SCALE } from '../src/client/player/viewmodel.js';
import { CONFIG } from '../src/shared/config.js';

const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
function fixture() {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera(62, 16 / 9, .01, 10) }, 0);
  vm.flat = true; vm.setTool('sniper');
  for (let i = 0; i < 150; i++) vm.update(1 / 60, idle);
  return vm;
}

test('sniper raises its optical centre onto the view axis and returns to its hip pose', () => {
  const vm = fixture(), gun = vm.guns.sniper;
  const hip = gun.position.clone();
  vm.setGunPose(.5); vm.update(1 / 60, idle);
  assert.ok(gun.position.x > 0 && gun.position.x < hip.x);
  vm.setGunPose(1); vm.update(1 / 60, idle); vm.root.updateMatrixWorld(true);
  const eye = gun.localToWorld(new THREE.Vector3(...gun.userData.nodes.scopeEye));
  assert.ok(Math.abs(eye.x) < 1e-9 && Math.abs(eye.y) < 1e-9);
  assert.ok(Math.abs(eye.z + .12) < 1e-9);
  const axis = new THREE.Vector3(...gun.userData.nodes.scopeAxis).applyQuaternion(gun.quaternion);
  assert.ok(axis.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-9);
  vm.setGunPose(0); vm.update(1 / 60, idle);
  assert.ok(gun.position.distanceTo(hip) < 1e-9);
});

test('sniper firing hand follows the bolt operation and returns while the support hand stays on the rifle', () => {
  const vm = fixture(), gun = vm.guns.sniper, handle = gun.userData.parts.charging;
  const left = vm.lHand.getWorldPosition(new THREE.Vector3());
  const right = vm.rHand.getWorldPosition(new THREE.Vector3());
  vm.fireGun();
  for (let i = 0; i < 25; i++) vm.update(1 / 60, idle);
  vm.root.updateMatrixWorld(true);
  assert.ok(handle.position.z > handle.userData.rest.z + .05);
  assert.ok(vm.rHand.getWorldPosition(new THREE.Vector3()).distanceTo(right) > .03);
  assert.ok(vm.lHand.getWorldPosition(new THREE.Vector3()).distanceTo(left) < 1e-6);
  for (let i = 0; i < 60; i++) vm.update(1 / 60, idle);
  vm.root.updateMatrixWorld(true);
  assert.ok(Math.abs(handle.position.z - handle.userData.rest.z) < 1e-9);
  assert.ok(vm.rHand.getWorldPosition(new THREE.Vector3()).distanceTo(right) < 1e-6);
  assert.equal(vm.armR.pose, 'grip:sniper');
  assert.equal(gun.scale.x, GUN_SCALE.sniper);
  assert.ok(vm.sinceShot > CONFIG.weapons.sniper.cooldown);
});
