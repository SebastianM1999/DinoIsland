import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { RECIPES, RECIPE_BY_ID, upgradeMods } from '../src/shared/crafting.js';

const W = CONFIG.weapons;

function setup() {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) });
  const { id } = world.join('Smith');
  const player = world.players.get(id);
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

test('traps and bait are limited by the carry caps', () => {
  const { world, player, craft, stock } = setup();
  stock({ hide: 5, claws: 5, meat: 5 });
  player.inv.traps = world.caps().traps;
  craft('trap');
  assert.equal(world.store.hide, 5);
  player.inv.traps = 0;
  craft('trap');
  assert.equal(player.inv.traps, 1);
  assert.equal(world.store.claws, 4);
  player.inv.baits = 0;
  craft('bait');
  assert.equal(player.inv.baits, 2);
  assert.equal(world.store.meat, 4);
});

test('a lost spear can be crafted again, but not while you hold one', () => {
  const { world, player, craft, stock } = setup();
  stock({ teeth: 2, hide: 2 });
  craft('spear');
  assert.equal(world.store.teeth, 2);
  player.inv.spear = false;
  craft('spear');
  assert.equal(player.inv.spear, true);
  assert.equal(world.store.teeth, 1);
});

test('upgrades are built once for the team and change damage and limits', () => {
  const { world, player, craft, stock, messages } = setup();
  stock({ hide: 9, teeth: 9 });
  craft('bow1');
  assert.ok(world.upgrades.has('bow1'));
  assert.equal(world.store.hide, 7);
  craft('bow1');
  assert.equal(world.store.hide, 7, 'already built');
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
  stock({ hide: 9, teeth: 9, claws: 9, plates: 9 });
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
  craft('bow2');
  assert.ok(!world.upgrades.has('bow2'), 'no workbench before a camp is built');
  const plot = world.layout.basePlots[0];
  p.x = plot.x; p.z = plot.z;
  stock({ hide: 9, teeth: 9, claws: 9, plates: 9, bones: 9 });
  world.receive(p.id, { t: MSG.ACT, a: ACT.BASE, op: 'build', plot: 0 });
  for (let t = 0; t < 16; t += 0.5) world.step(0.5);
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

test('the free refill only restores basic arrows, not traps or bait', () => {
  const { world, player, messages } = setup();
  player.inv.arrows = 0; player.inv.traps = 0; player.inv.baits = 0;
  world.receive(player.id, { t: MSG.ACT, a: ACT.REFILL });
  assert.equal(player.inv.arrows, W.bow.startArrows);
  assert.equal(player.inv.traps, 0);
  assert.equal(player.inv.baits, 0);
  assert.ok(messages.length > 0);
});
