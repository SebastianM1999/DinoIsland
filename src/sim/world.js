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

import { CONFIG } from '../shared/config.js';
import { Terrain } from '../shared/terrain.js';
import { buildLayout } from '../shared/layout.js';
import { MSG, ACT, EV, EQUIP } from '../shared/protocol.js';
import { DinoSystem } from './dinos.js';
import { Mission } from './mission.js';
import { resolveCircle } from '../shared/collision.js';

const P = CONFIG.player;
const W = CONFIG.weapons;
const LOOT_KEYS = Object.keys(CONFIG.loot);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const validVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
const collisionResult = { x: 0, z: 0, hit: false };

export class ServerWorld {
  /** @param {{ send:(to:number|'*', msg:object, except?:number)=>void, log?:(...a:any[])=>void }} host */
  constructor(host) {
    this.host = host;
    this.log = host.log || (() => {});
    this.now = 0;
    this.terrain = new Terrain();
    this.layout = buildLayout(this.terrain);
    this.players = new Map();
    this.items = new Map();
    this.traps = new Map();
    this.baits = new Map();
    this.projectiles = new Map();
    this.tracks = [];
    this.nextId = 1;
    this.store = Object.fromEntries(LOOT_KEYS.map((k) => [k, 0]));
    this.fruit = this.layout.fruitSpots.map((s) => ({ spot: s.id, ripe: true, regrowAt: 0 }));
    this.dinos = new DinoSystem(this);
    this.mission = new Mission(this);
    this.dinos.spawnAll();
  }

  id() { return this.nextId++; }

  send(to, msg) { this.host.send(to, msg); }
  broadcast(msg, except) { this.host.send('*', msg, except); }
  event(e, data, except) { this.broadcast({ t: MSG.EV, e, ...data }, except); }
  toast(text, icon = 'info', to = '*') { this.send(to, { t: MSG.EV, e: EV.TOAST, text, icon }); }

  // ------------------------------------------------------------------ players

