import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/shared/config.js';
import { EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';
import { DinoAnimator } from '../src/client/models/dino/rig.js';

test('every dinosaur spawned by the server has a visible, animated client model', () => {
  // the jungle island has no T-Rex; the volcano island has every species
  const spawned = new Set();
  for (const level of [0, 1]) {
    const world = new ServerWorld({ send() {} }, { level, variant: 7 });
    for (const dino of world.dinos.list) spawned.add(dino.type);
  }
  assert.deepEqual([...spawned].sort(), Object.keys(CONFIG.dinos).sort());

  for (const type of spawned) {
    const species = SPECIES[type];
    assert.ok(species, `${type} has no client view`);
    const rig = species.build();
    let meshes = 0;
    rig.root.traverse((part) => { if (part.isMesh && part.visible) meshes++; });
    assert.ok(meshes > 0, `${type} has no visible meshes`);
    assert.ok(rig.hitZones.length > 0, `${type} cannot be hit`);
    const animator = new DinoAnimator(rig, species.anim);
    animator.update(1 / 60, { speed: 1, dist: 1 / 60, yawRate: 0, groundAt: () => 0, pose: {} });
    species.extraUpdate?.({ rig, anim: animator, st: 0, pos: rig.root.position }, 1 / 60);
  }
});

test('dinosaur damage identifies the attacker and its location', () => {
  const sent = [];
  const world = new ServerWorld({ send: (to, message) => sent.push(message) });
  const { id } = world.join('Explorer');
  const player = world.players.get(id);
  const attacker = world.dinos.list.find((dino) => dino.type === 'ptera');
  world.dinos.hitPlayer(attacker, player, 5);
  const hurt = sent.findLast((message) => message.t === MSG.EV && message.e === EV.HURT);
  assert.equal(hurt.src, 'ptera');
  assert.equal(hurt.from.id, attacker.id);
  assert.equal(hurt.from.x, Math.round(attacker.x * 100) / 100);
  assert.equal(hurt.from.y, Math.round(attacker.y * 100) / 100);
  assert.equal(hurt.from.z, Math.round(attacker.z * 100) / 100);
});
