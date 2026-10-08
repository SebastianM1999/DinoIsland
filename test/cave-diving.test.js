// Cave diving on level 4, the Hollow Mountain: the diver's controller (descend / ascend / buoyancy / bounds / roof),
// the breath on the server (drain, refill, drowning), the sump (one flooded tunnel per variant whose middle
// dives under the roof: an optional shortcut, never needed for a relic or the exit) and the torch going out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { SUMP } from '../src/shared/caveMaze.js';
import { CONFIG } from '../src/shared/config.js';
import { MSG, PF } from '../src/shared/protocol.js';
import { PlayerController } from '../src/client/player/controller.js';
import { torchState } from '../src/client/player/actions.js';
import { ServerWorld } from '../src/sim/world.js';
import { sumpLurkerBrain } from '../src/sim/ai/sumpLurker.js';

const LEVEL = 3;
const VARIANTS = Array.from({ length: 16 }, (_, i) => i + 1);
const P = CONFIG.player, SW = P.swim, DV = P.dive;
const cache = new Map();
function island(variant) {
  if (!cache.has(variant)) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    cache.set(variant, { variant, terrain, plan: terrain.plan, layout, maze: terrain.plan.cave.maze });
  }
  return cache.get(variant);
}

/** Sample the sump tunnel's centre line every `step` metres: { x, z, d, dir } */
function centreLine(tunnel, step = 0.5) {
  const pts = tunnel.pts, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const out = [];
  for (let d = 0, i = 1; d <= cum[cum.length - 1]; d += step) {
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, d, u: d / cum[cum.length - 1], dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } });
  }
  return out;
}
const sumpTunnel = (maze) => maze.tunnels.find((t) => t.flooded?.sump);

// ------------------------------------------------------------------------------------------------ the sump

test('every variant has at most one sump, and nearly all of them have one', () => {
  let withSump = 0;
  for (const { variant, maze, layout } of VARIANTS.map(island)) {
    const n = maze.tunnels.filter((t) => t.flooded?.sump).length;
    assert.ok(n <= 1, `variant ${variant}: ${n} sumps`);
    assert.equal(layout.sumps.length, n);
    withSump += n;
  }
  assert.ok(withSump >= 12, `${withSump} of 16 variants have a sump`);
});

test('a sump dives under the roof for 8-20 m, with >= 2.5 m of headroom over a >= 4 m wide channel, within the breath time', () => {
  for (const { variant, terrain, maze } of VARIANTS.map(island)) {
    const t = sumpTunnel(maze);
    if (!t) continue;
    let sub = 0, minHead = Infinity, minWidth = Infinity;
    const step = 0.5, line = centreLine(t, step);
    for (let k = 1; k < line.length; k++) {
      const { x, z, dir } = line[k];
      const w = terrain.waterLevelAt(x, z), c = terrain.ceilingAt(x, z);
      if (w === null || c >= w) continue;
      sub += step;
      minHead = Math.min(minHead, c - terrain.heightAt(x, z));
      // across the tunnel: the width of water under a roof with >= 2.5 m of room
      let width = 0;
      for (let o = -9; o <= 9; o += 0.25) {
        const px = x - dir.z * o, pz = z + dir.x * o;
        if (terrain.waterLevelAt(px, pz) !== null && terrain.ceilingAt(px, pz) - terrain.heightAt(px, pz) >= 2.5) width += 0.25;
      }
      minWidth = Math.min(minWidth, width);
    }
    assert.ok(sub >= 8 && sub <= 20, `variant ${variant}: submerged for ${sub} m`);
    assert.ok(minHead >= 2.5, `variant ${variant}: headroom ${minHead.toFixed(2)} m`);
    assert.ok(minWidth >= 4, `variant ${variant}: channel ${minWidth.toFixed(2)} m wide`);
    // a fit swimmer makes it with plenty of air to spare (the whole flooded stretch at diving speed, well within the breath)
    const flooded = (t.flooded.u1 - t.flooded.u0) * t.length;
    assert.ok(flooded / DV.speed < DV.breath * 0.9 || sub / DV.speed < DV.breath * 0.4, `variant ${variant}: ${flooded} m to swim`);
    assert.ok(sub / DV.speed < DV.breath * 0.4, `variant ${variant}: ${(sub / DV.speed).toFixed(1)} s submerged`);
  }
});

