// Expedition saves of the authoritative world (sim/worldSave.js + shared/saveSchema.js):
// export -> seal -> JSON -> check -> restore, and what a restored world does next.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, restoreWorld, worldOptions, sanitizeInventory, RAID_RESUME_DELAY } from '../src/sim/worldSave.js';
import { sealSave, checkSave, saveSummary, cleanSaveName, migrateSave, SAVE_SCHEMA, SAVE_CONTENT, validSaveId } from '../src/shared/saveSchema.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { MAX_XP, MAX_BONUS_POINTS } from '../src/shared/skills.js';
import { LEVELS } from '../src/shared/levels.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const quiet = () => ({ send() {} });

/** Export a world, push it through JSON like a file, check it and rebuild it. */
function reload(world, { checkpoint } = {}) {
  const doc = JSON.parse(JSON.stringify(sealSave({ id: ID, name: 'Test run', createdAt: 1, savedAt: 2, gen: 3, world: exportWorld(world) })));
  assert.deepEqual(checkSave(doc), { ok: true });
  const out = [];
  const fresh = new ServerWorld({ send: (to, msg) => out.push({ to, msg }), checkpoint }, worldOptions(doc.world));
  restoreWorld(fresh, doc.world);
  return { world: fresh, doc, out };
}

test('a saved expedition comes back with its island, clock, team progress and ground items', () => {
  const world = new ServerWorld(quiet(), { level: 1, alphas: true });
  for (let i = 0; i < 40; i++) world.step(0.05);
  world.store.meat = 7;
  world.upgrades.add('quiver');
  world.relics[0].found = true; world.relics[0].byName = 'Ada';
  world.mission.contracts[0].progress = 2;
  world.mission.stats.relics = 1;
  world.fruit[0].count = 0; world.fruit[0].regrowAt = world.now + 30;

  const drop = world.spawnItem('hide', world.layout.spawnPoints[0].x + 2, world.layout.spawnPoints[0].z, 3);
  const { world: back, doc } = reload(world);
  assert.equal(back.levelIndex, 1);
  assert.equal(back.variant, world.variant);
  assert.equal(back.now, Math.round(world.now * 1000) / 1000);
  assert.equal(back.store.meat, 7);
  assert.ok(back.upgrades.has('quiver'));
  assert.equal(back.relics[0].found, true);
  assert.equal(back.relics[0].byName, 'Ada');
  assert.equal(back.mission.contracts[0].progress, 2);
  assert.equal(back.mission.stats.relics, 1);
  assert.equal(back.fruit[0].count, 0);
  assert.equal(back.fruit[0].regrowAt, world.fruit[0].regrowAt);
  assert.equal(back.items.get(drop.id)?.n, 3);
  assert.ok(back.worldEpoch > 1, 'a restored world never accepts messages meant for the fresh one');
  // no id is ever handed out twice: every new id is above everything saved
  const saved = [...doc.world.items.map((i) => i.id), ...doc.world.carcasses.map((c) => c.id)];
  for (const d of back.dinos.list.filter((x) => x.alive)) assert.ok(!saved.includes(d.id));
  assert.ok(back.id() >= doc.world.nextId);
  assert.equal(saveSummary(doc).island, LEVELS[1].name);
});

test('the expedition keeps going after a load: regrowth, torches and the clock run on', () => {
  const world = new ServerWorld(quiet(), { level: 0 });
  assert.ok(world.fruit.length && world.resources.length);
  world.resources[0].up = false; world.resources[0].regrowAt = world.now + 40;
  world.fruit.forEach((f) => { f.count = 0; f.regrowAt = world.now + 1; });
  const { world: back } = reload(world);
  assert.equal(back.resources[0].up, false);
  for (let i = 0; i < 60; i++) back.step(0.05);
  assert.ok(back.fruit.some((f) => f.count > 0), 'fruit regrows on schedule after the load');
  assert.ok(back.torchSpawns.every((s) => s.item === null || back.items.has(s.item)));
});

