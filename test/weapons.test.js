import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Viewmodel } from '../src/client/player/viewmodel.js';
import { BOW_REST, ARROW_TIP_Y } from '../src/client/models/weapons.js';
import { PlayerModel } from '../src/client/models/playerModel.js';

const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
const make = () => new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, 0);
function settle(vm, tool) {
  vm.setTool(tool);
  for (let i = 0; i < 50; i++) vm.update(1 / 60, idle);
}
function near(a, b) { assert.ok(a.distanceTo(b) < 1e-6, `contact gap: ${a.distanceTo(b)}`); }

test('bow string, arrow nock, and pulling hand share a contact through draw and sway', () => {
  const vm = make(); settle(vm, 'bow');
  for (const draw of [0, 0.25, 0.6, 1]) {
    vm.setDraw(draw);
    for (let i = 0; i < 30; i++) {
      vm.update(1 / 60, { ...idle, speed: 5, lookX: i * 3, lookY: -i });
      vm.root.updateMatrixWorld(true);
      const nock = new THREE.Vector3().fromBufferAttribute(vm.string.geometry.attributes.position, 1);
      near(vm.bow.localToWorld(nock), vm.rHand.getWorldPosition(new THREE.Vector3()));
      near(vm.nocked.getWorldPosition(new THREE.Vector3()), vm.rHand.getWorldPosition(new THREE.Vector3()));
    }
  }
});

test('both hands stay on trap handles during walking, switching, and placement', () => {
  const vm = make(); settle(vm, 'trap'); vm.place();
  for (let i = 0; i < 40; i++) {
    vm.update(1 / 60, { ...idle, speed: 5, sprint: true });
    vm.root.updateMatrixWorld(true);
    for (const [side, hand] of [[-1, vm.lHand], [1, vm.rHand]]) {
      near(vm.trap.localToWorld(new THREE.Vector3(side * 0.99, 0.18, 0)), hand.getWorldPosition(new THREE.Vector3()));
    }
  }
});

test('optimistic inventory removal preserves spear until its throw release', () => {
  const vm = make(); vm.throwSpear(); vm.setTool('spear', { hasSpear: false });
  vm.update(0.05, idle); assert.equal(vm.spear.visible, true);
  for (let i = 0; i < 4; i++) vm.update(0.05, idle);
  assert.equal(vm.spear.visible, false);
  for (let i = 0; i < 50; i++) vm.update(1 / 60, idle);
  assert.equal(vm.spear.visible, false);
});

test('remote bow and trap grips follow both arms and spear points forward', () => {
  const model = new PlayerModel(0);
  for (const eq of ['bow', 'trap', 'spear', 'bait', 'bow']) {
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
