import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { DS } from '../src/shared/protocol.js';
import { Director, PHASE } from '../src/sim/ai/director.js';
import { raptorBrain, STALK_DIST } from '../src/sim/ai/raptor.js';
import { trexBrain } from '../src/sim/ai/trex.js';
import { updateSenses, alarm } from '../src/sim/ai/senses.js';

const DT = 0.05;
const S = CONFIG.ai.director;

/** A bare world with `n` players and no dinosaurs; `players` are spread out on open ground away from the camp. */
function world(n = 1) {
  const w = new ServerWorld({ send() {} }, { variant: 1 });
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(w.join(`P${i}`).id);
  const sys = w.dinos;
  for (const d of [...sys.list]) sys.remove(d);
  sys.respawnQueue = [];
  const zone = w.safeZone();
  const spot = sys.findFreeSpot({ type: 'raptor', radius: 3 }, zone.x + 90, zone.z, { maxDist: 40 });
  ids.forEach((id, i) => {
    const p = w.players.get(id);
    Object.assign(p, { x: spot.x + i * 3, z: spot.z, y: w.terrain.heightAt(spot.x + i * 3, spot.z), spd: 2 });
  });
  return { w, sys, ids, p: w.players.get(ids[0]) };
}

/** `packs` raptor packs of 3 round the player, all already hunting them. */
function packs(s, count) {
  const all = [];
  for (let k = 0; k < count; k++) {
    const id = `pk${k}`;
    s.sys.groups.set(id, { id, home: { x: s.p.x, z: s.p.z }, target: s.p.id, wander: null, wanderT: 0 });
    for (let i = 0; i < 3; i++) {
      const a = ((k * 3 + i) / (count * 3)) * Math.PI * 2;
      const d = s.sys.spawn('raptor', s.p.x + Math.cos(a) * 16, s.p.z + Math.sin(a) * 16, { group: id, slot: i });
      d.yaw = Math.atan2(-(s.p.x - d.x), -(s.p.z - d.z));
      alarm(d, s.sys, s.p.id);
      all.push(d);
    }
  }
  return all;
}

test('the hunt budget caps how many predators close in at once; the rest stalk at a distance', () => {
  const s = world(1);
  const raptors = packs(s, 3);
  const attacks = [];
  s.sys.attackPlayer = (d) => attacks.push(d.id);
  let most = 0;
  const heldFrom = new Map();   // raptor id -> since when it has been held back without a break
  for (let t = 0; t < 12; t += DT) {
    s.w.now += DT;
    updateSenses(s.sys, DT);
    s.sys.director.tick(s.sys, DT);
    for (const d of raptors) {
      raptorBrain.update(d, s.sys, DT);
      if (s.sys.director.engaged.has(d.id)) heldFrom.delete(d.id);
      else if (!heldFrom.has(d.id)) heldFrom.set(d.id, s.w.now);
      assert.ok(s.sys.director.engaged.has(d.id) || d.st !== DS.ATTACK, 'a held-back raptor never bites');
    }
    most = Math.max(most, s.sys.director.hunting(s.w.now));
  }
  const budget = s.sys.director.budget(s.w);
  assert.equal(budget, S.base, 'one player: the base budget');
  assert.ok(most <= budget, `hunting ${most} of ${budget}`);
  const engaged = new Set(s.sys.director.engaged.keys());
  const held = raptors.filter((d) => !engaged.has(d.id));
  assert.ok(held.length >= raptors.length - budget, 'the others are held back');
  // held back still means "hunts on sight": they watch and follow at the stalking distance, flagged aggressive
  const settled = held.filter((d) => s.w.now - heldFrom.get(d.id) > 5);
  assert.ok(settled.length >= 1, 'some were held back the whole time');
  for (const d of settled) {
    const dist = Math.hypot(d.x - s.p.x, d.z - s.p.z);
    assert.ok(dist > STALK_DIST * 0.6, `keeps its distance (${dist.toFixed(1)} m)`);
    assert.ok([DS.ALERT, DS.WALK].includes(d.st), `stalks (${d.st})`);
    assert.ok(d.fl & 1);
  }
  assert.ok(attacks.length >= 1, 'the engaged ones do bite');
});

test('a T-Rex over budget stalks at a distance and charges once a place frees up', () => {
  const s = world(1);
  const dir = s.sys.director;
  s.w.layout.trexPatrol = [{ x: s.p.x + 300, z: s.p.z }, { x: s.p.x + 320, z: s.p.z }, { x: s.p.x + 310, z: s.p.z + 20 }];
  const rex = s.sys.spawn('trex', s.p.x + 35, s.p.z, { wp: 0 });
  rex.x = s.p.x + 35; rex.z = s.p.z; rex.yaw = Math.PI / 2;   // facing the player (-x)
  alarm(rex, s.sys, s.p.id);
  Object.assign(rex, { mode: 'roar', modeT: 1.5, targetId: s.p.id });
  // the budget is taken by others
  for (let i = 0; i < S.base; i++) dir.engaged.set(-1 - i, s.w.now);
  const keep = () => { for (let i = 0; i < S.base; i++) dir.engaged.set(-1 - i, s.w.now); };
  for (let i = 0; i < S.base; i++) s.sys.byId.set(-1 - i, { alive: true, x: 1e4, z: 1e4 });
  const step = (secs, each = () => {}) => {
    for (let t = 0; t < secs; t += DT) { s.w.now += DT; each(); updateSenses(s.sys, DT); dir.tick(s.sys, DT); trexBrain.update(rex, s.sys, DT); }
  };
  step(4, keep);
  assert.equal(rex.mode, 'stalk');
  const dist = Math.hypot(rex.x - s.p.x, rex.z - s.p.z);
  assert.ok(dist > 18, `keeps its distance (${dist.toFixed(1)} m)`);
  assert.ok(rex.fl & 1);
  for (let i = 0; i < S.base; i++) dir.release({ id: -1 - i });
  step(0.5);
  assert.equal(rex.mode, 'chase', 'a free place: it charges');
});

