import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, MSG, PF, EV } from '../src/shared/protocol.js';
import { TORCH, carriesLight } from '../src/shared/torch.js';

function setup(spots) {
  const events = [];
  const world = new ServerWorld({ send(to, msg) { if (msg.t === MSG.EV) events.push(msg); } });
  if (spots) { world.layout.torchSpots = spots; world.placeTorches(); }
  const { id } = world.join('Torchbearer');
  const p = world.players.get(id);
  const act = (a, extra = {}) => world.receive(id, { t: MSG.ACT, a, ...extra });
  const state = (fl) => world.receive(id, { t: MSG.STATE, s: ++p.lastSeq + 1, k: p.epoch, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl });
  const torches = () => [...world.items.values()].filter((i) => i.kind === 'torch');
  return { world, p, act, state, torches, events };
}

test('PF.TORCH is its own bit and carriesLight reads it', () => {
  assert.equal(PF.TORCH, 256);
  assert.equal(Object.values(PF).filter((v) => (v & PF.TORCH) !== 0).length, 1);
  assert.equal(carriesLight(PF.TORCH | PF.GROUND), true);
  assert.equal(carriesLight({ fl: PF.SPRINT }), false);
  assert.equal(carriesLight(null), false);
});

test('islands without torchSpots have no torch items', () => {
  const { torches, world } = setup();
  assert.equal(world.layout.torchSpots.length, 0);
  assert.equal(torches().length, 0);
});

test('every torch spot holds one torch item', () => {
  const { torches } = setup([{ x: 1, z: 2 }, { x: -3, z: 4 }]);
  assert.equal(torches().length, 2);
  assert.deepEqual(torches().map((t) => t.spot).sort(), [0, 1]);
});

test('the PF.TORCH flag is only accepted while the server inventory has a torch', () => {
  const { p, state } = setup();
  state(PF.TORCH | PF.GROUND);
  assert.equal(p.fl & PF.TORCH, 0);
  assert.equal(p.fl & PF.GROUND, PF.GROUND);
  p.inv.torch = true;
  state(PF.TORCH | PF.GROUND);
  assert.equal(p.fl & PF.TORCH, PF.TORCH);
});

test('picking up a torch sets the inventory flag, once, and it respawns at its spot', () => {
  const { world, p, act, torches, events } = setup([{ x: 0, z: 0 }]);
  assert.equal(p.inv.torch, false);
  const [first] = torches();
  Object.assign(p, { x: first.x, z: first.z });
  act(ACT.PICKUP, { item: first.id });
  assert.equal(p.inv.torch, true);
  assert.equal(torches().length, 0);

  world.step(TORCH.respawnTime - 1);
  assert.equal(torches().length, 0, 'not back yet');
  world.step(2);
  const [again] = torches();
  assert.ok(again, 'respawned');
  assert.ok(events.some((e) => e.e === EV.ITEM_ADD && e.item?.kind === 'torch'));

  // an owner does not use the torch up
  act(ACT.PICKUP, { item: again.id });
  assert.equal(torches().length, 1);
});

test('a torch is kept across respawn and an item never expires', () => {
  const { world, p, torches } = setup([{ x: 0, z: 0 }]);
  p.inv.torch = true;
  world.respawnPlayer(p);
  assert.equal(p.inv.torch, true);
  world.step(10000);
  assert.equal(torches().length, 1);
});
