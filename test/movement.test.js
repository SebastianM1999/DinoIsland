import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCircle, penetration } from '../src/shared/collision.js';
import { PlayerController } from '../src/client/player/controller.js';
import { ServerWorld } from '../src/sim/world.js';
import { standable, goodSpot } from '../src/sim/unstuck.js';
import { ACT, MSG, EV } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';

const P = CONFIG.player;

/** Flat, dry test ground. */
const flat = {
  heightAt: () => 0,
  gradientAt: () => ({ x: 0, z: 0 }),
  slopeAt: () => 0,
  waterDepthAt: () => 0,
  inlandWaterLevelAt: () => null,
  seaDepthAt: () => 0,
};

function walk(colliders, start, yaw, frames = 240, intent = { forward: true }) {
  const pc = new PlayerController(flat, colliders);
  pc.teleport(start.x, start.z, yaw);
  const path = [];
  for (let i = 0; i < frames; i++) {
    pc.update(1 / 60, intent);
    path.push({ x: pc.pos.x, z: pc.pos.z });
  }
  return path;
}

const spread = (pts) => {
  let m = 0;
  for (const a of pts) for (const b of pts) m = Math.max(m, Math.hypot(a.x - b.x, a.z - b.z));
  return m;
};

test('resolve in the notch between two overlapping trunks converges instead of oscillating', () => {
  const cols = { circles: [{ x: -0.55, z: 0, r: 0.6 }, { x: 0.55, z: 0, r: 0.6 }], boxes: [] };
  let x = 0.05, z = 2;
  const seen = [];
  for (let i = 0; i < 80; i++) {
    const r = resolveCircle(x, z - 0.12, P.radius, cols);  // keep pushing into the gap
    x = r.x; z = r.z;
    assert.ok(penetration(x, z, P.radius, cols) < 1e-2, `clean after step ${i}`);
    if (i >= 60) seen.push({ x, z });
  }
  assert.ok(spread(seen) < 1e-6, `rests at one spot (spread ${spread(seen)})`);
  assert.ok(z > 0, 'stays in front of the trunks');
});

test('resolve in a gap narrower than the body stops at the same spot every time', () => {
  const cols = { circles: [{ x: -0.8, z: 0, r: 0.5 }, { x: 0.8, z: 0, r: 0.5 }], boxes: [] };
  const a = resolveCircle(0.1, 0.05, P.radius, cols);
  const b = resolveCircle(a.x, a.z - 0.1, P.radius, cols);
  const c = resolveCircle(b.x, b.z - 0.1, P.radius, cols);
  assert.ok(penetration(c.x, c.z, P.radius, cols) < 1e-2);
  assert.ok(Math.hypot(b.x - c.x, b.z - c.z) < 1e-6, 'no ping-pong between the trunks');
});

test('player walking into two trees, a tree + post and a box corner comes to rest without jitter', () => {
  const cases = [
    { circles: [{ x: -0.55, z: 0, r: 0.6 }, { x: 0.55, z: 0, r: 0.6 }], boxes: [] },
    { circles: [{ x: -0.7, z: 0, r: 0.5 }, { x: 0.35, z: -0.2, r: 0.3 }], boxes: [] },
    { circles: [{ x: 0.9, z: 0, r: 0.5 }], boxes: [{ x: -1.2, z: -0.5, hw: 1, hd: 1, rot: 0.6, top: 3 }] },
  ];
  for (const [k, cols] of cases.entries()) {
    for (const yaw of [0, 0.25, -0.3]) {
      const path = walk(cols, { x: 0.02, z: 4 }, yaw);
      for (const p of path) assert.ok(penetration(p.x, p.z, P.radius, cols) < 0.02, `case ${k} yaw ${yaw}: never inside`);
      const tail = path.slice(-40);
      // either resting (no jitter) or sliding smoothly past: no back-and-forth in z
      let reversals = 0;
      for (let i = 2; i < tail.length; i++) {
        const d1 = tail[i - 1].z - tail[i - 2].z, d2 = tail[i].z - tail[i - 1].z;
        if (d1 * d2 < -1e-10) reversals++;
      }
      assert.equal(reversals, 0, `case ${k} yaw ${yaw}: no oscillation`);
    }
  }
});

test('player slides smoothly along a single trunk', () => {
  const cols = { circles: [{ x: 0, z: 0, r: 0.6 }], boxes: [] };
  const path = walk(cols, { x: 0.3, z: 3 }, 0, 200);
  for (let i = 1; i < path.length; i++) assert.ok(path[i].x >= path[i - 1].x - 1e-9, 'sideways progress never reverses');
  assert.ok(path.at(-1).z < -0.5, 'got past the trunk');
});

// ------------------------------------------------------------------ unstuck

function setup(opts) {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) }, opts);
  const { id } = world.join('Hunter');
  return { world, player: world.players.get(id), messages };
}

const corrections = (messages, id) => messages.filter((m) => m.to === id && m.msg.t === MSG.CORRECT);

