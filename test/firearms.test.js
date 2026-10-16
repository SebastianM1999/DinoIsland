import { makeFirearm } from '../src/client/models/firearms/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gunAction, updateGunReload, gunInventory } from '../src/sim/firearms.js';
import { ACT, EQUIP } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { Viewmodel, GUN_SCALE, CONVERGE, solveBoreQuat } from '../src/client/player/viewmodel.js';
import { PlayerModel, GUN_GRIPS_3P } from '../src/client/models/playerModel.js';
import { HAND_SCALE, scaledGrip, wristTarget } from '../src/client/models/arms/cartoonArm.js';
import { makeSampleResult } from '../src/client/models/firearms/reference/clips.js';

function fixture(kind) {
  const d = { id: 2, type: 'raptor', x: 0, y: 0, z: -10, radius: 0.7, alive: true, hp: 70 };
  const p = { id: 1, alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eq: EQUIP.indexOf(kind), inv: { guns: gunInventory(), reloading: null }, nextFireAt: 0, mods: { reloadMul: 1 } };
  const w = { now: 0, sendInv() {}, event() {}, hitPose: (dino) => dino, layout: { groundAt: () => 0, colliders: { circles: [], boxes: [] } },
    dinos: { get: id => id === d.id ? d : null, damage: (d, amount) => { d.hp -= amount; } } };
  const shot = { a: ACT.SHOT, kind, o: [0, CONFIG.player.eyeHeight, 0], dir: [0, 0, -1], dino: d.id, p: [0, CONFIG.player.eyeHeight, -10], zone: 'body' };
  return { w, p, d, shot };
}
for (const kind of ['pistol', 'rifle', 'mpx']) {
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
test('first-person gun hands stay welded to their grips through sway, bob, lag, recoil and the reload clip', () => {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, 0);
  const walk = { speed: 5, sprint: false, grounded: true, lookX: 1, lookY: 0 };
  const at = (gun, grip) => gun.localToWorld(new THREE.Vector3().fromArray(grip.pos));
  const hand = (h) => h.getWorldPosition(new THREE.Vector3());
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    vm.setTool(kind);
    for (let i = 0; i < 150; i++) vm.update(1 / 60, walk);
    assert.equal(vm.tool, kind); assert.equal(vm.phase, 'hold'); assert.equal(vm.armR.pose, 'grip:' + kind);
    const gun = vm.guns[kind], nodes = gun.userData.nodes;
    // the guns are drawn bigger than CoD's, their wrist targets scale with them (knuckles stay on the grip surface)
    const grip = (n) => scaledGrip(n, HAND_SCALE, GUN_SCALE[kind]);
    for (let i = 0; i < 12; i++) {
      if (i % 4 === 0) vm.fireGun();
      vm.update(1 / 60, { ...walk, lookX: 5 * i, lookY: -3 * i });
      vm.root.updateMatrixWorld(true);
      // the CoD wrist targets, moved by scaledGrip for the bigger cartoon hands
      assert.ok(at(gun, grip(nodes.gripR)).distanceTo(hand(vm.rHand)) < 1e-6, kind + ' right hand');
      assert.ok(at(gun, grip(nodes.gripL)).distanceTo(hand(vm.lHand)) < 1e-6, kind + ' left hand');
    }
    assert.equal(vm.armL.pose, kind === 'rifle' ? 'clamp:rifle' : kind === 'mpx' ? 'foregrip:mpx' : 'cup');
    // reload: the right hand stays on the grip, the left one follows the clip's key
    const clip = vm.clips[kind].reloadTac, res = makeSampleResult();
    vm.setGunPose(false, 0.5, false);
    vm.update(1 / 60, walk); vm.root.updateMatrixWorld(true);
    clip.sample(0.5 * clip.duration, res);
    const target = new THREE.Vector3(), quat = new THREE.Quaternion();
    wristTarget(target, quat, res.lhand.pos, res.lhand.finger, res.lhand.back, HAND_SCALE, GUN_SCALE[kind]);
    assert.ok(at(gun, grip(nodes.gripR)).distanceTo(hand(vm.rHand)) < 1e-6, kind + ' right hand during the reload');
    assert.ok(gun.localToWorld(target).distanceTo(hand(vm.lHand)) < 1e-6, kind + ' left hand follows the reload clip');
    vm.setGunPose(false, 0, false);
    for (let i = 0; i < 30; i++) vm.update(1 / 60, walk);
  }
});

