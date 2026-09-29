// Server-side dinosaurs: spawning, steering over the shared terrain,
// footprints, traps, damage, death + loot and respawning.
// Behaviour lives in per-species "brains" (src/sim/ai/*.js).

import { CONFIG } from '../shared/config.js';
import { EV, DS } from '../shared/protocol.js';
import { resolveCircle } from '../shared/collision.js';
import { angleDiff, clamp } from '../shared/rng.js';
import { brachioBrain } from './ai/brachio.js';
import { stegoBrain } from './ai/stego.js';
import { raptorBrain } from './ai/raptor.js';
import { pteraBrain } from './ai/ptera.js';
import { trexBrain } from './ai/trex.js';

const BRAINS = { brachio: brachioBrain, stego: stegoBrain, raptor: raptorBrain, ptera: pteraBrain, trex: trexBrain };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const TRACK_SPACING = { brachio: 1.3, stego: 1, raptor: 2.2, trex: 1.5 };
const CARCASS_TIME = 90;
const tmp = { x: 0, z: 0, hit: false };
// Big animals only collide with big obstacles (they push through bushes/small trees).
const bigColliders = (world) => ({
  circles: world.layout.colliders.circles.filter((c) => c.r > 0.9),
  boxes: world.layout.colliders.boxes,
});

