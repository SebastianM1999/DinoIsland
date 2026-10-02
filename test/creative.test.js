import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { RECIPES, unlockIsland } from '../src/shared/crafting.js';
import { SKILL_IDS, maxRank, progress, creativeProfile } from '../src/shared/skills.js';

function solo(level = 0) {
  const sent = [];
  const world = new ServerWorld({ send: (to, message) => sent.push({ to, message }) }, { level, variant: 5 });
  const { id } = world.join('Maker', undefined, undefined, { xp: 0, bonus: 0, skills: { thickSkin: 1 } });
  const p = world.players.get(id);
  const act = (m) => world.receive(id, { t: MSG.ACT, ...m });
  const lastProf = () => sent.filter((s) => s.to === id && s.message.t === MSG.PROF).at(-1)?.message.prof;
  return { world, p, act, sent, lastProf };
}

test('creative profile: every skill at max rank, nothing left to spend', () => {
  const prof = creativeProfile();
  for (const id of SKILL_IDS) assert.equal(prof.skills[id], maxRank(id));
  assert.equal(progress(prof).free, 0);
});

test('creative mode grants every skill and gives the earned ones back afterwards', () => {
  const { world, p, act, lastProf } = solo();
  const hp = p.maxHp;
  act({ a: ACT.CREATIVE, on: true });
  assert.ok(lastProf().creative);
  assert.equal(lastProf().skills.lastStand, maxRank('lastStand'));
  assert.ok(p.mods.dash && p.maxHp > hp, 'skill effects apply');
  assert.deepEqual(p.prof.skills, { thickSkin: 1 }, 'the earned profile stays untouched');
  act({ a: ACT.SKILL, op: 'reset' });
  assert.deepEqual(p.prof.skills, { thickSkin: 1 });
  world.now += 1;
  act({ a: ACT.CREATIVE, on: false });
  assert.ok(!lastProf().creative);
  assert.deepEqual(lastProf().skills, { thickSkin: 1 });
  assert.equal(p.maxHp, hp);
  assert.ok(!p.mods.dash);
});

test('creative mode crafts for free and keeps the inventory full', () => {
  const { world, p, act } = solo();
  act({ a: ACT.CREATIVE, on: true });
  const bench = world.stations().workbench;
  Object.assign(p, { x: bench.x, z: bench.z });
  const r = RECIPES.find((x) => x.kind === 'upgrade' && !x.requires && unlockIsland(x) === 1);
  for (const k of Object.keys(world.store)) world.store[k] = 0;
  act({ a: ACT.CRAFT, recipe: r.id });
  assert.ok(world.upgrades.has(r.id));
  assert.ok(Object.values(world.store).every((n) => n === 0), 'nothing was taken from the store');

  p.inv.arrows = 0; p.inv.traps = 0; p.inv.spear = false;
  p.inv.guns.pistol.reserve = 0;
  world.step(1);
  const caps = world.caps();
  assert.equal(p.inv.arrows, caps.arrows);
  assert.equal(p.inv.traps, caps.traps);
  assert.ok(p.inv.spear);
  assert.equal(p.inv.guns.pistol.reserve, CONFIG.weapons.pistol.reserve);
});

test('creative mode repairs the boat without the parts', () => {
  const { world, p, act, sent } = solo();
  act({ a: ACT.CREATIVE, on: true });
  const boat = world.layout.boat;
  Object.assign(p, { x: boat.interact.x, z: boat.interact.z });
  assert.ok(world.relics.some((r) => !r.found));
  act({ a: ACT.REPAIR });
  assert.equal(world.mission.phase, 'repaired');
  assert.ok(sent.some((s) => s.message.e === EV.BOAT));
});
