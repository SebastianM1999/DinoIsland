// Dinosaurs on high ground run down steep mountain walls to a player below
// instead of standing on the rim staring down (src/sim/dinos.js walkable/move,
// src/sim/pathfind.js). Climbing up steep ground stays limited. Checked over
// many island variants (a seeded list, so a failure can be replayed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { findPath } from '../src/sim/pathfind.js';
import { climbSlope } from '../src/sim/dinos.js';
import { insideGrove } from '../src/shared/grove.js';
import { insideBossArena } from '../src/shared/bossArena.js';
import { CONFIG } from '../src/shared/config.js';

const TYPES = ['raptor', 'trex', 'stego', 'brachio'];
const ISLANDS = 12;
const PER_TYPE = 2;
const DT = 0.05;

function lcg(seed) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** Island variants: half first islands (jungle), half second (volcanic). */
const VARIANTS = (() => {
  const rnd = lcg(20261002);
  return Array.from({ length: ISLANDS }, (_, k) => ({ level: k % 2 ? 2 : 0, variant: 1 + Math.floor(rnd() * 1e6) }));
})();

/**
 * Rim spots A (gentle, high) with a spot B 10-18 m away and >= 4 m lower, where the
 * straight way down runs over ground too steep to walk up (so the old rule blocked it).
 */
function rimCases(world, type, rnd, want) {
  const sys = world.dinos, t = world.terrain;
  const probe = { type, radius: CONFIG.dinos[type].radius };
  const H = CONFIG.world.size / 2 - 30;
  const out = [];
  for (let tries = 0; tries < 20000 && out.length < want; tries++) {
    const ax = (rnd() * 2 - 1) * H, az = (rnd() * 2 - 1) * H;
    if (!sys.walkable(ax, az, probe)) continue;
    const ha = t.heightAt(ax, az);
    if (ha < 6) continue;
    const a = rnd() * Math.PI * 2, dist = 10 + rnd() * 8;
    const bx = ax + Math.cos(a) * dist, bz = az + Math.sin(a) * dist;
    const hb = t.heightAt(bx, bz);
    if (hb > ha - 4 || !sys.walkable(bx, bz, probe)) continue;
    let steep = false, ok = true, prev = ha;
    for (let s = 0.5; s < dist; s += 0.5) {
      const x = ax + Math.cos(a) * s, z = az + Math.sin(a) * s, h = t.heightAt(x, z);
      if (t.waterDepthAt(x, z) > 0.3 || t.lavaLevelAt(x, z) !== null || h > prev + 0.3) ok = false;
      if (t.slopeAt(x, z) > climbSlope(probe) + 0.05) steep = true;
      prev = h;
    }
    if (!ok || !steep) continue;
    const spot = sys.findFreeSpot(probe, ax, az, { maxDist: 0.5 });
    if (spot) out.push({ ax: spot.x, az: spot.z, ha, bx, bz, hb, yaw: Math.atan2(-(bx - spot.x), -(bz - spot.z)) });
  }
  return out;
}

function clearDinos(world) {
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
}

/** A dinosaur of `type` at (x, z) that wants to get to the player (or, for the brachio, to `goal`). */
function spawnHunter(world, type, x, z, p, goal) {
  const sys = world.dinos;
  if (type === 'raptor') {
    sys.groups.set('rp', { id: 'rp', home: { x, z }, target: p.id, wander: null, wanderT: 0 });
    return sys.spawn('raptor', x, z, { group: 'rp', slot: 0 });
  }
  if (type === 'trex') {
    if (world.layout.trexPatrol.length < 3) world.layout.trexPatrol = [{ x, z }, { x: x + 20, z }, { x, z: z + 20 }];
    const d = sys.spawn('trex', x, z, { wp: 0 });
    Object.assign(d, { mode: 'chase', targetId: p.id, chaseT: 0 });
    return d;
  }
  if (type === 'stego') {
    const d = sys.spawn('stego', x, z, { group: 'st', slot: 0, home: { x, z } });
    Object.assign(d, { anger: 30, targetId: p.id });
    return d;
  }
  // the brachio does not hunt: its herd heads for a goal below
  sys.groups.set('bh', { id: 'bh', zone: { x, z, radius: 4, spawns: [] }, target: goal, retarget: 999, panic: 0, threat: null, graze: 0, alertT: 0 });
  p.x = x + 200;   // out of the way (it would turn and defend itself)
  return sys.spawn('brachio', x, z, { group: 'bh', slot: 0 });
}

