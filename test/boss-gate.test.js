import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { CONFIG } from '../src/shared/config.js';
import { insideVolcanoArena } from '../src/shared/volcanoArena.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { KING } from '../src/sim/ai/trex.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test("Ashfall has Elias' station by the mountain path and the crater's gate at the notch (fixed map and variants)", () => {
  for (const variant of [...new Set([levelDef(2).variant, 0, 2, 3])]) {
    const terrain = new Terrain(planIsland(2, variant));
    const L = buildLayout(terrain);
    const s = L.storyAnchors.station;
    assert.ok(s, `v${variant}: a station`);
    assert.ok(terrain.heatAt(s.x, s.z) < 0.1 && terrain.lavaLevelAt(s.x, s.z) === null, 'on cool ground');
    assert.ok(L.distToPath(s.x, s.z) < 8, 'beside the mountain path');
    assert.deepEqual(L.notes.map((n) => n.id), ['station']);
    const g = L.storyAnchors.gate;
    assert.ok(g && !insideVolcanoArena(L, g.x, g.z), 'the gate stands outside the crater, at its way in');
  }
});

function ashfall() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: 2 });
  const p = world.players.get(world.join('Kingslayer').id);
  let seq = 0;
  const walk = (x, z) => world.receive(p.id, { t: MSG.STATE, s: ++seq, k: p.epoch, x, y: world.terrain.heightAt(x, z), z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  const put = (x, z) => Object.assign(p, { x, z, y: world.terrain.heightAt(x, z), lastMoveAt: world.now, moveBudget: 99 });
  return { world, p, sent, walk, put };
}

test('the king is one leashed boss in the crater arena, three times a T-Rex, hurt only from inside', () => {
  const { world, p } = ashfall();
  const kings = world.dinos.list.filter((d) => d.type === 'trex');
  assert.equal(kings.length, 1, 'no roaming T-Rex any more');
  const k = kings[0];
  assert.deepEqual([k.boss, k.title, k.leash.kind], [true, KING.title, 'crater']);
  assert.ok(insideVolcanoArena(world.layout, k.x, k.z));
  assert.equal(k.maxHp, Math.round(CONFIG.dinos.trex.health * world.dinos.hpMul) * KING.hpMul);
  const hp = k.hp;
  world.dinos.damage(k, 50, 'body', p.id);
  assert.equal(k.hp, hp, 'from outside the crater nothing hurts him');
});

test('the crater is closed until the seal crystal is set; then the team walks in; it stays open across a save', () => {
  const { world, p, sent, walk, put } = ashfall();
  const a = world.layout.volcanoArena, g = world.layout.storyAnchors.gate;
  // a step from the rim into the crater is refused while it is sealed
  const dirX = (a.x - g.x) / Math.hypot(a.x - g.x, a.z - g.z), dirZ = (a.z - g.z) / Math.hypot(a.x - g.x, a.z - g.z);
  const edge = { x: a.x - dirX * (a.craterR + 2.5), z: a.z - dirZ * (a.craterR + 2.5) };
  put(edge.x, edge.z);
  walk(edge.x + dirX * 1.5, edge.z + dirZ * 1.5);
  assert.ok(!insideVolcanoArena(world.layout, p.x, p.z, CONFIG.player.radius + 1), 'held at the rim');
  // at the gate: without the crystal nothing happens
  put(g.x, g.z);
  world.receive(p.id, { t: MSG.ACT, a: ACT.GATE });
  assert.equal(world.story.gateOpen, false);
  world.story.sealCrystal = true;
  world.receive(p.id, { t: MSG.ACT, a: ACT.GATE });
  assert.equal(world.story.gateOpen, true);
  assert.ok(sent.some(({ msg }) => msg.e === EV.STORY && msg.story.gateOpen));
  assert.ok(world.story.steps.has('unseal'));
  put(edge.x, edge.z);
  walk(edge.x + dirX * 1.5, edge.z + dirZ * 1.5);
  assert.ok(Math.hypot(p.x - (edge.x + dirX * 1.5), p.z - (edge.z + dirZ * 1.5)) < 0.05, 'in it goes');
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).story.gateOpen, true);
});

test('the king killed is the last story step on Ashfall, and stays dead after a load', () => {
  const { world, p } = ashfall();
  const k = world.dinos.list.find((d) => d.type === 'trex');
  Object.assign(p, { x: k.x + 6, z: k.z, y: k.y });
  world.dinos.damage(k, 1e9, 'body', p.id);
  assert.equal(k.alive, false);
  assert.ok(world.story.steps.has('king'));
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.equal(back.dinos.list.filter((d) => d.type === 'trex' && d.alive).length, 0);
});