  /** @param {(id:number)=>void} [attach] called with the new id before the welcome is sent */
  join(name, attach) {
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
      knockBudgetUntil: 0,
      nextMeleeAt: 0,
      nextFireAt: 0,
    };
    this.players.set(p.id, p);
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
      arrows: W.bow.startArrows,
      spear: true,
      traps: W.trap.startCount,
      baits: W.bait.startCount,
      fruit: [],
      loot: Object.fromEntries(LOOT_KEYS.map((k) => [k, 0])),
    };
  }

  publicPlayer(p) {
    return { id: p.id, slot: p.slot, name: p.name, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r3(p.yaw), hp: Math.ceil(p.hp), alive: p.alive };
  }

  sendInv(p) { this.send(p.id, { t: MSG.INV, inv: p.inv }); }

  carryWeight(p) {
    let w = 0;
    for (const k of LOOT_KEYS) w += p.inv.loot[k] * CONFIG.loot[k].weight;
    return w;
  }

  hurtPlayer(p, dmg, { kx = 0, kz = 0, down = 0, src = null } = {}) {
    if (!p.alive || dmg <= 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    if (p.eating) p.eating = null;   // getting hit interrupts eating
    // A dinosaur's knockback can briefly exceed normal sprint speed.
    if (kx || kz) {
      p.knockBudgetUntil = this.now + 1;
      p.moveBudget = Math.max(p.moveBudget, Math.min(7, Math.hypot(kx, kz) * 0.5));
    }
    this.event(EV.HURT, { id: p.id, dmg: Math.round(dmg), hp: Math.ceil(p.hp), kx: r2(kx), kz: r2(kz), down, src });
    if (p.hp <= 0) this.killPlayer(p, src);
  }

  killPlayer(p, src) {
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
    p.inv.spear = true;
    this.sendInv(p);
    this.event(EV.RESPAWN, { id: p.id, x: r2(p.x), z: r2(p.z), yaw: p.yaw });
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

  onState(p, m) {
    if (!p.alive) return;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    const x = num(m.x, p.x), z = num(m.z, p.z);
    const y = num(m.y, p.y);
    // A small distance reserve accommodates packet bunching without allowing
    // repeated state packets to move faster than the player's sprint.
    p.moveBudget = Math.min(this.now < p.knockBudgetUntil ? 7 : 3.5,
      p.moveBudget + Math.max(0, this.now - p.lastMoveAt) * 11);
    p.lastMoveAt = this.now;
    const distance = Math.hypot(x - p.x, z - p.z);
    const lim = CONFIG.world.size / 2 - 5;
    const ground = this.terrain.heightAt(x, z);
    resolveCircle(x, z, P.radius, this.layout.colliders, collisionResult);
    const blocked = Math.hypot(collisionResult.x - x, collisionResult.z - z) > 0.6;
    if (distance > p.moveBudget + 0.05 || Math.abs(x) > lim || Math.abs(z) > lim ||
        !Number.isFinite(ground) || y < ground - 2 || y > ground + 20 ||
        this.terrain.waterDepthAt(x, z) > CONFIG.world.maxWadeDepth + 0.2 || blocked) {
      this.send(p.id, { t: MSG.CORRECT, x: r2(p.x), y: r2(p.y), z: r2(p.z) });
      return;
    }
    p.moveBudget -= distance;
    p.x = x; p.z = z; p.y = y;
    p.yaw = num(m.yaw, p.yaw);
    p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, num(m.pitch, p.pitch)));
    p.spd = Math.max(0, Math.min(20, num(m.spd, 0)));
    p.eq = Math.max(0, Math.min(EQUIP.length - 1, m.eq | 0));
    p.fl = (m.fl | 0) & 63;
  }

  near(p, x, z, range) { return dist2(p.x, p.z, x, z) <= range * range; }

  onAct(p, m) {
    const inv = p.inv;
    switch (m.a) {
      case ACT.MELEE: {
        if (!p.alive || p.eating || !inv.spear || this.now < p.nextMeleeAt) return;
        const d = this.dinos.get(m.dino);
        if (!d || !d.alive) return;
        if (!validVec(m.p) || !this.validMeleeHit(p, d, m.p)) return;
        p.nextMeleeAt = this.now + W.spear.cooldown;
        this.dinos.damage(d, W.spear.damage, m.zone, p.id, 'spear');
        return;
      }
      case ACT.FIRE: {
        if (!p.alive || p.eating || this.now < p.nextFireAt) return;
        const kind = m.kind === 'spear' ? 'spear' : 'arrow';
        if (!Number.isSafeInteger(m.pid) || m.pid < 0 || !validVec(m.o) || !validVec(m.v)) return;
        if (this.projectiles.has(`${p.id}:${m.pid}`)) return;
        const originDistance = Math.hypot(m.o[0] - p.x, m.o[2] - p.z);
        const speed = Math.hypot(...m.v);
        const maxSpeed = kind === 'spear' ? W.spear.throwSpeed + 5 : W.bow.maxSpeed + 5;
        if (originDistance > 2.5 || Math.abs(m.o[1] - (p.y + P.eyeHeight)) > 2.5 ||
            speed < 5 || speed > maxSpeed) return;
        if (kind === 'arrow') {
          if (inv.arrows <= 0) return;
          inv.arrows--;
        } else {
          if (!inv.spear) return;
          inv.spear = false;
        }
        p.nextFireAt = this.now + (kind === 'spear' ? W.spear.throwCooldown : W.bow.cooldown);
        this.projectiles.set(`${p.id}:${m.pid}`, { kind, t: this.now, pw: Math.max(0, Math.min(1, Number(m.pw) || 0)), o: m.o.slice(), v: m.v.slice() });
        this.sendInv(p);
        this.event(EV.FIRE, { by: p.id, kind, o: m.o, v: m.v, pid: m.pid }, p.id);
        return;
      }
      case ACT.LAND: {
        const key = `${p.id}:${m.pid}`;
        const proj = this.projectiles.get(key);
        if (!proj) return;
        if (!validVec(m.p) || !this.validProjectileLanding(proj, m.p)) return;
        this.projectiles.delete(key);
        const [x, y, z] = m.p;
        const d = m.dino != null ? this.dinos.get(m.dino) : null;
        if (d && d.alive) {
          const reach = d.type === 'ptera' ? 9 : d.radius + 4;
          const maxHeight = { brachio: 17, trex: 12, stego: 7, raptor: 5, ptera: 6 }[d.type];
          if (dist2(x, z, d.x, d.z) > reach * reach || Math.abs(y - d.y) > maxHeight) return;
          if (proj.kind === 'arrow') {
            const dmg = W.bow.damage * (0.45 + 0.55 * Math.min(1, proj.pw));
            d.arrowsStuck = (d.arrowsStuck || 0) + 1;
            this.dinos.damage(d, dmg, m.zone, p.id, 'arrow');
          } else {
            this.dinos.damage(d, W.spear.throwDamage, m.zone, p.id, 'spear');
            this.spawnItem('spear', d.x + (Math.random() - 0.5) * 2, d.z + (Math.random() - 0.5) * 2, 1);
          }
          return;
        }
        if (Math.abs(y - this.terrain.heightAt(x, z)) <= 2) this.spawnItem(proj.kind, x, z, 1, y);
        return;
      }
      case ACT.PICKUP: {
        if (!p.alive) return;
        const it = this.items.get(m.item);
        if (!it || !this.near(p, it.x, it.z, CONFIG.pickupRange + 1.5)) return;
        if (it.kind === 'arrow') {
          if (inv.arrows >= W.bow.maxArrows) return this.toast('Your quiver is full', 'arrow', p.id);
          inv.arrows = Math.min(W.bow.maxArrows, inv.arrows + it.n);
        } else if (it.kind === 'spear') {
          if (inv.spear) return this.toast('You already carry a spear', 'spear', p.id);
          inv.spear = true;
        } else if (CONFIG.loot[it.kind]) {
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
        if (!f || !spot || !f.ripe || !this.near(p, spot.x, spot.z, P.interactRange + 2)) return;
        if (inv.fruit.length >= CONFIG.fruit.maxCarried) return this.toast(`You can carry ${CONFIG.fruit.maxCarried} fruits at most`, 'fruit', p.id);
        inv.fruit.push(spot.type);
        f.ripe = false;
        f.regrowAt = this.now + CONFIG.fruit.types[spot.type].regrow;
        this.event(EV.FRUIT, { spot: spot.id, ripe: false });
        this.toast(`${CONFIG.fruit.types[spot.type].name} +1`, spot.type, p.id);
        this.sendInv(p);
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
        if (q.inv.fruit.length >= CONFIG.fruit.maxCarried) return this.toast(`${q.name} can't carry more fruit`, 'fruit', p.id);
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
      case ACT.REFILL: {
        const h = this.layout.hut.arrowRack;
        if (!p.alive || !this.near(p, h.x, h.z, 6)) return;
        inv.arrows = W.bow.maxArrows;
        inv.traps = Math.max(inv.traps, W.trap.startCount);
        inv.baits = Math.max(inv.baits, W.bait.startCount);
        inv.spear = true;
        this.sendInv(p);
        this.toast('Arrows, traps and bait refilled', 'arrow', p.id);
        return;
      }
    }
  }

  validMeleeHit(p, d, point) {
    const [x, y, z] = point;
    const vx = x - p.x, vy = y - p.y - P.eyeHeight, vz = z - p.z;
    const distance = Math.hypot(vx, vy, vz);
    if (distance > W.spear.range + 0.8 || distance < 0.1) return false;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch);
    const fy = Math.sin(p.pitch);
    const fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    if ((vx * fx + vy * fy + vz * fz) / distance < 0.4) return false;
    const reach = d.type === 'ptera' ? 8 : d.radius + 3;
    return dist2(x, z, d.x, d.z) <= reach * reach && Math.abs(y - d.y) < 17;
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

  spawnItem(kind, x, z, n = 1, y = null) {
    const lim = CONFIG.world.size / 2 - 2;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    const ground = this.terrain.heightAt(x, z);
    const it = { id: this.id(), kind, n, x: r2(x), y: r2(y == null ? ground : Math.max(ground, Math.min(y, ground + 3))), z: r2(z), t: this.now };
    this.items.set(it.id, it);
    this.event(EV.ITEM_ADD, { item: it });
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
      // the hut is a safe, healing place
      const c = this.layout.hut.campfire;
      if (p.hp < P.maxHealth && this.near(p, c.x, c.z, P.hutHealRadius)) {
        p.hp = Math.min(P.maxHealth, p.hp + P.hutHealPerSecond * dt);
      }
    }

    // fruit regrowth
    for (const f of this.fruit) {
      if (!f.ripe && this.now >= f.regrowAt) {
        f.ripe = true;
        this.event(EV.FRUIT, { spot: f.spot, ripe: true });
      }
    }
    // stale items
    for (const it of this.items.values()) {
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
    this.mission.update(dt);
  }

  snapshot() {
    const p = [];
    for (const q of this.players.values()) {
      const carry = q.inv.loot.meat + q.inv.loot.hide + q.inv.loot.plates;
      const fl = q.fl | (q.eating ? 4 : 0);
      p.push([q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.yaw), r3(q.pitch), r2(q.spd), q.eq, fl, Math.ceil(q.hp), q.alive ? 1 : 0, carry]);
    }
    return { t: MSG.SNAP, now: r3(this.now), p, d: this.dinos.snapshotRows() };
  }

  fullState() {
    return {
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      dinos: this.dinos.describeAll(),
      items: [...this.items.values()],
      fruit: this.fruit.map((f) => f.ripe),
      traps: [...this.traps.values()],
      baits: [...this.baits.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z })),
      tracks: this.tracks.slice(-200),
      mission: this.mission.state(),
      store: this.store,
    };
  }
}
