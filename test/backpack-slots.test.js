import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';

const SLOTS = CONFIG.player.backpackSlots;
const LOOT_KEYS = Object.keys(CONFIG.loot);

// The backpack holds one stack per material kind: SLOTS kinds at most, enforced
// by the server on every way loot comes in (pickups, map resources).
function setup() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, ...msg }) });
  const { id } = world.join('Packer');
  const p = world.players.get(id);
  const act = (a, extra = {}) => world.receive(id, { t: MSG.ACT, a, ...extra });
  const fullAlerts = () => sent.filter((m) => m.to === id && m.t === MSG.EV && m.e === EV.FULL);
  /** A one-unit stack of `kind` on the ground at the player's feet. */
  const ground = (kind, n = 1) => world.spawnItem(kind, p.x, p.z, n);
  return { world, p, act, fullAlerts, ground };
}

/** Fills the backpack with SLOTS light kinds (one unit each) and returns them. */
function fill(p) {
  const light = [...LOOT_KEYS].sort((a, b) => CONFIG.loot[a].weight - CONFIG.loot[b].weight).slice(0, SLOTS);
  for (const k of light) p.inv.loot[k] = 1;
  return light;
}

test('the server reports the backpack size with the inventory limits', () => {
  const { world } = setup();
  assert.equal(world.caps().slots, SLOTS);
  assert.ok(LOOT_KEYS.length > SLOTS, 'more material kinds exist than fit in the backpack');
});

test('a kind beyond the backpack slots is refused with a FULL alert and leaves loot and item untouched', () => {
  const { world, p, act, fullAlerts, ground } = setup();
  const carried = fill(p);
  const extra = LOOT_KEYS.find((k) => !carried.includes(k));
  const before = JSON.stringify(p.inv.loot);
  const item = ground(extra);
  act(ACT.PICKUP, { item: item.id });
  assert.equal(JSON.stringify(p.inv.loot), before);
  assert.ok(world.items.has(item.id), 'the refused stack stays on the ground');
  assert.equal(fullAlerts().length, 1);
  assert.match(fullAlerts()[0].text, new RegExp(`${SLOTS} kinds`));
  // retrying (auto-loot does) cannot sneak it in either
  act(ACT.PICKUP, { item: item.id });
  assert.equal(p.inv.loot[extra], 0);
});

test('a full backpack still takes more of a kind it already carries', () => {
  const { world, p, act, ground } = setup();
  const carried = fill(p);
  const item = ground(carried[0], 2);
  act(ACT.PICKUP, { item: item.id });
  assert.equal(p.inv.loot[carried[0]], 3);
  assert.equal(world.items.has(item.id), false);
});

test('dropping or depositing a stack frees its slot for a new kind', () => {
  const { world, p, act, ground } = setup();
  const carried = fill(p);
  const [a, b] = LOOT_KEYS.filter((k) => !carried.includes(k));
  act(ACT.DROP, { kind: carried[0] });
  assert.equal(p.inv.loot[carried[0]], 0);
  act(ACT.PICKUP, { item: ground(a).id });
  assert.equal(p.inv.loot[a], 1);

  const point = world.stations().dropOff[0];
  p.x = point.x; p.z = point.z;
  act(ACT.DEPOSIT, { kind: carried[1] });
  assert.equal(world.store[carried[1]], 1);
  act(ACT.PICKUP, { item: ground(b).id });
  assert.equal(p.inv.loot[b], 1);
  assert.equal(world.lootStacks(p), SLOTS);
});

test('the weight limit still applies with free backpack slots', () => {
  const { world, p, act, fullAlerts, ground } = setup();
  const heavy = [...LOOT_KEYS].sort((x, y) => CONFIG.loot[y].weight - CONFIG.loot[x].weight)[0];
  const n = Math.floor(world.caps().carry / CONFIG.loot[heavy].weight) + 1;
  const item = ground(heavy, n);
  act(ACT.PICKUP, { item: item.id });
  assert.equal(p.inv.loot[heavy], 0);
  assert.equal(world.lootStacks(p), 0);
  assert.match(fullAlerts()[0].text, /pack is full/);
});
