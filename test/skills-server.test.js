// Server side of the skill tree: profile, XP, skill effects, downed + revive (field cooldown, carrying, tonic).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT, EV, PF, EQUIP } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { MAX_XP, LEVEL_CAP, XP_BY_TYPE, RELIC_XP, xpForLevel, DASH } from '../src/shared/skills.js';
import { zoneMul } from '../src/shared/weakSpots.js';
import { BUTCHER_TIME } from '../src/shared/dinoRank.js';

const P = CONFIG.player;
/** A profile with every point it could ever need (the level cap pays for the whole tree). */
const rich = (skills) => ({ xp: MAX_XP, skills });

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
  const fire = world.layout.hut.campfire;
  const at = world.dinos.findFreeSpot({ type: 'raptor', radius: 0.7 }, fire.x + 60, fire.z);
  const put = (p, x, z) => { p.x = x; p.z = z; p.y = world.terrain.heightAt(x, z); };
  players.forEach((p, i) => put(p, at.x + i * 0.8, at.z));
  out.length = 0;
  const run = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) world.step(0.05); };
  const act = (p, m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const evs = (e, to) => out.filter((o) => o.msg.e === e && (to === undefined || o.to === to || o.to === '*')).map((o) => o.msg);
  const toasts = (to) => out.filter((o) => o.msg.e === EV.TOAST && (o.to === to || o.to === '*')).map((o) => o.msg.text);
  const raptor = () => { const d = world.dinos.spawn('raptor', at.x + 30, at.z); return d; };
  return { world, players, out, run, act, evs, toasts, raptor, at, put, fire };
}

const lethal = (world, p, src = 'raptor') => world.hurtPlayer(p, 10000, { src });

test('a joining profile is sanitised: budget, gates and unknown skills are dropped', () => {
  const { players: [p] } = setup({ xp: 1e12, bonus: 99, skills: { thickSkin: 99, dash: 3, bogus: 5, weakSpot: 3 } });
  assert.equal(p.prof.xp, MAX_XP);
  assert.equal('bonus' in p.prof, false, 'no bonus points any more');
  assert.equal(p.prof.skills.thickSkin, 3);
  assert.equal(p.prof.skills.dash, undefined, 'the capstone needs ten points in its tree');
  assert.equal(p.prof.skills.bogus, undefined);
  assert.equal(p.maxHp, P.maxHealth + 30);
  assert.equal(p.hp, p.maxHp);
  const { players: [fresh] } = setup(undefined);
  assert.deepEqual(fresh.prof, { xp: 0, skills: {} });
  assert.equal(fresh.maxHp, P.maxHealth);
  assert.equal(fresh.mods.damageMul, 1);
});

test('an explorer saved with removed skills joins with those points refunded', () => {
  const { players: [p], world, out } = setup({ xp: xpForLevel(6), bonus: 3, skills: { marksman: 2, bruteForce: 1, stalker: 2, unshakable: 1 } });
  assert.deepEqual(p.prof.skills, { weaponMastery: 2 });
  assert.equal(p.mods.damageMul, 1.2);
  world.sendProf(p);
  const prof = out.findLast((o) => o.to === p.id && o.msg.t === MSG.PROF).msg.prof;
  assert.deepEqual(prof, { xp: xpForLevel(6), skills: { weaponMastery: 2 } }, 'level 6: 6 points, 2 spent, 4 free again');
});

test('the profile is sent after the welcome and the snapshot carries max HP', () => {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push(msg) }, { variant: 1 });
  world.join('Solo', null, undefined, { xp: xpForLevel(2), skills: { thickSkin: 2 } });
  const types = out.map((m) => m.t);
  assert.ok(types.indexOf(MSG.PROF) > types.indexOf(MSG.WELCOME));
  assert.deepEqual(out.find((m) => m.t === MSG.PROF).prof, { xp: xpForLevel(2), skills: { thickSkin: 2 } });
  const row = world.snapshot().p[0];
  assert.equal(row.length, 13);
  assert.equal(row[12], P.maxHealth + 20);
});

test('every player gets the XP of a dinosaur kill, and a level-up event with exactly one more point', () => {
  const { world, players: [a, b], evs, raptor } = setup(undefined, { xp: xpForLevel(2) - 10, skills: {} });
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
  const { world, players: [a], evs } = setup({ xp: MAX_XP - 5, skills: {} });
  world.awardXp(400, 'T-Rex');
  assert.equal(a.prof.xp, MAX_XP);
  const n = evs(EV.XP).length;
  world.awardXp(400, 'T-Rex');
  assert.equal(evs(EV.XP).length, n, 'nothing changes at the cap: no event');
  assert.equal(world.players.get(a.id).prof.xp, MAX_XP);
  assert.equal(LEVEL_CAP, 40);
});

