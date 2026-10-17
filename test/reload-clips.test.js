import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONFIG } from '../src/shared/config.js';
import { Viewmodel, GUN_DEFS, GUN_SCALE } from '../src/client/player/viewmodel.js';
import { MAG_FALL_G, MAG_GRIP, RELOAD_TUNING, magInHand } from '../src/client/player/reloadClips.js';

/**
 * The reload clips (src/client/player/reloadClips.js) keep the gun on screen: the old magazine is released where the
 * player sees it, the support hand fetches the new one below the frame and pushes it home. Everything is measured
 * through a 62 degree, 16:9 camera (the game's default), with the noise/lag layers off (`vm.flat`).
 */
const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 10);
const makeVm = (kind) => {
  const vm = new Viewmodel({ viewCamera: camera }, 0);
  vm.flat = true; vm.setTool(kind);
  for (let i = 0; i < 200; i++) vm.update(1 / 60, idle);
  return vm;
};
const CLIPS = [['pistol', false, 'reloadTac'], ['pistol', true, 'reloadEmpty'], ['rifle', false, 'reloadTac'], ['rifle', true, 'reloadEmpty'], ['mpx', false, 'reloadTac'], ['mpx', true, 'reloadEmpty']];
/** The new magazine may still be climbing into the frame this long (a fraction of the reload) after the hand has fetched it. */
const ENTER = 0.13;
/** The gun is fully lifted from this fraction of the reload until the new magazine is in; then it settles toward the hip pose. */
const LIFTED = [0.14];

function frames(vm, kind, empty, name, visit) {
  const clip = vm.clips[kind][name];
  const ev = Object.fromEntries(clip.events.map((e) => [e.name, e.t / clip.duration]));
  const gun = vm.guns[kind], mag = gun.userData.parts.magazine, seat = gun.userData.magSeatPos;
  const magLen = GUN_DEFS[kind].magLen;
  const ndc = (obj, p) => obj.localToWorld(new THREE.Vector3().copy(p)).project(camera);
  vm.setGunPose(false, 0, false); for (let i = 0; i < 5; i++) vm.update(1 / 60, idle);
  for (let step = 0; step <= 98; step++) {
    const f = Math.max(1e-4, step / 100);
    vm.setGunPose(false, f, empty); vm.update(1 / 60, idle); vm.root.updateMatrixWorld(true);
    visit({
      f, ev, clip, vm, gun, mag, magLen,
      seat: ndc(gun, seat),
      top: ndc(mag, new THREE.Vector3()),
      bottom: ndc(mag, new THREE.Vector3(0, -magLen, 0)),
      away: mag.position.distanceTo(seat),
    });
  }
  vm.setGunPose(false, 0, false); for (let i = 0; i < 5; i++) vm.update(1 / 60, idle);
  return ev;
}

test('reload clips run as long as the gun\'s reload time and carry meaningful, ordered events', () => {
  for (const [kind, , name] of CLIPS) {
    const vm = makeVm(kind), clip = vm.clips[kind][name];
    assert.equal(clip.duration, CONFIG.weapons[kind].reloadTime, `${kind} ${name}`);
    const t = Object.fromEntries(clip.events.map((e) => [e.name, e.t / clip.duration]));
    const order = name === 'reloadTac' ? ['start', 'magout', 'magdrop', 'fetch', 'magin', 'slap', 'end']
      : ['start', 'magout', 'magdrop', 'fetch', 'magin', 'slap', 'boltrelease', 'end'];
    assert.deepEqual(clip.events.map((e) => e.name), order);
    for (let i = 1; i < order.length; i++) assert.ok(t[order[i]] > t[order[i - 1]], `${kind} ${name}: ${order[i]} after ${order[i - 1]}`);
    assert.ok(t.end < 1 && t.end > 0.98, 'the clip ends just before the fraction cap of 0.98 matters');
  }
});

test('the gun, its magwell and the magazine stay on screen for the whole reload; the old magazine is seen leaving', () => {
  for (const [kind, empty, name] of CLIPS) {
    const vm = makeVm(kind);
    let seenLeaving = false;
    frames(vm, kind, empty, name, ({ f, ev, seat, top, bottom, away, mag, magLen }) => {
      const tag = `${kind} ${name} at ${f}`;
      assert.ok(Math.abs(seat.x) < 1 && seat.y < 1, `${tag}: magwell x ${seat.x.toFixed(2)} y ${seat.y.toFixed(2)}`);
      assert.ok(seat.y > -0.65, `${tag}: magwell never lower than the hip pose (${seat.y.toFixed(2)})`);
      if (f >= LIFTED[0] && f <= ev.magin + 0.02) assert.ok(seat.y > -0.3, `${tag}: magwell lifted into the frame (${seat.y.toFixed(2)})`);
      // an attached magazine, on the plateau, is whole inside the frame
      if (mag.visible && away < 1e-6 && f >= LIFTED[0] && f <= ev.magin) assert.ok(bottom.y > -1 && Math.abs(bottom.x) < 1, `${tag}: seated magazine bottom y ${bottom.y.toFixed(2)}`);
      // the old magazine leaves, then the hand fetches the new one below the frame: only here may the magazine be off screen
      const away_ = f >= ev.magout && f <= ev.fetch + ENTER;
      if (mag.visible && !away_) assert.ok(top.y > -1 && Math.abs(top.x) < 1, `${tag}: magazine top x ${top.x.toFixed(2)} y ${top.y.toFixed(2)}`);
      if (away_ && mag.visible && f < ev.magdrop && away > 0.3 * magLen && top.y > -1) seenLeaving = true;
    });
    assert.ok(seenLeaving, `${kind} ${name}: the magazine is visible while it leaves the gun`);
  }
});

