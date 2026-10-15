import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/shared/terrain.js';
import { planIsland } from '../src/shared/island.js';
import { buildLayout, buildLayoutSteps } from '../src/shared/layout.js';
import { runBuildSteps } from '../src/client/core/buildSteps.js';

test('scheduled terrain and placement preserve complete client/server worlds on every outdoor biome', async () => {
  for (let level = 0; level < 3; level++) {
    const plan = planIsland(level, 1);
    const synchronous = new Terrain(plan);
    let paints = 0;
    const scheduled = await runBuildSteps(Terrain.createSteps(plan), { budgetMs: 0, pause: async () => paints++ });
    assert(paints >= synchronous.n, 'terrain yields at row boundaries');
    for (const field of ['heights', 'ceilings', 'bogMask', 'bogLevel', 'heatMask']) assert.deepEqual(scheduled[field], synchronous[field], `${field} is unchanged on island ${level + 1}`);
    const syncLayout = buildLayout(synchronous);
    paints = 0;
    const asyncLayout = await runBuildSteps(buildLayoutSteps(scheduled), { budgetMs: 0, pause: async () => paints++ });
    assert(paints > 10, 'placement yields during candidate searches');
    // Functions close over the matching terrain; all owned data must be exact.
    assert.equal(JSON.stringify(asyncLayout), JSON.stringify(syncLayout));
    for (const point of [...syncLayout.spawnPoints, ...syncLayout.rocks.slice(0, 20), ...syncLayout.fruitSpots]) {
      assert.equal(scheduled.heightAt(point.x, point.z), synchronous.heightAt(point.x, point.z));
      assert.deepEqual(asyncLayout.rockSurfaceAt(point.x, point.z), syncLayout.rockSurfaceAt(point.x, point.z));
      assert.equal(asyncLayout.jungleDensity(point.x, point.z), syncLayout.jungleDensity(point.x, point.z));
    }
  }
});

test('island 1 builds its tent camp: no cabin, the table site until the team builds the table', async () => {
  const { buildHut } = await import('../src/client/world/hut.js');
  const { levelDef } = await import('../src/shared/levels.js');
  const terrain = new Terrain(planIsland(0, levelDef(0).variant));
  const layout = buildLayout(terrain);
  assert.equal(layout.hut.kind, 'tent');
  const hut = buildHut(terrain, layout, { landing: false });
  const named = (name) => hut.group.getObjectByName(name);
  assert.equal(named('hut-cabin'), undefined, 'no log cabin');
  assert.ok(named('hut-props'));
  assert.equal(named('hut-bench').visible, false, 'no table yet');
  assert.equal(named('hut-bench-site').visible, true, 'its building site');
  hut.setBench(true);
  assert.equal(named('hut-bench').visible, true);
  assert.equal(named('hut-bench-site').visible, false);
  // later islands without plots keep the hunting hut with its cabin
  const cave = buildLayout(new Terrain(planIsland(3, levelDef(3).variant)));
  assert.equal(cave.hut.kind, 'cabin');
});
