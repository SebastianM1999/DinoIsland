import test from 'node:test';
import assert from 'node:assert/strict';
import { springColliders, springSdf, springSeed } from '../src/shared/springShape.js';
import { penetration, standTop } from '../src/shared/collision.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { PlayerController } from '../src/client/player/controller.js';
import { CONFIG } from '../src/shared/config.js';
import { ServerWorld } from '../src/sim/world.js';
import { MSG } from '../src/shared/protocol.js';

const world = (s, x, z) => ({
  x: s.x + x * Math.cos(s.rot) + z * Math.sin(s.rot),
  z: s.z - x * Math.sin(s.rot) + z * Math.cos(s.rot),
});
const cols = s => ({ circles: [], boxes: springColliders(s) });

test('server accepts a player below the grotto brow without lifting them onto its roof', () => {
  const messages = [];
  const sim = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) }, { level: 0, variant: 1 });
  const { id } = sim.join('Hunter'), player = sim.players.get(id);
  const s = sim.layout.waterfall.source, p = world(s, 0, -0.5);
  Object.assign(player, { x: p.x, z: p.z, y: s.y + 0.5, creative: true });
  assert.ok(sim.layout.groundAt(p.x, p.z) > player.y + 2, 'roof is overhead');
  assert.ok(sim.layout.groundAt(p.x, p.z, player.y + CONFIG.player.stepHeight) <= player.y + CONFIG.player.stepHeight);
  messages.length = 0;
  sim.onState(player, { x: p.x, z: p.z, y: player.y });
  assert.equal(messages.filter(m => m.msg.t === MSG.CORRECT).length, 0, 'server accepts movement below the roof');
});

test('waterfall rock blocks solid sides and brow while leaving the opening and falling water clear across 16 islands', () => {
  for (let variant = 1; variant <= 16; variant++) {
    const layout = buildLayout(new Terrain(planIsland(0, variant)));
    const s = layout.waterfall.source, c = cols(s);
    assert.ok(c.boxes.length > 0 && c.boxes.length < 1500, `variant ${variant}: bounded collider count`);
    assert.equal(layout.playerColliders.boxes.filter(b => b.kind === 'spring').length, c.boxes.length);
    const { sdf } = springSdf(s.width, springSeed(s));
    for (const [x, y, z] of [[-4.5, 1, -0.5], [4.5, 1, -0.4], [0, 5, -0.5], [0, 1, 4]]) {
      assert.ok(sdf(x, y, z) < -0.2, 'probe is inside visible solid rock');
      const p = world(s, x, z);
      assert.ok(penetration(p.x, p.z, 0.1, c, s.y + y - 0.1, s.y + y + 0.1) > 0, `variant ${variant}: rock has collision`);
    }
    for (const [x, y, z] of [[0, 1, -0.5], [0, 1, 1], [0, -3, -0.6], [-1.8, -3, -0.6], [1.8, -3, -0.6]]) {
      const p = world(s, x, z);
      assert.equal(penetration(p.x, p.z, 0.15, c, s.y + y, s.y + y + 0.5), 0, `variant ${variant}: opening and water clear`);
    }
  }
});

test('player cannot walk through grotto sides and lands on the visible top', () => {
  for (const rot of [0, Math.PI / 2, 2.2]) {
    const s = { x: 10, z: -20, y: 20, width: 4.5, rot }, c = cols(s);
    const terrain = {
      heightAt: () => 10, gradientAt: () => ({ x: 0, z: 0 }), slopeAt: () => 0,
      waterDepthAt: () => 0, inlandWaterLevelAt: () => null, seaDepthAt: () => 0,
    };
    for (const side of [-1, 1]) {
      const start = world(s, side * 13, 0), target = world(s, side * 4.5, 0);
      const pc = new PlayerController(terrain, c);
      pc.teleport(start.x, start.z, Math.atan2(-(target.x - start.x), -(target.z - start.z)));
      pc.setCreative(true); pc.flying = true; pc.pos.y = s.y + 1;
      for (let frame = 0; frame < 180; frame++) pc.update(1 / 60, { forward: true });
      const dx = pc.pos.x - s.x, dz = pc.pos.z - s.z;
      const localX = dx * Math.cos(rot) - dz * Math.sin(rot);
      assert.ok(localX * side > 6, 'side approach stops outside the solid rock');
      assert.ok(penetration(pc.pos.x, pc.pos.z, CONFIG.player.radius, c, pc.pos.y + 0.05, pc.pos.y + CONFIG.player.height) < 0.02);
    }
    const p = world(s, 0, -0.5), top = standTop(c, p.x, p.z, CONFIG.player.radius);
    assert.ok(top > s.y + 5, 'brow top supports the player');
    const pc = new PlayerController(terrain, c);
    pc.teleport(p.x, p.z); pc.pos.y = top + 3; pc.onGround = false;
    for (let frame = 0; frame < 120; frame++) pc.update(1 / 60, {});
    assert.ok(pc.onGround && Math.abs(pc.pos.y - top) < 0.1, `falling player lands on the brow (rotation ${rot}, feet ${pc.pos.y}, top ${top}, onGround ${pc.onGround})`);
  }
});
