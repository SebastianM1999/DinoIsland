// Level 4, the Hollow Mountain: a tunnel maze between two coves (shared/caveMaze.js,
// caveField.js, island.js planCave, layout.js cave section). Rule checks over 16
// seeded variants: determinism, reachability (dry, over the real terrain grid),
// the one way out, unclimbable walls, the roof, flooded tunnels, relics, torches,
// dinosaur spawns and the cave dressing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { caveOpenSdf, caveRockTop, caveRoofBase, CAVE_WALK_MAX } from '../src/shared/caveField.js';
import { penetration } from '../src/shared/collision.js';
import { RELICS } from '../src/shared/relics.js';
import { levelDef } from '../src/shared/levels.js';
import { CONFIG } from '../src/shared/config.js';
import { ServerWorld } from '../src/sim/world.js';
import { MSG } from '../src/shared/protocol.js';
import { PlayerController } from '../src/client/player/controller.js';

const LEVEL = 3;
const VARIANTS = Array.from({ length: 16 }, (_, i) => i + 1);
const SLOPE = CONFIG.player.maxWalkSlope;
const cache = new Map();
function island(variant) {
  if (!cache.has(variant)) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    cache.set(variant, { variant, terrain, plan: terrain.plan, layout, maze: terrain.plan.cave.maze });
  }
  return cache.get(variant);
}

/** Flood fill over the terrain grid the way a player walks: dry, not too steep, no big steps. `block(x, z)` cells are walls. */
function flood(terrain, starts, { block = () => false, depth = 0.3 } = {}) {
  const n1 = terrain.n + 1, seen = new Uint8Array(n1 * n1);
  const xz = (i, j) => [-terrain.half + i * terrain.cell, -terrain.half + j * terrain.cell];
  const ok = (i, j) => {
    const [x, z] = xz(i, j);
    return terrain.isWalkable(x, z, depth, SLOPE) && !block(x, z);
  };
  const stack = [];
  for (const s of starts) {
    const i = Math.round((s.x + terrain.half) / terrain.cell), j = Math.round((s.z + terrain.half) / terrain.cell);
    if (!seen[j * n1 + i] && ok(i, j)) { seen[j * n1 + i] = 1; stack.push([i, j]); }
  }
  while (stack.length) {
    const [i, j] = stack.pop();
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if ((!di && !dj) || a < 0 || b < 0 || a > terrain.n || b > terrain.n || seen[b * n1 + a]) continue;
        // a player climbs at most maxWalkSlope: neighbouring cells may differ by slope * distance
        const run = Math.hypot(di, dj) * terrain.cell;
        if (Math.abs(terrain.h(a, b) - terrain.h(i, j)) > SLOPE * run || !ok(a, b)) continue;
        seen[b * n1 + a] = 1;
        stack.push([a, b]);
      }
    }
  }
  const at = (x, z) => seen[Math.round((z + terrain.half) / terrain.cell) * n1 + Math.round((x + terrain.half) / terrain.cell)] === 1;
  return { seen, at, xz, n1 };
}
const spawnOf = (layout) => layout.spawnPoints;

test('level 4 is the last level, a cave biome with a dark palette and no flyers or giants', () => {
  const def = levelDef(LEVEL);
  assert.equal(def.biome.id, 'cave');
  assert.equal(def.last, true);
  assert.equal(def.number, 4);
  assert.equal(levelDef(2).last, false);
  assert.equal(levelDef(9).index, LEVEL);
  for (const kind of ['brachio', 'stego', 'ptera', 'trex']) assert.equal(def.dinos[kind], 0, kind);
  assert.ok(def.dinos.raptor > 0);
  assert.ok(def.biome.sky.fogFar <= 80 && def.biome.sky.sunIntensity < 0.5);
});

test('the cave level is deterministic: the same variant builds the same maze, ground, roof and layout', () => {
  for (const variant of [1, 2, 3]) {
    const a = island(variant);
    const t2 = new Terrain(planIsland(LEVEL, variant));
    const l2 = buildLayout(t2);
    assert.deepEqual(JSON.parse(JSON.stringify(a.maze)), JSON.parse(JSON.stringify(t2.plan.cave.maze)));
    assert.deepEqual(a.terrain.heights, t2.heights);
    assert.deepEqual(a.terrain.ceilings, t2.ceilings);
    assert.deepEqual(a.layout.relics, l2.relics);
    assert.deepEqual(a.layout.torchSpots, l2.torchSpots);
    assert.deepEqual(a.layout.caveDecor, l2.caveDecor);
    assert.deepEqual(a.layout.caveLights, l2.caveLights);
    assert.deepEqual(a.layout.caveDinoSpots, l2.caveDinoSpots);
  }
  assert.notDeepEqual(island(1).maze.nodes.map((n) => n.x), island(2).maze.nodes.map((n) => n.x), 'variants differ');
});

