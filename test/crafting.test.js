import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { RECIPES, RECIPE_BY_ID, upgradeMods } from '../src/shared/crafting.js';

const W = CONFIG.weapons;

function setup() {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) });
  const { id } = world.join('Smith');
  const player = world.players.get(id);
  Object.assign(player.inv, { bow: true, arrows: 12, arrowUses: Array(12).fill(3) });   // (island 1: the bow is found at the hunter's camp – bow-find.test.js)
  world.base.bench = true;   // island 1: the team's camp table stands (building it: below)
  const rack = world.layout.hut.arrowRack;
  player.x = rack.x; player.z = rack.z; player.y = world.terrain.heightAt(rack.x, rack.z);
  const craft = (recipe) => world.receive(player.id, { t: MSG.ACT, a: ACT.CRAFT, recipe });
  const stock = (loot) => { for (const k of Object.keys(world.store)) world.store[k] = loot[k] ?? 0; };
  return { world, player, messages, craft, stock };
}

test('every recipe only costs known loot and every upgrade has a tier', () => {
  for (const r of RECIPES) {
    for (const k of Object.keys(r.cost)) assert.ok(CONFIG.loot[k], `${r.id}: unknown loot ${k}`);
    if (r.kind === 'upgrade') assert.ok(r.tier >= 1, `${r.id} needs a tier`);
    if (r.requires) assert.equal(RECIPE_BY_ID[r.requires].kind, 'upgrade');
  }
});

test('the first upgrades of spear and bow cost the forest resources of island 1', () => {
  assert.deepEqual(RECIPE_BY_ID.spear1.cost, { ironwood: 2, resin: 1 });
  assert.deepEqual(RECIPE_BY_ID.bow1.cost, { ironwood: 2, resin: 2, herb: 1 });
  const { world, craft, stock } = setup();
  stock({ hide: 9, teeth: 9 });
  craft('spear1');
  assert.ok(!world.upgrades.has('spear1'), 'hide and teeth no longer buy it');
  stock({ ironwood: 2, resin: 1 });
  craft('spear1');
  assert.ok(world.upgrades.has('spear1'));
  assert.equal(world.store.ironwood + world.store.resin, 0);
});

test('crafting arrows pays from the hut store and fills the quiver', () => {
  const { world, player, craft, stock } = setup();
  stock({ teeth: 2 });
  player.inv.arrows = 3;
  craft('arrows');
  assert.equal(player.inv.arrows, 9);
  assert.equal(world.store.teeth, 1);
});

test('crafting is refused without material, when full, far away or for unknown recipes', () => {
  const { world, player, craft, stock } = setup();
  stock({});
  player.inv.arrows = 3;
  craft('arrows');
  assert.equal(player.inv.arrows, 3, 'no teeth in the store');

  stock({ teeth: 5 });
  player.inv.arrows = world.caps().arrows;
  craft('arrows');
  assert.equal(world.store.teeth, 5, 'full quiver costs nothing');

  player.inv.arrows = 3;
  player.x += 50;
  craft('arrows');
  assert.equal(player.inv.arrows, 3, 'too far from the workbench');
  player.x -= 50;

  craft('nonsense');
  assert.equal(world.store.teeth, 5);
});

test('traps are limited by the carry cap', () => {
  const { world, player, craft, stock } = setup();
  stock({ hide: 5, claws: 5, meat: 5 });
  player.inv.traps = world.caps().traps;
  craft('trap');
  assert.equal(world.store.hide, 5);
  player.inv.traps = 0;
  craft('trap');
  assert.equal(player.inv.traps, 1);
  assert.equal(world.store.claws, 4);
});

test('a lost spear can be crafted again, but not while you hold one', () => {
  const { world, player, craft, stock } = setup();
  stock({ teeth: 2, hide: 2 });
  Object.assign(player.inv, { spear: true, spearFound: true });   // (island 1: Jonas' spear, taken at the cold camp fire)
  craft('spear');
  assert.equal(world.store.teeth, 2);
  player.inv.spear = false;
  craft('spear');
  assert.equal(player.inv.spear, true);
  assert.equal(world.store.teeth, 1);
});

test('upgrades are built once for the team and change damage and limits', () => {
  const { world, player, craft, stock, messages } = setup();
  stock({ hide: 9, teeth: 9, resin: 9, ironwood: 9, herb: 9 });
  craft('bow1');
  assert.ok(world.upgrades.has('bow1'));
  assert.deepEqual([world.store.ironwood, world.store.resin, world.store.herb], [7, 7, 8], 'the bow upgrade costs the forest resources');
  assert.equal(world.store.hide, 9);
  craft('bow1');
  assert.equal(world.store.ironwood, 7, 'already built');
  assert.deepEqual(messages.filter((m) => m.msg.t === MSG.INV).at(-1).msg.inv.upgrades, ['bow1']);

  craft('quiver1');
  assert.equal(world.caps().arrows, W.bow.maxArrows + 4);

  // arrow damage +20%
  const d = world.dinos.list.find((dino) => dino.type !== 'ptera' && !dino.leash);
  d.x = player.x; d.z = player.z - 6; d.y = player.y;
  const o = [player.x, player.y + CONFIG.player.eyeHeight, player.z];
  world.receive(player.id, { t: MSG.ACT, a: ACT.FIRE, kind: 'arrow', pid: 1, o, v: [0, 0, -30], pw: 1 });
  world.step(0.2);
  const hp = d.hp;
  world.receive(player.id, { t: MSG.ACT, a: ACT.LAND, pid: 1,
    p: [player.x, o[1] - W.bow.arrowGravity * 0.2 ** 2 / 2, player.z - 6], dino: d.id, zone: 'body' });
  assert.ok(Math.abs(hp - d.hp - W.bow.damage * 1.2) < 1e-6);
});

