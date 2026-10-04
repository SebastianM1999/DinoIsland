// The Misty Swamp's own fruit (config.js fruit.types, levels.js biome.fruit):
// marsh berries on the bog shores (Mud Walker: no swamp slowdown), swamp figs
// in strangler figs (Second Wind: stamina) and rare glow lotus (Lotus Skin:
// less damage) – where they grow, what eating them does on the server, and
// how the client feels the buffs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { PlayerController } from '../src/client/player/controller.js';
import { buildFruitPlants } from '../src/client/world/fruitPlants.js';

const F = CONFIG.fruit;
const SWAMP = ['marshberry', 'swampfig', 'glowlotus'];

test('the swamp grows its own three fruit, each where it belongs; other islands keep theirs', () => {
  for (const variant of [1, 2, 3]) {
    const terrain = new Terrain(planIsland(1, variant));
    const layout = buildLayout(terrain);
    const types = new Set(layout.fruitSpots.map((s) => s.type));
    assert.deepEqual([...types].sort(), [...SWAMP].sort(), `v${variant}: ${[...types]}`);
    const by = (t) => layout.fruitSpots.filter((s) => s.type === t);
    assert.ok(by('marshberry').length >= 12, `v${variant}: marsh berry shrubs`);
    assert.ok(by('swampfig').length >= 4, `v${variant}: fig trees`);
    assert.ok(by('glowlotus').length >= 2, `v${variant}: glow lotus`);
    // marsh berries stand on the dry shore of a bog; figs hang in a swamp fig tree; nothing is in the water
    const shore = (s) => [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => terrain.bogAt(s.x + dx, s.z + dz) > 0.2);
    for (const s of by('marshberry')) assert.ok(shore(s), `v${variant}: marsh berries at ${s.x.toFixed(0)},${s.z.toFixed(0)} by a bog`);
    for (const s of by('swampfig')) {
      const tree = layout.trees.find((t) => `tree:${t.id}` === s.host);
      assert.equal(tree?.type, 'swampfig', `v${variant}: fig spot hosted by a swamp fig`);
    }
    for (const s of layout.fruitSpots) assert.equal(terrain.waterDepthAt(s.x, s.z), 0, `v${variant}: ${s.type} on dry ground`);
  }
  for (const level of [0, 2]) {
    const layout = buildLayout(new Terrain(planIsland(level, 1)));
    for (const s of layout.fruitSpots) assert.ok(['berry', 'mango', 'dragon'].includes(s.type), `island ${level + 1} keeps the jungle fruit (${s.type})`);
  }
});

test('every fruit kind has a role, and every buff it names exists', () => {
  for (const [k, ft] of Object.entries(F.types)) {
    assert.ok(['bush', 'tree', 'plant'].includes(ft.role), `${k} role`);
    if (ft.buff) assert.ok(F.buffs[ft.buff]?.time > 0, `${k} buff ${ft.buff}`);
  }
});

/** The swamp, no dinosaurs, one player on dry ground. */
function swampWorld() {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push({ to, msg }) }, { level: 1, variant: 1 });
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const players = ['A', 'B'].map((n) => world.players.get(world.join(n).id));
  const hut = world.layout.hut;
  const at = world.dinos.findFreeSpot({ type: 'raptor', radius: 0.7 }, hut.x + 60, hut.z);
  players.forEach((p, i) => { p.x = at.x + i * 0.8; p.z = at.z; p.y = world.terrain.heightAt(p.x, p.z); });
  const run = (s) => { for (let t = 0; t < s - 1e-9; t += 0.05) world.step(0.05); };
  const act = (p, m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const lastInv = (p) => out.filter((o) => o.to === p.id && o.msg.t === MSG.INV).at(-1)?.msg.inv;
  return { world, players, run, act, lastInv };
}

test('eating swamp fruit heals and starts its buff; the buff reaches the client and ends', () => {
  const { players: [a], run, act, lastInv } = swampWorld();
  for (const type of SWAMP) {
    const ft = F.types[type], buff = F.buffs[ft.buff];
    a.hp = 20; a.hot = null;
    a.inv.fruit = [type];
    act(a, { a: ACT.EAT, fruit: type });
    run(F.eatTime + 0.1);
    assert.ok(a.hp >= 20 + ft.heal - 0.5, `${type} heals`);
    const sent = lastInv(a)?.buffs?.[ft.buff];
    assert.ok(sent > buff.time - 1 && sent <= buff.time, `${type}: ${ft.buff} sent with ${sent} s left`);
  }
  run(F.buffs.mudwalker.time + 1);
  assert.equal(a.buffs.mudwalker > a.buffs.lotusskin, true, 'later buffs end later');
  a.inv.fruit = [];
  act(a, { a: ACT.EAT });
  run(F.buffs.secondwind.time + 1);
});

