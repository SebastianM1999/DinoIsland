import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/shared/config.js';
import { DINO_TYPES } from '../src/shared/protocol.js';
import { LEVELS } from '../src/shared/levels.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';
import { TEST_DINO_TYPES, TEST_BRAINS } from '../src/sim/ai/testDinos.js';

test('test species are registered on server and client and spawn on island 1', () => {
  for (const type of TEST_DINO_TYPES) {
    assert.ok(DINO_TYPES.includes(type) && CONFIG.dinos[type] && SPECIES[type] && GLB_DINOS[type], `${type}: registered`);
    assert.equal(LEVELS[0].dinos[type], 1, `${type}: one on island 1`);
    assert.ok(LEVELS.slice(1).every((l) => !l.dinos?.[type]), `${type}: only on island 1`);
    assert.equal(typeof TEST_BRAINS[type].update, 'function');
  }
});

test('peaceful test species ignore players until hit, predators hunt on sight', () => {
  const player = { id: 'p1', x: 3, z: 0, alive: true };
  const sys = {
    groups: new Map(), list: [],
    world: { players: new Map([[player.id, player]]), sightMul: () => 1, now: 0 },
    inSafeZone: () => false, distTo: (d, x, z) => Math.hypot(d.x - x, d.z - z),
    nearestPlayer: (d, r, ok) => (Math.hypot(player.x - d.x, player.z - d.z) <= r && ok(player) ? player : null),
    roar() {}, steer() { return 0; }, halt() {}, attackPlayer() {}, randomWalkablePoint: (d, x, z) => ({ x, z }),
  };
  for (const type of TEST_DINO_TYPES) {
    const brain = TEST_BRAINS[type];
    const pack = { id: type, home: { x: 0, z: 0 }, target: null, wander: null, wanderT: 0 };
    sys.groups.set(type, pack);
    const d = { type, x: 0, z: 0, group: type, slot: 0, alive: true, fl: 0 };
    sys.list = [d];
    brain.init(d, sys);
    brain.update(d, sys, 0.1);
    assert.equal(pack.target, CONFIG.dinos[type].peaceful ? null : player.id, `${type}: reaction on sight`);
    brain.onHurt(d, sys, player.id);
    assert.equal(pack.target, player.id, `${type}: fights back after a hit`);
  }
});