test('an explorer gets their character back by roster key, never by name', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  const { id } = world.join('Ada', null, undefined, { xp: MAX_XP, bonus: MAX_BONUS_POINTS, skills: { thickSkin: 1 } }, 'owner');
  const p = world.players.get(id);
  p.inv.loot.meat = 4;
  p.inv.fruit = ['berry'];
  p.inv.arrows = 5; p.inv.arrowUses = Array(5).fill(1);
  const spot = world.layout.spawnPoints[2];
  p.x = spot.x; p.z = spot.z; p.y = world.terrain.heightAt(spot.x, spot.z);
  p.hp = 40;
  const { world: back } = reload(world);
  // somebody else with the same name is a new explorer
  const other = back.players.get(back.join('Ada', null, undefined, null, 'guest-1').id);
  assert.equal(other.prof.xp, 0);
  assert.equal(other.inv.loot.meat, 0);
  const me = back.players.get(back.join('Renamed', null, undefined, null, 'owner').id);
  assert.equal(me.prof.xp, MAX_XP);
  assert.equal(me.prof.skills.thickSkin, 1);
  assert.equal(me.inv.loot.meat, 4);
  assert.deepEqual(me.inv.fruit, ['berry']);
  assert.equal(me.inv.arrows, 5);
  assert.equal(me.hp, 40);
  assert.ok(Math.hypot(me.x - spot.x, me.z - spot.z) < 0.01, 'back where they stood');
  assert.equal(back.join('Again', null, undefined, null, 'owner').ok, false, 'one roster key is in the world only once');
});

test('leaving keeps the character in the expedition, and the next join takes it back exactly once', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  const checkpoints = [];
  world.host.checkpoint = (r) => checkpoints.push(r);
  const { id } = world.join('Ada', null, undefined, null, 'owner');
  world.players.get(id).inv.loot.hide = 6;
  world.leave(id);
  assert.deepEqual(checkpoints, ['leave']);
  assert.equal(world.roster.get('owner').inv.loot.hide, 6);
  const { world: back } = reload(world);
  const again = back.players.get(back.join('Ada', null, undefined, null, 'owner').id);
  assert.equal(again.inv.loot.hide, 6);
  assert.equal(back.roster.has('owner'), false, 'no second copy waits in the roster');
  assert.equal(again.inv.traps, CONFIG.weapons.trap.startCount, 'no second starter kit on top of the saved one');
});

test('transient states are normalized on save: reloads, eating, downed and dead explorers', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  const a = world.players.get(world.join('A', null, undefined, null, 'a').id);
  const b = world.players.get(world.join('B', null, undefined, null, 'b').id);
  const c = world.players.get(world.join('C', null, undefined, null, 'c').id);
  a.inv.guns.pistol.loaded = 1; a.inv.reloading = 'pistol';
  const reserve = a.inv.guns.pistol.reserve;
  a.inv.fruit = []; a.eating = { type: 'berry', t: 1 };
  b.inv.loot.meat = 5; b.alive = false; b.downed = true;
  c.alive = false; c.deadT = 3;
  const { world: back } = reload(world);
  const a2 = back.players.get(back.join('A', null, undefined, null, 'a').id);
  assert.equal(a2.inv.reloading, null);
  assert.equal(a2.inv.guns.pistol.loaded, 1, 'a cancelled reload neither loses nor gains ammo');
  assert.equal(a2.inv.guns.pistol.reserve, reserve);
  assert.deepEqual(a2.inv.fruit, ['berry'], 'the fruit being eaten goes back into the pack');
  const b2 = back.players.get(back.join('B', null, undefined, null, 'b').id);
  assert.equal(b2.inv.loot.meat, 0, 'downed counts as defeated: the carried loot is lost');
  assert.equal(b2.alive, true);
  assert.equal(b2.hp, b2.maxHp);
  const sp = back.spawnPoint(b2.slot);
  assert.ok(Math.hypot(b2.x - sp.x, b2.z - sp.z) < 0.01, 'a defeated explorer comes back at the camp');
});

test('a killed boss stays dead, a wounded boss keeps its wounds, carcasses can still be butchered', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  const boss = world.dinos.list.find((d) => d.boss);
  assert.ok(boss, 'island 2 has its boss');
  boss.hp = Math.floor(boss.maxHp / 3);
  let { world: back } = reload(world);
  const wounded = back.dinos.list.find((d) => d.boss);
  assert.equal(wounded.hp, boss.hp);
  // now kill it: the carcass and the defeat survive the next load
  wounded.hp = 1;
  back.dinos.kill(wounded, null);
  assert.equal(wounded.alive, false);
  ({ world: back } = reload(back));
  assert.equal(back.dinos.list.some((d) => d.boss && d.alive), false, 'no resurrected boss');
  const carcass = back.dinos.get(wounded.id);
  assert.ok(carcass && !carcass.alive && carcass.deadT > 0);
  for (let i = 0; i < 20; i++) back.step(0.05);
  assert.ok(back.dinos.get(wounded.id), 'the carcass ticks without its AI');
});

test('a raid in progress is called off by a load and announced again later', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  world.raids.phase = 'active';
  const { world: back, doc } = reload(world);
  assert.equal(back.raids.phase, 'idle');
  assert.equal(doc.world.raids.nextAt, Math.round(world.now * 1000) / 1000 + RAID_RESUME_DELAY);
  assert.equal(back.raids.nextAt, doc.world.raids.nextAt);
});

