import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/shared/config.js';
import { DINO_TYPES } from '../src/shared/protocol.js';
import { LEVELS } from '../src/shared/levels.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';
import { TEST_DINO_TYPES, TEST_BRAINS } from '../src/sim/ai/testDinos.js';
import { triceratopsBrain } from '../src/sim/ai/triceratops.js';
import { ankylosaurusBrain } from '../src/sim/ai/ankylosaurus.js';
import { pachycephalosaurusBrain } from '../src/sim/ai/pachycephalosaurus.js';
import { ServerWorld } from '../src/sim/world.js';
import { updateSenses } from '../src/sim/ai/senses.js';

const HERBIVORES = { triceratops: triceratopsBrain, ankylosaurus: ankylosaurusBrain, pachycephalosaurus: pachycephalosaurusBrain };
const RING = [...Object.keys(HERBIVORES), ...TEST_DINO_TYPES];

test('the new island 1 species are registered on server and client and spawn on island 1 only', () => {
  for (const type of RING) {
    assert.ok(DINO_TYPES.includes(type) && CONFIG.dinos[type] && SPECIES[type] && GLB_DINOS[type], `${type}: registered`);
    assert.equal(LEVELS[0].dinos[type], 1, `${type}: one on island 1`);
    assert.ok(LEVELS.slice(1).every((l) => !l.dinos?.[type]), `${type}: only on island 1`);
    assert.equal(typeof (TEST_BRAINS[type] ?? HERBIVORES[type]).update, 'function');
  }
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  for (const type of RING) {
    const n = world.dinos.list.filter((d) => d.type === type).length;
    assert.equal(n, LEVELS[0].dinos[type] * CONFIG.dinos[type].groupSize, `${type}: spawned`);
  }
  const herds = new Set(world.dinos.list.filter((d) => d.type === 'triceratops').map((d) => d.group));
  assert.equal(herds.size, 1, 'the triceratops spawn as one herd');
});

test('the test predators hunt on sight and fight back after a hit', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Watcher');
  const player = world.players.get(id), sys = world.dinos;
  player.spd = 2;
  sys.inSafeZone = () => false;
  for (const type of TEST_DINO_TYPES) {
    for (const d of [...sys.list]) sys.remove(d);
    const brain = TEST_BRAINS[type];
    const pack = { id: type, home: { x: player.x, z: player.z }, target: null, wander: null, wanderT: 0 };
    sys.groups.set(type, pack);
    // in plain view: a few metres in front of its face
    const d = sys.spawn(type, player.x, player.z - 6, { group: type, slot: 0 });
    d.x = player.x; d.z = player.z - 6; d.yaw = Math.PI;
    sys.steer = () => 0; sys.halt = () => {};
    for (let k = 0; k < 20; k++) { world.now += 0.1; updateSenses(sys, 0.1); brain.update(d, sys, 0.1); }
    assert.equal(pack.target, player.id, `${type}: reaction on sight`);
    pack.target = null;
    brain.onHurt(d, sys, player.id);
    assert.equal(pack.target, player.id, `${type}: fights back after a hit`);
  }
});
