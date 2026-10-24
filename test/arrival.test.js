import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { CONFIG } from '../src/shared/config.js';
import { CAMP_FIRE_REACH, SAFE_MARGIN } from '../src/shared/base.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

const W = CONFIG.weapons;

test('island 1: the explorers wash ashore on the beach in front of the cold camp fire, Jonas and his spear beside it (fixed map and variants)', () => {
  for (const variant of [...new Set([levelDef(0).variant, 0, 2, 3])]) {
    const terrain = new Terrain(planIsland(0, variant));
    const L = buildLayout(terrain);
    const { fire, skeleton, spear } = L.arrival;
    assert.equal(fire, L.hut.campfire);
    const safe = CONFIG.player.hutHealRadius + SAFE_MARGIN;
    for (const sp of L.spawnPoints) {
      assert.equal(terrain.waterLevelAt(sp.x, sp.z), null, `variant ${variant}: dry spawn`);
      const d = Math.hypot(sp.x - fire.x, sp.z - fire.z);
      assert.ok(d > 15 && d < safe, `variant ${variant}: on the beach, ${d.toFixed(1)} m from the fire, inside the safe ring`);
      assert.ok(sp.x < fire.x, `variant ${variant}: on the sea side`);
      assert.ok(Math.abs(sp.yaw + Math.PI / 2) < 1e-9, 'looking east, at the fire');
    }
    assert.equal(L.campSpawnPoints.length, 4);
    for (const o of [skeleton, spear]) {
      assert.equal(terrain.waterLevelAt(o.x, o.z), null);
      assert.ok(Math.hypot(o.x - fire.x, o.z - fire.z) < 4, 'at the fire');
    }
    const bottle = L.notes.find((n) => n.id === 'jonas');
    assert.ok(Math.hypot(bottle.x - skeleton.x, bottle.z - skeleton.z) < 0.6, 'the message lies in his lap');
  }
  for (const level of [1, 2]) assert.equal(buildLayout(new Terrain(planIsland(level, levelDef(level).variant))).arrival, null, `island ${level + 1}`);
});

function solo(level = 0) {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level });
  const join = (name) => world.players.get(world.join(name).id);
  const act = (p, m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const put = (p, x, z) => Object.assign(p, { x, z, y: world.terrain.heightAt(x, z) });
  const evs = (e) => sent.filter(({ msg }) => msg.e === e).map(({ msg }) => msg);
  return { world, sent, join, act, put, evs };
}

test('island 1: everyone starts empty-handed on the beach; later islands start armed', () => {
  const { world, join } = solo();
  const p = join('Ana');
  assert.deepEqual([p.inv.spear, p.inv.spearFound, p.inv.traps, p.inv.bow], [false, false, 0, false]);
  const sp = world.layout.spawnPoints[p.slot];
  assert.ok(Math.hypot(p.x - sp.x, p.z - sp.z) < 1e-9, 'at the arrival beach');
  const later = solo(1).join('Ben');
  assert.deepEqual([later.inv.spear, later.inv.spearFound, later.inv.traps], [true, true, W.trap.startCount]);
});

test("walking up to Jonas' spear arms that explorer; the free resupply hands out spears only to whoever has had one", () => {
  const { world, join, act, put, evs } = solo();
  const a = join('Ana'), b = join('Ben');
  const s = world.layout.arrival.spear;
  const camp = world.stations().refill[0];
  // the tent's resupply has no spear for someone who never had one
  put(a, camp.x + 1, camp.z);
  act(a, { a: ACT.REFILL });
  assert.equal(a.inv.spear, false);
  // not from further away
  put(a, s.x + W.spear.pickupRange + 1, s.z);
  world.step(0.05);
  assert.equal(a.inv.spear, false);
  put(a, s.x + 0.5, s.z);
  world.step(0.05);
  assert.deepEqual([a.inv.spear, a.inv.spearFound, a.inv.spearHealth], [true, true, W.spear.durability]);
  assert.deepEqual(evs(EV.SPEAR_FOUND).map((e) => e.id), [a.id]);
  assert.equal(b.inv.spear, false, 'each explorer takes one');
  // lost (thrown, broken): the resupply now gives a fresh one
  a.inv.spear = false;
  put(a, camp.x + 1, camp.z);
  act(a, { a: ACT.REFILL });
  assert.equal(a.inv.spear, true);
});

test('the camp fire is cold on arrival: lit with E close by, it heals and becomes the respawn point; the save keeps it', () => {
  const { world, join, act, put, evs } = solo();
  const p = join('Ana');
  const fire = world.layout.arrival.fire;
  assert.equal(world.stations().fire, null);
  assert.ok(world.safeZone(), 'the camp is safe all the same');
  // a hurt explorer at the cold fire does not heal
  put(p, fire.x + 1.5, fire.z);
  p.hp = 40;
  world.step(1);
  assert.ok(p.hp < 41, 'no healing at a cold fire');
  // too far to light it
  put(p, fire.x + CAMP_FIRE_REACH + 3, fire.z);
  act(p, { a: ACT.BASE, op: 'kindle' });
  assert.equal(world.base.fireLit, false);
  put(p, fire.x + 1.5, fire.z);
  act(p, { a: ACT.BASE, op: 'kindle' });
  assert.equal(world.base.fireLit, true);
  assert.ok(evs(EV.BASE).at(-1).base.fireLit);
  world.step(1);
  assert.ok(p.hp > 45, 'the burning fire heals');
  const sp = world.spawnPoint(p.slot);
  assert.ok(world.layout.campSpawnPoints.includes(sp), 'respawn round the fire');
  // lighting it again changes nothing
  const n = evs(EV.BASE).length;
  act(p, { a: ACT.BASE, op: 'kindle' });
  assert.equal(evs(EV.BASE).length, n);

  const data = exportWorld(world);
  const restored = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), JSON.parse(JSON.stringify(data)));
  assert.equal(restored.base.fireLit, true);
  assert.ok(restored.stations().fire);
});

test('a saved explorer keeps whether they had a spear; an older save without the field counts a carried spear', () => {
  const { world, join, put } = solo();
  const p = join('Ana');
  p.key = 'ana';
  const s = world.layout.arrival.spear;
  put(p, s.x + 0.5, s.z);
  world.step(0.05);
  p.inv.spear = false;   // thrown away
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  const rec = data.roster.find((r) => r.key === 'ana');
  assert.deepEqual([rec.inv.spear, rec.inv.spearFound], [false, true]);
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  const q = back.players.get(back.join('Ana', null, undefined, undefined, 'ana').id);
  assert.deepEqual([q.inv.spear, q.inv.spearFound], [false, true]);
  delete rec.inv.spearFound;
  rec.inv.spear = true;
  const old = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  const r = old.players.get(old.join('Ana', null, undefined, undefined, 'ana').id);
  assert.equal(r.inv.spearFound, true);
});