test('the base keeps standing and colliding after a load', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  world.base.plot = 0;
  world.base.building = { stage: 1 };
  world.finishBuilding();
  const colliders = world.layout.colliders.length;
  const { world: back } = reload(world);
  assert.equal(back.base.stage, 1);
  assert.equal(back.layout.colliders.length, colliders);
});

test('creative mode marks the expedition for good', () => {
  const world = new ServerWorld(quiet(), { level: 0 });
  const { id } = world.join('A', null, undefined, null, 'owner');
  world.receive(id, { t: MSG.ACT, a: ACT.CREATIVE, on: true });
  world.receive(id, { t: MSG.ACT, a: ACT.CREATIVE, on: false });
  const { doc } = reload(world);
  assert.equal(doc.summary.creative, true);
});

test('checkpoints reach the host: new island, boat part and boss', () => {
  const reasons = [];
  const world = new ServerWorld({ send() {}, checkpoint: (r) => reasons.push(r) }, { level: 0 });
  world.join('A', null, undefined, null, 'owner');
  world.nextLevel();
  assert.ok(reasons.includes('island'));
  assert.equal(world.levelIndex, 1);
  const boss = world.dinos.list.find((d) => d.boss);
  world.dinos.kill(boss, null);
  assert.ok(reasons.includes('boss'));
  const [p] = world.players.values();
  const r = world.relics[0];
  p.x = r.x; p.z = r.z; p.y = r.y;
  world.step(0.05);
  assert.ok(reasons.includes('relic'));
});

test('a stored inventory is clamped to the world limits', () => {
  const world = new ServerWorld(quiet(), { level: 1 });
  const inv = sanitizeInventory(world, { arrows: 999, arrowUses: [1, 'x'], traps: -3, fruit: ['berry', 'poison', 'berry'], loot: { meat: 1e9, nope: 5 }, guns: { pistol: { loaded: 999, reserve: -1 } } });
  assert.equal(inv.arrows, world.caps().arrows);
  assert.equal(inv.arrowUses.length, inv.arrows);
  assert.equal(inv.traps, 0);
  assert.deepEqual(inv.fruit, ['berry', 'berry'].slice(0, world.caps().fruit));
  assert.equal(inv.loot.meat, 9999);
  assert.equal(inv.loot.nope, undefined);
  assert.equal(inv.guns.pistol.loaded, CONFIG.weapons.pistol.magazine);
  assert.equal(inv.guns.pistol.reserve, 0);
  assert.deepEqual(sanitizeInventory(world, null).loot, world.freshInventory().loot);
});

test('the save check refuses damaged, foreign and newer documents', () => {
  const world = new ServerWorld(quiet(), { level: 0 });
  const doc = sealSave({ id: ID, name: 'x', createdAt: 1, savedAt: 2, gen: 1, world: exportWorld(world) });
  assert.deepEqual(checkSave(doc), { ok: true });
  assert.equal(checkSave(null).ok, false);
  assert.equal(checkSave({ ...doc, kind: 'other' }).ok, false);
  assert.equal(checkSave({ ...doc, id: '../../etc' }).ok, false);
  const newer = checkSave({ ...doc, schema: SAVE_SCHEMA + 1 });
  assert.equal(newer.ok, false);
  assert.equal(newer.future, true);
  assert.equal(checkSave({ ...doc, content: SAVE_CONTENT + 1 }).future, true);
  const edited = JSON.parse(JSON.stringify(doc));
  edited.world.store.meat = 999;
  assert.equal(checkSave(edited).reason, 'checksum mismatch');
  for (const bad of [{ level: 99 }, { now: -1 }, { items: 'x' }, { store: [] }, { items: Array(5001).fill({}) }]) {
    const w = { ...doc.world, ...bad };
    assert.equal(checkSave({ ...doc, world: w, checksum: undefined }).ok, false);
  }
  assert.equal(checkSave({ ...doc, gen: -1 }).ok, false);
  assert.equal(checkSave({ ...doc, schema: 'x' }).ok, false);
});

test('a restore refuses a save whose island content no longer matches', () => {
  const world = new ServerWorld(quiet(), { level: 0 });
  const data = exportWorld(world);
  data.fruit.push({ count: 1, regrowAt: 0 });
  assert.throws(() => restoreWorld(new ServerWorld(quiet(), worldOptions(data)), data), /fruit spots/);
});

