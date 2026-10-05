// Server-side dinosaurs: spawning, steering over the shared terrain,
// footprints, traps, damage, death + loot and respawning.
// Behaviour lives in per-species "brains" (src/sim/ai/*.js).

import { CONFIG } from '../shared/config.js';
import { EV, DS } from '../shared/protocol.js';
import { XP_BY_TYPE } from '../shared/skills.js';
import { resolveCircle, segmentColliders, penetration } from '../shared/collision.js';
import { dinoBodyCircles } from '../shared/dinoContact.js';
import { angleDiff, clamp } from '../shared/rng.js';
import { insideGrove } from '../shared/grove.js';
import { insideBossArena } from '../shared/bossArena.js';
import { insideSwampArena } from '../shared/swampArena.js';
import { brachioBrain } from './ai/brachio.js';
import { stegoBrain } from './ai/stego.js';
import { raptorBrain } from './ai/raptor.js';
import { pteraBrain } from './ai/ptera.js';
import { trexBrain } from './ai/trex.js';
import { sarcosuchusBrain, sarcoGroundHeight } from './ai/sarcosuchus.js';
import { raiderStep } from './raids.js';
import { findPath } from './pathfind.js';

const BRAINS = { brachio: brachioBrain, stego: stegoBrain, raptor: raptorBrain, ptera: pteraBrain, trex: trexBrain, 'alpha-sarcosuchus': sarcosuchusBrain };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const TRACK_SPACING = { brachio: 1.3, stego: 1, raptor: 2.2, trex: 1.5 };
const CARCASS_TIME = 90;
const tmp = { x: 0, z: 0, hit: false };
const push = { x: 0, z: 0, hit: false };
/** Obstacles lower than this are stepped over (a T-Rex strides over a knee-high rock, a raptor does not). */
const radiusOf = (d) => d.radius ?? CONFIG.dinos[d.type].radius;
const stepOver = (d) => Math.max(0.2, Math.min(1.2, radiusOf(d) * 0.35));
/** Stuck safety net: seconds of wanting to move without getting anywhere before a nudge. */
const NUDGE_INSIDE = 2;     // standing inside a collider / on ground it can't stand on
const NUDGE_BLOCKED = 6;    // blocked on free ground (goal unreachable)
const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k / 8) * Math.PI * 2);
/** Detours around a blocked straight line (see #detour): when, how often, how big, how long. */
const DETOUR = { after: 0.8, stall: 4, retry: 2, nodes: 1500, keep: 20, regoal: 10 };
/** Steepest ground an animal walks UP (raiders scramble up steeper ground to reach a base on high ground). */
export const climbSlope = (d) => (d.raid ? 1.25 : d.type === 'raptor' ? 0.95 : 0.8);

