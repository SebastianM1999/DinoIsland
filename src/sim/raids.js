// Raids on the team's base (islands 2+, see shared/base.js). Once a base
// stands, groups of dinosaurs attack it every few minutes – the bigger the
// base, the bigger the group. A raid is announced 20 s ahead with the
// direction it comes from. Raiders go for the towers and the base itself,
// fight back when a player attacks them, and retreat after a while. The base
// is never destroyed, only damaged (no healing / safe zone, towers silent)
// until the team repairs it from the base panel.
//
// Raids only happen while someone is near the base, so nothing burns down
// while the team is out exploring – and never while the team sets sail.

import { CONFIG } from '../shared/config.js';
import { EV, DS } from '../shared/protocol.js';
import { BASE_LOCAL, PALISADE_R, TOWER_SLOTS, plotPoint } from '../shared/base.js';
import { angleDiff } from '../shared/rng.js';
import { findPath } from './pathfind.js';
import { updateRaptorFear } from './ai/raptor.js';

export const RAID = {
  first: 240,              // seconds after the camp stands until the first raid
  gapMin: 240,             // seconds between raids
  gapMax: 360,
  warn: 20,                // announced this long before it starts
  maxTime: 180,            // raiders give up after this long
  nearPlayers: 150,        // someone must be this close to the base
  spawnDist: 125,          // raiders appear this far out
};

/** Damage per hit on buildings and seconds between hits, per species. */
const SIEGE = {
  raptor: { dmg: 4, cool: 1.4, reach: 2.2 },
  stego: { dmg: 26, cool: 2.4, reach: 4.5 },
  trex: { dmg: 55, cool: 2.0, reach: 5 },
  brachio: { dmg: 30, cool: 3, reach: 6 },
};
const SPEED = { raptor: 'runSpeed', stego: 'chargeSpeed', trex: 'runSpeed', brachio: 'walkSpeed' };

/** Who attacks a base of `stage` on island `levelIndex` (0-based). */
export function raidGroup(stage, levelIndex) {
  const out = [{ type: 'raptor', n: 3 + (stage >= 2 ? 1 : 0) + Math.max(0, levelIndex - 1) }];
  if (stage >= 2) out.push({ type: 'ptera', n: 2 });
  if (stage >= 3) out.push({ type: levelIndex >= 1 && CONFIG.dinos.trex ? 'trex' : 'stego', n: 1 });
  return out;
}

