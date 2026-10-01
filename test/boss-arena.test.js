// The Boss Arena on the first island: a lava islet beside the boat with a
// causeway across the lava and a fixed boss spawn point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { causewayQuery, insideBossArena, BOSS_ARENA } from '../src/shared/bossArena.js';
import { PlayerController } from '../src/client/player/controller.js';

const DT = 1 / 60;
const variants = [1, 2, 3, 4, 5];
const islands = variants.map((v) => {
  const terrain = new Terrain(planIsland(0, v));
  return { v, terrain, layout: buildLayout(terrain) };
});

test('the first island has a boss arena beside the boat; the volcano island has none', () => {
  for (const { v, layout } of islands) assert.ok(layout.bossArena, `variant ${v}`);
  for (const v of [1, 2]) assert.equal(planIsland(1, v).bossArena, undefined, `island 2 variant ${v}`);
});

test('the boss spawn point is fixed relative to the boat, on dry flat ground in the arena', () => {
  let offset = null;
  for (const { v, terrain, layout } of islands) {
    const a = layout.bossArena, b = layout.boat, s = a.spawn;
    // same offset from the boat every time (up to the side it is mirrored to)
    const off = [Math.round((s.x - b.x) * 100), Math.round((s.z - b.z) * a.side * 100)];
    if (offset) assert.deepEqual(off, offset, `variant ${v}: spawn offset`);
    offset = off;
    assert.equal(terrain.lavaLevelAt(s.x, s.z), null, `variant ${v}: no lava at the spawn`);
    assert.equal(terrain.waterLevelAt(s.x, s.z), null, `variant ${v}: dry`);
    assert.ok(terrain.slopeAt(s.x, s.z) < 0.3, `variant ${v}: flat`);
    assert.ok(Math.abs(s.y - (BOSS_ARENA.lavaLevel + BOSS_ARENA.plateauRise)) < 0.3, `variant ${v}: on the plateau`);
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      assert.equal(terrain.lavaLevelAt(s.x + Math.cos(ang) * 4, s.z + Math.sin(ang) * 4), null, `variant ${v}: room around the spawn`);
    }
  }
});

test('the causeway runs out over the sea, then across the lava: dry on top, sea and lava beside', () => {
  for (const { v, terrain, layout } of islands) {
    const a = layout.bossArena;
    let lavaBeside = 0, lavaN = 0, seaBeside = 0, seaN = 0;
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, k = t * (a.path.length - 1), j = Math.min(a.path.length - 2, Math.floor(k)), f = k - j;
      const p = { x: a.path[j].x + (a.path[j + 1].x - a.path[j].x) * f, z: a.path[j].z + (a.path[j + 1].z - a.path[j].z) * f };
      assert.equal(terrain.lavaLevelAt(p.x, p.z), null, `variant ${v}: causeway free of lava at t=${t.toFixed(2)}`);
      assert.equal(terrain.waterLevelAt(p.x, p.z), null, `variant ${v}: causeway above the sea at t=${t.toFixed(2)}`);
      const dc = Math.hypot(p.x - a.center.x, p.z - a.center.z), dp = Math.hypot(p.x - a.plateau.x, p.z - a.plateau.z);
      for (const s of [-1, 1]) {
        const x = p.x + a.v.x * s * 8, z = p.z + a.v.z * s * 8;
        if (dc < a.lakeR - 6 && dp > a.plateauR + 6) { lavaN++; if (terrain.lavaLevelAt(x, z) !== null) lavaBeside++; }
        if (dc > a.outerR + 14) { seaN++; if (terrain.seaDepthAt(x, z) > 0) seaBeside++; }
      }
    }
    assert.ok(lavaN > 10 && lavaBeside / lavaN > 0.9, `variant ${v}: lava beside the causeway (${lavaBeside}/${lavaN})`);
    assert.ok(seaN > 6 && seaBeside / seaN > 0.6, `variant ${v}: open sea between island and islet (${seaBeside}/${seaN})`);
  }
});

