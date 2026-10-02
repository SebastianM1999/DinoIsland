import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, MSG } from '../src/shared/protocol.js';

function setup() {
  const world = new ServerWorld({ send() {} });
  const { id } = world.join('Carrier');
  const p = world.players.get(id);
  const act = (a, extra = {}) => world.receive(id, { t: MSG.ACT, a, ...extra });
  return { world, p, act };
}

test('dropped loot stack is conserved and can be recovered, repeated drops cannot duplicate it', () => {
  const { world, p, act } = setup();
  p.inv.loot.meat = 4;
  act(ACT.DROP, { kind: 'meat' });
  const item = [...world.items.values()].find(i => i.kind === 'meat');
  assert.equal(p.inv.loot.meat, 0);
  assert.equal(item.n, 4);
  assert.equal(item.droppedBy, p.id);
  const count = world.items.size;
  act(ACT.DROP, { kind: 'meat' });
  assert.equal(world.items.size, count);
  act(ACT.PICKUP, { item: item.id });
  assert.equal(p.inv.loot.meat, 4);
  assert.equal(world.items.has(item.id), false);
});

test('fruit, traps, spear durability and mixed arrow durability survive dropping and pickup', () => {
  const { world, p, act } = setup();
  p.inv.fruit = ['berry', 'mango', 'berry'];
  p.inv.traps = 1;
  p.inv.spear = true; p.inv.spearHealth = 37;
  p.inv.arrows = 3; p.inv.arrowUses = [1, 2, 2];
  for (const kind of ['berry', 'trap', 'spear', 'arrow']) act(ACT.DROP, { kind });
  assert.deepEqual(p.inv.fruit, ['mango']);
  assert.equal(p.inv.traps, 0);
  assert.equal(p.inv.spear, false);
  assert.equal(p.inv.arrows, 0);
  for (const item of [...world.items.values()]) act(ACT.PICKUP, { item: item.id });
  assert.deepEqual(p.inv.fruit.sort(), ['berry', 'berry', 'mango']);
  assert.equal(p.inv.traps, 1);
  assert.equal(p.inv.spearHealth, 37);
  assert.deepEqual(p.inv.arrowUses.sort(), [1, 2, 2]);
});

test('individual hut deposits only transfer the requested stack and enforce proximity', () => {
  const { world, p, act } = setup();
  p.inv.loot.meat = 4; p.inv.loot.hide = 2;
  p.x = 300; p.z = 300;
  act(ACT.DEPOSIT, { kind: 'meat' });
  assert.equal(p.inv.loot.meat, 4);
  const point = world.stations().dropOff[0];
  p.x = point.x; p.z = point.z;
  act(ACT.DEPOSIT, { kind: 'meat' });
  assert.equal(world.store.meat, 4);
  assert.equal(p.inv.loot.meat, 0);
  assert.equal(p.inv.loot.hide, 2);
  act(ACT.DEPOSIT, { kind: 'unknown' });
  assert.equal(p.inv.loot.hide, 2);
  act(ACT.DEPOSIT);
  assert.equal(world.store.hide, 2);
});

test('unknown drop requests and drops while downed cannot change the inventory', () => {
  const { world, p, act } = setup();
  const before = JSON.stringify(p.inv);
  act(ACT.DROP, { kind: '__proto__' });
  act(ACT.DROP, { kind: 'bogus' });
  p.downed = true;
  act(ACT.DROP, { kind: 'spear' });
  assert.equal(JSON.stringify(p.inv), before);
  assert.equal(world.items.size, 0);
});

test('firearms retain ammunition when dropped, cancel reload and can be recovered', () => {
  const { world, p, act } = setup();
  p.inv.guns.rifle = { loaded: 8, reserve: 19 };
  p.inv.reloading = 'rifle';
  act(ACT.DROP, { kind: 'rifle' });
  const item = [...world.items.values()].find(i => i.kind === 'rifle');
  assert.deepEqual(item.ammo, { loaded: 8, reserve: 19 });
  assert.equal(p.inv.guns.rifle.owned, false);
  assert.equal(p.inv.reloading, null);
  act(ACT.DROP, { kind: 'rifle' });
  assert.equal(world.items.size, 1);
  act(ACT.PICKUP, { item: item.id });
  assert.deepEqual(p.inv.guns.rifle, { loaded: 8, reserve: 19, owned: true });
});
