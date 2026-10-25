// Skill effects on the local player's movement: stamina, Light Feet, Springy Legs
// and the Dash, driven through a headless controller on flat ground.
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

test('the sprint drain is the same for everyone (Efficient Stride is gone)', () => {
  const drain = (skills) => {
    const pc = make(skills);
    run(pc, 1.5, { forward: true, sprint: true });
    assert.ok(pc.sprinting);
    return P.maxStamina - pc.stamina;
  };
  assert.ok(Math.abs(drain({ efficientStride: 3 }) - drain({})) < 1e-9);
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
  for (const [rank, k] of [[1, 1.15], [2, 1.3], [3, 1.45]]) {
    const h = peakHeight(make({ springyLegs: rank }));
    assert.ok(Math.abs(h / base - k) < 0.05, `rank ${rank}: ${h / base}`);
  }
});

test('Springy Legs: a running jump carries farther and lands back at normal speed', () => {
  /** Sprint up to speed, jump, and measure the ground covered in the air. */
  const leap = (skills) => {
    const pc = make({ deepLungs: 1, ...skills });
    pc.yaw = 0;
    run(pc, 1, { forward: true, sprint: true });
    const z0 = pc.pos.z, v0 = Math.hypot(pc.vel.x, pc.vel.z);
    pc.update(DT, { forward: true, sprint: true, jump: true });
    const air = Math.hypot(pc.vel.x, pc.vel.z) / v0;
    let n = 0;
    while (!pc.onGround && n++ < 400) pc.update(DT, { forward: true, sprint: true });
    const dist = z0 - pc.pos.z;
    run(pc, 1, { forward: true, sprint: true });
    return { dist, air, after: Math.hypot(pc.vel.x, pc.vel.z) / v0, jumped: pc.jumped };
  };
  const base = leap({}), far = leap({ springyLegs: 3 });
  assert.ok(Math.abs(base.air - 1) < 0.02, `plain take-off keeps the run speed (${base.air})`);
  assert.ok(Math.abs(far.air - 1.3) < 0.02, `+30% take-off speed (${far.air})`);
  assert.ok(far.dist > base.dist * 1.4, `farther: ${far.dist} vs ${base.dist}`);
  assert.ok(Math.abs(far.after - 1) < 0.05 && far.jumped === false, 'back to the normal run once landed');
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

test('Dash needs the skill, enough stamina, and a free body', () => {
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

  // (Adrenaline is gone: low HP makes nothing free)
  const low = make({ dash: 1, adrenaline: 1 });
  low.stamina = 0;
  low.update(DT, { dash: true });
  assert.ok(!low.dash.active);
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
