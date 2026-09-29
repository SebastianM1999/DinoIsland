import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';

function setup() {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) });
  const { id } = world.join('Hunter');
  const player = world.players.get(id);
  return { world, player, messages };
}

test('movement accepts normal updates and corrects teleports', () => {
  const { world, player, messages } = setup();
  const z = player.z;
  world.receive(player.id, { t: MSG.STATE, x: player.x, y: player.y, z: z - 0.3, yaw: 0, pitch: 0 });
  assert.equal(player.z, z - 0.3);
  world.receive(player.id, { t: MSG.STATE, x: player.x, y: player.y, z: z - 100, yaw: 0, pitch: 0 });
  assert.equal(player.z, z - 0.3);
  assert.equal(messages.at(-1).msg.t, MSG.CORRECT);
});

test('spear hits require a nearby, forward hit point and respect cooldown', () => {
  const { world, player } = setup();
  player.yaw = 0; // facing north (-z)
  const d = world.dinos.list.find((dino) => dino.type === 'brachio');
  d.x = player.x; d.z = player.z - 3; d.y = player.y;
  const p = [player.x, player.y + CONFIG.player.eyeHeight, player.z - 3];
  const hit = { t: MSG.ACT, a: ACT.MELEE, dino: d.id, zone: 'body', p };
  const hp = d.hp;
  world.receive(player.id, hit);
  assert.equal(d.hp, hp - CONFIG.weapons.spear.damage);
  world.receive(player.id, hit);
  assert.equal(d.hp, hp - CONFIG.weapons.spear.damage);
  player.nextMeleeAt = 0;
  world.receive(player.id, { ...hit, p: [player.x, player.y + 1, player.z + 3] });
  assert.equal(d.hp, hp - CONFIG.weapons.spear.damage);
});

test('arrow damage needs a plausible ballistic path and target', () => {
  const { world, player } = setup();
  const d = world.dinos.list.find((dino) => dino.type === 'brachio');
  d.x = player.x; d.z = player.z - 6; d.y = player.y;
  const o = [player.x, player.y + CONFIG.player.eyeHeight, player.z];
  const v = [0, 0, -30];
  world.receive(player.id, { t: MSG.ACT, a: ACT.FIRE, kind: 'arrow', pid: 1, o, v, pw: 1 });
  assert.equal(player.inv.arrows, CONFIG.weapons.bow.startArrows - 1);
  const hp = d.hp;
  world.receive(player.id, { t: MSG.ACT, a: ACT.LAND, pid: 1, p: [player.x + 100, o[1], player.z - 6], dino: d.id, zone: 'body' });
  assert.equal(d.hp, hp);
  assert.ok(world.projectiles.has(`${player.id}:1`));
  world.step(0.2);
  world.receive(player.id, { t: MSG.ACT, a: ACT.LAND, pid: 1,
    p: [player.x, o[1] - CONFIG.weapons.bow.arrowGravity * 0.2 ** 2 / 2, player.z - 6],
    dino: d.id, zone: 'body' });
  assert.equal(d.hp, hp - CONFIG.weapons.bow.damage);
  assert.ok(!world.projectiles.has(`${player.id}:1`));
});