test('other islands have no roof', () => {
  for (const level of [0, 1, 2]) {
    const t = new Terrain(planIsland(level, 1));
    assert.equal(t.ceilings, null);
    assert.equal(t.isCave, false);
    assert.equal(t.ceilingAt(0, 0), Infinity);
    assert.equal(t.ceilingAt(100, -50), Infinity);
    assert.equal(t.clearanceAt(0, 0), Infinity);
  }
});

test('the maze has loops, dead ends, crystal halls, a flooded branch and side chambers off the direct way', () => {
  for (const { variant, maze } of VARIANTS.map(island)) {
    const real = maze.nodes.filter((n) => !n.outside);
    const dry = maze.tunnels.filter((t) => !t.flooded && t.kind !== 'falseExit');
    // (the two outside end points and the false exits' ends are no chambers)
    const edges = dry.filter((t) => !maze.nodes[t.a].outside && !maze.nodes[t.b].outside);
    assert.ok(edges.length >= real.length, `variant ${variant}: a loop exists (${edges.length} dry tunnels, ${real.length} chambers)`);
    assert.ok(maze.tunnels.some((t) => t.kind === 'loop'), 'loop tunnels');
    assert.ok(real.filter((n) => n.tags.includes('deadend')).length >= 2, `variant ${variant}: dead ends`);
    assert.ok(real.filter((n) => n.tags.includes('crystal')).length >= 2, `variant ${variant}: crystal halls`);
    const flooded = maze.tunnels.filter((t) => t.flooded);
    assert.ok(flooded.length >= 1 && flooded.length <= 2, `variant ${variant}: 1-2 flooded branches`);
    assert.ok(maze.nodes.filter((n) => n.tags.includes('relic')).length === 3);
    // relics are off the direct entrance -> exit way and in different parts of the mountain
    const relics = maze.relicNodes.map((id) => maze.nodes[id]);
    for (const r of relics) assert.ok(!maze.route.includes(r.id), `variant ${variant}: relic chamber off the direct way`);
    for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(relics[i].x - relics[j].x, relics[i].z - relics[j].z) >= 60, 'relic chambers apart');
    assert.ok(maze.route.length >= 3, 'the way out winds through other chambers');
    for (const t of maze.tunnels) {
      assert.ok(t.width >= 8.9 && t.width <= 13.1, `tunnel width ${t.width}`);
      for (const p of t.pts) assert.ok(p.roof >= 5 && p.roof <= 13, `roof ${p.roof}`);
    }
    for (const n of real) assert.ok(n.roof >= 9 && n.roof <= 18.5, `chamber roof ${n.roof}`);
  }
});

test('the whole maze is reachable over the real ground, dry: the hall, the relics, the exit and the boat', () => {
  for (const { variant, terrain, layout, maze } of VARIANTS.map(island)) {
    const f = flood(terrain, spawnOf(layout));
    for (const r of layout.relics) assert.ok(f.at(r.x, r.z), `variant ${variant}: ${r.kind} reachable`);
    for (const n of maze.nodes.filter((m) => !m.outside)) assert.ok(f.at(n.x, n.z), `variant ${variant}: chamber ${n.id} (${n.kind}) reachable`);
    assert.ok(f.at(layout.boat.interact.x, layout.boat.interact.z), `variant ${variant}: the boat is reachable`);
    assert.ok(f.at(layout.caveExit.x, layout.caveExit.z) && f.at(layout.caveEntrance.x, layout.caveEntrance.z));
    for (const fe of layout.falseExits) assert.ok(f.at(fe.x, fe.z) || terrain.heightAt(fe.x, fe.z) < 6, 'the false exit can be walked to (and back)');
  }
});

