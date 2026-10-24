import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { LANTERN, carriesLight, carriesLantern } from '../src/shared/torch.js';
import { blackmireDepth, inBlackmire } from '../src/shared/blackmire.js';
import { carcassLoot } from '../src/shared/dinoRank.js';
import { freshBase } from '../src/shared/base.js';
import { ACT, MSG, PF } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, worldOptions, restoreWorld } from '../src/sim/worldSave.js';

test("the swamp's Blackmire lies round a dry knoll by its biggest far bog, with the egg on it, Elias' notes at the raft and in the mire", () => {
  for (const variant of [...new Set([levelDef(1).variant, 0, 2, 3])]) {
    const terrain = new Terrain(planIsland(1, variant));
    const L = buildLayout(terrain);
    const m = L.blackmire;
    assert.ok(m, `v${variant}: a Blackmire`);
    const part = L.relics.find((r) => r.site === 'blackmire');
    assert.ok(part && /Blackmire/.test(part.hint), `v${variant}: a boat part in it, with its own hint`);
    assert.equal(blackmireDepth(L, part.x, part.z), 1, 'deep in the dark');
    assert.ok(Math.hypot(m.x - L.hut.x, m.z - L.hut.z) > 100, 'far from the landing camp');
    assert.deepEqual(L.notes.map((n) => n.id).sort(), ['blackmire', 'raft']);
    const mire = L.notes.find((n) => n.id === 'blackmire');
    assert.ok(inBlackmire(L, mire.x, mire.z), 'the note from the mire lies in it');
    const raft = L.storyAnchors.raft;
    assert.ok(Math.hypot(raft.x - L.hut.campfire.x, raft.z - L.hut.campfire.z) < 70, 'the raft at the landing beach');
  }
  const jungle = buildLayout(new Terrain(planIsland(0, levelDef(0).variant)));
  assert.equal(jungle.blackmire, null);
  assert.equal(blackmireDepth(jungle, 0, 0), 0);
});

test('the swamp boss gives glowblood when butchered; the lantern flag counts as light', () => {
  assert.equal(carcassLoot({ type: 'alpha-sarcosuchus' }).bossBlood, 3);
  assert.equal(carriesLight(PF.TORCH | PF.LANTERN), true);
  assert.equal(carriesLantern(PF.TORCH), false);
  assert.equal(carriesLantern(PF.TORCH | PF.LANTERN), true);
});

function swamp() {
  const world = new ServerWorld({ send() {} }, { level: 1 });
  const p = world.players.get(world.join('Lamplighter').id);
  const act = (m) => world.receive(p.id, { t: MSG.ACT, ...m });
  let seq = 0;
  const state = (fl, x = p.x, z = p.z) => world.receive(p.id, { t: MSG.STATE, s: ++seq, k: p.epoch, x, y: world.terrain.heightAt(x, z), z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl });
  return { world, p, act, state };
}

test('the lantern is learned from the raft note, crafted at the base workbench, filled with glowblood and saved', () => {
  const { world, p, act } = swamp();
  world.base = { ...freshBase(), plot: 0, stage: 1 };
  const bench = world.stations().workbench;
  Object.assign(p, { x: bench.x + 1, z: bench.z, y: world.terrain.heightAt(bench.x + 1, bench.z) });
  Object.assign(world.store, { hide: 4, claws: 2, resin: 2 });
  act({ a: ACT.CRAFT, recipe: 'lantern' });
  assert.equal(p.inv.lantern, false, "not before Elias' note at the raft");
  world.story.notesRead.add('raft');
  act({ a: ACT.CRAFT, recipe: 'lantern' });
  assert.equal(p.inv.lantern, true);
  assert.ok(world.story.steps.has('lantern'));
  act({ a: ACT.CRAFT, recipe: 'lantern' });
  assert.equal(world.store.hide, 2, 'one lantern each');

  // fuel: none without glowblood, a vial burns LANTERN.burnTime, up to maxFuel
  act({ a: ACT.FUEL });
  assert.equal(p.inv.lanternFuel, 0);
  world.addLoot(p, 'bossBlood', 3);
  assert.ok(world.story.steps.has('glowblood'), 'carrying glowblood is a story step');
  act({ a: ACT.FUEL });
  assert.equal(p.inv.lanternFuel, LANTERN.burnTime);
  assert.ok(world.story.steps.has('fill'));
  act({ a: ACT.FUEL });
  assert.equal(p.inv.lanternFuel, LANTERN.maxFuel);
  act({ a: ACT.FUEL });
  assert.equal(p.inv.loot.bossBlood, 1, 'a full lantern takes no more');

  p.key = 'lamp';
  const data = JSON.parse(JSON.stringify(exportWorld(world)));
  const back = restoreWorld(new ServerWorld({ send() {} }, worldOptions(data)), data);
  const q = back.players.get(back.join('Lamplighter', null, undefined, undefined, 'lamp').id);
  assert.deepEqual([q.inv.lantern, q.inv.lanternFuel], [true, LANTERN.maxFuel]);
});

test('a lit lantern burns its glowblood away and goes out empty; only a lantern with glowblood may show the flag', () => {
  const { world, p, state } = swamp();
  state(PF.TORCH | PF.LANTERN);
  assert.equal(p.fl & (PF.TORCH | PF.LANTERN), 0, 'no lantern: no light');
  Object.assign(p.inv, { lantern: true, lanternFuel: 0 });
  state(PF.TORCH | PF.LANTERN);
  assert.equal(p.fl & PF.LANTERN, 0, 'an empty lantern does not burn');
  p.inv.lanternFuel = 3;
  state(PF.TORCH | PF.LANTERN);
  assert.equal(p.fl & PF.LANTERN, PF.LANTERN);
  for (let t = 0; t < 2; t += 0.05) world.step(0.05);
  assert.ok(p.inv.lanternFuel < 1.2 && p.inv.lanternFuel > 0.8, `burning: ${p.inv.lanternFuel}`);
  for (let t = 0; t < 2; t += 0.05) world.step(0.05);
  assert.equal(p.inv.lanternFuel, 0);
  assert.equal(p.fl & (PF.TORCH | PF.LANTERN), 0, 'out of glowblood: out');
});

test('in the Blackmire a torch chokes; the lantern keeps burning', () => {
  const { world, p, state } = swamp();
  const m = world.layout.blackmire;
  p.inv.torch = true;
  state(PF.TORCH, m.x + 1, m.z);
  assert.equal(p.fl & PF.TORCH, 0, 'the torch goes out in the mire');
  const out = { x: m.x + m.r + 30, z: m.z };
  Object.assign(p, { x: out.x, z: out.z, y: world.terrain.heightAt(out.x, out.z), lastMoveAt: world.now, moveBudget: 99 });
  state(PF.TORCH);
  assert.equal(p.fl & PF.TORCH, PF.TORCH, 'outside it burns');
  Object.assign(p.inv, { lantern: true, lanternFuel: 100 });
  Object.assign(p, { x: m.x + 1, z: m.z, y: world.terrain.heightAt(m.x + 1, m.z), lastMoveAt: world.now, moveBudget: 99 });
  state(PF.TORCH | PF.LANTERN);
  assert.equal(p.fl & (PF.TORCH | PF.LANTERN), PF.TORCH | PF.LANTERN);
});