export class DinoSystem {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.list = [];
    this.byId = new Map();
    this.groups = new Map();
    this.respawnQueue = [];
    this.colliders = world.layout.colliders;
    // harder islands: tougher and harder-hitting dinosaurs
    const diff = world.layout.level.difficulty;
    this.hpMul = Math.pow(diff, 0.85);
    this.dmgMul = 1 + (diff - 1) * 0.6;
  }

  get(id) { return this.byId.get(id); }

  spawnAll() {
    for (const [type, brain] of Object.entries(BRAINS)) brain.spawnInitial?.(this);
  }

  /** Create a dinosaur. `extra` is merged into its state (group, home, ...). */
  spawn(type, x, z, extra = {}) {
    const c = CONFIG.dinos[type];
    // never spawn inside a tree, in water or on a cliff: search outward in a
    // spiral for the nearest spot where the whole body fits and it can walk off
    let yaw = Math.random() * Math.PI * 2;
    if (type !== 'ptera') {
      const probe = { type, radius: extra.radius ?? c.radius, scale: extra.scale, leash: extra.leash };
      const spot = this.findFreeSpot(probe, x, z, { yaw, maxDist: extra.leash ? extra.leash.r + 1 : 50 });
      if (spot) { x = spot.x; z = spot.z; yaw = spot.yaw; }
    }
    const d = {
      id: this.world.id(),
      type,
      x, z, y: this.terrain.heightAt(x, z),
      yaw,
      spd: 0,
      st: DS.IDLE,
      hp: Math.round(c.health * this.hpMul),
      maxHp: Math.round(c.health * this.hpMul),
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
    this.world.spottedDinos.delete(d.id);
    this.world.event(EV.DINO_REMOVE, { id: d.id });
  }

  describe(d) {
    const desc = { id: d.id, type: d.type, x: r2(d.x), y: r2(d.y), z: r2(d.z), yaw: r3(d.yaw), st: d.st, hp: Math.ceil(d.hp), maxHp: d.maxHp, alive: d.alive, fl: d.fl };
    if (d.scale) desc.sc = d.scale;       // oversized animal (the grove's titan)
    if (d.title) desc.name = d.title;
    if (d.butchered) desc.bu = 1;          // carved up with the knife
    if (d.type === 'alpha-sarcosuchus') desc.phase = d.phase ? { ...d.phase } : null;
    return desc;
  }

  describeAll() { return this.list.map((d) => this.describe(d)); }

  /** @param {((d:object)=>boolean)|null} [include] only these dinosaurs (default: all) */
  snapshotRows(include = null) {
    const rows = [];
    for (const d of this.list) {
      if (include && !include(d)) continue;
      const row = [d.id, r2(d.x), r2(d.y), r2(d.z), r3(d.yaw), d.st, Math.ceil(d.hp), r2(d.spd), d.fl];
      if (d.type === 'alpha-sarcosuchus') row.push(d.phase?.clip ?? null, d.phase?.started ?? null, d.phase?.duration ?? null, d.phaseSeq ?? 0);
      rows.push(row);
    }
    return rows;
  }

  /** Remember recent poses for lag-compensated hit checks (poseAt). Once per tick. */
  recordHistory(now) {
    const keep = CONFIG.net.lagCompMax + 0.15;
    for (const d of this.list) {
      const h = (d.hist ??= []);
      h.push({ t: now, x: d.x, y: d.y, z: d.z, yaw: d.yaw });
      while (now - h[0].t > keep) h.shift();
    }
  }

  /** Pose of `d` at server time t, interpolated from the history (current pose when t is not covered). */
  poseAt(d, t) {
    const h = d.hist;
    if (!h?.length || t >= h[h.length - 1].t) return { x: d.x, y: d.y, z: d.z, yaw: d.yaw };
    if (t <= h[0].t) return h[0];
    let i = h.length - 1;
    while (h[i - 1].t > t) i--;
    const a = h[i - 1], b = h[i];
    const k = (t - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + angleDiff(a.yaw, b.yaw) * k };
  }

  forgetPlayer(id) {
    for (const d of this.list) if (d.targetId === id) d.targetId = null;
  }

  // ------------------------------------------------------------------ helpers for brains

  players() { return this.world.players.values(); }

  /** Nearest living player within `radius` (optionally filtered); Stalker shrinks the radius per player. */
  nearestPlayer(d, radius, filter = null) {
    let best = null, bd = radius * radius;
    for (const p of this.world.players.values()) {
      if (!p.alive || (filter && !filter(p))) continue;
      const q = (p.x - d.x) ** 2 + (p.z - d.z) ** 2;
      const reach = radius * p.mods.stalkerMul;
      if (q < bd && q < reach * reach) { bd = q; best = p; }
    }
    return best;
  }

  distTo(d, x, z) { return Math.hypot(x - d.x, z - d.z); }

  /**
   * Is this spot fine for a land animal? Keeps dinosaurs out of water, cliffs and the hut clearing.
   * `downhill`: the animal is heading down to this spot. Then steep ground is fine (it runs down a
   * mountain wall instead of standing on the rim staring at a player below); only climbing up
   * steep ground is limited. Without it the spot itself must be gentle (spawns, goals).
   */
  walkable(x, z, d, downhill = false) {
    const t = this.terrain;
    // the grove's titan never leaves its pen (no part of its body crosses the
    // stones; its centre is held by the leash in move()); everyone else stays out
    if (d.leash) {
      if ((x - d.leash.x) ** 2 + (z - d.leash.z) ** 2 > d.leash.bound * d.leash.bound) return false;
    } else if (insideGrove(this.world.layout, x, z, 3) || insideBossArena(this.world.layout, x, z, 4)) {
      // everyone else stays off the boss arena's islet (the titan's home)
      return false;
    }
    const sarco = d.type === 'alpha-sarcosuchus';
    if (t.waterDepthAt(x, z) > (sarco ? 6 : d.type === 'brachio' ? 1.2 : 0.35)) return false;
    if (sarco && t.seaDepthAt(x, z) > CONFIG.player.maxWadeDepth) return false;
    // the heightfield is continuous, so there is no wall too steep to run down (move() slows the
    // descent to an along-the-surface speed); one shut in a pit below scrambles out (#detour)
    if (!downhill && t.slopeAt(x, z) > climbSlope(d) && !(d.scrambleUntil > this.world.now) && !(sarco && t.waterDepthAt(x, z) > 0.5)) return false;
    if (t.lavaLevelAt(x, z) !== null) return false;
    // the hut / the team's base (shared/base.js safeZone): dinosaurs keep out
    const zone = this.world.safeZone();
    if (zone && !d.raid && (x - zone.x) ** 2 + (z - zone.z) ** 2 < (zone.r + 10) ** 2) return false;
    return Math.abs(x) < CONFIG.world.size / 2 - 20 && Math.abs(z) < CONFIG.world.size / 2 - 20;
  }

  /** Turn toward (tx, tz) and walk at `speed`, avoiding unwalkable ground. Returns remaining distance. */
  steer(d, tx, tz, speed, dt, turnRate = CONFIG.dinos[d.type].turnRate) {
    const dist = Math.hypot(tx - d.x, tz - d.z);
    // straight line blocked (a wall it can't climb, a ridge in the way): follow a planned detour
    const wp = this.#detour(d, tx, tz);
    const dx = wp.x - d.x, dz = wp.z - d.z;
    const desired = Math.atan2(-dx, -dz);
    this.turnTo(d, desired, dt, turnRate);
    // slow down while turning hard
    const off = Math.abs(angleDiff(d.yaw, desired));
    const want = speed * clamp(1.2 - off / 1.6, 0.25, 1);
    this.move(d, want, dt);
    return dist;
  }

  /**
   * Where to head for goal (tx, tz): the goal itself, or the next waypoint of a detour planned
   * (sim/pathfind.js, steep walls downhill only) once the straight approach has been blocked
   * for a moment - e.g. a raptor on a ledge whose direct line to the player below runs up a
   * bump first. Searches are small and rate-limited per animal (20 Hz server tick).
   */
  #detour(d, tx, tz) {
    const now = this.world.now;
    let r = d.route;
    // the goal moved away from the planned one (a running player), or the plan is stale: drop it
    if (r && (now > r.until || Math.hypot(tx - r.gx, tz - r.gz) > DETOUR.regoal)) r = d.route = null;
    // getting no closer although it walks (sliding along the foot of a wall it can't climb)
    const dist = Math.hypot(tx - d.x, tz - d.z);
    const a = d.approach;
    if (!a || Math.hypot(tx - a.gx, tz - a.gz) > DETOUR.regoal || dist < a.best - 1) d.approach = { gx: tx, gz: tz, best: dist, at: now };
    const stalled = now - d.approach.at > DETOUR.stall;
    // blocked or stalled (again, also on a planned way): plan from here. One search per tick for
    // all animals together keeps failed searches (~5-15 ms each) from piling up in one tick
    if (((d.blockedT || 0) > DETOUR.after || stalled) && now >= (d.routeAt ?? 0) && this.searchedAt !== now) {
      d.approach.at = now;
      this.searchedAt = now;
      d.routeAt = now + DETOUR.retry * (1 + Math.random());
      const reach = Math.max(3, radiusOf(d) * 1.5), info = {};
      // every cell a waypoint: the straight line between far-apart cells can cut over a steep corner
      let pts = findPath(this, d, d.x, d.z, tx, tz, reach, DETOUR.nodes, { every: 1, info });
      if (!pts && info.closed && !(d.scrambleUntil > now)) {
        // shut in a pit it ran down into, with no gentle way out: let it scramble up the wall
        // (walkable) along a planned way instead of pacing at the bottom forever
        d.scrambleUntil = now + DETOUR.keep;
        pts = findPath(this, d, d.x, d.z, tx, tz, reach, DETOUR.nodes, { every: 1 });
        if (!pts) d.scrambleUntil = 0;
      }
      r = d.route = pts && pts.length > 1 ? { pts, i: 1, gx: tx, gz: tz, until: now + DETOUR.keep } : null;
    }
    if (!r) return { x: tx, z: tz };
    // next waypoint not yet reached (the last one leads straight on to the goal)
    const near = Math.max(2.5, radiusOf(d));
    while (r.i < r.pts.length && Math.hypot(r.pts[r.i].x - d.x, r.pts[r.i].z - d.z) < near) r.i++;
    if (r.i >= r.pts.length) { d.route = null; d.scrambleUntil = 0; return { x: tx, z: tz }; }
    return r.pts[r.i];
  }

  turnTo(d, desired, dt, turnRate = CONFIG.dinos[d.type].turnRate) {
    const diff = angleDiff(d.yaw, desired);
    d.yaw += clamp(diff, -turnRate * dt, turnRate * dt);
  }

  /** Move forward along the current yaw at (smoothly approached) speed `want`. */
  move(d, want, dt, accel = 4, lockedHeading = false) {
    d.spd += clamp(want - d.spd, -accel * 2 * dt, accel * dt);
    if (d.spd < 0.01) { d.spd = 0; return; }
    // wading through a bog (swamp) slows walkers like players (fliers never touch it)
    const step = d.spd * dt * (d.type === 'ptera' ? 1 : this.terrain.swampSpeedAt?.(d.x, d.z) ?? 1);
    let fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
    const look = Math.max(2, d.radius * 1.5);
    // downhill may be steep (see walkable). Judged over the look-ahead, not the tiny step: the
    // triangle mesh has creases where a 1 cm step goes up although the slope runs down
    const h0 = this.terrain.heightAt(d.x, d.z);
    const down = (px, pz) => this.terrain.heightAt(px, pz) < h0;
    // ground and trees ahead: the body has to fit through, otherwise look for a way around.
    // The first stride counts too: a gentle spot beyond a steep step up is no way out
    const open = (px, pz, yaw) => {
      const dn = down(px, pz), k = Math.min(1, 0.6 / look);
      return this.walkable(px, pz, d, dn) && this.walkable(d.x + (px - d.x) * k, d.z + (pz - d.z) * k, d, dn) &&
        !this.bodyBlocked(d, px, pz, yaw);
    };
    if (!open(d.x + fx * look, d.z + fz * look, d.yaw)) {
      if (lockedHeading) { d.spd *= 0.5; this.#progress(d, 0, want, dt); return; }
      // probe left/right for a way around. Turn away faster than steer() turns back to the goal,
      // or a nimble raptor just twitches at the edge of a wall it can't climb
      const avoid = (d.type === 'alpha-sarcosuchus' ? CONFIG.dinos[d.type].turnRate : Math.max(3, CONFIG.dinos[d.type].turnRate * 2)) * dt;
      let found = false;
      for (const a of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
        const yy = d.yaw + a * (d.avoidSide || 1);
        const px = d.x - Math.sin(yy) * look, pz = d.z - Math.cos(yy) * look;
        if (open(px, pz, yy)) {
          d.yaw += clamp(a, -avoid, avoid) * (d.avoidSide || 1);
          found = true;
          break;
        }
      }
      if (!found) { d.spd *= 0.5; d.yaw += 2 * dt * (d.avoidSide || 1); this.#progress(d, 0, want, dt); return; }
      fx = -Math.sin(d.yaw); fz = -Math.cos(d.yaw);
    }
    let nx = d.x + fx * step, nz = d.z + fz * step;
    // judge a full stride, not the ground under its feet: standing on a spot just over the climb
    // limit must not pin it (any tiny step there reads as "steep, uphill")
    const stride = Math.max(step, 0.6);
    if (!this.walkable(d.x + fx * stride, d.z + fz * stride, d, down(d.x + fx * look, d.z + fz * look)) || this.#pastLeash(d, nx, nz)) { d.spd *= 0.5; if (!lockedHeading) d.yaw += 1.5 * dt * (d.avoidSide || 1); this.#progress(d, 0, want, dt); return; }
    // on a steep wall the speed runs along the surface: a raptor slides down a cliff instead of
    // dropping 40 m/s (and the client's interpolation can follow)
    const drop = Math.abs(h0 - this.terrain.heightAt(nx, nz));
    let along = 1;
    if (drop > step * climbSlope(d)) {
      along = step / Math.hypot(step, drop);
      nx = d.x + fx * step * along; nz = d.z + fz * step * along;
    }
    // keep a little personal space from other dinosaurs (before the trees, so they can't push into a trunk)
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
    // trees, rocks and the hut stop the whole body, not just its centre
    if (this.resolveBody(d, nx, nz, d.yaw)) {
      nx = push.x; nz = push.z;
      if (!d.avoidSide) d.avoidSide = Math.random() < 0.5 ? 1 : -1;
    }
    const moved = Math.hypot(nx - d.x, nz - d.z);
    d.x = nx; d.z = nz;
    d.trackDist += moved;
    this.#progress(d, moved, want * along, dt);
  }

  /** Would a step to (x, z) take a leashed animal's centre further beyond its leash? */
  #pastLeash(d, x, z) {
    const L = d.leash;
    if (!L) return false;
    const dn = (x - L.x) ** 2 + (z - L.z) ** 2;
    return dn > L.r * L.r && dn > (d.x - L.x) ** 2 + (d.z - L.z) ** 2;
  }

  /** Body footprint circles (world space) of `d` standing at (x, z) facing `yaw`. */
  *bodyCircles(d, x, z, yaw) {
    yield* dinoBodyCircles(d, x, z, yaw);
  }

  /**
   * Push the body at (x, z) out of static colliders (trees, rocks, hut).
   * Result in `push`; returns true if anything was hit.
   */
  resolveBody(d, x, z, yaw) {
    const gy = this.terrain.heightAt(x, z);
    const y0 = gy + stepOver(d), y1 = gy + Math.max(1.5, d.radius);
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      // strongest push per axis over all body circles
      let px = 0, pz = 0;
      for (const [cx, cz, r] of this.bodyCircles(d, x, z, yaw)) {
        resolveCircle(cx, cz, r, this.colliders, tmp, y0, y1);
        if (!tmp.hit) continue;
        const dx = tmp.x - cx, dz = tmp.z - cz;
        if (Math.abs(dx) > Math.abs(px)) px = dx;
        if (Math.abs(dz) > Math.abs(pz)) pz = dz;
      }
      if (!px && !pz) break;
      x += px; z += pz;
      hit = true;
    }
    push.x = x; push.z = z; push.hit = hit;
    return hit;
  }

  /** Would the body (slightly slimmed, so brushing past a trunk is fine) overlap an obstacle at (x, z)? */
  bodyBlocked(d, x, z, yaw, scale = 0.85) {
    const gy = this.terrain.heightAt(x, z);
    const y0 = gy + stepOver(d), y1 = gy + Math.max(1.5, radiusOf(d));
    for (const [cx, cz, r] of this.bodyCircles(d, x, z, yaw)) {
      if (penetration(cx, cz, r * scale, this.colliders, y0, y1) > 0.01) return true;
    }
    return false;
  }

  /**
   * Can `d` stand at (x, z) facing `yaw`? Every body circle on walkable ground
   * (no water, lava or cliff under the head or tail either) and the full-size
   * body clear of trees, rocks, cave walls, ruins, the boat and the hut.
   */
  standsFree(d, x, z, yaw) {
    for (const [cx, cz] of this.bodyCircles(d, x, z, yaw)) if (!this.walkable(cx, cz, d)) return false;
    return this.walkable(x, z, d) && !this.bodyBlocked(d, x, z, yaw, 1);
  }

  /** Directions (of 8) in which `d` at (x, z) could take a few steps (what move() probes). */
  openDirections(d, x, z) {
    const look = Math.max(2, radiusOf(d) * 1.5);
    let n = 0;
    for (const a of EIGHT) {
      const px = x - Math.sin(a) * look, pz = z - Math.cos(a) * look;
      if (this.walkable(px, pz, d) && !this.bodyBlocked(d, px, pz, a)) n++;
    }
    return n;
  }

  /**
   * Nearest spot to (x, z) (spiral search) where `d` stands free and can walk
   * away (at least 2 open directions). Returns { x, z, yaw } or null.
   */
  findFreeSpot(d, x, z, { yaw = d.yaw ?? 0, minDist = 0, maxDist = 50, step = 0.8 } = {}) {
    const yaws = EIGHT.map((a) => yaw + a);
    for (let r = minDist; r <= maxDist; r += step) {
      const n = r < 1e-6 ? 1 : Math.max(6, Math.ceil((Math.PI * 2 * r) / step));
      for (let i = 0; i < n; i++) {
        const a = r * 0.37 + (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!this.walkable(px, pz, d)) continue;
        const fit = yaws.find((y) => this.standsFree(d, px, pz, y));
        if (fit === undefined || this.openDirections(d, px, pz) < 2) continue;
        return { x: px, z: pz, yaw: fit };
      }
    }
    return null;
  }

  /**
   * Safety net: an animal that has wanted to move for a while without getting
   * anywhere (wedged between trunks, in a cave wall, on a cliff) is nudged to
   * the nearest free spot and picks a new goal.
   */
  #unstick(d) {
    const blocked = d.blockedT || 0;
    if (blocked <= 0) { d.stuckAt = null; return; }
    if (!d.stuckAt) d.stuckAt = { x: d.x, z: d.z };
    if (blocked < NUDGE_INSIDE) return;
    // steep ground under its feet is fine (it got there running downhill); water, lava, a no-go zone or a trunk are not
    const inside = !this.walkable(d.x, d.z, d, true) || this.bodyBlocked(d, d.x, d.z, d.yaw);
    const wedged = blocked >= NUDGE_BLOCKED && Math.hypot(d.x - d.stuckAt.x, d.z - d.stuckAt.z) < 1.5;
    if (!inside && !wedged) return;
    // only teleport when it really can't walk off; a merely unreachable goal just gets replaced
    if (inside || this.openDirections(d, d.x, d.z) < 2) {
      const spot = this.findFreeSpot(d, d.x, d.z, { minDist: inside ? 0 : 1, maxDist: 30 });
      if (spot) { d.x = spot.x; d.z = spot.z; d.yaw = spot.yaw; d.spd = 0; }
    }
    d.blockedT = 0;
    d.flipT = 0;
    d.stuckAt = null;
    d.avoidSide = -(d.avoidSide || 1);
    d.wander = null;
    d.route = null;
    BRAINS[d.type].onStuck?.(d, this);
  }

  /**
   * Track whether the animal gets anywhere. `d.blockedT` = seconds it has been
   * wanting to move but barely moving (brains use it to give up a chase).
   */
  #progress(d, moved, want, dt) {
    if (want < 0.3) { d.blockedT = 0; return; }
    if (moved < want * dt * 0.3) {
      d.blockedT = (d.blockedT || 0) + dt;
      // try the other way round every couple of seconds
      d.flipT = (d.flipT || 0) + dt;
      if (d.flipT > 2) { d.flipT = 0; d.avoidSide = -(d.avoidSide || 1); }
    } else {
      d.blockedT = Math.max(0, (d.blockedT || 0) - dt * 2);
      d.flipT = 0;
    }
  }

  /** Stand still (decelerate). */
  halt(d, dt) { this.move(d, 0, dt); }

  /** A short lateral step with the same body collision and arena leash as forward movement. */
  strafe(d, dx, dz, speed, dt) {
    const length = Math.hypot(dx, dz) || 1, step = speed * dt;
    let nx = d.x + dx / length * step, nz = d.z + dz / length * step;
    if (!this.walkable(nx, nz, d) || this.#pastLeash(d, nx, nz) || this.bodyBlocked(d, nx, nz, d.yaw)) { d.spd = 0; return; }
    if (this.resolveBody(d, nx, nz, d.yaw)) { nx = push.x; nz = push.z; }
    const moved = Math.hypot(nx - d.x, nz - d.z);
    d.x = nx; d.z = nz; d.trackDist += moved; d.spd = moved / dt;
  }

  /** Animation cue for an attack (bite lunge, tail swing wind-up ...). */
  cue(d, target = null) {
    this.world.event(EV.ATTACK, { id: d.id, target });
  }

  /** Damage a player with knockback away from the dinosaur (no animation cue). */
  /** Is there a clear line (no trunk, rock or wall) from the animal's front to the player? */
  canReach(d, p, origin = null) {
    if (d.type === 'ptera') return true; // dives from above
    let ox = origin?.x, oz = origin?.z;
    if (!origin) {
      const body = CONFIG.dinos[d.type].body;
      const front = body ? Math.max(...body.map(([off]) => off)) : 0;
      ox = d.x - Math.sin(d.yaw) * front; oz = d.z - Math.cos(d.yaw) * front;
    }
    const y = p.y + 1;
    return segmentColliders(ox, y, oz, p.x, y, p.z, this.colliders, this.world.layout.groundAt) < 0;
  }

  /** Damage + knockback away from `origin` (default: the animal's centre; a tail uses its hip pivot). */
  hitPlayer(d, p, dmg, knock = 6, down = 0, origin = null) {
    if (!this.canReach(d, p, origin)) return; // the bite/tail hits the tree in between
    const dx = p.x - (origin?.x ?? d.x), dz = p.z - (origin?.z ?? d.z);
    const l = Math.hypot(dx, dz) || 1;
    this.world.hurtPlayer(p, dmg * this.dmgMul, { kx: (dx / l) * knock, kz: (dz / l) * knock, down,
      src: d.type, from: { id: d.id, x: r2(d.x), y: r2(d.y), z: r2(d.z) } });
  }

  /** Cue + damage in one go (quick bites). */
  attackPlayer(d, p, dmg, knock = 6, down = 0) {
    this.cue(d, p.id);
    this.hitPlayer(d, p, dmg, knock, down);
  }

  /** True if the player stands in the hut's safe zone (dinosaurs leave them alone). */
  /** Is player p in the base's safe zone (for dinosaur d – raiders ignore it)? */
  inSafeZone(p, d = null) {
    if (d?.raid) return false;
    const zone = this.world.safeZone();
    return !!zone && (p.x - zone.x) ** 2 + (p.z - zone.z) ** 2 < (zone.r + 6) ** 2;
  }

  /** Call/roar with a per-animal cooldown so re-targeting never spams sound. */
  roar(d, cooldown = 5) {
    if (this.world.now < (d.nextRoarAt ?? 0)) return;
    d.nextRoarAt = this.world.now + cooldown;
    this.world.event(EV.ROAR, { id: d.id });
  }

  randomWalkablePoint(d, cx, cz, radius, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.walkable(x, z, d) && !this.bodyBlocked(d, x, z, Math.atan2(-(x - (d.x ?? cx)), -(z - (d.z ?? cz))))) return { x, z };
    }
    const home = d.home || { x: cx, z: cz };
    return this.findFreeSpot(d, home.x, home.z, { maxDist: 30 }) || { x: home.x, z: home.z };
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
    // a raider (sim/raids.js) turns on whoever attacks it
    if (d.raid && this.world.players.has(byId)) d.raid.foe = byId;
    // Arena bosses can only be hurt from inside their own arena:
    // shots, throws and stabs from outside stop at the boundary.
    if (d.leash) {
      const p = this.world.players.get(byId);
      const inside = d.leash.kind === 'swamp' ? insideSwampArena : insideGrove;
      if (!p || !inside(this.world.layout, p.x, p.z)) return;
    }
    const Z = CONFIG.hitZones;
    const base = Z[zone] ?? 1;
    let mult = base;
    // skills (shared/skills.js): weapon/execute/sprint/bloodlust multipliers; Weak Spot scales only the bonus part of a zone
    const by = this.world.players.get(byId);
    if (by) {
      amount *= this.world.damageMul(by, d, weapon);
      if (mult > 1) mult = 1 + (mult - 1) * by.mods.weakSpotMul;
    }
    const hitZone = zone in Z ? zone : 'body';
    const dmg = amount * mult;
    d.hp -= dmg;
    this.world.event(EV.DINO_HIT, { id: d.id, zone: hitZone, dmg: Math.round(dmg), by: byId, weak: base > 1.2, armor: base < 0.5 });
    if (d.hp <= 0) this.kill(d, byId);
    else BRAINS[d.type].onHurt?.(d, this, byId, dmg, weapon);
  }

  kill(d, byId) {
    d.alive = false;
    d.hp = 0;
    d.st = DS.DEAD;
    if (d.type === 'alpha-sarcosuchus') { d.phase = null; d.phaseSeq = (d.phaseSeq ?? 0) + 1; }
    d.spd = 0;
    d.deadT = CARCASS_TIME;
    if (d.type === 'ptera') {
      // Preserve position and flight momentum; the dead-body tick handles gravity.
      d.grounded = d.y <= this.terrain.heightAt(d.x, d.z);
      d.vx = d.vx || 0; d.vy = d.vy || 0; d.vz = d.vz || 0;
    }
    if (d.type !== 'ptera' || d.grounded) this.dropCarcassLoot(d);
    const c = CONFIG.dinos[d.type];
    const killer = this.world.players.get(byId);
    this.world.event(EV.DINO_DIE, { id: d.id, by: byId });
    this.world.toast(`${killer ? killer.name : 'The team'} brought down a ${c.name}!`, 'dino');
    this.world.mission.onDinoKilled(d);
    this.world.awardXp(XP_BY_TYPE[d.type] ?? 0, c.name);   // every player, raid dinos included
    if (killer) this.world.onPlayerKill(killer);
    if (!d.raid && !d.boss) this.respawnQueue.push({ type: d.type, at: this.world.now + c.respawn, group: d.group });
  }

  dropCarcassLoot(d) {
    if (d.lootDropped) return;
    d.lootDropped = true;
    const c = CONFIG.dinos[d.type];
    const loot = { ...c.loot };
    if (d.carryingMeat) loot.meat = (loot.meat || 0) + 1;
    this.world.dropLoot(d.x, d.z, loot, d.arrowsStuck);
    d.arrowsStuck = 0;
  }

  // ------------------------------------------------------------------ tick

  update(dt) {
    const w = this.world;
    const T = CONFIG.tracks;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      if (!d.alive) {
        if (d.type === 'alpha-sarcosuchus') {
          const ground = this.terrain.heightAt(d.x, d.z), water = this.terrain.waterLevelAt(d.x, d.z);
          const surface = water === null ? ground : Math.max(ground, water - 0.8);
          // Preserve the lethal-hit pose and settle slowly: no snap into the mud
          // when a surfaced or submerged boss becomes a floating carcass.
          d.y = Math.max(ground, d.y + clamp(surface - d.y, -0.45 * dt, 0.45 * dt));
          d.swimOffset = d.y - ground;
        }
        if (d.type === 'ptera' && !d.grounded) {
          d.x += d.vx * dt;
          d.z += d.vz * dt;
          d.y += d.vy * dt - CONFIG.player.gravity * dt * dt * 0.5;
          d.vy -= CONFIG.player.gravity * dt;
          const drag = Math.exp(-0.6 * dt);
          d.vx *= drag; d.vz *= drag;
          const ground = this.terrain.heightAt(d.x, d.z);
          if (d.y <= ground) {
            d.y = ground;
            d.vx = d.vy = d.vz = 0;
            d.grounded = true;
            this.dropCarcassLoot(d);
          }
        }
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
        // raiders (sim/raids.js) go for the base; pterosaur raiders keep their brain
        if (!(d.raid && raiderStep(this, d, dt))) BRAINS[d.type].update(d, this, dt);
        // turning on the spot can swing the body into a trunk: push it back out
        if (d.type !== 'ptera' && this.resolveBody(d, d.x, d.z, d.yaw)) { d.x = push.x; d.z = push.z; }
        if (d.type !== 'ptera') this.#unstick(d);
        // hard leash: whatever pushed it (other animals, the unstuck nudge), it stays in its pen
        if (d.leash) {
          const dx = d.x - d.leash.x, dz = d.z - d.leash.z, l = Math.hypot(dx, dz);
          if (l > d.leash.r) { d.x = d.leash.x + (dx / l) * d.leash.r; d.z = d.leash.z + (dz / l) * d.leash.r; }
        }
      }

      if (d.type === 'alpha-sarcosuchus') {
        d.y = sarcoGroundHeight(d, this.terrain);
        d.swimOffset = d.y - this.terrain.heightAt(d.x, d.z);
      } else if (d.type !== 'ptera' || d.grounded) d.y = this.terrain.heightAt(d.x, d.z);

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
            w.mission.onTrapCatch();
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
