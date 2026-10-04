import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { DS, EV } from '../src/shared/protocol.js';
import { sarcosuchusBrain as brain, SARCO_TIMING as T, sarcoTailSweep } from '../src/sim/ai/sarcosuchus.js';

const DT = 1 / CONFIG.net.tickRate, C = CONFIG.dinos['alpha-sarcosuchus'];
let shared;
function fixture(mode = 'hunt') {
  if (!shared) {
    const events = [], world = new ServerWorld({ send(to, msg) { events.push(msg); } }, { level: 1, variant: 1 });
    const d = world.dinos.list.find(d => d.type === 'alpha-sarcosuchus');
    world.dinos.list = [d];
    world.dinos.colliders = { circles: [], boxes: [] }; // no scenery between attacker and victim
    const { id } = world.join('Boss tester');
    shared = { world, sys: world.dinos, d, p: world.players.get(id), events };
  }
  const { d, p, world, events } = shared;
  Object.assign(d, { x: 0, z: 0, y: world.terrain.heightAt(0, 0), yaw: 0, strikeYaw: 0, spd: 0,
    hp: d.maxHp, alive: true, st: DS.IDLE, fl: 1, targetId: p.id, mode, modeT: 0, attacks: 1,
    swimOffset: 0, hitAttack: false, combo: false, pivotTail: false, victims: new Set(), route: null, approach: null });
  Object.assign(p, { x: 0, z: -6.5, y: d.y, alive: true, hp: 100, invulnUntil: 0, downed: false });
  events.length = 0;
  return shared;
}
function advance(f, seconds, tick = () => {}) {
  for (let t = 0; t < seconds - 1e-9; t += DT) { tick(t); f.world.now += DT; brain.update(f.d, f.sys, DT); }
}

test('the second island spawns one boss in its central submerged arena, and other islands spawn none', () => {
  for (const variant of [1, 4, 11]) {
    const world = new ServerWorld({ send() {} }, { level: 1, variant });
    const boss = world.dinos.list.filter(d => d.type === 'alpha-sarcosuchus');
    assert.equal(boss.length, 1);
    assert.ok(Math.hypot(boss[0].x, boss[0].z) < 19);
    assert.ok(world.terrain.waterDepthAt(boss[0].x, boss[0].z) > 3);
    assert.equal(boss[0].st, DS.SUBMERGED);
    brain.spawnInitial(world.dinos);
    assert.equal(world.dinos.list.filter(d => d.type === 'alpha-sarcosuchus').length, 1);
  }
  for (const level of [0, 2]) {
    const world = new ServerWorld({ send() {} }, { level, variant: 1 });
    assert.ok(!world.dinos.list.some(d => d.type === 'alpha-sarcosuchus'));
  }
});

test('lunge wind-up is harmless and a lateral dodge causes committed overshoot and recovery', () => {
  const f = fixture(); f.p.z = -15;
  brain.update(f.d, f.sys, DT);
  assert.equal(f.d.mode, 'lunge');
  assert.ok(f.events.some(e => e.e === EV.ATTACK && e.kind === 'lunge'));
  const startZ = f.d.z, yaw = f.d.yaw;
  advance(f, T.lungeWindup - DT);
  assert.equal(f.p.hp, 100);
  assert.equal(f.d.z, startZ);
  f.p.x = 8; f.p.z = -8;
  advance(f, T.lungeStrike + 0.1);
  assert.equal(f.d.yaw, yaw, 'attack never follows the dodge');
  assert.ok(f.d.z < startZ - 4, 'committed momentum continues past the missed target');
  assert.equal(f.p.hp, 100);
  assert.equal(f.d.mode, 'recover');
  const at = f.d.yaw;
  advance(f, 0.7);
  assert.equal(f.d.mode, 'recover');
  assert.equal(f.d.yaw, at, 'no retargeting during exposed recovery');
});

test('a bite has harmless preparation, hits once, then follows with a telegraphed shoulder shove', () => {
  const f = fixture(); brain.update(f.d, f.sys, DT);
  assert.equal(f.d.mode, 'bite');
  advance(f, T.biteWindup - DT);
  assert.equal(f.p.hp, 100);
  advance(f, T.biteStrike + 0.1);
  assert.equal(f.d.mode, 'shove');
  assert.ok(Math.abs(100 - f.p.hp - C.biteDamage * f.sys.dmgMul) < 1e-6);
  f.p.x = 3; f.p.z = -3; const hp = f.p.hp;
  advance(f, T.shoveWindup - DT);
  assert.equal(f.p.hp, hp);
  advance(f, T.shoveStrike + 0.1);
  assert.ok(f.p.hp < hp);
  assert.ok(f.events.some(e => e.e === EV.ATTACK && e.kind === 'shove'));
  assert.equal(f.d.mode, 'recover');
});

