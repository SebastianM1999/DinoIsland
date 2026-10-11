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