test('the old magazine is hidden only once it is off screen, and the new one enters from below the frame', () => {
  for (const [kind, empty, name] of CLIPS) {
    const vm = makeVm(kind);
    frames(vm, kind, empty, name, ({ f, ev, mag, top }) => {
      const tag = `${kind} ${name} at ${f}`;
      if (f > ev.magdrop && f < ev.fetch) assert.equal(mag.visible, false, `${tag}: no magazine between stowing the old one and fetching the new one`);
      if (f >= ev.fetch - 0.005 && f <= ev.fetch + 0.01) assert.ok(mag.visible && top.y < -1, `${tag}: the new magazine appears below the frame (top y ${top.y.toFixed(2)})`);
    });
  }
});

test('tactical: the hand carries the magazine out and in; empty: the released magazine falls with gravity', () => {
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    const hold = magInHand(GUN_DEFS[kind].magLen * vm0(kind), RELOAD_TUNING[kind].spin);
    // tactical
    let vm = makeVm(kind);
    frames(vm, kind, false, 'reloadTac', ({ f, ev, mag, vm: v, away, gun }) => {
      const inHand = () => v.lHand.localToWorld(hold.pos.clone());
      const mid = (ev.magout + ev.magdrop) / 2;
      if (Math.abs(f - mid) < 0.006 || Math.abs(f - (ev.fetch + 0.08)) < 0.006) {
        assert.ok(mag.visible && away > 0.03, `${kind} tactical ${f}: magazine away from the well`);
        assert.ok(gun.localToWorld(mag.position.clone()).distanceTo(inHand()) < 1e-6, `${kind} tactical ${f}: magazine in the left hand`);
      }
    });
    // empty: released at magout, falling (never in the hand) until it is gone
    vm = makeVm(kind);
    let last = null, fallen = 0;
    frames(vm, kind, true, 'reloadEmpty', ({ f, ev, mag, gun, away, vm: v }) => {
      if (f > ev.magout + 0.005 && f < ev.magdrop) {
        const world = gun.localToWorld(mag.position.clone());
        if (last) assert.ok(world.y < last.y + 1e-9, `${kind} empty ${f}: falling`);
        last = world; fallen = Math.max(fallen, away);
        assert.ok(mag.visible && v.res.parts.mag === 0, `${kind} empty ${f}: falling, not held`);
      }
    });
    // the fall is plain free fall in view space: 1/2 g t^2 below the well after the release
    const clip = vm.clips[kind].reloadEmpty, out = { ...vm.res };
    const t0 = clip.events.find((e) => e.name === 'magout').t;
    clip.sample(t0 + 0.1, vm.res);
    assert.ok(Math.abs(vm.res.parts.drop - 0.5 * MAG_FALL_G * 0.01) < 1e-9, 'fall distance at 0.1 s');
    clip.sample(clip.duration, vm.res);
    assert.equal(vm.res.parts.drop, 0, 'nothing falls once the new magazine is in');
    assert.ok(fallen > 0.1, `${kind}: the magazine fell ${fallen}`);
    void out;
  }
});

test('the new magazine ends seated: exactly at magin, at 0.98 (the cap in actions.js) and at 1', () => {
  for (const [kind, empty, name] of CLIPS) {
    const vm = makeVm(kind);
    let seatedAfter = 0;
    const ev = frames(vm, kind, empty, name, ({ f, ev: e, mag, away }) => {
      if (f >= e.magin + 0.005) { assert.ok(mag.visible && away < 1e-6, `${kind} ${name} at ${f}: seated after magin (${away})`); seatedAfter++; }
    });
    assert.ok(seatedAfter > 15 && ev.magin < 0.8);
    for (const f of [0.98, 1]) {
      vm.setGunPose(false, f, empty); vm.update(1 / 60, idle);
      const mag = vm.guns[kind].userData.parts.magazine;
      assert.ok(mag.visible && mag.position.distanceTo(vm.guns[kind].userData.magSeatPos) < 1e-6, `${kind} ${name} at ${f}`);
      assert.ok(mag.quaternion.angleTo(vm.guns[kind].userData.magSeatQuat) < 1e-6, `${kind} ${name} at ${f}: orientation`);
    }
    vm.setGunPose(false, 0, false); run(vm);
  }
});
const vm0 = (kind) => GUN_SCALE[kind];
const run = (vm, n = 5) => { for (let i = 0; i < n; i++) vm.update(1 / 60, idle); };

