// Hollow Mountain, the parts the player sees: the terrain mesh that hands over to the volume, the sky light field,
// no cave dressing outside the cave, small coves. Pure geometry checks in node (no GPU). The volume itself
// (holes, watertightness, the flank) is checked in cave-volume.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { buildCaveTerrainMesh } from '../src/client/world/caveTerrain.js';
import { visFromDistance } from '../src/client/world/caveSky.js';

const LEVEL = 3;
const cache = new Map();
function island(variant) {
  if (!cache.has(variant)) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    cache.set(variant, { variant, terrain, layout, plan: terrain.plan, mesh: null });
  }
  return cache.get(variant);
}
/** the terrain mesh (volume included) of a variant: ~6 s, built on demand */
function meshed(variant) {
  const it = island(variant);
  it.mesh ??= buildCaveTerrainMesh(it.terrain, it.layout);
  return it;
}
// (the fixed map first, then a few more)
// (the fixed map and three more: each variant is a ~3 s Terrain build plus a ~6 s mesh build, more under c8)
const VARIANTS = [...new Set([levelDef(3).variant, 1, 2, 3])];

test('no cave dressing outside the cave: everything stands under a roof, inside the mountain', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan, layout } = island(variant);
    const D = plan.cave.depthAt;
    const d = layout.caveDecor;
    for (const kind of ['stalactites', 'stalagmites', 'columns', 'crystals']) {
      assert.ok(d[kind].length > 0, `${kind} exist`);
      for (const c of d[kind]) {
        assert.ok(Number.isFinite(terrain.ceilingAt(c.x, c.z)), `variant ${variant}: ${kind} at (${c.x.toFixed(0)}, ${c.z.toFixed(0)}) is under a roof`);
        assert.ok(D(c.x, c.z) > 8, `variant ${variant}: ${kind} inside the mountain`);
      }
    }
    for (const l of layout.caveLights.filter((x) => x.kind !== 'daylight')) assert.ok(Number.isFinite(terrain.ceilingAt(l.x, l.z)) || l.kind === 'relic', `variant ${variant}: ${l.kind} light under a roof`);
  }
});

test('other levels have no cave data at all', () => {
  for (const level of [0, 1, 2]) {
    const layout = buildLayout(new Terrain(planIsland(level, 1)));
    assert.equal(layout.caveDecor, null);
    assert.equal(layout.caveLights.length, 0);
  }
});

test('the two coves are small: room for the camp and the boat, no more', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan } = island(variant);
    let west = 0, east = 0;
    for (let j = 0; j <= terrain.n; j++) for (let i = 0; i <= terrain.n; i++) {
      if (terrain.h(i, j) <= 0.3) continue;
      const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
      if (plan.cave.depthAt(x, z) > 0) continue;
      if (x < 0) west++; else east++;
    }
    const area = terrain.cell * terrain.cell;
    assert.ok(west * area < 9000 && east * area < 9000, `variant ${variant}: beaches ${(west * area) | 0} / ${(east * area) | 0} m2`);
    assert.ok(west * area > 2500 && east * area > 2500, `variant ${variant}: still room for hut and boat`);
  }
});

test('sky visibility: 1 at the openings, nearly 0 a few metres inside, falling smoothly', () => {
  assert.equal(visFromDistance(0), 1);
  assert.ok(visFromDistance(6) < 0.4);
  assert.ok(visFromDistance(14) < 0.01);
  let prev = 1;
  for (let d = 0; d <= 16; d += 0.5) { const v = visFromDistance(d); assert.ok(v <= prev + 1e-9); prev = v; }
  for (const variant of [1, 2]) {
    const { mesh, layout, plan } = meshed(variant);
    const sky = mesh.userData.sky;
    // outside: full sky; the entrance hall's centre (a long way in): dark; the sky above the roof: full
    assert.equal(sky.visAt(layout.spawnPoints[0].x, 5, layout.spawnPoints[0].z), 1);
    const hall = plan.cave.maze.nodes[0];
    assert.ok(sky.visAt(hall.x, 3, hall.z) < 0.02, 'the hall is dark');
    assert.equal(sky.visAt(hall.x, 300, hall.z), 1, 'above the mountain the sky is open');
    for (const m of [layout.caveEntrance, layout.caveExit]) assert.ok(sky.visAt(m.x, m.y + 2, m.z) > 0.9, 'daylight at the mouth');
  }
});

test('the terrain mesh hands over to the volume: no cell drawn twice, the volume in its own child, no old shell or roof', () => {
  const { terrain, mesh } = meshed(VARIANTS[0]);
  assert.equal(mesh.children.some((c) => c.name === 'cave-shell'), false);
  const group = mesh.children.find((c) => c.name === 'cave-volume');
  assert.ok(group && group.children.length > 100, 'the volume is chunked for culling');
  const tris = group.children.reduce((a, c) => a + c.geometry.index.count / 3, 0);
  assert.equal(tris, mesh.userData.volumeStats.triangles);
  // the heightfield keeps only the cells beside the volume (the sea floor): far fewer than the whole grid
  assert.ok(mesh.geometry.index.count / 6 < terrain.n * terrain.n * 0.6, 'the covered cells are dropped');
  assert.ok(mesh.geometry.index.count > 0);
  for (const c of group.children) {
    assert.ok(c.geometry.attributes.normal && c.geometry.attributes.color && c.geometry.attributes.surface && c.geometry.attributes.surface2);
    assert.equal(c.material, mesh.userData.caveMats.volume);
  }
});
