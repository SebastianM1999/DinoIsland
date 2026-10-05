// Map design rules (see .claude/skills/map-design-rules/SKILL.md), checked over
// many generated islands of both levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland, CAVES_ENABLED, riverQuery } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { TRUNKS } from '../src/shared/treeShapes.js';
import { CONFIG } from '../src/shared/config.js';

const islands = [];
for (const level of [0, 1, 2]) {
  for (let variant = 1; variant <= 16; variant++) {
    const terrain = new Terrain(planIsland(level, variant));
    islands.push({ level, variant, terrain, plan: terrain.plan, layout: buildLayout(terrain) });
  }
}

test('rivers flow downhill and always have higher ground on both sides', () => {
  for (const { plan, terrain, level, variant } of islands) {
   // every flow (the volcano has several lava flows; its crater moat is a ring at one level)
   // (not the volcano path's lava fields: their lower edge is a narrow lip, drawn narrow – volcano.test.js)
   for (const flow of plan.flows.filter((f) => !f.ring && !f.field)) {
    const pts = flow.pts;
    for (let i = 1; i < pts.length - 1; i++) {
      assert.ok(pts[i].y <= pts[i - 1].y + 1e-6, `L${level} v${variant}: river rises at ${i}`);
      if (pts[i].y < 0.4) continue;                       // the mouth at sea level
      const dx = pts[i + 1].x - pts[i - 1].x, dz = pts[i + 1].z - pts[i - 1].z, l = Math.hypot(dx, dz);
      for (const s of [-1, 1]) {
        const d = pts[i].w / 2 + 2.5;
        const x = pts[i].x - (dz / l) * d * s, z = pts[i].z + (dx / l) * d * s;
        // At the outlet, a river's nominal bank can still be inside the lake.
        if (plan.pools.some(p => p.kind === 'water' && Math.hypot(x - p.x, z - p.z) < p.r)) {
          assert.ok(terrain.inlandWaterLevelAt(x, z) !== null, 'lake reaches the river outlet');
          continue;
        }
        // (under a basalt bridge the lava runs covered)
        if ((plan.bridges || []).some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 5)) continue;
        const g = terrain.heightAt(x, z);
        // (a lava flow drops steeply down the volcano's flank: its bank is measured
        // against the lava right beside it, lower than this point's own surface – and
        // beside such a narrow, steep channel the 2.7 m terrain grid dips a little toward its bed)
        const lava = flow.kind === 'lava';
        const beside = lava ? riverQuery(plan, x, z, 12, 'lava')?.surface ?? pts[i].y : pts[i].y;
        assert.ok(g > Math.min(pts[i].y, beside) - (lava ? 0.35 : 0), `L${level} v${variant}: bank below water at ${i}`);
      }
    }
   }
  }
});

test('waterfalls spring from a cliff face, not from the mountain top', () => {
  for (const { layout, terrain } of islands) {
    for (const wf of layout.waterfalls) {
      assert.ok(wf.source, 'waterfall has a spring source');
      // rock rises above the spring (it is in the face, not on the top)
      const behind = terrain.heightAt(wf.source.x - wf.dirX * 6, wf.source.z - wf.dirZ * 6);
      assert.ok(behind > wf.source.y + 1, 'cliff continues above the spring');
      assert.ok(wf.source.y > wf.bottom.y + 2, 'spring is above the pool');
    }
  }
});

test('first-island waterfall stays central and faces the western spawn across variants', () => {
  for (const { level, variant, plan, layout, terrain } of islands) {
    if (level !== 0) continue;
    const wf = layout.waterfall;
    assert.ok(wf, `variant ${variant}: waterfall exists`);
    assert.ok(Math.abs(wf.top.x / plan.A + 0.12) < 1e-6, `variant ${variant}: central longitude`);
    assert.ok(Math.abs(wf.top.z) < 1e-6, `variant ${variant}: central latitude`);
    assert.equal(wf.dirX, -1);
    assert.equal(Math.abs(wf.dirZ), 0);
    assert.equal(wf.vertical, true);
    assert.equal(wf.impact.x, wf.top.x);
    assert.equal(wf.impact.z, wf.top.z);
    assert.ok(wf.pool.x < wf.top.x && plan.hut.x < wf.pool.x);
    assert.ok(plan.mainPeak.x > wf.source.x);
    assert.ok(Math.abs(wf.pool.r - 14 * Math.max(0.8, plan.k)) < 1e-6);
    assert.ok(terrain.waterDepthAt(wf.impact.x, wf.impact.z) > 0.45);
  }
});