test('the magazine enters the well with the hand\'s orientation: no jump at magin', () => {
  for (const [kind, empty, name] of CLIPS) {
    const vm = makeVm(kind);
    const poses = [];
    frames(vm, kind, empty, name, ({ f, ev, mag, gun }) => {
      if (f >= ev.magin - 0.03 && f <= ev.magin + 0.03) poses.push([f, gun.localToWorld(mag.position.clone()), mag.quaternion.clone()]);
    });
    // 10 ms steps: the world position of the magazine moves smoothly (the gun is slapped, but never teleports)
    for (let i = 1; i < poses.length; i++) assert.ok(poses[i][1].distanceTo(poses[i - 1][1]) < 0.05, `${kind} ${name} at ${poses[i][0]}`);
  }
});

test('the support wrist never bends more than 45 degrees, in any frame of any reload', () => {
  for (const [kind, empty, name] of CLIPS) {
    const vm = makeVm(kind);
    let worst = 0;
    frames(vm, kind, empty, name, ({ f, vm: v }) => {
      const fore = new THREE.Vector3(0, 0, -1).applyQuaternion(v.armL.forePivot.quaternion);
      const hand = new THREE.Vector3(0, 0, -1).applyQuaternion(v.armL.hand.quaternion);
      const bend = THREE.MathUtils.radToDeg(fore.angleTo(hand));
      worst = Math.max(worst, bend);
      // the pistol's idle cup grip itself bends ~78 degrees (shoulder anchor at idle); inside the reload (shoulder blended in) it is < 45
      const limit = kind === 'pistol' && (f < 0.05 || f > 0.9) ? 80 : 45;
      assert.ok(bend < limit, `${kind} ${name} at ${f}: support wrist bent ${bend.toFixed(1)} degrees`);
    });
    assert.ok(worst > 5, 'the measurement sees the hand move');
  }
});

test('an empty reload keeps the slide / bolt locked back until the release, then it snaps home; a tactical one never moves it', () => {
  for (const [kind, part] of [['pistol', 'slide'], ['rifle', 'bolt'], ['mpx', 'bolt']]) {
    for (const empty of [false, true]) {
      const vm = makeVm(kind), p = vm.guns[kind].userData.parts[part], rest = p.userData.rest.z;
      frames(vm, kind, empty, empty ? 'reloadEmpty' : 'reloadTac', ({ f, ev }) => {
        const back = p.position.z - rest;
        if (!empty) assert.ok(Math.abs(back) < 1e-9, `${kind} tactical ${f}: ${part} stays home`);
        else if (f > 0.02 && f < ev.boltrelease - 0.03) assert.ok(back > 0.015, `${kind} empty ${f}: ${part} locked back (${back})`);
        else if (f > ev.boltrelease + 0.05) assert.ok(Math.abs(back) < 0.004, `${kind} empty ${f}: ${part} released (${back})`);
      });
    }
  }
});

test('the right hand stays on the grip and the hand holds the magazine upright across the palm', () => {
  assert.ok(MAG_GRIP.along > 0.5 && MAG_GRIP.along < 1, 'gripped low on the magazine');
  for (const kind of ['pistol', 'rifle', 'mpx']) {
    const vm = makeVm(kind);
    const grip = vm.grips[kind].R;
    frames(vm, kind, true, 'reloadEmpty', ({ f, vm: v, gun }) => {
      const target = grip.pos.clone().applyMatrix4(gun.matrix);
      assert.ok(v.rHand.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 2e-3, `${kind} ${f}: right hand welded to the grip`);
    });
  }
});


test('MPX support hand stays on the moving charging handle while racking an empty reload', () => {
  const vm = makeVm('mpx'), gun = vm.guns.mpx, nodes = gun.userData.nodes;
  const handle = gun.userData.parts.charging;
  const offsets = [];
  frames(vm, 'mpx', true, 'reloadEmpty', ({ f, vm: v }) => {
    if (f < 0.70 || f > 0.82) return;
    const wrist = gun.worldToLocal(v.lHand.getWorldPosition(new THREE.Vector3()));
    offsets.push(wrist.sub(handle.position));
    if (f === 0.76) assert.ok(handle.position.z > nodes.chargeRest.pos[2] + 0.05, 'handle pulled fully back');
  });
  for (const offset of offsets) assert.ok(offset.distanceTo(offsets[0]) < 1e-6, 'hand and handle travel together');
  assert.ok(handle.position.distanceTo(handle.userData.rest) < 1e-9, 'handle returns home');
});
