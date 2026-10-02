// Authoritative world simulation. Pure JavaScript, no Node or browser APIs,
// so it runs both inside the Node.js server and in-page for solo play.
//
// The host (server/index.js or client/net/localHost.js) calls:
//   join(name) -> { ok, id, reason }
//   leave(id)
//   receive(id, msg)
//   step(dt)            at CONFIG.net.tickRate
//   snapshot()          at CONFIG.net.snapshotRate (the host broadcasts it)
// and provides send(to, msg) where `to` is a player id or '*' (everyone).

import { gunInventory, gunAction, updateGunReload } from './firearms.js';
import { CONFIG } from '../shared/config.js';
import { Terrain } from '../shared/terrain.js';
import { buildLayout } from '../shared/layout.js';
import { MSG, ACT, EV, EQUIP } from '../shared/protocol.js';
import { DinoSystem } from './dinos.js';
import { Mission } from './mission.js';
import { resolveCircle } from '../shared/collision.js';
import { resolveDinoContact, DINO_CONTACT, dinoBodyCircles } from '../shared/dinoContact.js';
import { makeRng } from '../shared/rng.js';
import { lineBlocked } from '../shared/visibility.js';
import { sanitizeOutfit, sameOutfit } from '../shared/outfits.js';
import { planIsland } from '../shared/island.js';
import { levelDef, LEVEL_COUNT } from '../shared/levels.js';
import { findUnstuckSpot, goodSpot } from './unstuck.js';
import { nearDino, plausibleZone } from './hitCheck.js';
import { insideGrove, mayEnterGrove } from '../shared/grove.js';
import { RECIPE_BY_ID, upgradeMods, unlockIsland, canAfford } from '../shared/crafting.js';

const P = CONFIG.player;
const W = CONFIG.weapons;
const LOOT_KEYS = Object.keys(CONFIG.loot);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const validVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
const collisionResult = { x: 0, z: 0, hit: false };
/** Seconds between two successful unstuck moves of one player. */
const UNSTUCK_COOLDOWN = 5;
// Distance reserve for state packets (~0.55 s of sprint): absorbs bunched
// packets after a lag spike; the 11 m/s refill still caps the average speed.
const MOVE_RESERVE = 6;
// The client resolves dinosaur contact against interpolated (slightly older)
// positions, the server against current ones. Push-outs below this are applied
// silently instead of snapping the player back.
const DINO_PUSH_TOLERANCE = 0.5;

