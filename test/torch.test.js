import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, MSG, PF, EV } from '../src/shared/protocol.js';
import { TORCH, WALL_TORCH, carriesLight, softCapIrradiance, pointIrradiance, LIGHT_CAP } from '../src/shared/torch.js';

function setup(spots) {
  const events = [];
  const world = new ServerWorld({ send(to, msg) { if (msg.t === MSG.EV) events.push(msg); } });
  if (spots) { world.layout.torchSpots = spots; world.placeTorches(); }
  const { id } = world.join('Torchbearer');
  const p = world.players.get(id);
  const act = (a, extra = {}) => world.receive(id, { t: MSG.ACT, a, ...extra });
  const state = (fl) => world.receive(id, { t: MSG.STATE, s: ++p.lastSeq + 1, k: p.epoch, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl });
  const torches = () => [...world.items.values()].filter((i) => i.kind === 'torch');
  return { world, p, act, state, torches, events };
}

test('PF.TORCH is its own bit and carriesLight reads it', () => {
  assert.equal(PF.TORCH, 256);
  assert.equal(Object.values(PF).filter((v) => (v & PF.TORCH) !== 0).length, 1);
  assert.equal(carriesLight(PF.TORCH | PF.GROUND), true);
  assert.equal(carriesLight({ fl: PF.SPRINT }), false);
  assert.equal(carriesLight(null), false);
});

test('islands without torchSpots have no torch items', () => {
  const { torches, world } = setup();
  assert.equal(world.layout.torchSpots.length, 0);
  assert.equal(torches().length, 0);
});

test('every torch spot holds one torch item', () => {
  const { torches } = setup([{ x: 1, z: 2 }, { x: -3, z: 4 }]);
  assert.equal(torches().length, 2);
  assert.deepEqual(torches().map((t) => t.spot).sort(), [0, 1]);
});

test('the PF.TORCH flag is only accepted while the server inventory has a torch', () => {
  const { p, state } = setup();
  state(PF.TORCH | PF.GROUND);
  assert.equal(p.fl & PF.TORCH, 0);
  assert.equal(p.fl & PF.GROUND, PF.GROUND);
  p.inv.torch = true;
  state(PF.TORCH | PF.GROUND);
  assert.equal(p.fl & PF.TORCH, PF.TORCH);
});

test('picking up a torch sets the inventory flag, once, and it respawns at its spot', () => {
  const { world, p, act, torches, events } = setup([{ x: 0, z: 0 }]);
  assert.equal(p.inv.torch, false);
  const [first] = torches();
  Object.assign(p, { x: first.x, z: first.z });
  act(ACT.PICKUP, { item: first.id });
  assert.equal(p.inv.torch, true);
  assert.equal(torches().length, 0);

  world.step(TORCH.respawnTime - 1);
  assert.equal(torches().length, 0, 'not back yet');
  world.step(2);
  const [again] = torches();
  assert.ok(again, 'respawned');
  assert.ok(events.some((e) => e.e === EV.ITEM_ADD && e.item?.kind === 'torch'));

  // an owner does not use the torch up
  act(ACT.PICKUP, { item: again.id });
  assert.equal(torches().length, 1);
});

test('a torch is kept across respawn and an item never expires', () => {
  const { world, p, torches } = setup([{ x: 0, z: 0 }]);
  p.inv.torch = true;
  world.respawnPlayer(p);
  assert.equal(p.inv.torch, true);
  world.step(10000);
  assert.equal(torches().length, 1);
});

// --- close-up shading: the cave shaders cap every point light's irradiance (shared/torch.js softCapIrradiance, the same
// formula as caveSky.js caveSoftCap), so a wall a metre from the hand torch stays below white after ACES tone mapping.
const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const hexLinear = (hex) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
/** three.js ACESFilmic on one grey channel (RRT + ODT fit, exposure / 0.6) */
const aces = (x, exposure) => { const v = Math.max(0, x) * exposure / 0.6; return Math.min(1, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)); };
/** tone-mapped linear colour of a Lambert wall of `albedo` lit by `light` at `d` metres head-on */
function wallColour(light, albedo, d, { cap = true, exposure = 1.1 } = {}) {
  const e = pointIrradiance(light, d);
  // (the cap scales the colour by its brightest channel, like the shader)
  const m = Math.max(...hexLinear(light.color)) * e;
  const k = cap ? softCapIrradiance(m) / m : 1;
  return hexLinear(light.color).map((ch) => aces(albedo / Math.PI * ch * e * k, exposure));
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('the soft cap leaves normal light alone and bounds the close-up irradiance', () => {
  assert.equal(softCapIrradiance(0), 0);
  for (const e of [0.1, 0.5, 1, 2, 3]) assert.ok(softCapIrradiance(e) > e * 0.95, `${e} barely changes`);
  let prev = 0;
  for (const e of [0.5, 2, 5, 8, 15, 40, 400]) { const c = softCapIrradiance(e); assert.ok(c > prev && c <= LIGHT_CAP * 1.0001, `${e} -> ${c}`); prev = c; }
});

test('a wall a metre from the hand torch or a wall torch stays below white after tone mapping', () => {
  for (const light of [TORCH.light, WALL_TORCH.light]) {
    for (const albedo of [0.2, 0.4, 0.65]) for (const d of [0.4, 0.7, 1, 1.5]) {
      const rgb = wallColour({ ...light }, albedo, d);
      assert.ok(luminance(rgb) < 0.9, `albedo ${albedo} at ${d} m: luminance ${luminance(rgb).toFixed(2)}`);
      assert.ok(Math.max(...rgb) < 0.97, `albedo ${albedo} at ${d} m: channel ${Math.max(...rgb).toFixed(2)} clips`);
    }
  }
  // the old, uncapped light did clip a bright wall at 40 cm
  const raw = wallColour(TORCH.light, 0.65, 0.4, { cap: false });
  assert.ok(Math.max(...raw) > 0.97, `uncapped ${Math.max(...raw).toFixed(2)}`);
  // and the walls stay readable further out: 3 m and 6 m are within 5 % of the uncapped light's brightness
  for (const d of [3, 6]) {
    const a = luminance(wallColour(TORCH.light, 0.4, d)), b = luminance(wallColour(TORCH.light, 0.4, d, { cap: false }));
    assert.ok(a > b * 0.95 && a > 0.1, `${d} m: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
  }
});
