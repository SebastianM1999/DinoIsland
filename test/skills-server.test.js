// Server side of the skill tree: profile, XP, skill effects, downed + revive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT, EV, PF, EQUIP } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { MAX_XP, MAX_BONUS_POINTS, XP_BY_TYPE, RELIC_XP, xpForLevel, DASH } from '../src/shared/skills.js';

const P = CONFIG.player;
/** A profile with every point it could ever need (levels 30 + 12 bonus). */
const rich = (skills) => ({ xp: MAX_XP, bonus: MAX_BONUS_POINTS, skills });

/** One island, no wild dinosaurs, one player per profile (all parked far from the camp fire). */
function setup(...profiles) {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push({ to, msg }) }, { variant: 1 });
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const players = profiles.map((prof, i) => {
    const { id } = world.join(`P${i + 1}`, null, undefined, prof);
    return world.players.get(id);
  });
  // park everybody on dry land well away from the camp fire (it would heal them)
  const fire = world.stations().fire;
  const at = world.dinos.findFreeSpot({ type: 'raptor', radius: 0.7 }, fire.x + 60, fire.z);
  const put = (p, x, z) => { p.x = x; p.z = z; p.y = world.terrain.heightAt(x, z); };
  players.forEach((p, i) => put(p, at.x + i * 0.8, at.z));
  out.length = 0;
  const run = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) world.step(0.05); };
  const act = (p, m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const evs = (e, to) => out.filter((o) => o.msg.e === e && (to === undefined || o.to === to || o.to === '*')).map((o) => o.msg);
  const raptor = () => { const d = world.dinos.spawn('raptor', at.x + 30, at.z); return d; };
  return { world, players, out, run, act, evs, raptor, at, put };
}

const lethal = (world, p, src = 'raptor') => world.hurtPlayer(p, 10000, { src });

test('a joining profile is sanitised: budget, gates and unknown skills are dropped', () => {
  const { players: [p] } = setup({ xp: 1e12, bonus: 99, skills: { thickSkin: 99, dash: 3, bogus: 5, weakSpot: 3 } });
  assert.equal(p.prof.xp, MAX_XP);
  assert.equal(p.prof.bonus, MAX_BONUS_POINTS);
  assert.equal(p.prof.skills.thickSkin, 3);
  assert.equal(p.prof.skills.dash, undefined, 'the capstone needs ten points in its tree');
  assert.equal(p.prof.skills.bogus, undefined);
  assert.equal(p.maxHp, P.maxHealth + 30);
  assert.equal(p.hp, p.maxHp);
  const { players: [fresh] } = setup(undefined);
  assert.deepEqual(fresh.prof, { xp: 0, bonus: 0, skills: {} });
  assert.equal(fresh.maxHp, P.maxHealth);
  assert.equal(fresh.mods.meleeMul, 1);
});

test('the profile is sent after the welcome and the snapshot carries max HP', () => {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push(msg) }, { variant: 1 });
  world.join('Solo', null, undefined, { xp: 0, bonus: 2, skills: { thickSkin: 2 } });
  const types = out.map((m) => m.t);
  assert.ok(types.indexOf(MSG.PROF) > types.indexOf(MSG.WELCOME));
  assert.deepEqual(out.find((m) => m.t === MSG.PROF).prof, { xp: 0, bonus: 2, skills: { thickSkin: 2 } });
  const row = world.snapshot().p[0];
  assert.equal(row.length, 13);
  assert.equal(row[12], P.maxHealth + 20);
});

test('every player gets the XP of a dinosaur kill, and a level-up event', () => {
  const { world, players: [a, b], evs, raptor } = setup(undefined, { xp: xpForLevel(2) - 10, bonus: 0, skills: {} });
  const d = raptor();
  world.dinos.damage(d, 9999, 'body', a.id, 'spear');
  assert.equal(a.prof.xp, XP_BY_TYPE.raptor);
  assert.equal(b.prof.xp, xpForLevel(2) - 10 + XP_BY_TYPE.raptor);
  const ea = evs(EV.XP, a.id).find((m) => m.amount === XP_BY_TYPE.raptor);
  assert.ok(ea && ea.level === undefined && ea.free === 1);
  const eb = evs(EV.XP, b.id).find((m) => m.level);
  assert.equal(eb.level, 2);
  assert.equal(eb.free, 2);
  // a dead or far-away player counts too
  b.alive = false;
  world.dinos.damage(raptor(), 9999, 'body', a.id, 'spear');
  assert.equal(b.prof.xp, xpForLevel(2) - 10 + 2 * XP_BY_TYPE.raptor);
});