test('the sump is only a shortcut: every relic and the exit stay reachable on dry land, and the sump itself is not', () => {
  for (const { variant, terrain, layout, plan, maze } of VARIANTS.map(island)) {
    const t = sumpTunnel(maze);
    if (!t) continue;
    // flood fill over walkable (dry, gentle) cells from the spawn: no wading deeper than 0.3 m, so no sump
    const n1 = terrain.n + 1, seen = new Uint8Array(n1 * n1), stack = [];
    const xz = (i, j) => [-terrain.half + i * terrain.cell, -terrain.half + j * terrain.cell];
    const sp = layout.spawnPoints[0];
    const i0 = Math.round((sp.x + terrain.half) / terrain.cell), j0 = Math.round((sp.z + terrain.half) / terrain.cell);
    seen[j0 * n1 + i0] = 1; stack.push([i0, j0]);
    while (stack.length) {
      const [i, j] = stack.pop();
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if ((!di && !dj) || a < 0 || b < 0 || a > terrain.n || b > terrain.n || seen[b * n1 + a]) continue;
        const [x, z] = xz(a, b);
        if (!terrain.isWalkable(x, z, 0.3, CONFIG.player.maxWalkSlope)) continue;
        if (Math.abs(terrain.h(a, b) - terrain.h(i, j)) > CONFIG.player.maxWalkSlope * Math.hypot(di, dj) * terrain.cell) continue;
        seen[b * n1 + a] = 1; stack.push([a, b]);
      }
    }
    const reach = (x, z) => seen[Math.round((z + terrain.half) / terrain.cell) * n1 + Math.round((x + terrain.half) / terrain.cell)] === 1;
    for (const r of layout.relics) assert.ok(reach(r.x, r.z), `variant ${variant}: ${r.kind} is reachable without diving`);
    assert.ok(reach(layout.caveExit.x, layout.caveExit.z), `variant ${variant}: the exit is reachable without diving`);
    const sm = layout.sumps[0];
    assert.ok(!reach(sm.cache.x, sm.cache.z), 'the cache is under water');
    assert.ok(terrain.waterDepthAt(sm.cache.x, sm.cache.z) >= 3, 'deep');
    assert.ok(plan.cave.rooms.cave !== undefined);
  }
});

test('the cache lies on the floor of the dive and the lurker waits at the mouth, not inside', () => {
  for (const { variant, terrain, layout, maze } of VARIANTS.map(island)) {
    const sm = layout.sumps[0];
    if (!sm) continue;
    const t = maze.tunnels[sm.tunnel];
    assert.ok(terrain.ceilingAt(sm.cache.x, sm.cache.z) < terrain.waterLevelAt(sm.cache.x, sm.cache.z), `variant ${variant}: the cache is under the roof`);
    assert.deepEqual(sm.cache.loot, SUMP.cache);
    const spot = layout.caveDinoSpots.find((c) => c.tunnel === t.id);
    assert.ok(spot && spot.water, 'a lurker spot at the sump');
    // not inside the diving passage: open air over the water there
    assert.ok(terrain.ceilingAt(spot.x, spot.z) > terrain.waterLevelAt(spot.x, spot.z), `variant ${variant}: the lurker's water is not under the roof`);
    assert.ok(Math.hypot(spot.x - sm.cache.x, spot.z - sm.cache.z) > 7);
  }
});

test('the server puts the cache on the floor, for good', () => {
  const { layout } = island(1);
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 1 });
  const sm = layout.sumps[0];
  const items = [...world.items.values()].filter((it) => it.keep);
  const total = Object.values(sm.cache.loot).reduce((a, b) => a + b, 0);
  assert.equal(items.length, total);
  for (const kind of Object.keys(sm.cache.loot)) assert.equal(items.filter((it) => it.kind === kind).length, sm.cache.loot[kind]);
  for (const it of items) assert.ok(Math.hypot(it.x - sm.cache.x, it.z - sm.cache.z) < 2.5 && it.y < sm.level - 2);
  world.now += 100000;
  world.step(0.05);
  assert.equal([...world.items.values()].filter((it) => it.keep).length, total, 'never despawns');
});

// ------------------------------------------------------------------------------------------------ the diver