test('the east beach is reachable only through the mountain, by exactly one tunnel; nobody walks, wades or climbs round it', () => {
  for (const { variant, terrain, plan, layout, maze } of VARIANTS.map(island)) {
    const inMountain = (x, z) => plan.cave.depthAt(x, z) > 0;
    // with the mountain shut, the west cove cannot reach the boat even by wading the shallows (up to the wade limit)
    const outside = flood(terrain, spawnOf(layout), { block: inMountain, depth: CONFIG.world.maxWadeDepth });
    assert.ok(!outside.at(layout.boat.interact.x, layout.boat.interact.z), `variant ${variant}: no way round the outside`);
    assert.ok(!outside.at(layout.caveExit.x, layout.caveExit.z), `variant ${variant}: the exit's beach is cut off`);
    // ... and the cave leads through
    assert.ok(flood(terrain, spawnOf(layout)).at(layout.boat.interact.x, layout.boat.interact.z));
    // exactly one tunnel opens onto the east beach, and it is the one that leaves the exit hall
    const east = maze.tunnels.filter((t) => t.pts.some((p) => p.x > 185 && Math.abs(p.z) < 105 && plan.cave.depthAt(p.x, p.z) < 12));
    assert.equal(east.length, 1, `variant ${variant}: one tunnel to the east beach`);
    assert.equal(east[0].kind, 'exit');
    assert.equal(maze.nodes[east[0].a].id, maze.exit.hall);
    // the cave cells touching the east beach all belong to that tunnel's mouth
    const beach = flood(terrain, [{ x: plan.boat.x - 20, z: plan.boat.z }], { block: inMountain });
    const mouth = maze.tunnels[maze.exit.tunnel].pts.at(-1);
    const n1 = terrain.n + 1;
    let contacts = 0;
    for (let j = 1; j < terrain.n; j++) {
      for (let i = 1; i < terrain.n; i++) {
        if (!beach.seen[j * n1 + i]) continue;
        const [x, z] = beach.xz(i, j);
        if (x < 150) continue;
        if (inMountain(x, z) && terrain.isWalkable(x, z, 0.3, SLOPE)) contacts++;
      }
    }
    assert.equal(contacts, 0, 'mountain cells are blocked in this fill');
    // the beach component touches the mountain only along the exit tunnel's mouth
    for (let j = 1; j < terrain.n; j++) {
      for (let i = 1; i < terrain.n; i++) {
        if (!beach.seen[j * n1 + i]) continue;
        const [x, z] = beach.xz(i, j);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [a, b] = beach.xz(i + di, j + dj);
          if (inMountain(a, b) && terrain.isWalkable(a, b, 0.3, SLOPE)) {
            assert.ok(Math.hypot(a - mouth.x, b - mouth.z) < 30, `variant ${variant}: beach meets the mountain at (${a.toFixed(0)}, ${b.toFixed(0)}), not the exit tunnel`);
          }
        }
      }
    }
  }
});

test('walls are steeper than the walk limit and nobody climbs onto the mountain', () => {
  for (const { variant, terrain, plan, layout } of VARIANTS.map(island)) {
    const f = flood(terrain, spawnOf(layout));
    let max = -Infinity, reached = 0;
    for (let j = 0; j <= terrain.n; j++) {
      for (let i = 0; i <= terrain.n; i++) {
        if (!f.seen[j * f.n1 + i]) continue;
        reached++;
        max = Math.max(max, terrain.h(i, j));
      }
    }
    assert.ok(max < 8, `variant ${variant}: walkable ground never above ${max.toFixed(1)} m`);
    assert.ok(reached > 2500);
    // the rock beside every tunnel point rises steeply within a few metres
    for (const t of plan.cave.maze.tunnels.filter((q) => q.kind === 'tree' || q.kind === 'loop')) {
      for (let k = 2; k < t.pts.length - 2; k += 3) {
        const p = t.pts[k], q = t.pts[k + 1];
        const nx = -(q.z - p.z), nz = q.x - p.x, l = Math.hypot(nx, nz) || 1;
        for (const s of [-1, 1]) {
          const d = p.w / 2 + 4;
          const x = p.x + (nx / l) * d * s, z = p.z + (nz / l) * d * s;
          if (caveOpenSdf(plan, x, z) < 1) continue;     // (another tunnel or a chamber is there)
          assert.ok(terrain.heightAt(x, z) > terrain.heightAt(p.x, p.z) + 6, `variant ${variant}: wall beside tunnel ${t.id}`);
        }
      }
    }
  }
});

