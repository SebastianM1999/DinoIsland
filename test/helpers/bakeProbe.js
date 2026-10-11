// Does this engine take the committed Hollow Mountain bake? Loads assets/cave/<fixed map>.bin the way the browser does
// (preloadCaveBake: fetch + DecompressionStream), then builds the fixed map's Terrain and its cave mesh like the client:
// the walk grid and the painted volume are only taken from the bake when their keys (field probe, paint probe, light
// sources) agree with what this engine computes. Runs in a browser page (test/cross-engine.test.js).

import { planIsland } from '../../src/shared/island.js';
import { Terrain } from '../../src/shared/terrain.js';
import { buildLayout } from '../../src/shared/layout.js';
import { levelDef } from '../../src/shared/levels.js';
import { caveBakeFor, walkKey } from '../../src/shared/caveBake.js';
import { preloadCaveBake } from '../../src/shared/caveBakeLoad.js';
import { buildCaveTerrainMesh } from '../../src/client/world/caveTerrain.js';

export async function bakeUse(level = 3) {
  const variant = levelDef(level).variant, ms = {};
  let t = performance.now();
  const registered = await preloadCaveBake(level, variant);
  ms.load = performance.now() - t;
  const plan = planIsland(level, variant);
  const walkBaked = !!caveBakeFor(plan, 'walk');
  t = performance.now();
  const terrain = new Terrain(plan);
  ms.terrain = performance.now() - t;
  t = performance.now();
  const layout = buildLayout(terrain);
  ms.layout = performance.now() - t;
  t = performance.now();
  const mesh = buildCaveTerrainMesh(terrain, layout);
  ms.mesh = performance.now() - t;
  return { registered, walkKey: walkKey(plan), walkBaked, meshKey: mesh.userData.bakeKey, meshBaked: !!mesh.userData.volumeStats?.baked, ms };
}
