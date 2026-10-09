import test from 'node:test';
import assert from 'node:assert/strict';
import { CreatureStepCadence, CREATURE_STEP_PROFILES, creatureStepAudible } from '../src/client/audio/creatureSteps.js';
import { DS } from '../src/shared/protocol.js';
import * as THREE from 'three';
import { DinoView } from '../src/client/entities/dinoViews.js';

function animal(type = 'trex', scale = 1) {
  return { type, scale, pos: { x: 0, y: 0, z: 0 }, alive: true, st: DS.WALK, onGround: true,
    grounded() { return this.onGround; } };
}

test('footstep audibility scales with mass/size and rejects distant contacts before ground queries', () => {
  const listener = { x: 0, y: 0, z: 0 };
  const light = animal('raptor'); light.pos.x = 40;
  assert.equal(creatureStepAudible(light, listener), false);
  const heavy = animal('trex'); heavy.pos.x = 40;
  assert.equal(creatureStepAudible(heavy, listener), true);
  const titan = animal('brachio', 2); titan.pos.x = 90;
  assert.equal(creatureStepAudible(titan, listener), true);
  titan.pos.x = 96;
  assert.equal(creatureStepAudible(titan, listener), false);
  heavy.pos.x = 0; heavy.pos.y = 70;
  assert.equal(creatureStepAudible(heavy, listener), false);
});
function travel(view, cadence, speed, seconds, dt = .025) {
  const steps = [];
  for (let time = 0; time < seconds - dt / 2; time += dt) {
    view.pos.x += speed * dt;
    const step = cadence.update(view, dt);
    if (step) steps.push(step);
  }
  return steps;
}

test('all current species have distinct cadence and relative weight profiles', () => {
  assert.deepEqual(Object.keys(CREATURE_STEP_PROFILES).sort(), ['alpha-sarcosuchus', 'brachio', 'crystal-plodder', 'gloom-raptor', 'ptera', 'raptor', 'stego', 'sump-lurker', 'trex']);
  assert.equal(CREATURE_STEP_PROFILES.raptor.weightGain, 0);
  assert.equal(CREATURE_STEP_PROFILES.ptera.weightGain, 0);
  assert.ok(CREATURE_STEP_PROFILES.trex.weightGain > CREATURE_STEP_PROFILES.stego.weightGain);
  assert.notEqual(CREATURE_STEP_PROFILES.brachio.stride, CREATURE_STEP_PROFILES.trex.stride);
});

test('walking and running follow actual distance, with faster heavier run contacts', () => {
  const walker = animal(), runner = animal();
  const walkCadence = new CreatureStepCadence(), runCadence = new CreatureStepCadence();
  walkCadence.update(walker, .025); runCadence.update(runner, .025);
  const walk = travel(walker, walkCadence, 2.6, 6);
  const run = travel(runner, runCadence, 7.6, 6);
  assert.ok(walk.length >= 6);
  assert.ok(run.length > walk.length);
  assert.ok(walk.every(s => s.movement === 'walk' && s.volume === 1));
  assert.ok(run.every(s => s.movement === 'run' && s.volume > 1));
});

test('blocked, dead, trapped, flying and swimming animals remain silent', () => {
  for (const state of ['blocked', 'dead', 'trapped', 'flying', 'swimming']) {
    const view = animal(state === 'flying' ? 'ptera' : state === 'swimming' ? 'alpha-sarcosuchus' : 'trex');
    if (state === 'dead') view.alive = false;
    if (state === 'trapped') view.st = DS.TRAPPED;
    if (state === 'flying' || state === 'swimming') view.onGround = false;
    const cadence = new CreatureStepCadence();
    cadence.update(view, .025);
    assert.equal(travel(view, cadence, state === 'blocked' ? 0 : 5, 4).length, 0, state);
  }
});

test('teleports and long frame gaps reset accumulated distance without delayed bursts', () => {
  const view = animal(), cadence = new CreatureStepCadence();
  cadence.update(view, .025);
  travel(view, cadence, 2.6, .6);
  view.pos.x += 100;
  assert.equal(cadence.update(view, .025), null);
  assert.equal(cadence.distance, 0);
  assert.equal(travel(view, cadence, 2.6, .2).length, 0);
  view.pos.x += 3;
  assert.equal(cadence.update(view, 1), null);
  assert.equal(cadence.distance, 0);
});

test('oversized titan takes larger strides and cadence does not depend on frame rate', () => {
  function count(scale, dt) {
    const view = animal('brachio', scale), cadence = new CreatureStepCadence();
    cadence.update(view, dt);
    return travel(view, cadence, 2.2, 10, dt).length;
  }
  assert.ok(count(2, .025) < count(1, .025));
  assert.ok(Math.abs(count(1, .025) - count(1, .1)) <= 1);
});

test('airborne distance is discarded before landing', () => {
  const view = animal('raptor'), cadence = new CreatureStepCadence();
  cadence.update(view, .025);
  view.onGround = false;
  travel(view, cadence, 6, 2);
  view.onGround = true;
  assert.equal(travel(view, cadence, 3.2, .2).length, 0);
  assert.ok(travel(view, cadence, 3.2, 1).length > 0);
});

test('pose interpolation emits contacts even when mesh animation is never updated', () => {
  const steps = [];
  const view = { ...animal('raptor'), pos: new THREE.Vector3(), root: new THREE.Group(), yaw: 0,
    attackT: 0, roarT: 0, flinch: 0, barT: 0, tmp: [], stepCadence: new CreatureStepCadence(),
    ctx: { onStep: (v, step) => steps.push(step), terrain: { heightAt: () => 0 } },
    buf: { sample: (time, row) => { row[0] = time * 3.2; row[1] = row[2] = row[3] = 0; row[4] = 3.2; return true; } } };
  view.grounded = DinoView.prototype.grounded;
  for (let frame = 0; frame < 120; frame++) DinoView.prototype.samplePose.call(view, 1 / 60, frame / 60);
  assert.ok(steps.length >= 4);
});

test('ground support rejects flying pteranodons, swimming boss and airborne land animals', () => {
  function grounded(type, y, st = DS.WALK, fl = 0) {
    return DinoView.prototype.grounded.call({ type, pos: { x: 0, y, z: 0 }, st, fl,
      ctx: { terrain: { heightAt: () => 2 } } });
  }
  assert.equal(grounded('ptera', 3), false);
  assert.equal(grounded('ptera', 2), true);
  assert.equal(grounded('alpha-sarcosuchus', 2, DS.SWIM), false);
  assert.equal(grounded('alpha-sarcosuchus', 2, DS.WALK, 8), false);
  assert.equal(grounded('trex', 3), false);
  assert.equal(grounded('trex', 2), true);
});