test('names, ids, summaries and migrations', () => {
  assert.equal(cleanSaveName('  Ada\'s   <b>run</b>  '), 'Ada\'s brunb');
  assert.equal(cleanSaveName(''), 'Expedition');
  assert.equal(cleanSaveName('x'.repeat(80)).length, 32);
  assert.equal(validSaveId(ID), true);
  assert.equal(validSaveId('CON'), false);
  assert.equal(validSaveId(42), false);
  const s = saveSummary({ id: ID, name: 7, summary: { level: 'x', party: ['a', 3] } });
  assert.equal(s.level, 0);
  assert.deepEqual(s.party, ['a']);
  assert.equal(s.savedAt, 0);
  assert.equal(saveSummary(null).name, 'Expedition');
  const doc = { kind: 'x', schema: SAVE_SCHEMA };
  assert.equal(migrateSave(doc), doc);
  assert.throws(() => migrateSave({ schema: 0 }), /No migration/);
});

test('a save is small enough to write often', () => {
  const world = new ServerWorld(quiet(), { level: 3, alphas: true });
  for (let i = 0; i < 4; i++) world.join(`P${i}`, null, undefined, null, `k${i}`);
  for (let i = 0; i < 100; i++) world.step(0.05);
  const t0 = performance.now();
  const text = JSON.stringify(sealSave({ id: ID, name: 'x', createdAt: 1, savedAt: 2, gen: 1, world: exportWorld(world) }));
  const ms = performance.now() - t0;
  assert.ok(text.length < 512 * 1024, `save is ${text.length} bytes`);
  assert.ok(ms < 100, `capture took ${ms.toFixed(1)} ms`);
});

test('events of a restored world reach the players who join it', () => {
  const world = new ServerWorld(quiet(), { level: 0 });
  const { world: back, out } = reload(world);
  back.join('A', null, undefined, null, 'owner');
  const welcome = out.find((o) => o.msg.t === MSG.WELCOME);
  assert.equal(welcome.msg.w, back.worldEpoch);
  assert.equal(welcome.msg.world.level.index, 0);
  assert.ok(out.some((o) => o.msg.e === EV.PLAYER_JOIN));
});

test('the volcano keeps its cycle, sinking columns and opened treasure across a load', () => {
  const level = LEVELS.findIndex((l) => l.biome === 'volcano');
  const world = new ServerWorld(quiet(), { level });
  const v = world.volcano;
  assert.ok(v.active);
  v.phase = 'erupt'; v.until = world.now + 12; v.nextAsh = world.now + 99;
  v.bombs.push({ x: 0, z: 0, y: 0, at: world.now + 1 });
  if (v.geysers[0]) Object.assign(v.geysers[0], { phase: 'warn', until: world.now + 3 });
  const column = world.layout.steps.findIndex((s, i) => s && world.layout.stepColliders?.[i]);
  assert.ok(column >= 0, 'the volcano has sinking columns');
  v.columns.set(column, world.now - 2);
  v.columns.set('gone', world.now);   // (an id this island no longer has is dropped on load)
  if (v.treasure) { v.treasure.opened = true; v.treasure.by = 'Ada'; }
  const { world: back } = reload(world);
  const b = back.volcano;
  assert.equal(b.phase, 'calm', 'an eruption in progress settles: its bombs are not saved');
  assert.deepEqual(b.bombs, []);
  assert.equal(b.nextAsh, Math.round(v.nextAsh * 1000) / 1000 || v.nextAsh);
  assert.equal(b.columns.get(column), v.columns.get(column));
  assert.equal(b.columns.has('gone'), false);
  if (v.geysers[0]) assert.equal(b.geysers[0].phase, 'warn');
  if (v.treasure) assert.deepEqual([b.treasure.opened, b.treasure.by], [true, 'Ada'], 'the lava treasure is not handed out twice');
  for (let i = 0; i < 20; i++) back.step(0.05);
});

test('a long-running expedition keeps everyone present and only the most recently seen absent explorers', async () => {
  const { ROSTER_KEEP } = await import('../src/sim/worldSave.js');
  const world = new ServerWorld(quiet(), { level: 0 });
  for (let i = 0; i < ROSTER_KEEP + 10; i++) world.roster.set(`guest-${i}`, { key: `guest-${i}`, name: `G${i}`, seen: i });
  world.join('Here', null, undefined, null, 'owner');
  const { doc } = reload(world);
  const keys = doc.world.roster.map((r) => r.key);
  assert.equal(keys.length, ROSTER_KEEP);
  assert.ok(keys.includes('owner'));
  assert.ok(keys.includes(`guest-${ROSTER_KEEP + 9}`), 'the most recent guest stays');
  assert.ok(!keys.includes('guest-0'), 'the longest gone is pruned');
  assert.equal(doc.world.roster.find((r) => r.key === 'owner').level, 0, 'records know their island');
});