test('Lotus Skin takes a quarter off every hit while it lasts', () => {
  const { world, players: [a], run, act } = swampWorld();
  a.hp = a.maxHp = 100;
  world.hurtPlayer(a, 20, { src: 'raptor' });
  assert.equal(a.hp, 80);
  a.inv.fruit = ['glowlotus'];
  act(a, { a: ACT.EAT });
  run(F.eatTime + 0.1);
  a.hot = null; a.hp = 80;
  world.hurtPlayer(a, 20, { src: 'raptor' });
  assert.equal(a.hp, 80 - 20 * F.buffs.lotusskin.damageMul);
  run(F.buffs.lotusskin.time + 0.5);
  a.hp = 80;
  world.hurtPlayer(a, 20, { src: 'raptor' });
  assert.equal(a.hp, 60, 'the buff is over');
});

test('a Field Medic feeding swamp fruit passes its buff on; death clears buffs', () => {
  const { world, players: [a, b], act, lastInv } = swampWorld();
  a.mods = { ...a.mods, fieldMedic: true };
  b.hp = 30;
  a.inv.fruit = ['marshberry'];
  act(a, { a: ACT.GIVE, to: b.id, heal: true });
  assert.ok(b.buffs.mudwalker > world.now, 'b got Mud Walker');
  assert.ok(lastInv(b)?.buffs?.mudwalker > 0);
  world.hurtPlayer(b, 10000, { src: 'raptor' });
  assert.deepEqual(b.buffs, {});
});

test('the buffs on the client: Mud Walker lifts the bog slowdown, Second Wind refills stamina faster', () => {
  const DT = 1 / 60;
  const bog = {
    heightAt: () => 0, gradientAt: () => ({ x: 0, z: 0 }), slopeAt: () => 0,
    waterDepthAt: () => 0.25, inlandWaterLevelAt: () => 0.25, seaDepthAt: () => 0,
    swampSpeedAt: () => CONFIG.player.swampSpeedMul,
  };
  const speed = (buffs) => {
    const pc = new PlayerController(bog, { circles: [], boxes: [] });
    pc.teleport(0, 0, 0);
    pc.setBuffs(buffs);
    pc.update(DT, {});
    for (let i = 0; i < 60; i++) pc.update(DT, { forward: true });
    return pc.moveSpeed;
  };
  const slowed = speed({}), walker = speed({ mudwalker: 10 });
  assert.ok(Math.abs(walker * CONFIG.player.swampSpeedMul - slowed) < 0.05, `${walker} vs ${slowed}`);
  const regen = (buffs) => {
    const pc = new PlayerController({ ...bog, swampSpeedAt: () => 1, waterDepthAt: () => 0, inlandWaterLevelAt: () => null }, { circles: [], boxes: [] });
    pc.teleport(0, 0, 0);
    pc.setBuffs(buffs);
    pc.stamina = 0;
    pc.staminaDelay = 0;
    for (let i = 0; i < 60; i++) pc.update(DT, {});   // one second: well below full either way
    return pc.stamina;
  };
  assert.ok(regen({ secondwind: 30 }) > regen({}) * 1.5, 'Second Wind refills faster');
  // a buff counts down and runs out on the client too
  const pc = new PlayerController(bog, { circles: [], boxes: [] });
  pc.setBuffs({ mudwalker: 0.5 });
  for (let i = 0; i < 40; i++) pc.update(DT, {});
  assert.equal(pc.buffs.mudwalker, undefined);
});

test('the client shows the swamp fruit on their plants', () => {
  const terrain = new Terrain(planIsland(1, 1));
  const layout = buildLayout(terrain);
  const plants = buildFruitPlants(terrain, layout);
  for (const name of ['fruit-marshberries', 'marshberry-bushes', 'fruit-swampfigs', 'fruit-glowlotus', 'lotus-plants']) {
    assert.ok(plants.group.getObjectByName(name), name);
  }
  const lotus = layout.fruitSpots.find((s) => s.type === 'glowlotus');
  plants.setCount(lotus.id, 2);
  plants.update(0.5, 1);
  assert.ok(plants.getAnchor(lotus.id).y > lotus.y);
});
