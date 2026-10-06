import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';
import { BASE_STAGES, BUILD_TIME, MAX_STAGE, TOWERS, stageCost, towerCost, plotPoint, campStations } from '../src/shared/base.js';
import { penetration } from '../src/shared/collision.js';

const P = CONFIG.player;

/** A world on island 2 with one player and no dinosaurs. */
function island2() {
  const events = [];
  const world = new ServerWorld({ send: (to, msg) => events.push(msg) }, { level: 1, variant: 7 });
  const { id } = world.join('Builder');
  const p = world.players.get(id);
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  world.dinos.spawnAll = () => {};
  const act = (m) => world.receive(id, { t: MSG.ACT, ...m });
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.1) world.step(0.1); };
  const goTo = (pt) => { p.x = pt.x; p.z = pt.z; p.y = world.layout.groundAt(pt.x, pt.z); };
  const fill = () => { for (const k of Object.keys(world.store)) world.store[k] = 99; };
  return { world, p, act, run, goTo, fill, events };
}

test('island 1 keeps its hunting hut; later islands get building plots and a landing camp', () => {
  const first = new ServerWorld({ send() {} }, { level: 0, variant: 7 });
  assert.equal(first.layout.basePlots.length, 0);
  assert.ok(first.stations().workbench && first.safeZone(), 'the hut crafts and is safe');
  const { world } = island2();
  assert.ok(world.layout.basePlots.length >= 2, 'a choice of plots');
  const st = world.stations();
  assert.equal(st.workbench, null, 'no crafting at the landing camp');
  assert.equal(st.fire, null, 'the landing fire does not heal');
  assert.equal(world.safeZone(), null, 'no safe zone without a base');
  assert.equal(st.dropOff.length, 1, 'loot can be dropped off at the landing crate');
});

test('building a camp on a plot costs store loot and stands after the build time', () => {
  const { world, p, act, run, goTo, fill, events } = island2();
  const plot = world.layout.basePlots[1];
  // far from the plot: refused
  act({ a: ACT.BASE, op: 'build', plot: 1 });
  assert.equal(world.base.plot, null);
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  // not enough loot: refused
  act({ a: ACT.BASE, op: 'build', plot: 1 });
  assert.equal(world.base.plot, null);
  fill();
  const boxes = world.layout.playerColliders.boxes.length;
  act({ a: ACT.BASE, op: 'build', plot: 1 });
  assert.equal(world.base.plot, 1);
  assert.equal(world.base.building.stage, 1);
  for (const [k, n] of Object.entries(stageCost(1, 1))) assert.equal(world.store[k], 99 - n);
  assert.ok(events.some((m) => m.e === EV.BASE));
  // a second plot cannot be taken
  goTo(plotPoint(world.layout.basePlots[0], [0, 0]));
  act({ a: ACT.BASE, op: 'build', plot: 0 });
  assert.equal(world.base.plot, 1);
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  run(BUILD_TIME - 1);
  assert.equal(world.base.stage, 0, 'still under construction');
  run(1.5);
  assert.equal(world.base.stage, 1);
  assert.equal(world.base.hp, BASE_STAGES[1].hp);
  assert.ok(world.layout.playerColliders.boxes.length > boxes, 'the camp collides');
  // the camp works: crafting bench, healing fire, safe zone, respawn at the base
  const st = world.stations();
  assert.ok(st.workbench && st.fire);
  const zone = world.safeZone();
  assert.ok(Math.hypot(zone.x - st.fire.x, zone.z - st.fire.z) < 0.01 && zone.r === BASE_STAGES[1].heal);
  goTo(st.fire);
  p.x += 2;
  p.hp = 40;
  run(2);
  assert.ok(p.hp > 40, 'the base campfire heals');
  const sp = world.spawnPoint(p.slot);
  assert.ok(Math.hypot(sp.x - st.fire.x, sp.z - st.fire.z) < 8, 'respawn at the base');
});

test('the base grows stage by stage up to the fort, each stage from the store', () => {
  const { world, act, run, goTo, fill } = island2();
  const plot = world.layout.basePlots[0];
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  fill();
  act({ a: ACT.BASE, op: 'upgrade' });
  assert.equal(world.base.building, null, 'nothing to upgrade before the camp');
  act({ a: ACT.BASE, op: 'build', plot: 0 });
  act({ a: ACT.BASE, op: 'upgrade' });
  assert.equal(world.base.building.stage, 1, 'one build at a time');
  run(BUILD_TIME + 0.5);
  for (let stage = 2; stage <= MAX_STAGE; stage++) {
    const before = { ...world.store };
    act({ a: ACT.BASE, op: 'upgrade' });
    assert.equal(world.base.building?.stage, stage);
    for (const [k, n] of Object.entries(stageCost(stage, 1))) assert.equal(world.store[k], before[k] - n);
    run(BUILD_TIME + 0.5);
    assert.equal(world.base.stage, stage);
  }
  const st = campStations(world.layout, world.base, 1);
  assert.ok(st.wardrobe && st.board, 'the lodge brings wardrobe and mission board');
  assert.equal(world.safeZone().r, BASE_STAGES[MAX_STAGE].heal);
  act({ a: ACT.BASE, op: 'upgrade' });
  assert.equal(world.base.building, null, 'no stage after the fort');
});

