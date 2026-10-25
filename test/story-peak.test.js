import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, recipeKnown } from '../src/shared/crafting.js';
import { ACT, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test("Elias' note on the summit teaches the supplies and the first upgrades; tier 2 needs no note", () => {
  const taught = RECIPES.filter((r) => r.learn === 'peak').map((r) => r.id).sort();
  assert.deepEqual(taught, ['arrows', 'bow1', 'quiver1', 'spear', 'spear1', 'tonic', 'trap']);
  const bow2 = RECIPES.find((r) => r.id === 'bow2');
  assert.equal(recipeKnown(bow2, new Set()), true);
  assert.equal(recipeKnown(RECIPES[0], new Set()), false);
  assert.equal(recipeKnown(RECIPES[0], new Set(['peak'])), true);
  assert.equal(recipeKnown(RECIPES[0], new Set(), true), true, 'an expedition from before the story');
});

function camp() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: 0 });
  const p = world.players.get(world.join('Smith').id);
  world.base.bench = true;
  const rack = world.layout.hut.arrowRack;
  const at = (o) => Object.assign(p, { x: o.x + 0.5, z: o.z, y: world.terrain.heightAt(o.x + 0.5, o.z) });
  const craft = (recipe) => world.receive(p.id, { t: MSG.ACT, a: ACT.CRAFT, recipe });
  Object.assign(p.inv, { bow: true, arrows: 0, arrowUses: [] });
  world.store.teeth = 5;
  const toasts = () => sent.filter(({ msg }) => msg.e === 'toast').map(({ msg }) => msg.text);
  return { world, p, at, rack, craft, toasts };
}

test('crafting waits for the note: refused before, possible once anyone has read it', () => {
  const { world, p, at, rack, craft, toasts } = camp();
  at(rack);
  craft('arrows');
  assert.equal(p.inv.arrows, 0);
  assert.match(toasts().at(-1), /don't know how to make Arrows/);
  // the note lies at Elias' camp below the summit
  const note = world.layout.notes.find((n) => n.id === 'peak');
  at(note);
  world.receive(p.id, { t: MSG.ACT, a: ACT.READ, note: 'peak' });
  assert.ok(world.story.steps.has('peak'), 'the story step is done');
  assert.ok(toasts().some((t) => /The team learned: Arrows ×6, Spike trap, Spare spear, Revival tonic, Reinforced bow, Stone spearhead, Leather quiver/.test(t)));
  at(rack);
  craft('arrows');
  assert.equal(p.inv.arrows, 6);
  assert.equal(world.store.teeth, 4);
});

test('creative mode crafts without the note', () => {
  const { p, at, rack, craft } = camp();
  p.creative = true;
  at(rack);
  craft('arrows');
  assert.ok(p.inv.arrows >= 6);
});

test('an expedition saved before the story keeps every recipe; a story save without the note does not', () => {
  const { world } = camp();
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  const fresh = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), JSON.parse(JSON.stringify(data)));
  assert.equal(fresh.story.knowsRecipe(RECIPES[0]), false);
  delete data.story;
  const old = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.equal(old.story.knowsRecipe(RECIPES[0]), true);
  assert.equal(old.fullState().story.legacy, true);
  const again = JSON.parse(JSON.stringify(exportWorld(old)));
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(again)), again).story.knowsRecipe(RECIPES[0]), true, 'and keeps it across saves');
});
