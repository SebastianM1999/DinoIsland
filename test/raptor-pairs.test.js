import test from 'node:test';
import assert from 'node:assert/strict';
import { levelDef } from '../src/shared/levels.js';
import { ServerWorld } from '../src/sim/world.js';

const packs = (world) => {
  const by = new Map();
  for (const d of world.dinos.list) if (d.type === 'raptor' && d.alive) by.set(d.group, [...(by.get(d.group) ?? []), d]);
  return [...by.values()];
};

test("island 1's raptors hunt in pairs, as Jonas' message warns; later islands keep their mixed packs", () => {
  assert.equal(levelDef(0).raptorPack, 2);
  assert.equal(levelDef(1).raptorPack, null);
  const world = new ServerWorld({ send() {} }, { level: 0 });
  assert.ok(world.layout.dinoZones.raptor.length >= 2);
  assert.ok(world.layout.dinoZones.raptor.every((z) => z.size === 2));
  const ps = packs(world);
  assert.equal(ps.length, world.layout.dinoZones.raptor.length);
  for (const p of ps) {
    assert.equal(p.length, 2, 'two raptors a pack');
    assert.ok(Math.hypot(p[0].x - p[1].x, p[0].z - p[1].z) < 20, 'they start together');
  }
  const swamp = new ServerWorld({ send() {} }, { level: 1 });
  assert.ok(swamp.layout.dinoZones.raptor.some((z) => z.size === 3), 'the swamp still has packs of three');
});

test('a fallen raptor comes back to its partner', () => {
  const world = new ServerWorld({ send() {} }, { level: 0 });
  const [a, b] = packs(world)[0];
  world.dinos.damage(a, 1e6, null);
  assert.equal(a.alive, false);
  const r = world.dinos.respawnQueue.find((q) => q.group === a.group);
  assert.ok(r, 'queued to respawn in its pack');
  r.at = world.now;
  world.step(0.05);
  const again = packs(world).find((p) => p.includes(b));
  assert.equal(again.length, 2, 'the pair is whole again');
});