test('a boat part gives everyone XP but no skill point', () => {
  const { world, players: [a, b], run } = setup(undefined, undefined);
  const r = world.relics[0];
  a.x = r.x; a.z = r.z; a.y = r.y;
  run(0.1);
  assert.ok(r.found);
  for (const p of [a, b]) {
    assert.equal(p.prof.xp, RELIC_XP);
    assert.equal('bonus' in p.prof, false);
  }
});

test('buying is validated on the server; reset only works at camp', () => {
  const { world, players: [p], act, run } = setup({ xp: xpForLevel(5), skills: {} });
  const buyIt = (id) => { run(0.2); act(p, { a: ACT.SKILL, op: 'buy', id }); };
  buyIt('weaponMastery');
  assert.equal(p.prof.skills.weaponMastery, 1);
  assert.equal(p.mods.damageMul, 1.1);
  buyIt('weakSpot');                      // tier gate
  assert.equal(p.prof.skills.weakSpot, undefined);
  buyIt('marksman');                      // removed skill: ignored
  assert.equal(p.prof.skills.marksman, undefined);
  buyIt('constructor');                   // not a skill: ignored, never throws
  buyIt('__proto__');
  act(p, { a: ACT.SKILL, op: 'buy', id: { toString: () => 'weaponMastery' } });
  for (let i = 0; i < 5; i++) buyIt('weaponMastery');
  assert.equal(p.prof.skills.weaponMastery, 3, 'max rank');
  // reset away from camp: refused
  run(0.2); act(p, { a: ACT.SKILL, op: 'reset' });
  assert.equal(p.prof.skills.weaponMastery, 3);
  // at the hut fire: allowed
  const fire = world.layout.hut.campfire;
  p.x = fire.x; p.z = fire.z;
  run(0.2); act(p, { a: ACT.SKILL, op: 'reset' });
  assert.deepEqual(p.prof.skills, {});
  assert.equal(p.mods.damageMul, 1);
});

test('buying works while dead (no pose needed) and rate-limits', () => {
  const { players: [p, q], act, run, world } = setup({ xp: xpForLevel(3), skills: {} }, undefined);
  lethal(world, p);                       // q is alive -> downed
  assert.ok(p.downed);
  world.receive(p.id, { t: MSG.ACT, a: ACT.SKILL, op: 'buy', id: 'weaponMastery', state: { s: 1, k: p.epoch, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 } });
  assert.equal(p.prof.skills.weaponMastery, 1);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'steadyHands' });     // same instant: rate-limited
  assert.equal(p.prof.skills.steadyHands, undefined);
  run(0.2);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'steadyHands' });
  assert.equal(p.prof.skills.steadyHands, 1);
  assert.ok(q.alive);
});

test('Thick Skin raises max HP and current HP by the same amount', () => {
  const { players: [p], act, run } = setup({ xp: xpForLevel(2), skills: {} });
  p.hp = 60;
  run(0.2);
  act(p, { a: ACT.SKILL, op: 'buy', id: 'thickSkin' });
  assert.equal(p.maxHp, P.maxHealth + 10);
  assert.equal(p.hp, 70);
});

test('Weapon Mastery raises the damage of every weapon, but not of traps and towers', () => {
  const { world, players: [p, plain], raptor } = setup(rich({ weaponMastery: 3 }), undefined);
  const d = raptor();
  d.hp = d.maxHp = 100000;
  const hit = (who, weapon) => { const before = d.hp; world.dinos.damage(d, 10, 'body', who.id, weapon); return before - d.hp; };
  assert.ok(Math.abs(hit(plain, 'spear') - 10) < 1e-9);
  for (const weapon of ['spear', 'arrow', 'pistol', 'rifle', 'mpx', 'sniper']) assert.ok(Math.abs(hit(p, weapon) - 13) < 1e-6, weapon);
  for (const weapon of ['trap', 'tower']) assert.ok(Math.abs(hit(p, weapon) - 10) < 1e-9, weapon);
});

