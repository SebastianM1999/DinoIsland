import test from 'node:test';
import assert from 'node:assert/strict';
import { levelDef, sideIslandOf, nextMainIsland } from '../src/shared/levels.js';
import { freshBase } from '../src/shared/base.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test('the islands in order: Ashfall is the last, the Hollow Mountain its side island', () => {
  assert.equal(sideIslandOf(2), 3);
  assert.equal(sideIslandOf(0), null);
  assert.equal(nextMainIsland(0), 1);
  assert.equal(nextMainIsland(1), 2);
  assert.equal(nextMainIsland(2), null, 'after Ashfall the expedition is over');
  assert.equal(levelDef(3).label, '3b');
  assert.equal(levelDef(2).label, '3');
});

function ashfall() {
  const world = new ServerWorld({ send() {} }, { level: 2 });
  const p = world.players.get(world.join('Voyager').id);
  return { world, p };
}

test('Ashfall -> Hollow Mountain -> Ashfall: the team comes back to the island as it left it', () => {
  const { world, p } = ashfall();
  assert.equal(world.destination(), 3, 'from Ashfall over to its side island first');
  // the team leaves marks on Ashfall: a boat part found, a base, an item on the ground, the boat repaired
  world.relics[0].found = true;
  world.relics[0].byName = 'Voyager';
  world.base = { ...freshBase(), plot: 0, stage: 1 };
  const item = world.spawnItem('spear', p.x + 3, p.z, 1);
  world.mission.phase = 'sailing';
  world.store.teeth = 7;
  world.nextLevel();
  assert.equal(world.levelIndex, 3);
  assert.equal(world.destination(), 2, 'its boat sails back to Ashfall');
  assert.ok(world.parked[2], 'Ashfall waits');
  assert.equal(world.mission.phase, 'search', 'a boat quest of its own');
  // the expedition goes on meanwhile
  world.store.teeth = 9;
  world.mission.phase = 'sailing';
  world.nextLevel();
  assert.equal(world.levelIndex, 2);
  assert.equal(world.parked[2], undefined);
  assert.deepEqual([world.relics[0].found, world.relics[0].byName], [true, 'Voyager']);
  assert.equal(world.base.stage, 1);
  assert.ok(world.items.has(item.id), 'the spear still lies where it fell');
  assert.equal(world.mission.phase, 'repaired', 'the boat waits, repaired');
  assert.equal(world.store.teeth, 9, 'the team store is the expedition\'s');
  const plot = world.layout.basePlots[0];
  assert.ok(Math.hypot(p.x - plot.x, p.z - plot.z) < plot.r + 8, 'back at the base camp');
  assert.equal(world.destination(), null, 'now the voyage from Ashfall ends the expedition');
  world.mission.phase = 'sailing';
  assert.equal(world.mission.state().won, true);
});

test('a save on the Hollow Mountain keeps the parked Ashfall; the voyage back after the load restores it', () => {
  const { world } = ashfall();
  world.relics[1].found = true;
  world.mission.phase = 'sailing';
  world.nextLevel();
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.equal(data.level, 3);
  assert.equal(data.parked['2'].level, 2);
  assert.ok(data.story.visited.includes(3));
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.ok(back.parked['2']);
  assert.equal(back.destination(), 2);
  back.mission.phase = 'sailing';
  back.nextLevel();
  assert.equal(back.levelIndex, 2);
  assert.equal(back.relics[1].found, true);
  assert.equal(back.destination(), null);
});
