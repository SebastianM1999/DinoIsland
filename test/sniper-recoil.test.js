import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SniperRecoil } from '../src/client/player/sniperRecoil.js';

test('sniper kick visibly moves scoped and unscoped cameras and settles before the next bolt shot', () => {
  for (const scoped of [false, true]) {
    const recoil = new SniperRecoil(), camera = new THREE.PerspectiveCamera(scoped ? 18 : 74);
    recoil.fire(scoped); recoil.update(.025); recoil.apply(camera);
    assert.ok(camera.rotation.x > .04, 'strong upward kick exceeds two degrees');
    assert.ok(Math.abs(camera.rotation.y) > .002, 'lateral camera shake');
    assert.ok(Math.abs(camera.rotation.z) > .001, 'roll vibration');
    assert.ok(camera.position.length() > .04, 'backward shoulder impulse');
    const view = new THREE.Vector3(0, 0, -20).project(camera);
    camera.updateMatrixWorld();
    const kicked = new THREE.Vector3(0, 0, -20).project(camera);
    assert.ok(kicked.distanceTo(view) > (scoped ? .25 : .04), 'scene visibly moves behind the reticle');
    recoil.update(.85);
    assert.deepEqual(Object.values(recoil.pose), [0, 0, 0, 0, 0, 0]);
  }
});

test('sniper recoil is frame-rate independent and clears on interrupted gameplay', () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const recoil = new SniperRecoil(); recoil.fire(true);
    for (let n = 0; n < fps / 2; n++) recoil.update(1 / fps);
    results.push({ ...recoil.pose });
    recoil.update(.001, false);
    assert.ok(Object.values(recoil.pose).every(n => n === 0));
  }
  for (const p of results) for (const key of Object.keys(p)) assert.ok(Math.abs(p[key] - results[0][key]) < 1e-12);
});