test('weak spots differ per species, and Weak Spot scales only their bonus part', () => {
  const { world, players: [p, plain], evs } = setup(rich({ weaponMastery: 1, steadyHands: 3, weakSpot: 3 }), undefined);
  const spawn = (type) => { const d = world.dinos.spawn(type, p.x + 30, p.z); d.hp = d.maxHp = 1e6; return d; };
  const hit = (who, d, zone) => { const before = d.hp; world.dinos.damage(d, 10, zone, who.id, 'trap'); return before - d.hp; };
  const raptor = spawn('raptor'), trex = spawn('trex'), stego = spawn('stego');
  // without the skill: the species' own table
  assert.ok(Math.abs(hit(plain, raptor, 'neck') - 20) < 1e-6, 'a raptor\'s thin neck');
  assert.ok(Math.abs(hit(plain, trex, 'neck') - 12) < 1e-6, 'a T-Rex\'s neck is no weak spot');
  assert.ok(Math.abs(hit(plain, trex, 'leg') - 18) < 1e-6, 'its legs are');
  assert.notEqual(zoneMul('raptor', 'head'), zoneMul('trex', 'head'));
  // Weak Spot rank 3: only the part above 1 grows (raptor neck x2 -> x2.45), armour is untouched
  assert.ok(Math.abs(hit(p, raptor, 'neck') - 24.5) < 1e-6);
  assert.ok(Math.abs(hit(p, stego, 'plates') - 3.5) < 1e-6);
  // the hit event says weak / armour, and an armoured hit names the species' weak spot
  const last = (id) => evs(EV.DINO_HIT).filter((m) => m.id === id).at(-1);
  hit(p, trex, 'leg');
  assert.equal(last(trex.id).weak, true);
  hit(p, trex, 'neck');
  assert.equal(last(trex.id).weak, false);
  hit(p, stego, 'plates');
  assert.equal(last(stego.id).armor, true);
  assert.equal(last(stego.id).aim, 'flank');
  // every species in the game has a weak spot of its own and at most a moderate body
  for (const type of Object.keys(CONFIG.dinos)) assert.ok(['head', 'neck', 'leg', 'tail', 'flank', 'wing', 'body'].some((z) => zoneMul(type, z) > 1.2), type);
});

test('Bloodlust heals on a kill and boosts damage for a while without stacking', () => {
  // (ten fighting points open the capstone; Weapon Mastery x1.3 is in every number below)
  const { world, players: [p], raptor, run } = setup(rich({ weaponMastery: 3, steadyHands: 3, weakSpot: 3, butchersEye: 1, bloodlust: 1 }));
  assert.equal(p.prof.skills.bloodlust, 1);
  p.hp = 40;
  const d = raptor();
  world.dinos.damage(d, 9999, 'body', p.id, 'spear');
  assert.ok(Math.abs(p.hp - (40 + 0.15 * p.maxHp)) < 1e-9);
  const e = raptor(); e.hp = e.maxHp = 100000;
  const b = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((b - e.hp) - 15.6) < 1e-6);
  const until = p.bloodlustUntil;
  run(1);
  world.dinos.damage(raptor(), 9999, 'body', p.id, 'arrow');
  assert.ok(p.bloodlustUntil > until && p.bloodlustUntil <= world.now + 8 + 1e-6, 'refreshed, not extended');
  const c = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((c - e.hp) - 15.6) < 1e-6, 'x1.2, not x1.44');
  run(9);
  const f = e.hp; world.dinos.damage(e, 10, 'body', p.id, 'arrow');
  assert.ok(Math.abs((f - e.hp) - 13) < 1e-6, 'wore off');
});

test('Steady Hands shortens gun reloads and the bow\'s nock; Butcher\'s Eye the knife time', () => {
  const { world, players: [p, plain], act, raptor, put } = setup(rich({ steadyHands: 3, weaponMastery: 1, butchersEye: 1 }), undefined);
  p.eq = EQUIP.indexOf('pistol');
  p.inv.guns.pistol.loaded = 0;
  act(p, { a: ACT.RELOAD, kind: 'pistol' });
  assert.ok(Math.abs(p.reloadUntil - (world.now + CONFIG.weapons.pistol.reloadTime * 0.7)) < 1e-9);
  // the bow: the next arrow is ready sooner
  for (const q of [p, plain]) Object.assign(q.inv, { bow: true, arrows: 6, arrowUses: Array(6).fill(3) });
  const shoot = (q, pid) => act(q, { a: ACT.FIRE, kind: 'arrow', pid, o: [q.x, q.y + P.eyeHeight, q.z], v: [0, 0, -40], pw: 1 });
  shoot(p, 1); shoot(plain, 1);
  assert.ok(Math.abs(p.nextFireAt - (world.now + CONFIG.weapons.bow.cooldown * 0.7)) < 1e-9);
  assert.ok(Math.abs(plain.nextFireAt - (world.now + CONFIG.weapons.bow.cooldown)) < 1e-9);
  const d = raptor();
  put(p, d.x - 1.5, d.z); d.x = p.x + 1.5; d.z = p.z;
  world.dinos.kill(d, p.id);
  act(p, { a: ACT.BUTCHER, dino: d.id });
  assert.ok(Math.abs(p.butcher.until - (world.now + BUTCHER_TIME.normal * 0.5)) < 1e-9);
});

