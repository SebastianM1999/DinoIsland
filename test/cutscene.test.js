import test from 'node:test';
import assert from 'node:assert/strict';
import { shotPose, shotsLength, lookPoint } from '../src/client/core/cutscene.js';
import { introShots, outroShots } from '../src/client/core/storyShots.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { CONFIG } from '../src/shared/config.js';
import { ACT, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

const A = { pos: [0, 0, 0], look: [0, 0, -1] }, B = { pos: [10, 2, 0], look: [10, 2, -1] };
const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('a shot glides eased from its start pose to its end pose; the next shot takes over', () => {
  const shots = [{ dur: 2, from: A, to: B }, { dur: 1, from: B }];
  assert.equal(shotsLength(shots), 3);
  assert.ok(close(shotPose(shots, 0).pos, A.pos));
  assert.ok(close(shotPose(shots, 1).pos, [5, 1, 0]), 'halfway (smoothstep is symmetric)');
  assert.ok(shotPose(shots, 0.4).pos[0] < 2, 'eased in: slow at the start');
  assert.equal(shotPose(shots, 2.5).index, 1);
  assert.ok(close(shotPose(shots, 3).pos, B.pos), 'the last moment still has a pose');
  assert.equal(shotPose(shots, 3.01), null, 'over');
});

test('fades and black frames: from black at the start, to black at the end, text on its shot', () => {
  const shots = [{ dur: 2, from: A, fadeIn: 1 }, { dur: 2, from: A, fadeOut: 0.5 }, { dur: 1, from: A, black: true, text: 'The end' }];
  assert.equal(shotPose(shots, 0).black, 1);
  assert.ok(Math.abs(shotPose(shots, 0.5).black - 0.5) < 1e-9);
  assert.equal(shotPose(shots, 1.5).black, 0);
  assert.equal(shotPose(shots, 2.5).black, 0);
  assert.ok(Math.abs(shotPose(shots, 3.75).black - 0.5) < 1e-9);
  assert.deepEqual([shotPose(shots, 4.5).black, shotPose(shots, 4.5).text], [1, 'The end']);
  assert.equal(shotPose(shots, 1).text, null);
});

test('the island 1 intro ends exactly in the player view at the spawn, and the outro ends on a black line of text', () => {
  const terrain = new Terrain(planIsland(0, 1));
  const layout = buildLayout(terrain);
  const sp = layout.spawnPoints[2];
  const shots = introShots(terrain, layout, sp, CONFIG.player.eyeHeight);
  const end = shotPose(shots, shotsLength(shots));
  const eye = [sp.x, terrain.heightAt(sp.x, sp.z) + CONFIG.player.eyeHeight, sp.z];
  assert.ok(close(end.pos, eye, 1e-6), 'at eye height on the spawn');
  assert.ok(close(end.look, lookPoint(...eye, sp.yaw), 1e-6), 'looking where the player looks');
  assert.equal(shotPose(shots, 0.5).black, 1, 'it opens in the dark');
  assert.ok(shotsLength(shots) <= 14, 'short');
  assert.ok(shots.some((s) => s.hideActors) && !shots[1].hideActors, 'the body on the beach shows until the explorer wakes');
  const out = outroShots(terrain, layout, 'Elias Brand was never found.');
  const last = shotPose(out, shotsLength(out));
  assert.deepEqual([last.black, last.text], [1, 'Elias Brand was never found.']);
});

test('the host remembers that the intro was seen; older saves count it as seen', () => {
  const world = new ServerWorld({ send() {} }, { level: 0 });
  const { id } = world.join('Ana');
  assert.equal(world.fullState().story.introSeen, false);
  world.receive(id, { t: MSG.ACT, a: ACT.INTRO });
  assert.equal(world.fullState().story.introSeen, true);
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).story.introSeen, true);
  data.story = { notes: [] };
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).story.introSeen, true);
  data.story = { notes: [], introSeen: false };
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).story.introSeen, false);
});
