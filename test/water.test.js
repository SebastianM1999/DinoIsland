// Water sources: every waterfall is one unbroken chain – grotto (source) ->
// fall / cascade down the cliff -> impact in the basin -> river out of it –
// and its water never ends in the hillside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { buildWater } from '../src/client/world/water.js';
import { SPRING_LIP_OFFSET, SPRING_FLOOR, SPRING_WATER_OFFSET } from '../src/shared/springShape.js';

const islands = [];
for (const [lv, v] of Array.from({ length: 16 }, (_, i) => [0, i + 1]).concat([[1, 1], [1, 2]])) {
  const terrain = new Terrain(planIsland(lv, v));
  islands.push({ name: `island ${lv + 1}/${v}`, terrain, layout: buildLayout(terrain) });
}

test('every waterfall lands in water: its impact point lies in the basin, not on the bank', () => {
  let falls = 0;
  for (const { name, terrain, layout } of islands) {
    for (const wf of layout.waterfalls) {
      if (wf.kind === 'lava') continue;
      falls++;
      const { impact } = wf;
      assert.ok(impact, `${name}: impact point`);
      const level = terrain.waterLevelAt(impact.x, impact.z);
      assert.ok(level !== null, `${name}: water at the impact`);
      assert.ok(level - terrain.heightAt(impact.x, impact.z) > 0.4, `${name}: deep enough to plunge into`);
      assert.ok(Math.abs(level - impact.y) < 0.05, `${name}: impact at the water surface`);
      assert.ok(wf.plunge?.r > 1 && wf.plunge.r < wf.pool.r, `${name}: plunge sized to its basin`);
      // the basin is open water all over (no dry hump where the river's levee used to be)
      // (towards its rim the cliff foot may reach into it a little)
      let rimWet = 0;
      for (let a = 0; a < 24; a++) {
        for (const f of [0, 0.35, 0.7]) {
          const x = wf.pool.x + Math.cos((a / 24) * Math.PI * 2) * wf.pool.r * f, z = wf.pool.z + Math.sin((a / 24) * Math.PI * 2) * wf.pool.r * f;
          const wet = terrain.waterLevelAt(x, z) !== null;
          if (f < 0.5) assert.ok(wet, `${name}: dry spot in the basin at ${f} r`);
          else if (wet) rimWet++;
        }
      }
      assert.ok(rimWet >= 18, `${name}: the basin's outer part is mostly water (${rimWet}/24)`);
      // the basin overflows into the river
      const river = layout.rivers.find((r) => r.kind === 'water');
      assert.ok(river && Math.hypot(river.pts[0].x - wf.pool.x, river.pts[0].z - wf.pool.z) < wf.pool.r + 2, `${name}: a river leaves the basin`);
      // nothing grows on the water's way down
      for (const t of layout.trees) {
        const vx = wf.impact.x - wf.top.x, vz = wf.impact.z - wf.top.z;
        const u = wf.vertical ? 0 : Math.max(0, Math.min(1, ((t.x - wf.top.x) * vx + (t.z - wf.top.z) * vz) / (vx * vx + vz * vz)));
        assert.ok(Math.hypot(wf.top.x + vx * u - t.x, wf.top.z + vz * u - t.z) > wf.width / 2 + 0.5, `${name}: tree in the waterfall`);
      }
    }
  }
  assert.ok(falls >= 8, `checked ${falls} waterfalls`);
});

test('the waterfall sheet follows the cliff down into the basin and never cuts into the ground', () => {
  for (const { name, terrain, layout } of islands) {
    if (!layout.waterfalls.length) continue;
    const water = buildWater(terrain, layout);
    const sheets = water.group.children.filter((m) => m.name === 'waterfall');
    assert.equal(sheets.length, layout.waterfalls.length, `${name}: one sheet per fall`);
    for (const [k, sheet] of sheets.entries()) {
      const wf = layout.waterfalls[k];
      assert.equal(wf.vertical, true, `${name}: straight vertical waterfall`);
      assert.equal(wf.impact.x, wf.top.x, `${name}: impact directly below source x`);
      assert.equal(wf.impact.z, wf.top.z, `${name}: impact directly below source z`);
      const pos = sheet.geometry.attributes.position;
      const fall = sheet.geometry.attributes.aFall;
      assert.ok(Math.abs(wf.top.x - (wf.source.x + wf.dirX * SPRING_LIP_OFFSET)) < 1e-6, `${name}: lip x follows grotto`);
      assert.ok(Math.abs(wf.top.z - (wf.source.z + wf.dirZ * SPRING_LIP_OFFSET)) < 1e-6, `${name}: lip z follows grotto`);
      assert.ok(Math.abs(wf.top.y - wf.source.y - SPRING_FLOOR) < 1e-6, `${name}: lip height follows grotto`);
      for (let j = 0; j < 9; j++) {
        assert.ok(Math.abs(pos.getY(j) - wf.top.y - SPRING_WATER_OFFSET) < 1e-5, `${name}: sheet starts at the grotto stream, vertex ${j}`);
        assert.ok(Math.abs((pos.getX(j) - wf.top.x) * wf.dirX + (pos.getZ(j) - wf.top.z) * wf.dirZ) < 1e-5, `${name}: sheet starts at the lip, vertex ${j}`);
      }
      let lastRow = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        assert.equal(fall.getZ(i), 0, `${name}: free-falling water never uses rock-contact foam`);
        assert.ok(Math.abs((x - wf.top.x) * wf.dirX + (z - wf.top.z) * wf.dirZ) < 1e-5, `${name}: vertex ${i} stays in the vertical fall plane`);
        assert.ok(terrain.waterDepthAt(x, z) > 0.4, `${name}: entire fall is over the pool, vertex ${i}`);
        // above the rock (a hair of tolerance for the grid's triangles), or on the water
        assert.ok(y >= terrain.heightAt(x, z) + 0.02 || y >= wf.impact.y, `${name}: vertex ${i} inside the cliff`);
        // the middle of the last row: right in the plunge, at the water surface
        if (fall.getX(i) > 0.999 && i % 9 === 4) {
          lastRow++;
          assert.ok(Math.abs(y - (wf.impact.y + 0.02)) < 0.01, `${name}: ends at the water surface`);
          assert.ok(terrain.waterLevelAt(x, z) !== null, `${name}: ends in the water`);
        }
      }
      assert.ok(lastRow > 0, `${name}: has a last row`);
    }
  }
});
