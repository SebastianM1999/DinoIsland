import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, PF, DS } from '../src/shared/protocol.js';
import { SAFE_MARGIN } from '../src/shared/base.js';
import { lineBlocked } from '../src/shared/visibility.js';
import { raptorBrain } from '../src/sim/ai/raptor.js';
import { trexBrain } from '../src/sim/ai/trex.js';
import { updateSenses, levelOf, LEVEL, RAY_CAP, NOISE, senseSpec, perceived, LOOK_EVERY } from '../src/sim/ai/senses.js';

const DT = 0.05;
const LOOK = LOOK_EVERY + 2 * DT;

/**
 * A world with one player out on open ground (away from the camp), no other dinosaurs, and a
 * `type` animal `dist` m away in a direction with a clear line between them, looking at the player
 * (`away()` turns it round). `run(s)` advances the senses (and with `brain` the brain) by s seconds.
 */
function scene(type = 'raptor', dist = 15, { players = 1 } = {}) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const ids = [];
  for (let i = 0; i < players; i++) ids.push(world.join(`Explorer ${i}`).id);
  const p = world.players.get(ids[0]), sys = world.dinos;
  for (const d of [...sys.list]) sys.remove(d);
  sys.respawnQueue = [];
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type, radius: 2 }, zone.x + 80, zone.z, { maxDist: 40 });
  p.x = spot.x; p.z = spot.z; p.y = world.terrain.heightAt(p.x, p.z);
  let a = 0;
  for (; a < Math.PI * 2; a += Math.PI / 16) {
    const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
    const eye = { x, y: world.terrain.heightAt(x, z) + 1.5, z };
    if (sys.walkable(x, z, { type }) && !lineBlocked(eye, { x: p.x, y: p.y + 1.2, z: p.z }, world.terrain, world.layout)) break;
  }
  sys.groups.set('pk', { id: 'pk', home: { x: p.x, z: p.z }, target: null, wander: null, wanderT: 0 });
  const extra = type === 'trex' ? { wp: 0 } : { group: 'pk', slot: 0 };
  if (type === 'trex') world.layout.trexPatrol = [{ x: p.x + 60, z: p.z }, { x: p.x + 80, z: p.z }, { x: p.x + 70, z: p.z + 20 }];
  const d = sys.spawn(type, p.x, p.z, extra);
  d.x = p.x + Math.cos(a) * dist; d.z = p.z + Math.sin(a) * dist; d.y = world.terrain.heightAt(d.x, d.z);
  const face = () => { d.yaw = Math.atan2(Math.cos(a), Math.sin(a)); };
  const away = () => { d.yaw = Math.atan2(-Math.cos(a), -Math.sin(a)); };
  face();
  const run = (secs, brain = null) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      world.now += DT;
      updateSenses(sys, DT);
      brain?.update(d, sys, DT);
    }
  };
  return { world, sys, p, d, ids, run, face, away, mid: { x: (p.x + d.x) / 2, z: (p.z + d.z) / 2 } };
}

test('a raptor sees a player in front of it in the open, not one behind it, but hears them sprint there', () => {
  const s = scene('raptor', 15);
  s.p.spd = 2;
  s.run(2);
  assert.ok(levelOf(s.d, s.p.id) >= LEVEL.ALERT, 'seen in the open');

  const b = scene('raptor', 15);
  b.away();
  b.p.spd = 2;
  b.run(3);
  assert.equal(levelOf(b.d, b.p.id), LEVEL.UNAWARE, 'not seen behind its back');
  // sprinting there: the real state packet path makes the noise
  const { world, p } = b;
  world.receive(p.id, { t: MSG.STATE, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, fl: PF.SPRINT, spd: 7, k: p.epoch });
  b.run(0.1);
  assert.ok(levelOf(b.d, p.id) >= LEVEL.SUSPICIOUS, 'heard sprinting behind it');
  assert.equal(b.d.senses.memory.get(p.id).how, 'heard');
});

