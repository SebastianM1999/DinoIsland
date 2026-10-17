import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, EQUIP, EV, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { leftHandBusy } from '../src/shared/torch.js';

const W = CONFIG.weapons.sniper;
function setup(options = {}) {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push(msg) }, { variant: 1, ...options });
  const { id } = world.join('Sharpshooter');
  const player = world.players.get(id);
  // High above the outdoor island: no terrain/prop hides the combat validation being tested.
  Object.assign(player, { x: 0, y: 100, z: 0, yaw: 0, pitch: 0, eq: EQUIP.indexOf('sniper') });
  const dino = world.dinos.list.find(d => !d.leash && d.type !== 'ptera');
  Object.assign(dino, { x: 0, y: 100, z: -200, hp: 10000, maxHp: 10000 });
  const act = (a, extra = {}) => world.receive(id, { t: MSG.ACT, a, ...extra });
  const shot = (extra = {}) => act(ACT.SHOT, { kind: 'sniper', o: [0, 100 + CONFIG.player.eyeHeight, 0],
    dir: [0, 0, -1], dino: dino.id, p: [0, 100 + CONFIG.player.eyeHeight, dino.z], zone: 'body', ...extra });
  return { world, player, dino, messages, act, shot };
}

test('sniper occupies pocket eight, suppresses the torch and damages a distant target through the action protocol', () => {
  const { player, dino, shot, messages } = setup();
  assert.equal(EQUIP[7], 'sniper');
  assert.ok(leftHandBusy('sniper'));
  assert.deepEqual(player.inv.guns.sniper, { loaded: W.magazine, reserve: W.reserve });
  player.mods.gunMul = 1.25;
  shot();
  assert.equal(dino.hp, 10000 - W.damage * 1.25, 'Marksman applies to the fourth firearm');
  assert.equal(player.inv.guns.sniper.loaded, W.magazine - 1);
  assert.ok(messages.some(m => m.t === MSG.EV && m.e === EV.SHOT && m.kind === 'sniper'));
});

test('sniper cycling survives equipment switches and repeated requests cannot create an extra shot', () => {
  const { world, player, shot, act } = setup();
  shot();
  player.eq = EQUIP.indexOf('rifle');
  act(ACT.SHOT, { kind: 'rifle', o: [0, 100 + CONFIG.player.eyeHeight, 0], dir: [0, 0, -1] });
  assert.equal(player.inv.guns.rifle.loaded, CONFIG.weapons.rifle.magazine);
  player.eq = EQUIP.indexOf('sniper');
  for (let i = 0; i < 5; i++) shot();
  assert.equal(player.inv.guns.sniper.loaded, W.magazine - 1);
  world.step(W.cooldown);
  shot({ dino: null });
  assert.equal(player.inv.guns.sniper.loaded, W.magazine - 2);
  for (let i = 0; i < 5; i++) shot();
  assert.equal(player.inv.guns.sniper.loaded, W.magazine - 2);
});

test('sniper reload transfers only required rounds after its duration and switching cancels it', () => {
  const { world, player, act, shot } = setup();
  const ammo = player.inv.guns.sniper;
  ammo.loaded = 1; ammo.reserve = 9;
  act(ACT.RELOAD, { kind: 'sniper' });
  shot();
  assert.equal(ammo.loaded, 1, 'cannot fire during reload');
  world.step(W.reloadTime - 0.01);
  assert.deepEqual(ammo, { loaded: 1, reserve: 9 });
  world.step(0.02);
  assert.deepEqual(ammo, { loaded: 5, reserve: 5 });
  ammo.loaded = 0;
  act(ACT.RELOAD, { kind: 'sniper' });
  player.eq = 0;
  world.step(0.05);
  assert.equal(player.inv.reloading, null);
  world.step(W.reloadTime);
  assert.deepEqual(ammo, { loaded: 0, reserve: 5 });
});

test('sniper refuses malformed, spoofed and wrong-equipment shots without consuming ammo', () => {
  const { player, dino, shot } = setup();
  for (const extra of [{ o: [50, 101.62, 0] }, { o: [NaN, 0, 0] }, { dir: [0, 0, 1] }, { dir: [0, 0, -2] }]) shot(extra);
  player.eq = 0; shot();
  assert.equal(dino.hp, 10000);
  assert.equal(player.inv.guns.sniper.loaded, W.magazine);
});

test('sniper cannot damage beyond its range or through an obstacle', () => {
  for (const blocked of [false, true]) {
    const { world, dino, shot } = setup();
    if (blocked) world.layout.colliders.circles.push({ x: 0, z: -100, r: 2, bottom: 99, top: 110 });
    else dino.z = -W.range - 10;
    shot();
    assert.equal(dino.hp, 10000);
  }
});

test('sniper drop and pickup preserve ammunition, cancel reload and resist duplicate requests', () => {
  const { world, player, act, shot } = setup();
  Object.assign(player.inv.guns.sniper, { loaded: 2, reserve: 13 });
  act(ACT.RELOAD, { kind: 'sniper' });
  act(ACT.DROP, { kind: 'sniper' });
  const item = [...world.items.values()].find(i => i.kind === 'sniper');
  assert.deepEqual(item.ammo, { loaded: 2, reserve: 13 });
  assert.equal(player.inv.reloading, null);
  act(ACT.DROP, { kind: 'sniper' });
  assert.equal([...world.items.values()].filter(i => i.kind === 'sniper').length, 1);
  shot();
  assert.equal(player.inv.guns.sniper.loaded, 0);
  act(ACT.PICKUP, { item: item.id });
  act(ACT.PICKUP, { item: item.id });
  assert.equal(world.items.has(item.id), false);
  assert.deepEqual(player.inv.guns.sniper, { loaded: 2, reserve: 13, owned: true });
});

test('demo rejects sniper shots, reloads and equipment recovery without granting a firearm', () => {
  const { world, player, dino, act, shot } = setup({ demo: true });
  shot(); act(ACT.RELOAD, { kind: 'sniper' }); act(ACT.DROP, { kind: 'sniper' });
  const item = world.spawnItem('sniper', player.x, player.z, 1, player.y);
  item.ammo = { loaded: 5, reserve: 25 };
  act(ACT.PICKUP, { item: item.id });
  assert.deepEqual(player.inv.guns, {});
  assert.equal(player.inv.reloading, null);
  assert.equal(dino.hp, 10000);
  assert.equal(world.items.has(item.id), true);
});

test('hut refill restores sniper supplies only within reach of a refill station', () => {
  const { world, player, act } = setup();
  Object.assign(player.inv.guns.sniper, { loaded: 0, reserve: 0 });
  player.x = 300; player.z = 300;
  act(ACT.REFILL);
  assert.deepEqual(player.inv.guns.sniper, { loaded: 0, reserve: 0 });
  const station = world.stations().refill[0];
  player.x = station.x; player.z = station.z;
  act(ACT.REFILL);
  assert.deepEqual(player.inv.guns.sniper, { loaded: W.magazine, reserve: W.reserve });
});
