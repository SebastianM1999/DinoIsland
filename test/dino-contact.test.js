import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDinoContact, dinoBodyCircles } from '../src/shared/dinoContact.js';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { EV, MSG } from '../src/shared/protocol.js';

const dino = (extra = {}) => ({ id: 1, type: 'raptor', alive: true, x: 0, y: 0, z: 0, yaw: 0, ...extra });

test('sprinting across a dinosaur stops on the approach side and slides along it', () => {
  const d = dino();
  const from = { x: -2, y: 0, z: 0 };
  const result = resolveDinoContact(from, { x: 2, y: 0, z: 0 }, [d]);
  assert.ok(result.hit);
  assert.ok(result.x < -0.66);
  const sliding = resolveDinoContact(result, { x: result.x + 0.2, y: 0, z: 0.2 }, [d]);
  assert.ok(sliding.z > result.z);
  for (const [x, z, r] of dinoBodyCircles(d)) {
    assert.ok(Math.hypot(sliding.x - x, sliding.z - z) >= r + CONFIG.player.radius - 0.001);
  }
});

test('dead dinosaurs and flyers above the player do not block; scaled bodies do', () => {
  const from = { x: -2, y: 0, z: 0 }, to = { x: 2, y: 0, z: 0 };
  assert.equal(resolveDinoContact(from, to, [dino({ alive: false })]).hit, false);
  assert.equal(resolveDinoContact(from, to, [dino({ type: 'ptera', y: 10 })]).hit, false);
  assert.ok(resolveDinoContact(from, to, [dino({ scale: 2 })]).x < -0.9);
});

test('server corrects overlap, applies small outward knockback, and limits contact damage', () => {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push(msg) }, { variant: 1 });
  const { id } = world.join('Contact tester'), p = world.players.get(id);
  const d = dino({ x: p.x + 0.4, y: p.y, z: p.z });
  world.dinos.list = [d];
  const hp = p.hp;
  world.resolvePlayerDinos(p);
  assert.equal(p.hp, hp - 3);
  assert.ok(p.x < d.x - 0.66);
  // A shallow overlap (client and server saw the dinosaur at slightly different
  // times) is resolved on the server without snapping the client back.
  assert.ok(!messages.some(m => m.t === MSG.CORRECT));
  assert.ok(messages.some(m => m.e === EV.HURT && m.kx < 0));
  // A client-predicted position just outside the collider still counts as contact.
  world.resolvePlayerDinos(p);
  assert.equal(p.hp, hp - 3);
  world.now += 1.01;
  world.resolvePlayerDinos(p);
  assert.equal(p.hp, hp - 6);
  p.creative = true;
  world.now += 1.01;
  world.resolvePlayerDinos(p);
  assert.equal(p.hp, hp - 6);
});

test('a deep overlap is corrected on the client, and stale state packets are ignored', () => {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push(msg) }, { variant: 1 });
  const { id } = world.join('Contact tester'), p = world.players.get(id);
  world.dinos.list = [dino({ x: p.x + 0.01, y: p.y, z: p.z })];
  const before = { x: p.x, z: p.z };
  world.resolvePlayerDinos(p);
  const fix = messages.find(m => m.t === MSG.CORRECT);
  assert.ok(fix && fix.k === p.epoch && p.epoch === 1);
  // a packet the client sent before it saw the correction must not undo it
  world.receive(id, { t: MSG.STATE, s: 1, k: 0, x: before.x, y: p.y, z: before.z, yaw: 0, pitch: 0 });
  assert.ok(Math.abs(p.x - fix.x) < 0.01);
  // overtaken packets (lower sequence number) are dropped as well
  world.dinos.list = [];
  world.receive(id, { t: MSG.STATE, s: 3, k: 1, x: p.x + 0.2, y: p.y, z: p.z, yaw: 0, pitch: 0 });
  const x = p.x;
  world.receive(id, { t: MSG.STATE, s: 2, k: 1, x: p.x - 0.2, y: p.y, z: p.z, yaw: 0, pitch: 0 });
  assert.equal(p.x, x);
});
