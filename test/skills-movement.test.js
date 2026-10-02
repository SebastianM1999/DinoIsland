// Skill effects on the local player's movement: stamina, Light Feet, Springy Legs,
// Adrenaline and the Dash, driven through a headless controller on flat ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerController } from '../src/client/player/controller.js';
import { skillMods, DASH } from '../src/shared/skills.js';
import { CONFIG } from '../src/shared/config.js';

const P = CONFIG.player;
const DT = 1 / 60;
const flat = {
  heightAt: () => 0,
  gradientAt: () => ({ x: 0, z: 0 }),
  slopeAt: () => 0,
  waterDepthAt: () => 0,
  inlandWaterLevelAt: () => null,
  seaDepthAt: () => 0,
};

function make(skills = {}) {
  const pc = new PlayerController(flat, { circles: [], boxes: [] });
  pc.setMods(skillMods(skills));
  pc.teleport(0, 0, 0);
  pc.update(DT, {});   // settle on the ground
  return pc;
}
const run = (pc, seconds, intent) => { for (let i = 0; i < Math.round(seconds / DT); i++) pc.update(DT, typeof intent === 'function' ? intent(i) : intent); };
const peakHeight = (pc) => {
  let peak = 0;
  pc.update(DT, { jump: true });
  for (let i = 0; i < 240; i++) { pc.update(DT, {}); peak = Math.max(peak, pc.pos.y); }
  return peak;
};

test('Deep Lungs raises max stamina and keeps the stamina fraction', () => {
  const pc = make();
  pc.stamina = P.maxStamina / 2;
  pc.setMods(skillMods({ deepLungs: 3 }));
  assert.ok(Math.abs(pc.maxStamina - P.maxStamina * 1.3) < 1e-9);
  assert.ok(Math.abs(pc.stamina - pc.maxStamina / 2) < 1e-9, 'still half full');
  run(pc, 20, {});
  assert.ok(Math.abs(pc.stamina - pc.maxStamina) < 1e-9, 'regenerates up to the new max');
});

test('Efficient Stride lowers the sprint drain', () => {
  const drain = (skills) => {
    const pc = make(skills);
    run(pc, 1.5, { forward: true, sprint: true });
    assert.ok(pc.sprinting);
    return P.maxStamina - pc.stamina;
  };
  const base = drain({}), eff = drain({ efficientStride: 3 });
  assert.ok(eff < base * 0.65, `drain ${eff} vs ${base}`);
});

test('Second Wind: regeneration is faster and starts earlier', () => {
  const regen = (skills) => {
    const pc = make(skills);
    pc.stamina = 0;
    pc.staminaDelay = P.staminaRegenDelay * pc.mods.regenDelayMul;
    run(pc, 1.5, {});
    return pc.stamina;
  };
  assert.ok(regen({ secondWind: 3 }) > regen({}) * 1.5);
});

test('Light Feet: jumping costs no stamina and works at zero stamina', () => {
  const pc = make({ lightFeet: 1 });
  pc.stamina = 0;
  pc.staminaDelay = 5;
  pc.update(DT, { jump: true });
  assert.ok(pc.vel.y > 0 || !pc.onGround, 'jumped');
  assert.equal(pc.stamina, 0);
  const plain = make();
  plain.stamina = 0;
  plain.update(DT, { jump: true });
  assert.ok(plain.onGround, 'without the skill a jump needs stamina');
  const costly = make();
  costly.update(DT, { jump: true });
  assert.ok(costly.stamina < P.maxStamina, 'a normal jump costs stamina');
});

test('Springy Legs: jump HEIGHT grows by the rank percentage', () => {
  const base = peakHeight(make());
  for (const [rank, k] of [[1, 1.1], [2, 1.2]]) {
    const h = peakHeight(make({ springyLegs: rank }));
    assert.ok(Math.abs(h / base - k) < 0.04, `rank ${rank}: ${h / base}`);
  }
});