test('XP stops at the cap', () => {
  const { world, players: [a] } = setup({ xp: MAX_XP - 5, bonus: 0, skills: {} });
  world.awardXp(400, 'T-Rex');
  assert.equal(a.prof.xp, MAX_XP);
});

test('a boat part gives everyone XP and the finder\'s team one bonus point', () => {
  const { world, players: [a, b], run } = setup(undefined, undefined);
  const r = world.relics[0];
  a.x = r.x; a.z = r.z; a.y = r.y;
  run(0.1);
  assert.ok(r.found);
  for (const p of [a, b]) {
    assert.equal(p.prof.xp, RELIC_XP);
    assert.equal(p.prof.bonus, 1);
  }
});

test('buying is validated on the server; reset only works at camp', () => {
  const { world, players: [p], act, run } = setup({ xp: xpForLevel(5), bonus: 0, skills: {} });
  const buyIt = (id) => { run(0.2); act(p, { a: ACT.SKILL, op: 'buy', id }); };
  buyIt('bruteForce');
  assert.equal(p.prof.skills.bruteForce, 1);
  assert.equal(p.mods.meleeMul, 1.1);
  buyIt('weakSpot');                      // tier gate
  assert.equal(p.prof.skills.weakSpot, undefined);
  buyIt('constructor');                   // not a skill: ignored, never throws
  buyIt('__proto__');
  act(p, { a: ACT.SKILL, op: 'buy', id: { toString: () => 'bruteForce' } });
  for (let i = 0; i < 5; i++) buyIt('bruteForce');
  assert.equal(p.prof.skills.bruteForce, 3, 'max rank');
  // reset away from camp: refused
  run(0.2); act(p, { a: ACT.SKILL, op: 'reset' });
  assert.equal(p.prof.skills.bruteForce, 3);
  // at the hut fire: allowed
  const fire = world.stations().fire;
  p.x = fire.x; p.z = fire.z;
  run(0.2); act(p, { a: ACT.SKILL, op: 'reset' });
  assert.deepEqual(p.prof.skills, {});
  assert.equal(p.mods.meleeMul, 1);
});

test('buying works while dead (no pose needed) and rate-limits', () => {
  const { players: [p, q], act, run, world } = setup({ xp: xpForLevel(3), bonus: 0, skills: {} }, undefined);
  lethal(world, p);                       // q is alive -> downed
  assert.ok(p.downed);
  world.receive(p.id, { t: MSG.ACT, a: ACT.SKILL, op: 'buy', id: 'marksman', state: { s: 1, k: p.epoch, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 } });
  assert.equal(p.prof.skills.marksman, 1);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'steadyHands' });     // same instant: rate-limited
  assert.equal(p.prof.skills.steadyHands, undefined);
  run(0.2);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'steadyHands' });
  assert.equal(p.prof.skills.steadyHands, 1);
  assert.ok(q.alive);
});

test('Thick Skin raises max HP and current HP by the same amount', () => {
  const { players: [p], act, run } = setup({ xp: xpForLevel(2), bonus: 0, skills: {} });
  p.hp = 60;
  run(0.2);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'thickSkin' });
  assert.equal(p.maxHp, P.maxHealth + 10);
  assert.equal(p.hp, 70);
});

test('Brute Force, Marksman, Executioner and Weak Spot do the damage math', () => {
  const { world, players: [p, plain], raptor } = setup(rich({ bruteForce: 3, marksman: 3, weakSpot: 3, executioner: 3 }), undefined);
  const d = raptor();
  d.hp = d.maxHp = 100000;
  const hit = (who, amount, zone, weapon) => { const before = d.hp; world.dinos.damage(d, amount, zone, who.id, weapon); return before - d.hp; };
  assert.ok(Math.abs(hit(plain, 10, 'body', 'spear') - 10) < 1e-9);
  assert.ok(Math.abs(hit(p, 10, 'body', 'spear') - 13) < 1e-6, 'Brute Force +30%');
  assert.ok(Math.abs(hit(p, 10, 'body', 'pistol') - 13) < 1e-6, 'Marksman +30%');
  assert.ok(Math.abs(hit(p, 10, 'body', 'arrow') - 10) < 1e-9, 'arrows are neither');
  // weak spot: only the bonus part of the zone multiplier grows (head x2 -> x2.45), armour is untouched
  assert.ok(Math.abs(hit(p, 10, 'head', 'arrow') - 24.5) < 1e-6);
  assert.ok(Math.abs(hit(p, 10, 'plates', 'arrow') - 3.5) < 1e-6);
  // Executioner: under 25% HP
  d.hp = 25000;
  assert.ok(Math.abs(hit(p, 10, 'body', 'arrow') - 10 * 1.45) < 1e-6);
  d.hp = 25001;
  assert.ok(Math.abs(hit(p, 10, 'body', 'arrow') - 10) < 1e-6);
});