test('dinosaurs on a rim run down the steep wall to a player below (all species, many islands)', () => {
  const stats = Object.fromEntries(TYPES.map((t) => [t, { n: 0, down: 0, fails: [] }]));
  for (const { level, variant } of VARIANTS) {
    const world = new ServerWorld({ send() {} }, { level, variant });
    const { id } = world.join('Decoy');
    const p = world.players.get(id);
    p.creative = true;              // nobody gets hurt; the dinosaurs still hunt
    for (const type of TYPES) {
      // the brachio's 10 m body cannot thread the jungle's trees (local avoidance, not the
      // slope rule): leave out trees and rocks for it so this checks the terrain only
      const keep = world.dinos.colliders;
      if (type === 'brachio') world.dinos.colliders = { circles: [], boxes: [] };
      for (const c of rimCases(world, type, lcg(variant * 31 + type.length), PER_TYPE)) {
        clearDinos(world);
        p.x = c.bx; p.z = c.bz; p.y = c.hb;
        const d = spawnHunter(world, type, c.ax, c.az, p, { x: c.bx, z: c.bz });
        d.yaw = c.yaw;
        let down = false;
        for (let s = 0; s < 20 && !down; s += DT) {
          if (type === 'stego') d.anger = 30;
          world.step(DT);
          if (type !== 'brachio') { p.x = c.bx; p.z = c.bz; p.y = c.hb; }
          p.lastInput = world.now;
          down = d.y <= c.hb + 1.5 || Math.hypot(d.x - c.bx, d.z - c.bz) < (type === 'brachio' ? 7 : 4);
        }
        const s = stats[type];
        s.n++;
        if (down) s.down++;
        else s.fails.push(`island ${level + 1}/${variant} from ${c.ax.toFixed(1)},${c.az.toFixed(1)}: still ${(d.y - c.hb).toFixed(1)} m up`);
      }
      world.dinos.colliders = keep;
    }
  }
  for (const [type, s] of Object.entries(stats)) {
    assert.ok(s.n >= ISLANDS, `${type}: found ${s.n} rim spots`);
    // before the fix: raptor 6 %, T-Rex 19 %, stego 26 %, brachio 13 % (30 islands, 87-90 spots each)
    assert.ok(s.down / s.n >= 0.85, `${type}: came down ${s.down}/${s.n}\n  ${s.fails.join('\n  ')}`);
  }
});