test('no enclosed pocket of walkable cave floor is cut off from the spawn', () => {
  for (const { variant, terrain, layout } of VARIANTS.map(island)) {
    const f = flood(terrain, spawnOf(layout));
    // walkable floor cells under a roof that the spawn cannot reach: grouped into components
    const n1 = f.n1, comp = new Int32Array(n1 * n1);
    const floor = (i, j) => {
      const [x, z] = f.xz(i, j);
      return !f.seen[j * n1 + i] && terrain.h(i, j) < 8 && terrain.heightAt(x, z) > 0.8 && Number.isFinite(terrain.ceilingAt(x, z)) && terrain.clearanceAt(x, z) < 30 && terrain.isWalkable(x, z, 0.3, SLOPE);
    };
    let biggest = 0, id = 0;
    for (let j = 0; j <= terrain.n; j++) {
      for (let i = 0; i <= terrain.n; i++) {
        if (comp[j * n1 + i] || !floor(i, j)) continue;
        let size = 0;
        const stack = [[i, j]];
        comp[j * n1 + i] = ++id;
        while (stack.length) {
          const [a, b] = stack.pop();
          size++;
          for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = a + da, d = b + db;
            if (c < 0 || d < 0 || c > terrain.n || d > terrain.n || comp[d * n1 + c] || !floor(c, d)) continue;
            comp[d * n1 + c] = id;
            stack.push([c, d]);
          }
        }
        biggest = Math.max(biggest, size);
      }
    }
    assert.ok(biggest <= 12, `variant ${variant}: an unreachable floor pocket of ${biggest} cells`);
  }
});

test('under every walkable cave cell the roof is at least 3.5 m up, in tunnels 5 m and more', () => {
  for (const { variant, terrain, plan, layout, maze } of VARIANTS.map(island)) {
    const f = flood(terrain, spawnOf(layout));
    let cells = 0, low = Infinity, tunnelLow = Infinity, high = 0;
    for (let j = 0; j <= terrain.n; j++) {
      for (let i = 0; i <= terrain.n; i++) {
        if (!f.seen[j * f.n1 + i]) continue;
        const [x, z] = f.xz(i, j);
        const roof = terrain.ceilingAt(x, z);
        // (open sky: the coves, the tunnel mouths and the false exits' ledges)
        if (roof === Infinity) {
          assert.ok(plan.cave.depthAt(x, z) < 18 || layout.falseExits.some((fe) => Math.hypot(fe.x - x, fe.z - z) < 40), `variant ${variant}: open sky inside the mountain at (${x.toFixed(0)}, ${z.toFixed(0)})`);
          continue;
        }
        cells++;
        const clear = roof - terrain.h(i, j);
        low = Math.min(low, clear);
        if (plan.cave.depthAt(x, z) > 30) high = Math.max(high, clear);   // (the roof lifts away at the tunnel mouths)
        if (Math.abs(x) < 130 && maze.nodes.every((n) => n.outside || Math.hypot(n.x - x, n.z - z) > n.r * 1.4 + 6)) tunnelLow = Math.min(tunnelLow, clear);
      }
    }
    assert.ok(cells > 1000);
    assert.ok(low >= 3.5, `variant ${variant}: lowest roof ${low.toFixed(2)} m`);
    assert.ok(tunnelLow >= 4.5, `variant ${variant}: lowest tunnel roof ${tunnelLow.toFixed(2)} m`);
    assert.ok(high <= 30 && high >= 12, `variant ${variant}: chambers up to ${high.toFixed(1)} m`);
    // the roof over the mouth rises into the open sky
    assert.equal(terrain.ceilingAt(layout.caveEntrance.x, layout.caveEntrance.z), Infinity);
    assert.equal(terrain.ceilingAt(layout.caveExit.x, layout.caveExit.z), Infinity);
  }
});

