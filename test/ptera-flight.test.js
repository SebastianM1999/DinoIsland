import test from 'node:test';
import assert from 'node:assert/strict';
import { DinoSystem } from '../src/sim/dinos.js';
import { pteraBrain } from '../src/sim/ai/ptera.js';
import { DS } from '../src/shared/protocol.js';

function fixture() {
  const drops = [];
  const world = {
    now: 0, players: new Map(), spottedDinos: new Set(), traps: new Map(),
    terrain: { heightAt: () => 3 },
    layout: { colliders: [], hut: { campfire: { x: -200, z: -200 } }, level: { difficulty: 1 } },
    event() {}, toast() {}, dropLoot: (...args) => drops.push(args),
    safeZone: () => ({ x: -200, z: -200, r: 14 }),
    mission: { onDinoKilled() {} }, awardXp() {}, onPlayerKill() {},
  };
  return { system: new DinoSystem(world), world, drops };
}

test('dead flyer retains altitude, falls with momentum, and drops loot only at impact', () => {
  const { system, drops } = fixture();
  const d = { id: 1, type: 'ptera', alive: true, x: 0, y: 33, z: 0, vx: 5, vy: 0, vz: 0,
    arrowsStuck: 0, carryingMeat: true };
  system.list.push(d); system.byId.set(d.id, d);
  system.kill(d, null);
  assert.equal(d.y, 33);
  assert.equal(d.st, DS.DEAD);
  assert.equal(drops.length, 0);
  system.update(0.05);
  assert.ok(d.y < 33 && d.y > 32);
  assert.ok(d.x > 0);
  for (let i = 0; i < 100 && !d.grounded; i++) system.update(0.05);
  assert.equal(d.y, 3);
  assert.equal(d.grounded, true);
  assert.equal(drops.length, 1);
  assert.equal(drops[0][0], d.x);
  assert.equal(drops[0][2].meat, 2);
  system.update(1);
  assert.equal(drops.length, 1);
  assert.equal(d.vy, 0);
});

test('a lethal hit during a dive keeps its downward velocity instead of triggering live escape AI', () => {
  const { system } = fixture();
  const d = { id: 1, type: 'ptera', alive: true, hp: 1, x: 0, y: 20, z: 0,
    vx: 2, vy: -12, vz: 0, mode: 'dive', arrowsStuck: 0 };
  system.damage(d, 10, 'body', null, 'bow');
  assert.equal(d.y, 20);
  assert.equal(d.vy, -12);
  assert.equal(d.st, DS.DEAD);
});

for (const meat of [0, 1]) test(`ptera attack immediately climbs without landing (${meat} meat)`, () => {
  const { system, world } = fixture();
  const p = { id: 9, name: 'Tester', alive: true, x: 0, y: 3, z: 0, inv: { loot: { meat } } };
  world.players.set(p.id, p);
  world.send = () => {}; world.mission.onLootChanged = () => {};
  let hits = 0; system.hitPlayer = () => hits++;
  const d = { id: 1, type: 'ptera', x: 0, y: 5, z: 0, vx: 0, vy: -12, vz: 0,
    mode: 'dive', modeT: 0, targetId: p.id, cool: 0, fl: 0, carryingMeat: false,
    area: { x: 0, z: 0 }, nest: { x: 0, y: 3, z: 0 }, grounded: false };
  // The nest helper uses the authored terrain height for stolen-meat returns.
  world.layout.groundAt = () => 3;
  pteraBrain.update(d, system, 0.05);
  assert.equal(hits, 1);
  assert.equal(d.mode, 'climb');
  assert.equal(d.st, DS.FLY);
  assert.equal(d.grounded, false);
  const low = d.y;
  assert.ok(low > 3);
  for (let i = 0; i < 20; i++) {
    pteraBrain.update(d, system, 0.05);
    assert.equal(d.grounded, false);
    assert.notEqual(d.st, DS.LANDED);
    assert.ok(d.y > 3);
  }
  assert.ok(d.y > low + 3);
  assert.equal(hits, 1);
});
