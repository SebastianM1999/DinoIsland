import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gunAction, updateGunReload, gunInventory } from '../src/sim/firearms.js';
import { ACT, EQUIP } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { Viewmodel } from '../src/client/player/viewmodel.js';
import { PlayerModel } from '../src/client/models/playerModel.js';

function fixture(kind) {
  const d = { id: 2, type: 'raptor', x: 0, y: 0, z: -10, radius: 0.7, alive: true, hp: 70 };
  const p = { id: 1, alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eq: EQUIP.indexOf(kind), inv: { guns: gunInventory(), reloading: null }, nextFireAt: 0, mods: { reloadMul: 1 } };
  const w = { now: 0, sendInv() {}, event() {}, hitPose: (dino) => dino, layout: { groundAt: () => 0, colliders: { circles: [], boxes: [] } },
    dinos: { get: id => id === d.id ? d : null, damage: (d, amount) => { d.hp -= amount; } } };
  const shot = { a: ACT.SHOT, kind, o: [0, CONFIG.player.eyeHeight, 0], dir: [0, 0, -1], dino: d.id, p: [0, CONFIG.player.eyeHeight, -10], zone: 'body' };
  return { w, p, d, shot };
}
for (const kind of ['pistol', 'rifle']) {
  test(`${kind} consumes rounds, damages only on a valid ray, and enforces cooldown and empty magazine`, () => {
    const { w, p, d, shot } = fixture(kind);
    gunAction(w, p, shot);
    assert.equal(d.hp, 70 - CONFIG.weapons[kind].damage);
    assert.equal(p.inv.guns[kind].loaded, CONFIG.weapons[kind].magazine - 1);
    gunAction(w, p, shot); assert.equal(d.hp, 70 - CONFIG.weapons[kind].damage);
    w.now += CONFIG.weapons[kind].cooldown;
    gunAction(w, p, { ...shot, p: [10, CONFIG.player.eyeHeight, -10] });
    assert.equal(d.hp, 70 - CONFIG.weapons[kind].damage);
    w.now += 1; p.inv.guns[kind].loaded = 0;
    gunAction(w, p, shot); assert.equal(d.hp, 70 - CONFIG.weapons[kind].damage);
  });
  test(`${kind} rejects spoofed origin, backwards aim, wrong equipment, and shots through obstacles`, () => {
    for (const mutation of [s => { s.o[0] = 50; }, s => { s.dir[2] = 1; }]) {
      const { w, p, d, shot } = fixture(kind); mutation(shot); gunAction(w, p, shot);
      assert.equal(d.hp, 70); assert.equal(p.inv.guns[kind].loaded, CONFIG.weapons[kind].magazine);
    }
    const { w, p, d, shot } = fixture(kind);
    p.eq = 0; gunAction(w, p, shot); assert.equal(d.hp, 70);
    p.eq = EQUIP.indexOf(kind);
    w.layout.colliders.circles.push({ x: 0, z: -5, r: 1, minY: 0, maxY: 6 });
    gunAction(w, p, shot); assert.equal(d.hp, 70);
  });
  test(`${kind} reload moves reserve rounds only after duration and cancels when switched away`, () => {
    const { w, p, shot } = fixture(kind); const a = p.inv.guns[kind]; a.loaded = 0; a.reserve = 5;
    gunAction(w, p, { a: ACT.RELOAD, kind });
    gunAction(w, p, shot); assert.equal(a.loaded, 0);
    w.now = CONFIG.weapons[kind].reloadTime - 0.01; updateGunReload(w, p); assert.equal(a.loaded, 0);
    w.now += 0.02; updateGunReload(w, p); assert.equal(a.loaded, 5); assert.equal(a.reserve, 0);
    assert.equal(p.inv.reloading, null);
    a.loaded = 0; a.reserve = 10; gunAction(w, p, { a: ACT.RELOAD, kind });
    p.eq = 0; updateGunReload(w, p); assert.equal(a.loaded, 0); assert.equal(p.inv.reloading, null);
  });
}
test('gun grips follow the weapon in first-person and co-op, including recoil and reload', () => {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, 0);
  const model = new PlayerModel(0);
  for (const kind of ['pistol', 'rifle']) {
    vm.setTool(kind);
    for (let i = 0; i < 50; i++) vm.update(1 / 60, { speed: 5, sprint: false, grounded: true, lookX: 1, lookY: 0 });
    vm.fireGun(); vm.setGunPose(true, 0.5);
    vm.update(1 / 60, { speed: 5, sprint: false, grounded: true, lookX: 1, lookY: 0 });
    vm.root.updateMatrixWorld(true);
    const gun = vm.guns[kind];
    for (const [contact, hand] of [['gripR', vm.rHand], ['gripL', vm.lHand]]) {
      assert.ok(gun.localToWorld(gun.userData[contact].clone()).distanceTo(hand.getWorldPosition(new THREE.Vector3())) < 1e-6);
    }
    model.animate(1 / 60, { eq: kind, spd: 0, pitch: 0.2, alive: true, grounded: true }); model.root.updateMatrixWorld(true);
    for (const [contact, arm] of [['gripR', model.armR], ['gripL', model.armL]]) {
      assert.ok(model.toolRig.localToWorld(model.held[kind].userData[contact].clone()).distanceTo(arm.localToWorld(new THREE.Vector3(0, -0.46, 0))) < 1e-6);
    }
  }
});


test('automatic rifle fire survives quantized host ticks without permitting a burst of extra shots', () => {
  const { w, p, shot } = fixture('rifle');
  const interval = CONFIG.weapons.rifle.cooldown;
  const tick = 1 / CONFIG.net.tickRate;
  for (let i = 0; i < 10; i++) {
    w.now = Math.floor((i * interval + 1e-9) / tick) * tick;
    gunAction(w, p, shot);
    assert.equal(p.inv.guns.rifle.loaded, CONFIG.weapons.rifle.magazine - i - 1);
    for (let j = 0; j < 5; j++) gunAction(w, p, shot);
    assert.equal(p.inv.guns.rifle.loaded, CONFIG.weapons.rifle.magazine - i - 1);
  }
});