function diver(variant = 1, { inside = false } = {}) {
  const { terrain, layout, maze } = island(variant);
  const t = sumpTunnel(maze), sm = layout.sumps[0];
  const line = centreLine(t, 0.5);
  const pc = new PlayerController(terrain, layout.playerColliders, layout.rockSurfaceAt);
  // start afloat in the deepest open water before the dive, facing the sump
  const sp = t.flooded.sump, level = sm.level;
  const open = line.filter((p) => p.u < sp.s0 - sp.ramp && terrain.ceilingAt(p.x, p.z) > level + 2 && terrain.waterDepthAt(p.x, p.z) > 1.6);
  if (!open.length) open.push(line.find((p) => p.u >= sp.s0 - sp.ramp * 0.8));
  const a = open.reduce((best, p) => (terrain.waterDepthAt(p.x, p.z) > terrain.waterDepthAt(best.x, best.z) ? p : best), open[0]);
  const into = line.find((p) => p.u >= sp.s0);
  pc.teleport(a.x, a.z, Math.atan2(-(into.x - a.x), -(into.z - a.z)));
  const floatY = terrain.inlandWaterLevelAt(a.x, a.z) - SW.float;
  pc.pos.y = floatY; pc.onGround = false;
  if (inside) {
    // mid-water in the middle of the sump
    const m = sm.cache, mid = line.find((p) => p.u >= (sp.s0 + sp.s1) / 2);
    pc.teleport(m.x, m.z, Math.atan2(-(into.x - mid.x), -(into.z - mid.z)));
    pc.pos.y = m.y + 2; pc.onGround = false;
  }
  return { pc, terrain, layout, sm, t, line, floatY };
}
const run = (pc, seconds, intent, each) => { for (let i = 0; i < seconds * 60; i++) { pc.update(1 / 60, intent); each?.(i); } };

test('afloat without diving nothing changes: the swimmer bobs at the surface', () => {
  const { pc, floatY } = diver();
  run(pc, 3, {});
  assert.ok(pc.swimming && !pc.diving);
  assert.ok(Math.abs(pc.pos.y - floatY) < 0.12);
  assert.equal(pc.submerged, false);
  assert.equal(pc.breath, DV.breath);
});

test('hold the dive key to descend, Space to ascend, let go and the water lifts you; the bottom and the surface are the bounds', () => {
  const { pc, terrain, floatY } = diver();
  run(pc, 2, { dive: true });
  assert.ok(pc.diving && pc.swimming);
  assert.ok(pc.pos.y < floatY - 1.4, `sank to ${pc.pos.y.toFixed(2)}`);
  assert.ok(pc.submerged, 'the head is under water');
  assert.ok(pc.breath < DV.breath, 'the breath drains');
  // down to the bottom, and no further
  run(pc, 6, { dive: true }, () => assert.ok(pc.pos.y >= terrain.heightAt(pc.pos.x, pc.pos.z) - 1e-6));
  const bottom = terrain.heightAt(pc.pos.x, pc.pos.z);
  assert.ok(Math.abs(pc.pos.y - bottom) < 0.05, 'on the bottom');
  // Space swims up at the dive speed ...
  const y0 = pc.pos.y;
  run(pc, 0.5, { jump: true });
  assert.ok(pc.pos.y - y0 > 0.5 && pc.pos.y - y0 < DV.vertical * 0.5 + 0.05, `rose ${pc.pos.y - y0}`);
  // ... buoyancy lifts gently with no input ...
  run(pc, 3, { dive: true });
  run(pc, 0.6, {});
  const y1 = pc.pos.y;
  run(pc, 0.5, {});
  assert.ok(pc.pos.y > y1 + 0.15 && pc.pos.y - y1 < DV.buoyancy * 0.5 + 0.05, `drifts up ${pc.pos.y - y1}`);
  // ... and the surface is the top
  run(pc, 12, {}, () => assert.ok(pc.pos.y <= floatY + 0.06));
  assert.ok(!pc.diving && !pc.submerged, 'back at the surface');
  assert.ok(Math.abs(pc.pos.y - floatY) < 0.15);
});

test('3D swimming: forward follows the camera pitch, slowly', () => {
  const { pc, floatY } = diver(1, { inside: true });
  run(pc, 0.3, { dive: true });
  pc.pitch = -0.7;     // looking down
  const before = { ...pc.pos };
  run(pc, 1, { forward: true });
  const dy = pc.pos.y - before.y, dh = Math.hypot(pc.pos.x - before.x, pc.pos.z - before.z);
  assert.ok(dy < -0.8, `descends with the look: ${dy.toFixed(2)}`);
  assert.ok(dh > 0.4 && Math.hypot(dh, dy) < DV.speed * 1.15, 'at about the dive speed (not the 3.1 m/s surface stroke)');
  pc.pitch = 0.9;
  const low = pc.pos.y;
  run(pc, 1, { forward: true });
  assert.ok(pc.pos.y > low + 0.3, 'rises when looking up');
  assert.ok(pc.pos.y <= floatY + 0.06);
});