test('tail arc is harmless until wind-up completes, sweeps sides and rear once, and leaves front safe', () => {
  assert.equal(sarcoTailSweep(0, T.tailWindup), null);
  for (const angle of [-1, 0, 1.2]) {
    const f = fixture('tail'); f.p.x = Math.sin(angle) * 6.5; f.p.z = 1.744 + Math.cos(angle) * 6.5;
    advance(f, T.tailWindup - DT);
    assert.equal(f.p.hp, 100);
    advance(f, T.tailStrike + T.tailSettle + 0.1);
    assert.ok(Math.abs(100 - f.p.hp - C.tailDamage * f.sys.dmgMul) < 1e-6, `angle ${angle}`);
    assert.ok(f.events.some(e => e.e === EV.HURT && Math.hypot(e.kx, e.kz) > 10));
  }
  const f = fixture('tail');
  advance(f, T.tailWindup + T.tailStrike + T.tailSettle);
  assert.equal(f.p.hp, 100);
  const outside = fixture('tail'); outside.p.x = 0; outside.p.z = 1.744 + 9.5;
  advance(outside, T.tailWindup + T.tailStrike + T.tailSettle);
  assert.equal(outside.p.hp, 100, 'outside the actual baked tail reach stays safe');
});

test('lateral repositioning keeps its facing and respects arena limits', () => {
  const f = fixture('reposition'); f.d.yaw = 0;
  brain.update(f.d, f.sys, DT);
  assert.equal(f.d.yaw, 0);
  assert.ok(Math.abs(f.d.x) > 0.1);
  f.d.x = 19; f.d.z = 0;
  f.sys.strafe(f.d, 1, 0, C.walkSpeed, DT);
  assert.equal(f.d.x, 19, 'cannot step beyond the centre leash');
});

test('a real encounter moves through land pressure and back into physical water pockets', () => {
  const world = new ServerWorld({ send() {} }, { level: 1, variant: 4 });
  const d = world.dinos.list.find(d => d.boss), p = world.players.get(world.join('Arena runner').id);
  world.dinos.list = [d];
  Object.assign(p, { x: 0, z: 0, y: world.terrain.heightAt(0, 0), creative: true });
  d.yaw = 0;
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    world.step(DT); seen.add(d.mode);
    assert.ok(Math.hypot(d.x, d.z) <= d.leash.r + 1e-7);
    assert.ok(d.y >= world.terrain.heightAt(d.x, d.z) - 1e-7, 'never hides below the terrain');
  }
  for (const mode of ['ambush', 'recover', 'bite', 'retreat', 'swim']) assert.ok(seen.has(mode), `encounter includes ${mode}`);
});

test('low health chains bite into bounded pivot and tail, then grants full recovery', () => {
  const f = fixture(); f.d.hp = f.d.maxHp * 0.3;
  brain.update(f.d, f.sys, DT);
  assert.equal(f.d.mode, 'bite'); assert.ok(f.d.combo); assert.ok(f.d.fl & 16);
  advance(f, T.biteWindup + T.biteStrike);
  assert.equal(f.d.mode, 'pivot');
  let yaw = f.d.yaw;
  advance(f, T.pivot, () => { const now = f.d.yaw; assert.ok(Math.abs(now - yaw) <= C.turnRate * DT + 1e-9); yaw = now; });
  assert.equal(f.d.mode, 'tail');
  advance(f, T.tailWindup + T.tailStrike + T.tailSettle + 0.05);
  assert.equal(f.d.mode, 'recover');
  advance(f, 1);
  assert.equal(f.d.mode, 'recover');
  assert.equal(f.events.filter(e => e.e === EV.ATTACK && e.kind === 'enrage').length, 1);
});

test('water ambush warns before erupting, and no attack damages players in their safe zone', () => {
  const f = fixture('submerged'); f.d.modeT = 1.3; f.p.z = -10;
  brain.update(f.d, f.sys, DT);
  assert.equal(f.d.mode, 'ambush');
  assert.ok(f.events.some(e => e.e === EV.ATTACK && e.kind === 'ambush'));
  advance(f, T.ambushWindup - DT);
  assert.equal(f.p.hp, 100);
  const realSafe = f.world.safeZone;
  f.world.safeZone = () => ({ x: f.p.x, z: f.p.z, r: 5 });
  try { advance(f, T.ambushStrike + 0.1); assert.equal(f.p.hp, 100); }
  finally { f.world.safeZone = realSafe; }
});

test('arena boundary blocks attacks from outside, death rewards once and never respawns the boss', () => {
  const f = fixture(); const hp = f.d.hp;
  f.p.x = 35; f.p.z = 0;
  f.sys.damage(f.d, 100, 'body', f.p.id, 'spear');
  assert.equal(f.d.hp, hp);
  f.p.x = 0; f.p.z = -6.5;
  f.sys.damage(f.d, hp + 1, 'body', f.p.id, 'spear');
  assert.equal(f.d.alive, false);
  assert.ok(!f.sys.respawnQueue.some(r => r.type === 'alpha-sarcosuchus'));
  const deaths = f.events.filter(e => e.e === EV.DINO_DIE).length;
  f.sys.damage(f.d, 100, 'body', f.p.id, 'spear');
  assert.equal(f.events.filter(e => e.e === EV.DINO_DIE).length, deaths);
});
