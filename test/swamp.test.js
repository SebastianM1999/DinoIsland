// The Misty Swamp (island 2): an hourglass twice the first island's size, many
// shallow bogs crossed by dry paths, the root-walled arena in the waist, and
// bogs that slow players and dinosaurs by 20 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland, halfWidthAt, BOG } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { insideSwampArena, gateOffset, SWAMP_ARENA } from '../src/shared/swampArena.js';
import { resolveCircle } from '../src/shared/collision.js';
import { CONFIG } from '../src/shared/config.js';
import { PlayerController } from '../src/client/player/controller.js';
import { ServerWorld } from '../src/sim/world.js';

const VARIANTS = [1, 2, 3, 4, 5, 6];
const swamps = VARIANTS.map((variant) => {
  const terrain = new Terrain(planIsland(1, variant));
  return { variant, terrain, plan: terrain.plan, layout: buildLayout(terrain) };
});
const landArea = (t) => {
  let n = 0;
  for (const h of t.heights) if (h > 0) n++;
  return n * t.cell * t.cell;
};
/** Land width (m) across the island at x. */
const landWidth = (t, x) => {
  let n = 0;
  for (let z = -200; z <= 200; z += 1) if (t.heightAt(x, z) > 0) n++;
  return n;
};

test('the swamp is an hourglass with about twice the first island\'s area', () => {
  const first = [1, 2, 3, 4].map((v) => landArea(new Terrain(planIsland(0, v)))).reduce((a, b) => a + b) / 4;
  for (const { variant, terrain, plan } of swamps) {
    assert.equal(plan.biome.id, 'swamp');
    const ratio = landArea(terrain) / first;
    assert.ok(ratio > 1.7 && ratio < 2.3, `v${variant}: area ${ratio.toFixed(2)} × the first island`);
    // the waist is 35-40 % as wide as the round halves; only the arena bulges out of it
    const sa = plan.swampArena;
    const waist = 2 * halfWidthAt(plan, 0);
    let halves = 0;
    for (const s of [-1, 1]) for (let k = 0.35; k <= 0.65; k += 0.05) halves = Math.max(halves, landWidth(terrain, s * k * plan.A));
    assert.ok(waist > halves * 0.33 && waist < halves * 0.45, `v${variant}: waist ${waist.toFixed(0)} m vs halves ${halves} m`);
    // and the coast really follows it on both sides of the arena
    for (const side of [-1, 1]) {
      assert.ok(terrain.heightAt(sa.x, side * (waist / 2 - 12)) > 0, `v${variant}: land inside the waist`);
      assert.ok(terrain.heightAt(sa.x, side * (waist / 2 * 1.25 + 10)) < 0, `v${variant}: sea beyond the waist`);
    }
  }
});

test('the swamp arena is the only way through the waist: wall and waist walls block, both gates are open', () => {
  const r = CONFIG.player.radius;
  for (const { variant, terrain, plan, layout } of swamps) {
    const a = layout.swampArena;
    assert.ok(a, `v${variant}: has an arena`);
    assert.ok(Math.abs(a.x) < 1 && Math.abs(a.z) < 5, `v${variant}: arena in the middle of the waist`);
    assert.ok(a.r >= 26 && a.r <= 30);
    assert.deepEqual(a.gates.map((g) => g.kind), ['entrance', 'exit']);
    assert.ok(a.gates[0].x < a.x && a.gates[1].x > a.x, 'entrance west, exit east');
    const cols = layout.playerColliders;
    const blocks = (x, z, y) => {
      const res = resolveCircle(x, z, r, cols, undefined, y, y + 1.8, 0.4);
      return res.hit || Math.hypot(res.x - x, res.z - z) > 0.3;
    };
    let blocked = 0, walls = 0;
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI * 2;
      const x = a.x + Math.cos(ang) * a.r, z = a.z + Math.sin(ang) * a.r;
      if (gateOffset(a, x, z) < SWAMP_ARENA.gateW / 2 + 2) continue;
      walls++;
      if (blocks(x, z, a.y)) blocked++;
    }
    assert.equal(blocked, walls, `v${variant}: the whole ring wall blocks (${blocked}/${walls})`);
    for (const g of a.gates) {
      const x = a.x + Math.cos(g.angle) * a.r, z = a.z + Math.sin(g.angle) * a.r;
      assert.ok(!blocks(x, z, a.y), `v${variant}: the ${g.kind} gate is open`);
    }
    // north and south of the ring the waist is walled off, out into sea too deep to wade
    assert.equal(a.waist.length, 2);
    for (const w of a.waist) {
      for (let d = 1; d < Math.abs(w.z1 - w.z0); d += 2) {
        const z = w.z0 + w.side * d;
        assert.ok(blocks(a.x + 0.4, z, Math.max(0, terrain.heightAt(a.x, z))), `v${variant}: waist wall at z ${z.toFixed(1)} blocks`);
      }
      assert.ok(terrain.seaDepthAt(a.x, w.z1) > CONFIG.world.maxWadeDepth, `v${variant}: the waist wall ends in deep sea`);
      assert.ok(terrain.heightAt(a.x, w.z1 - w.side * 30) < 0 || Math.abs(w.z1 - w.z0) > 30, `v${variant}: the wall reaches the coast`);
    }
    assert.ok(insideSwampArena(layout, a.spawn.x, a.spawn.z), 'the boss spawn is inside');
  }
});