test('knockback always applies and dinosaurs notice everyone alike (Unshakable and Stalker are gone)', () => {
  const { world, players: [p, plain], evs, raptor, put, at } = setup({ xp: xpForLevel(8), skills: { unshakable: 2, stalker: 3 } }, undefined);
  world.hurtPlayer(p, 5, { kx: 4, kz: -2, down: 1, src: 'trex' });
  const e = evs(EV.HURT).at(-1);
  assert.equal(e.kx, 4); assert.equal(e.kz, -2); assert.equal(e.down, 1);
  const d = raptor();
  d.x = at.x; d.z = at.z;
  put(p, at.x, at.z + 40);
  put(plain, at.x, at.z + 300);
  assert.equal(world.dinos.nearestPlayer(d, 50), p);
});

test('Springy Legs lets a sprint jump through the air without the server refusing the move', () => {
  const { world, players: [p, plain] } = setup(rich({ deepLungs: 3, secondWind: 1, springyLegs: 3 }), undefined);
  for (const q of [p, plain]) { q.moveBudget = 0; q.lastMoveAt = world.now - 0.2; }
  const step = (q, s) => world.receive(q.id, { t: MSG.STATE, s, k: q.epoch, x: q.x, y: q.y, z: q.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  step(p, 1); step(plain, 1);
  assert.ok(p.moveBudget > plain.moveBudget, `${p.moveBudget} > ${plain.moveBudget}`);
  assert.ok(Math.abs(p.moveBudget - 1.3 * plain.moveBudget) < 0.05);
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

test('fruit heals its plain amount, and giving one always hands it over (no Field Medic)', () => {
  const { players: [a, b], act, run } = setup({ xp: xpForLevel(5), skills: { heartyAppetite: 3, fieldMedic: 1 } }, undefined);
  const kind = Object.keys(CONFIG.fruit.types)[0];
  a.inv.fruit = [kind, kind];
  const heal = CONFIG.fruit.types[kind].heal;
  a.hp = 10; a.lastHurtAt = 0;
  act(a, { a: ACT.EAT });
  run(CONFIG.fruit.eatTime + 0.2);
  assert.ok(a.hp <= Math.min(a.maxHp, 10 + heal) + 0.5, `no Hearty Appetite bonus (${a.hp})`);
  b.hp = 10;
  act(a, { a: ACT.GIVE, to: b.id, heal: true });
  assert.equal(b.inv.fruit.length, 1, 'handed over, not fed');
  assert.equal(b.hp, 10);
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

test('solo: a revival tonic gets you back up once where you fell', () => {
  const { world, players: [p], evs, run } = setup(undefined);
  p.inv.tonic = 1;
  p.inv.loot.meat = 2;
  const fell = { x: p.x, z: p.z };
  lethal(world, p);
  assert.ok(p.alive && !p.downed, 'the tonic instead of death');
  assert.equal(p.hp, Math.ceil(P.reviveHpFrac * p.maxHp));
  assert.equal(p.inv.tonic, 0);
  assert.equal(p.inv.loot.meat, 2, 'nothing dropped');
  assert.deepEqual({ x: p.x, z: p.z }, fell);
  const rv = evs(EV.REVIVED).at(-1);
  assert.equal(rv.id, p.id); assert.equal(rv.tonic, 1);
  assert.equal(evs(EV.DEATH).length, 0);
  world.hurtPlayer(p, 10000, {});
  assert.ok(p.alive, 'a moment of invulnerability');
  run(1.6);
  lethal(world, p);
  assert.ok(!p.alive, 'used up: the next fall is a true death');
  assert.equal(evs(EV.DEATH).length, 1);
});

test('in a team the tonic waits while a teammate can still revive you', () => {
  const { world, players: [a, b] } = setup(undefined, undefined);
  a.inv.tonic = 1;
  lethal(world, a);
  assert.ok(a.downed, 'downed: a teammate can help');
  assert.equal(a.inv.tonic, 1);
  b.inv.tonic = 1;
  lethal(world, b);           // nobody left to revive b: the tonic
  assert.ok(b.alive && b.inv.tonic === 0);
});

test('a teammate revives a downed player; Rescuer shortens it; they stand where they fell', () => {
  const { world, players: [a, b], run, act, evs, out } = setup(undefined, rich({ thickSkin: 3, regeneration: 1, rescuer: 2 }));
  lethal(world, a);
  const at = { x: a.x, z: a.z };
  b.x = a.x + 1; b.z = a.z;
  out.length = 0;
  act(b, { a: ACT.REVIVE, to: a.id });
  const start = evs(EV.REVIVE).at(-1);
  assert.equal(start.id, a.id); assert.equal(start.by, b.id); assert.equal(start.to, a.id);
  assert.ok(Math.abs(start.secs - P.reviveTime * 0.3) < 0.011);
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
  assert.equal(evs(EV.REVIVE).at(-1).secs, 0);
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

test('the team has one field revive per ten minutes; then the body is carried to camp and revived there', () => {
  const { world, players: [a, b, c], run, act, evs, toasts, put, fire } = setup(undefined, undefined, undefined);
  const reviveAt = (q, who) => { who.x = q.x + 1; who.z = q.z; act(who, { a: ACT.REVIVE, to: q.id }); run(P.reviveTime + 0.2); };
  assert.equal(world.fullState().fieldRevive, 0);
  lethal(world, a);
  reviveAt(a, b);
  assert.ok(a.alive, 'the first field revive works');
  assert.equal(evs(EV.FIELD_REVIVE).at(-1).secs, P.fieldReviveCooldown);
  assert.ok(Math.abs(world.fullState().fieldRevive - P.fieldReviveCooldown) < 0.5);
  // the next one out in the field is refused, for everyone in the team
  run(2);
  lethal(world, c);
  assert.ok(c.downed);
  reviveAt(c, b);
  assert.ok(c.downed, 'refused: the cooldown is the team\'s');
  assert.equal(b.reviving, null);
  assert.ok(toasts(b.id).some((t) => /carry P3 to camp/.test(t)), toasts(b.id).join(' | '));
  // pick the body up: it follows the carrier, does not bleed out and shows as carried
  b.x = c.x + 1; b.z = c.z;
  act(b, { a: ACT.CARRY, to: c.id });
  assert.equal(b.carrying, c.id); assert.equal(c.carriedBy, b.id);
  const carry = evs(EV.CARRY).at(-1);
  assert.equal(carry.id, c.id); assert.equal(carry.by, b.id);
  const left = c.downT;
  put(b, fire.x + 2, fire.z);
  run(P.bleedOutTime + 1);
  assert.ok(c.downed, 'a carried body never bleeds out');
  assert.equal(c.downT, left);
  assert.ok(Math.hypot(c.x - b.x, c.z - b.z) < 1, 'the body hangs behind its carrier');
  assert.ok(world.snapshot().p.find((r) => r[0] === c.id)[8] & PF.CARRIED);
  // a carrier cannot fight
  Object.assign(b.inv, { bow: true, arrows: 6, arrowUses: Array(6).fill(3) });
  act(b, { a: ACT.FIRE, kind: 'arrow', pid: 7, o: [b.x, b.y + P.eyeHeight, b.z], v: [0, 0, -40], pw: 1 });
  assert.equal(b.inv.arrows, 6, 'no arrow while carrying');
  // at camp the revive needs no cooldown and does not start a new one
  const cooldown = world.fieldReviveAt;
  act(b, { a: ACT.REVIVE, to: c.id });
  run(P.reviveTime + 0.2);
  assert.ok(c.alive && !c.downed, 'revived at camp');
  assert.equal(world.fieldReviveAt, cooldown);
  assert.equal(b.carrying, null); assert.equal(c.carriedBy, null);
  // after the cooldown the field revive is back
  world.now = world.fieldReviveAt + 0.1;
  put(a, fire.x + 80, fire.z); put(b, fire.x + 81, fire.z);
  lethal(world, a);
  reviveAt(a, b);
  assert.ok(a.alive);
});

test('a carried body is put down by E, and dropped when its carrier falls or leaves', () => {
  const { world, players: [a, b, c], act, run, evs } = setup(undefined, undefined, undefined);
  world.fieldReviveAt = world.now + 999;
  lethal(world, a);
  b.x = a.x + 1; b.z = a.z;
  act(b, { a: ACT.CARRY, to: a.id });
  act(c, { a: ACT.CARRY, to: a.id });
  assert.equal(c.carrying, null, 'one carrier per body');
  act(b, { a: ACT.CARRY, drop: true });
  assert.equal(a.carriedBy, null);
  assert.equal(evs(EV.CARRY).at(-1).by, null);
  const left = a.downT;
  run(1);
  assert.ok(a.downT < left, 'bleeding again once put down');
  // the carrier goes down: the body drops
  act(b, { a: ACT.CARRY, to: a.id });
  lethal(world, b);
  assert.equal(a.carriedBy, null);
  assert.ok(b.downed && a.downed);
  // the carrier leaves: the body drops
  c.x = a.x + 1; c.z = a.z;
  act(c, { a: ACT.CARRY, to: a.id });
  assert.equal(a.carriedBy, c.id);
  world.leave(c.id);
  assert.equal(a.carriedBy, null);
  // the last one standing is defeated while carrying: both fall, nobody is left holding a body
  const t = setup(undefined, undefined);
  const [x, y] = t.players;
  t.world.fieldReviveAt = t.world.now + 999;
  lethal(t.world, x);
  y.x = x.x + 1; y.z = x.z;
  t.act(y, { a: ACT.CARRY, to: x.id });
  lethal(t.world, y);
  t.run(0.1);
  assert.equal(y.carrying, null); assert.equal(x.carriedBy, null);
  assert.ok(!x.alive && !x.downed && !y.alive);
  // a stale link (the carrier no longer holds the body) is cleared on the next tick
  const s = setup(undefined, undefined);
  s.world.fieldReviveAt = s.world.now + 999;
  lethal(s.world, s.players[0]);
  s.players[1].x = s.players[0].x + 1; s.players[1].z = s.players[0].z;
  s.act(s.players[1], { a: ACT.CARRY, to: s.players[0].id });
  s.players[1].carrying = null;
  s.run(0.1);
  assert.equal(s.players[0].carriedBy, null);
  assert.equal(s.evs(EV.CARRY).at(-1).by, null);
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

test('a downed player bleeds out into a true death and respawns', () => {
  const { world, players: [a, b], run, evs } = setup(undefined, undefined);
  a.inv.loot.meat = 3; a.inv.loot.hide = 1; a.inv.fruit = ['berry', 'berry'];
  lethal(world, a);
  run(P.bleedOutTime - 1);
  assert.ok(a.downed);
  const fell = { x: a.x, z: a.z };
  run(1.2);
  assert.ok(!a.downed && !a.alive);
  assert.equal(a.inv.loot.meat, 0, 'the pack is emptied at true death');
  assert.deepEqual(a.inv.fruit, []);
  assert.equal(evs(EV.DEATH).length, 1);
  const dropped = [...world.items.values()].filter((it) => ['meat', 'hide', 'berry'].includes(it.kind) && Math.hypot(it.x - fell.x, it.z - fell.z) < 1.5);
  assert.deepEqual(dropped.map((it) => [it.kind, it.n]).sort(), [['berry', 2], ['hide', 1], ['meat', 3]], 'one stack per kind where they fell');
  assert.ok(dropped.every((it) => it.droppedBy === undefined), 'auto-looted on the way back, unlike a deliberate drop');
  assert.equal(evs(EV.ITEM_ADD).filter((m) => dropped.some((it) => it.id === m.item.id)).length, 3, 'every stack is published');
  run(P.respawnDelay + 0.2);
  assert.ok(a.alive);
  assert.ok(dropped.every((it) => world.items.has(it.id)), 'the loot stays behind after the respawn');
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
  t.act(t.players[1], { a: ACT.CARRY, to: t.players[0].id });
  t.world.nextLevel();
  const [x, y] = t.players;
  assert.ok(x.alive && !x.downed && y.alive);
  assert.equal(x.carriedBy, null); assert.equal(y.carrying, null);
  assert.equal(x.hp, x.maxHp);
});

test('Last Stand survives one lethal hit per life with 2 s of invulnerability', () => {
  const { world, players: [p], run } = setup(rich({ thickSkin: 3, regeneration: 3, healingAura: 3, rescuer: 1, lastStand: 1 }));
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
  const { players: [d, plain], act, run, world } = setup(rich({ deepLungs: 3, secondWind: 3, springyLegs: 3, lightFeet: 1, dash: 1 }), undefined);
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
