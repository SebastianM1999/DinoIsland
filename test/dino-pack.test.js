import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { raptorBrain } from '../src/sim/ai/raptor.js';
import { updateSenses, alarm } from '../src/sim/ai/senses.js';
import { assignSlots, leadPoint, muroGoal, takeToken, dropToken, tokenFree, holders, regroupPoint, packSpec, RING_GAP } from '../src/sim/ai/pack.js';

const DT = 0.05;
const P = packSpec('raptor');
const RETREAT = 0.9;

/**
 * A pack of `n` raptors round one player on open ground (a second player optional), all of them already
 * hunting that player. `attacks` records every bite (time, raptor, target); damage is left out so nobody dies.
 */
function hunt(n = 4, { players = 1 } = {}) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const ids = [];
  for (let i = 0; i < players; i++) ids.push(world.join(`Prey ${i}`).id);
  const p = world.players.get(ids[0]), sys = world.dinos;
  for (const d of [...sys.list]) sys.remove(d);
  sys.respawnQueue = [];
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type: 'raptor', radius: 3 }, zone.x + 90, zone.z, { maxDist: 40 });
  Object.assign(p, { x: spot.x, z: spot.z, y: world.terrain.heightAt(spot.x, spot.z), spd: 2 });
  const pack = { id: 'pk', home: { x: p.x, z: p.z }, target: p.id, wander: null, wanderT: 0 };
  sys.groups.set('pk', pack);
  const pack_ = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const d = sys.spawn('raptor', p.x + Math.cos(a) * 12, p.z + Math.sin(a) * 12, { group: 'pk', slot: i });
    d.yaw = Math.atan2(-(p.x - d.x), -(p.z - d.z));
    alarm(d, sys, p.id);
    pack_.push(d);
  }
  const attacks = [];
  sys.attackPlayer = (d, q) => attacks.push({ t: world.now, id: d.id, target: q.id });
  const run = (secs, each = () => {}) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      world.now += DT;
      updateSenses(sys, DT);
      for (const d of pack_) if (d.alive) raptorBrain.update(d, sys, DT);
      each();
    }
  };
  return { world, sys, p, ids, pack, members: pack_, attacks, run };
}

/** The most bites on one target inside any window as long as a bite and its dart back. */
function maxConcurrent(attacks, target) {
  const on = attacks.filter((a) => a.target === target);
  let most = 0;
  for (const a of on) {
    const ids = new Set(on.filter((b) => b.t >= a.t - 1e-9 && b.t < a.t + RETREAT - 1e-9).map((b) => b.id));
    most = Math.max(most, ids.size);
  }
  return most;
}

test('never more than `tokens` raptors bite one target at once, and they take turns', () => {
  const s = hunt(4);
  let most = 0;
  s.run(15, () => { most = Math.max(most, holders(s.sys, s.p.id)); });
  assert.ok(s.attacks.length >= 3, `the pack does bite (${s.attacks.length})`);
  assert.ok(most <= P.tokens, `token holders ${most}`);
  assert.ok(maxConcurrent(s.attacks, s.p.id) <= P.tokens, 'no pile-on');
  assert.ok(new Set(s.attacks.map((a) => a.id)).size >= 2, 'more than one raptor gets its turn');
});

test('the slots surround the target and one covers its escape side', () => {
  const s = hunt(4);
  const t = { id: s.p.id, x: s.p.x, z: s.p.z, vx: 6, vz: 0 };
  // the pack comes from behind (-x) and the sides
  s.members.forEach((d, i) => { d.x = s.p.x - 10 + i; d.z = s.p.z + (i - 1.5) * 4; });
  const plan = assignSlots(s.sys, s.members, t, P, CONFIG.dinos.raptor.attackRange);
  assert.equal(plan.fallback, false);
  assert.equal(plan.slots.size, 4, 'everyone has a place');
  const roles = [...plan.slots.values()].map((q) => q.role);
  assert.equal(roles.filter((r) => r === 'driver').length, 1);
  const cut = [...plan.slots.values()].find((q) => q.role === 'cutoff');
  assert.ok(cut && cut.dx > 0 && Math.abs(cut.dz) < 1, 'a slot straight ahead of the running target is taken');
  const R = CONFIG.dinos.raptor.attackRange + RING_GAP;
  for (const q of plan.slots.values()) if (q.role !== 'driver') assert.ok(Math.abs(Math.hypot(q.dx, q.dz) - R) < 1e-6, 'on the ring');
  // the flankers spread round it rather than bunching on one side
  const angles = [...plan.slots.values()].filter((q) => q.role !== 'driver').map((q) => Math.atan2(q.dz, q.dx));
  assert.ok(Math.max(...angles) - Math.min(...angles) > Math.PI / 2, 'spread round the target');
});

test('slot assignment does not depend on the order of the list', () => {
  const s = hunt(4);
  const t = { id: s.p.id, x: s.p.x, z: s.p.z, vx: 0, vz: 3 };
  const a = assignSlots(s.sys, s.members, t, P, 1.9);
  const b = assignSlots(s.sys, [...s.members].reverse(), t, P, 1.9);
  const c = assignSlots(s.sys, [s.members[2], s.members[0], s.members[3], s.members[1]], t, P, 1.9);
  for (const other of [b, c]) {
    for (const [id, q] of a.slots) assert.deepEqual(other.slots.get(id), q);
  }
});