test('flooded tunnels: swimmable in the middle, an air gap above, shallow banks, no water above the floor beside it', () => {
  for (const { variant, terrain, plan, maze } of VARIANTS.map(island)) {
    const flows = plan.flows;
    assert.equal(flows.length, maze.tunnels.filter((t) => t.flooded).length);
    for (const flow of flows) {
      let swimmable = 0;
      for (const p of flow.pts.slice(2, -2)) {
        const d = terrain.waterDepthAt(p.x, p.z);
        if (d > CONFIG.player.swim.depth + 0.3) swimmable++;
      }
      assert.ok(swimmable >= 3, `variant ${variant}: a swimmable stretch (${swimmable} points)`);
    }
    const near = (x, z) => flows.some((fl) => fl.pts.some((p) => Math.hypot(p.x - x, p.z - z) < p.w / 2 + 3));
    for (let j = 1; j < terrain.n; j++) {
      for (let i = 1; i < terrain.n; i++) {
        const [x, z] = [-terrain.half + i * terrain.cell, -terrain.half + j * terrain.cell];
        const level = terrain.inlandWaterLevelAt(x, z);
        if (level === null) continue;
        assert.ok(near(x, z), `variant ${variant}: inland water outside a flooded tunnel at (${x.toFixed(0)}, ${z.toFixed(0)})`);
        assert.ok(terrain.ceilingAt(x, z) - level >= 2.5, `variant ${variant}: air gap over the water`);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const a = x + di * terrain.cell, b = z + dj * terrain.cell;
          if (terrain.inlandWaterLevelAt(a, b) !== null) continue;
          const h = terrain.heightAt(a, b);
          assert.ok(h >= level - 0.05, `variant ${variant}: dry ground below the water level beside the channel`);
        }
      }
    }
  }
});

test('three relics: dry, clear, reachable, each in its own side chamber, and the hints tell the truth', () => {
  for (const { variant, terrain, plan, layout, maze } of VARIANTS.map(island)) {
    assert.equal(layout.relics.length, 3, `variant ${variant}`);
    assert.deepEqual(layout.relics.map((r) => r.site), ['cave', 'lake', 'abyss']);
    const f = flood(terrain, spawnOf(layout));
    const rooms = plan.cave.rooms;
    for (const r of layout.relics) {
      const room = maze.nodes[rooms[r.site]];
      assert.ok(Math.hypot(r.x - room.x, r.z - room.z) < room.r, `${r.site} relic inside its chamber`);
      assert.equal(terrain.waterDepthAt(r.x, r.z), 0);
      assert.ok(f.at(r.x, r.z));
      assert.ok(terrain.clearanceAt(r.x, r.z) > 6);
      assert.ok(terrain.slopeAt(r.x, r.z) < 0.4);
      assert.equal(penetration(r.x, r.z, 1.5, layout.colliders, -1e9, 1e9, 0), 0, 'nothing solid on top of a boat part');
      assert.ok(!layout.caveDecor.stalagmites.some((s) => Math.hypot(s.x - r.x, s.z - r.z) < 1.5));
      assert.ok(RELICS[r.kind]);
    }
    assert.ok(maze.nodes[rooms.cave].tags.includes('crystal'), 'the cave relic lies in a crystal hall');
    const lake = maze.nodes[rooms.lake];
    assert.ok(maze.tunnels.some((t) => t.flooded && (t.a === lake.id || t.b === lake.id)), `variant ${variant}: the water relic's chamber has a flooded way`);
    assert.match(RELICS.bell.hint, /underground water/);
    const reach = layout.caveDinoSpots.find((c) => c.id === rooms.abyss);
    assert.ok(reach.tags.includes('farthest'));
  }
});

test('torch spots lie dry and clear in the arrival cove, and the arrival boat is a prop on the beach', () => {
  for (const { variant, terrain, layout, plan } of VARIANTS.map(island)) {
    const spots = layout.torchSpots;
    assert.ok(spots.length >= 4 && spots.length <= 6, `variant ${variant}: ${spots.length} torch spots`);
    for (const s of spots) {
      assert.equal(terrain.waterDepthAt(s.x, s.z), 0);
      assert.ok(terrain.slopeAt(s.x, s.z) < 0.3);
      assert.ok(s.x < -180 + 10 && Math.hypot(s.x - plan.hut.x, s.z - plan.hut.z) < 90, 'near the camp, west of the mountain');
      assert.equal(terrain.ceilingAt(s.x, s.z), Infinity);
      assert.equal(penetration(s.x, s.z, 1, layout.colliders, -1e9, 1e9, 0), 0);
    }
    const b = layout.arrivalBoat;
    assert.ok(b.x < plan.hut.x && terrain.heightAt(b.x, b.z) >= 0, 'arrival boat on the west beach');
    assert.ok(layout.boat.x > 220, 'the escape boat on the east beach');
    assert.ok(layout.hut.x < -200, 'hut and spawn in the west cove');
  }
});

