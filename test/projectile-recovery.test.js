import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ServerWorld } from '../src/sim/world.js';
import { Items } from '../src/client/entities/items.js';
import { CONFIG } from '../src/shared/config.js';
import { ACT, MSG, EV } from '../src/shared/protocol.js';

function setup() {
  const world = new ServerWorld({ send() {} });
  const { id } = world.join('Hunter');
  const player = world.players.get(id);
  player.inv.arrows = 1; player.inv.arrowUses = [3];
  const dino = world.dinos.list.find(d => d.type === 'raptor');
  dino.hp = 10000; dino.x = player.x; dino.z = player.z - 6; dino.y = player.y; dino.yaw = 0;
  const act = (a, fields) => world.receive(id, { t: MSG.ACT, a, ...fields });
  return { world, player, dino, act };
}

function hit({ world, player, dino, act }, pid, kind = 'arrow') {
  player.nextFireAt = 0;
  const o = [player.x, player.y + CONFIG.player.eyeHeight, player.z];
  const v = [0, 0, -30];
  act(ACT.FIRE, { pid, kind, o, v, pw: 1 });
  world.now += 0.2;
  const gravity = kind === 'spear' ? CONFIG.weapons.spear.throwGravity : CONFIG.weapons.bow.arrowGravity;
  act(ACT.LAND, { pid, dino: dino.id, zone: 'body', p: [o[0], o[1] - gravity * 0.02, o[2] - 6] });
  return [...world.items.values()].find(it => it.kind === kind);
}

test('a recovered arrow retains individual wear and breaks after its third shot', () => {
  const state = setup();
  const { world, player, dino, act } = state;
  for (let shot = 1; shot <= 3; shot++) {
    dino.x = player.x; dino.z = player.z - 6; dino.y = player.y;
    const item = hit(state, shot);
    assert.equal(player.inv.arrows, 0);
    if (shot === 3) { assert.equal(item, undefined); break; }
    assert.equal(item.health, 3 - shot);
    assert.equal(item.dino, dino.id);
    player.x = item.x; player.z = item.z;
    act(ACT.PICKUP, { item: item.id });
    assert.deepEqual(player.inv.arrowUses, [3 - shot]);
    assert.equal(player.inv.arrows, 1);
    assert.equal(world.items.has(item.id), false);
  }
});

test('refill adds fresh arrows while preserving worn ammunition and held spear health', () => {
  const { world, player, act } = setup();
  player.inv.arrowUses = [1]; player.inv.spearHealth = 40;
  const rack = world.layout.hut.arrowRack;
  player.x = rack.x; player.z = rack.z;
  act(ACT.REFILL, {});
  assert.equal(player.inv.arrowUses[0], 1);
  assert.equal(player.inv.arrowUses.length, world.caps().arrows);
  assert.ok(player.inv.arrowUses.slice(1).every(n => n === 3));
  assert.equal(player.inv.spearHealth, 40);
});

test('spear melee wear is authoritative and a worn spear breaks on the last valid hit', () => {
  const { world, player, dino, act } = setup();
  player.inv.spearHealth = CONFIG.weapons.spear.useWear;
  player.yaw = 0; dino.z = player.z - 3;
  const p = [player.x, player.y + CONFIG.player.eyeHeight, player.z - 3];
  act(ACT.MELEE, { dino: dino.id, zone: 'body', p: [player.x, p[1], player.z + 3] });
  assert.equal(player.inv.spearHealth, CONFIG.weapons.spear.useWear);
  act(ACT.MELEE, { dino: dino.id, zone: 'body', p });
  assert.equal(player.inv.spearHealth, 0);
  assert.equal(player.inv.spear, false);
});

test('a static impact retains its placement rather than dropping to the ground', () => {
  const { world, player, act } = setup();
  const o = [player.x, player.y + CONFIG.player.eyeHeight, player.z];
  act(ACT.FIRE, { pid: 1, kind: 'arrow', o, v: [0, 0, -30], pw: 1 });
  world.now += 0.1;
  const p = [o[0], o[1] - 0.06, o[2] - 3];
  const pose = { p: [p[0], p[1], p[2] + 0.6], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
  act(ACT.LAND, { pid: 1, p, pose });
  const item = [...world.items.values()].find(it => it.kind === 'arrow');
  assert.ok(item);
  assert.deepEqual(item.pose, pose);
  assert.ok(Math.abs(item.y - p[1]) < 0.01);
});

test('thrown spear remains lodged and another player can recover its worn health', () => {
  const state = setup();
  const { world, player, dino } = state;
  player.inv.spearHealth = 60;
  const item = hit(state, 1, 'spear');
  assert.equal(item.health, 50);
  assert.equal(player.inv.spear, false);
  const friend = world.players.get(world.join('Friend').id);
  friend.inv.spear = false;
  dino.x += 8; dino.y += 10;
  world.updateAttachedItem(item);
  friend.x = item.x; friend.z = item.z;
  world.receive(friend.id, { t: MSG.ACT, a: ACT.PICKUP, item: item.id });
  assert.equal(friend.inv.spear, false, 'cannot pick an airborne weapon from the ground');
  friend.y = item.y - CONFIG.player.eyeHeight;
  world.receive(friend.id, { t: MSG.ACT, a: ACT.PICKUP, item: item.id });
  assert.equal(friend.inv.spearHealth, 50);
  assert.equal(friend.inv.spear, true);
});

test('embedded weapon follows animated bone, retains world size and disappears on pickup', () => {
  const scene = new THREE.Scene(), root = new THREE.Group(), joint = new THREE.Group();
  root.scale.setScalar(2); root.add(joint); scene.add(root);
  const listeners = new Map();
  const view = { pos: new THREE.Vector3(1, 2, 3), yaw: 0, root, hitSpheres: () => [{ joint }] };
  const game = { gfx: { scene }, net: { on: (e, fn) => listeners.set(e, fn) }, terrain: { heightAt: () => 0 }, layout: { groundAt: () => 0 }, dinos: { map: new Map([[5, view]]) } };
  const items = new Items(game);
  items.addItem({ id: 9, kind: 'spear', n: 1, x: 1, y: 3, z: 3, dino: 5, offset: [0, 1, 0], attach: { joint: 0, p: [0, 0.5, 0], q: [0, 0, 0, 1], s: [0.5, 0.5, 0.5] } });
  items.update(0.1);
  const obj = items.items.get(9).obj;
  assert.equal(obj.parent, joint);
  assert.ok(obj.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6);
  const before = obj.getWorldPosition(new THREE.Vector3());
  joint.rotation.z = Math.PI / 2;
  scene.updateMatrixWorld(true);
  assert.ok(obj.getWorldPosition(new THREE.Vector3()).distanceTo(before) > 0.5);
  listeners.get(`ev:${EV.ITEM_REMOVE}`)({ id: 9 });
  assert.equal(obj.parent, null);
});
