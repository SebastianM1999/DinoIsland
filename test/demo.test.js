import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { startGameHost } from '../server/gameHost.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { RECIPES, unlockIsland } from '../src/shared/crafting.js';

function demoWorld(opts = {}) {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { demo: true, ...opts });
  return { world, sent };
}
const skilled = { xp: 5000, bonus: 3, skills: { thickSkin: 1 } };

test('the demo is island 1 only, even when another island is asked for', () => {
  const { world } = demoWorld({ level: 2 });
  assert.equal(world.levelIndex, 0);
  assert.equal(world.fullState().demo, true);
  // island 1 has no building plots (no base, no raids) and only tier 1 upgrades
  assert.equal(world.layout.basePlots.length, 0);
  assert.ok(RECIPES.filter((r) => r.kind === 'upgrade' && unlockIsland(r) > 1).every((r) => unlockIsland(r) > world.layout.level.number));
  assert.equal(new ServerWorld({ send() {} }).fullState().demo, false, 'the full game is not the demo');
});

test('the demo takes two explorers, the full game four', () => {
  const { world } = demoWorld();
  assert.ok(world.join('Ana').ok !== false);
  assert.ok(world.join('Ben').ok !== false);
  const third = world.join('Cleo');
  assert.equal(third.ok, false);
  assert.match(third.reason, /2 players max in the demo/);
  assert.equal(world.players.size, CONFIG.demo.maxPlayers);

  const full = new ServerWorld({ send() {} });
  for (const name of ['A', 'B', 'C']) full.join(name);
  assert.equal(full.players.size, 3);
});

test('no firearms in the demo: none in the pack, gun actions do nothing, spear and bow work', () => {
  const { world } = demoWorld();
  const p = world.players.get(world.join('Hunter').id);
  assert.deepEqual(p.inv.guns, {});
  assert.equal(p.inv.spear, true);
  assert.equal(p.inv.bow, false);
  assert.equal(p.inv.arrows, 0, 'the demo also starts before finding the bow');
  p.eq = 4;   // (a pistol slot, if a client sent one)
  world.receive(p.id, { t: MSG.ACT, a: ACT.SHOT, kind: 'pistol', o: [p.x, p.y + 1.6, p.z], dir: [0, 0, -1] });
  world.receive(p.id, { t: MSG.ACT, a: ACT.RELOAD, kind: 'pistol' });
  p.inv.reloading = 'pistol'; p.reloadUntil = 0; world.step(0.05);   // (a reload in flight finds no gun)
  world.receive(p.id, { t: MSG.ACT, a: ACT.DROP, kind: 'pistol' });
  assert.deepEqual(p.inv.guns, {});
  // a stray firearm on the ground cannot be picked up either
  const it = world.spawnItem('rifle', p.x, p.z, 1);
  world.receive(p.id, { t: MSG.ACT, a: ACT.PICKUP, item: it.id });
  assert.deepEqual(p.inv.guns, {});
  // respawn, refill and creative mode bring none
  world.respawnPlayer(p);
  world.receive(p.id, { t: MSG.ACT, a: ACT.CREATIVE, on: true });
  world.step(0.6);
  assert.deepEqual(p.inv.guns, {});
});

test('demo explorers find their own bow once and keep it through respawn and the island 1 restart', () => {
  const { world, sent } = demoWorld();
  const a = world.players.get(world.join('Ana').id);
  const b = world.players.get(world.join('Ben').id);
  world.respawnPlayer(a);
  assert.equal(a.inv.bow, false);
  assert.equal(a.inv.arrows, 0);
  const camp = world.layout.bowCamp;
  Object.assign(a, { x: camp.x + 1, y: camp.y, z: camp.z });
  world.step(0.05);
  world.step(0.05);
  assert.equal(a.inv.bow, true);
  assert.equal(a.inv.arrows, CONFIG.weapons.bow.startArrows);
  assert.equal(b.inv.bow, false);
  assert.equal(sent.filter(({ msg }) => msg.e === EV.BOW_FOUND).length, 1);
  a.inv.arrows = 0; a.inv.arrowUses = [];
  world.respawnPlayer(a);
  assert.equal(a.inv.bow, true);
  assert.equal(a.inv.arrows, CONFIG.weapons.bow.startArrows);
  world.nextLevel();
  assert.equal(world.levelIndex, 0);
  assert.equal(a.inv.bow, true);
  assert.equal(b.inv.bow, false, 'an explorer who never visited the camp still has no bow');
  assert.deepEqual(a.inv.guns, {});
  assert.deepEqual(b.inv.guns, {});
});

test('no XP or skills in the demo: a saved profile is neither used nor overwritten', () => {
  const { world, sent } = demoWorld();
  const p = world.players.get(world.join('Hunter', undefined, undefined, skilled).id);
  assert.deepEqual(p.prof.skills, {}, 'saved skills do not count in the demo');
  assert.equal(p.maxHp, CONFIG.player.maxHealth);
  world.awardXp(500, 'Raptor');
  world.receive(p.id, { t: MSG.ACT, a: ACT.SKILL, op: 'buy', id: 'thickSkin' });
  assert.equal(p.prof.xp, 0);
  assert.deepEqual(p.prof.skills, {});
  assert.ok(!sent.some(({ msg }) => msg.t === MSG.PROF || msg.e === EV.XP), 'no profile or XP messages');

  // the full game keeps them
  const full = new ServerWorld({ send() {} });
  const q = full.players.get(full.join('Hunter', undefined, undefined, skilled).id);
  assert.equal(q.prof.skills.thickSkin, 1);
  assert.equal(Object.keys(q.inv.guns).length, 3);
});

test('the boat ends the demo: a win on island 1, then island 1 starts over', () => {
  const { world, sent } = demoWorld();
  const p = world.players.get(world.join('Captain').id);
  world.mission.phase = 'repaired';
  const b = world.layout.boat;
  p.x = b.x; p.z = b.z;
  for (let i = 0; i < 5; i++) world.mission.update(1);
  assert.equal(world.mission.state().complete, false, "the repaired boat waits for a player to set sail");
  world.receive(p.id, { t: MSG.ACT, a: ACT.SAIL });
  const m = world.mission.state();
  assert.equal(m.complete, true);
  assert.equal(m.won, true, 'the demo is won after island 1');
  assert.equal(m.demo, true);
  assert.ok(sent.some(({ msg }) => msg.e === EV.TOAST && /That was the demo/.test(msg.text)));
  const epoch = world.worldEpoch;
  for (let i = 0; i < 40 && world.worldEpoch === epoch; i++) world.mission.update(1);
  assert.equal(world.worldEpoch, epoch + 1, 'a fresh island');
  assert.equal(world.levelIndex, 0, 'island 1 again, never island 2');
  assert.equal(world.mission.phase, 'search');
});

test('a demo server says so in its status, with its own player cap', () => {
  const host = startGameHost(null, { demo: true });
  try {
    const s = host.status();
    assert.equal(s.demo, true);
    assert.equal(s.maxPlayers, CONFIG.demo.maxPlayers);
  } finally { host.stop(); }
  const full = startGameHost(null);
  try {
    assert.equal(full.status().demo, false);
    assert.equal(full.status().maxPlayers, CONFIG.net.maxPlayers);
  } finally { full.stop(); }
});