test('Sprint Strike doubles only the first hit after a sprint starts', () => {
  const { world, players: [p], raptor } = setup(rich({ bruteForce: 3, marksman: 1, sprintStrike: 1 }));
  const d = raptor();
  d.hp = d.maxHp = 100000;
  const state = (s, fl) => world.receive(p.id, { t: MSG.STATE, s, k: p.epoch, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 5, eq: 0, fl });
  const hit = () => { const b = d.hp; world.dinos.damage(d, 10, 'body', p.id, 'arrow'); return b - d.hp; };
  assert.equal(hit(), 10, 'no sprint, no bonus');
  state(1, PF.SPRINT);
  assert.equal(hit(), 20);
  assert.equal(hit(), 10, 'consumed');
  state(2, PF.SPRINT);
  assert.equal(hit(), 10, 'still the same sprint');
  state(3, 0); state(4, PF.SPRINT);
  assert.equal(hit(), 20, 'a new sprint arms it again');
});

test('Bloodlust heals on a kill and boosts damage for a while without stacking', () => {
  const { world, players: [p], raptor, run } = setup(rich({ bloodlust: 1, bruteForce: 3, marksman: 3, steadyHands: 3, weakSpot: 1 }));
  p.hp = 40;
  const d = raptor();
  world.dinos.damage(d, 9999, 'body', p.id, 'spear');
  assert.ok(Math.abs(p.hp - (40 + 0.15 * p.maxHp)) < 1e-9);
  const e = raptor(); e.hp = e.maxHp = 100000;
  const b = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((b - e.hp) - 12) < 1e-6);
  const until = p.bloodlustUntil;
  run(1);
  world.dinos.damage(raptor(), 9999, 'body', p.id, 'arrow');
  assert.ok(p.bloodlustUntil > until && p.bloodlustUntil <= world.now + 8 + 1e-6, 'refreshed, not extended');
  const c = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((c - e.hp) - 12) < 1e-6, 'x1.2, not x1.44');
  run(9);
  const f = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((f - e.hp) - 10) < 1e-6, 'wore off');
});

test('Steady Hands shortens the reload and the Butchers Eye the knife time', () => {
  const { world, players: [p], act, raptor, put } = setup(rich({ steadyHands: 3, bruteForce: 3, marksman: 1, butchersEye: 1 }));
  p.eq = EQUIP.indexOf('pistol');
  p.inv.guns.pistol.loaded = 0;
  act(p, { a: ACT.RELOAD, kind: 'pistol' });
  assert.ok(Math.abs(p.reloadUntil - (world.now + CONFIG.weapons.pistol.reloadTime * 0.7)) < 1e-9);
  const d = raptor();
  put(p, d.x - 1.5, d.z); d.x = p.x + 1.5; d.z = p.z;
  world.dinos.kill(d, p.id);
  act(p, { a: ACT.BUTCHER, dino: d.id });
  assert.ok(Math.abs(p.butcher.until - (world.now + CONFIG.dinos.raptor.butcher.time * 0.5)) < 1e-9);
});

test('Unshakable removes knockback and knockdown; rank 1 halves the knockback', () => {
  const { world, players: [p, h], evs } = setup(rich({ thickSkin: 3, regeneration: 1, unshakable: 2 }), rich({ thickSkin: 3, regeneration: 1, unshakable: 1 }));
  world.hurtPlayer(p, 5, { kx: 4, kz: -2, down: 1, src: 'trex' });
  const e = evs(EV.HURT).at(-1);
  assert.equal(e.kx + 0, 0); assert.equal(e.kz + 0, 0); assert.equal(e.down, 0);   // (+ 0: -0 is fine)
  world.hurtPlayer(h, 5, { kx: 4, kz: -2, down: 1, src: 'trex' });
  const f = evs(EV.HURT).at(-1);
  assert.equal(f.kx, 2); assert.equal(f.kz, -1); assert.equal(f.down, 1);
});