test('the roof of the sump is the top: no head through the rock, and the mouth is entered by diving under it', () => {
  const { pc, terrain, sm, line } = diver();
  // on the surface, swimming into the sump: the roof comes down and blocks the way until you dive
  const inside = line.find((p) => terrain.ceilingAt(p.x, p.z) < sm.level - 0.4);
  assert.ok(inside, 'the sump has a submerged stretch');
  const entry = line[line.indexOf(inside) - 1];
  const dirx = inside.x - entry.x, dirz = inside.z - entry.z;
  const approach = line.filter((p) => p.d < inside.d).slice(-60, -20)[0];
  pc.teleport(approach.x, approach.z, Math.atan2(-(inside.x - approach.x), -(inside.z - approach.z)));
  pc.pos.y = terrain.inlandWaterLevelAt(approach.x, approach.z) - SW.float; pc.onGround = false;
  void dirx; void dirz;
  run(pc, 10, { forward: true }, () => assert.ok(pc.pos.y + P.height <= terrain.ceilingAt(pc.pos.x, pc.pos.z) + 0.06, 'the head stays under the roof'));
  assert.ok(!pc.diving, 'a surface swimmer does not slip under the roof by himself');
  // diving, the same stroke goes through; the roof then caps Space and buoyancy
  run(pc, 2, { dive: true });
  run(pc, 14, { forward: true, dive: false }, () => assert.ok(pc.pos.y + P.height <= terrain.ceilingAt(pc.pos.x, pc.pos.z) + 0.06));
  run(pc, 3, { jump: true }, () => assert.ok(pc.pos.y + P.height <= terrain.ceilingAt(pc.pos.x, pc.pos.z) + 0.06));
});

test('a fit diver swims the whole sump and comes up on the other side with air to spare', () => {
  for (const variant of [1, 5, 9, 13]) {
    const { pc, terrain, sm, line, t } = diver(variant);
    const goal = line.filter((p) => p.u > t.flooded.sump.s1 + t.flooded.sump.ramp + 0.02)[0];
    const path = line.filter((p) => p.u >= t.flooded.sump.s0 - t.flooded.sump.ramp - 0.05 && p.u <= goal.u && p.d % 2 < 0.5);
    let minBreath = DV.breath, subTime = 0, k = 0;
    for (let frame = 0; frame < 60 * 60 && k < path.length; frame++) {
      const target = path[Math.min(k + 2, path.length - 1)];
      if (Math.hypot(target.x - pc.pos.x, target.z - pc.pos.z) < 1.2) k++;
      pc.yaw = Math.atan2(-(target.x - pc.pos.x), -(target.z - pc.pos.z));
      pc.pitch = 0;
      // hold a depth: low in the sump, near the surface elsewhere
      const water = terrain.inlandWaterLevelAt(pc.pos.x, pc.pos.z) ?? sm.level;
      // (looks one stroke ahead: the roof comes down in front of him)
      const roof = Math.min(terrain.ceilingAt(pc.pos.x, pc.pos.z), terrain.ceilingAt(target.x, target.z) + 1.5);
      const want = roof < water + 1.2 ? Math.max(terrain.heightAt(pc.pos.x, pc.pos.z) + 1, roof - P.height - 0.6) : water - SW.float;
      const down = pc.pos.y > want + 0.25, up = pc.pos.y < want - 0.25;
      pc.update(1 / 60, { forward: true, dive: down || (!up && pc.diving && roof < water + 1.2), jump: up });
      assert.ok(pc.pos.y >= terrain.heightAt(pc.pos.x, pc.pos.z) - 1e-6 && pc.pos.y + P.height <= terrain.ceilingAt(pc.pos.x, pc.pos.z) + 0.06);
      minBreath = Math.min(minBreath, pc.breath);
      if (pc.submerged) subTime += 1 / 60;
    }
    assert.equal(k, path.length, `variant ${variant}: made it through (${k}/${path.length})`);
    assert.ok(subTime > 5 && subTime < 20, `variant ${variant}: ${subTime.toFixed(1)} s under water`);
    assert.ok(minBreath > DV.breath * 0.35, `variant ${variant}: ${minBreath.toFixed(1)} s of air left at the worst`);
  }
});