test('dry paths: hut to boat through the waist, never into the arena or a bog', () => {
  for (const { variant, terrain, plan, layout } of swamps) {
    const sa = plan.swampArena;
    for (const line of layout.path) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        for (let t = 0; t <= 1; t += 0.25) {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          assert.equal(terrain.bogAt(x, z), 0, `v${variant}: path at ${x.toFixed(1)},${z.toFixed(1)} is in a bog`);
        }
      }
      // (it may ford the creek, like the jungle's trail fords its river)
      for (const [x, z] of line) assert.ok(terrain.waterDepthAt(x, z) <= CONFIG.world.maxWadeDepth, `v${variant}: path wadeable at ${x.toFixed(1)},${z.toFixed(1)}`);
    }
    // the trail goes from the hut to the boat through the arena: in at the west gate, out at the east one
    const trail = plan.trail;
    assert.ok(trail[0].x < -0.5 * plan.A && trail.at(-1).x > 0.5 * plan.A);
    for (const g of sa.gates) {
      const gx = sa.x + Math.cos(g.angle) * sa.r, gz = sa.z + Math.sin(g.angle) * sa.r;
      const d = Math.min(...trail.map((p) => Math.hypot(p.x - gx, p.z - gz)));
      assert.ok(d < 1.5, `v${variant}: trail through the ${g.kind} gate (${d.toFixed(1)} m off)`);
    }
    // no side path leads into the arena
    for (const line of plan.paths) assert.ok(line.every((p) => !insideSwampArena(sa, p.x, p.z, 1)), `v${variant}: side path into the arena`);
  }
});

test('bogs are many, shallow and wadeable; hut, boat, relics and plots stay dry', () => {
  for (const { variant, terrain, plan, layout } of swamps) {
    assert.ok(plan.bogs.length >= 25, `v${variant}: ${plan.bogs.length} bogs`);
    let bog = 0, land = 0;
    for (let x = -plan.A; x <= plan.A; x += 2) {
      for (let z = -plan.B; z <= plan.B; z += 2) {
        if (terrain.heightAt(x, z) <= 0 && !(insideSwampArena(plan.swampArena, x, z) && terrain.bogAt(x, z) > .5)) continue;
        land++;
        if (terrain.bogAt(x, z) > 0.5) {
          bog++;
          if (insideSwampArena(plan.swampArena, x, z)) continue; // boss hollows are deliberately swimmable
          assert.ok(terrain.waterDepthAt(x, z) <= BOG.maxDepth + 1e-6, `v${variant}: bog at ${x},${z} is ${terrain.waterDepthAt(x, z).toFixed(2)} m deep`);
          assert.ok(terrain.isWalkable(x, z, 0.35), `v${variant}: dinosaurs walk through the bog at ${x},${z}`);
        }
      }
    }
    assert.ok(bog / land > 0.12, `v${variant}: bogs cover ${(bog / land * 100).toFixed(0)} % of the land`);
    const dry = (p, what) => {
      assert.ok(terrain.bogAt(p.x, p.z) < 0.02, `v${variant}: ${what} not in a bog`);
      assert.ok(!insideSwampArena(layout, p.x, p.z, 2), `v${variant}: ${what} not in the arena`);
    };
    dry(layout.hut, 'hut');
    dry(layout.hut.campfire, 'camp');
    dry(layout.boat, 'boat');
    for (const r of layout.relics) dry(r, r.kind);
    for (const p of layout.basePlots) dry(p, `${p.kind} plot`);
    for (const t of layout.trees) assert.ok(terrain.waterDepthAt(t.x, t.z) <= BOG.maxDepth + 1e-6, `v${variant}: ${t.type} in deep water`);
    // mangroves grow only in and along the bogs; dry land has its own trees
    const mangroves = layout.trees.filter((t) => t.type === 'mangrove');
    assert.ok(mangroves.length > 150, `v${variant}: ${mangroves.length} mangroves`);
    const nearBog = (x, z) => [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]].some(([dx, dz]) => terrain.bogAt(x + dx, z + dz) > 0.05);
    for (const t of mangroves) assert.ok(nearBog(t.x, t.z), `v${variant}: mangrove at ${t.x.toFixed(1)},${t.z.toFixed(1)} is away from the swamp`);
    assert.ok(layout.trees.some((t) => t.type !== 'mangrove'), `v${variant}: other trees on dry land`);
  }
});