test('downhill may be steep, uphill may not; water, lava, the grove, the boss islet and the base stay closed either way', () => {
  for (const { level, variant } of VARIANTS.slice(0, 6)) {
    const world = new ServerWorld({ send() {} }, { level, variant });
    const sys = world.dinos, t = world.terrain, L = world.layout;
    const rnd = lcg(variant);
    for (const type of TYPES) {
      const d = { type, radius: CONFIG.dinos[type].radius };
      let steep = 0, closed = 0;
      for (let k = 0; k < 4000; k++) {
        const x = (rnd() * 2 - 1) * 350, z = (rnd() * 2 - 1) * 350;
        const wet = t.waterDepthAt(x, z) > 1.2 || t.lavaLevelAt(x, z) !== null;
        const zone = world.safeZone();
        const banned = insideGrove(L, x, z, 3) || insideBossArena(L, x, z, 4) || (zone && Math.hypot(x - zone.x, z - zone.z) < zone.r + 10);
        if (wet || banned) {
          assert.ok(!sys.walkable(x, z, d, true), `island ${level + 1}/${variant} ${type}: ${x.toFixed(1)},${z.toFixed(1)} stays closed going down`);
          closed++;
        } else if (t.slopeAt(x, z) > climbSlope(d) && t.waterDepthAt(x, z) === 0 && Math.abs(x) < CONFIG.world.size / 2 - 20 && Math.abs(z) < CONFIG.world.size / 2 - 20) {
          assert.ok(!sys.walkable(x, z, d), `${type}: steep ${x.toFixed(1)},${z.toFixed(1)} is no climb`);
          assert.ok(sys.walkable(x, z, d, true), `${type}: steep ${x.toFixed(1)},${z.toFixed(1)} is run down`);
          steep++;
        }
      }
      assert.ok(steep > 20 && closed > 20, `${type}: sampled ${steep} steep and ${closed} closed spots`);
    }
  }
});

test('pathfinding plans the way down a wall and never up one', () => {
  let planned = 0, back = 0;
  for (const { level, variant } of VARIANTS) {
    const world = new ServerWorld({ send() {} }, { level, variant });
    const sys = world.dinos, t = world.terrain;
    for (const type of ['raptor', 'trex']) {
      const d = { type, radius: CONFIG.dinos[type].radius };
      for (const c of rimCases(world, type, lcg(variant * 7 + type.length), 2)) {
        const down = findPath(sys, d, c.ax, c.az, c.bx, c.bz, 3, 1500, { every: 1 });
        assert.ok(down, `island ${level + 1}/${variant} ${type}: a way down from ${c.ax.toFixed(1)},${c.az.toFixed(1)}`);
        planned++;
        // the way back up (if any) only ever enters steep ground downhill
        const up = findPath(sys, d, c.bx, c.bz, c.ax, c.az, 3, 4000, { every: 1 });
        if (!up) continue;
        back++;
        for (let i = 1; i < up.length; i++) {
          const a = up[i - 1], b = up[i];
          if (!sys.walkable(b.x, b.z, d)) {
            assert.ok(t.heightAt(b.x, b.z) < t.heightAt(a.x, a.z), `${type}: the way up climbs steep ground at ${b.x},${b.z}`);
          }
        }
      }
    }
  }
  assert.ok(planned >= ISLANDS * 2, `planned ${planned} ways down`);
  assert.ok(back > 0, `${back} ways back up checked`);
});

test('after running down, a raptor is not trapped at the foot of the wall', () => {
  let n = 0, away = 0;
  for (const { level, variant } of VARIANTS.slice(0, 8)) {
    const world = new ServerWorld({ send() {} }, { level, variant });
    const sys = world.dinos;
    for (const c of rimCases(world, 'raptor', lcg(variant * 13), 2)) {
      const spot = sys.findFreeSpot({ type: 'raptor', radius: CONFIG.dinos.raptor.radius }, c.bx, c.bz, { maxDist: 1 });
      if (!spot) continue;
      clearDinos(world);
      // its pack's home is up on the rim; nobody around: it wanders back over gentle ground
      sys.groups.set('rp', { id: 'rp', home: { x: c.ax, z: c.az }, target: null, wander: null, wanderT: 0 });
      const d = sys.spawn('raptor', spot.x, spot.z, { group: 'rp', slot: 0 });
      let far = 0;
      for (let s = 0; s < 60; s += DT) {
        world.step(DT);
        far = Math.max(far, Math.hypot(d.x - spot.x, d.z - spot.z));
      }
      n++;
      if (far > 10) away++;
    }
  }
  assert.ok(n >= 8, `${n} raptors at the foot of a wall`);
  assert.ok(away / n >= 0.9, `${away}/${n} got away from the foot of the wall`);
});
