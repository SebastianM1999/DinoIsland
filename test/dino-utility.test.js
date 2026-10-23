import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { DS } from '../src/shared/protocol.js';
import { lineBlocked } from '../src/shared/visibility.js';
import { curve, score, choose } from '../src/sim/ai/utility.js';
import { updateSenses, levelOf, LEVEL } from '../src/sim/ai/senses.js';
import { triceratopsBrain } from '../src/sim/ai/triceratops.js';
import { ankylosaurusBrain } from '../src/sim/ai/ankylosaurus.js';
import { pachycephalosaurusBrain } from '../src/sim/ai/pachycephalosaurus.js';
import { brachioBrain } from '../src/sim/ai/brachio.js';
import { stegoBrain } from '../src/sim/ai/stego.js';
import { trexBrain, chaseWorth } from '../src/sim/ai/trex.js';
import { pickTarget, diveLead, LEAD_MAX } from '../src/sim/ai/ptera.js';
import { startCharge, chargeStep } from '../src/sim/ai/defender.js';

const DT = 0.05;
const DEFENDERS = { triceratops: triceratopsBrain, ankylosaurus: ankylosaurusBrain, pachycephalosaurus: pachycephalosaurusBrain };

/**
 * One player out on open ground and a `type` animal (alone, in herd/group 'h') `dist` m away in a direction with a
 * clear line of sight, facing the player. Movement is frozen unless `move` is set: the brains' choices are under
 * test, not the walking. `run(s)` advances the senses and the brain.
 */
function scene(type, dist, { brain = null, members = 1, move = false, players = 1 } = {}) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const ids = [];
  for (let i = 0; i < players; i++) ids.push(world.join(`Explorer ${i}`).id);
  const p = world.players.get(ids[0]), sys = world.dinos;
  for (const d of [...sys.list]) sys.remove(d);
  sys.respawnQueue = [];
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type: 'raptor', radius: 2 }, zone.x + 90, zone.z, { maxDist: 40 });
  p.x = spot.x; p.z = spot.z; p.y = world.terrain.heightAt(p.x, p.z);
  let a = 0;
  for (; a < Math.PI * 2; a += Math.PI / 16) {
    const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
    const eye = { x, y: world.terrain.heightAt(x, z) + CONFIG.dinos[type].height * 0.85, z };
    if (sys.walkable(x, z, { type }) && !lineBlocked(eye, { x: p.x, y: p.y + 1.2, z: p.z }, world.terrain, world.layout)) break;
  }
  const home = { x: p.x + Math.cos(a) * dist, z: p.z + Math.sin(a) * dist };
  sys.groups.set('h', { id: 'h', home, zone: { x: home.x, z: home.z, radius: 10, spawns: [] }, hurtBy: null, hurtAt: -Infinity,
    target: null, retarget: 99, panic: 0, threat: null, graze: 0, alertT: 0 });
  const herd = [];
  for (let i = 0; i < members; i++) {
    const d = sys.spawn(type, home.x, home.z, { group: 'h', slot: i, home: { ...home } });
    d.x = home.x + Math.cos(a + Math.PI / 2) * i * 6; d.z = home.z + Math.sin(a + Math.PI / 2) * i * 6;
    d.y = world.terrain.heightAt(d.x, d.z);
    d.yaw = Math.atan2(Math.cos(a), Math.sin(a));
    herd.push(d);
  }
  if (!move) { sys.steer = () => 0; sys.move = () => {}; }
  const run = (secs, only = null) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      world.now += DT;
      updateSenses(sys, DT);
      if (brain) for (const d of herd) if (d.alive && (!only || only === d)) brain.update(d, sys, DT);
    }
  };
  const put = (r) => {
    p.x = home.x - Math.cos(a) * r; p.z = home.z - Math.sin(a) * r; p.y = world.terrain.heightAt(p.x, p.z);
  };
  return { world, sys, p, ids, d: herd[0], herd, run, put, home, a };
}

