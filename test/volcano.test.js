// Ashfall Isle (island 3): the round caldera island – its shape and size, the
// path up the volcano through the notch, the crater arena, the lava flows with
// their basalt bridges and vent cones, small lava craters, hot ground, the eruption cycle and ash rain
// (shared/island.js, shared/volcanoArena.js, shared/terrain.js, sim/volcano.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { EV, MSG } from '../src/shared/protocol.js';
import { resolveCircle } from '../src/shared/collision.js';
import { VOLCANO_ARENA, insideVolcanoArena, columnTop, columnCycle } from '../src/shared/volcanoArena.js';

const VARIANTS = [1, 2, 3, 4, 5, 6];
const islands = VARIANTS.map((variant) => {
  const terrain = new Terrain(planIsland(2, variant));
  return { variant, terrain, plan: terrain.plan, layout: buildLayout(terrain) };
});
const landArea = (t) => { let n = 0; for (const h of t.heights) if (h > 0) n++; return n * t.cell * t.cell; };

test('the volcano island is round, about 1.3 times the swamp, with the caldera in the middle', () => {
  const swamp = [1, 2, 3].map((v) => landArea(new Terrain(planIsland(1, v))));
  const meanSwamp = swamp.reduce((a, b) => a + b) / swamp.length;
  const areas = islands.map(({ terrain }) => landArea(terrain));
  const mean = areas.reduce((a, b) => a + b) / areas.length;
  assert.ok(Math.abs(mean / meanSwamp - 1.3) < 0.13, `land ${Math.round(mean)} m² vs swamp ${Math.round(meanSwamp)} m² (${(mean / meanSwamp).toFixed(2)}×)`);
  for (const { plan, terrain, variant } of islands) {
    assert.equal(plan.shape, 'round');
    assert.equal(plan.A, plan.B, `v${variant}: round`);
    const v = plan.volcano;
    assert.equal(Math.hypot(v.x, v.z), 0, 'the caldera stands in the middle');
    // the rim towers over the island; the floor lies well below it
    let rim = 0;
    for (let k = 0; k < 24; k++) rim = Math.max(rim, terrain.heightAt(Math.cos(k / 24 * Math.PI * 2) * v.craterR, Math.sin(k / 24 * Math.PI * 2) * v.craterR));
    assert.ok(rim > 55, `v${variant}: rim ${rim.toFixed(1)} m`);
    assert.ok(rim - terrain.heightAt(0, 0) > 9, `v${variant}: crater floor sunk below the rim`);
    // hut and boat on the beach, west and east
    assert.ok(plan.hut.x < -plan.A * 0.7 && plan.boat.x > plan.A * 0.8);
  }
});

test('one path winds up the volcano and in through the notch onto the crater floor', () => {
  for (const { plan, terrain, layout, variant } of islands) {
    const climb = plan.ramps.filter((r) => r.caldera);
    assert.equal(climb.length, 1, `v${variant}: one caldera path`);
    const pts = climb[0].pts;
    const end = pts.at(-1), v = plan.volcano;
    assert.ok(Math.hypot(end.x - v.x, end.z - v.z) < VOLCANO_ARENA.r, `v${variant}: it ends on the arena floor`);
    // walkable all the way: no lava on it (bridges carry it over the flows, or stepping
    // stones at a ford), never too steep
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (atFord(plan, b.x, b.z)) continue;
      assert.equal(terrain.lavaLevelAt(b.x, b.z), null, `v${variant}: lava on the path at ${i}`);
      const s = Math.abs(terrain.heightAt(b.x, b.z) - terrain.heightAt(a.x, a.z)) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
      assert.ok(s < 0.6, `v${variant}: path too steep at ${i} (${s.toFixed(2)})`);
    }
    // the inner crater wall is too steep to climb anywhere but at the notch
    const g = layout.volcanoArena.gates[0].angle;
    let wall = 0, steep = 0;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.45) continue;
      wall++;
      const r = (VOLCANO_ARENA.floorR + VOLCANO_ARENA.craterR) / 2;
      if (terrain.slopeAt(v.x + Math.cos(a) * r, v.z + Math.sin(a) * r) > CONFIG.player.maxWalkSlope) steep++;
    }
    assert.ok(steep / wall > 0.85, `v${variant}: the crater wall is a wall (${steep}/${wall} steep)`);
  }
});

/** On one of the mountain path's lava fields (the jump and runs), where its walkway is lava. */
const atFord = (plan, x, z) => plan.fields.some((fd) => fd.line.some((q) => q.a > fd.a0 - 2 && q.a < fd.a1 + 2 && Math.hypot(q.x - x, q.z - z) < 9));

