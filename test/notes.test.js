import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTES, NOTE_BY_ID, NOTE_REACH, placeNotes } from '../src/shared/notes.js';
import { LEVELS } from '../src/shared/levels.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test('every story note has a unique id, an existing island, an anchor and readable text', () => {
  assert.equal(new Set(NOTES.map((n) => n.id)).size, NOTES.length);
  for (const n of NOTES) {
    assert.ok(Number.isInteger(n.island) && n.island >= 0 && n.island < LEVELS.length, `${n.id}: island`);
    assert.ok(typeof n.at === 'string' && n.at, `${n.id}: anchor`);
    assert.ok(['bottle', 'paper', 'book', 'wall'].includes(n.prop), `${n.id}: prop`);
    assert.ok(n.title && n.author && n.text.length >= 2 && n.text.every((t) => typeof t === 'string' && t.length > 10), `${n.id}: text`);
    assert.equal(NOTE_BY_ID[n.id], n);
  }
});

test('a note lies only on its own island and only where its anchor was placed', () => {
  const anchors = { skeleton: { x: 1, y: 2, z: 3, rot: 0.5 }, raft: { x: 9, y: 0, z: 9 } };
  assert.deepEqual(placeNotes(0, anchors), [{ id: 'jonas', prop: 'bottle', x: 1, y: 2, z: 3, rot: 0.5 }]);
  assert.deepEqual(placeNotes(1, anchors).map((n) => n.id), ['raft']);
  assert.deepEqual(placeNotes(2, anchors), []);
});

function setup() {
  const world = new ServerWorld({ send() {} }, { level: 0 });
  const { id } = world.join('Reader');
  const p = world.players.get(id);
  const events = [];
  const orig = world.event.bind(world);
  world.event = (e, data) => { events.push({ e, ...data }); return orig(e, data); };
  const read = (note) => world.receive(id, { t: MSG.ACT, a: ACT.READ, note });
  return { world, p, id, events, read };
}

test("island 1 has Jonas' message on dry, standable ground", () => {
  const { world } = setup();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  assert.ok(n, 'the message in a bottle lies on island 1');
  assert.equal(world.terrain.waterLevelAt(n.x, n.z), null);
  assert.ok(Math.abs(n.y - world.terrain.heightAt(n.x, n.z)) < 0.01);
  assert.ok(world.layout.notes.every((x) => NOTE_BY_ID[x.id].island === 0));
});

test('server: a note is read only within reach; the first reading joins the journal once and the full state', () => {
  const { world, p, events, read } = setup();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  // too far away: nothing
  Object.assign(p, { x: n.x + NOTE_REACH + 6, z: n.z, y: n.y });
  read('jonas');
  assert.equal(world.story.notesRead.size, 0);
  assert.equal(events.filter((ev) => ev.e === EV.NOTE).length, 0);
  // unknown or another island's note: nothing
  Object.assign(p, { x: n.x + 1, z: n.z, y: n.y });
  read('nope');
  read('raft');
  assert.equal(world.story.notesRead.size, 0);
  // close: read for the whole team
  read('jonas');
  assert.deepEqual([...world.story.notesRead], ['jonas']);
  assert.deepEqual(events.filter((ev) => ev.e === EV.NOTE), [{ e: EV.NOTE, id: 'jonas', by: p.id, first: true }]);
  assert.deepEqual(world.fullState().story.notes, ['jonas']);
  // reading it again opens it, but it is no news
  read('jonas');
  assert.deepEqual(events.filter((ev) => ev.e === EV.NOTE).map((ev) => ev.first), [true, false]);
  assert.equal(world.story.notesRead.size, 1);
});

test('a dead explorer cannot read', () => {
  const { world, p, read } = setup();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  Object.assign(p, { x: n.x + 1, z: n.z, y: n.y, alive: false });
  read('jonas');
  assert.equal(world.story.notesRead.size, 0);
});

test('the journal survives a save and an island change; a save without one starts empty', () => {
  const { world, p, read } = setup();
  const n = world.layout.notes.find((x) => x.id === 'jonas');
  Object.assign(p, { x: n.x + 1, z: n.z, y: n.y });
  read('jonas');
  const data = exportWorld(world);
  assert.deepEqual(data.story.notes, ['jonas']);
  const restored = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), JSON.parse(JSON.stringify(data)));
  assert.deepEqual([...restored.story.notesRead], ['jonas']);
  const old = { ...JSON.parse(JSON.stringify(data)), story: undefined };
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(old)), old).story.notesRead.size, 0);
  const junk = { ...JSON.parse(JSON.stringify(data)), story: { notes: ['jonas', 42, 'made-up'] } };
  assert.deepEqual([...restoreWorld(new ServerWorld({ send() {} }, worldOptions(junk)), junk).story.notesRead], ['jonas']);
  world.nextLevel();
  assert.deepEqual([...world.story.notesRead], ['jonas'], 'kept across islands');
});
