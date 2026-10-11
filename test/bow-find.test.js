import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { buildBowCamp } from '../src/client/world/bowCamp.js';

const W = CONFIG.weapons;
const trailShare = (plan, x, z) => {
  // how far along the trail (0 hut .. 1 boat) its point nearest to (x, z) lies
  const tr = plan.trail, len = [0];
  for (let i = 1; i < tr.length; i++) len.push(len[i - 1] + Math.hypot(tr[i].x - tr[i - 1].x, tr[i].z - tr[i - 1].z));
  let best = 0, bd = Infinity;
  tr.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } });
  return len[best] / len[len.length - 1];
};

test('island 1 has the hunter\'s camp by the trail before the mountain, on dry, flat, clear ground', () => {
  for (const variant of [levelDef(0).variant, 2, 3, 4, 5, 6]) {
    const plan = planIsland(0, variant), terrain = new Terrain(plan), layout = buildLayout(terrain);
    const c = layout.bowCamp;
    assert.ok(c, `v${variant}: a camp`);
    assert.equal(terrain.waterLevelAt(c.x, c.z), null, `v${variant}: dry`);
    assert.ok(terrain.slopeAt(c.x, c.z) < 0.3, `v${variant}: flat`);
    const path = layout.distToPath(c.x, c.z);
    assert.ok(path > 5.5 && path < 14, `v${variant}: beside the trail (${path.toFixed(1)} m)`);
    const share = trailShare(plan, c.x, c.z);
    assert.ok(share > 0.3 && share < 0.55, `v${variant}: between the hut and the mountain (${share.toFixed(2)})`);
    assert.ok(layout.trees.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > 2 * t.scale), `v${variant}: no tree in the camp`);
    assert.ok(layout.bushes.every((b) => Math.hypot(b.x - c.x, b.z - c.z) > 2.6), `v${variant}: no bush on it`);
    assert.ok(layout.groundAt(c.x, c.z) > c.y + 0.4, `v${variant}: the stump stands there`);
  }
});

test('the other islands have no camp', () => {
  for (const level of [1, 2, 3]) {
    if (!levelDef(level)) continue;
    assert.equal(buildLayout(new Terrain(planIsland(level, levelDef(level).variant))).bowCamp, null, `island ${level + 1}`);
  }
});

function solo(level = 0) {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level, variant: levelDef(level).variant });
  const join = (name) => world.players.get(world.join(name).id);
  return { world, sent, join };
}
const fire = (world, p, pid = 1) => world.receive(p.id, { t: MSG.ACT, a: ACT.FIRE, kind: 'arrow', pid, o: [p.x, p.y + CONFIG.player.eyeHeight, p.z], v: [0, 0, -30], pw: 1 });
const toCamp = (world, p) => { const c = world.layout.bowCamp; p.x = c.x + 1; p.z = c.z; p.y = c.y; };

test('on island 1 you start with the spear only: no bow, no arrows, no arrow shot', () => {
  const { world, join } = solo();
  const p = join('Hunter');
  assert.equal(p.inv.bow, false);
  assert.equal(p.inv.arrows, 0);
  assert.equal(p.inv.spear, true);
  Object.assign(p.inv, { arrows: 3, arrowUses: [3, 3, 3] });   // (arrows picked up from the ground)
  fire(world, p);
  assert.equal(p.inv.arrows, 3, 'no shot without a bow');
  assert.equal(world.projectiles.size, 0);
});

test('walking up to the camp gives that explorer, and only them, their bow and a start of arrows', () => {
  const { world, sent, join } = solo();
  const a = join('Ana'), b = join('Ben');
  toCamp(world, a);
  a.x += W.bow.pickupReach + 1;
  world.step(0.05);
  assert.equal(a.inv.bow, false, 'not from further away');
  toCamp(world, a);
  world.step(0.05);
  assert.equal(a.inv.bow, true);
  assert.equal(a.inv.arrows, W.bow.startArrows);
  assert.equal(a.inv.arrowUses.length, a.inv.arrows);
  assert.equal(b.inv.bow, false, 'each explorer finds their own');
  const ev = sent.filter(({ msg }) => msg.e === EV.BOW_FOUND);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].msg.id, a.id);
  assert.ok(sent.some(({ to, msg }) => to === a.id && msg.t === MSG.INV && msg.inv.bow === true), 'the inventory goes out');
  world.step(0.05);
  assert.equal(sent.filter(({ msg }) => msg.e === EV.BOW_FOUND).length, 1, 'found once');

  fire(world, a);
  assert.equal(a.inv.arrows, W.bow.startArrows - 1, 'now it shoots');

  toCamp(world, b);
  world.step(0.05);
  assert.equal(b.inv.bow, true, 'the camp still holds a bow for the next explorer');
});

test('the bow stays through death and the voyage; refills and respawns give arrows only with a bow', () => {
  const { world, join } = solo();
  const p = join('Hunter');
  world.respawnPlayer(p);
  assert.equal(p.inv.arrows, 0, 'no arrows without a bow');
  const rack = world.stations().refill[0];
  Object.assign(p, { x: rack.x, z: rack.z });
  world.receive(p.id, { t: MSG.ACT, a: ACT.REFILL });
  assert.equal(p.inv.arrows, 0, 'the free refill has no arrows for you yet');

  toCamp(world, p);
  world.step(0.05);
  p.inv.arrows = 0; p.inv.arrowUses = [];
  world.respawnPlayer(p);
  assert.equal(p.inv.bow, true);
  assert.equal(p.inv.arrows, W.bow.startArrows);

  const q = join('Late');
  world.nextLevel();
  assert.equal(world.layout.bowCamp, null);
  assert.equal(p.inv.bow, true);
  assert.equal(q.inv.bow, true, 'island 2 hands everybody the bow (it was found on island 1)');
  assert.ok(q.inv.arrows > 0);
});

test('joining on a later island, you have the bow; creative mode always has it', () => {
  const { join } = solo(1);
  assert.equal(join('Sailor').inv.bow, true);
  assert.equal(join('Sailor 2').inv.arrows, W.bow.startArrows);

  const { world, join: join1 } = solo(0);
  const p = join1('Maker');
  world.receive(p.id, { t: MSG.ACT, a: ACT.CREATIVE, on: true });
  world.step(0.6);
  assert.equal(p.inv.bow, true);
});

test('client: the camp shows the bow and its marker only while you have none', () => {
  const layout = buildLayout(new Terrain(planIsland(0, levelDef(0).variant)));
  const camp = buildBowCamp(null, layout);
  let bow = null, glow = null;
  camp.group.traverse((o) => { if (o.geometry?.type === 'RingGeometry') glow = o; else if (o.isMesh && o !== camp.group.children[0]) bow = o; });
  camp.setTaken(false);
  assert.ok(bow.visible && glow.visible);
  assert.deepEqual(camp.minimapMarkers().map((m) => [m.x, m.z]), [[layout.bowCamp.x, layout.bowCamp.z]]);
  camp.update(0.1, 1);
  camp.setTaken(true);
  assert.ok(!bow.visible && !glow.visible);
  assert.deepEqual(camp.minimapMarkers(), []);
  // an island without a camp: nothing
  const none = buildBowCamp(null, { bowCamp: null });
  assert.equal(none.group.children.length, 0);
  assert.deepEqual(none.minimapMarkers(), []);
});