test('UNSTUCK moves a player out of a tree trunk to a free spot and corrects the client', () => {
  const { world, player, messages } = setup({ level: 0, variant: 3 });
  const L = world.layout;
  const trunk = L.playerColliders.circles.find((c) => c.r > 0.3 && c.kind !== 'rock' &&
    standable(world.terrain, L, c.x + c.r + 1.5, c.z) !== null && Math.hypot(c.x - player.x, c.z - player.z) > 40);
  assert.ok(trunk, 'found a tree');
  player.x = trunk.x; player.z = trunk.z; player.y = L.groundAt(trunk.x, trunk.z);
  world.receive(player.id, { t: MSG.ACT, a: ACT.UNSTUCK });
  const fix = corrections(messages, player.id).at(-1);
  assert.ok(fix && fix.msg.unstuck, 'sent CORRECT');
  assert.equal(fix.msg.x, Math.round(player.x * 100) / 100);
  assert.ok(Math.hypot(player.x - trunk.x, player.z - trunk.z) < 8, 'nearby spot');
  assert.ok(penetration(player.x, player.z, P.radius, L.playerColliders, player.y + 0.05, player.y + P.height) === 0, 'out of the trunk');
  assert.ok(goodSpot(world.terrain, L, player.x, player.z) !== null, 'can walk away from there');
  assert.ok(messages.some((m) => m.to === player.id && m.msg.e === EV.TOAST && /Unstuck/.test(m.msg.text)), 'toast');

  // rate limited
  const n = corrections(messages, player.id).length;
  player.x = trunk.x; player.z = trunk.z;
  world.receive(player.id, { t: MSG.ACT, a: ACT.UNSTUCK });
  assert.equal(corrections(messages, player.id).length, n, 'second request within the cooldown is ignored');
});

test('UNSTUCK gets a player out of a steep pit; automatic requests on free ground are ignored', () => {
  const { world, player, messages } = setup({ level: 1, variant: 2 });
  const t = world.terrain, L = world.layout;
  // free ground: an automatic request does nothing
  let free = null;
  for (let r = 0; r < 60 && !free; r += 1) {
    for (let a = 0; a < 6.28 && !free; a += 0.5) {
      const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
      if (goodSpot(t, L, x, z) !== null) free = { x, z };
    }
  }
  assert.ok(free, 'found free ground');
  player.x = free.x; player.z = free.z; player.y = L.groundAt(free.x, free.z);
  world.receive(player.id, { t: MSG.ACT, a: ACT.UNSTUCK });
  assert.equal(corrections(messages, player.id).length, 0, 'not stuck: no move');

  // a steep dry slope
  let steep = null;
  for (let x = -250; x < 250 && !steep; x += 3) {
    for (let z = -250; z < 250 && !steep; z += 3) {
      if (t.slopeAt(x, z) > P.maxWalkSlope * 1.4 && t.waterDepthAt(x, z) === 0 && t.lavaLevelAt(x, z) === null) steep = { x, z };
    }
  }
  assert.ok(steep, 'found a steep slope');
  player.x = steep.x; player.z = steep.z; player.y = L.groundAt(steep.x, steep.z);
  world.receive(player.id, { t: MSG.ACT, a: ACT.UNSTUCK });
  const fix = corrections(messages, player.id).at(-1);
  assert.ok(fix && fix.msg.unstuck, 'sent CORRECT');
  assert.ok(standable(t, L, player.x, player.z) !== null, 'flat, dry, free spot');
  assert.ok(t.slopeAt(player.x, player.z) < P.maxWalkSlope);
});

// ------------------------------------------------------------------ dinosaur spawns

test('initial dinosaur spawns stand on valid ground, clear of colliders (islands 1 and 2)', () => {
  for (const level of [0, 1]) {
    for (const variant of [1, 2, 3, 5]) {
      const world = new ServerWorld({ send() {} }, { level, variant });
      const sys = world.dinos;
      assert.ok(sys.list.length > 0);
      for (const d of sys.list) {
        const where = `island ${level + 1}/${variant} ${d.type} at ${d.x.toFixed(1)},${d.z.toFixed(1)}`;
        if (d.type === 'ptera') {
          assert.ok(d.y > world.layout.groundAt(d.x, d.z) + 1, `${where}: flies above the ground`);
          continue;
        }
        assert.ok(sys.walkable(d.x, d.z, d), `${where}: walkable`);
        assert.ok(world.terrain.lavaLevelAt(d.x, d.z) === null, `${where}: no lava`);
        assert.ok(sys.standsFree(d, d.x, d.z, d.yaw), `${where}: body clear of trees/rocks/walls`);
        assert.ok(sys.openDirections(d, d.x, d.z) >= 2, `${where}: can walk away`);
      }
    }
  }
});

test('a dinosaur wedged inside a collider is nudged free', () => {
  const world = new ServerWorld({ send() {} }, { level: 0, variant: 1 });
  const sys = world.dinos;
  const d = sys.list.find((o) => o.type === 'raptor');
  const trunk = world.layout.colliders.circles.find((c) => c.r > 0.4 && c.kind !== 'rock' && Math.hypot(c.x - d.x, c.z - d.z) < 80) ||
    world.layout.colliders.circles.find((c) => c.r > 0.4 && c.kind !== 'rock');
  d.x = trunk.x; d.z = trunk.z;
  d.blockedT = 3;             // it has been trying to walk for a while
  world.dinos.update(0.05);
  assert.ok(sys.standsFree(d, d.x, d.z, d.yaw) || !sys.bodyBlocked(d, d.x, d.z, d.yaw), 'moved out of the trunk');
});