test('Stalker shrinks the radius within which dinosaurs notice you', () => {
  const { world, players: [hidden, plain], raptor, put, at } = setup(rich({ deepLungs: 3, secondWind: 1, stalker: 3 }), undefined);
  const d = raptor();
  d.x = at.x; d.z = at.z;
  put(hidden, at.x, at.z + 40);   // 40 m
  put(plain, at.x, at.z + 300);
  assert.equal(world.dinos.nearestPlayer(d, 50), null, '50 * 0.7 = 35 < 40');
  assert.equal(world.dinos.nearestPlayer(d, 60), hidden);
  put(plain, at.x, at.z + 40);
  assert.equal(world.dinos.nearestPlayer(d, 50), plain);
});

test('Regeneration heals out of combat after the delay; Healing Aura heals teammates', () => {
  const { players: [r, m, n], run, put, at } = setup(rich({ thickSkin: 3, regeneration: 2 }), rich({ thickSkin: 3, regeneration: 1, healingAura: 3 }), undefined);
  put(r, at.x, at.z); put(m, at.x, at.z + 50); put(n, at.x + 2, at.z + 50);
  for (const p of [r, m, n]) { p.hp = 50; p.lastHurtAt = 0; }
  run(7);
  assert.equal(r.hp, 50, 'delay not over');
  run(2);
  assert.ok(r.hp > 50 && r.hp < 54, `1 HP/s after 8 s (got ${r.hp})`);
  // the aura heals the plain teammate (1.5 HP/s) from the start; the aura owner only regenerates
  assert.ok(n.hp > 60 && n.hp < 66, `aura ${n.hp}`);
  assert.ok(m.hp < 52, `owner ${m.hp}`);
});

test('Hearty Appetite scales fruit healing; Field Medic feeds a teammate', () => {
  const { players: [a, b], act, run, evs } = setup(rich({ thickSkin: 3, regeneration: 1, heartyAppetite: 3, fieldMedic: 1 }), undefined);
  a.inv.fruit = Array(2).fill(Object.keys(CONFIG.fruit.types)[0]);
  const heal = CONFIG.fruit.types[a.inv.fruit[0]].heal;
  a.hp = 10; a.lastHurtAt = 0;
  act(a, { a: ACT.EAT });
  run(CONFIG.fruit.eatTime + 0.2);
  assert.ok(Math.abs(a.hp - Math.min(a.maxHp, 10 + heal * 1.75)) < 0.5);
  b.hp = 10;
  act(a, { a: ACT.GIVE, to: b.id, heal: true });
  assert.equal(b.inv.fruit.length, 0);
  assert.equal(a.inv.fruit.length, 0);
  assert.ok(b.hp > 10);
  assert.ok(evs(EV.HEAL).some((m) => m.id === b.id && m.by === a.id));
  // plain GIVE still hands the fruit over
  a.inv.fruit = [Object.keys(CONFIG.fruit.types)[0]];
  act(a, { a: ACT.GIVE, to: b.id });
  assert.equal(b.inv.fruit.length, 1);
});