test('with no room for a ring the pack still closes in and keeps apart', () => {
  const s = hunt(3);
  const walkable = s.sys.walkable.bind(s.sys);
  const t = { id: s.p.id, x: s.p.x, z: s.p.z, vx: 0, vz: 0 };
  s.sys.walkable = (x, z, d, ...rest) => (Math.abs(Math.hypot(x - t.x, z - t.z) - (1.9 + RING_GAP)) < 0.01 ? false : walkable(x, z, d, ...rest));
  const plan = assignSlots(s.sys, s.members, t, P, 1.9);
  assert.equal(plan.fallback, true);
  const [a, b] = s.members;
  a.x = t.x + 10; a.z = t.z; b.x = t.x + 10; b.z = t.z + 1;
  const g = muroGoal(a, t, s.members, 4, P.separation);
  assert.ok(Math.hypot(g.x - t.x, g.z - t.z) < Math.hypot(a.x - t.x, a.z - t.z), 'closer than before');
  assert.ok(g.z < t.z, 'pushed away from the packmate beside it');
  // and in the brain: it still gets its bites in
  s.sys.groups.get('pk').plan = null;
  s.run(10);
  assert.ok(s.attacks.length >= 1, 'bites without a ring');
});

test('a badly hurt pack falls back home once, a strung-out one gathers at its leader', () => {
  const s = hunt(3);
  const [a, b, c] = s.members;
  for (const d of s.members) d.hp = d.maxHp * 0.2;
  const rg = regroupPoint(s.sys, s.pack, s.members, P);
  assert.ok(rg && rg.x === s.pack.home.x && rg.z === s.pack.home.z, 'home');
  s.world.now += 10;
  assert.equal(regroupPoint(s.sys, s.pack, s.members, P), null, 'over after a few seconds');
  s.world.now += 30;
  assert.equal(regroupPoint(s.sys, s.pack, s.members, P), null, 'only once per hunt for being hurt');
  for (const d of s.members) d.hp = d.maxHp;
  c.x = a.x + P.regroupDist + 10;
  const spread = regroupPoint(s.sys, s.pack, s.members, P);
  const leader = [a, b, c].sort((x, y) => x.id - y.id)[0];
  assert.ok(spread && spread.leader === leader.id, 'gathers at the leader');
  // in the brain the members head for the gathering point instead of biting
  s.attacks.length = 0;
  s.run(1);
  assert.equal(s.attacks.length, 0, 'no bites while regrouping');
});

test('pursuit lead is capped: a juke is not met by a perfect prediction', () => {
  const d = { x: 0, z: 0 };
  const far = leadPoint(d, { x: 80, z: 0, vx: 0, vz: 12 }, 10, P.lead);
  assert.ok(Math.abs(far.z - 12 * P.lead) < 1e-9, 'at most `lead` seconds ahead');
  const near = leadPoint(d, { x: 2, z: 0, vx: 0, vz: 12 }, 10, P.lead);
  assert.ok(near.z < 3, 'up close it barely leads');
  const still = leadPoint(d, { x: 5, z: 5 }, 10, P.lead);
  assert.deepEqual(still, { x: 5, z: 5 });
});

test('tokens: a frightened or dead holder lets go, a free token is taken in turn', () => {
  const s = hunt(3);
  const [a, b, c] = s.members;
  assert.ok(takeToken(s.sys, a, 99, 2) && takeToken(s.sys, b, 99, 2));
  assert.equal(takeToken(s.sys, c, 99, 2), false, 'full');
  assert.equal(tokenFree(s.sys, a, 99, 2), true, 'a holder keeps its own');
  a.frightened = 1;
  assert.equal(tokenFree(s.sys, c, 99, 2), true, 'a frightened holder let go');
  b.alive = false;
  dropToken(s.sys, c, 99);
  assert.equal(holders(s.sys, 99), 0);
});

test('a downed target: the pack turns on the reviver, still never more than `tokens` at once', () => {
  const s = hunt(4, { players: 2 });
  const q = s.world.players.get(s.ids[1]);
  Object.assign(q, { x: s.p.x + 4, z: s.p.z, y: s.p.y, spd: 2 });
  for (const d of s.members) alarm(d, s.sys, q.id);
  s.run(2);
  s.world.downPlayer(s.p);
  q.reviving = { to: s.p.id, until: s.world.now + 99 };
  s.attacks.length = 0;
  let most = 0;
  s.run(10, () => { most = Math.max(most, holders(s.sys, q.id)); });
  assert.equal(s.pack.target, q.id, 'the reviver is the target');
  assert.ok(s.attacks.every((a) => a.target === q.id), 'the downed player is left alone');
  assert.ok(s.attacks.length >= 1, 'the reviver is bitten');
  assert.ok(most <= P.tokens && maxConcurrent(s.attacks, q.id) <= P.tokens, 'in turns');
});
