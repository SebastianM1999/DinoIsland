import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';
import { BUILD_TIME, plotPoint, repairCost } from '../src/shared/base.js';
import { RAID, raidGroup } from '../src/sim/raids.js';
import { makeRng } from '../src/shared/rng.js';
import { findPath } from '../src/sim/pathfind.js';

/** Island 2 (variant 7), no wild dinosaurs, a camp standing on plot 0 and one player at its fire. */
function campWithPlayer() {
  const events = [];
  const world = new ServerWorld({ send: (to, msg) => events.push(msg) }, { level: 1, variant: 7 });
  const { id } = world.join('Defender');
  const p = world.players.get(id);
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const act = (m) => world.receive(id, { t: MSG.ACT, ...m });
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.1) { world.step(0.1); p.lastInput = world.now; } };
  const goTo = (pt) => { p.x = pt.x; p.z = pt.z; p.y = world.layout.groundAt(pt.x, pt.z); };
  const plot = world.layout.basePlots[0];
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  for (const k of Object.keys(world.store)) world.store[k] = 99;
  act({ a: ACT.BASE, op: 'build', plot: 0 });
  run(BUILD_TIME + 0.5);
  p.creative = true;            // the defender watches; nobody gets hurt
  goTo(plotPoint(plot, [-3, -9]));
  events.length = 0;
  return { world, p, act, run, goTo, plot, events };
}

const raidEvents = (events) => events.filter((m) => m.e === EV.RAID).map((m) => m.raid.phase);

test('raid paths detour around water between otherwise walkable grid centers', () => {
  const sys = {
    terrain: { heightAt: () => 1 },
    walkable: (x, z) => Math.abs(x) <= 12 && Math.abs(z) <= 8
      && !(x > 1 && x < 3 && Math.abs(z) < 1),
  };
  const path = findPath(sys, { type: 'raptor', radius: 1, raid: true }, 0, 0, 8, 0, 0, 100, { every: 1 });
  assert.ok(path && path.some(p => Math.abs(p.z) >= 4), 'the route goes around the narrow channel');
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    for (let t = 0; t <= 1; t += 0.05) {
      assert.ok(sys.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), 'each route edge stays on walkable ground');
    }
  }
});

test('a raid is announced, then a group comes – bigger bases draw bigger raids', () => {
  const { world, run, events } = campWithPlayer();
  assert.equal(world.raids.phase, 'idle');
  run(RAID.first - 1);
  assert.equal(world.raids.phase, 'idle', 'the first raid waits a while after the build');
  run(1.5);
  assert.equal(world.raids.phase, 'warn');
  assert.deepEqual(raidEvents(events), ['warn']);
  run(RAID.warn + 0.5);
  assert.equal(world.raids.phase, 'active');
  const raiders = world.dinos.list.filter((d) => d.raid);
  assert.equal(raiders.length, raidGroup(1, 1).reduce((s, g) => s + g.n, 0));
  assert.ok(raidGroup(3, 1).reduce((s, g) => s + g.n, 0) > raiders.length);
  assert.ok(raidGroup(3, 1).some((g) => g.type === 'trex' || g.type === 'stego'), 'a fort draws a big one');
});

test('no raid while nobody is near the base', () => {
  const { world, p, run, goTo } = campWithPlayer();
  goTo(world.layout.boat);   // the boat beach, far from the plot
  const plot = world.layout.basePlots[0];
  assert.ok(Math.hypot(p.x - plot.x, p.z - plot.z) > RAID.nearPlayers);
  run(RAID.first + 40);
  assert.equal(world.raids.phase, 'idle');
});

// Exercise repeatable approach/spawn configurations rather than betting CI on
// an arbitrary random route. Mock restoration is scoped to each test.
for (const seed of [1, 7, 42, 295]) {
test(`raiders wreck the base (never destroy it) and the team repairs it (seed ${seed})`, (t) => {
  let state = seed;
  // LCG seed 295 reproduces all three raiders wedged at the first swamp-bank corner.
  const random = seed === 295
    ? () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296)
    : makeRng(seed);
  t.mock.method(Math, 'random', random);
  const { world, p, act, run, goTo, plot } = campWithPlayer();
  world.raids.nextAt = world.now;          // straight to the raid
  run(RAID.warn + 1);
  assert.equal(world.raids.phase, 'active');
  for (let t = 0; t < 150 && !world.base.damaged; t += 1) run(1);
  assert.ok(world.base.damaged, 'the raiders reached and wrecked the camp');
  assert.equal(world.base.stage, 1, 'nothing is torn down');
  assert.equal(world.safeZone(), null, 'a wrecked base keeps no dinosaurs away');
  assert.equal(world.stations().fire, null, 'and does not heal');
  const cost = repairCost(world.base, 1);
  const before = { ...world.store };
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  p.creative = false;            // creative mode would repair for free
  act({ a: ACT.BASE, op: 'repair' });
  assert.ok(!world.base.damaged && world.base.hp === world.base.maxHp);
  for (const [k, n] of Object.entries(cost)) assert.equal(world.store[k], before[k] - n);
  assert.ok(world.safeZone());
});
}

test('a raid ends when every raider is down; raiders never respawn', () => {
  const { world, run, events } = campWithPlayer();
  world.raids.nextAt = world.now;
  run(RAID.warn + 1);
  const raiders = world.dinos.list.filter((d) => d.raid);
  for (const d of raiders) world.dinos.kill(d, null);
  run(0.5);
  assert.equal(world.raids.phase, 'idle');
  assert.ok(events.some((m) => m.e === EV.TOAST && /repelled/i.test(m.text)));
  assert.ok(world.dinos.respawnQueue.every((r) => !raiders.some((d) => d.type === r.type)), 'no respawns queued for raiders');
  assert.ok(world.raids.nextAt >= world.now + RAID.gapMin - 1, 'the next raid comes later');
});

test('raiders give up after a while', () => {
  const { world, run } = campWithPlayer();
  world.raids.nextAt = world.now;
  run(RAID.warn + 1);
  // keep the base standing so the raid cannot "win"
  const keep = () => { world.base.hp = world.base.maxHp; world.base.damaged = false; };
  for (let t = 0; t < RAID.maxTime + 2; t += 1) { keep(); run(1); }
  assert.equal(world.raids.phase, 'idle');
  assert.equal(world.dinos.list.filter((d) => d.raid).length, 0);
});
