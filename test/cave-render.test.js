// Hollow Mountain, the parts the player sees: the closed mountain (shell over every tunnel), the sky
// light field, no cave dressing outside the cave, small coves. Pure geometry checks in node (no GPU).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { caveRockTop } from '../src/shared/caveField.js';
import { buildCaveTerrainMesh } from '../src/client/world/caveTerrain.js';
import { ARCH_DEPTH, visFromDistance } from '../src/client/world/caveSky.js';

const LEVEL = 3;
const cache = new Map();
function island(variant) {
  if (!cache.has(variant)) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    cache.set(variant, { variant, terrain, layout, plan: terrain.plan, mesh: null });
  }
  const it = cache.get(variant);
  it.mesh ??= buildCaveTerrainMesh(it.terrain, it.layout);
  return it;
}
const VARIANTS = [1, 2, 3, 4, 5, 6];

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

test('the mountain is closed: a skin at the rock height over every cell that touches a tunnel or chamber', () => {
  for (const variant of VARIANTS.slice(0, 3)) {
    const { terrain, plan, mesh } = island(variant);
    const shell = mesh.children.find((c) => c.name === 'cave-shell');
    assert.ok(shell, 'shell exists');
    const covered = new Set(shell.userData.cells.map(([i, j]) => j * terrain.n + i));
    const n1 = terrain.n + 1;
    const depth = (i, j) => plan.cave.depthAt(-terrain.half + i * terrain.cell, -terrain.half + j * terrain.cell);
    const top = (i, j) => caveRockTop(plan, -terrain.half + i * terrain.cell, -terrain.half + j * terrain.cell);
    const sky = mesh.userData.sky;
    let open = 0;
    for (let j = 0; j < terrain.n; j++) {
      for (let i = 0; i < terrain.n; i++) {
        const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
        if (corners.some(([a, b]) => sky.depth[b * n1 + a] <= ARCH_DEPTH + 2)) continue;   // the mouths' first metres: the arch (below)
        if (!corners.some(([a, b]) => terrain.h(a, b) < top(a, b) - 1)) continue;          // solid rock
        if (corners.every(([a, b]) => terrain.h(a, b) >= sky.roof[b * n1 + a] + 0.3)) continue;   // the ground itself is a closed skin above the roof there
        open++;
        assert.ok(covered.has(j * terrain.n + i), `variant ${variant}: open cell (${i}, ${j}) under the sky`);
      }
    }
    assert.ok(open > 500, 'a real maze');
    // the only cells under the open sky inside the mountain lie in front of the mouths (entrance, exit, false exits)
    const mouths = [plan.cave.entrance, plan.cave.exit, ...plan.cave.maze.falseExits];
    for (let j = 0; j < terrain.n; j++) {
      for (let i = 0; i < terrain.n; i++) {
        const d = depth(i, j);
        if (d <= 0.5 || d > ARCH_DEPTH + 2) continue;
        if (covered.has(j * terrain.n + i)) continue;
        if (terrain.h(i, j) >= top(i, j) - 3) continue;
        const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
        assert.ok(mouths.some((m) => Math.hypot(m.x - x, m.z - z) < 40), `variant ${variant}: an uncovered opening at (${x.toFixed(0)}, ${z.toFixed(0)}) away from every mouth`);
      }
    }
  }
});

test('sky visibility: 1 at the openings, nearly 0 a few metres inside, falling smoothly', () => {
  assert.equal(visFromDistance(0), 1);
  assert.ok(visFromDistance(6) < 0.4);
  assert.ok(visFromDistance(14) < 0.01);
  let prev = 1;
  for (let d = 0; d <= 16; d += 0.5) { const v = visFromDistance(d); assert.ok(v <= prev + 1e-9); prev = v; }
  for (const variant of [1, 2]) {
    const { mesh, layout, plan } = island(variant);
    const sky = mesh.userData.sky;
    // outside: full sky; the entrance hall's centre (a long way in): dark; the sky above the roof: full
    assert.equal(sky.visAt(layout.spawnPoints[0].x, 5, layout.spawnPoints[0].z), 1);
    const hall = plan.cave.maze.nodes[0];
    assert.ok(sky.visAt(hall.x, 3, hall.z) < 0.02, 'the hall is dark');
    assert.equal(sky.visAt(hall.x, 300, hall.z), 1, 'above the mountain the sky is open');
    for (const m of [layout.caveEntrance, layout.caveExit]) assert.ok(sky.visAt(m.x, m.y + 2, m.z) > 0.9, 'daylight at the mouth');
  }
});

test('the roof only spans tunnels and chambers (never pokes out of the flank), and nothing over low ground is left open', async () => {
  const { roofCells } = await import('../src/client/world/caveMesh.js');
  for (const variant of [1, 2, 3]) {
    const { terrain, plan, mesh } = island(variant);
    const sky = mesh.userData.sky, n = terrain.n, n1 = n + 1, half = terrain.half, cell = terrain.cell;
    const shell = mesh.children.find((c) => c.name === 'cave-shell');
    const sh = new Set(shell.userData.cells.map(([i, j]) => j * n + i)), rf = new Set(roofCells(terrain, sky));
    for (const c of rf) {
      const i = c % n, j = (c / n) | 0;
      assert.ok([j * n1 + i, j * n1 + i + 1, (j + 1) * n1 + i, (j + 1) * n1 + i + 1].some((k) => sky.open[k]), `variant ${variant}: roof cell (${i}, ${j}) outside every tunnel`);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cs = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      if (cs.some(([a, b]) => sky.depth[b * n1 + a] <= 0.5)) continue;
      if (!cs.some(([a, b]) => terrain.h(a, b) < caveRockTop(plan, -half + a * cell, -half + b * cell) - 2)) continue;
      assert.ok(sh.has(j * n + i) || rf.has(j * n + i), `variant ${variant}: open cell (${i}, ${j}) without roof or shell`);
    }
  }
});