test('dinosaurs: only species that fit, spawning dry on walkable ground under a high roof, outside colliders', () => {
  for (const { variant, terrain, plan, layout } of VARIANTS.map(island)) {
    for (const kind of ['brachio', 'stego']) assert.equal(layout.dinoZones[kind].length, 0, kind);
    assert.equal(layout.trexPatrol.length, 0);
    assert.equal(layout.dinoZones.raptor.length, plan.level.dinos.raptor, `variant ${variant}: raptor packs`);
    assert.ok(layout.caveDinoSpots.length >= 11);
    for (const z of layout.dinoZones.raptor) {
      assert.ok(z.spawns.length >= 3);
      const room = layout.caveDinoSpots.find((c) => c.id === z.room);
      assert.ok(room.clearance > 9, 'packs live in chambers');
      for (const p of z.spawns) {
        assert.equal(terrain.waterDepthAt(p.x, p.z), 0);
        assert.ok(terrain.slopeAt(p.x, p.z) < 0.5);
        assert.ok(terrain.clearanceAt(p.x, p.z) > 5);
        assert.equal(penetration(p.x, p.z, 1, layout.colliders, -1e9, 1e9, 0), 0);
      }
    }
    for (const c of layout.caveDinoSpots) {
      assert.ok(Number.isFinite(c.ceiling) && c.radius > 8);
      for (const p of c.spawns) assert.ok(terrain.clearanceAt(p.x, p.z) > 5);
    }
    assert.ok(layout.caveLights.length >= 20 && layout.caveLights.every((l) => Number.isFinite(l.y) && l.y > l.floor));
    assert.ok(layout.fruitSpots.length === 0 && layout.trees.length === 0 && layout.bushes.length === 0, 'no jungle plants in the cave');
  }
});

test('cave dressing: stalactites hang from the roof, stalagmites keep tunnels open (>= 4 m clear), crystals glow in halls', () => {
  for (const { variant, terrain, plan, layout } of VARIANTS.map(island)) {
    const d = layout.caveDecor;
    assert.ok(d.stalactites.length >= 150 && d.stalagmites.length >= 100 && d.crystals.length >= 50, `variant ${variant}: decor counts`);
    for (const s of d.stalactites) {
      assert.equal(s.y, terrain.ceilingAt(s.x, s.z));
      assert.ok(s.y - s.len > terrain.heightAt(s.x, s.z) + 2.5, 'stalactites never hang into reach');
    }
    const solid = [...d.stalagmites.filter((s) => s.solid), ...d.columns];
    for (const s of solid) {
      assert.ok(-caveOpenSdf(plan, s.x, s.z) >= s.r + 4, `variant ${variant}: >= 4 m clear beside a solid stalagmite`);
      assert.ok(layout.colliders.circles.some((c) => c.x === s.x && c.z === s.z && c.top > s.y + 1));
    }
    for (let i = 0; i < solid.length; i++) {
      for (let j = 0; j < i; j++) assert.ok(Math.hypot(solid[i].x - solid[j].x, solid[i].z - solid[j].z) - solid[i].r - solid[j].r >= 4, 'gaps between columns stay passable');
    }
    for (const c of d.columns) assert.ok(c.y + c.h >= terrain.ceilingAt(c.x, c.z), 'columns reach the roof');
    assert.ok(d.halls.length >= 2);
    for (const h of d.halls) assert.ok(d.crystals.filter((c) => c.hall === h.id).length >= 10, 'a crystal hall is full of crystals');
    for (const c of d.crystals) assert.ok(c.hue >= 0 && c.hue <= 1 && Math.abs(Math.hypot(c.nx, c.nz) - 1) < 1e-6);
    // nothing of the jungle in the cave
    assert.equal(layout.logs.length, 0);
  }
});