test('response curves map to 0..1 and score compensates for many inputs', () => {
  assert.equal(curve.linear(5, 0, 10), 0.5);
  assert.equal(curve.linear(-3, 0, 10), 0);
  assert.equal(curve.inv(2, 0, 4), 0.5);
  assert.equal(curve.quad(5, 0, 10), 0.25);
  assert.equal(curve.step(3, 3), 1);
  assert.equal(curve.step(2.9, 3), 0);
  assert.ok(Math.abs(curve.logistic(0.5) - 0.5) < 1e-9);
  assert.ok(curve.logistic(0.9) > 0.9 && curve.logistic(0.1) < 0.1);
  assert.equal(curve.linear(NaN), 0);
  assert.equal(score([]), 0);
  assert.equal(score([1, 1, 1]), 1);
  assert.equal(score([1, 0, 1]), 0);
  assert.ok(score([0.8, 0.8, 0.8, 0.8]) > 0.8 ** 4, 'compensated');
  assert.ok(score([0.8, 0.8, 0.8, 0.8]) < 0.8, 'still below one input');
  assert.equal(score([1], 1.5), 1.5, 'weight');
});

test('choose: momentum and minimum commit stop two close options from flickering; an override cuts through', () => {
  const spec = { thinkRate: 4, momentum: 0.15, minCommit: 1.5 };
  const d = { id: 3 };
  let flip = false;
  const options = { a: () => [flip ? 0.52 : 0.5], b: () => [flip ? 0.5 : 0.52] };
  let switches = 0, last = null;
  for (let now = 0; now < 10; now += DT) {
    flip = Math.floor(now / 0.3) % 2 === 0;   // the lead swaps every 0.3 s
    const o = choose(d, options, {}, spec, now);
    if (last && o !== last) switches++;
    last = o;
  }
  assert.ok(switches === 0, `no flicker (${switches} switches)`);
  // a clear winner does take over, but not before the minimum commit time
  const d2 = { id: 0 };
  let big = false;
  const opts = { calm: () => [0.5], run: () => [big ? 1 : 0] };
  assert.equal(choose(d2, opts, {}, spec, 0), 'calm');
  big = true;
  assert.equal(choose(d2, opts, {}, spec, 1), 'calm', 'still committed');
  assert.equal(choose(d2, opts, {}, spec, 1.6), 'run');
  assert.equal(choose(d2, opts, {}, spec, 1.7, 'calm'), 'calm', 'override');
});

for (const [type, brain] of Object.entries(DEFENDERS)) {
  const D = CONFIG.dinos[type].ai.defend;
  test(`${type}: no reaction from afar, watches at a distance, threatens at the warning radius, strikes up close`, () => {
    const far = scene(type, CONFIG.dinos[type].ai.senses.sightRange * 1.6, { brain });
    far.run(3);
    assert.equal(far.d.act, null, 'nothing from far away');
    assert.ok(![DS.ROAR, DS.CHARGE, DS.ATTACK, DS.TAIL].includes(far.d.st), `calm (${far.d.st})`);

    const s = scene(type, D.warn * 1.4, { brain });
    s.p.spd = 2;
    s.run(2);
    assert.ok(levelOf(s.d, s.p.id) >= LEVEL.SUSPICIOUS, 'noticed');
    assert.equal(s.d.think.option, 'watch');
    assert.equal(s.d.st, DS.ALERT);

    s.put((D.warn + D.strike) / 2);
    s.run(2);
    assert.equal(s.d.think.option, 'threaten');
    assert.equal(s.d.st, DS.ROAR, 'threat display');
    assert.equal(s.d.act, null, 'no strike yet');

    s.put(Math.max(D.strike * 0.5, s.d.radius + 1));
    s.run(1.2);
    assert.ok(s.d.act || s.d.cool > 0, 'strikes');
    assert.ok(s.d.fl & 1, 'counts as aggressive');
  });
}