const compass = (a) => ['north', 'north-west', 'west', 'south-west', 'south', 'south-east', 'east', 'north-east'][Math.round(((a % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8];

export class Raids {
  constructor(world) {
    this.world = world;
    this.phase = 'idle';       // idle -> warn -> active -> idle
    this.nextAt = null;        // when the next raid is announced
    this.startAt = 0;
    this.dir = 0;              // direction the raid comes from (yaw-style angle, see compass())
    this.raiders = [];
  }

  /** Replicated raid state (fullState / EV.RAID). */
  public() {
    return { phase: this.phase, dir: this.dir, left: this.phase === 'warn' ? Math.max(0, Math.round(this.startAt - this.world.now)) : 0 };
  }

  center() {
    const b = this.world.base;
    return plotPoint(this.world.layout.basePlots[b.plot], 'fire');
  }

  /** Is anyone alive near the base? */
  teamHome() {
    const c = this.center();
    for (const p of this.world.players.values()) if (p.alive && Math.hypot(p.x - c.x, p.z - c.z) < RAID.nearPlayers) return true;
    return false;
  }

  update(dt) {
    const w = this.world;
    const b = w.base;
    if (b.plot == null || b.stage < 1 || w.mission.phase === 'sailing') {
      if (this.phase !== 'idle') this.finish(false);
      this.nextAt = null;
      return;
    }
    if (this.nextAt == null) this.nextAt = w.now + RAID.first;
    if (this.phase === 'idle') {
      if (w.now < this.nextAt) return;
      if (!this.teamHome()) { this.nextAt = w.now + 30; return; }
      this.pickSpawn();
      this.startAt = w.now + RAID.warn;
      this.phase = 'warn';
      w.event(EV.RAID, { raid: this.public() });
      w.toast(`Drums from the ${compass(this.dir)}! A raid on your base in ${RAID.warn} s – man the towers!`, 'dino');
    } else if (this.phase === 'warn') {
      if (w.now >= this.startAt) this.start();
    } else if (this.phase === 'active') {
      this.raiders = this.raiders.filter((d) => d.alive && w.dinos.get(d.id) === d);
      if (!this.raiders.length) this.finish(true);
      else if (w.now - this.startAt > RAID.maxTime) this.finish(false);
      else if (!this.targets().length) {
        // everything is wrecked: the raiders soon make off with their victory
        this.wreckedAt ??= w.now;
        if (w.now - this.wreckedAt > 8) this.finish(false);
      } else this.wreckedAt = null;
    }
    // the base patches itself up slowly between raids (a full repair needs the panel)
    if (this.phase === 'idle' && !b.damaged && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 2 * dt);
  }

  /**
   * Where the raid comes from: the first direction (from a random start) with
   * walkable ground ~RAID.spawnDist out and a way from there to the base.
   * Sets this.dir, this.spawn and this.paths (waypoints per species).
   */
  pickSpawn() {
    const w = this.world, sys = w.dinos;
    const c = this.center();
    const start = Math.random() * Math.PI * 2;
    const probe = (type) => ({ type, radius: CONFIG.dinos[type].radius, raid: true });
    // far starts first, then closer ones (a base on a plateau is only reached from nearby)
    let budget = 4;   // failed searches allowed (each one is bounded, see pathfind.js)
    for (const dist of [RAID.spawnDist, RAID.spawnDist * 0.7, 50, 32]) {
      for (let k = 0; k < 16; k++) {
        const a = start + k * (Math.PI / 8);
        const x = c.x - Math.sin(a) * dist, z = c.z - Math.cos(a) * dist;
        if (!sys.walkable(x, z, probe('raptor'))) continue;
        if (budget <= 0) break;
        const path = findPath(sys, probe('raptor'), x, z, c.x, c.z, PALISADE_R);
        if (!path) budget--;
        if (!path) continue;
        this.dir = a;
        this.spawn = { x, z };
        this.paths = { raptor: path };
        return;
      }
    }
    // nowhere to come from (tiny or cut-off plot): straight line from a random side
    this.dir = start;
    this.spawn = { x: c.x - Math.sin(start) * RAID.spawnDist, z: c.z - Math.cos(start) * RAID.spawnDist };
    this.paths = {};
  }

  start() {
    const w = this.world, sys = w.dinos;
    const c = this.center();
    if (!this.spawn) this.pickSpawn();
    const { x: sx, z: sz } = this.spawn;
    this.phase = 'active';
    this.raiders = [];
    let slot = 0;
    for (const { type, n } of raidGroup(w.base.stage, w.levelIndex)) {
      // big animals are pickier about slopes than raptors: their own way, if any
      if (type !== 'ptera' && !(type in this.paths)) {
        this.paths[type] = findPath(sys, { type, radius: CONFIG.dinos[type].radius, raid: true }, sx, sz, c.x, c.z, PALISADE_R);
      }
      for (let i = 0; i < n; i++) {
        let d;
        if (type === 'ptera') {
          d = sys.spawn('ptera', sx, sz, { nest: { x: sx, z: sz }, area: { x: c.x, z: c.z }, slot: slot++ });
          d.y = w.terrain.heightAt(sx, sz) + 25;
        } else {
          const pos = sys.randomWalkablePoint({ type, radius: CONFIG.dinos[type].radius, raid: true }, sx, sz, 10);
          d = sys.spawn(type, pos.x, pos.z, { slot: slot++ });
        }
        d.raid = { target: null, foe: null, cool: 0, best: Infinity, bestAt: w.now, home: { x: sx, z: sz }, path: this.paths[type] || null, wp: 0 };
        this.raiders.push(d);
      }
    }
    this.spawn = null;
    w.event(EV.RAID, { raid: this.public() });
    w.toast(`The raid has begun: ${raidGroup(w.base.stage, w.levelIndex).map((g) => `${g.n} ${CONFIG.dinos[g.type].name}${g.n > 1 ? 's' : ''}`).join(', ')}!`, 'dino');
  }

  /** End the raid: `won` = every raider is down; otherwise the survivors run off. */
  finish(won) {
    const w = this.world;
    for (const d of this.raiders) if (d.alive && w.dinos.get(d.id) === d) w.dinos.remove(d);
    this.raiders = [];
    this.wreckedAt = null;
    this.phase = 'idle';
    this.nextAt = w.now + RAID.gapMin + Math.random() * (RAID.gapMax - RAID.gapMin);
    w.event(EV.RAID, { raid: this.public() });
    if (w.base.stage > 0) w.toast(won ? 'Raid repelled! Your base holds.' : w.base.damaged ? 'The raiders make off – repair your base at the flag!' : 'The raiders retreat into the jungle.', won ? 'trophy' : 'dino');
  }

  // ------------------------------------------------------------------ buildings

  /** What raiders can attack: working towers and the base itself. */
  targets() {
    const w = this.world, b = w.base;
    const plot = w.layout.basePlots[b.plot];
    const list = [];
    for (const t of b.towers) {
      if (t.damaged) continue;
      const p = plotPoint(plot, TOWER_SLOTS[t.slot]);
      list.push({ kind: 'tower', tower: t, x: p.x, z: p.z, r: 2 });
    }
    if (!b.damaged) {
      const home = plotPoint(plot, b.stage >= 2 ? BASE_LOCAL.cabin : BASE_LOCAL.tent);
      list.push({ kind: 'base', x: home.x, z: home.z, r: b.stage >= 2 ? 6 : 3.5 });
    }
    return list;
  }

  /** A raider hit a building. Nothing is ever destroyed – at 0 HP it is damaged. */
  hit(target, dmg) {
    const w = this.world, b = w.base;
    const thing = target.kind === 'tower' ? target.tower : b;
    if (thing.damaged) return;
    thing.hp = Math.max(0, thing.hp - dmg);
    if (thing.hp <= 0) {
      thing.damaged = true;
      w._safe = undefined;   // a damaged base no longer keeps dinosaurs away
      w.toast(target.kind === 'tower' ? 'A tower was knocked out – repair it at the base flag!' : 'The base is wrecked! No healing until you repair it at the base flag.', 'dino');
      w.event(EV.BASE, { base: w.publicBase() });
    } else if (w.now - (this.lastBaseEvent ?? -9) > 1) {
      this.lastBaseEvent = w.now;
      w.event(EV.BASE, { base: w.publicBase() });
    }
  }
}

/**
 * One tick of a ground raider (called by DinoSystem before the brain; pterosaur
 * raiders keep their brain, circling over the base). Returns true when handled.
 */
export function raiderStep(sys, d, dt) {
  if (d.type === 'ptera') return false;
  const w = sys.world, r = d.raid, raids = w.raids;
  const C = CONFIG.dinos[d.type];
  const S = SIEGE[d.type] || SIEGE.raptor;
  const speed = C[SPEED[d.type]] || C.walkSpeed;
  d.fl |= 1;
  r.cool = Math.max(0, (r.cool || 0) - dt);
  // the raid is over (base gone, raid ended): walk off and vanish
  if (raids.phase !== 'active') {
    if (!r.home) { sys.halt(d, dt); return true; }
    sys.steer(d, r.home.x, r.home.z, speed * 0.6, dt);
    d.st = DS.RUN;
    return true;
  }
  // somebody hit it: fight back while they stay close
  if (d.type === 'raptor' && updateRaptorFear(d, sys, dt)) return true;
  let foe = r.foe != null ? w.players.get(r.foe) : null;
  if (foe && (!foe.alive || foe.creative || sys.distTo(d, foe.x, foe.z) > 22)) { r.foe = null; foe = null; }
  if (foe) {
    const dist = sys.distTo(d, foe.x, foe.z);
    if (dist < (C.attackRange || C.biteRange || C.tailRange || 3) + 0.4 && r.cool <= 0) {
      d.st = DS.ATTACK;
      sys.halt(d, dt);
      sys.attackPlayer(d, foe, C.attackDamage || C.biteDamage || C.chargeDamage || 10, 4);
      r.cool = S.cool;
    } else {
      sys.steer(d, foe.x, foe.z, speed, dt);
      d.st = DS.RUN;
    }
    return true;
  }
  // far out: follow the planned way to the base (sim/pathfind.js)
  const home = raids.center();
  if (r.path && r.wp < r.path.length && Math.hypot(d.x - home.x, d.z - home.z) > PALISADE_R + 10) {
    let wp = r.path[r.wp];
    while (r.wp < r.path.length - 1 && Math.hypot(wp.x - d.x, wp.z - d.z) < 5) wp = r.path[++r.wp];
    if (Math.hypot(wp.x - d.x, wp.z - d.z) < 5) r.wp++;
    sys.steer(d, wp.x, wp.z, speed, dt);
    d.st = DS.RUN;
    r.best = Infinity;
    r.bestAt = w.now;
    return true;
  }
  // close by: the nearest building
  const targets = raids.targets();
  if (!targets.length) { sys.halt(d, dt); d.st = DS.ROAR; return true; }
  let t = null, td = Infinity;
  for (const q of targets) {
    const dist = Math.hypot(q.x - d.x, q.z - d.z) - q.r;
    if (dist < td) { td = dist; t = q; }
  }
  // stuck at the palisade (or the way is blocked): it batters whatever is in front of it
  if (td < r.best - 0.5) { r.best = td; r.bestAt = w.now; }
  const c = raids.center();
  const atWall = w.now - r.bestAt > 2.5 && Math.hypot(d.x - c.x, d.z - c.z) < PALISADE_R + 6;
  if (td <= S.reach + C.radius * 0.5 || atWall) {
    const want = Math.atan2(-(t.x - d.x), -(t.z - d.z));
    d.yaw += Math.max(-dt * 3, Math.min(dt * 3, angleDiff(d.yaw, want)));
    sys.halt(d, dt);
    d.st = DS.ATTACK;
    if (r.cool <= 0) {
      r.cool = S.cool;
      w.event(EV.ATTACK, { id: d.id, kind: 'siege' });
      raids.hit(atWall && td > S.reach + C.radius * 0.5 ? targets.find((q) => q.kind === 'base') || t : t, S.dmg * (w.layout.level.difficulty || 1));
    }
    return true;
  }
  sys.steer(d, t.x, t.z, speed, dt);
  d.st = d.spd > C.walkSpeed * 1.2 ? DS.RUN : DS.WALK;
  return true;
}