test('Adrenaline: below 30% HP stamina is free for 6 s, then a 60 s cooldown', () => {
  const pc = make({ adrenaline: 1 });
  pc.hpFrac = 0.9;
  run(pc, 1, { forward: true, sprint: true });
  assert.ok(!pc.adrenaline.active, 'healthy: not active');
  pc.stamina = P.maxStamina;
  pc.hpFrac = 0.2;
  pc.update(DT, { forward: true, sprint: true });
  assert.ok(pc.adrenaline.active);
  const before = pc.stamina;
  run(pc, 3, { forward: true, sprint: true });
  assert.ok(pc.sprinting);
  assert.ok(pc.stamina >= before - 1e-9, 'sprinting costs nothing');
  // free even at zero stamina, and jumps are free too
  pc.stamina = 0;
  run(pc, 0.5, { forward: true, sprint: true });
  assert.ok(pc.sprinting, 'sprint still possible at 0 stamina');
  run(pc, 3, { forward: true, sprint: true });   // > 6 s in total
  assert.ok(!pc.adrenaline.active);
  assert.ok(pc.adrenaline.cooldownLeft > 50 && pc.adrenaline.cooldownLeft <= 60);
  // on cooldown it does not fire again even at low HP
  pc.update(DT, {});
  assert.ok(!pc.adrenaline.active);
  run(pc, 60, {});
  assert.ok(pc.adrenaline.active, 'ready again after the cooldown');
});

test('Dash: covers DASH.distance on the ground, costs stamina, then cools down', () => {
  const pc = make({ dash: 1 });
  let fired = 0;
  pc.onDash = () => fired++;
  pc.yaw = 0;   // looking north (-z)
  pc.update(DT, { dash: true });
  assert.equal(fired, 1);
  assert.ok(pc.dash.active && pc.dash.cooldownLeft > 0 && !pc.dash.ready);
  assert.ok(Math.abs(pc.stamina - (P.maxStamina - DASH.cost)) < 1e-6, 'cost paid up front');
  run(pc, 1, { dash: true });   // key held: no second dash
  assert.equal(fired, 1);
  assert.ok(Math.abs(-pc.pos.z - DASH.distance) < 0.05, `travelled ${-pc.pos.z}`);
  assert.ok(Math.abs(pc.pos.x) < 1e-6);
  assert.ok(!pc.dash.active);
  assert.equal(pc.moveSpeed, 0, 'no skid after the burst');
  // cooldown: pressing again too early does nothing, later it works
  pc.update(DT, {});
  pc.update(DT, { dash: true });
  assert.equal(fired, 1, 'cooldown not over');
  run(pc, DASH.cooldown, {});
  pc.update(DT, {});
  pc.update(DT, { dash: true });
  assert.equal(fired, 2);
});

test('Dash follows the movement keys and works in the air', () => {
  const pc = make({ dash: 1 });
  pc.yaw = 0;
  pc.update(DT, { dash: true, right: true });
  run(pc, 0.4, {});
  assert.ok(pc.pos.x > DASH.distance - 0.1 && Math.abs(pc.pos.z) < 1e-6, `strafe dash x=${pc.pos.x}`);

  const air = make({ dash: 1 });
  air.pos.y = 3; air.onGround = false;
  air.update(DT, { dash: true });
  assert.ok(air.dash.active, 'allowed airborne');
  run(air, 0.3, {});
  assert.ok(-air.pos.z > DASH.distance - 0.2, `air dash z=${air.pos.z}`);
});

test('Dash needs the skill, enough stamina, and a free body; Adrenaline makes it free', () => {
  const none = make();
  none.update(DT, { dash: true });
  assert.ok(!none.dash.active, 'no skill');

  const tired = make({ dash: 1 });
  tired.stamina = DASH.cost - 1;
  tired.update(DT, { dash: true });
  assert.ok(!tired.dash.active, 'not enough stamina');

  const hit = make({ dash: 1 });
  hit.knock(1, 0, 0, 1);
  hit.update(DT, { dash: true });
  assert.ok(!hit.dash.active, 'knocked down');

  const dead = make({ dash: 1 });
  dead.frozen = true;
  dead.update(DT, { dash: true });
  assert.ok(!dead.dash.active, 'frozen');

  const free = make({ dash: 1, adrenaline: 1 });
  free.hpFrac = 0.1;
  free.stamina = 0;
  free.staminaDelay = 5;
  free.update(DT, { dash: true });
  assert.ok(free.dash.active, 'free during Adrenaline');
  assert.equal(free.stamina, 0);
});

test('Dash respects collisions (no teleporting through a wall)', () => {
  const pc = new PlayerController(flat, { circles: [], boxes: [{ x: 0, z: -2, hw: 5, hd: 0.2, rot: 0, top: 10 }] });
  pc.setMods(skillMods({ dash: 1 }));
  pc.teleport(0, 0, 0);
  pc.update(DT, {});
  pc.update(DT, { dash: true });
  run(pc, 0.5, {});
  assert.ok(pc.pos.z > -1.8, `stopped at the wall (z=${pc.pos.z})`);
});