for (const [type, brain] of Object.entries(DEFENDERS)) {
  test(`${type}: its strike lands on a player who stands still in front of it (a charge from further away too)`, () => {
    for (const dist of [CONFIG.dinos[type].radius + 1.5, CONFIG.dinos[type].ai.defend.strike * 0.9]) {
      const s = scene(type, dist, { brain, move: true });
      // no stray trunk or rock between them in this test (the strike is under test, not the scenery)
      s.sys.canReach = () => true;
      s.sys.bodyBlocked = () => false;
      s.sys.resolveBody = () => false;
      s.p.spd = 2;
      s.p.invulnUntil = 0;
      const hp = s.p.hp;
      for (let t = 0; t < 6 && s.p.hp === hp; t += DT) s.run(DT);
      assert.ok(s.p.hp < hp, `${type} at ${dist.toFixed(1)} m: hurt (${s.d.think?.option}, ${s.d.act?.kind})`);
    }
  });
}

test('defender upkeep: a stuck nudge drops the committed attack, a respawn joins the herd', () => {
  const s = scene('triceratops', 6, { brain: triceratopsBrain });
  s.d.act = { kind: 'charge' };
  triceratopsBrain.onStuck(s.d, s.sys);
  assert.equal(s.d.act, null);
  assert.ok(s.d.cool > 0);
  const before = s.sys.list.length;
  triceratopsBrain.respawn(s.sys, { group: 'h' });
  const born = s.sys.list.at(-1);
  assert.equal(s.sys.list.length, before + 1);
  assert.equal(born.group, 'h');
  triceratopsBrain.respawn(s.sys, { group: 'gone' });
  assert.equal(s.sys.list.length, before + 1, 'no herd, no respawn');
});

test('a hit on one herd member puts the whole herd on to the attacker', () => {
  const s = scene('triceratops', 40, { brain: triceratopsBrain, members: 2 });
  s.d.yaw += Math.PI;   // the attacker is behind them and too far to be seen
  s.herd[1].yaw += Math.PI;
  s.run(0.5);
  assert.equal(levelOf(s.herd[1], s.p.id), LEVEL.UNAWARE);
  s.sys.damage(s.d, 5, 'body', s.p.id, 'rifle');
  for (const o of s.herd) {
    assert.equal(levelOf(o, s.p.id), LEVEL.HUNTING, `member ${o.slot} alerted`);
    assert.ok(o.senses.memory.has(s.p.id), 'knows where the attacker stood');
  }
});

test('a charge stops at the leash and the animal walks back home afterwards', () => {
  const D = CONFIG.dinos.triceratops.ai.defend;
  const s = scene('triceratops', 6, { brain: triceratopsBrain });
  const anchor = { x: s.d.x, z: s.d.z };
  // movement along the heading at the asked speed, nothing in the way
  s.sys.move = (d, sp, dt) => { d.x -= Math.sin(d.yaw) * sp * dt; d.z -= Math.cos(d.yaw) * sp * dt; d.spd = sp; };
  s.sys.halt = (d) => { d.spd = 0; };
  s.d.anchor = { ...anchor };
  s.d.x = anchor.x + Math.cos(s.a + Math.PI) * (D.leash - 3); s.d.z = anchor.z + Math.sin(s.a + Math.PI) * (D.leash - 3);
  s.put(D.leash + 20);   // the player stands far beyond the leash, straight ahead
  s.p.x = s.d.x - Math.cos(s.a) * 30; s.p.z = s.d.z - Math.sin(s.a) * 30;
  s.d.yaw = Math.atan2(Math.cos(s.a), Math.sin(s.a));
  startCharge(s.d, { id: s.p.id, x: s.p.x, z: s.p.z });
  const ctx = { anchor };
  let n = 0;
  while (s.d.act && chargeStep(s.d, s.sys, DT, ctx, D.run, () => {}) && n++ < 200) s.world.now += DT;
  const out = Math.hypot(s.d.x - anchor.x, s.d.z - anchor.z);
  assert.ok(out <= D.leash + D.run.speed * DT * 2, `stopped at the leash (${out.toFixed(1)} m)`);

  // nothing to fight any more: back to where it started
  const goals = [];
  s.sys.steer = (d, x, z) => { goals.push({ x, z }); return 10; };
  s.d.act = null; s.d.think = null;
  s.world.players.delete(s.p.id);
  triceratopsBrain.update(s.d, s.sys, DT);
  assert.equal(s.d.think.option, 'return');
  assert.ok(Math.hypot(goals.at(-1).x - anchor.x, goals.at(-1).z - anchor.z) < 0.01, 'heads home');
});