test('the budget grows slower than the player count', () => {
  const dir = new Director();
  const b = (n) => dir.budget(world(n).w);
  const one = b(1), four = b(4);
  assert.ok(four > one, 'more players, more hunters');
  assert.ok(four < one * 4, `sublinear (${one} -> ${four})`);
});

test('after a player goes down the party relaxes and the budget drops, then it builds up again', () => {
  const s = world(2);
  const dir = s.sys.director;
  const full = dir.budget(s.w);
  dir.tick(s.sys, DT);
  s.p.hp = s.p.maxHp * 0.3;   // a big hit ...
  dir.tick(s.sys, DT);
  s.w.downPlayer(s.p);         // ... and down
  for (let t = 0; t < 1; t += DT) { s.w.now += DT; dir.tick(s.sys, DT); }
  assert.equal(dir.phase, PHASE.PEAK);
  for (let t = 0; t < S.peakTime + 0.2; t += DT) { s.w.now += DT; dir.tick(s.sys, DT); }
  assert.equal(dir.phase, PHASE.RELAX);
  assert.ok(dir.budget(s.w) < full, `lower while relaxing (${dir.budget(s.w)} < ${full})`);
  for (let t = 0; t < S.relaxTime + S.decay * 3; t += 0.5) { s.w.now += 0.5; dir.tick(s.sys, 0.5); }
  assert.equal(dir.phase, PHASE.BUILD, 'calmed down');
  assert.ok(dir.budget(s.w) >= full, 'the budget is back (or higher after the quiet stretch)');
});

test('no new hunters while someone is being revived; those already hunting may go on', () => {
  const s = world(2);
  const [a, b] = packs(s, 1);
  const dir = s.sys.director;
  assert.equal(dir.mayHunt(a, s.w), true);
  s.w.players.get(s.ids[1]).reviving = { to: s.p.id, until: s.w.now + 5 };
  assert.equal(dir.mayHunt(b, s.w), false, 'no new hunter during the revive');
  assert.equal(dir.mayHunt(a, s.w), true, 'an engaged one keeps its place');
  dir.release(a);
  assert.equal(dir.mayHunt(a, s.w), false, 'once released it is new again');
});

test('bosses and raiders are not counted or held back', () => {
  const s = world(1);
  const dir = s.sys.director;
  const raptors = packs(s, 3);
  for (const d of raptors.slice(0, S.base)) assert.equal(dir.mayHunt(d, s.w), true);
  assert.equal(dir.mayHunt(raptors[S.base], s.w), false, 'budget full');
  const raider = raptors[S.base + 1];
  raider.raid = { foe: s.p.id };
  assert.equal(dir.mayHunt(raider, s.w), true, 'a raider ignores the budget');
  const boss = s.sys.spawn('alpha-sarcosuchus', s.p.x + 40, s.p.z, {});
  assert.equal(dir.counts(boss), false);
  assert.equal(dir.mayHunt(boss, s.w), true);
  const titan = { id: 9999, type: 'trex', leash: { x: 0, z: 0, r: 5 } };
  assert.equal(dir.counts(titan), false, 'a leashed arena animal is left to its own rules');
  assert.equal(dir.hunting(s.w.now), S.base, 'only the ordinary predators count');
});

test('intensity rises with damage and nearby hunters and fades over time', () => {
  const s = world(1);
  const dir = s.sys.director;
  dir.tick(s.sys, DT);
  s.p.hp -= 30;
  dir.tick(s.sys, DT);
  const hit = dir.intensity.get(s.p.id);
  assert.ok(hit > 0.3, `damage counts (${hit.toFixed(2)})`);
  for (let t = 0; t < S.decay; t += 0.5) { s.w.now += 0.5; dir.tick(s.sys, 0.5); }
  assert.ok(dir.intensity.get(s.p.id) < hit * 0.5, 'fades');
  const [r] = packs(s, 1);
  dir.mayHunt(r, s.w);
  const before = dir.intensity.get(s.p.id);
  s.w.now += DT;
  dir.tick(s.sys, 1);
  assert.ok(dir.intensity.get(s.p.id) > before * Math.exp(-1 / S.decay), 'a hunter close by adds to it');
  s.w.players.delete(s.p.id);
  dir.tick(s.sys, DT);
  assert.equal(dir.intensity.has(s.p.id), false, 'a player who left is forgotten');
});