test('sight is blocked by a hill, a trunk, a boulder and the cave roof', () => {
  const blockers = {
    hill: (s) => {
      const h = s.world.terrain.heightAt.bind(s.world.terrain);
      s.world.terrain.heightAt = (x, z) => h(x, z) + (Math.hypot(x - s.mid.x, z - s.mid.z) < 2 ? 12 : 0);
    },
    trunk: (s) => s.world.layout.trees.push({ x: s.mid.x, z: s.mid.z, y: s.world.terrain.heightAt(s.mid.x, s.mid.z) - 2, scale: 1, type: 'jungle' }),
    boulder: (s) => {
      const y = s.world.terrain.heightAt(s.mid.x, s.mid.z);
      s.world.layout.rocks.push({ x: s.mid.x, z: s.mid.z, R: 2.5, by: y - 1, top: y + 5, scale: 1.2 });
    },
    roof: (s) => {
      s.world.terrain.ceilingAt = (x, z) => (Math.hypot(x - s.mid.x, z - s.mid.z) < 3 ? s.world.terrain.heightAt(x, z) + 0.8 : 1e4);
    },
  };
  for (const [name, block] of Object.entries(blockers)) {
    const s = scene('raptor', 15);
    s.p.spd = 2;
    block(s);
    s.run(3);
    assert.equal(levelOf(s.d, s.p.id), LEVEL.UNAWARE, `${name}: hidden`);
  }
});

test('Stalker and the ash rain shorten sight', () => {
  const range = senseSpec('raptor').sightRange;
  for (const [what, setup] of [['nothing', () => {}], ['Stalker', (s) => { s.p.mods.stalkerMul = 0.5; }], ['ash', (s) => { s.world.sightMul = () => 0.5; }]]) {
    const s = scene('raptor', range * 0.75);
    s.p.spd = 2;
    setup(s);
    s.run(4);
    assert.equal(levelOf(s.d, s.p.id) >= LEVEL.SUSPICIOUS, what === 'nothing', `${what}: ${levelOf(s.d, s.p.id)}`);
  }
});

test('a gunshot is heard only within earshot, and the memory holds the shot spot, not the player', () => {
  const R = NOISE.gun.radius * senseSpec('raptor').hearing;
  for (const [dist, heard] of [[R * 0.8, true], [R * 1.1, false]]) {
    const s = scene('raptor', dist);
    s.away();
    const shot = { x: s.p.x, z: s.p.z };
    s.world.playerNoise(s.p, 'gun');
    s.p.x += 5;   // and walks off
    s.run(0.1);
    assert.equal(levelOf(s.d, s.p.id) >= LEVEL.SUSPICIOUS, heard, `${dist.toFixed(0)} m`);
    if (heard) assert.deepEqual([s.d.senses.memory.get(s.p.id).x, s.d.senses.memory.get(s.p.id).z], [shot.x, shot.z]);
  }
});