test('the breath refills quickly at the surface', () => {
  const { pc } = diver();
  run(pc, 3, { dive: true });
  assert.ok(pc.breath < DV.breath - 1);
  run(pc, 16, {});
  assert.ok(!pc.submerged);
  run(pc, 0.5, {});
  const b = pc.breath;
  run(pc, 3, {});
  assert.equal(pc.breath, DV.breath);
  assert.ok(DV.breath - b <= DV.refill * 3 + 1e-6);
});

// ------------------------------------------------------------------------------------------------ the server

function wetWorld(variant = 1) {
  const { terrain, layout } = island(variant);
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant });
  const { id } = world.join('Diver');
  const p = world.players.get(id);
  const sm = layout.sumps[0];
  const mid = sm.cache;
  return { world, p, id, terrain, sm, mid };
}
const advance = (world, seconds) => { for (let i = 0; i < seconds * 20; i++) world.step(0.05); };

test('server: the breath drains under water, refills above it, and an empty one drowns', () => {
  const { world, p, terrain, mid, sm } = wetWorld();
  Object.assign(p, { x: mid.x, z: mid.z, y: terrain.heightAt(mid.x, mid.z) + 0.2, lastMoveAt: world.now });
  assert.ok(terrain.headUnderwater(p.x, p.y, p.z));
  advance(world, 4);
  assert.ok(p.breath < DV.breath - 3.5 && p.breath > DV.breath - 4.5, `breath ${p.breath}`);
  assert.equal(p.hp, p.maxHp, 'no damage while there is air');
  // up for air: refills fast
  p.y = sm.level - SW.float;
  assert.ok(!terrain.headUnderwater(p.x, p.y, p.z));
  advance(world, 0.1);
  advance(world, 2.5);
  assert.equal(p.breath, DV.breath);
  // none left: hurt every tick until the head is out
  p.y = terrain.heightAt(mid.x, mid.z) + 0.2;
  p.breath = 0.3;
  advance(world, 0.4);
  assert.equal(p.hp, p.maxHp, 'still holding on');
  advance(world, 2);
  const lost = p.maxHp - p.hp;
  assert.ok(lost >= DV.drownDps * 1.5 && lost <= DV.drownDps * 2.2, `drowning cost ${lost} HP`);
  p.y = sm.level - SW.float;
  const hp = p.hp;
  advance(world, 2);
  assert.equal(p.hp, hp, 'no more damage at the surface');
  // creative players never drown
  p.creative = true; p.y = terrain.heightAt(mid.x, mid.z) + 0.2; p.breath = 0;
  advance(world, 2);
  assert.equal(p.hp, hp);
});

test('server: it drowns the diver for good, and the breath is full again after the respawn', () => {
  const { world, p, terrain, mid } = wetWorld();
  Object.assign(p, { x: mid.x, z: mid.z, y: terrain.heightAt(mid.x, mid.z) + 0.2, lastMoveAt: world.now, breath: 0 });
  for (let i = 0; i < 20 * 20 && p.alive; i++) world.step(0.05);
  assert.equal(p.alive, false, 'drowned');
  assert.ok(world.now < 20, 'within a few seconds of running out of air');
  world.respawnPlayer(p);
  assert.equal(p.breath, DV.breath);
});