test('the giant lives on the arena plateau: its pen (the old grove) is the plateau, not a spot on the island', () => {
  for (const { v, terrain, layout } of islands) {
    const a = layout.bossArena, g = layout.grove;
    assert.ok(g, `variant ${v}: pen exists`);
    assert.ok(Math.hypot(g.x - a.plateau.x, g.z - a.plateau.z) < 1e-6 && g.r === a.plateauR, `variant ${v}: pen = plateau`);
    assert.ok(Math.hypot(a.spawn.x - g.x, a.spawn.z - g.z) < 1e-6, `variant ${v}: the giant spawns at the fixed spawn point`);
    // the island itself is clear: far out to sea from the nearest island land
    const plan = layout.plan;
    assert.ok((g.x / plan.A) ** 2 + (g.z / plan.B) ** 2 > 1.5, `variant ${v}: pen is off the island`);
    // dry plateau all round the giant's leash
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      for (const f of [0.3, 0.6, 0.9]) {
        const x = g.x + Math.cos(ang) * g.r * f, z = g.z + Math.sin(ang) * g.r * f;
        assert.equal(terrain.lavaLevelAt(x, z), null, `variant ${v}: plateau dry`);
      }
    }
  }
});

test('a player walks from the boat over the causeway to the spawn point without touching lava', () => {
  for (const { v, terrain, layout } of islands) {
    const a = layout.bossArena, b = layout.boat;
    // from the beach beside the boat (clear of its hull) up through the gate
    const route = [{ x: b.x + (a.start.x - b.x) * 0.6, z: b.z + (a.start.z - b.z) * 0.6 }, ...a.path, a.spawn];
    const pc = new PlayerController(terrain, layout.playerColliders, layout.rockSurfaceAt);
    pc.teleport(b.x + (a.start.x - b.x) * 0.35, b.z + (a.start.z - b.z) * 0.35, 0);
    let wp = 0, burnt = 0, reached = false;
    for (let t = 0; t < 40 && !reached; t += DT) {
      const w = route[wp];
      const dx = w.x - pc.pos.x, dz = w.z - pc.pos.z;
      if (Math.hypot(dx, dz) < (wp === route.length - 1 ? 1.5 : 2.5)) {
        if (wp === route.length - 1) { reached = true; break; }
        wp++;
        continue;
      }
      pc.yaw = Math.atan2(-dx, -dz);
      pc.update(DT, { forward: true });
      if (terrain.lavaLevelAt(pc.pos.x, pc.pos.z) !== null) burnt++;
    }
    assert.ok(reached, `variant ${v}: reached the spawn (stuck at waypoint ${wp}/${route.length - 1}, at ${pc.pos.x.toFixed(1)},${pc.pos.z.toFixed(1)})`);
    assert.equal(burnt, 0, `variant ${v}: never stepped into lava`);
  }
});

test('nothing grows on the islet or the causeway, and its props keep the causeway free', () => {
  for (const { v, layout } of islands) {
    const a = layout.bossArena;
    const onIslet = (o) => insideBossArena(layout, o.x, o.z) || causewayQuery(a, o.x, o.z).d < a.causewayW / 2 + 1;
    assert.ok(!layout.trees.some(onIslet), `variant ${v}: trees`);
    assert.ok(!layout.rocks.some(onIslet), `variant ${v}: rocks`);
    assert.ok(!layout.logs.some(onIslet), `variant ${v}: fallen trees`);
    assert.ok(!layout.seaStacks.some((s) => insideBossArena(layout, s.x, s.z, s.radius)), `variant ${v}: sea stacks`);
    // the causeway itself is clear of the arena's own props
    for (const c of layout.playerColliders.circles) {
      if (c.kind !== 'boss' || c.stand) continue;
      assert.ok(causewayQuery(a, c.x, c.z).d > a.causewayW / 2 + c.r - 0.05, `variant ${v}: prop on the causeway`);
    }
  }
});