export class ServerWorld {
  /**
   * @param {{ send:(to:number|'*', msg:object, except?:number)=>void, log?:(...a:any[])=>void }} host
   * @param {{ level?: number, variant?: number }} [opts] start island (variant = random layout seed)
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.log = host.log || (() => {});
    this.now = 0;
    this.players = new Map();
    this.nextId = 1;
    this.store = Object.fromEntries(LOOT_KEYS.map((k) => [k, 0]));
    this.upgrades = new Set();          // team upgrades built at the workbench (survive islands)
    this.fruitRng = makeRng((Math.random() * 0xffffffff) >>> 0);
    this.#loadLevel(opts.level ?? 0, opts.variant);
    this.mission = new Mission(this);
    this.dinos.spawnAll();
  }

  /** Build the island for `level` (everything that belongs to one island). */
  #loadLevel(level, variant = 1 + Math.floor(Math.random() * 1e6)) {
    this.levelIndex = level;
    this.variant = variant;
    this.terrain = new Terrain(planIsland(level, variant));
    this.layout = buildLayout(this.terrain);
    this.items = new Map();
    this.traps = new Map();
    this.baits = new Map();
    this.projectiles = new Map();
    this.tracks = [];
    this.fruit = this.layout.fruitSpots.map((s) => ({ spot: s.id, count: this.rollFruitCount(), regrowAt: 0 }));
    this.spottedDinos = new Set();
    this.relics = this.layout.relics.map((r) => ({ ...r, found: false, byName: null }));
    this.dinos = new DinoSystem(this);
    this.log(`island ${level + 1} "${levelDef(level).name}" variant ${variant}`);
  }

  /** The team set sail: build the next island (after the last one: a fresh first island). */
  nextLevel() {
    this.#loadLevel(this.levelIndex + 1 < LEVEL_COUNT ? this.levelIndex + 1 : 0);
    this.mission.startIsland();
    this.dinos.spawnAll();
    const caps = this.caps();
    for (const p of this.players.values()) {
      const sp = this.layout.spawnPoints[p.slot];
      Object.assign(p, {
        x: sp.x, y: this.terrain.heightAt(sp.x, sp.z), z: sp.z, yaw: sp.yaw, pitch: 0, spd: 0,
        hp: P.maxHealth, alive: true, deadT: 0, eating: null, hot: null,
        lastMoveAt: this.now, moveBudget: 3.5, epoch: p.epoch + 1,
      });
      p.inv.arrows = caps.arrows;
      p.inv.arrowUses = Array(caps.arrows).fill(W.bow.uses);
      p.inv.traps = Math.max(p.inv.traps, caps.traps);
      p.inv.baits = Math.max(p.inv.baits, caps.baits);
      p.inv.spear = true;
      p.inv.spearHealth = W.spear.durability;
      p.inv.guns = gunInventory(); p.inv.reloading = null;
      p.inv.caps = caps;
      p.inv.upgrades = [...this.upgrades];
    }
    for (const p of this.players.values()) {
      this.send(p.id, { t: MSG.WELCOME, id: p.id, slot: p.slot, now: r3(this.now), k: p.epoch, inv: p.inv, world: this.fullState() });
    }
  }

  id() { return this.nextId++; }
  rollFruitCount() { return 1 + Math.floor(this.fruitRng() * 4); }

  send(to, msg) { this.host.send(to, msg); }
  broadcast(msg, except) { this.host.send('*', msg, except); }
  event(e, data, except) { this.broadcast({ t: MSG.EV, e, ...data }, except); }
  toast(text, icon = 'info', to = '*') { this.send(to, { t: MSG.EV, e: EV.TOAST, text, icon }); }

  // ------------------------------------------------------------------ players

  /** @param {(id:number)=>void} [attach] called with the new id before the welcome is sent */
  join(name, attach, outfit) {
    if (this.players.size >= CONFIG.net.maxPlayers) return { ok: false, reason: 'The expedition is full (4 players max).' };
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const clean = String(name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14) || `Player ${slot + 1}`;
    const sp = this.layout.spawnPoints[slot];
    const p = {
      id: this.id(),
      slot,
      name: clean,
      outfit: sanitizeOutfit(outfit, slot),
      x: sp.x, y: this.terrain.heightAt(sp.x, sp.z), z: sp.z,
      yaw: sp.yaw, pitch: 0, spd: 0, eq: 0, fl: 0,
      hp: P.maxHealth,
      alive: true,
      deadT: 0,
      eating: null,
      hot: null,
      inv: this.freshInventory(),
      lastInput: this.now,
      lastMoveAt: this.now,
      moveBudget: 3.5,
      epoch: 0,              // bumped by every correction/teleport (see correct())
      lastSeq: -1,           // newest state packet seen (`s`)
      knockBudgetUntil: 0,
      creative: false,       // invincible, may fly (toggled by the player)
      nextMeleeAt: 0,
      nextFireAt: 0,
    };
    this.players.set(p.id, p);
    p.inv.caps = this.caps();
    p.inv.upgrades = [...this.upgrades];
    attach?.(p.id);
    this.send(p.id, {
      t: MSG.WELCOME,
      id: p.id,
      slot,
      now: r3(this.now),
      inv: p.inv,
      world: this.fullState(),
    });
    this.event(EV.PLAYER_JOIN, { player: this.publicPlayer(p) }, p.id);
    this.toast(`${p.name} joined the expedition`, 'team');
    this.log(`join #${p.id} "${p.name}" slot ${slot} (${this.players.size} players)`);
    return { ok: true, id: p.id };
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.event(EV.PLAYER_LEAVE, { id });
    this.toast(`${p.name} left the expedition`, 'team');
    this.dinos.forgetPlayer(id);
    this.log(`leave #${id} "${p.name}" (${this.players.size} players)`);
  }

  freshInventory() {
    return {
      guns: gunInventory(), reloading: null,
      arrows: W.bow.startArrows,
      arrowUses: Array(W.bow.startArrows).fill(W.bow.uses),
      spear: true,
      spearHealth: W.spear.durability,
      traps: W.trap.startCount,
      baits: W.bait.startCount,
      fruit: [],
      loot: Object.fromEntries(LOOT_KEYS.map((k) => [k, 0])),
    };
  }

  publicPlayer(p) {
    return { id: p.id, slot: p.slot, name: p.name, outfit: p.outfit, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r3(p.yaw), hp: Math.ceil(p.hp), alive: p.alive };
  }

  sendInv(p) {
    p.inv.caps = this.caps();
    p.inv.upgrades = [...this.upgrades];
    this.send(p.id, { t: MSG.INV, inv: p.inv });
  }

  /** Effects of the team's workbench upgrades. */
  mods() { return upgradeMods(this.upgrades); }

  /** Inventory limits: config base values plus team upgrades from contracts and the workbench. */
  caps() {
    const b = this.mission ? this.mission.bonus() : { arrows: 0, fruit: 0, carry: 0, traps: 0, baits: 0 };
    const u = this.mods();
    return {
      arrows: W.bow.maxArrows + b.arrows + u.quiver,
      fruit: CONFIG.fruit.maxCarried + b.fruit,
      carry: P.maxCarryWeight + b.carry,
      traps: W.trap.startCount + b.traps + u.traps,
      baits: W.bait.startCount + b.baits,
    };
  }

  /** A contract reward changed the limits: tell every player. */
  onCapsChanged() {
    for (const p of this.players.values()) this.sendInv(p);
  }

  /** Throttled "your pack is full" alert (auto-looting retries often). */
  fullAlert(p, text, icon) {
    if (this.now < (p.nextFullAlert ?? 0)) return;
    p.nextFullAlert = this.now + 3;
    this.send(p.id, { t: MSG.EV, e: EV.FULL, text, icon });
  }

  carryWeight(p) {
    let w = 0;
    for (const k of LOOT_KEYS) w += p.inv.loot[k] * CONFIG.loot[k].weight;
    return w;
  }

  hurtPlayer(p, dmg, { kx = 0, kz = 0, down = 0, src = null, from = null } = {}) {
    if (!p.alive || dmg <= 0 || p.creative) return;
    p.hp = Math.max(0, p.hp - dmg);
    if (p.eating) p.eating = null;   // getting hit interrupts eating
    this.stopButcher(p);             // ... and butchering
    // A dinosaur's knockback can briefly exceed normal sprint speed.
    if (kx || kz) {
      p.knockBudgetUntil = this.now + 1;
      p.moveBudget = Math.max(p.moveBudget, Math.min(7, Math.hypot(kx, kz) * 0.5));
    }
    this.event(EV.HURT, { id: p.id, dmg: Math.round(dmg), hp: Math.ceil(p.hp), kx: r2(kx), kz: r2(kz), down, src, from });
    if (p.hp <= 0) this.killPlayer(p, src);
  }

  // ------------------------------------------------------------------ knife

  /** How far `p` is from the nearest part of carcass `d` (0 = touching). */
  carcassDistance(p, d) {
    let best = Infinity;
    for (const [x, z, r] of dinoBodyCircles(d)) best = Math.min(best, Math.hypot(p.x - x, p.z - z) - r);
    return Math.max(0, best);
  }

  /** Hold V at a carcass: starts butchering (finished in updateButcher). */
  startButcher(p, id) {
    const d = this.dinos.get(id);
    const K = W.knife;
    // a carcass on the ground (fallen pterosaurs only once they landed), not yet butchered
    if (!p.alive || p.eating || p.butcher || !d || d.alive || d.butchered || !d.lootDropped) return;
    if (this.carcassDistance(p, d) > K.reach + P.radius || Math.abs(p.y - d.y) > 4 * (d.scale || 1)) return;
    const time = CONFIG.dinos[d.type].butcher.time;
    p.butcher = { dino: d.id, until: this.now + time, x: p.x, z: p.z };
    d.deadT = Math.max(d.deadT, time + 2);   // the carcass stays until it is done
    this.event(EV.BUTCHER, { id: p.id, dino: d.id, t: time });
  }

  stopButcher(p) {
    if (!p.butcher) return;
    p.butcher = null;
    this.event(EV.BUTCHER, { id: p.id, dino: null, t: 0 });
  }

  updateButcher(p) {
    const b = p.butcher;
    const d = this.dinos.get(b.dino);
    if (!p.alive || !d || d.butchered || Math.hypot(p.x - b.x, p.z - b.z) > W.knife.moveCancel) return this.stopButcher(p);
    if (this.now < b.until) return;
    p.butcher = null;
    d.butchered = true;
    d.deadT = Math.min(d.deadT, W.knife.sinkTime);
    const { loot } = CONFIG.dinos[d.type].butcher;
    this.dropLoot(d.x, d.z, loot);
    this.event(EV.BUTCHER, { id: p.id, dino: null, t: 0 });
    this.event(EV.BUTCHERED, { id: d.id });
    const parts = Object.entries(loot).map(([k, n]) => `${n} ${CONFIG.loot[k].name.toLowerCase()}`).join(', ');
    this.toast(`${p.name} butchered the ${CONFIG.dinos[d.type].name}: ${parts}`, 'bones');
  }

  killPlayer(p, src) {
    p.butcher = null;
    p.alive = false;
    p.deadT = P.respawnDelay;
    p.eating = null;
    p.hot = null;
    // Carried loot and fruit are lost.
    const lostMeat = p.inv.loot.meat;
    for (const k of LOOT_KEYS) p.inv.loot[k] = 0;
    p.inv.fruit = [];
    this.sendInv(p);
    this.event(EV.DEATH, { id: p.id, by: src });
    this.toast(`${p.name} was defeated${lostMeat ? ' – the carried loot is lost' : ''}!`, 'skull');
  }

  respawnPlayer(p) {
    const sp = this.layout.spawnPoints[p.slot];
    p.alive = true;
    p.hp = P.maxHealth;
    p.x = sp.x; p.z = sp.z; p.y = this.terrain.heightAt(sp.x, sp.z);
    p.yaw = sp.yaw;
    p.lastMoveAt = this.now;
    p.moveBudget = 3.5;
    p.knockBudgetUntil = 0;
    p.inv.arrows = Math.max(p.inv.arrows, W.bow.startArrows);
    this.normalizeArrows(p.inv);
    if (!p.inv.spear) p.inv.spearHealth = W.spear.durability;
    p.inv.spear = true;
    p.inv.guns = gunInventory(); p.inv.reloading = null;
    this.sendInv(p);
    p.epoch++;
    this.event(EV.RESPAWN, { id: p.id, x: r2(p.x), z: r2(p.z), yaw: p.yaw, k: p.epoch });
  }

  // ------------------------------------------------------------------ messages

  receive(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    p.lastInput = this.now;
    switch (msg.t) {
      case MSG.STATE: return this.onState(p, msg);
      case MSG.ACT: return this.onAct(p, msg);
      case MSG.PING: return this.send(id, { t: MSG.PONG, c: msg.c, now: r3(this.now) });
    }
  }

  /**
   * Tell a client where it really is. Bumps the player's correction epoch, so
   * state packets it sent before receiving this (still based on the old
   * position) are ignored instead of being rejected one by one.
   */
  correct(p, extra) {
    p.epoch++;
    this.send(p.id, { t: MSG.CORRECT, x: r2(p.x), y: r2(p.y), z: r2(p.z), k: p.epoch, ...extra });
  }

  onState(p, m) {
    if (!p.alive) return;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    // stale (sent before the last correction/teleport) or overtaken (unreliable transport)
    if (num(m.k, p.epoch) < p.epoch) return;
    if (Number.isFinite(m.s)) {
      if (m.s <= p.lastSeq) return;
      p.lastSeq = m.s;
    }
    const previous = { x: p.x, y: p.y, z: p.z };
    const x = num(m.x, p.x), z = num(m.z, p.z);
    const y = num(m.y, p.y);
    // A small distance reserve accommodates packet bunching without allowing
    // repeated state packets to move faster than the player's sprint.
    const creative = p.creative;
    p.moveBudget = Math.min(creative ? 10 : this.now < p.knockBudgetUntil ? 7 : MOVE_RESERVE,
      p.moveBudget + Math.max(0, this.now - p.lastMoveAt) * (creative ? P.creative.flySpeed + 4 : 11));
    p.lastMoveAt = this.now;
    const distance = Math.hypot(x - p.x, z - p.z);
    const lim = CONFIG.world.size / 2 - 5;
    const ground = this.layout.groundAt(x, z, y + P.stepHeight);
    resolveCircle(x, z, P.radius, this.layout.playerColliders, collisionResult, y + 0.05, y + P.height, P.stepHeight - 0.05);
    const blocked = Math.hypot(collisionResult.x - x, collisionResult.z - z) > 0.6 || this.groveBlocks(p, x, z);
    if (distance > p.moveBudget + 0.05 || Math.abs(x) > lim || Math.abs(z) > lim ||
        !Number.isFinite(ground) || y < ground - 2 || y > ground + (creative ? P.creative.maxHeight + 5 : 20) ||
        // rivers and lakes may be swum; only the open sea is off-limits
        (!creative && this.terrain.seaDepthAt(x, z) > CONFIG.world.maxWadeDepth + 0.2) || blocked) {
      this.correct(p);
      return;
    }
    p.moveBudget -= distance;
    p.x = x; p.z = z; p.y = y;
    p.yaw = num(m.yaw, p.yaw);
    p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, num(m.pitch, p.pitch)));
    p.spd = Math.max(0, Math.min(20, num(m.spd, 0)));
    p.eq = Math.max(0, Math.min(EQUIP.length - 1, m.eq | 0));
    p.fl = (m.fl | 0) & 63;
    this.resolvePlayerDinos(p, previous);
  }

  resolvePlayerDinos(p, previous = p) {
    if (!p.alive || p.creative) return;
    const result = resolveDinoContact(previous, p, this.dinos.list, this.layout.playerColliders, (d, nx, nz) => {
      if (this.now < (p.nextDinoContactAt ?? 0)) return;
      p.nextDinoContactAt = this.now + DINO_CONTACT.cooldown;
      this.hurtPlayer(p, DINO_CONTACT.damage, { kx: nx * DINO_CONTACT.knockback, kz: nz * DINO_CONTACT.knockback,
        src: d.type, from: { id: d.id, x: d.x, y: d.y, z: d.z } });
    });
    const shift = Math.hypot(result.x - p.x, result.z - p.z);
    if (shift > 0.005) {
      p.x = result.x; p.z = result.z;
      p.y = Math.max(p.y, this.layout.groundAt(p.x, p.z, p.y + P.stepHeight));
      if (shift > DINO_PUSH_TOLERANCE) this.correct(p);
    }
  }

  /**
   * Move a stuck player to the nearest spot they can stand on and walk away
   * from (see sim/unstuck.js); the hut spawn point when nothing is near.
   * Automatic requests from a player who isn't actually stuck are ignored;
   * a manual request (U key) then still nudges them a little.
   */
  unstuck(p, manual) {
    if (!p.alive) return;
    if (this.now < (p.nextUnstuckAt ?? 0)) {
      if (manual) this.toast('Hang on – you can use "unstuck" again in a moment', 'info', p.id);
      return;
    }
    const fine = goodSpot(this.terrain, this.layout, p.x, p.z) !== null;
    if (fine && !manual) return;
    let spot = findUnstuckSpot(this.terrain, this.layout, p.x, p.z, { minDist: fine ? 1.5 : 0 });
    if (!spot) {
      const sp = this.layout.spawnPoints[p.slot] || this.layout.spawnPoints[0];
      spot = { x: sp.x, y: this.layout.groundAt(sp.x, sp.z), z: sp.z };
    }
    p.nextUnstuckAt = this.now + UNSTUCK_COOLDOWN;
    p.x = spot.x; p.y = spot.y; p.z = spot.z;
    p.lastMoveAt = this.now;
    p.moveBudget = 3.5;
    this.correct(p, { unstuck: 1 });
    this.toast('Unstuck!', 'info', p.id);
    this.log(`unstuck #${p.id} ${manual ? '(manual)' : '(auto)'} -> ${r2(p.x)}, ${r2(p.z)}`);
  }

  /**
   * The Primeval Grove's barrier: a step that ends inside the grove and doesn't
   * lead further out is refused unless the player may enter (mayEnterGrove –
   * TODO(grove-unlock): becomes the skill check). Walking out always works.
   */
  groveBlocks(p, x, z) {
    const g = this.layout.grove;
    if (!g || mayEnterGrove(p) || !insideGrove(this.layout, x, z, P.radius)) return false;
    return dist2(x, z, g.x, g.z) <= dist2(p.x, p.z, g.x, g.z);
  }

  near(p, x, z, range) { return dist2(p.x, p.z, x, z) <= range * range; }

  canSpotDino(p, d) {
    const dx = d.x - p.x, dz = d.z - p.z;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal > 110) return false;
    const eyeY = p.y + P.eyeHeight;
    const targetY = d.y + (d.type === 'brachio' ? 5 : d.type === 'trex' ? 2.5 : 1);
    const dy = targetY - eyeY;
    const distance = Math.hypot(horizontal, dy);
    if (distance > 115) return false;
    const forward = (-dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)) / Math.max(horizontal, 0.001);
    if (forward < 0.45 || Math.abs(Math.atan2(dy, horizontal) - p.pitch) > 0.7) return false;
    return !lineBlocked({ x: p.x, y: eyeY, z: p.z }, { x: d.x, y: targetY, z: d.z }, this.terrain, this.layout);
  }

  onAct(p, m) {
    const inv = p.inv;
    switch (m.a) {
      case ACT.CREATIVE: {
        const on = !!m.on;
        if (on === !!p.creative) return;
        p.creative = on;
        if (on && p.alive) p.hp = P.maxHealth;
        this.toast(`${p.name} ${on ? 'switched to' : 'left'} creative mode`, 'bolt');
        return;
      }
      case ACT.SPOT: {
        if (!p.alive || !Number.isSafeInteger(m.dino) || this.spottedDinos.has(m.dino)) return;
        const d = this.dinos.get(m.dino);
        if (!d || !d.alive || !this.canSpotDino(p, d)) return;
        this.spottedDinos.add(d.id);
        this.event(EV.SPOT, { id: d.id, type: d.type, by: p.id });
        return;
      }
      case ACT.SHOT:
      case ACT.RELOAD: return gunAction(this, p, m);
      case ACT.MELEE: {
        if (!p.alive || p.eating || !inv.spear || this.now < p.nextMeleeAt) return;
        const d = this.dinos.get(m.dino);
        if (!d || !d.alive) return;
        if (!validVec(m.p)) return;
        const pose = this.hitPose(d, m.rt);
        if (!this.validMeleeHit(p, d, m.p, pose)) return;
        p.nextMeleeAt = this.now + W.spear.cooldown;
        this.dinos.damage(d, W.spear.damage * (1 + this.mods().spearDamage), plausibleZone(d, pose, m.p, m.zone), p.id, 'spear');
        inv.spearHealth = Math.max(0, (inv.spearHealth ?? W.spear.durability) - W.spear.useWear);
        if (!inv.spearHealth) { inv.spear = false; this.toast('Your spear broke - refill at the hut', 'spear', p.id); }
        this.sendInv(p);
        return;
      }
      case ACT.FIRE: {
        if (!p.alive || p.eating || this.now < p.nextFireAt) return;
        const kind = m.kind === 'spear' ? 'spear' : 'arrow';
        if (!Number.isSafeInteger(m.pid) || m.pid < 0 || !validVec(m.o) || !validVec(m.v)) return;
        if (this.projectiles.has(`${p.id}:${m.pid}`)) return;
        const originDistance = Math.hypot(m.o[0] - p.x, m.o[2] - p.z);
        const speed = Math.hypot(...m.v);
        const u = this.mods();
        const maxSpeed = kind === 'spear' ? W.spear.throwSpeed * (1 + u.throwSpeed) + 5 : W.bow.maxSpeed + u.bowSpeed + 5;
        if (originDistance > 2.5 || Math.abs(m.o[1] - (p.y + P.eyeHeight)) > 2.5 ||
            speed < 5 || speed > maxSpeed) return;
        let health;
        if (kind === 'arrow') {
          if (inv.arrows <= 0) return;
          this.normalizeArrows(inv);
          health = inv.arrowUses.shift() - 1;
          inv.arrows--;
        } else {
          if (!inv.spear) return;
          health = Math.max(0, (inv.spearHealth ?? W.spear.durability) - W.spear.useWear);
          inv.spear = false;
          inv.spearHealth = 0;
        }
        p.nextFireAt = this.now + (kind === 'spear' ? W.spear.throwCooldown * (1 + u.throwCooldown) : W.bow.cooldown);
        this.projectiles.set(`${p.id}:${m.pid}`, { kind, health, t: this.now, pw: Math.max(0, Math.min(1, Number(m.pw) || 0)), o: m.o.slice(), v: m.v.slice() });
        this.sendInv(p);
        this.event(EV.FIRE, { by: p.id, kind, o: m.o, v: m.v, pid: m.pid }, p.id);
        return;
      }
      case ACT.LAND: {
        const key = `${p.id}:${m.pid}`;
        const proj = this.projectiles.get(key);
        if (!proj) return;
        if (!validVec(m.p) || !this.validProjectileLanding(proj, m.p)) return;
        const [x, y, z] = m.p;
        const d = m.dino != null ? this.dinos.get(m.dino) : null;
        if (d && d.alive) {
          // lag compensation: the dinosaur where the shooter saw it when the projectile hit
          const pose = this.hitPose(d, m.rt);
          if (!nearDino(d, pose, m.p, 4)) return;
          const zone = plausibleZone(d, pose, m.p, m.zone);
          this.projectiles.delete(key);
          if (proj.health > 0) {
            const item = this.spawnItem(proj.kind, x, z, 1, y, proj.health, false);
            const dx = x - pose.x, dz = z - pose.z, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
            item.dino = d.id;
            item.offset = [dx * c - dz * s, y - pose.y, dx * s + dz * c];
            item.direction = proj.v.slice();
            // Bone coordinates only affect rendering; pickup positions come from the validated hit.
            if (m.attach && Number.isInteger(m.attach.joint) && m.attach.joint >= 0 && m.attach.joint < 100 &&
                validVec(m.attach.p) && Math.hypot(...m.attach.p) < 25 &&
                Array.isArray(m.attach.q) && m.attach.q.length === 4 && m.attach.q.every(Number.isFinite) &&
                (!m.attach.s || (validVec(m.attach.s) && m.attach.s.every(n => n > 0 && n < 100)))) {
              item.attach = { joint: m.attach.joint, p: m.attach.p.slice(), q: m.attach.q.slice(), ...(m.attach.s ? { s: m.attach.s.slice() } : {}) };
            }
            this.event(EV.ITEM_ADD, { item });
          }
          if (proj.kind === 'arrow') {
            const dmg = W.bow.damage * (1 + this.mods().bowDamage) * (0.45 + 0.55 * Math.min(1, proj.pw));
            this.dinos.damage(d, dmg, zone, p.id, 'arrow');
          } else {
            this.dinos.damage(d, W.spear.throwDamage * (1 + this.mods().spearDamage), zone, p.id, 'spear');
          }
          return;
        }
        // nothing from outside comes to rest inside the grove (it couldn't be picked up)
        if (insideGrove(this.layout, x, z, 1) && !insideGrove(this.layout, p.x, p.z)) return;
        this.projectiles.delete(key);
        const ground = this.layout.groundAt(x, z);
        if (proj.health > 0 && y >= ground - 0.2 && y <= ground + 20) {
          const item = this.spawnItem(proj.kind, x, z, 1, y, proj.health, false);
          if (m.pose && validVec(m.pose.p) && Math.hypot(m.pose.p[0] - x, m.pose.p[1] - y, m.pose.p[2] - z) < 2 &&
              Array.isArray(m.pose.q) && m.pose.q.length === 4 && m.pose.q.every(Number.isFinite)) item.pose = { p: m.pose.p.slice(), q: m.pose.q.slice() };
          this.event(EV.ITEM_ADD, { item });
        }
        return;
      }
      case ACT.PICKUP: {
        if (!p.alive) return;
        const it = this.items.get(m.item);
        if (it?.dino) this.updateAttachedItem(it);
        if (!it) return;
        const corpse = it.dino && this.dinos.get(it.dino);
        const groundedCorpse = corpse && !corpse.alive && (corpse.type !== 'ptera' || corpse.grounded);
        // The server has body coordinates rather than render bones. A collapsed carcass
        // can rotate a hit point around the body, so retrieve across its occupied area.
        const extraReach = groundedCorpse ? corpse.radius + 4 * (corpse.scale || 1) : 0;
        if (!this.near(p, it.x, it.z, CONFIG.pickupRange + 1.5 + extraReach)) return;
        const pickupY = groundedCorpse ? this.layout.groundAt(it.x, it.z) + 1 : it.y;
        if ((it.dino || it.pose) && Math.abs(pickupY - (p.y + P.eyeHeight)) > 3.5) return;
        const caps = this.caps();
        if (it.kind === 'arrow') {
          if (inv.arrows >= caps.arrows) return this.fullAlert(p, 'Your quiver is full', 'arrow');
          this.normalizeArrows(inv);
          const take = Math.min(caps.arrows - inv.arrows, it.n);
          inv.arrowUses.push(...Array(take).fill(it.health ?? W.bow.uses));
          inv.arrows += take;
          if (take < it.n) {
            it.n -= take;
            this.event(EV.ITEM_REMOVE, { id: it.id });
            this.event(EV.ITEM_ADD, { item: it });
            this.sendInv(p); return;
          }
        } else if (it.kind === 'spear') {
          if (inv.spear) return;
          inv.spear = true;
          inv.spearHealth = it.health ?? W.spear.durability;
        } else if (CONFIG.loot[it.kind]) {
          const weight = CONFIG.loot[it.kind].weight * it.n;
          if (this.carryWeight(p) + weight > caps.carry + 1e-6) {
            return this.fullAlert(p, `Your pack is full (${this.carryWeight(p)}/${caps.carry}) – drop off loot at the hut`, 'weight');
          }
          inv.loot[it.kind] += it.n;
          this.toast(`${CONFIG.loot[it.kind].name} +${it.n}`, it.kind, p.id);
        } else return;
        this.removeItem(it.id, p.id);
        this.sendInv(p);
        this.mission.onLootChanged();
        return;
      }
      case ACT.HARVEST: {
        if (!p.alive) return;
        const f = this.fruit[m.spot | 0];
        const spot = this.layout.fruitSpots[m.spot | 0];
        if (!f || !spot || f.count <= 0 || !this.near(p, spot.x, spot.z, P.interactRange + 2)) return;
        const maxFruit = this.caps().fruit;
        if (inv.fruit.length >= maxFruit) return this.fullAlert(p, `Your fruit pouch is full (${maxFruit})`, 'fruit');
        inv.fruit.push(spot.type);
        f.count--;
        if (f.count === 0) f.regrowAt = this.now + CONFIG.fruit.types[spot.type].regrow;
        this.event(EV.FRUIT, { spot: spot.id, count: f.count });
        this.toast(`${CONFIG.fruit.types[spot.type].name} +1`, spot.type, p.id);
        this.sendInv(p);
        this.mission.onFruitPicked();
        return;
      }
      case ACT.EAT: {
        if (!p.alive || p.eating || inv.fruit.length === 0) return;
        let idx = m.fruit ? inv.fruit.indexOf(m.fruit) : -1;
        if (idx < 0) idx = this.bestFruitIndex(p);
        const type = inv.fruit[idx];
        inv.fruit.splice(idx, 1);
        p.eating = { type, t: CONFIG.fruit.eatTime };
        this.sendInv(p);
        this.event(EV.EAT, { id: p.id, fruit: type });
        return;
      }
      case ACT.GIVE: {
        if (!p.alive || inv.fruit.length === 0) return;
        const q = this.players.get(m.to);
        if (!q || !q.alive || q === p || !this.near(p, q.x, q.z, P.giveRange + 1.5)) return;
        if (q.inv.fruit.length >= this.caps().fruit) return this.toast(`${q.name} can't carry more fruit`, 'fruit', p.id);
        // give the fruit that heals the most if they're hurt, else the first
        const idx = this.bestFruitIndex(p);
        const type = inv.fruit.splice(idx, 1)[0];
        q.inv.fruit.push(type);
        this.sendInv(p);
        this.sendInv(q);
        this.toast(`You gave ${q.name} a ${CONFIG.fruit.types[type].name}`, type, p.id);
        this.toast(`${p.name} gave you a ${CONFIG.fruit.types[type].name}`, type, q.id);
        return;
      }
      case ACT.TRAP: {
        if (!p.alive || inv.traps <= 0) return;
        const x = Number(m.x), z = Number(m.z);
        if (!Number.isFinite(x) || !this.near(p, x, z, 6)) return;
        if (this.traps.size >= W.trap.maxActive) return this.toast('Too many traps set already', 'trap', p.id);
        inv.traps--;
        const trap = { id: this.id(), x: r2(x), z: r2(z), y: r2(this.terrain.heightAt(x, z)), yaw: r3(Number(m.yaw) || 0), owner: p.id, sprung: false, t: this.now };
        this.traps.set(trap.id, trap);
        this.sendInv(p);
        this.event(EV.TRAP_ADD, { trap });
        return;
      }
      case ACT.BAIT: {
        if (!p.alive || inv.baits <= 0) return;
        const x = Number(m.x), z = Number(m.z);
        if (!Number.isFinite(x) || !this.near(p, x, z, 6)) return;
        inv.baits--;
        const bait = { id: this.id(), x: r2(x), z: r2(z), y: r2(this.terrain.heightAt(x, z)), expires: this.now + W.bait.lifetime, eatenBy: null };
        this.baits.set(bait.id, bait);
        this.sendInv(p);
        this.event(EV.BAIT_ADD, { bait: { id: bait.id, x: bait.x, y: bait.y, z: bait.z } });
        return;
      }
      case ACT.DEPOSIT: {
        const h = this.layout.hut.dropOff;
        if (!p.alive || !this.near(p, h.x, h.z, 6)) return;
        let total = 0;
        const parts = [];
        for (const k of LOOT_KEYS) {
          const n = inv.loot[k];
          if (!n) continue;
          this.store[k] += n;
          this.mission.onDeposit(k, n);
          total += n;
          parts.push(`${n} ${CONFIG.loot[k].name.toLowerCase()}`);
          inv.loot[k] = 0;
        }
        if (!total) return this.toast('You carry no loot to drop off', 'crate', p.id);
        this.sendInv(p);
        this.event(EV.STORE, { store: this.store });
        this.toast(`${p.name} dropped off ${parts.join(', ')}`, 'crate');
        this.mission.onLootChanged();
        return;
      }
      case ACT.OUTFIT: {
        const wd = this.layout.hut.wardrobe;
        if (!this.near(p, wd.x, wd.z, 6)) return;
        const outfit = sanitizeOutfit(m.outfit, p.slot);
        if (sameOutfit(outfit, p.outfit)) return;
        p.outfit = outfit;
        this.event(EV.OUTFIT, { id: p.id, outfit });
        return;
      }
      case ACT.REPAIR: {
        const b = this.layout.boat;
        if (!p.alive || !this.near(p, b.x, b.z, 9)) return;
        const reason = this.mission.repair(p);
        if (reason) this.toast(reason, 'crate', p.id);
        return;
      }
      case ACT.UNSTUCK: return this.unstuck(p, !!m.manual);
      case ACT.BUTCHER: return m.stop ? this.stopButcher(p) : this.startButcher(p, m.dino);
      case ACT.REFILL: {
        const h = this.layout.hut.arrowRack;
        if (!p.alive || !this.near(p, h.x, h.z, 6)) return;
        // free basic resupply only; everything else is crafted (ACT.CRAFT)
        inv.arrows = Math.max(inv.arrows, Math.min(W.bow.startArrows, this.caps().arrows));
        this.normalizeArrows(inv);
        if (!inv.spear) inv.spearHealth = W.spear.durability;
        inv.spear = true;
        inv.guns = gunInventory(); inv.reloading = null;
        this.sendInv(p);
        this.toast('Basic ammunition resupplied', 'arrow', p.id);
        return;
      }
      case ACT.CRAFT: return this.craft(p, m.recipe);
    }
  }

  /** Craft a supply or a team upgrade from the hut store at the workbench. */
  craft(p, id) {
    const h = this.layout.hut.arrowRack;
    const r = RECIPE_BY_ID[id];
    if (!r || !p.alive || !this.near(p, h.x, h.z, 6)) return;
    const inv = p.inv;
    const deny = (text) => this.toast(text, 'crate', p.id);
    if (unlockIsland(r) > this.levelIndex + 1) return deny(`${r.name} unlocks on island ${unlockIsland(r)}`);
    if (r.kind === 'upgrade') {
      if (this.upgrades.has(r.id)) return deny(`${r.name} is already built`);
      if (r.requires && !this.upgrades.has(r.requires)) return deny(`Build ${RECIPE_BY_ID[r.requires].name} first`);
    } else {
      const caps = this.caps();
      if (r.give.arrows && inv.arrows >= caps.arrows) return deny('Your quiver is full');
      if (r.give.traps && inv.traps >= caps.traps) return deny('You carry as many traps as you can');
      if (r.give.baits && inv.baits >= caps.baits) return deny('You carry as much bait as you can');
      if (r.give.spear && inv.spear) return deny('You still have your spear');
    }
    if (!canAfford(r, this.store)) return deny('Not enough loot in the hut store');
    for (const [k, n] of Object.entries(r.cost)) this.store[k] -= n;
    if (r.kind === 'upgrade') {
      this.upgrades.add(r.id);
      this.toast(`${p.name} built: ${r.name}!`, 'quest');
      this.onCapsChanged();
    } else {
      const caps = this.caps();
      if (r.give.arrows) { inv.arrows = Math.min(caps.arrows, inv.arrows + r.give.arrows); this.normalizeArrows(inv); }
      if (r.give.traps) inv.traps = Math.min(caps.traps, inv.traps + r.give.traps);
      if (r.give.baits) inv.baits = Math.min(caps.baits, inv.baits + r.give.baits);
      if (r.give.spear) { inv.spear = true; inv.spearHealth = W.spear.durability; }
      this.sendInv(p);
      this.toast(`Crafted: ${r.name}`, 'crate', p.id);
    }
    this.event(EV.STORE, { store: this.store });
  }

  /** pose: where the attacker saw the dinosaur (hitPose); default its current position. */
  validMeleeHit(p, d, point, pose = d) {
    const [x, y, z] = point;
    const vx = x - p.x, vy = y - p.y - P.eyeHeight, vz = z - p.z;
    const distance = Math.hypot(vx, vy, vz);
    if (distance > W.spear.range + 0.8 || distance < 0.1) return false;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch);
    const fy = Math.sin(p.pitch);
    const fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    if ((vx * fx + vy * fy + vz * fz) / distance < 0.4) return false;
    return nearDino(d, pose, point, 3);
  }

  validProjectileLanding(proj, point) {
    const [x, y, z] = point;
    const [ox, oy, oz] = proj.o;
    const [vx, vy, vz] = proj.v;
    const horizontalSpeed = Math.hypot(vx, vz);
    if (horizontalSpeed < 1) return false;
    const flight = Math.hypot(x - ox, z - oz) / horizontalSpeed;
    if (flight > 8.5 || flight > this.now - proj.t + 0.4) return false;
    const expectedX = ox + vx * flight, expectedZ = oz + vz * flight;
    const gravity = proj.kind === 'spear' ? W.spear.throwGravity : W.bow.arrowGravity;
    const expectedY = oy + vy * flight - gravity * flight * flight / 2;
    return Math.hypot(x - expectedX, z - expectedZ) < 2.5 && Math.abs(y - expectedY) < 3.5;
  }

  bestFruitIndex(p) {
    const f = p.inv.fruit;
    const missing = P.maxHealth - p.hp;
    // eat the smallest fruit that covers the missing health, else the biggest
    let best = -1, bestHeal = Infinity, biggest = 0, biggestHeal = -1;
    f.forEach((t, i) => {
      const h = CONFIG.fruit.types[t].heal;
      if (h >= missing && h < bestHeal) { best = i; bestHeal = h; }
      if (h > biggestHeal) { biggest = i; biggestHeal = h; }
    });
    return best >= 0 ? best : biggest;
  }

  // ------------------------------------------------------------------ items

  normalizeArrows(inv) {
    inv.arrowUses ??= [];
    inv.arrowUses.length = Math.min(inv.arrowUses.length, inv.arrows);
    while (inv.arrowUses.length < inv.arrows) inv.arrowUses.push(W.bow.uses);
    // Use worn arrows first so their three-shot lifetime is visible to the player.
    inv.arrowUses.sort((a, b) => a - b);
  }

  updateAttachedItem(it) {
    const d = this.dinos.get(it.dino);
    if (!d) {
      delete it.dino; delete it.attach;
      it.y = this.layout.groundAt(it.x, it.z) + 0.05;
      this.event(EV.ITEM_REMOVE, { id: it.id });
      this.event(EV.ITEM_ADD, { item: it });
      return;
    }
    const [x, y, z] = it.offset, c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    it.x = r2(d.x + x * c + z * s); it.y = r2(d.y + y); it.z = r2(d.z - x * s + z * c);
  }

  spawnItem(kind, x, z, n = 1, y = null, health = null, publish = true) {
    const lim = CONFIG.world.size / 2 - 2;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    const ground = this.layout.groundAt(x, z);
    const it = { id: this.id(), kind, n, x: r2(x), y: r2(y == null ? ground : Math.max(ground, Math.min(y, ground + 3))), z: r2(z), t: this.now };
    if (!publish && y != null) it.y = r2(y); // an airborne target's hit point
    if (kind === 'arrow' || kind === 'spear') it.health = health ?? (kind === 'arrow' ? W.bow.uses : W.spear.durability);
    this.items.set(it.id, it);
    if (publish) this.event(EV.ITEM_ADD, { item: it });
    return it;
  }

  removeItem(id, by = null) {
    if (!this.items.delete(id)) return;
    this.event(EV.ITEM_REMOVE, { id, by });
  }

  /** Drop loot around a position (dinosaur carcass). */
  dropLoot(x, z, loot, arrows = 0) {
    const entries = Object.entries(loot).filter(([, n]) => n > 0);
    let i = 0;
    const total = entries.reduce((s, [, n]) => s + n, 0) + (arrows ? 1 : 0);
    for (const [kind, n] of entries) {
      for (let k = 0; k < n; k++) {
        const a = (i / Math.max(1, total)) * Math.PI * 2 + 0.3;
        const r = 2.2 + (i % 3) * 0.9;
        this.spawnItem(kind, x + Math.cos(a) * r, z + Math.sin(a) * r, 1);
        i++;
      }
    }
    if (arrows > 0) this.spawnItem('arrow', x + 1, z - 1, arrows);
  }

  addTrack(x, z, yaw, side, type) {
    const tr = { x: r2(x), z: r2(z), yaw: r3(yaw), side, type, t: this.now };
    this.tracks.push(tr);
    if (this.tracks.length > 400) this.tracks.shift();
    this.event(EV.TRACK, tr);
  }

  // ------------------------------------------------------------------ tick

  step(dt) {
    this.now += dt;
    const F = CONFIG.fruit;

    for (const p of this.players.values()) {
      updateGunReload(this, p);
      if (p.butcher) this.updateButcher(p);
      if (!p.alive) {
        p.deadT -= dt;
        if (p.deadT <= 0) this.respawnPlayer(p);
        continue;
      }
      // eating
      if (p.eating) {
        p.eating.t -= dt;
        if (p.eating.t <= 0) {
          const ft = F.types[p.eating.type];
          p.hp = Math.min(P.maxHealth, p.hp + ft.heal);
          if (ft.hot > 0) p.hot = { rate: ft.hot / ft.hotTime, t: ft.hotTime };
          p.eating = null;
        }
      }
      if (p.hot) {
        p.hp = Math.min(P.maxHealth, p.hp + p.hot.rate * dt);
        p.hot.t -= dt;
        if (p.hot.t <= 0) p.hot = null;
      }
      // lava burns (and sets you back on your feet only if you get out)
      const lava = this.terrain.lavaLevelAt(p.x, p.z);
      if (lava !== null && p.y < lava + 0.6 && !p.creative) {
        p.lavaT = (p.lavaT ?? 0.4) + dt;
        if (p.lavaT >= 0.4) {
          p.lavaT = 0;
          this.hurtPlayer(p, 14, { src: 'lava' });
          if (!p.alive) continue;
        }
      } else p.lavaT = 0.4;             // the first touch burns right away
      // boat parts: walk up to one to pick it up for the team
      for (const r of this.relics) {
        if (r.found || (r.x - p.x) ** 2 + (r.z - p.z) ** 2 > 2.4 * 2.4 || Math.abs(r.y - p.y) > 3) continue;
        r.found = true;
        r.byName = p.name;
        this.event(EV.RELIC, { id: r.id, kind: r.kind, by: p.id });
        this.mission.onRelicFound(r, p);
      }
      // the hut is a safe, healing place
      const c = this.layout.hut.campfire;
      if (p.hp < P.maxHealth && this.near(p, c.x, c.z, P.hutHealRadius)) {
        p.hp = Math.min(P.maxHealth, p.hp + P.hutHealPerSecond * dt);
      }
    }

    // fruit regrowth
    for (const f of this.fruit) {
      if (f.count === 0 && this.now >= f.regrowAt) {
        f.count = this.rollFruitCount();
        this.event(EV.FRUIT, { spot: f.spot, count: f.count });
      }
    }
    // stale items
    for (const it of this.items.values()) {
      if (it.dino) this.updateAttachedItem(it);
      const life = it.kind === 'arrow' ? W.bow.arrowLifetime * 3 : it.kind === 'spear' ? Infinity : CONFIG.lootDespawn;
      if (this.now - it.t > life) this.removeItem(it.id);
    }
    // bait expiry
    for (const b of this.baits.values()) {
      if (this.now > b.expires) {
        this.baits.delete(b.id);
        this.event(EV.BAIT_REMOVE, { id: b.id });
      }
    }
    // forgotten projectiles
    for (const [k, pr] of this.projectiles) if (this.now - pr.t > 20) this.projectiles.delete(k);
    // old tracks
    while (this.tracks.length && this.now - this.tracks[0].t > CONFIG.tracks.lifetime) this.tracks.shift();

    this.dinos.update(dt);
    this.dinos.recordHistory(this.now);
    for (const p of this.players.values()) this.resolvePlayerDinos(p);
    this.mission.update(dt);
  }

  /**
   * Hosts call this once per step(dt): true when a snapshot is due. Keeps
   * CONFIG.net.snapshotRate exact on average for any ratio to the tick rate.
   */
  snapshotDue(dt) {
    this.snapAcc = (this.snapAcc ?? 0) + dt * CONFIG.net.snapshotRate;
    if (this.snapAcc < 1 - 1e-6) return false;
    this.snapAcc = Math.min(1, this.snapAcc - 1);
    return true;
  }

  /**
   * The dinosaur as a client saw it when it aimed: `rt` is the client's render
   * time (server clock), clamped to CONFIG.net.lagCompMax. Without rt: now.
   */
  hitPose(d, rt) {
    const t = Number.isFinite(rt) ? Math.max(this.now - CONFIG.net.lagCompMax, Math.min(this.now, rt)) : this.now;
    return this.dinos.poseAt(d, t);
  }

  snapshot() {
    const N = CONFIG.net;
    const p = [];
    for (const q of this.players.values()) {
      const carry = q.inv.loot.meat + q.inv.loot.hide + q.inv.loot.plates;
      const fl = q.fl | (q.eating ? 4 : 0);
      p.push([q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.yaw), r3(q.pitch), r2(q.spd), q.eq, fl, Math.ceil(q.hp), q.alive ? 1 : 0, carry]);
    }
    // Dinosaurs far from every player change nothing anyone can see (fog):
    // they go out only with every Nth snapshot.
    this.snapSeq = (this.snapSeq ?? 0) + 1;
    const far2 = N.farSnapshotDist * N.farSnapshotDist;
    const near = (d) => {
      for (const q of this.players.values()) if (dist2(q.x, q.z, d.x, d.z) <= far2) return true;
      return false;
    };
    const rows = this.dinos.snapshotRows(this.snapSeq % N.farSnapshotEvery === 0 ? null : near);
    return { t: MSG.SNAP, now: r3(this.now), p, d: rows };
  }

  fullState() {
    return {
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      dinos: this.dinos.describeAll(),
      items: [...this.items.values()],
      fruit: this.fruit.map((f) => f.count),
      spottedDinos: [...this.spottedDinos],
      traps: [...this.traps.values()],
      baits: [...this.baits.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z })),
      tracks: this.tracks.slice(-200),
      mission: this.mission.state(),
      store: this.store,
      level: { index: this.levelIndex, variant: this.variant },
      relics: this.relics.map((r) => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, z: r.z, found: r.found })),
      boat: { repaired: this.mission.phase !== 'search' },
    };
  }
}
