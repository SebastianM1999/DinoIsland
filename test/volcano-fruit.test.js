// Ashfall Isle's own fruit (config.js fruit.types, levels.js biome.fruit):
// ember chilis on warm ground (Fireproof: no heat damage or exhaustion),
// ash plums in the green pockets (Quickfoot: faster), rare obsidian figs at the
// basalt spires (Sharp Edge: more damage to dinosaurs).
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
const VOLCANO = ['emberchili', 'ashplum', 'obsidianfig'];

test('the volcano grows its own three fruit, each where it belongs', () => {
  for (const variant of [1, 2, 3, 4]) {
    const terrain = new Terrain(planIsland(2, variant));
    const layout = buildLayout(terrain);
    const by = (t) => layout.fruitSpots.filter((s) => s.type === t);
    assert.deepEqual([...new Set(layout.fruitSpots.map((s) => s.type))].sort(), [...VOLCANO].sort(), `v${variant}`);
    assert.ok(by('emberchili').length >= 10, `v${variant}: chili shrubs`);
    assert.ok(by('ashplum').length >= 2, `v${variant}: plum trees`);
    assert.ok(by('obsidianfig').length >= 2, `v${variant}: obsidian figs`);
    // chilis on warm (not burning) ground, plums hanging in an ash plum tree, nothing on lava
    for (const s of by('emberchili')) {
      const h = terrain.heatAt(s.x, s.z);
      assert.ok(h > 0.15 && h < 0.45, `v${variant}: chili on warm ground (${h.toFixed(2)})`);
    }
    for (const s of by('ashplum')) assert.equal(layout.trees.find((t) => `tree:${t.id}` === s.host)?.type, 'ashplum');
    for (const s of layout.fruitSpots) {
      assert.equal(terrain.lavaLevelAt(s.x, s.z), null);
    }
  }
});

function volcanoWorld() {
  const out = [];
  const world = new ServerWorld({ send: (to, msg) => out.push({ to, msg }) }, { level: 2, variant: 1 });
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const p = world.players.get(world.join('Ember').id);
  const run = (s) => { for (let t = 0; t < s - 1e-9; t += 0.05) world.step(0.05); };
  const act = (m) => world.receive(p.id, { t: MSG.ACT, ...m });
  const lastInv = () => out.filter((o) => o.to === p.id && o.msg.t === MSG.INV).at(-1)?.msg.inv;
  return { world, p, run, act, lastInv };
}

test('eating volcano fruit heals and starts its buff; the buff reaches the client', () => {
  const { p, run, act, lastInv } = volcanoWorld();
  for (const type of VOLCANO) {
    const ft = F.types[type], buff = F.buffs[ft.buff];
    p.hp = 20; p.hot = null;
    p.inv.fruit = [type];
    act({ a: ACT.EAT, fruit: type });
    run(F.eatTime + 0.1);
    assert.ok(p.hp >= 20 + ft.heal - 0.5, `${type} heals`);
    const sent = lastInv()?.buffs?.[ft.buff];
    assert.ok(sent > buff.time - 1 && sent <= buff.time, `${type}: ${ft.buff} sent with ${sent} s left`);
  }
});

test('Sharp Edge: a quarter more damage to dinosaurs while it lasts', () => {
  const { world, p } = volcanoWorld();
  const d = world.dinos.spawn('stego', p.x + 30, p.z);
  const base = world.damageMul(p, d, 'spear');
  p.buffs = { sharpedge: world.now + 10 };
  assert.ok(Math.abs(world.damageMul(p, d, 'spear') - base * F.buffs.sharpedge.dinoDamageMul) < 1e-9);
  assert.equal(world.damageMul(p, d, 'trap'), 1, 'traps stay as they are');
});

test('on the client: hot ground drains stamina, Fireproof stops it, Quickfoot is faster', () => {
  const DT = 1 / 60;
  const ground = (heat) => ({
    heightAt: () => 0, gradientAt: () => ({ x: 0, z: 0 }), slopeAt: () => 0,
    waterDepthAt: () => 0, inlandWaterLevelAt: () => null, seaDepthAt: () => 0, heatAt: () => heat,
  });
  const refill = (heat, buffs = {}) => {
    const pc = new PlayerController(ground(heat), { circles: [], boxes: [] });
    pc.teleport(0, 0, 0);
    pc.setBuffs(buffs);
    pc.stamina = 0;
    pc.staminaDelay = 0;
    for (let i = 0; i < 60; i++) pc.update(DT, {});
    return pc.stamina;
  };
  assert.ok(refill(1) < refill(0) * 0.6, 'stamina refills slower on hot ground');
  assert.ok(Math.abs(refill(1, { heatproof: 10 }) - refill(0)) < 0.5, 'Fireproof: as on cool ground');
  const speed = (buffs) => {
    const pc = new PlayerController(ground(0), { circles: [], boxes: [] });
    pc.teleport(0, 0, 0);
    pc.setBuffs(buffs);
    pc.update(DT, {});
    for (let i = 0; i < 60; i++) pc.update(DT, { forward: true });
    return pc.moveSpeed;
  };
  const quick = speed({ quickfoot: 10 }), normal = speed({});
  assert.ok(Math.abs(quick / normal - F.buffs.quickfoot.speedMul) < 0.03, `${quick} vs ${normal}`);
  const pc = new PlayerController(ground(0.8), { circles: [], boxes: [] });
  pc.update(DT, {});
  assert.ok(pc.heat > 0.7, 'the controller knows the heat underfoot (HUD)');
});

test('the client shows the volcano fruit on their plants', () => {
  const terrain = new Terrain(planIsland(2, 1));
  const layout = buildLayout(terrain);
  const plants = buildFruitPlants(terrain, layout);
  for (const name of ['fruit-emberchilis', 'chili-bushes', 'fruit-ashplums', 'fruit-obsidianfigs', 'cactus-plants']) {
    assert.ok(plants.group.getObjectByName(name), name);
  }
});
