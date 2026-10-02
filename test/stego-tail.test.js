import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { stegoBrain, tailSweep, tailRelative } from '../src/sim/ai/stego.js';
import { angleDiff } from '../src/shared/rng.js';

const C = CONFIG.dinos.stego, DT = 1 / CONFIG.net.tickRate;

/** A stego far from the hut with one player, no scenery in the way of the tail (one world, reset per case). */
let shared = null;
function arena() {
  if (!shared) {
    const world = new ServerWorld({ send() {} }, { level: 1, variant: 1 });
    const zone = world.layout.dinoZones.stego[0];
    world.dinos.list.length = 0;
    const d = world.dinos.spawn('stego', zone.x, zone.z, { home: { x: zone.x, z: zone.z } });
    world.dinos.canReach = () => true;            // no tree between tail and player in these tests
    const { id } = world.join('Tail tester');
    shared = { world, d, p: world.players.get(id), sys: world.dinos, x: d.x, z: d.z };
  }
  const { d, p, x, z } = shared;
  Object.assign(d, { x, z, yaw: 0, spd: 0, alive: true, anger: 0, targetId: null, mode: 'graze', modeT: 3, cool: 0, counterCool: 0 });
  Object.assign(p, { alive: true, hp: CONFIG.player.maxHealth });
  return shared;
}
/** Put the player at (r m, phi rad from straight behind, + = the stego's right) from the hip pivot. */
function place(d, p, r, phi) {
  const piv = tailRelative(d, d);
  const a = d.yaw + phi;
  p.x = piv.px + Math.sin(a) * r; p.z = piv.pz + Math.cos(a) * r; p.y = d.y;
}
function swing(sys, d, p, seconds, onTick = () => {}) {
  for (let t = 0; t < seconds; t += DT) { onTick(t); stegoBrain.update(d, sys, DT); }
}

test('tail sweep: wind-up is harmless, the strike covers the whole arc behind the stego', () => {
  assert.equal(tailSweep(0, 0.4), null, 'no damage while winding up');
  assert.equal(tailSweep(0.75, 1.2), null, 'no damage while the tail swings back');
  const [lo, hi] = tailSweep(0, 1.2);
  assert.ok(lo < -1 && hi > 0.7, `strike arc ${lo}..${hi}`);
  // tick-sized steps must not leave gaps in the arc
  let prevLo = -Infinity;
  for (let t = 0.4; t < 0.72; t += DT) {
    const s = tailSweep(t, t + DT);
    if (!s) continue;
    assert.ok(s[1] >= prevLo - 1e-9, `gap before ${t.toFixed(2)}`);
    prevLo = s[0];
  }
});

test('everyone standing in the swing area is hit once; outside reach or in front is safe', () => {
  for (const phi of [-0.9, -0.5, 0, 0.4, 0.7]) {
    for (const r of [1.2, 3, 4.3]) {
      const { d, p, sys } = arena();
      place(d, p, r, phi);
      d.anger = C.calmTime; d.targetId = p.id; d.mode = 'tail'; d.modeT = 0; d.tailVictims = new Set(); d.tailCounter = false;
      const hp = p.hp;
      swing(sys, d, p, 1.25, () => place(d, p, r, phi));
      assert.ok(Math.abs(hp - p.hp - C.tailDamage * sys.dmgMul) < 1e-6, `phi ${phi} r ${r}: took ${hp - p.hp}`);
    }
  }
  for (const [r, phi] of [[5.6, 0], [3, Math.PI], [3, -1.9]]) {
    const { d, p, sys } = arena();
    place(d, p, r, phi);
    d.anger = C.calmTime; d.targetId = p.id; d.mode = 'tail'; d.modeT = 0; d.tailVictims = new Set(); d.tailCounter = false;
    d.yaw0 = d.yaw;
    const hp = p.hp;
    swing(sys, d, p, 1.25, t => { if (t > 0.43) place(d, p, r, phi); });
    assert.equal(p.hp, hp, `safe at r ${r} phi ${phi}`);
  }
});

test('hit from the front: whips round fast and counters hard; only a quick sprint away dodges it', () => {
  assert.ok(C.tailCounterDamage > C.tailDamage);
  // 3.5 m: close melee; 6.2 m: a spear stab at the snout (range 3.4 m from ~2.8 m in front)
  for (const start of [3.5, 6.2]) {
    const run = (speed) => {
      const { d, p, sys } = arena();
      place(d, p, start + 0.68, Math.PI);          // straight in front of the head
      sys.damage(d, 5, 'head', p.id);
      assert.equal(d.mode, 'tail'); assert.ok(d.tailCounter);
      const hp = p.hp, yaw0 = d.yaw, ux = (p.x - d.x) / Math.hypot(p.x - d.x, p.z - d.z), uz = (p.z - d.z) / Math.hypot(p.x - d.x, p.z - d.z);
      let turned = null;
      swing(sys, d, p, 1.3, t => {
        p.x += ux * speed * DT; p.z += uz * speed * DT;
        if (turned === null && Math.abs(angleDiff(yaw0, d.yaw)) > 2.6) turned = t;
      });
      return { took: hp - p.hp, turned, dmg: C.tailCounterDamage * sys.dmgMul };
    };
    const still = run(0);
    assert.ok(still.turned !== null && still.turned < 0.5, `${start} m: turned round in ${still.turned}s`);
    assert.ok(Math.abs(still.took - still.dmg) < 1e-6, `${start} m: standing still takes the counter (${still.took})`);
    assert.ok(run(CONFIG.player.walkSpeed * CONFIG.player.backwardFactor).took > 0, `${start} m: backing off is too slow`);
    assert.ok(run(CONFIG.player.walkSpeed).took > 0, `${start} m: walking away is too slow`);
    assert.equal(run(CONFIG.player.sprintSpeed).took, 0, `${start} m: sprinting away dodges`);
  }
});