test('first island has four separated raptor territories and keeps three pteranodons', () => {
  for (const { level, variant, layout } of islands) {
    if (level !== 0) continue;
    assert.equal(layout.level.dinos.ptera, 3);
    const zones = layout.dinoZones.raptor;
    assert.equal(zones.length, 4, `variant ${variant}: four packs`);
    assert.equal(zones.reduce((n, z) => n + z.size, 0), 11);
    for (let i = 0; i < zones.length; i++) {
      for (let j = 0; j < i; j++) {
        assert.ok(Math.hypot(zones[i].x - zones[j].x, zones[i].z - zones[j].z) >= 48, `variant ${variant}: packs ${i}/${j} have separate territory`);
      }
    }
  }
});

test('caves sit in the flank of a hill or mountain', { skip: !CAVES_ENABLED && 'caves are disabled for now' }, () => {
  let caves = 0, hosted = 0;
  for (const { plan, terrain } of islands) {
    for (const c of plan.sites.caves) {
      caves++;
      // ground behind the cave (opposite the entrance) rises
      const bx = c.x + Math.sin(c.rot) * 9, bz = c.z + Math.cos(c.rot) * 9;
      if (c.host != null && terrain.heightAt(bx, bz) > c.y + 2) hosted++;
    }
  }
  assert.ok(hosted / caves > 0.8, `${hosted}/${caves} caves embedded in a slope`);
});

test('trees never float above sloped ground', () => {
  for (const { layout, terrain } of islands) {
    for (const t of layout.trees) {
      const shape = TRUNKS[t.type][t.id % TRUNKS[t.type].length];
      const r = shape.r(0) * t.scale;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const g = terrain.heightAt(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r);
        assert.ok(t.y - t.sink <= g + 0.02, `${t.type} ${t.id} floats`);
      }
    }
  }
});

test('boat parts are dry, reachable and not covered by plants', () => {
  for (const { layout, terrain } of islands) {
    for (const r of layout.relics) {
      assert.equal(terrain.waterDepthAt(r.x, r.z), 0);
      assert.equal(terrain.lavaLevelAt(r.x, r.z), null);
      assert.ok(!layout.trees.some((t) => Math.hypot(t.x - r.x, t.z - r.z) < 2.5), `${r.kind} under a tree`);
      assert.ok(!layout.bushes.some((b) => Math.hypot(b.x - r.x, b.z - r.z) < 2), `${r.kind} under a bush`);
    }
  }
});

test('mountain paths are walkable from the foot to the top', () => {
  for (const { plan, terrain, level, variant } of islands) {
    for (const r of plan.ramps) {
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i];
        const s = Math.abs(terrain.heightAt(b.x, b.z) - terrain.heightAt(a.x, a.z)) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
        assert.ok(s <= CONFIG.player.maxWalkSlope + 0.35, `L${level} v${variant}: path on hill ${r.hill} too steep at ${i} (${s.toFixed(2)})`);
      }
    }
  }
});

test('rocks sit on the ground and nothing grows on the paths', () => {
  let floating = 0, rocks = 0;
  for (const { layout, terrain } of islands) {
    for (const r of layout.rocks) {
      rocks++;
      let lo = Infinity;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        lo = Math.min(lo, terrain.heightAt(r.x + Math.cos(a) * r.R * 0.85, r.z + Math.sin(a) * r.R * 0.85));
      }
      if (r.by > lo + 0.1) floating++;
    }
    for (const t of layout.trees) assert.ok(layout.distToPath(t.x, t.z) > 1.8, `${t.type} on a path`);
  }
  assert.ok(floating / rocks < 0.002, `${floating}/${rocks} rocks float`);
});