test('third-person gun grips follow the weapon in co-op, including pitch and recoil', () => {
  const model = new PlayerModel(0);
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    model.animate(1 / 60, { eq: kind, spd: 0, pitch: 0.2, alive: true, grounded: true }); model.root.updateMatrixWorld(true);
    for (const [contact, arm] of [['r', model.armR], ['l', model.armL]]) {
      assert.ok(model.toolRig.localToWorld(GUN_GRIPS_3P[kind][contact].clone()).distanceTo(arm.localToWorld(new THREE.Vector3(0, -0.46, 0))) < 1e-6);
    }
  }
});

for (const kind of ['rifle', 'mpx']) test(`automatic ${kind} fire survives quantized host ticks without permitting a burst of extra shots`, () => {
  const { w, p, shot } = fixture(kind);
  const interval = CONFIG.weapons[kind].cooldown;
  const tick = 1 / CONFIG.net.tickRate;
  for (let i = 0; i < 10; i++) {
    w.now = Math.floor((i * interval + 1e-9) / tick) * tick;
    gunAction(w, p, shot);
    assert.equal(p.inv.guns[kind].loaded, CONFIG.weapons[kind].magazine - i - 1);
    for (let j = 0; j < 5; j++) gunAction(w, p, shot);
    assert.equal(p.inv.guns[kind].loaded, CONFIG.weapons[kind].magazine - i - 1);
  }
});

const flatVm = (kind) => {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera() }, 0);
  vm.flat = true;
  vm.setTool(kind);
  for (let i = 0; i < 200; i++) vm.update(1 / 60, { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 });
  vm.root.updateMatrixWorld(true);
  return vm;
};

test('the bore of both guns passes through the crosshair point CONVERGE metres ahead and the flash/tracer origin is the muzzle', () => {
  const target = new THREE.Vector3(0, 0, -CONVERGE);
  assert.equal(CONVERGE, 25);
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    const vm = flatVm(kind);
    assert.equal(vm.phase, 'hold');
    const gun = vm.guns[kind];
    const muzzle = vm.muzzlePosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
    // miss distance of the ray from the muzzle along the bore to the target
    const toTarget = target.clone().sub(muzzle);
    const miss = toTarget.clone().addScaledVector(dir, -toTarget.dot(dir)).length();
    assert.ok(miss < 1e-3, `${kind} bore misses the crosshair point by ${miss} m`);
    assert.ok(toTarget.dot(dir) > 0, 'the bore points toward it');
    // the point of the bore ray at that depth projects to the screen centre
    const cam = vm.gfx.viewCamera; cam.updateMatrixWorld(true);
    const at = muzzle.clone().addScaledVector(dir, (CONVERGE + muzzle.z) / -dir.z);
    const ndc = at.clone().project(cam);
    assert.ok(Math.abs(ndc.x) < 1e-4 && Math.abs(ndc.y) < 1e-4, `${kind} bore at ${CONVERGE} m projects to ${ndc.x},${ndc.y}`);
    // nearly parallel to the view axis
    assert.ok(Math.acos(-dir.z) < 0.01, `${kind} bore is ${Math.acos(-dir.z)} rad off the view axis`);
    // the flash sits on the bore just ahead of the muzzle (0.04 gun units), so shots leave where the flash is drawn
    const flash = gun.userData.flash.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(flash.distanceTo(muzzle) - 0.04 * GUN_SCALE[kind]) < 1e-9);
    assert.ok(flash.clone().sub(muzzle).normalize().distanceTo(dir) < 1e-9);
  }
});