test('server: it accepts an underwater state, in 3D, and refuses what a diver cannot do', () => {
  const { world, p, id, terrain, sm, mid } = wetWorld();
  // from the open water before the sump, down into the channel
  const a = sm.a, floor = (x, z) => terrain.heightAt(x, z);
  const surface = sm.level - SW.float;
  Object.assign(p, { x: a.x, z: a.z, y: surface, lastMoveAt: world.now, moveBudget: 3.5 });
  const send = (x, y, z) => world.receive(id, { t: MSG.STATE, x, y, z, yaw: 0, pitch: 0, k: p.epoch });
  world.step(0.1);
  send(a.x, surface - 0.2, a.z);
  assert.equal(p.y, surface - 0.2, 'diving down is accepted');
  world.step(0.1);
  send(a.x, surface - 0.4, a.z);
  assert.equal(p.y, surface - 0.4);
  // too fast down: a teleport in depth
  world.step(0.1);
  send(a.x, surface - 5, a.z);
  assert.equal(p.y, surface - 0.4, 'a 4.6 m plunge in 0.1 s is refused');
  // below the bottom
  world.step(0.1);
  const g = floor(a.x, a.z);
  send(a.x, g - 1, a.z);
  assert.ok(p.y > g - 0.3, 'never below the floor');
  // inside the sump the roof caps the height (a state above it is pressed down)
  Object.assign(p, { x: mid.x, z: mid.z, y: floor(mid.x, mid.z) + 0.3, lastMoveAt: world.now });
  world.step(0.2);
  send(mid.x, floor(mid.x, mid.z) + 1.1, mid.z);
  assert.ok(Math.abs(p.y - (floor(mid.x, mid.z) + 1.1)) < 1e-9, 'swimming up on the floor is fine');
  world.step(0.5);
  send(mid.x, sm.level + 3, mid.z);
  assert.ok(p.y + P.height <= terrain.ceilingAt(mid.x, mid.z) + 1e-6, 'the roof caps it');
  // a diver sinking into the open sea is still turned back (the sea stays off limits)
  assert.ok(terrain.seaDepthAt(layoutBoat(world).x + 12, layoutBoat(world).z) >= 0);
});

const layoutBoat = (world) => world.layout.boat;

test('server: the torch goes out under water', () => {
  const { world, p, id, terrain, sm, mid } = wetWorld();
  p.inv.torch = true;
  const state = (x, y, z, fl) => world.receive(id, { t: MSG.STATE, x, y, z, yaw: 0, pitch: 0, fl, k: p.epoch });
  Object.assign(p, { x: sm.a.x, z: sm.a.z, y: sm.level - SW.float, lastMoveAt: world.now });
  world.step(0.1);
  state(sm.a.x, sm.level - SW.float, sm.a.z, PF.TORCH);
  assert.ok(p.fl & PF.TORCH, 'lit above the water');
  world.step(0.1);
  state(sm.a.x, sm.level - SW.float - 1.2, sm.a.z, PF.TORCH);
  assert.ok(terrain.headUnderwater(p.x, p.y, p.z));
  assert.equal(p.fl & PF.TORCH, 0, 'out under water');
  void mid;
});

test('the client torch goes out the moment the head is under water and lights again with the key once the face is out', () => {
  const lit = { owns: true, alive: true, submerged: false, lit: true, toggle: false };
  assert.deepEqual(torchState(lit), { lit: true, extinguished: false });
  assert.deepEqual(torchState({ ...lit, submerged: true }), { lit: false, extinguished: true });
  assert.deepEqual(torchState({ ...lit, submerged: true, lit: false, toggle: true }), { lit: false, extinguished: false }, 'no relighting under water');
  assert.deepEqual(torchState({ ...lit, lit: false, toggle: true }), { lit: true, extinguished: false });
  assert.deepEqual(torchState({ ...lit, owns: false }), { lit: false, extinguished: false });
});

// ------------------------------------------------------------------------------------------------ dinosaurs

test('sump lurkers can take a diver on the bottom of the pool, and nobody far above or beyond the surface', () => {
  const { terrain, layout } = island(1);
  const spot = layout.caveDinoSpots.find((c) => c.water);
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 1 });
  const d = world.dinos.list.find((q) => q.type === 'sump-lurker');
  assert.ok(d);
  const level = terrain.waterLevelAt(d.x, d.z);
  assert.ok(level !== null && spot);
  // the lurker's brain: the diver 5 m below it is prey, 10 m below is not; a swimmer at the surface is
  const { id } = world.join('Bait');
  const p = world.players.get(id);
  Object.assign(p, { x: d.x + 3, z: d.z, y: d.y - 4.8 });
  d.mode = 'lurk'; d.modeT = 5; d.yaw = -Math.PI / 2;
  const sys = world.dinos;
  const target = () => { sumpLurkerBrain.update(d, sys, 0.05); return d.targetId === p.id; };
  assert.ok(target(), 'a diver deep below is noticed');
  Object.assign(p, { y: d.y - 9 });
  d.targetId = null;
  assert.ok(!target(), 'but not one out of reach');
  Object.assign(p, { y: level - SW.float });
  d.targetId = null;
  assert.ok(target(), 'a surface swimmer still is');
});