/** The path's points with the sideways unit vector up the volcano. */
const pathSides = (plan) => {
  const pts = plan.ramps.find((r) => r.caldera).pts, v = plan.volcano;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    let nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
    if (nx * (v.x - p.x) + nz * (v.z - p.z) < 0) { nx = -nx; nz = -nz; }
    return { ...p, nx, nz };
  });
};

test('the mountain path is short and deadly: a ridge with lava all along its upper side', () => {
  for (const { plan, terrain, variant } of islands) {
    const pts = pathSides(plan);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    assert.ok(len < 420, `v${variant}: ${len.toFixed(0)} m up`);
    // a ridge: past the walkway the lower side drops steeply, the upper side has a ditch
    let drops = 0, ditches = 0, n = 0;
    for (let i = 20; i < pts.length - 20; i += 6) {
      const p = pts[i];
      if ((p.ridge ?? 0) < 0.99 || atFord(plan, p.x, p.z)) continue;
      const y = terrain.heightAt(p.x, p.z);
      n++;
      if (terrain.heightAt(p.x - p.nx * 6, p.z - p.nz * 6) < y - 3) drops++;
      if (terrain.heightAt(p.x + p.nx * 5.3, p.z + p.nz * 5.3) < y - 1.5) ditches++;
    }
    assert.ok(n >= 5 && drops / n > 0.8 && ditches / n > 0.8, `v${variant}: ridge ${drops}/${n} drops, ${ditches}/${n} ditches`);
    // lava beside it almost all the way (but at the bridges and the last stretch into the notch)
    let side = 0, m = 0;
    for (let i = Math.floor(pts.length * 0.05); i < pts.length * 0.93; i++) {
      const p = pts[i];
      if (atFord(plan, p.x, p.z)) continue;
      m++;
      for (let o = 2; o <= 8.5; o += 0.5) if (terrain.lavaLevelAt(p.x + p.nx * o, p.z + p.nz * o) !== null) { side++; break; }
    }
    assert.ok(side / m > 0.72, `v${variant}: lava beside the path ${side}/${m}`);
    // it warms the walkway but does not burn there (most of the way)
    let hot = 0;
    for (const p of pts) if (!atFord(plan, p.x, p.z) && terrain.lavaLevelAt(p.x, p.z) === null && terrain.heatAt(p.x, p.z) >= CONFIG.volcano.heat.dmgFrom) hot++;
    assert.ok(hot < pts.length * 0.1, `v${variant}: ${hot} burning points on the walkway`);
  }
});

test('two jump and runs on the mountain path: long lava fields, no way round, varied columns a jump apart', () => {
  const jump = CONFIG.player.walkSpeed * 2 * CONFIG.player.jumpSpeed / CONFIG.player.gravity;
  const hop = CONFIG.player.jumpSpeed ** 2 / (2 * CONFIG.player.gravity);
  for (const { plan, terrain, layout, variant } of islands) {
    assert.equal(plan.fields.length, 2, `v${variant}: two lava fields`);
    const pts = pathSides(plan);
    for (const fd of plan.fields) {
      assert.ok(fd.a1 - fd.a0 >= 30, 'a long one');
      // no way round: across from the drop's edge to the ditch's wall it is all lava
      for (const q of fd.line.filter((l) => l.a > fd.a0 + 2 && l.a < fd.a1 - 2)) {
        for (let o = -2; o <= 6.5; o += 0.5) {
          const x = q.x + q.nx * o, z = q.z + q.nz * o;
          if (plan.steps.some((st) => Math.hypot(st.x - x, st.z - z) < st.r + 0.3)) continue;
          assert.notEqual(terrain.lavaLevelAt(x, z), null, `v${variant}: lava across the field (${o} m)`);
        }
      }
      // its columns, in order up the path: from the walkway's edge to the next, a jump apart
      const near = (st) => fd.line.some((q) => q.a >= fd.a0 - 1 && q.a <= fd.a1 + 1 && Math.hypot(q.x - st.x, q.z - st.z) < 9);
      const cols = plan.steps.filter(near);
      assert.ok(cols.length >= 7, `v${variant}: ${cols.length} columns`);
      const rs = cols.map((c) => c.r), tops = cols.map((c) => c.top - terrain.lavaLevelAt(c.x, c.z));
      assert.ok(Math.max(...rs) - Math.min(...rs) > 0.25 && Math.max(...tops) - Math.min(...tops) > 0.4, 'thick and thin, low and high');
      for (let k = 1; k < cols.length; k++) {
        const p = cols[k - 1], c = cols[k];
        const gap = Math.hypot(c.x - p.x, c.z - p.z) - p.r - c.r;
        assert.ok(gap > 0.8 && gap < jump * 0.85, `v${variant}: a jump to the next column (${gap.toFixed(2)} m)`);
        assert.ok(c.top - p.top < hop * 0.87, 'never too high a hop up');
        assert.notEqual(terrain.lavaLevelAt((c.x + p.x) / 2, (c.z + p.z) / 2), null, 'lava between them');
      }
      for (const c of cols) {
        assert.ok(layout.groundAt(c.x, c.z) >= c.top - 1e-6, 'one stands on a column');
        assert.ok(c.top > terrain.lavaLevelAt(c.x, c.z) + 0.7, 'above the lava (the lava burns below 0.6 m)');
      }
    }

  }
});

