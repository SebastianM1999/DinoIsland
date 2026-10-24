import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/shared/config.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

const C = CONFIG.volcano.cataclysm;

function finale() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: 2 });
  const p = world.players.get(world.join('Survivor').id);
  world.story.visited.add(3);                // (back from the hollow mountain)
  world.story.gateOpen = true;
  world.mission.phase = 'repaired';          // (the boat waits)
  const king = world.dinos.list.find((d) => d.type === 'trex' && d.boss);
  const a = world.layout.volcanoArena;
  Object.assign(p, { x: a.x + 4, z: a.z, y: world.terrain.heightAt(a.x + 4, a.z) });
  const evs = (e) => sent.filter(({ msg }) => msg.e === e).map(({ msg }) => msg);
  const run = (s) => { for (let t = 0; t < s; t += 0.1) world.step(0.1); };
  return { world, p, king, evs, run };
}

test('no great eruption before the king falls; his death wakes the mountain for good', () => {
  const { world, p, king, evs, run } = finale();
  run(5);
  assert.notEqual(world.volcano.phase, 'cataclysm');
  world.dinos.damage(king, 1e9, 'body', p.id);
  assert.equal(world.volcano.phase, 'cataclysm');
  assert.ok(evs(EV.VOLCANO).some((e) => e.phase === 'cataclysm' && e.left === C.countdown));
  const bombs = evs(EV.BOMB).length;
  run(5);
  assert.equal(world.volcano.phase, 'cataclysm', 'it does not calm down by itself');
  assert.ok(evs(EV.BOMB).length - bombs >= 5 * C.perPlayer, 'bombs rain down');
  assert.equal(world.volcano.sightMul(), CONFIG.volcano.ash.sight);
});

test('sailing away in time ends the expedition', () => {
  const { world, p, king } = finale();
  world.dinos.damage(king, 1e9, 'body', p.id);
  const b = world.boatSpot();
  Object.assign(p, { x: b.x + 3, z: b.z, y: world.terrain.heightAt(b.x + 3, b.z) });
  world.receive(p.id, { t: MSG.ACT, a: ACT.SAIL });
  assert.equal(world.mission.phase, 'sailing');
  assert.ok(world.story.steps.has('escape'));
  assert.equal(world.mission.state().won, true);
  world.step(0.1);
  assert.equal(world.volcano.phase, 'calm', 'the sea is calm once the boat is away');
});

test('when the time runs out the team wakes at the camp and the king stands again', () => {
  const { world, p, king, run } = finale();
  world.dinos.damage(king, 1e9, 'body', p.id);
  p.creative = true;   // (bombs aside: only the countdown matters here)
  world.volcano.until = world.now + 0.05;
  run(0.3);
  assert.notEqual(world.volcano.phase, 'cataclysm');
  const kings = world.dinos.list.filter((d) => d.type === 'trex' && d.boss);
  assert.equal(kings.length, 1);
  assert.equal(kings[0].alive, true);
  assert.equal(kings[0].hp, kings[0].maxHp);
  assert.equal(world.story.steps.has('king'), false, 'to be won again');
  assert.equal(world.story.gateOpen, true, 'the crystal stays in the gate');
  const sp = world.spawnPoint(p.slot);
  assert.ok(Math.hypot(p.x - sp.x, p.z - sp.z) < 0.01, 'back at the camp');
});

test('a load during the great eruption goes on with it', () => {
  const { world, p, king } = finale();
  world.dinos.damage(king, 1e9, 'body', p.id);
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.equal(back.volcano.phase, 'cataclysm');
  assert.ok(back.volcano.until > back.now);
  assert.equal(back.dinos.list.filter((d) => d.type === 'trex' && d.alive).length, 0, 'the king stays dead');
});