test('the bore solve holds for any cant: the ray still hits the crosshair point and the aim shifts by milliradians only', () => {
  const pos = new THREE.Vector3(0.13, -0.18, -0.33);
  const muzzle = [0, 0.075, -0.502];
  const dirs = [0, 0.4, -0.7].map((roll) => {
    const q = solveBoreQuat(new THREE.Quaternion(), pos, muzzle, 1.15, roll);
    const m = new THREE.Vector3(...muzzle).multiplyScalar(1.15).applyQuaternion(q).add(pos);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const t = new THREE.Vector3(0, 0, -CONVERGE).sub(m);
    assert.ok(t.addScaledVector(d, -t.dot(d)).length() < 1e-6);
    return d;
  });
  assert.ok(dirs[0].distanceTo(dirs[1]) < 0.01 && dirs[0].distanceTo(dirs[2]) < 0.01);
});

test('the rifle support hand grips UNDER the rear third of the handguard and the firing hands lie on their grips', () => {
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    const vm = flatVm(kind);
    const gun = vm.guns[kind], nodes = gun.userData.nodes;
    const inv = gun.matrixWorld.clone().invert();
    // palm contact: 5 cm (scaled) along the fingers from the wrist, in gun space
    const palm = (arm) => {
      const q = arm.hand.getWorldQuaternion(new THREE.Quaternion());
      return arm.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(q), 0.05 * HAND_SCALE).applyMatrix4(inv);
    };
    // right hand: the palm is where the (scaled) CoD grip target puts it
    const g = scaledGrip(nodes.gripR, HAND_SCALE, GUN_SCALE[kind]);
    const expected = new THREE.Vector3().fromArray(g.pos).addScaledVector(new THREE.Vector3().fromArray(g.finger), 0.05 * HAND_SCALE / GUN_SCALE[kind]);
    assert.ok(palm(vm.armR).distanceTo(expected) < 1e-6, `${kind} right palm on the grip`);
    assert.ok(palm(vm.armR).z > 0 - 0.02 && palm(vm.armR).y < nodes.triggerPivot.pos[1] + 0.01, `${kind} right palm sits on the grip behind the trigger`);
    if (kind !== 'rifle') continue;
    const hg = nodes.handguard;
    const p = palm(vm.armL);
    const third = hg.z1 + (hg.z0 - hg.z1) * 2 / 3;       // rear third: z between this and z0 (z0 is the rear end, -0.145)
    assert.ok(p.z <= hg.z0 && p.z >= third, `left palm z ${p.z} within the rear third ${third}..${hg.z0}`);
    const dist = Math.hypot(p.x - 0, p.y - hg.axis[1]);
    assert.ok(dist < hg.r + 0.03 && p.y < hg.axis[1], `left palm ${dist} from the handguard axis, below it`);
    // every finger joint is on the handguard's extent
    for (const f of vm.armL.fingers) for (const j of f.joints) {
      const z = j.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).z;
      assert.ok(z <= hg.z0 + 0.01 && z >= hg.z1, `finger joint z ${z}`);
    }
  }
});

test('MPX rear iron sight has an open aperture with a solid rim and an aligned front post', () => {
  const gun = makeFirearm('mpx'); gun.updateMatrixWorld(true);
  const [x,y,z] = gun.userData.nodes.ironSight;
  const cast = (px,py,pz) => new THREE.Raycaster(new THREE.Vector3(px,py,pz+0.015), new THREE.Vector3(0,0,-1), 0, 0.03).intersectObject(gun,true);
  assert.equal(cast(x,y,z).length, 0, 'rear aperture must be a real unobstructed hole');
  assert.ok(cast(x+0.0036,y,z).length > 0, 'the aperture has a solid rim');
  const front = gun.userData.nodes.ironFront;
  assert.equal(front[1], y);
  assert.ok(cast(front[0], front[1]-0.0005, front[2]).length > 0, 'front post meets the sight line');
});
