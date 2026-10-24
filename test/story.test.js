import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, BOAT_GATE, STEP_IDS } from '../src/shared/story.js';
import { NOTE_BY_ID } from '../src/shared/notes.js';
import { CONTRACTS } from '../src/shared/missions.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test('story steps: unique ids, known notes, a gate step on its own island', () => {
  assert.equal(new Set(STEP_IDS).size, STEP_IDS.length);
  for (const [level, steps] of Object.entries(STORY)) {
    for (const s of steps) {
      const d = s.done;
      assert.equal([d.note, d.near, d.event].filter(Boolean).length, 1, `${s.id}: one way to be done`);
      if (d.note) assert.equal(NOTE_BY_ID[d.note]?.island, Number(level), `${s.id}: its note lies on its island`);
    }
  }
  for (const [level, id] of Object.entries(BOAT_GATE)) assert.ok(STORY[level].some((s) => s.id === id));
});

function solo(level = 0) {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level });
  const p = world.players.get(world.join('Ana').id);
  const put = (x, z) => Object.assign(p, { x, z, y: world.terrain.heightAt(x, z) });
  const run = (s) => { for (let t = 0; t < s; t += 0.05) world.step(0.05); };
  const missions = () => sent.filter(({ msg }) => msg.e === EV.MISSION).map(({ msg }) => msg.mission);
  return { world, p, put, run, sent, missions };
}

test('island 1 opens with the story: no boat quest and no contracts until the wreck is found', () => {
  const { world } = solo();
  assert.equal(world.mission.phase, 'explore');
  const st = world.mission.state();
  assert.deepEqual(st.objectives.map((o) => o.text), STORY[0].map((s) => s.text));
  assert.ok(st.objectives.every((o) => !o.done && o.story));
  assert.ok(st.contracts.every((c) => c.locked));
  assert.equal(st.boat.repaired, false);
  assert.equal(world.fullState().boat.repaired, false);
  // contract events do not count yet
  world.mission.onEvent('fruit');
  assert.equal(world.mission.contracts.find((c) => c.id === 'forager').progress, 0);
});

test('reading Jonas\' message ticks the first step; boat parts found early count once the wreck is found', () => {
  const { world, p, put, run, missions } = solo();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  put(n.x + 1, n.z);
  world.receive(p.id, { t: MSG.ACT, a: ACT.READ, note: 'jonas' });
  assert.ok(world.story.steps.has('skeleton'));
  assert.equal(missions().at(-1).objectives[0].done, true);
  // a boat part on the way (picked up like always)
  const r = world.relics[0];
  put(r.x, r.z);
  world.step(0.05);
  assert.equal(r.found, true);
  assert.equal(world.mission.phase, 'explore', 'still exploring');
  // near the wreck: the boat quest starts with the part already counted, the contracts open
  const b = world.layout.boat;
  put(b.x + 6, b.z);
  run(0.6);
  assert.ok(world.story.steps.has('wreck'));
  assert.equal(world.mission.phase, 'search');
  const st = missions().at(-1);
  assert.ok(st.objectives.some((o) => o.relic === r.kind && o.done));
  assert.ok(st.objectives.some((o) => /Repair the boat.*\(1\/3 parts\)/.test(o.text)));
  assert.ok(st.contracts.every((c) => !c.locked));
  world.mission.onEvent('fruit');
  assert.equal(world.mission.contracts[CONTRACTS.findIndex((c) => c.id === 'forager')].progress, 1);
});

test('the boat quest is never stuck: repairing at the wreck opens it too', () => {
  const { world, p, put } = solo();
  const b = world.layout.boat;
  put(b.x + 3, b.z);
  world.receive(p.id, { t: MSG.ACT, a: ACT.REPAIR });
  assert.ok(world.story.steps.has('wreck'));
  assert.equal(world.mission.phase, 'search', 'open, but the parts are missing');
  p.creative = true;   // (creative mode repairs without them)
  world.receive(p.id, { t: MSG.ACT, a: ACT.REPAIR });
  assert.equal(world.mission.phase, 'repaired');
});

test('later islands start with the boat quest; story steps and the explore phase survive a save', () => {
  const { world, p, put } = solo();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  put(n.x + 1, n.z);
  world.receive(p.id, { t: MSG.ACT, a: ACT.READ, note: 'jonas' });
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.deepEqual(data.story.steps, ['skeleton']);
  assert.equal(data.mission.phase, 'explore');
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  assert.deepEqual([...back.story.steps], ['skeleton']);
  assert.equal(back.mission.phase, 'explore');
  data.story.steps = ['skeleton', 'not-a-step'];
  assert.deepEqual([...restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).story.steps], ['skeleton']);
  world.nextLevel();
  assert.equal(world.mission.phase, 'search');
  assert.ok(world.mission.state().contracts.every((c) => !c.locked));
});