test('the server caps height at the roof and the controller bumps its head', () => {
  const { terrain, layout, maze } = island(1);
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 1 });
  const { id } = world.join('Spelunker');
  const p = world.players.get(id);
  const hall = maze.nodes[maze.exit.hall];
  const { x, z } = layout.caveDinoSpots.find((c) => c.id === hall.id).spawns[0];
  const y = terrain.heightAt(x, z);
  Object.assign(p, { x, z, y });
  world.receive(id, { t: MSG.STATE, x, y: y + 3.1, z, yaw: 0, pitch: 0, k: p.epoch });
  const roof = terrain.ceilingAt(x, z);
  assert.ok(p.y <= roof - CONFIG.player.height, 'height below the roof');
  world.receive(id, { t: MSG.STATE, x, y: roof + 6, z, yaw: 0, pitch: 0, k: p.epoch });
  assert.ok(p.y <= roof - CONFIG.player.height + 1e-6, 'a state above the roof is capped');
  // client controller: a flight into the roof is stopped
  const pc = new PlayerController(terrain, layout.playerColliders, layout.rockSurfaceAt);
  pc.teleport(x, z, 0);
  pc.flying = true;
  pc.vel.y = 30;
  for (let i = 0; i < 30; i++) { pc.vel.y = 30; pc.update(1 / 60, {}); }
  assert.ok(pc.pos.y + CONFIG.player.height <= roof + 1e-6, 'the roof stops a rising body');
});

test('a server world on the cave level spawns pack hunters only, all in valid spots, with three relics and a boat to sail', () => {
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 2 });
  const kinds = new Set(world.dinos.list.map((d) => d.type));
  const lurkers = world.dinos.list.filter((d) => d.type === 'sump-lurker');
  assert.deepEqual([...kinds].filter((k) => k !== 'sump-lurker').sort(), ['gloom-raptor', 'raptor']);
  const waterSpots = world.layout.caveDinoSpots.filter((c) => c.water);
  assert.equal(lurkers.length > 0, waterSpots.length > 0, 'a lurker per flooded tunnel');
  for (const d of lurkers) assert.ok(world.terrain.waterDepthAt(d.x, d.z) > 1, 'sump lurkers lie in deep water');
  const hallIds = new Set([world.layout.caveEntrance?.hall, world.layout.caveExit?.hall].filter((h) => h != null));
  for (const d of world.dinos.list.filter((d) => d.type !== 'sump-lurker')) {
    assert.ok(world.terrain.clearanceAt(d.x, d.z) > 3.4, 'raptor under a high roof');
    assert.equal(world.terrain.waterDepthAt(d.x, d.z) > 0.35, false);
  }
  const packs = new Set(world.dinos.list.filter((d) => d.type === 'gloom-raptor').map((d) => d.group));
  assert.equal(packs.size, world.layout.level.dinos['gloom-raptor'], 'every gloom pack found a deep chamber');
  for (const s of world.layout.caveDinoSpots.filter((c) => hallIds.has(c.id))) {
    assert.ok(world.dinos.list.every((d) => Math.hypot(d.x - s.x, d.z - s.z) > s.radius), 'entrance and exit halls stay empty');
  }
  assert.equal(world.relics.length, 3);
  assert.ok(world.layout.level.last);
});

test('the outside is a real mountain: ragged shore, steep flanks, two summits far above every roof', () => {
  for (const variant of VARIANTS.slice(0, 8)) {
    const { terrain, plan } = island(variant);
    const D = plan.cave.depthAt;
    // the summit and a second, separate one
    const peaks = [];
    let top = 0;
    const n1 = terrain.n + 1;
    for (let j = 2; j < terrain.n - 1; j += 1) for (let i = 2; i < terrain.n - 1; i += 1) {
      const h = terrain.h(i, j);
      top = Math.max(top, h);
      if (h < 60) continue;
      let max = true;
      for (let dj = -4; dj <= 4 && max; dj++) for (let di = -4; di <= 4; di++) if (terrain.h(i + di, j + dj) > h) { max = false; break; }
      if (max) peaks.push({ x: -terrain.half + i * terrain.cell, z: -terrain.half + j * terrain.cell, h });
    }
    assert.ok(top > 80 && top < 190, `variant ${variant}: summit ${top.toFixed(0)} m`);
    const far = peaks.filter((p) => peaks.every((q) => q === p || q.h <= p.h || Math.hypot(p.x - q.x, p.z - q.z) > 60));
    assert.ok(far.length >= 2, `variant ${variant}: ${far.length} separate summits`);
    // the flank rises steeply right from the shore (nobody walks up it) and the shore line is no circle
    let steep = 0, foot = 0;
    for (let j = 1; j < terrain.n; j++) for (let i = 1; i < terrain.n; i++) {
      const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
      const d = D(x, z);
      if (d < 1 || d > 4 || caveOpenSdf(plan, x, z) < 12) continue;
      foot++;
      if (!terrain.isWalkable(x, z, 0.3, SLOPE)) steep++;
    }
    // (a thin horn's crest may be level for a cell or two; the reachability test below proves nobody gets there)
    assert.ok(foot > 300 && steep >= foot * 0.99, `variant ${variant}: the first metres of the flank are steeper than the walk limit (${steep}/${foot})`);
    const radii = [];
    for (let a = 0; a < 360; a += 5) {
      let r = 0;
      while (r < 380 && D(Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r) > 0) r += 1;
      radii.push(r);
    }
    assert.ok(Math.max(...radii) - Math.min(...radii) > 45, `variant ${variant}: shoreline radius varies ${Math.min(...radii)}..${Math.max(...radii)}`);
  }
});

