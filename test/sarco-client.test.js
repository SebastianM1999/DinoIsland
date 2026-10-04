import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DS } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { SARCO_MODEL } from '../src/client/models/dino/sarcoModel.js';
import { SPECIES, DinoView } from '../src/client/entities/dinoViews.js';
import { GLBDinoAnimator } from '../src/client/models/dino/glbDino.js';
import { inBossMusicArea } from '../src/client/audio/region.js';

test('boss snapshots select the corresponding authored clip, including recovery and swim', () => {
  const expected = new Map([[DS.SWIM, 'swim'], [DS.SUBMERGED, 'swim'], [DS.LUNGE, 'attack'],
    [DS.AMBUSH, 'ambush'], [DS.BITE, 'bite'], [DS.SHOVE, 'shove'], [DS.TAIL, 'tailsweep'], [DS.REPOSITION, 'pivot'],
    [DS.RETREAT, 'retreat'], [DS.RECOVER, 'recovery']]);
  for (const [st, clip] of expected) {
    const pose = DinoView.prototype.pose.call({ type: 'alpha-sarcosuchus', st });
    assert.equal(pose.clip, clip);
    assert.ok(SARCO_MODEL.clips[clip]);
  }
  const pose = DinoView.prototype.pose.call({ type: 'alpha-sarcosuchus', st: DS.SUBMERGED,
    attackT: .7, attackDuration: 1.6, attackClip: 'ambush', attackSeq: 3 });
  assert.equal(pose.clip, 'ambush');
  assert.equal(pose.clipDuration, 1.6);
});

test('server attack duration drives clip playback and repeated same-kind attacks restart', () => {
  const model = new THREE.Group(), root = new THREE.Group(), body = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt); tilt.add(body); body.add(model);
  const bone = new THREE.Bone(); model.add(bone);
  const rig = { model, root, body, tilt, head: bone, jaw: null, neck: [], tail: [], eyelids: [],
    spec: SARCO_MODEL, clips: Object.fromEntries(Object.keys(SARCO_MODEL.clips).map(key =>
      [key, new THREE.AnimationClip(key, 2, [])])) };
  const animator = new GLBDinoAnimator(rig);
  animator.update(.1, { pose: { clip: 'shove', clipDuration: 1, clipId: 1 } });
  assert.equal(animator.state, 'shove');
  assert.equal(animator.actions.shove.timeScale, 2);
  animator.update(.1, { pose: { clip: 'shove', clipDuration: 1, clipId: 1 } });
  assert.ok(animator.actions.shove.time > .2);
  animator.update(.1, { pose: { clip: 'shove', clipDuration: 1, clipId: 2 } });
  assert.equal(animator.actions.shove.time, .2);
  animator.update(.1, { pose: { clip: 'recovery' } });
  assert.equal(animator.state, 'recovery', 'recovery must interrupt a completed attack');
  animator.update(.1, { dead: true, pose: { clip: 'ambush' } });
  assert.equal(animator.state, 'death', 'death takes precedence over queued ambush');
  animator.dispose();
});

test('missing boss art has a low crocodile fallback with an opening jaw and four animated legs', () => {
  const rig = SPECIES['alpha-sarcosuchus'].build();
  assert.ok(rig.head && rig.jaw);
  assert.equal(rig.legs.length, 4);
  const size = new THREE.Box3().setFromObject(rig.root).getSize(new THREE.Vector3());
  assert.ok(size.z > size.y * 4);
  const animator = SPECIES['alpha-sarcosuchus'].createAnimator(rig);
  animator.update(.1, { speed: 3, dist: .3, pose: { attack: 1 }, groundAt: () => 0 });
  rig.root.updateMatrixWorld(true);
  rig.root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  assert.ok(CONFIG.dinos['alpha-sarcosuchus'].body.length >= 8);
});

test('15 swamp variants have real deep ambush pockets and a dry walkable causeway', () => {
  for (let variant = 1; variant <= 15; variant++) {
    const t = new Terrain(planIsland(1, variant)), a = t.plan.swampArena;
    for (const side of [-1, 1]) {
      const z = side * a.r * .45;
      assert.ok(t.waterDepthAt(a.x, z) > 3.1, `v${variant}: submerged hull needs a real water pocket`);
      assert.ok(t.slopeAt(a.x, z) < .5);
      // Wide east/west banks let a swimmer climb out without a steep trap.
      for (let x = 0; x <= 18; x += 1) assert.ok(t.slopeAt(x, z) <= CONFIG.player.maxWalkSlope, `v${variant}: pocket exit bank`);
    }
    for (let x = -22; x <= 22; x += 2) {
      assert.ok(t.waterDepthAt(x, 0) <= CONFIG.world.maxWadeDepth, `v${variant}: causeway remains wadeable`);
      assert.ok(t.slopeAt(x, 0) < CONFIG.player.maxWalkSlope);
    }
    assert.ok(inBossMusicArea({ swampArena: a }, { x: 0, z: 0 }));
    assert.equal(inBossMusicArea({ swampArena: a }, { x: 50, z: 0 }), false);
  }
});


test('a swimming boss stays level over a sloping basin floor', () => {
  let received;
  const view = {
    type: 'alpha-sarcosuchus', alive: true, st: DS.SWIM, fl: 8, scale: 1,
    pos: new THREE.Vector3(0, 1, 0), yaw: 0, root: new THREE.Group(),
    ctx: { terrain: { heightAt: (x, z) => z * 2 } },
    grounded: DinoView.prototype.grounded,
    pose: DinoView.prototype.pose,
    anim: { update: (dt, input) => received = input },
    rig: { isGLB: true }, sp: {}, updateBar() {},
  };
  DinoView.prototype.update.call(view, .1, 0, true);
  assert.equal(Math.abs(received.groundPitch), 0);
  assert.equal(received.groundAt, null);
  assert.equal(received.pose.clip, 'swim');
});