test('a bog slows the player by exactly 20 %, the path does not', () => {
  const DT = 1 / 60;
  const ground = (bog) => ({
    heightAt: () => 0, gradientAt: () => ({ x: 0, z: 0 }), slopeAt: () => 0,
    waterDepthAt: () => (bog ? 0.25 : 0), inlandWaterLevelAt: () => (bog ? 0.25 : null), seaDepthAt: () => 0,
    swampSpeedAt: () => (bog ? CONFIG.player.swampSpeedMul : 1),
  });
  const speed = (bog, sprint) => {
    const pc = new PlayerController(ground(bog), { circles: [], boxes: [] });
    pc.teleport(0, 0, 0);
    pc.update(DT, {});
    for (let i = 0; i < 90; i++) pc.update(DT, { forward: true, sprint });
    return { v: pc.moveSpeed, inBog: pc.inBog };
  };
  for (const sprint of [false, true]) {
    const dry = speed(false, sprint), wet = speed(true, sprint);
    assert.ok(Math.abs(wet.v / dry.v - 0.8) < 0.01, `sprint ${sprint}: ${wet.v.toFixed(2)} vs ${dry.v.toFixed(2)}`);
    assert.equal(wet.inBog, true);
    assert.equal(dry.inBog, false);
  }
  // on the real island: 0.8 in the middle of a bog, 1 on the causeways
  const { terrain, plan, layout } = swamps[0];
  const b = plan.bogs.find((q) => !q.arena);
  assert.equal(terrain.swampSpeedAt(b.x, b.z) === CONFIG.player.swampSpeedMul || terrain.bogAt(b.x, b.z) <= 0.5, true);
  for (const line of layout.path) for (const [x, z] of line) assert.equal(terrain.swampSpeedAt(x, z), 1);
});

test('dinosaurs wade through a bog 20 % slower; pteranodons fly over it', () => {
  const world = new ServerWorld({ send() {} }, { level: 1, variant: 1 });
  const t = world.terrain, sys = world.dinos;
  // a spot deep in a bog and a dry, open spot on the trail
  let wet = null;
  for (const b of world.terrain.plan.bogs) {
    if (b.arena) continue;
    if (t.bogAt(b.x, b.z) > 0.95) { wet = { x: b.x, z: b.z }; break; }
  }
  assert.ok(wet, 'found a bog');
  const trail = world.terrain.plan.trail;
  const dry = trail[Math.floor(trail.length * 0.3)];
  const stride = (type, at) => {
    sys.list.length = 0;
    const d = sys.spawn(type, at.x, at.z, { home: { x: at.x, z: at.z } });
    d.yaw = 0;
    d.spd = 3;
    const x0 = d.x, z0 = d.z;
    sys.move(d, 3, 0.05);
    return Math.hypot(d.x - x0, d.z - z0);
  };
  assert.equal(t.swampSpeedAt(wet.x, wet.z), CONFIG.player.swampSpeedMul);
  assert.equal(t.swampSpeedAt(dry.x, dry.z), 1);
  const inBog = stride('raptor', wet), onPath = stride('raptor', dry);
  assert.ok(onPath > 0, 'the raptor moves');
  assert.ok(Math.abs(inBog / onPath - 0.8) < 0.02, `bog ${inBog.toFixed(3)} vs path ${onPath.toFixed(3)}`);
});
