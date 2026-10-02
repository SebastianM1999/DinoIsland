import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';

test('every island has a hut beach, a boat beach and three reachable relic spots', () => {
  for (const level of [0, 1]) {
    for (const variant of [1, 2, 3]) {
      const world = new ServerWorld({ send() {} }, { level, variant });
      const { layout, terrain } = world;
      assert.equal(layout.relics.length, 3, `level ${level} v${variant} relics`);
      assert.ok(layout.boat.x > layout.hut.x + 150, 'boat is on the far (east) side');
      for (const r of layout.relics) {
        assert.equal(terrain.waterDepthAt(r.x, r.z), 0, `${r.kind} is not under water`);
        assert.equal(terrain.lavaLevelAt(r.x, r.z), null, `${r.kind} is not in lava`);
      }
    }
  }
  // the starter island is small, the volcano island bigger and harder; there are only two
  assert.ok(planIsland(0, 1).A < planIsland(1, 1).A * 0.7);
  assert.ok(levelDef(1).difficulty > levelDef(0).difficulty);
  assert.equal(levelDef(5).index, 1);
});

test('find the parts, repair the boat and sail to the next island together', () => {
  const sent = [];
  const world = new ServerWorld({ send: (to, message) => sent.push({ to, message }) }, { level: 0, variant: 5 });
  const a = world.join('Ada');
  const p = world.players.get(a.id);
  p.creative = true;                                   // keep dinosaurs out of the test

  // repair is refused while parts are missing (creative mode would skip them)
  const boat = world.layout.boat;
  Object.assign(p, { x: boat.interact.x, z: boat.interact.z });
  p.creative = false;
  world.receive(a.id, { t: MSG.ACT, a: ACT.REPAIR });
  p.creative = true;
  assert.equal(world.mission.phase, 'search');

  // walking up to each relic finds it
  for (const r of world.relics) {
    Object.assign(p, { x: r.x + 0.5, z: r.z, y: r.y });
    world.step(0.05);
  }
  assert.ok(world.relics.every((r) => r.found));
  assert.equal(sent.filter((s) => s.message.e === EV.RELIC).length, 3);

  Object.assign(p, { x: boat.interact.x, z: boat.interact.z });
  world.receive(a.id, { t: MSG.ACT, a: ACT.REPAIR });
  assert.equal(world.mission.phase, 'repaired');

  // everyone at the boat for a few seconds -> sail -> next island + fresh welcome
  const welcomes = () => sent.filter((s) => s.to === a.id && s.message.t === MSG.WELCOME).length;
  const before = welcomes();
  for (let i = 0; i < 20 * 12; i++) {
    Object.assign(p, { x: boat.interact.x, z: boat.interact.z });
    world.step(0.05);
  }
  assert.equal(world.levelIndex, 1);
  assert.equal(world.mission.phase, 'search');
  assert.equal(world.mission.islandsDone, 1);
  assert.equal(welcomes(), before + 1);
  const w = sent.filter((s) => s.message.t === MSG.WELCOME).at(-1).message;
  assert.equal(w.world.level.index, 1);
  assert.equal(w.world.relics.length, 3);
});

test('lava burns players', () => {
  const world = new ServerWorld({ send() {} }, { level: 1, variant: 3 });
  const a = world.join('Bo');
  const p = world.players.get(a.id);
  const pt = world.layout.rivers[0].pts[3];
  Object.assign(p, { x: pt.x, z: pt.z, y: world.terrain.heightAt(pt.x, pt.z) });
  const hp = p.hp;
  world.step(0.05);
  assert.ok(p.hp < hp);
});

test('sailing away from the last island wins and starts a fresh first island', () => {
  const world = new ServerWorld({ send() {} }, { level: 1, variant: 4 });
  const a = world.join('Cy');
  world.players.get(a.id).creative = true;
  world.mission.phase = 'sailing';
  assert.equal(world.mission.state().won, true);
  world.nextLevel();
  assert.equal(world.levelIndex, 0);
});
