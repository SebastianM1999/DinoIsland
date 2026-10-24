// The whole story in one expedition, driven through the real actions of the sim: from the beach of island 1 to
// the great eruption on Ashfall and the voyage home (docs/map-progression/14-story.md). Walking is skipped
// (explorers are set down where they go); everything else is what a player does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY } from '../src/shared/story.js';
import { freshBase } from '../src/shared/base.js';
import { insideSwampArena } from '../src/shared/swampArena.js';
import { ACT, MSG, PF } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';
import { reuseCaveWalk } from './helpers/caveFixture.js';

function expedition() {
  const world = new ServerWorld({ send() {} }, { level: 0 });
  const p = world.players.get(world.join('Ada', null, undefined, undefined, 'ada').id);
  const act = (m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const run = (s) => { for (let t = 0; t < s; t += 0.05) world.step(0.05); };
  const at = (o, dx = 0, dz = 0) => Object.assign(p, { x: o.x + dx, z: o.z + dz, y: world.terrain.heightAt(o.x + dx, o.z + dz), lastMoveAt: world.now, moveBudget: 99 });
  const read = (id) => { at(world.layout.notes.find((n) => n.id === id), 0.8); act({ a: ACT.READ, note: id }); };
  const relics = () => { for (const r of world.relics) { at(r); world.step(0.05); } };
  const sail = () => {
    const b = world.boatSpot();
    at(b.interact ?? b, 1.5);
    act({ a: ACT.REPAIR });
    act({ a: ACT.SAIL });
    assert.equal(world.mission.phase, 'sailing', `island ${world.levelIndex + 1}: under way`);
    const from = world.levelIndex;
    run(20);
    if (world.terrain.plan.cave) reuseCaveWalk(world.terrain);
    assert.notEqual(world.levelIndex, from, 'arrived somewhere else');
  };
  const done = (level) => STORY[level].filter((s) => !world.story.steps.has(s.id)).map((s) => s.id);
  return { world, p, act, run, at, read, relics, sail, done };
}

test('one expedition plays the whole story: beach, summit, wreck, swamp, Blackmire, Ashfall, the hollow mountain, the king, the eruption, home', () => {
  const { world, p, act, run, at, read, relics, sail, done } = expedition();

  // ---- island 1: washed ashore with nothing
  assert.deepEqual([p.inv.spear, p.inv.bow, world.mission.phase], [false, false, 'explore']);
  read('jonas');
  at(world.layout.arrival.spear, 0.3); world.step(0.05);
  assert.equal(p.inv.spear, true, "Jonas' spear");
  at(world.layout.arrival.fire, 1.5); act({ a: ACT.BASE, op: 'kindle' });
  assert.equal(world.base.fireLit, true);
  read('peak');
  at(world.layout.bowCamp, 0.5); world.step(0.05);
  assert.equal(p.inv.bow, true, "Elias' bow");
  relics();   // (found on the way, before the wreck)
  at(world.layout.boat, 6); run(0.6);
  assert.equal(world.mission.phase, 'search', 'the wreck opens the boat quest');
  assert.deepEqual(done(0), []);
  sail();

  // ---- island 2: the swamp
  assert.equal(world.levelIndex, 1);
  read('raft');
  world.base = { ...freshBase(), plot: 0, stage: 1 };
  Object.assign(world.store, { hide: 4, claws: 2, resin: 2 });
  at(world.stations().workbench, 1); act({ a: ACT.CRAFT, recipe: 'lantern' });
  assert.equal(p.inv.lantern, true);
  // the Alpha Sarcosuchus, from inside its arena; then butchered with the knife for its glowblood
  const sarco = world.dinos.list.find((d) => d.type === 'alpha-sarcosuchus');
  const arena = world.layout.swampArena;
  at(arena, 2);
  assert.ok(insideSwampArena(world.layout, p.x, p.z));
  world.dinos.damage(sarco, 1e9, 'body', p.id);
  assert.equal(sarco.alive, false);
  run(3);
  sarco.settled = true;
  Object.assign(p, { x: sarco.x + 1.5, z: sarco.z, y: sarco.y });
  for (const k of Object.keys(p.inv.loot)) p.inv.loot[k] = 0;   // (room in the pack)
  act({ a: ACT.BUTCHER, dino: sarco.id });
  assert.ok(p.butcher, 'butchering');
  for (let t = 0; t < 12 && p.butcher; t += 0.05) { p.lastMoveAt = world.now; world.step(0.05); }
  // the carcass's loot falls beside it: pick up the glowblood (the client loots it on walking over)
  const blood = [...world.items.values()].filter((it) => it.kind === 'bossBlood');
  assert.ok(blood.length, 'glowblood fell from the carcass');
  for (const it of blood) { Object.assign(p, { x: it.x, z: it.z, y: it.y ?? world.terrain.heightAt(it.x, it.z) }); act({ a: ACT.PICKUP, item: it.id }); }
  assert.ok(p.inv.loot.bossBlood > 0, 'glowblood in the pack');
  act({ a: ACT.FUEL });
  assert.ok(p.inv.lanternFuel > 0);
  read('blackmire');
  relics();
  assert.deepEqual(done(1), []);
  sail();

  // ---- island 3: Ashfall, first visit
  assert.equal(world.levelIndex, 2);
  read('station');
  at(world.layout.storyAnchors.gate, 0, 0); run(0.6);
  at(world.layout.storyAnchors.gate); act({ a: ACT.GATE });
  assert.equal(world.story.gateOpen, false, 'sealed: the crystal is in the hollow mountain');
  relics();
  assert.equal(world.destination(), 3);
  sail();

  // ---- 3b: the hollow mountain
  assert.equal(world.levelIndex, 3);
  assert.equal(world.mission.phase, 'explore');
  read('wall');
  const crystal = world.layout.resourceSpots.find((s) => s.type === 'crystal');
  for (const k of Object.keys(p.inv.loot)) p.inv.loot[k] = 0;
  at(crystal); act({ a: ACT.GATHER, spot: crystal.id });
  read('diary');
  at(world.layout.storyAnchors.eliasCamp.seal); run(0.6);
  assert.equal(world.story.sealCrystal, true);
  assert.deepEqual(done(3), []);
  sail();

  // ---- Ashfall again: the gate, the king, the eruption
  assert.equal(world.levelIndex, 2);
  assert.equal(world.mission.phase, 'repaired', 'the boat waits');
  assert.equal(world.relics.every((r) => r.found), true, 'Ashfall as the team left it');
  at(world.layout.storyAnchors.gate); act({ a: ACT.GATE });
  assert.equal(world.story.gateOpen, true);
  const king = world.dinos.list.find((d) => d.type === 'trex' && d.boss);
  at(world.layout.volcanoArena, 4);
  world.dinos.damage(king, 1e9, 'body', p.id);
  assert.equal(world.volcano.phase, 'cataclysm');
  // a save in the middle of the eruption is a fine place to stop and come back
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  assert.equal(restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data).volcano.phase, 'cataclysm');
  p.creative = true;   // (the bombs aside)
  const b = world.boatSpot();
  at(b.interact ?? b, 1.5); act({ a: ACT.SAIL });
  assert.equal(world.mission.state().won, true, 'escaped');
  assert.deepEqual(done(2), []);
  assert.equal(world.story.notesRead.size, 7, 'every note of the story read');
  run(20);
  assert.equal(world.levelIndex, 0, 'home: the next voyage starts a new adventure');
  assert.equal(p.fl & PF.LANTERN, 0);
});