test('tier 2 upgrades unlock on island 2 and need their tier 1 upgrade', () => {
  const { world, craft, stock } = setup();
  stock({ hide: 9, teeth: 9, claws: 9, plates: 9, resin: 9, ironwood: 9, herb: 9 });
  craft('bow2');
  assert.ok(!world.upgrades.has('bow2'), 'locked on island 1');

  craft('bow1');
  world.nextLevel();
  assert.equal(world.levelIndex, 1);
  assert.ok(world.upgrades.has('bow1'), 'team upgrades survive the voyage');

  // from island 2 on, crafting needs the workbench of the team's own camp
  const p = [...world.players.values()][0];
  const landing = world.layout.hut.arrowRack;
  p.x = landing.x; p.z = landing.z;
  const plot = world.layout.basePlots[0];
  craft('bow2');
  if (!plot) {
    assert.ok(world.upgrades.has('bow2'), 'a layout without base plots falls back to the hut workbench');
    return;
  }
  assert.ok(!world.upgrades.has('bow2'), 'no workbench before a camp is built');
  p.x = plot.x; p.z = plot.z;
  stock({ hide: 9, teeth: 9, claws: 9, plates: 9, bones: 9 });
  world.receive(p.id, { t: MSG.ACT, a: ACT.BASE, op: 'build', plot: 0 });
  // invincible while the camp builds: on a random island a dinosaur can reach (and kill) the
  // player in these 16 s, which has nothing to do with crafting and made this test flaky
  p.creative = true;
  for (let t = 0; t < 16; t += 0.5) world.step(0.5);
  p.creative = false;
  assert.equal(world.base.stage, 1);
  const bench = world.stations().workbench;
  p.x = bench.x; p.z = bench.z;
  craft('spear2');
  assert.ok(!world.upgrades.has('spear2'), 'needs the stone spearhead first');
  craft('bow2');
  assert.ok(world.upgrades.has('bow2'));
  const m = upgradeMods(world.upgrades);
  assert.equal(m.bowSpeed, 8);
  assert.ok(Math.abs(m.bowDamage - 0.35) < 1e-9);
});

test('the free refill only restores basic arrows, not traps', () => {
  const { world, player, messages } = setup();
  player.inv.arrows = 0; player.inv.traps = 0;
  world.receive(player.id, { t: MSG.ACT, a: ACT.REFILL });
  assert.equal(player.inv.arrows, W.bow.startArrows);
  assert.equal(player.inv.traps, 0);
  assert.ok(messages.length > 0);
});

test('island 1: the team builds its camp table at the tent from the hut store, and it makes tier-1 recipes only', () => {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) });
  const player = world.players.get(world.join('Smith').id);
  const act = (m) => world.receive(player.id, { t: MSG.ACT, ...m });
  const site = world.stations().benchSite;
  assert.ok(site, 'a building site before the table stands');
  assert.equal(world.stations().workbench, null);
  for (const k of Object.keys(world.store)) world.store[k] = 0;
  // no crafting yet
  player.x = site.x; player.z = site.z;
  act({ a: ACT.CRAFT, recipe: 'arrows' });
  assert.equal(world.upgrades.size, 0);
  // too far away, then too poor: nothing is built and nothing is paid
  Object.assign(world.store, { ironwood: 3, resin: 2 });
  player.x = site.x + 20;
  act({ a: ACT.BASE, op: 'bench' });
  assert.equal(world.base.bench, false);
  player.x = site.x;
  world.store.resin = 1;
  act({ a: ACT.BASE, op: 'bench' });
  assert.equal(world.base.bench, false);
  assert.equal(world.store.ironwood, 3, 'a refused build pays nothing');
  world.store.resin = 2;
  act({ a: ACT.BASE, op: 'bench' });
  assert.equal(world.base.bench, true);
  assert.equal(world.store.ironwood + world.store.resin, 0);
  assert.ok(sent.some((s) => s.msg.e === EV.BASE && s.msg.base.bench === true), 'every client learns the table stands');
  assert.equal(world.stations().benchSite, null);
  assert.ok(world.stations().workbench);
  // building it again costs nothing more
  Object.assign(world.store, { ironwood: 3, resin: 2 });
  act({ a: ACT.BASE, op: 'bench' });
  assert.equal(world.store.ironwood, 3);
  // a late joiner sees the table
  assert.equal(world.fullState().base.bench, true);
  // tier 2 stays out of reach at the camp table, even in creative mode
  act({ a: ACT.CREATIVE, on: true });
  act({ a: ACT.CRAFT, recipe: 'bow1' });
  assert.ok(world.upgrades.has('bow1'));
  act({ a: ACT.CRAFT, recipe: 'bow2' });
  assert.ok(!world.upgrades.has('bow2'));
});