test('lava geysers on the path and in its fields; sinking columns; a treasure islet in the widest lava lake', () => {
  const jump = CONFIG.player.walkSpeed * 2 * CONFIG.player.jumpSpeed / CONFIG.player.gravity;
  for (const { plan, terrain, layout, variant } of islands) {
    // geysers: some on the walkway, one in each field, never on a column
    assert.ok(plan.geysers.length >= 3, `v${variant}: ${plan.geysers.length} geysers`);
    const inField = plan.geysers.filter((g) => terrain.lavaLevelAt(g.x, g.z) !== null);
    assert.ok(inField.length >= 1 && plan.geysers.length - inField.length >= 2, `v${variant}: geysers on the walkway and in the lava`);
    for (const g of plan.geysers) assert.ok(plan.steps.every((st) => Math.hypot(st.x - g.x, st.z - g.z) > st.r + g.r), 'not on a column');
    // sinking columns in every field, never the first or the last of a row
    for (const fd of plan.fields) {
      const cols = plan.steps.filter((st) => fd.line.some((q) => q.a >= fd.a0 - 1 && q.a <= fd.a1 + 1 && Math.hypot(q.x - st.x, q.z - st.z) < 9));
      assert.ok(cols.some((c) => c.sink), `v${variant}: a sinking column`);
      assert.ok(!cols[0].sink && !cols.at(-1).sink, 'not the first or the last');
    }
    // the treasure: on a dry islet in the widest lava lake, a row of columns out to it
    const lake = plan.pools.filter((p) => p.small).sort((a, b) => b.r - a.r)[0];
    assert.ok(plan.treasure && lake.islet, `v${variant}: a treasure islet`);
    assert.equal(terrain.lavaLevelAt(plan.treasure.x, plan.treasure.z), null, 'the islet is dry');
    assert.ok(Math.hypot(plan.treasure.x - lake.x, plan.treasure.z - lake.z) < lake.r, 'in the lake');
    // lava all round it: no walking out to it
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      let wet = false;
      for (let d = lake.islet.r + 0.5; d < lake.r * 1.3 && !wet; d += 0.4) wet = terrain.lavaLevelAt(plan.treasure.x + Math.cos(a) * d, plan.treasure.z + Math.sin(a) * d) !== null;
      assert.ok(wet, `v${variant}: lava round the islet (${k})`);
    }
    const row = plan.steps.filter((st) => Math.hypot(st.x - lake.x, st.z - lake.z) < lake.r * 1.2);
    assert.ok(row.length >= 4, `v${variant}: ${row.length} columns out to it`);
    for (let k = 1; k < row.length; k++) {
      const gap = Math.hypot(row[k].x - row[k - 1].x, row[k].z - row[k - 1].z) - row[k].r - row[k - 1].r;
      assert.ok(gap > 0.8 && gap < jump * 0.85, `v${variant}: a jump (${gap.toFixed(2)} m)`);
      assert.notEqual(terrain.lavaLevelAt((row[k].x + row[k - 1].x) / 2, (row[k].z + row[k - 1].z) / 2), null, 'lava between');
    }
    const last = row.at(-1);
    assert.ok(Math.hypot(last.x - plan.treasure.x, last.z - plan.treasure.z) - last.r - lake.islet.r < jump * 0.85, 'a jump onto the islet');
    assert.ok(layout.treasure && layout.stepColliders.length === layout.steps.length);
  }
});

