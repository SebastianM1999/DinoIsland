// The story with a team: what one explorer finds is the team's, everyone sees it, and a latecomer joins the
// story where the team is (server/gameHost.js and the Steam bridge carry these same messages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { reuseCaveWalk } from './helpers/caveFixture.js';

function team(level) {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level });
  if (world.terrain.plan.cave) reuseCaveWalk(world.terrain);
  const join = (name) => world.players.get(world.join(name).id);
  const at = (p, o, dx = 0) => Object.assign(p, { x: o.x + dx, z: o.z, y: world.terrain.heightAt(o.x + dx, o.z) });
  // what player `p` received: messages to them or to everyone
  const got = (p, e) => sent.filter(({ to, msg }) => (to === p.id || to === '*') && msg.e === e).map(({ msg }) => msg);
  const welcome = (p) => sent.filter(({ to, msg }) => to === p.id && msg.t === MSG.WELCOME).at(-1).msg;
  return { world, join, at, got, welcome, sent };
}

test("one explorer reads, the whole team's journal and quest log follow; a latecomer gets both in the welcome", () => {
  const { world, join, at, got, welcome } = team(0);
  const a = join('Ana'), b = join('Ben');
  at(a, world.layout.notes.find((n) => n.id === 'jonas'), 0.8);
  world.receive(a.id, { t: MSG.ACT, a: ACT.READ, note: 'jonas' });
  assert.ok(got(b, EV.NOTE).some((m) => m.id === 'jonas' && m.first), 'Ben hears of it');
  assert.ok(got(b, EV.MISSION).at(-1).mission.objectives[0].done, "and his quest log ticks the step");
  const c = join('Cy');
  assert.deepEqual(welcome(c).world.story.notes, ['jonas']);
  assert.equal(welcome(c).world.story.introSeen, false, 'the intro still plays for an early latecomer');
  assert.ok(welcome(c).world.mission.objectives[0].done);
});

test('every explorer takes their own spear; the fire lit by one heals all', () => {
  const { world, join, at } = team(0);
  const a = join('Ana'), b = join('Ben');
  at(a, world.layout.arrival.spear, 0.3);
  world.step(0.05);
  assert.deepEqual([a.inv.spear, b.inv.spear], [true, false]);
  at(b, world.layout.arrival.spear, -0.3);
  world.step(0.05);
  assert.equal(b.inv.spear, true);
  at(a, world.layout.arrival.fire, 1.5);
  world.receive(a.id, { t: MSG.ACT, a: ACT.BASE, op: 'kindle' });
  at(b, world.layout.arrival.fire, -1.5);
  b.hp = 30;
  world.step(1);
  assert.ok(b.hp > 35, 'Ben heals at the fire Ana lit');
});

test('the seal crystal is the team\'s: one takes it, the boat back waits for everyone at the west cove', () => {
  const { world, join, at, got } = team(3);
  const a = join('Ana'), b = join('Ben');
  at(a, world.layout.storyAnchors.eliasCamp.seal);
  for (let t = 0; t < 0.6; t += 0.05) world.step(0.05);
  assert.ok(got(b, EV.STORY).some((m) => m.story.sealCrystal), 'Ben sees it taken');
  const cove = world.layout.arrivalBoat;
  at(a, cove, 3);
  at(b, world.layout.storyAnchors.eliasCamp.camp);
  world.receive(a.id, { t: MSG.ACT, a: ACT.SAIL });
  assert.equal(world.mission.phase, 'repaired', 'not without Ben');
  at(b, cove, -3);
  world.receive(a.id, { t: MSG.ACT, a: ACT.SAIL });
  assert.equal(world.mission.phase, 'sailing');
  for (let t = 0; t < 10; t += 0.05) world.step(0.05);
  assert.equal(world.levelIndex, 2, 'both on Ashfall');
  assert.ok([a, b].every((p) => world.story.sealCrystal && p.alive));
});

test('the crater gate opened by one lets everyone in', () => {
  const { world, join, at, got } = team(2);
  const a = join('Ana'), b = join('Ben');
  world.story.sealCrystal = true;
  at(a, world.layout.storyAnchors.gate);
  world.receive(a.id, { t: MSG.ACT, a: ACT.GATE });
  assert.ok(got(b, EV.STORY).some((m) => m.story.gateOpen));
  const v = world.layout.volcanoArena;
  assert.equal(world.gateBlocks(b, v.x, v.z), false, 'Ben may walk in too');
});
