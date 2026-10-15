import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { findPath } from '../src/sim/pathfind.js';
import { CONFIG } from '../src/shared/config.js';

/** A deep spot of island 1's river (with the river's direction there) and a spot of open sea. */
function waters(world) {
  const t = world.terrain, half = t.half - 30;
  const river = world.layout.rivers.find((r) => r.kind === 'water');
  let inland = null, sea = null;
  for (let i = 1; i < river.pts.length - 1 && !inland; i++) {
    const p = river.pts[i], q = river.pts[i + 1];
    if (t.waterDepthAt(p.x, p.z) > 1 && t.seaDepthAt(p.x, p.z) === 0) {
      const l = Math.hypot(q.x - p.x, q.z - p.z);
      inland = { x: p.x, z: p.z, dx: (q.x - p.x) / l, dz: (q.z - p.z) / l };
    }
  }
  for (let x = -half; x < half && !sea; x += 5) {
    for (let z = -half; z < half && !sea; z += 5) if (t.seaDepthAt(x, z) > CONFIG.world.maxWadeDepth + 2) sea = { x, z };
  }
  return { inland, sea };
}

test('land dinosaurs swim across rivers and lakes on the way, never into the sea, and never spawn in water', () => {
  const world = new ServerWorld({ send() {} });
  const sys = world.dinos, t = world.terrain;
  const { inland, sea } = waters(world);
  assert.ok(inland && sea, 'island 1 has a river or lake and a sea');
  for (const type of ['raptor', 'trex', 'stego']) {
    const d = { type, radius: CONFIG.dinos[type].radius };
    assert.equal(sys.walkable(inland.x, inland.z, d), false, `${type}: no spawn or goal in the water`);
    assert.equal(sys.walkable(inland.x, inland.z, d, false, true), true, `${type}: swims across inland water`);
    assert.equal(sys.walkable(sea.x, sea.z, d, false, true), false, `${type}: keeps out of the sea`);
  }
  const ptera = { type: 'ptera', radius: CONFIG.dinos.ptera.radius };
  assert.equal(sys.walkable(inland.x, inland.z, ptera, false, true), false, 'a pterosaur does not swim');
  // swimming: the back stays out of the water, slower than on land
  const d = sys.spawn('raptor', inland.x, inland.z, { alpha: false });
  Object.assign(d, { x: inland.x, z: inland.z });
  assert.ok(sys.swimming(d));
  const y = sys.swimHeight(d);
  assert.ok(y > t.heightAt(d.x, d.z) && y < t.waterLevelAt(d.x, d.z), 'swims, neither on the bed nor above the water');
});

test('a path between two banks may lead through the water', () => {
  const world = new ServerWorld({ send() {} });
  const sys = world.dinos, t = world.terrain;
  const { inland } = waters(world);
  const d = { type: 'raptor', radius: CONFIG.dinos.raptor.radius };
  // the nearest dry banks on either side of the river, across its flow
  const bank = (dir) => {
    for (let s = 1; s < 60; s += 0.5) {
      const x = inland.x - inland.dz * dir * s, z = inland.z + inland.dx * dir * s;
      if (sys.walkable(x, z, d)) return { x: x - inland.dz * dir * 2, z: z + inland.dx * dir * 2 };
    }
    return null;
  };
  const a = bank(-1), b = bank(1);
  assert.ok(a && b, 'dry banks on both sides');
  const path = findPath(sys, d, a.x, a.z, b.x, b.z, 2, 4000, { every: 1 });
  assert.ok(path, 'a way across');
  assert.ok(path.some((p) => t.waterDepthAt(p.x, p.z) > 0.35), 'it crosses the water instead of walking round');
});