test('losing sight: it goes to the predicted spot, searches round it, then forgets', () => {
  const s = scene('raptor', 12);
  const goals = [];
  s.sys.steer = () => 0;
  s.sys.halt = () => {};
  s.p.spd = 2;
  s.run(2, raptorBrain);
  assert.equal(s.sys.groups.get('pk').target, s.p.id, 'hunting');
  // the player runs east for a moment and then vanishes from sight (far off and behind a wall of rock)
  for (let k = 0; k < 10; k++) { s.p.x += 0.4; s.run(DT, raptorBrain); }   // (long enough for two looks: a velocity)
  // from here the animal arrives wherever it heads (movement is not under test)
  s.sys.steer = (d, x, z) => { goals.push({ x, z, t: s.world.now }); d.x = x; d.z = z; return 0; };
  const last = { x: s.p.x, z: s.p.z };
  s.p.x += 400;
  // until its next look it still counts as seen: let only the senses run up to the first tick it does not
  // (with the brain on, the instant arrivals here could finish the whole search inside that window)
  for (let k = 0; k * DT < LOOK + DT && perceived(s.d, s.sys, s.p.id)?.seen !== false; k++) s.run(DT);
  const t = perceived(s.d, s.sys, s.p.id);
  assert.equal(t?.seen, false);
  assert.ok(Math.abs(t.x - last.x) < 20, 'remembered, not live');
  goals.length = 0;
  s.run(DT, raptorBrain);
  assert.ok(goals[0].x > last.x + 0.5, 'leads the remembered position along its way');
  // search while the pack still hunts (each point is reached at once here, so the search is quick)
  const pack = s.sys.groups.get('pk');
  for (let k = 0; k < 100 && pack.target != null; k++) s.run(DT, raptorBrain);
  const searched = goals.filter((g) => g.t <= s.world.now - DT);
  const spread = new Set(searched.map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`));
  assert.ok(spread.size >= 3, `searches several points (${spread.size})`);
  const predicted = goals[0];
  assert.ok(searched.every((g) => Math.hypot(g.x - predicted.x, g.z - predicted.z) < 20), 'round the predicted spot');
  assert.equal(pack.target, null, 'the search over, it gives up');
  // a quarry it merely heard of fades from memory after memoryTime too
  s.world.playerNoise(s.p, 'gun', last.x, last.z);
  s.sys.steer = () => 0;
  s.run(0.1);
  assert.equal(s.d.senses.memory.get(s.p.id)?.how, 'heard');
  s.run(senseSpec('raptor').memoryTime + 1);
  assert.equal(s.d.senses.memory.has(s.p.id), false, 'forgotten');
  assert.equal(levelOf(s.d, s.p.id), LEVEL.UNAWARE);
});

test('a downed player gets no awareness and no damage, even from a bite wind-up already running', () => {
  const s = scene('trex', 6, { players: 2 });
  const [a] = s.ids.map((id) => s.world.players.get(id));
  s.world.players.get(s.ids[1]).x += 300;   // the other explorer is far away
  s.p.spd = 2;
  s.run(2.5, trexBrain);
  // up close and hunting: start the bite, then the player goes down before it lands
  s.d.mode = 'chase'; s.d.cool = 0; s.d.x = a.x + 3; s.d.z = a.z;
  s.run(DT, trexBrain);
  assert.equal(s.d.mode, 'bite');
  s.world.downPlayer(a, 'trex');
  const hp = a.hp;
  s.run(1.2, trexBrain);
  assert.equal(a.hp, hp, 'no damage to a downed player');
  assert.equal(levelOf(s.d, a.id), LEVEL.UNAWARE);
  assert.equal(s.d.senses.memory.has(a.id), false);
  assert.notEqual(s.d.targetId, a.id);
});

test('a predator whose target goes down turns on the reviver; with nobody left it leaves the body', () => {
  // a reviver in plain view
  const s = scene('raptor', 10, { players: 2 });
  const [a, b] = s.ids.map((id) => s.world.players.get(id));
  b.x = a.x + 1; b.z = a.z; b.y = a.y;
  s.sys.steer = () => 0; s.sys.halt = () => {};
  a.spd = 2;
  s.run(2, raptorBrain);
  const pack = s.sys.groups.get('pk');
  pack.target = a.id;
  s.world.downPlayer(a, 'raptor');
  s.world.startRevive(b, a.id);
  assert.ok(b.reviving);
  s.run(0.5, raptorBrain);
  assert.equal(pack.target, b.id, 'goes for the reviver');

  // nobody else perceived: it walks away from the body and does not orbit it
  const n = scene('raptor', 8, { players: 2 });
  const [c, far] = n.ids.map((id) => n.world.players.get(id));
  far.x += 300;
  c.spd = 2;
  n.run(2, raptorBrain);
  assert.equal(n.sys.groups.get('pk').target, c.id);
  n.world.downPlayer(c, 'raptor');
  const body = { x: c.x, z: c.z };
  n.run(8, raptorBrain);
  assert.equal(n.sys.groups.get('pk').target, null);
  assert.ok(Math.hypot(n.d.x - body.x, n.d.z - body.z) > 12, `walked off (${Math.hypot(n.d.x - body.x, n.d.z - body.z).toFixed(1)} m)`);
  assert.notEqual(n.d.st, DS.ATTACK);
});

test('the safe zone has no ring where a player is fair game but out of every reach', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const sys = world.dinos, zone = world.safeZone();
  const raptor = { type: 'raptor', radius: 0.7 };
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    for (const off of [-0.3, 0.3]) {
      const r = zone.r + SAFE_MARGIN + off;
      const x = zone.x + Math.cos(a) * r, z = zone.z + Math.sin(a) * r;
      const safe = sys.inSafeZone({ x, z });
      assert.equal(safe, off < 0);
      if (safe) assert.equal(sys.walkable(x, z, raptor, true, true), false, 'no dinosaur stands where players are safe');
    }
  }
});

test('a bite does not land through a ridge or a boulder', () => {
  const s = scene('raptor', 2.5);
  assert.equal(s.sys.canReach(s.d, s.p), true, 'open ground');
  const h = s.world.terrain.heightAt.bind(s.world.terrain);
  s.world.terrain.heightAt = (x, z) => h(x, z) + (Math.hypot(x - s.mid.x, z - s.mid.z) < 0.6 ? 3 : 0);
  assert.equal(s.sys.canReach(s.d, s.p), false, 'ridge');
  s.world.terrain.heightAt = h;
  s.world.layout.rocks.push({ x: s.mid.x, z: s.mid.z, R: 0.8, by: s.p.y - 1, top: s.p.y + 3, scale: 1 });
  assert.equal(s.sys.canReach(s.d, s.p), false, 'boulder');
});

test('head room under a roof comes from each species\' height', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const sys = world.dinos, t = world.terrain;
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type: 'trex', radius: 3 }, zone.x + 80, zone.z, { maxDist: 40 });
  t.isCave = true;
  t.clearanceAt = () => 3.2;
  assert.equal(sys.walkable(spot.x, spot.z, { type: 'raptor' }), true, 'a raptor fits under 3.2 m');
  assert.equal(sys.walkable(spot.x, spot.z, { type: 'gloom-raptor' }), true, 'so does its cave kin');
  assert.equal(sys.walkable(spot.x, spot.z, { type: 'trex' }), false, 'a T-Rex does not');
  t.clearanceAt = () => 7.5;
  assert.equal(sys.walkable(spot.x, spot.z, { type: 'trex' }), true);
});

test('the senses stay within the ray cap with four players among many predators', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const ids = [0, 1, 2, 3].map((i) => world.join(`P${i}`).id);
  const sys = world.dinos;
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type: 'raptor', radius: 2 }, zone.x + 80, zone.z, { maxDist: 40 });
  ids.forEach((id, i) => {
    const p = world.players.get(id);
    p.x = spot.x + i * 4; p.z = spot.z; p.y = world.terrain.heightAt(p.x, p.z); p.spd = 3;
  });
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2, r = 8 + (k % 5) * 6;
    const d = sys.spawn('raptor', spot.x, spot.z, { group: 'pk', slot: k });
    d.x = spot.x + Math.cos(a) * r; d.z = spot.z + Math.sin(a) * r;
  }
  sys.groups.set('pk', { id: 'pk', home: { x: spot.x, z: spot.z }, target: null, wander: null, wanderT: 0 });
  let worst = 0, total = 0, ticks = 0;
  for (let k = 0; k < 100; k++) {
    world.now += DT;
    const t0 = performance.now();
    updateSenses(sys, DT);
    total += performance.now() - t0; ticks++;
    worst = Math.max(worst, sys.raysUsed ?? 0);
  }
  assert.ok(worst <= RAY_CAP, `rays per tick ${worst}`);
  assert.ok(worst > 0, 'it does look');
  // a loose bound (shared CI runners, coverage instrumentation); the budget target is < 1 ms per tick
  assert.ok(total / ticks < 10, `senses ${(total / ticks).toFixed(2)} ms per tick`);
});

test('a T-Rex walks over to a gunshot it hears, roars once it sees the shooter, and searches where it lost them', () => {
  const s = scene('trex', 60);
  s.away();
  const goals = [];
  s.sys.steer = (d, x, z) => { goals.push({ x, z }); return Math.hypot(x - d.x, z - d.z); };
  s.sys.halt = () => {};
  s.d.rest = 0;
  s.world.playerNoise(s.p, 'gun');
  s.run(0.2, trexBrain);
  assert.equal(s.d.mode, 'investigate', 'heard, not seen');
  assert.ok(Math.hypot(goals.at(-1).x - s.p.x, goals.at(-1).z - s.p.z) < 6, 'heads for the shot');
  // it comes round the corner and sees the shooter
  s.d.x = s.p.x + (s.d.x - s.p.x) / 4; s.d.z = s.p.z + (s.d.z - s.p.z) / 4;
  s.face();
  s.p.spd = 2;
  s.run(2, trexBrain);
  assert.ok(['roar', 'chase'].includes(s.d.mode), s.d.mode);
  s.run(2, trexBrain);
  assert.equal(s.d.mode, 'chase');
  // the shooter ducks behind a boulder: the chase goes on to where they were seen last
  const last = { x: s.p.x, z: s.p.z };
  const y = s.world.terrain.heightAt(s.p.x, s.p.z);
  s.world.layout.rocks.push({ x: (s.p.x * 3 + s.d.x) / 4, z: (s.p.z * 3 + s.d.z) / 4, R: 3, by: y - 2, top: y + 9, scale: 1.5 });
  s.p.spd = 0;
  s.run(LOOK, trexBrain);
  goals.length = 0;
  s.run(DT, trexBrain);
  assert.equal(s.d.mode, 'chase');
  assert.ok(Math.hypot(goals[0].x - last.x, goals[0].z - last.z) < 20, 'searches the last sighting');
});