test('the rock is always above the roof, and nobody on foot reaches the flanks or the top', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan, layout } = island(variant);
    const n1 = terrain.n + 1;
    // the skin lies above the roof everywhere inside, with room to spare
    let worst = Infinity;
    for (let j = 0; j <= terrain.n; j++) for (let i = 0; i <= terrain.n; i++) {
      const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
      if (plan.cave.depthAt(x, z) < 22) continue;
      worst = Math.min(worst, caveRockTop(plan, x, z) - caveRoofBase(plan, x, z));
    }
    assert.ok(worst > 8, `variant ${variant}: rock ${worst.toFixed(1)} m over the roof`);
    // walking from the west cove (through the tunnels, false exits included) never leaves the floor level
    const f = flood(terrain, spawnOf(layout));
    let max = -Infinity;
    for (let k = 0; k < n1 * n1; k++) if (f.seen[k]) max = Math.max(max, terrain.heights[k]);
    assert.ok(max < CAVE_WALK_MAX - 2, `variant ${variant}: walkable ground reaches ${max.toFixed(1)} m`);
    // ... nor from any false exit's ledge or the east beach
    const starts = [...layout.falseExits, { x: plan.boat.x, z: plan.boat.z }];
    const g = flood(terrain, starts);
    for (let k = 0; k < n1 * n1; k++) if (g.seen[k]) assert.ok(terrain.heights[k] < CAVE_WALK_MAX - 2, `variant ${variant}: a flank is walkable from a false exit / the east beach`);
  }
});

test('the server turns away a walker on the mountain top or flank (not a creative flyer)', () => {
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 1 });
  const { id } = world.join('Climber');
  const p = world.players.get(id);
  const { terrain } = world;
  let best = { h: 0 };
  for (let j = 0; j <= terrain.n; j++) for (let i = 0; i <= terrain.n; i++) if (terrain.h(i, j) > best.h) best = { h: terrain.h(i, j), x: -terrain.half + i * terrain.cell, z: -terrain.half + j * terrain.cell };
  assert.ok(best.h > CAVE_WALK_MAX);
  Object.assign(p, { x: best.x + 1, z: best.z, y: best.h });
  const before = { x: p.x, z: p.z };
  world.receive(id, { t: MSG.STATE, x: best.x, y: terrain.heightAt(best.x, best.z), z: best.z, yaw: 0, pitch: 0, k: p.epoch });
  assert.deepEqual({ x: p.x, z: p.z }, before, 'the state on the summit is rejected');
  // a flank point at 20 m
  let flank = null;
  for (let a = 0; a < 6.28 && !flank; a += 0.1) for (let r = 100; r < 300; r += 1) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (terrain.heightAt(x, z) > 20 && terrain.heightAt(x, z) < 24) { flank = { x, z }; break; }
  }
  Object.assign(p, { x: flank.x + 0.5, z: flank.z, y: terrain.heightAt(flank.x, flank.z) });
  world.receive(id, { t: MSG.STATE, x: flank.x, y: terrain.heightAt(flank.x, flank.z), z: flank.z, yaw: 0, pitch: 0, k: p.epoch });
  assert.ok(Math.abs(p.x - (flank.x + 0.5)) < 1e-9, 'the flank is rejected');
});
