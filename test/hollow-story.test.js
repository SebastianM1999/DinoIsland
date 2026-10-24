import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { RECIPE_BY_ID } from '../src/shared/crafting.js';
import { freshBase } from '../src/shared/base.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';
import { reuseCaveWalk } from './helpers/caveFixture.js';

const LEVEL = 3;

test("the Hollow Mountain has crystal to break, Elias' writing in a crystal hall and his last camp with the seal crystal", () => {
  for (const variant of [levelDef(LEVEL).variant, 0, 1]) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    reuseCaveWalk(terrain);
    const L = buildLayout(terrain);
    const crystals = L.resourceSpots.filter((s) => s.type === 'crystal');
    assert.equal(crystals.length, 8, `v${variant}: crystal clusters`);
    for (const s of crystals) assert.equal(terrain.waterDepthAt(s.x, s.z), 0);
    assert.deepEqual(L.notes.map((n) => n.id).sort(), ['diary', 'wall']);
    const wall = L.storyAnchors.crystalHall;
    assert.ok(wall.y > terrain.heightAt(wall.x, wall.z) + 1, 'the writing is on the wall, at eye height');
    const { camp, seal } = L.storyAnchors.eliasCamp;
    for (const p of [camp, seal]) {
      assert.equal(terrain.waterDepthAt(p.x, p.z), 0, `v${variant}: dry camp`);
      assert.ok(terrain.ceilingAt(p.x, p.z) - terrain.heightAt(p.x, p.z) > 2.5, `v${variant}: room to stand`);
    }
  }
});

test('tier 3: crystal upgrades, taught by the writing in the crystal hall, after their tier 2', () => {
  const bow3 = RECIPE_BY_ID.bow3;
  assert.deepEqual([bow3.tier, bow3.learn, bow3.requires], [3, 'wall', 'bow2']);
  assert.ok(bow3.cost.crystal > 0 && RECIPE_BY_ID.spear3.cost.crystal > 0);
});

function hollow() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: LEVEL });
  reuseCaveWalk(world.terrain);
  const p = world.players.get(world.join('Delver').id);
  const put = (o) => Object.assign(p, { x: o.x, z: o.z, y: world.terrain.heightAt(o.x, o.z) });
  const run = (s) => { for (let t = 0; t < s; t += 0.05) world.step(0.05); };
  return { world, p, put, run, sent };
}

test('taking the seal crystal at Elias\' camp readies the boat in the west cove; it sails back to Ashfall', () => {
  const { world, p, put, run, sent } = hollow();
  assert.equal(world.mission.phase, 'explore');
  assert.deepEqual(world.mission.state().objectives.map((o) => o.story), [true, true, true, true], 'only the story until then');
  const seal = world.layout.storyAnchors.eliasCamp.seal;
  put(seal);
  run(0.6);
  assert.equal(world.story.sealCrystal, true);
  assert.ok(sent.some(({ msg }) => msg.e === EV.STORY && msg.story.sealCrystal));
  assert.ok(world.story.steps.has('seal'));
  assert.equal(world.mission.phase, 'repaired', 'the boat waits');
  assert.match(world.mission.state().objectives.at(-1).text, /Sail back to Ashfall Isle/);
  // sailing is from the west cove, not the east beach wreck
  const east = world.layout.boat;
  put({ x: east.x - 3, z: east.z });
  world.receive(p.id, { t: MSG.ACT, a: ACT.SAIL });
  assert.equal(world.mission.phase, 'repaired', 'not from the east beach');
  const cove = world.layout.arrivalBoat;
  put({ x: cove.x + 4, z: cove.z });
  world.receive(p.id, { t: MSG.ACT, a: ACT.SAIL });
  assert.equal(world.mission.phase, 'sailing');
  assert.equal(world.mission.state().next.index, 2);

  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.equal(data.story.sealCrystal, true);
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.equal(back.story.sealCrystal, true, 'the crystal is the expedition\'s');
});

test('crystal breaks off a cluster into the pack and is a story step', () => {
  const { world, p, put } = hollow();
  const spot = world.layout.resourceSpots.find((s) => s.type === 'crystal');
  put(spot);
  world.receive(p.id, { t: MSG.ACT, a: ACT.GATHER, spot: spot.id });
  assert.equal(p.inv.loot.crystal, 1);
  assert.ok(world.story.steps.has('crystal'));
});

test('tier 3 crafts at the base workbench on Ashfall once the writing in the hall is read', () => {
  const world = new ServerWorld({ send() {} }, { level: 2 });
  const p = world.players.get(world.join('Smith').id);
  world.base = { ...freshBase(), plot: 0, stage: 1 };
  const bench = world.stations().workbench;
  Object.assign(p, { x: bench.x + 1, z: bench.z, y: world.terrain.heightAt(bench.x + 1, bench.z) });
  Object.assign(world.store, { crystal: 5, teeth: 5 });
  world.upgrades.add('bow1').add('bow2');
  world.receive(p.id, { t: MSG.ACT, a: ACT.CRAFT, recipe: 'bow3' });
  assert.equal(world.upgrades.has('bow3'), false, 'not before the writing in the hall');
  world.story.notesRead.add('wall');
  world.receive(p.id, { t: MSG.ACT, a: ACT.CRAFT, recipe: 'bow3' });
  assert.equal(world.upgrades.has('bow3'), true);
});
