// The Primeval Grove on the first island: a locked-off area with an oversized
// Brachiosaurus that can only be hurt from inside (see src/shared/grove.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { planIsland } from '../src/shared/island.js';
import { ACT, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { GROVE, insideGrove, groveEntry, mayEnterGrove } from '../src/shared/grove.js';
import { shotEnd } from '../src/shared/gunshots.js';

function setup(variant = 1) {
  const messages = [];
  const world = new ServerWorld({ send: (to, msg) => messages.push({ to, msg }) }, { level: 0, variant });
  const { id } = world.join('Hunter');
  const player = world.players.get(id);
  const grove = world.layout.grove;
  const titan = world.dinos.list.find((d) => d.leash);
  return { world, player, messages, grove, titan };
}

/** Put the player on the ground at (x, z), ready to move from there. */
function standAt(world, p, x, z) {
  p.x = x; p.z = z; p.y = world.layout.groundAt(x, z);
  p.moveBudget = 3.5; p.lastMoveAt = world.now;
}

test('every first island has a grove, later islands none', () => {
  for (let v = 1; v <= 25; v++) {
    const g = planIsland(0, v).sites.grove;
    assert.ok(g, `variant ${v}: grove placed`);
    assert.ok(g.r >= GROVE.radius - 12 && g.r <= GROVE.radius, `variant ${v}: sensible size`);
  }
  assert.equal(planIsland(1, 1).sites.grove, undefined);
});

test('the titan is bigger and much tougher than a Brachiosaurus and never leaves the grove', () => {
  for (const v of [1, 3, 7]) {
    const { world, grove, titan } = setup(v);
    assert.ok(titan, 'titan spawned');
    assert.equal(titan.type, 'brachio');
    assert.ok(titan.scale > 1, 'larger model');
    const normal = Math.round(CONFIG.dinos.brachio.health * world.dinos.hpMul);
    assert.ok(titan.maxHp >= normal * GROVE.titan.healthMul - 1, 'much more health');
    assert.equal(world.dinos.describe(titan).sc, titan.scale, 'clients get the scale');
    // a minute of life, including panicking because someone sprints past the stones
    const [p] = world.players.values();
    for (let s = 0; s < 1200; s++) {
      if (s === 200) { standAt(world, p, grove.x + grove.r + 3, grove.z); p.fl = 1; }
      world.step(0.05);
      const c = Math.hypot(titan.x - grove.x, titan.z - grove.z);
      assert.ok(c <= titan.leash.r + 0.01, `variant ${v}: centre stays on its leash (${c.toFixed(2)})`);
      for (const [x, z] of world.dinos.bodyCircles(titan, titan.x, titan.z, titan.yaw)) {
        assert.ok(insideGrove(world.layout, x, z), `variant ${v}: whole body inside the stones`);
      }
    }
  }
});

test('other dinosaurs stay out of the grove', () => {
  const { world } = setup(2);
  for (let s = 0; s < 600; s++) world.step(0.05);
  for (const d of world.dinos.list) {
    if (d.leash || d.type === 'ptera') continue;
    assert.ok(!insideGrove(world.layout, d.x, d.z), `${d.type} outside`);
  }
});

test('players cannot walk into the grove (until the unlock exists), but may walk out', () => {
  const { world, player, messages, grove } = setup();
  assert.equal(mayEnterGrove(player), false);
  standAt(world, player, grove.x + grove.r + 0.6, grove.z);
  world.receive(player.id, { t: MSG.STATE, x: grove.x + grove.r - 0.2, y: player.y, z: grove.z, yaw: 0, pitch: 0 });
  assert.equal(messages.at(-1).msg.t, MSG.CORRECT, 'step inside refused');
  assert.ok(!insideGrove(world.layout, player.x, player.z), 'still outside');
  // someone already inside (e.g. creative mode switched off) can always leave
  standAt(world, player, grove.x + grove.r - 0.2, grove.z);
  world.receive(player.id, { t: MSG.STATE, x: grove.x + grove.r + 0.2, y: player.y, z: grove.z, yaw: 0, pitch: 0 });
  assert.ok(player.x > grove.x + grove.r, 'walked out');
  // creative mode (testing) may enter
  player.creative = true;
  standAt(world, player, grove.x + grove.r + 0.6, grove.z);
  world.receive(player.id, { t: MSG.STATE, x: grove.x + grove.r - 0.2, y: player.y, z: grove.z, yaw: 0, pitch: 0 });
  assert.ok(insideGrove(world.layout, player.x, player.z), 'creative player inside');
});

test('the titan can only be hurt by a player inside the grove', () => {
  const { world, player, grove, titan } = setup();
  const hp = titan.hp;
  standAt(world, player, grove.x + grove.r + 2, grove.z);
  world.dinos.damage(titan, 50, 'body', player.id, 'arrow');
  world.dinos.damage(titan, 50, 'body', player.id, 'rifle');
  assert.equal(titan.hp, hp, 'no damage from outside');
  standAt(world, player, grove.x, grove.z + 3);
  world.dinos.damage(titan, 50, 'body', player.id, 'arrow');
  assert.ok(titan.hp < hp, 'damage from inside');
});

test('shots and arrows from outside stop at the barrier', () => {
  const { world, player, grove } = setup();
  // hitscan: a shot aimed through the middle ends on the barrier
  const o = [grove.x + grove.r + 10, world.layout.groundAt(grove.x + grove.r + 10, grove.z) + 1.6, grove.z];
  const end = shotEnd(world, o, [-1, 0, 0], 200);
  assert.ok(end[0] >= grove.x + grove.r - 0.05, 'tracer ends at the barrier');
  // the segment math: from outside in = hit, from inside out = none
  assert.ok(groveEntry(world.layout, o[0], o[2], grove.x, grove.z) > 0);
  assert.equal(groveEntry(world.layout, grove.x, grove.z, o[0], o[2]), -1);
  // an arrow reported as landing inside the grove leaves nothing to pick up there
  standAt(world, player, o[0], o[2]);
  player.inv.arrows = 5;
  const before = world.items.size;
  world.receive(player.id, { t: MSG.ACT, a: ACT.FIRE, kind: 'arrow', pid: 7, o: [player.x, player.y + CONFIG.player.eyeHeight, player.z], v: [-40, 0, 0], pw: 1 });
  world.now += 0.3;
  world.receive(player.id, { t: MSG.ACT, a: ACT.LAND, kind: 'arrow', pid: 7, p: [player.x - 12, world.layout.groundAt(player.x - 12, player.z), player.z] });
  for (const it of world.items.values()) assert.ok(!insideGrove(world.layout, it.x, it.z), 'no item inside the grove');
  assert.ok(world.items.size <= before + 1);
});
