import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';

/** A world with one player standing next to a freshly killed raptor (no other dinosaurs). */
function setup() {
  const events = [];
  const world = new ServerWorld({ send: (to, msg) => events.push(msg) }, { variant: 1 });
  const { id } = world.join('Butcher');
  const p = world.players.get(id);
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const d = world.dinos.spawn('raptor', p.x + 2, p.z);
  p.x = d.x - 1.5; p.z = d.z; p.y = d.y;
  world.dinos.kill(d, id);
  events.length = 0;
  const act = (m) => world.receive(id, { t: MSG.ACT, ...m });
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.05) world.step(0.05); };
  return { world, p, d, act, run, events };
}

const kinds = (world) => [...world.items.values()].map((it) => it.kind);

test('holding V at a carcass butchers it once for the configured extra drops', () => {
  const { world, d, act, run, events } = setup();
  const before = kinds(world);
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(events.some((m) => m.e === EV.BUTCHER && m.dino === d.id));
  run(CONFIG.dinos.raptor.butcher.time - 0.3);
  assert.ok(!d.butchered, 'not done before the butcher time');
  run(0.5);
  assert.ok(d.butchered);
  assert.ok(events.some((m) => m.e === EV.BUTCHERED && m.id === d.id));
  const added = kinds(world).filter((k) => k === 'bones' || k === 'skull');
  assert.equal(added.length - before.filter((k) => k === 'bones' || k === 'skull').length, 3);   // 2 bones + 1 skull
  // a carcass is butchered only once
  events.length = 0;
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(!events.some((m) => m.e === EV.BUTCHER && m.dino));
});

test('butchering needs a dead dinosaur in reach and stops when moving away or getting hurt', () => {
  const { world, p, d, act, run } = setup();
  // too far away
  p.x -= 8;
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.equal(p.butcher, undefined);
  p.x += 8;
  // walking off cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(p.butcher);
  p.x -= CONFIG.weapons.knife.moveCancel + 0.5;
  run(0.1);
  assert.equal(p.butcher, null);
  p.x += CONFIG.weapons.knife.moveCancel + 0.5;
  // a hit cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  world.hurtPlayer(p, 5);
  assert.equal(p.butcher, null);
  // letting go of V cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  act({ a: ACT.BUTCHER, stop: 1 });
  assert.equal(p.butcher, null);
  run(CONFIG.dinos.raptor.butcher.time + 0.5);
  assert.ok(!d.butchered);
  // living dinosaurs cannot be butchered
  const alive = world.dinos.spawn('raptor', p.x + 1.5, p.z);
  act({ a: ACT.BUTCHER, dino: alive.id });
  assert.equal(p.butcher, null);
});

test('bones and skulls are regular loot: carried, weighed and stored at the hut', () => {
  assert.ok(CONFIG.loot.bones.weight > 0 && CONFIG.loot.skull.weight > 0);
  for (const [type, c] of Object.entries(CONFIG.dinos)) {
    assert.ok(c.butcher?.time > 0, `${type} has a butcher time`);
    for (const k of Object.keys(c.butcher.loot)) assert.ok(CONFIG.loot[k], `${type} butcher drop ${k} is a loot kind`);
  }
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  assert.equal(world.store.bones, 0);
  assert.equal(world.store.skull, 0);
});