test('the crater arena: a flat floor, a lava moat open at the entrance, columns to kite round', () => {
  for (const { plan, terrain, layout, variant } of islands) {
    const a = layout.volcanoArena;
    assert.ok(a, `v${variant}: arena`);
    // the floor is flat and free of lava
    for (let k = 0; k < 40; k++) {
      const ang = k * 2.4, r = (k / 40) * (a.r - 3);
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      assert.equal(terrain.lavaLevelAt(x, z), null, `v${variant}: lava on the floor`);
      assert.ok(Math.abs(terrain.heightAt(x, z) - a.y) < 1.2, `v${variant}: floor uneven at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
    // the moat is lava all round except at the entrance
    const g = a.gates[0].angle;
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI * 2;
      const off = Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) * a.moatR;
      const x = a.x + Math.cos(ang) * a.moatR, z = a.z + Math.sin(ang) * a.moatR;
      if (off > VOLCANO_ARENA.gapHalf + 4) assert.notEqual(terrain.lavaLevelAt(x, z), null, `v${variant}: moat at ${k}`);
      if (off < 2) assert.equal(terrain.lavaLevelAt(x, z), null, `v${variant}: the entrance crosses the moat dry`);
    }
    // basalt columns stand on the floor and block
    const parts = a.columns.flatMap((c) => c.parts);
    assert.ok(a.columns.length >= 5 && parts.length >= 15, `v${variant}: ${a.columns.length} clusters`);
    for (const c of parts) {
      assert.ok(Math.hypot(c.x - a.x, c.z - a.z) < a.r, 'column on the floor');
      const res = resolveCircle(c.x, c.z, 0.4, layout.playerColliders, undefined, c.y + 0.1, c.y + 1.7, 0.4);
      assert.ok(res.hit, 'a column blocks');
    }
    // nothing grows in the crater
    for (const t of layout.trees) assert.ok(!insideVolcanoArena(layout, t.x, t.z), `v${variant}: ${t.type} in the crater`);
    assert.ok(Math.hypot(a.spawn.x - a.x, a.spawn.z - a.z) < a.r, 'the boss spawns on the floor');
  }
});

test('lava flows run from vents to the beach; paths cross them on basalt bridges', () => {
  for (const { plan, terrain, variant } of islands) {
    const flows = plan.flows.filter((f) => !f.ring && !f.gutter && !f.field && f.kind === 'lava');
    assert.ok(flows.length >= 2, `v${variant}: ${flows.length} flows`);
    for (const f of flows) {
      assert.ok(f.pts[0].y > 15, `v${variant}: starts high on the flank`);
      assert.ok(f.pts.at(-1).y < 3, `v${variant}: ends low by the beach`);
    }
    // the trail and the paths never touch lava: where they cross a flow, a bridge carries
    // them (or, on the mountain path, stepping stones)
    for (const line of [plan.trail, ...plan.ramps.map((r) => r.pts)]) {
      for (let i = 0; i < line.length - 1; i++) {
        for (let u = 0; u < 1; u += 0.25) {
          const x = line[i].x + (line[i + 1].x - line[i].x) * u, z = line[i].z + (line[i + 1].z - line[i].z) * u;
          if (atFord(plan, x, z)) continue;
          assert.equal(terrain.lavaLevelAt(x, z), null, `v${variant}: lava on a path at ${x.toFixed(0)},${z.toFixed(0)}`);
        }
      }
    }
    for (const b of plan.bridges) {
      assert.equal(terrain.lavaLevelAt(b.x, b.z), null, 'a bridge is dry');
      assert.ok(terrain.heatAt(b.x, b.z) < CONFIG.volcano.heat.dmgFrom, `v${variant}: a bridge never burns (${terrain.heatAt(b.x, b.z).toFixed(2)})`);
    }
  }
});

test('no lava hangs in the air: every lava pool lies in a bowl, every flow wells out of a vent cone', () => {
  for (const { plan, terrain, variant } of islands) {
    for (const p of plan.pools.filter((q) => q.kind === 'lava' && !q.crater && !q.annex)) {
      // the drawn disc's edge lies under the ground all round
      const rad = p.disc ?? p.r * 1.4;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
        assert.ok(terrain.heightAt(x, z) >= p.level - 0.05, `v${variant}: lava pool edge ${(p.level - terrain.heightAt(x, z)).toFixed(2)} m above the ground at ${x.toFixed(0)},${z.toFixed(0)}`);
      }
    }
    for (const f of plan.flows.filter((q) => !q.ring && !q.gutter && !q.field)) {
      assert.ok(f.vent, `v${variant}: the flow has a vent`);
      // a cone round the mouth: its crest stands above the lava welling out
      let crest = -Infinity;
      for (let k = 0; k < 12; k++) crest = Math.max(crest, terrain.heightAt(f.vent.x + Math.cos(k * 0.52) * 4.5, f.vent.z + Math.sin(k * 0.52) * 4.5));
      assert.ok(crest > f.pts[0].y + 1, `v${variant}: vent cone`);
    }
  }
});

test('lava lakes and craters dot the lowland, off the paths and camps', () => {
  for (const { plan, terrain, layout, variant } of islands) {
    const craters = plan.pools.filter((p) => p.small);
    assert.ok(craters.length >= 8, `v${variant}: ${craters.length} lava craters`);
    assert.ok(craters.some((c) => c.r >= 8), `v${variant}: a wide lava lake among them`);
    for (const c of craters) {
      assert.equal(c.kind, 'lava');
      assert.ok(c.r >= 4.5 && c.r <= 12);
      // (the treasure lake has its islet in the middle: lava round it)
      const mx = c.islet ? c.x + c.r * 0.55 : c.x;
      assert.notEqual(terrain.lavaLevelAt(mx, c.z), null, `v${variant}: lava in the crater`);
      assert.equal(terrain.lavaLevelAt(c.x + c.bank, c.z), null, `v${variant}: dry past the rim`);
      assert.ok(layout.distToPath(c.x, c.z) > c.bank, `v${variant}: crater (and its rim) off the paths`);
      assert.ok(Math.hypot(c.x - plan.hut.x, c.z - plan.hut.z) > 45 && Math.hypot(c.x - plan.boat.x, c.z - plan.boat.z) > 30, 'off the camp and the boat');
      assert.ok(!layout.basePlots.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.r + c.r * 2), 'off the plots');
    }
  }
});

test('camps stay cool and dry: hut, boat, relics and plots off the lava', () => {
  for (const { terrain, layout, variant } of islands) {
    for (const [what, p] of [['hut', layout.hut], ['boat', layout.boat], ...layout.relics.map((r) => [r.kind, r]), ...layout.basePlots.map((p) => ['plot', p])]) {
      assert.equal(terrain.lavaLevelAt(p.x, p.z), null, `v${variant}: ${what} in lava`);
      // (the boat part by the lava flow lies on warm ground, never where it burns)
      assert.ok(terrain.heatAt(p.x, p.z) < (what === 'hut' || what === 'boat' || what === 'plot' ? 0.3 : CONFIG.volcano.heat.dmgFrom), `v${variant}: ${what} on hot ground`);
    }
    assert.equal(terrain.heatAt(layout.hut.x, layout.hut.z), 0, 'the hut is cool');
  }
});

test('heat: hot at the lava, cool away from it; fumaroles warm the ground round them', () => {
  for (const { plan, terrain, variant } of islands) {
    // a stretch of open lava (no bridge over it)
    const f = plan.flows[0];
    const i = f.pts.findIndex((q, k) => k > 3 && k < f.pts.length - 2 && terrain.lavaLevelAt(q.x, q.z) !== null);
    const p = f.pts[i];
    assert.ok(terrain.heatAt(p.x, p.z) > 0.9, `v${variant}: on the flow`);
    const n = f.pts[i + 1], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz);
    // beside the flow, just past its bank: hot enough to burn
    const side = p.w / 2 + 2.5;
    assert.ok(terrain.heatAt(p.x - dz / l * side, p.z + dx / l * side) > 0.6 || terrain.heatAt(p.x + dz / l * side, p.z - dx / l * side) > 0.6, `v${variant}: beside the flow`);
    assert.ok(plan.fumaroles.length >= 6, `v${variant}: fumaroles`);
    for (const fu of plan.fumaroles) assert.ok(terrain.heatAt(fu.x, fu.z) > 0.6, 'a fumarole is hot');
  }
});

test('no crust plates: the lava flows lie open (but for the bridges)', () => {
  for (const { plan, layout } of islands) {
    assert.equal(plan.crusts, undefined);
    assert.equal(layout.crusts, undefined);
  }
  assert.equal(EV.CRUST, undefined);
  assert.equal(CONFIG.volcano.crust, undefined);
});

/** The volcano island, no dinosaurs, one player at a spot. */
function volcanoWorld(variant = 2) {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push({ to, msg }) }, { level: 2, variant });
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const p = world.players.get(world.join('Vulcan').id);
  const put = (x, z) => { p.x = x; p.z = z; p.y = world.layout.groundAt(x, z); };
  const run = (s) => { for (let t = 0; t < s - 1e-9; t += 0.05) world.step(0.05); };
  const evs = (e) => out.filter((o) => o.msg.t === MSG.EV && o.msg.e === e).map((o) => o.msg);
  return { world, p, put, run, evs, out };
}

test('hot ground burns – not with Fireproof; the volcano stays quiet elsewhere', () => {
  const { world, p, put, run } = volcanoWorld();
  const t = world.terrain;
  // a spot right beside lava (hot) that is not lava itself
  let spot = null;
  for (const f of world.layout.plan.flows) {
    for (const q of f.pts) {
      for (let a = 0; a < 6.28 && !spot; a += 0.4) {
        const x = q.x + Math.cos(a) * (q.w / 2 + 2.2), z = q.z + Math.sin(a) * (q.w / 2 + 2.2);
        if (t.lavaLevelAt(x, z) === null && t.heatAt(x, z) > 0.75 && t.slopeAt(x, z) < 0.5) spot = { x, z };
      }
    }
  }
  assert.ok(spot, 'a hot spot');
  put(spot.x, spot.z);
  p.hp = 100;
  run(2);
  assert.ok(p.hp < 100 && p.hp >= 100 - CONFIG.volcano.heat.dps * 2.5, `burns slowly (${p.hp})`);
  p.hp = 100;
  p.buffs = { heatproof: world.now + 30 };
  run(2);
  assert.equal(p.hp, 100, 'Fireproof');
  // the swamp has no volcano
  const swamp = new ServerWorld({ send() {} }, { level: 1, variant: 1 });
  assert.equal(swamp.volcano.public(), null);
  assert.equal(swamp.terrain.heatAt(0, 0), 0);
});

test('the eruption cycle: rumble, lava bombs (never at the camp), ash rain, calm again', () => {
  const { world, p, put, run, evs } = volcanoWorld(3);
  const C = CONFIG.volcano.cycle, B = CONFIG.volcano.bomb;
  // stand somewhere cool in the open, away from the camp
  const L = world.layout;
  let spot = null;
  for (let k = 0; k < 400 && !spot; k++) {
    const a = k * 0.7, r = 80 + (k % 40) * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (world.terrain.heightAt(x, z) > 2 && world.terrain.heatAt(x, z) < 0.1 && Math.hypot(x - L.hut.x, z - L.hut.z) > 60 && world.terrain.slopeAt(x, z) < 0.4) spot = { x, z };
  }
  put(spot.x, spot.z);
  p.hp = p.maxHp = 100000;
  assert.equal(world.volcano.phase, 'calm');
  // (a wind ash rain may blow through first: the rumble keeps its time)
  run(C.first + 0.1);
  assert.equal(world.volcano.phase, 'rumble');
  const before = evs(EV.VOLCANO).length - 1;
  run(C.rumble);
  assert.equal(world.volcano.phase, 'erupt');
  const hp = p.hp;
  run(C.erupt);
  assert.equal(world.volcano.phase, 'ash');
  const bombs = evs(EV.BOMB);
  assert.ok(bombs.length >= Math.floor(C.erupt / B.wave), `${bombs.length} bombs`);
  for (const b of bombs) {
    assert.ok(Math.hypot(b.x - L.hut.x, b.z - L.hut.z) > L.plan.hut.radius + 10, 'never at the camp');
    assert.ok(Math.hypot(b.x - L.boat.x, b.z - L.boat.z) > 20, 'never at the boat');
  }
  // some fell near the player (and some may have hit)
  assert.ok(bombs.some((b) => Math.hypot(b.x - spot.x, b.z - spot.z) <= B.near[1] + 1), 'bombs near the player');
  assert.ok(p.hp <= hp);
  // ash rain: the dinosaurs see less far
  assert.equal(world.sightMul(), CONFIG.volcano.ash.sight);
  assert.deepEqual(evs(EV.VOLCANO).slice(before).map((m) => m.phase), ['rumble', 'erupt', 'ash']);
  assert.equal(evs(EV.VOLCANO).at(-1).source, 'eruption');
  run(C.ashMax + 0.1);
  assert.equal(world.volcano.phase, 'calm');
  assert.equal(world.sightMul(), 1);
});

test('ash rain blows in on the wind between eruptions, which keep their time', () => {
  const { world, p, put, run, evs } = volcanoWorld(5);
  const A = CONFIG.volcano.ash, C = CONFIG.volcano.cycle;
  put(world.layout.hut.x, world.layout.hut.z);      // sheltered: no harm meanwhile
  run(A.first + 0.1);
  assert.equal(world.volcano.phase, 'ash');
  assert.equal(world.volcano.source, 'wind');
  assert.equal(evs(EV.VOLCANO).at(-1).source, 'wind');
  assert.equal(world.sightMul(), A.sight);
  // late joiners hear of it
  assert.equal(world.volcano.public().source, 'wind');
  assert.equal(p.hp, p.maxHp, 'the camp shelters');
  run(A.durMax + 0.1);
  assert.equal(world.volcano.phase, 'calm');
  // the eruption still comes on time
  run(C.first - A.first - A.durMax - 0.4);
  assert.equal(world.volcano.phase, 'calm');
  run(0.6);
  assert.equal(world.volcano.phase, 'rumble');
});

test('out in the ash rain a player slowly loses health – never below the floor; the camp and the base shelter', () => {
  const { world, p, put, run } = volcanoWorld(2);
  const A = CONFIG.volcano.ash, L = world.layout;
  let spot = null;
  for (let k = 0; k < 400 && !spot; k++) {
    const a = k * 0.7, r = 80 + (k % 40) * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (world.terrain.heightAt(x, z) > 2 && world.terrain.heatAt(x, z) < 0.05 && Math.hypot(x - L.hut.x, z - L.hut.z) > 60 && world.terrain.slopeAt(x, z) < 0.4
      && !L.basePlots.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 4)) spot = { x, z };
  }
  put(spot.x, spot.z);
  run(A.first + 0.1);
  assert.equal(world.volcano.phase, 'ash');
  p.hp = p.maxHp;
  run(A.after - 0.5);
  assert.equal(p.hp, p.maxHp, 'a grace time first');
  run(4);
  assert.ok(p.hp < p.maxHp && p.hp >= p.maxHp - A.dps * 5, `then it hurts slowly (${p.hp})`);
  p.hp = p.maxHp * A.floor + 0.5;
  run(5);
  assert.ok(Math.abs(p.hp - p.maxHp * A.floor) < 1e-6 && p.alive, 'never below the floor');
  // sheltered at the camp and on a base plot
  for (const at of [{ x: L.plan.hut.x, z: L.plan.hut.z + 2 }, ...L.basePlots.slice(0, 1)]) {
    put(at.x, at.z);
    p.hp = p.maxHp;
    run(A.after + 3);
    assert.equal(p.hp, p.maxHp, 'sheltered');
  }
  // creative players are never hurt
  put(spot.x, spot.z);
  p.creative = true;
  run(A.after + 3);
  assert.equal(p.hp, p.maxHp);
});

test('the mountain path is a bomb zone: bombs land ahead of a climber, eruption or not', () => {
  const { world, p, put, run, evs } = volcanoWorld(3);
  const pts = world.layout.plan.ramps.find((r) => r.caldera).pts;
  p.hp = p.maxHp = 100000;
  p.buffs = { heatproof: world.now + 1000 };
  let at = pts[Math.floor(pts.length * 0.4)];
  for (let i = Math.floor(pts.length * 0.4); i < pts.length * 0.8 && world.terrain.heatAt(at.x, at.z) > 0.3; i++) at = pts[i];
  const keep = () => put(at.x, at.z);
  keep();
  for (let t = 0; t < 30; t += 0.5) { keep(); run(0.5); }
  assert.equal(world.volcano.phase, 'calm', 'no eruption meanwhile');
  const bombs = evs(EV.BOMB);
  const S = CONFIG.volcano.slope;
  assert.ok(bombs.length >= Math.floor(30 / S.every[1]) - 1, `${bombs.length} bombs in 30 s`);
  for (const b of bombs) {
    let d = Infinity;
    for (const q of pts) d = Math.min(d, Math.hypot(q.x - b.x, q.z - b.z));
    assert.ok(d < S.side + 3, 'on the path');
    assert.ok(Math.hypot(b.x - at.x, b.z - at.z) < S.ahead[1] + S.side + 3, 'near the climber');
  }
  // off the path (down at the camp): none
  const n = evs(EV.BOMB).length;
  put(world.layout.hut.x, world.layout.hut.z);
  run(20);
  assert.equal(evs(EV.BOMB).length, n);
});

test('on a stepping stone the lava below does not burn', () => {
  const { world, p, put, run } = volcanoWorld(2);
  const st = world.layout.steps[0];
  p.hp = p.maxHp = 1000;
  p.buffs = { heatproof: world.now + 1000 };
  for (let t = 0; t < 3; t += 0.25) { p.x = st.x; p.z = st.z; p.y = st.top; run(0.25); }
  assert.equal(p.hp, 1000, 'standing on the stone');
  // between two stones: lava
  const b = world.layout.steps[1], mx = (st.x + b.x) / 2, mz = (st.z + b.z) / 2;
  for (let t = 0; t < 1; t += 0.25) { p.x = mx; p.z = mz; p.y = world.terrain.heightAt(mx, mz); run(0.25); }
  assert.ok(p.hp < 1000, 'in the lava between them');
});

test('a lava geyser bubbles, then spouts: it burns and throws back whoever is in it, not who stands by', () => {
  const { world, p, run, evs } = volcanoWorld(2);
  const G = CONFIG.volcano.geyser;
  const g = world.volcano.geysers.find((q) => world.terrain.lavaLevelAt(q.x, q.z) === null);
  world.volcano.climb = [];          // (no bomb zone here: only the geyser)
  p.hp = p.maxHp = 1000;
  p.buffs = { heatproof: world.now + 1000 };
  const stand = (x, z) => { p.x = x; p.z = z; p.y = world.layout.groundAt(x, z); };
  // beside it: the geyser keeps its beat, nobody gets hurt
  for (let t = 0; t < g.period * 2 + 3; t += 0.25) { stand(g.x + 5, g.z); run(0.25); }
  assert.ok(evs(EV.GEYSER).some((m) => m.id === g.id && m.eta === G.warn), 'it warns before it spouts');
  assert.equal(p.hp, 1000, 'standing by');
  // in it: hurt and thrown back
  let hit = false;
  for (let t = 0; t < g.period * 2 + 3 && !hit; t += 0.1) { stand(g.x + 0.3, g.z); run(0.1); hit = p.hp < 1000; }
  assert.ok(hit, 'in the spout');
  // nobody near: no beat, no events
  const n = evs(EV.GEYSER).length;
  stand(world.layout.hut.x, world.layout.hut.z);
  for (let t = 0; t < 30; t += 0.5) { stand(world.layout.hut.x, world.layout.hut.z); run(0.5); }
  assert.ok(evs(EV.GEYSER).filter((m) => m.id === g.id).length <= evs(EV.GEYSER).slice(0, n).filter((m) => m.id === g.id).length + 1, 'quiet while nobody is near');
});

test('a sinking column goes down under whoever stands on it, burns them, and comes back up', () => {
  const { world, p, run, evs } = volcanoWorld(2);
  const st = world.layout.steps.find((q) => q.sink);
  const col = world.layout.stepColliders[st.id];
  p.hp = p.maxHp = 1000;
  p.buffs = { heatproof: world.now + 1000 };
  p.x = st.x; p.z = st.z; p.y = st.top;
  run(0.1);
  assert.deepEqual(evs(EV.COLUMN).map((m) => m.id), [st.id]);
  assert.ok(world.volcano.public().columns.some((c) => c.id === st.id), 'late joiners hear of it');
  // it goes down: the player with it, into the lava
  for (let t = 0; t < 4; t += 0.1) { p.x = st.x; p.z = st.z; p.y = Math.max(col.top, world.terrain.heightAt(st.x, st.z)); run(0.1); }
  assert.ok(col.top < world.terrain.lavaLevelAt(st.x, st.z), 'under the lava');
  assert.ok(p.hp < 1000, 'and it burns');
  // it comes back up
  p.x = st.x + 30; p.z = st.z;
  run(columnCycle(st));
  assert.equal(col.top, st.top);
  assert.equal(world.volcano.public().columns.length, 0);
  // the shared curve: still, shaking, down, up
  assert.equal(columnTop(st, -1), st.top);
  assert.equal(columnTop(st, 0.3), st.top);
  assert.ok(columnTop(st, columnCycle(st) - CONFIG.volcano.column.rise - 0.5) < st.lava);
});

test('the lava lake treasure opens once, for the first who reaches it: loot and xp for the team', () => {
  const { world, p, run, evs } = volcanoWorld(2);
  const t = world.layout.treasure;
  const items = () => [...world.items.values()].filter((it) => Math.hypot(it.x - t.x, it.z - t.z) < 3);
  assert.equal(items().length, 0);
  const xp = p.prof.xp;
  p.x = t.x + 1; p.z = t.z; p.y = t.y;
  run(0.2);
  assert.equal(evs(EV.TREASURE).length, 1);
  assert.equal(items().length, Object.keys(CONFIG.volcano.treasure.loot).length + 1);
  assert.ok(p.prof.xp > xp, 'xp');
  assert.deepEqual(world.volcano.public().treasure, { by: p.name });
  run(1);
  assert.equal(evs(EV.TREASURE).length, 1, 'only once');
});

test('a lava bomb hurts a dinosaur in its blast – and a player standing there', () => {
  const { world, p, put } = volcanoWorld(4);
  const L = world.layout;
  let spot = null;
  for (let k = 0; k < 400 && !spot; k++) {
    const a = k * 0.9, r = 90 + (k % 30) * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (world.terrain.heightAt(x, z) > 2 && world.terrain.heatAt(x, z) < 0.1 && Math.hypot(x - L.hut.x, z - L.hut.z) > 60 && world.terrain.slopeAt(x, z) < 0.3) spot = { x, z };
  }
  const d = world.dinos.spawn('stego', spot.x + 1, spot.z);
  put(spot.x - 1, spot.z);
  p.hp = p.maxHp = 1000;
  const hp0 = d.hp;
  world.volcano.bombs.push({ x: spot.x, z: spot.z, y: world.terrain.heightAt(spot.x, spot.z), at: world.now });
  world.step(0.05);
  assert.ok(d.hp < hp0, 'the dinosaur is hurt');
  assert.ok(p.hp < 1000, 'and the player too');
});