test('a lethal hit with a living teammate downs instead of killing; alone it kills', () => {
  const { world, players: [a, b], run, evs } = setup(undefined, undefined);
  a.inv.loot.meat = 2; a.inv.fruit = ['x'];
  lethal(world, a);
  assert.equal(a.alive, false);
  assert.equal(a.downed, true);
  assert.equal(a.downT, P.bleedOutTime);
  assert.equal(a.inv.loot.meat, 2, 'loot stays while downed');
  assert.equal(a.inv.fruit.length, 1);
  assert.equal(evs(EV.DOWN).length, 1);
  assert.equal(evs(EV.DEATH).length, 0);
  assert.ok(world.snapshot().p.find((r) => r[0] === a.id)[8] & PF.DOWNED);
  // no auto respawn, no movement
  run(P.respawnDelay + 2);
  assert.ok(a.downed && !a.alive);
  const { x } = a;
  world.receive(a.id, { t: MSG.STATE, s: 5, k: a.epoch, x: x + 1, y: a.y, z: a.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  assert.equal(a.x, x);
  // damage to a downed player is ignored
  world.hurtPlayer(a, 50, {});
  assert.ok(a.downed);
  assert.ok(b.alive);

  const solo = setup(undefined);
  solo.players[0].inv.loot.meat = 1;
  lethal(solo.world, solo.players[0]);
  assert.equal(solo.players[0].downed, false);
  assert.equal(solo.evs(EV.DEATH).length, 1);
  assert.equal(solo.players[0].inv.loot.meat, 0);
});

test('dinosaurs ignore downed players', () => {
  const { world, players: [a, b], raptor, run, put, at } = setup(undefined, undefined);
  lethal(world, a);
  const d = raptor();
  d.x = a.x + 3; d.z = a.z;
  put(b, at.x, at.z + 400);
  assert.equal(world.dinos.nearestPlayer(d, 20), null);
  const hp = a.hp;
  run(2);
  assert.equal(a.hp, hp);
});

test('a teammate revives a downed player; Rescuer shortens it; they stand where they fell', () => {
  const { world, players: [a, b], run, act, evs, out } = setup(undefined, rich({ thickSkin: 3, regeneration: 1, rescuer: 2 }));
  lethal(world, a);
  const at = { x: a.x, z: a.z };
  b.x = a.x + 1; b.z = a.z;
  out.length = 0;
  act(b, { a: ACT.REVIVE, to: a.id });
  const start = evs(EV.REVIVE).at(-1);
  assert.equal(start.id, b.id); assert.equal(start.to, a.id);
  assert.ok(Math.abs(start.t - P.reviveTime * 0.3) < 0.011);
  run(P.reviveTime * 0.3 - 0.2);
  assert.ok(a.downed, 'not yet');
  run(0.4);
  assert.ok(a.alive && !a.downed);
  assert.equal(a.hp, Math.ceil(P.reviveHpFrac * a.maxHp));
  assert.deepEqual({ x: a.x, z: a.z }, at);
  const rv = evs(EV.REVIVED).at(-1);
  assert.equal(rv.id, a.id); assert.equal(rv.by, b.id);
  assert.ok(out.some((o) => o.to === a.id && o.msg.t === MSG.CORRECT && o.msg.k === a.epoch), 'prediction reset');
  assert.ok(a.epoch >= 1);
  world.hurtPlayer(a, 30, {});
  assert.equal(a.hp, Math.ceil(P.reviveHpFrac * a.maxHp), 'short invulnerability');
  run(1.6);
  world.hurtPlayer(a, 30, {});
  assert.ok(a.hp < Math.ceil(P.reviveHpFrac * a.maxHp));
});
test('reviving without Rescuer takes the full time, and is cancelled by stop, distance, damage or eating', () => {
  const { world, players: [a, b], run, act, evs } = setup(undefined, undefined);
  lethal(world, a);
  b.x = a.x + 1; b.z = a.z;
  act(b, { a: ACT.REVIVE, to: a.id });
  run(P.reviveTime - 0.3);
  assert.ok(a.downed);
  act(b, { a: ACT.REVIVE, stop: true });
  assert.equal(evs(EV.REVIVE).at(-1).t, 0);
  run(1);
  assert.ok(a.downed, 'stopped');
  act(b, { a: ACT.REVIVE, to: a.id });
  b.x += 5;                           // walks away
  run(0.2);
  assert.equal(b.reviving, null);
  b.x = a.x + 1;
  act(b, { a: ACT.REVIVE, to: a.id });
  world.hurtPlayer(b, 5, {});
  assert.equal(b.reviving, null, 'hurt');
  act(b, { a: ACT.REVIVE, to: a.id });
  b.inv.fruit = [Object.keys(CONFIG.fruit.types)[0]];
  act(b, { a: ACT.EAT });
  assert.equal(b.reviving, null, 'eating');
  b.eating = null;
  act(b, { a: ACT.REVIVE, to: a.id });
  run(P.reviveTime + 0.3);
  assert.ok(a.alive);
  // far away: refused
  const t = setup(undefined, undefined);
  lethal(t.world, t.players[0]);
  t.players[1].x = t.players[0].x + 20;
  t.act(t.players[1], { a: ACT.REVIVE, to: t.players[0].id });
  assert.equal(t.players[1].reviving, null);
});

test('a downed player bleeds out into a true death and respawns', () => {
  const { world, players: [a, b], run, evs } = setup(undefined, undefined);
  a.inv.loot.meat = 3;
  lethal(world, a);
  run(P.bleedOutTime - 1);
  assert.ok(a.downed);
  run(1.2);
  assert.ok(!a.downed && !a.alive);
  assert.equal(a.inv.loot.meat, 0, 'loot lost at true death');
  assert.equal(evs(EV.DEATH).length, 1);
  run(P.respawnDelay + 0.2);
  assert.ok(a.alive);
  assert.equal(a.hp, a.maxHp);
  assert.ok(b.alive);
});

test('when the last helper falls, downed players are defeated too', () => {
  const { world, players: [a, b], run, evs } = setup(undefined, undefined);
  lethal(world, a);
  assert.ok(a.downed);
  lethal(world, b);            // nobody left to revive b: true death
  assert.ok(!b.downed && !b.alive);
  run(0.1);
  assert.ok(!a.downed && !a.alive, 'a has no rescuer left');
  assert.equal(evs(EV.DEATH).length, 2);
  run(P.respawnDelay + 0.2);
  assert.ok(a.alive && b.alive);
});

test('a downed player may give up after the grace time', () => {
  const { world, players: [a], run, act } = setup(undefined, undefined);
  lethal(world, a);
  act(a, { a: ACT.RESPAWN });
  assert.ok(a.downed, 'too early');
  run(P.respawnDelay + 0.1);
  act(a, { a: ACT.RESPAWN });
  assert.ok(!a.downed && !a.alive);
  run(0.1);
  assert.ok(a.alive);
});

test('leaving while reviving, and sailing on while downed, stay consistent', () => {
  const { world, players: [a, b], act, run } = setup(undefined, undefined);
  lethal(world, a);
  b.x = a.x + 1; b.z = a.z;
  act(b, { a: ACT.REVIVE, to: a.id });
  world.leave(b.id);
  run(0.2);
  assert.ok(!a.downed, 'nobody left: defeated');
  const t = setup(undefined, undefined);
  lethal(t.world, t.players[0]);
  t.world.nextLevel();
  const [x, y] = t.players;
  assert.ok(x.alive && !x.downed && y.alive);
  assert.equal(x.hp, x.maxHp);
});

test('Last Stand survives one lethal hit per life with 2 s of invulnerability', () => {
  const { world, players: [p], run } = setup(rich({ thickSkin: 3, regeneration: 3, heartyAppetite: 3, fieldMedic: 1, lastStand: 1 }));
  world.hurtPlayer(p, 9999, {});
  assert.ok(p.alive);
  assert.equal(p.hp, 1);
  world.hurtPlayer(p, 9999, {});
  assert.ok(p.alive && p.hp === 1, 'invulnerable');
  run(2.2);
  world.hurtPlayer(p, 9999, {});
  assert.ok(!p.alive, 'only once per life');
  run(P.respawnDelay + 0.2);
  assert.ok(p.alive);
  world.hurtPlayer(p, 9999, {});
  assert.ok(p.alive && p.hp === 1, 'a new life, a new last stand');
});

test('Dash is validated (skill, cooldown) and grants the movement budget', () => {
  const { players: [d, plain], act, run, world } = setup(rich({ deepLungs: 3, secondWind: 3, efficientStride: 3, lightFeet: 1, dash: 1 }), undefined);
  d.moveBudget = 0; plain.moveBudget = 0;
  act(plain, { a: ACT.DASH });
  assert.equal(plain.moveBudget, 0, 'no skill');
  act(d, { a: ACT.DASH });
  assert.equal(d.moveBudget, DASH.distance + 1);
  act(d, { a: ACT.DASH });
  assert.equal(d.moveBudget, DASH.distance + 1, 'cooldown');
  // after the cooldown a new dash lifts the movement cap for a moment (cap is 6 otherwise)
  run(DASH.cooldown + 0.1);
  d.moveBudget = 6; d.lastMoveAt = world.now;
  act(d, { a: ACT.DASH });
  assert.equal(d.moveBudget, 6 + DASH.distance + 1);
  world.receive(d.id, { t: MSG.STATE, s: 1, k: d.epoch, x: d.x, y: d.y, z: d.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  assert.ok(d.moveBudget > 9, `cap lifted while dashing (${d.moveBudget})`);
  run(1);
  d.lastMoveAt = world.now;
  world.receive(d.id, { t: MSG.STATE, s: 2, k: d.epoch, x: d.x, y: d.y, z: d.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  assert.ok(d.moveBudget <= 6 + 1e-9, 'back to the normal reserve');
});