test('a sniper beyond the leash makes the herd move off instead of standing still', () => {
  const D = CONFIG.dinos.triceratops.ai.defend;
  const s = scene('triceratops', D.leash * 1.6 / 1.6 + 12, { brain: triceratopsBrain, members: 2 });
  s.put(D.leash + 12);
  s.p.spd = 0;
  s.sys.damage(s.d, 5, 'body', s.p.id, 'sniper');
  const goals = [];
  s.sys.steer = (d, x, z) => { goals.push({ d: d.id, x, z }); return 10; };
  s.run(1.5);
  assert.equal(s.d.think.option, 'avoid');
  const g = goals.filter((q) => q.d === s.d.id).at(-1);
  assert.ok(Math.hypot(g.x - s.p.x, g.z - s.p.z) > Math.hypot(s.d.x - s.p.x, s.d.z - s.p.z) + 10, 'away from the shooter');
});

test('pachycephalosaurus runs from a group of players but charges a lone one', () => {
  const s = scene('pachycephalosaurus', 12, { brain: pachycephalosaurusBrain, players: 2 });
  const q = s.world.players.get(s.ids[1]);
  q.x = s.p.x + 2; q.z = s.p.z; q.y = s.p.y;
  s.p.spd = q.spd = 2;
  s.run(2);
  assert.equal(s.d.think.option, 'flee');
  assert.equal(s.d.st, DS.FLEE);
  const lone = scene('pachycephalosaurus', 7, { brain: pachycephalosaurusBrain });
  lone.p.spd = 2;
  lone.run(2);
  assert.ok(lone.d.act || lone.d.cool > 0, 'charges the lone player');
});

test('herbivores calm down when their attacker goes down', () => {
  const s = scene('triceratops', 10, { brain: triceratopsBrain });
  s.sys.damage(s.d, 5, 'body', s.p.id, 'spear');
  s.run(0.5);
  assert.notEqual(s.d.think.option, 'graze');
  s.world.downPlayer(s.p);
  s.d.act = null;
  s.run(2);
  assert.equal(s.d.think.option, 'graze');
  assert.equal(s.d.fl & 1, 0);
});

test('brachio: a threat display at the warning radius before the stomp, and a leash on the defence', () => {
  const C = CONFIG.dinos.brachio;
  const s = scene('brachio', C.ai.defend.warn - 2, { brain: brachioBrain });
  s.p.spd = 2;
  s.run(2);
  assert.equal(s.d.st, DS.ROAR, 'display');
  assert.ok(!(s.d.stompT >= 0), 'no stomp yet');
  s.put(C.closeRadius - 2);
  s.run(1);
  assert.ok(s.d.defendT > 0 && s.d.defendFrom, 'defends');
  // the player is now beyond the leash from where the defence began
  s.d.defendFrom = { x: s.p.x + Math.cos(s.a) * (C.ai.defend.leash + 5), z: s.p.z + Math.sin(s.a) * (C.ai.defend.leash + 5) };
  s.d.stompT = -1;
  s.run(DT);
  assert.equal(s.d.defendT, 0, 'gives up at the leash');
});

test('brachio herd: a hit alerts every member and the others close ranks round the injured one', () => {
  const s = scene('brachio', 60, { brain: brachioBrain, members: 3 });
  const goals = new Map();
  s.sys.steer = (d, x, z) => { goals.set(d.id, { x, z }); return 10; };
  const injured = s.herd[2];
  s.sys.damage(injured, 5, 'body', s.p.id, 'sniper');
  for (const o of s.herd) assert.equal(levelOf(o, s.p.id), LEVEL.HUNTING);
  s.run(DT);
  const g = goals.get(s.herd[1].id);
  assert.ok(Math.hypot(g.x - injured.x, g.z - injured.z) < 9, 'a follower guards the injured animal');
});

