import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { raptorBrain } from '../src/sim/ai/raptor.js';
import { raiderStep } from '../src/sim/raids.js';
import { DS } from '../src/shared/protocol.js';

function setup(raid = false) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Raptor tester');
  const p = world.players.get(id), sys = world.dinos;
  sys.groups.set('test-pack', { home: { x: p.x, z: p.z }, target: id });
  const d = sys.spawn('raptor', p.x + 1, p.z, { group: 'test-pack', slot: 0 });
  d.x = p.x + 1; d.z = p.z; d.st = DS.ATTACK;
  d.cool = 8;
  if (raid) {
    d.raid = { foe: id, cool: 8 };
    world.raids.phase = 'active';
  }
  const moves = [], attacks = [];
  sys.steer = (d, x, z) => moves.push({ x, z });
  sys.halt = () => {};
  sys.inSafeZone = () => false;
  sys.attackPlayer = () => attacks.push(true);
  const step = dt => raid ? raiderStep(sys, d, dt) : raptorBrain.update(d, sys, dt);
  return { world, sys, p, d, moves, attacks, step };
}

for (const raid of [false, true]) {
  test(`${raid ? 'raiding' : 'pack'} raptor flees a damaging hit, pauses attacks for 1–2 seconds, then reengages`, () => {
    const { sys, p, d, moves, attacks, step } = setup(raid);
    sys.damage(d, 1, 'body', p.id, 'spear');
    assert.ok(d.frightened >= 1 && d.frightened <= 2);
    assert.equal(d.st, DS.RUN);
    const pause = d.frightened;
    step(0.1);
    assert.ok(moves[0].x > d.x, 'the movement goal points away from the attacker');
    assert.equal(attacks.length, 0);
    step(pause - 0.2);
    assert.equal(attacks.length, 0);
    step(0.11);
    assert.equal(d.frightened, 0);
    assert.equal(attacks.length, 1, 'attack resumes immediately if still in reach');
  });
}

test('a second hit refreshes the retreat, and a disconnected attacker does not break it', () => {
  const { sys, world, p, d, step } = setup();
  sys.damage(d, 1, 'body', p.id, 'spear');
  step(0.8);
  sys.damage(d, 1, 'body', p.id, 'spear');
  assert.ok(d.frightened >= 1 && d.frightened <= 2);
  world.players.delete(p.id);
  assert.doesNotThrow(() => step(0.1));
  assert.equal(d.st, DS.RUN);
});

test('a frightened raptor hesitates after a short escape instead of running endlessly', () => {
  const { sys, p, d, moves, attacks, step } = setup();
  sys.damage(d, 1, 'body', p.id, 'spear');
  d.x = p.x + 6.1;
  step(0.1);
  assert.equal(d.st, DS.ALERT);
  assert.equal(moves.length, 0);
  assert.equal(attacks.length, 0);
  step(d.frightened + 0.01);
  assert.ok(moves[0].x < d.x, 'once recovered it approaches the player again');
});