test('nobody is walled in when a stage is finished', () => {
  const { world, p, act, run, goTo, fill } = island2();
  const plot = world.layout.basePlots[0];
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  fill();
  act({ a: ACT.BASE, op: 'build', plot: 0 });
  goTo(plotPoint(plot, 'tent'));   // standing where the tent goes up
  run(BUILD_TIME + 0.5);
  assert.equal(world.base.stage, 1);
  assert.ok(penetration(p.x, p.z, P.radius, world.layout.playerColliders, p.y + 0.05, p.y + P.height, P.stepHeight) <= 0.01);
});

test('every new island starts without a base', () => {
  const { world, act, run, goTo, fill } = island2();
  const plot = world.layout.basePlots[0];
  goTo(plotPoint(plot, [0, -plot.r + 3]));
  fill();
  act({ a: ACT.BASE, op: 'build', plot: 0 });
  run(BUILD_TIME + 0.5);
  world.nextLevel();
  assert.equal(world.base.stage, 0);
  assert.equal(world.base.plot, null);
});

// ------------------------------------------------------------------ towers

/** Island 2 with a lodge (2 tower spots) standing and the store full. */
function lodge() {
  const s = island2();
  const plot = s.world.layout.basePlots[0];
  s.goTo(plotPoint(plot, [0, -plot.r + 3]));
  s.fill();
  s.act({ a: ACT.BASE, op: 'build', plot: 0 });
  s.run(BUILD_TIME + 0.5);
  s.act({ a: ACT.BASE, op: 'upgrade' });
  s.run(BUILD_TIME + 0.5);
  assert.equal(s.world.base.stage, 2);
  return { ...s, plot };
}

test('towers go on the open tower spots, cost store loot and can be upgraded once', () => {
  const { world, act, fill } = lodge();
  fill();
  act({ a: ACT.BASE, op: 'tower', slot: 2, kind: 'arrow' });
  assert.equal(world.base.towers.length, 0, 'spot 3 opens with the fort');
  const before = { ...world.store };
  act({ a: ACT.BASE, op: 'tower', slot: 0, kind: 'arrow' });
  act({ a: ACT.BASE, op: 'tower', slot: 0, kind: 'ballista' });
  assert.equal(world.base.towers.length, 1, 'one tower per spot');
  for (const [k, n] of Object.entries(towerCost('arrow', 1, 1))) assert.equal(world.store[k], before[k] - n);
  act({ a: ACT.BASE, op: 'towerUp', slot: 0 });
  assert.equal(world.base.towers[0].level, 2);
  act({ a: ACT.BASE, op: 'towerUp', slot: 0 });
  assert.equal(world.base.towers[0].level, 2);
  const boxes = world.layout._baseColliders.boxes.length;
  act({ a: ACT.BASE, op: 'tower', slot: 1, kind: 'ballista' });
  assert.equal(world.layout._baseColliders.boxes.length, boxes + 1, 'a new tower collides');
});

test('towers shoot hostile dinosaurs in range – raiders first – and leave calm ones alone', () => {
  const { world, act, run, plot, events } = lodge();
  act({ a: ACT.BASE, op: 'tower', slot: 0, kind: 'arrow' });
  const at = (lx, lz) => plotPoint(plot, [lx, lz]);
  const calm = world.dinos.spawn('stego', at(-2, -6).x, at(-2, -6).z);
  calm.x = at(-2, -6).x; calm.z = at(-2, -6).z;
  events.length = 0;
  run(2);
  assert.ok(!events.some((m) => m.e === EV.TOWER_SHOT), 'a calm stegosaurus is left alone');
  const raider = world.dinos.spawn('raptor', at(4, -4).x, at(4, -4).z);
  raider.x = at(4, -4).x; raider.z = at(4, -4).z;
  raider.raid = { target: null };
  const hp = raider.hp;
  run(TOWERS.arrow.cooldown + 0.2);
  const shots = events.filter((m) => m.e === EV.TOWER_SHOT);
  assert.ok(shots.length >= 1 && shots.every((m) => m.dino === raider.id));
  assert.ok(raider.hp < hp, 'the raider takes damage');
  // a damaged tower does not fire
  world.base.towers[0].damaged = true;
  events.length = 0;
  run(3);
  assert.ok(!events.some((m) => m.e === EV.TOWER_SHOT));
});

test('a ballista cannot hit a pterosaur in the air, an arrow tower can', () => {
  const { world, act, run, plot, events } = lodge();
  act({ a: ACT.BASE, op: 'tower', slot: 0, kind: 'ballista' });
  const p = plotPoint(plot, [0, -4]);
  // circles right above the base (its circling area is the base itself)
  const ptera = world.dinos.spawn('ptera', p.x, p.z, { nest: { x: p.x, z: p.z }, area: { x: p.x, z: p.z }, slot: 0 });
  ptera.x = p.x; ptera.z = p.z;
  // pinned in place: its random circling start angle could carry it out of the arrow tower's range
  const keepFlying = () => { ptera.x = p.x; ptera.z = p.z; ptera.y = world.terrain.heightAt(p.x, p.z) + 12; ptera.raid = { target: null }; };
  keepFlying();
  events.length = 0;
  for (let i = 0; i < 40; i++) { keepFlying(); run(0.1); }
  assert.ok(!events.some((m) => m.e === EV.TOWER_SHOT));
  act({ a: ACT.BASE, op: 'tower', slot: 1, kind: 'arrow' });
  for (let i = 0; i < 20; i++) { keepFlying(); run(0.1); }
  assert.ok(events.some((m) => m.e === EV.TOWER_SHOT && m.kind === 'arrow'));
});