test('stego: anger needs an intruder it has noticed', () => {
  const s = scene('stego', 10, { brain: stegoBrain });
  s.d.home = { x: s.d.x, z: s.d.z };
  s.d.yaw += Math.PI;   // looking away; the player stands still beyond the feel radius
  s.p.spd = 0;
  s.run(2);
  assert.ok(!(s.d.anger > 0), 'unnoticed: calm');
  s.d.yaw -= Math.PI;
  s.p.spd = 2;
  s.run(2);
  assert.ok(s.d.anger > 0, 'seen: angry');
});

test('T-Rex chase economics: a chase that does not close is dropped, one that closes is kept', () => {
  const E = CONFIG.dinos.trex.ai.chase;
  const players = new Map();
  const p = { id: 1, x: 20, z: 0, hp: 100, maxHp: 100, alive: true };
  players.set(1, p);
  const sys = { world: { players } };
  const d = { x: 0, z: 0, hp: 900, maxHp: 900 };
  let worth = 1;
  for (let t = 0; t < E.giveUpNoGain * 1.4; t += DT) worth = chaseWorth(d, sys, { p, x: p.x, z: p.z }, DT);
  assert.ok(worth < E.worth, `stalled: ${worth.toFixed(2)}`);
  const d2 = { x: 0, z: 0, hp: 900, maxHp: 900 };
  for (let t = 0; t < E.giveUpNoGain * 1.4; t += DT) { d2.x += 0.2; worth = chaseWorth(d2, sys, { p, x: p.x, z: p.z }, DT); }
  assert.ok(worth > E.worth, `closing: ${worth.toFixed(2)}`);
  // a badly hurt T-Rex does not keep chasing
  const d3 = { x: 0, z: 0, hp: 60, maxHp: 900 };
  assert.ok(chaseWorth(d3, sys, { p, x: p.x, z: p.z }, DT) < E.worth);

  // in the brain: a player who keeps the gap open is given up on after a while
  const s = scene('trex', 25, { brain: trexBrain, move: true });
  s.world.layout.trexPatrol = [{ x: s.p.x + 300, z: s.p.z }, { x: s.p.x + 320, z: s.p.z }, { x: s.p.x + 310, z: s.p.z + 20 }];
  s.d.wp = 0;
  Object.assign(s.d, { mode: 'chase', targetId: s.p.id, chaseT: 0, modeT: 0 });
  s.p.spd = 2;
  let gaveUp = false;
  for (let t = 0; t < 30 && !gaveUp; t += DT) {
    // the player keeps 25 m ahead of it
    const ang = Math.atan2(s.p.x - s.d.x, s.p.z - s.d.z);
    s.p.x = s.d.x + Math.sin(ang) * 25; s.p.z = s.d.z + Math.cos(ang) * 25; s.p.y = s.world.terrain.heightAt(s.p.x, s.p.z);
    s.run(DT);
    gaveUp = s.d.mode === 'patrol';
  }
  assert.ok(gaveUp, 'gave up a chase that never closed');
});

test('pteranodon judges injury as a fraction of max HP, and its dive lead is capped', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const a = world.players.get(world.join('Thick Skin').id), b = world.players.get(world.join('Normal').id);
  const sys = world.dinos;
  const d = sys.list.find((o) => o.type === 'ptera') ?? sys.spawn('ptera', 0, 0, { area: { x: 0, z: 0 }, nest: { x: 0, z: 0 }, slot: 0 });
  d.area = { x: d.x, z: d.z };
  sys.inSafeZone = () => false;
  Object.assign(a, { x: d.x + 20, z: d.z, maxHp: 150, hp: 40 });
  Object.assign(b, { x: d.x - 20, z: d.z, maxHp: 100, hp: 60 });
  for (const q of [a, b]) q.inv.loot.meat = 0;
  assert.equal(pickTarget(sys, d)?.id, a.id, '40/150 is the injured one');

  const p = { id: 7, x: 0, y: 0, z: 0 };
  const flyer = { x: 0, y: 30, z: 60 };
  diveLead(flyer, p, DT);
  p.x += 3;   // 60 m/s: a teleport, capped like a run
  const lead = diveLead(flyer, p, DT);
  assert.ok(Math.hypot(lead.x, lead.z) <= 12 * LEAD_MAX + 1e-9, `capped (${lead.x.toFixed(2)})`);
  assert.ok(lead.x > 0, 'leads along the run');
});
