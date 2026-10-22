import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { makeRng } from '../src/shared/rng.js';
import { occluderBlocked, occluderBlockedSlow, occluderGrid } from '../src/shared/visibility.js';

/** Random segments over the island: short and long, flat and steep, many crossing tree and rock clusters. */
function segments(layout, rng, n) {
  const out = [];
  const anchors = [...layout.trees, ...layout.rocks];
  for (let i = 0; i < n; i++) {
    const a = rng.pick(anchors), len = rng.range(0.5, 60), ang = rng.range(0, Math.PI * 2);
    const ax = a.x + rng.range(-6, 6), az = a.z + rng.range(-6, 6);
    const ay = (a.y ?? a.by ?? 0) + rng.range(-1, 8);
    out.push([{ x: ax, y: ay, z: az }, { x: ax + Math.cos(ang) * len, y: ay + rng.range(-6, 6), z: az + Math.sin(ang) * len }]);
  }
  // axis-aligned lines along grid borders and through cell corners (8 m cells)
  for (let i = 0; i < 400; i++) {
    const c = Math.round(rng.range(-60, 60)) * 8, y = rng.range(0, 12);
    out.push(i % 2 ? [{ x: c, y, z: c - 40 }, { x: c, y, z: c + 40 }] : [{ x: c - 30, y, z: c - 30 }, { x: c + 30, y, z: c + 30 }]);
  }
  return out;
}

for (const level of [0, 1, 2, 3]) {
  test(`the occluder grid answers exactly like the brute-force check on island ${level + 1}`, () => {
    const layout = buildLayout(new Terrain(planIsland(level, levelDef(level).variant)));
    const rng = makeRng(1234 + level);
    let blocked = 0;
    for (const [a, b] of segments(layout, rng, 4000)) {
      const slow = occluderBlockedSlow(a, b, layout);
      assert.equal(occluderBlocked(a, b, layout), slow, `segment ${JSON.stringify([a, b])}`);
      if (slow) blocked++;
    }
    assert.ok(blocked > 200, `the sample must hit occluders (${blocked})`);
    assert.equal(occluderGrid(layout), occluderGrid(layout), 'built once per layout');
    assert.ok(!Object.keys(layout).includes('occluders'), 'the cache never travels with the layout');
  });
}