export class DinoSystem {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.list = [];
    this.byId = new Map();
    this.groups = new Map();
    this.respawnQueue = [];
    this.colliders = world.layout.colliders;
    this.bigColliders = bigColliders(world);
    this.hut = world.layout.hut.campfire;
  }

  get(id) { return this.byId.get(id); }

  spawnAll() {
    for (const [type, brain] of Object.entries(BRAINS)) brain.spawnInitial?.(this);
  }

  /** Create a dinosaur. `extra` is merged into its state (group, home, ...). */
  spawn(type, x, z, extra = {}) {
    const c = CONFIG.dinos[type];
    const d = {
      id: this.world.id(),
      type,
      x, z, y: this.terrain.heightAt(x, z),
      yaw: Math.random() * Math.PI * 2,
      spd: 0,
      st: DS.IDLE,
      hp: c.health,
      maxHp: c.health,
      alive: true,
      radius: c.radius,
      fl: 0,
      stuckT: 0,
      deadT: 0,
      arrowsStuck: 0,
      trackDist: 0,
      trackSide: 0,
      home: { x, z },
      timer: 0,
      ...extra,
    };
    this.list.push(d);
    this.byId.set(d.id, d);
    BRAINS[type].init?.(d, this);
    this.world.event(EV.DINO_ADD, { dino: this.describe(d) });
    return d;
  }

  remove(d) {
    this.list.splice(this.list.indexOf(d), 1);
    this.byId.delete(d.id);
    this.world.event(EV.DINO_REMOVE, { id: d.id });
  }

  describe(d) {
    return { id: d.id, type: d.type, x: r2(d.x), y: r2(d.y), z: r2(d.z), yaw: r3(d.yaw), st: d.st, hp: Math.ceil(d.hp), maxHp: d.maxHp, alive: d.alive, fl: d.fl };
  }

  describeAll() { return this.list.map((d) => this.describe(d)); }

  snapshotRows() {
    return this.list.map((d) => [d.id, r2(d.x), r2(d.y), r2(d.z), r3(d.yaw), d.st, Math.ceil(d.hp), r2(d.spd), d.fl]);
  }

  forgetPlayer(id) {
    for (const d of this.list) if (d.targetId === id) d.targetId = null;
  }

  // ------------------------------------------------------------------ helpers for brains

  players() { return this.world.players.values(); }

  /** Nearest living player within `radius` (optionally filtered). */
  nearestPlayer(d, radius, filter = null) {
    let best = null, bd = radius * radius;
    for (const p of this.world.players.values()) {
      if (!p.alive || (filter && !filter(p))) continue;
      const q = (p.x - d.x) ** 2 + (p.z - d.z) ** 2;
      if (q < bd) { bd = q; best = p; }
    }
    return best;
  }

  distTo(d, x, z) { return Math.hypot(x - d.x, z - d.z); }

  nearestBait(d, radius) {
    let best = null, bd = radius * radius;
    for (const b of this.world.baits.values()) {
      if (b.eatenBy && b.eatenBy !== d.id) continue;
      const q = (b.x - d.x) ** 2 + (b.z - d.z) ** 2;
      if (q < bd) { bd = q; best = b; }
    }
    return best;
  }

  eatBait(b) {
    this.world.baits.delete(b.id);
    this.world.event(EV.BAIT_REMOVE, { id: b.id });
  }

  /** Is this spot fine for a land animal? Keeps dinosaurs out of water, cliffs and the hut clearing. */
  walkable(x, z, d) {
    const t = this.terrain;
    if (t.waterDepthAt(x, z) > (d.type === 'brachio' ? 1.2 : 0.35)) return false;
    if (t.slopeAt(x, z) > (d.type === 'raptor' ? 0.95 : 0.8)) return false;
    const safe = CONFIG.player.hutHealRadius + 10;
    if ((x - this.hut.x) ** 2 + (z - this.hut.z) ** 2 < safe * safe) return false;
    return Math.abs(x) < CONFIG.world.size / 2 - 20 && Math.abs(z) < CONFIG.world.size / 2 - 20;
  }

  /** Turn toward (tx, tz) and walk at `speed`, avoiding unwalkable ground. Returns remaining distance. */
  steer(d, tx, tz, speed, dt, turnRate = CONFIG.dinos[d.type].turnRate) {
    const dx = tx - d.x, dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    this.turnTo(d, desired, dt, turnRate);
    // slow down while turning hard
    const off = Math.abs(angleDiff(d.yaw, desired));
    const want = speed * clamp(1.2 - off / 1.6, 0.25, 1);
    this.move(d, want, dt);
    return dist;
  }

  turnTo(d, desired, dt, turnRate = CONFIG.dinos[d.type].turnRate) {
    const diff = angleDiff(d.yaw, desired);
    d.yaw += clamp(diff, -turnRate * dt, turnRate * dt);
  }

  /** Move forward along the current yaw at (smoothly approached) speed `want`. */
  move(d, want, dt, accel = 4) {
    d.spd += clamp(want - d.spd, -accel * 2 * dt, accel * dt);
    if (d.spd < 0.01) { d.spd = 0; return; }
    const step = d.spd * dt;
    let fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
    const look = Math.max(2, d.radius * 1.5);
    if (!this.walkable(d.x + fx * look, d.z + fz * look, d)) {
      // probe left/right for a way around
      let found = false;
      for (const a of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
        const yy = d.yaw + a * (d.avoidSide || 1);
        const px = d.x - Math.sin(yy) * look, pz = d.z - Math.cos(yy) * look;
        if (this.walkable(px, pz, d)) {
          d.yaw += clamp(a, -3 * dt, 3 * dt) * (d.avoidSide || 1);
          found = true;
          break;
        }
      }
      if (!found) { d.spd *= 0.5; d.yaw += 2 * dt; return; }
      fx = -Math.sin(d.yaw); fz = -Math.cos(d.yaw);
    }
    let nx = d.x + fx * step, nz = d.z + fz * step;
    if (!this.walkable(nx, nz, d)) { d.spd *= 0.5; return; }
    const cols = d.radius > 1.5 ? this.bigColliders : this.colliders;
    resolveCircle(nx, nz, Math.min(d.radius * 0.6, 1.8), cols, tmp);
    if (tmp.hit) {
      nx = tmp.x; nz = tmp.z;
      if (!d.avoidSide) d.avoidSide = Math.random() < 0.5 ? 1 : -1;
    }
    // keep a little personal space from other dinosaurs
    for (const o of this.list) {
      if (o === d || !o.alive || o.type === 'ptera') continue;
      const ox = nx - o.x, oz = nz - o.z;
      const min = (d.radius + o.radius) * 0.7;
      const q = ox * ox + oz * oz;
      if (q < min * min && q > 1e-4) {
        const k = (min - Math.sqrt(q)) / Math.sqrt(q) * 0.5;
        nx += ox * k; nz += oz * k;
      }
    }
    const moved = Math.hypot(nx - d.x, nz - d.z);
    d.x = nx; d.z = nz;
    d.trackDist += moved;
  }

  /** Stand still (decelerate). */
  halt(d, dt) { this.move(d, 0, dt); }

  /** Damage a player from a dinosaur attack with knockback away from the dinosaur. */
  attackPlayer(d, p, dmg, knock = 6, down = 0) {
    const dx = p.x - d.x, dz = p.z - d.z;
    const l = Math.hypot(dx, dz) || 1;
    this.world.event(EV.ATTACK, { id: d.id, target: p.id });
    this.world.hurtPlayer(p, dmg, { kx: (dx / l) * knock, kz: (dz / l) * knock, down, src: d.type });
  }

  roar(d) { this.world.event(EV.ROAR, { id: d.id }); }

  randomWalkablePoint(d, cx, cz, radius, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.walkable(x, z, d)) return { x, z };
    }
    return { x: d.home.x, z: d.home.z };
  }

  /** A point `dist` meters away from (fx, fz), walkable, as straight-away as possible. */
  fleePoint(d, fx, fz, dist) {
    const base = Math.atan2(d.x - fx, d.z - fz);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3]) {
      const a = base + off;
      const x = d.x + Math.sin(a) * dist, z = d.z + Math.cos(a) * dist;
      if (this.walkable(x, z, d) && this.walkable((x + d.x) / 2, (z + d.z) / 2, d)) return { x, z };
    }
    return this.randomWalkablePoint(d, d.home.x, d.home.z, 40);
  }

  // ------------------------------------------------------------------ combat

  damage(d, amount, zone, byId, weapon) {
    if (!d.alive) return;
    const Z = CONFIG.hitZones;
    let mult = Z[zone] ?? 1;
    const hitZone = zone in Z ? zone : 'body';
    const dmg = amount * mult;
    d.hp -= dmg;
    this.world.event(EV.DINO_HIT, { id: d.id, zone: hitZone, dmg: Math.round(dmg), by: byId, weak: mult > 1.2, armor: mult < 0.5 });
    BRAINS[d.type].onHurt?.(d, this, byId, dmg, weapon);
    if (d.hp <= 0) this.kill(d, byId);
  }

  kill(d, byId) {
    d.alive = false;
    d.hp = 0;
    d.st = DS.DEAD;
    d.spd = 0;
    d.deadT = CARCASS_TIME;
    if (d.type === 'ptera') {
      // falls to the ground
      d.y = this.terrain.heightAt(d.x, d.z);
    }
    const c = CONFIG.dinos[d.type];
    const loot = { ...c.loot };
    if (d.carryingMeat) loot.meat = (loot.meat || 0) + 1;
    this.world.dropLoot(d.x, d.z, loot, d.arrowsStuck);
    d.arrowsStuck = 0;
    const killer = this.world.players.get(byId);
    this.world.event(EV.DINO_DIE, { id: d.id, by: byId });
    this.world.toast(`${killer ? killer.name : 'The team'} brought down a ${c.name}!`, 'dino');
    this.world.mission.onDinoKilled(d);
    this.respawnQueue.push({ type: d.type, at: this.world.now + c.respawn, group: d.group });
  }

  // ------------------------------------------------------------------ tick

  update(dt) {
    const w = this.world;
    const T = CONFIG.tracks;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      if (!d.alive) {
        d.deadT -= dt;
        if (d.deadT <= 0) this.remove(d);
        continue;
      }
      if (d.stuckT > 0) {
        d.stuckT -= dt;
        d.st = DS.TRAPPED;
        d.spd = 0;
        d.fl |= 4;
        if (d.stuckT <= 0) {
          d.fl &= ~4;
          if (d.trap) {
            w.traps.delete(d.trap);
            w.event(EV.TRAP_REMOVE, { id: d.trap });
            d.trap = null;
          }
        }
      } else {
        BRAINS[d.type].update(d, this, dt);
      }

      if (d.type !== 'ptera' || d.grounded) d.y = this.terrain.heightAt(d.x, d.z);

      // footprints
      const sp = TRACK_SPACING[d.type];
      if (sp && d.trackDist > T.spacing * sp) {
        d.trackDist = 0;
        d.trackSide ^= 1;
        const s = d.trackSide ? 1 : -1;
        const off = d.radius * 0.35;
        w.addTrack(d.x + Math.cos(d.yaw) * off * s, d.z - Math.sin(d.yaw) * off * s, d.yaw, d.trackSide, d.type);
      }

      // traps
      if (d.stuckT <= 0 && (d.type !== 'ptera' || d.grounded)) {
        for (const tr of w.traps.values()) {
          if (tr.sprung) continue;
          const R = CONFIG.weapons.trap.triggerRadius + d.radius * 0.4;
          if ((tr.x - d.x) ** 2 + (tr.z - d.z) ** 2 < R * R) {
            tr.sprung = true;
            d.trap = tr.id;
            d.stuckT = CONFIG.weapons.trap.holdTime * (d.type === 'trex' ? 0.4 : d.type === 'brachio' ? 0.8 : 1);
            w.event(EV.TRAP_SNAP, { id: tr.id, dino: d.id });
            w.toast(`A ${CONFIG.dinos[d.type].name} is caught in a trap!`, 'trap');
            this.damage(d, CONFIG.weapons.trap.damage, 'leg', tr.owner, 'trap');
            break;
          }
        }
      }
    }
    // respawns
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      if (w.now < r.at) continue;
      this.respawnQueue.splice(i, 1);
      BRAINS[r.type].respawn?.(this, r);
    }
  }
}
