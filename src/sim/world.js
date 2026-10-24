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

import { GUNS, gunInventory, gunAction, updateGunReload } from './firearms.js';
import { CONFIG } from '../shared/config.js';
import { Terrain } from '../shared/terrain.js';
import { buildLayout } from '../shared/layout.js';
import { MSG, ACT, EV, EQUIP, PF, OWNER_KEY } from '../shared/protocol.js';
import { sanitizeProfile, creativeProfile, skillMods, progress, buy, canBuy, SKILL_IDS, MAX_XP, MAX_BONUS_POINTS, RELIC_XP, RELIC_POINTS, DASH } from '../shared/skills.js';
import { DinoSystem } from './dinos.js';
import { NOISE } from './ai/senses.js';
import { Mission } from './mission.js';
import { resolveCircle, penetration } from '../shared/collision.js';
import { resolveDinoContact, DINO_CONTACT, dinoBodyCircles } from '../shared/dinoContact.js';
import { butcherTime, carcassLoot } from '../shared/dinoRank.js';
import { makeRng } from '../shared/rng.js';
import { lineBlocked, DINO_SIGHTING } from '../shared/visibility.js';
import { sanitizeOutfit, sameOutfit } from '../shared/outfits.js';
import { planIsland, islandSeed } from '../shared/island.js';
import { levelDef, LEVEL_COUNT } from '../shared/levels.js';
import { TORCH, WALL_TORCH } from '../shared/torch.js';
import { CAVE_WALK_MAX } from '../shared/caveField.js';
import { findUnstuckSpot, goodSpot } from './unstuck.js';
import { rosterRecord, applyRosterRecord } from './worldSave.js';
import { nearDino, plausibleZone } from './hitCheck.js';
import { freshBase, CAMP_BENCH, CAMP_FIRE_REACH, campStations, safeZone as baseSafeZone, hasBasePlots, PLOT_REACH, MAX_STAGE, stageCost, BUILD_TIME, BASE_STAGES, applyBaseColliders, baseSpawnPoints, TOWERS, TOWER_SLOTS, towerCost, repairCost } from '../shared/base.js';
import { updateTowers } from './towers.js';
import { Raids } from './raids.js';
import { Volcano } from './volcano.js';
import { Story } from './story.js';
import { insideGrove, mayEnterGrove } from '../shared/grove.js';
import { RECIPE_BY_ID, upgradeMods, unlockIsland, canAfford } from '../shared/crafting.js';

const P = CONFIG.player;
const DIVE = P.dive;
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
/** Seconds of invulnerability after being revived. */
const REVIVE_INVULN = 1.5;
/** After an accepted dash the movement validator stays generous for this long. */
const DASH_WINDOW = 0.6;
/** Sprint Strike stays armed this long after the last sprinting state packet. */
const SPRINT_STRIKE_WINDOW = 2;

export class ServerWorld {
  /**
   * @param {{ send:(to:number|'*', msg:object, except?:number)=>void, log?:(...a:any[])=>void }} host
   * @param {{ level?: number, variant?: number, lobby?: boolean }} [opts] start island (variant: layout override for testing,
   *   default the level's fixed map); lobby: a hosted expedition waits in its lobby until the owner starts it
   */
  constructor(host, opts = {}) {
    this.host = host;
    // The lobby (a hosted expedition before the owner's Start): explorers join and see each other, the
    // island waits (step only keeps the clock for timeouts). Whoever joins after Start plays at once.
    this.inLobby = !!opts.lobby;
    // rare alphas among the spawns (shared/dinoRank.js). The hosts turn them on; a bare world
    // (the tests) keeps every animal ordinary unless a spawn asks for an alpha.
    this.alphas = !!opts.alphas;
    this.log = host.log || (() => {});
    // (a restored expedition starts its clock and id counter where the save left them, so the
    // fresh island built here never reuses a saved id: sim/worldSave.js `worldOptions`)
    this.now = Number.isFinite(opts.now) && opts.now > 0 ? opts.now : 0;
    this.players = new Map();
    this.nextId = Number.isSafeInteger(opts.firstId) && opts.firstId > 0 ? opts.firstId : 1;
    this.roster = new Map();            // explorers away from a saved expedition: roster key -> record (sim/worldSave.js)
    this.creativeUsed = false;          // creative mode was switched on in this expedition (shown on its save)
    this.store = Object.fromEntries(LOOT_KEYS.map((k) => [k, 0]));
    this.upgrades = new Set();          // team upgrades built at the workbench (survive islands)
    this.story = new Story(this);       // the notes the team has read (sim/story.js; survives islands)
    this.fruitRng = makeRng((Math.random() * 0xffffffff) >>> 0);
    this.#loadLevel(opts.level ?? 0, opts.variant);
    this.mission = new Mission(this);
    this.dinos.spawnAll();
  }

  /** Build the island for `level` (everything that belongs to one island): its fixed map unless `variant` overrides it. */
  #loadLevel(level, variant = levelDef(level).variant) {
    this.worldEpoch = (this.worldEpoch ?? 0) + 1;
    this.levelIndex = level;
    this.variant = variant;
    this.terrain = new Terrain(planIsland(level, variant));
    this.layout = buildLayout(this.terrain);
    // the dinosaurs' new AI layers draw from this (ai/senses.js), so a fixed island replays the same
    this.aiRng = makeRng((islandSeed(level, variant) ^ 0x5eed) >>> 0);
    this.items = new Map();
    this.torchSpawns = [];
    this.traps = new Map();
    this.projectiles = new Map();
    this.tracks = [];
    this.fruit = this.layout.fruitSpots.map((s) => ({ spot: s.id, count: this.rollFruitCount(), regrowAt: 0 }));
    this.resources = this.layout.resourceSpots.map((s) => ({ spot: s.id, up: true, regrowAt: 0 }));
    this.spottedDinos = new Set();
    this.relics = this.layout.relics.map((r) => ({ ...r, found: false, byName: null }));
    this.base = freshBase();          // the team's own base (islands 2+, see shared/base.js)
    this._safe = undefined;
    this.raids = new Raids(this);     // raids on the base (sim/raids.js)
    this.volcano = new Volcano(this); // heat, eruptions, ash rain (sim/volcano.js; idle off the volcano)
    this.dinos = new DinoSystem(this);
    this.placeTorches();
    this.wallTorchesLit = new Set();   // Hollow Mountain wall torches the team has lit (ids into layout.wallTorches)
    this.placeSumpCaches();
    this.log(`island ${level + 1} "${levelDef(level).name}" variant ${variant}`);
  }

  /** The team set sail: build the next island, its fixed map (after the last one: the first island again). */
  nextLevel() {
    this.#loadLevel(this.levelIndex + 1 < LEVEL_COUNT ? this.levelIndex + 1 : 0);
    this.mission.startIsland();
    this.dinos.spawnAll();
    for (const p of this.players.values()) {
      const sp = this.layout.spawnPoints[p.slot];
      Object.assign(p, {
        x: sp.x, y: this.terrain.heightAt(sp.x, sp.z), z: sp.z, yaw: sp.yaw, pitch: 0, spd: 0,
        hp: p.maxHp, alive: true, deadT: 0, eating: null, hot: null,
        downed: false, downT: 0, reviving: null, lastStandUsed: false, invulnUntil: 0,
        lastMoveAt: this.now, moveBudget: 3.5, epoch: p.epoch + 1, breath: DIVE.breath, drownT: 0,
      });
      this.resupplyForIsland(p);
    }
    for (const p of this.players.values()) {
      this.send(p.id, { t: MSG.WELCOME, id: p.id, slot: p.slot, now: r3(this.now), k: p.epoch, inv: p.inv, world: this.fullState() });
      this.sendProf(p);
    }
    this.checkpoint('island');
  }

  /**
   * What sailing to a new island hands out: the bow (it was found on island 1), a full quiver, the
   * starting traps, a fresh spear and firearms. Explorers on board get it in nextLevel; one who was
   * away when the team sailed gets it once on return (sim/worldSave.js applyRosterRecord).
   */
  resupplyForIsland(p) {
    const caps = this.caps();
    if (!this.layout.bowCamp) p.inv.bow = true;
    if (p.inv.bow) {
      p.inv.arrows = caps.arrows;
      p.inv.arrowUses = Array(caps.arrows).fill(W.bow.uses);
    }
    p.inv.traps = Math.max(p.inv.traps, caps.traps);
    p.inv.spear = p.inv.spearFound = true;
    p.inv.spearHealth = W.spear.durability;
    p.inv.guns = this.gunInventory(); p.inv.reloading = null;
    p.inv.caps = caps;
    p.inv.upgrades = [...this.upgrades];
  }

  /** A moment worth saving (new island, boat part, base stage, boss, someone left): the host may save soon. */
  checkpoint(reason) { this.host.checkpoint?.(reason); }

  id() { return this.nextId++; }
  rollFruitCount() { return 1 + Math.floor(this.fruitRng() * 4); }

  send(to, msg) { this.host.send(to, { ...msg, w: this.worldEpoch }); }
  broadcast(msg, except) { this.host.send('*', { ...msg, w: this.worldEpoch }, except); }
  // (the message type and event name come last: a payload field called `t` or `e` would turn the
  // event into a message nobody listens to - durations travel as `secs`)
  event(e, data, except) { this.broadcast({ ...data, t: MSG.EV, e }, except); }
  toast(text, icon = 'info', to = '*') { this.send(to, { t: MSG.EV, e: EV.TOAST, text, icon }); }

  // ------------------------------------------------------------------ players

  /**
   * @param {(id:number)=>void} [attach] called with the new id before the welcome is sent
   * @param {object} [profile] starting XP/skills (sanitized); hosts pass none: progression belongs to the expedition
   * @param {string|null} [key] persistent roster key: a returning explorer gets their saved character back
   */
  join(name, attach, outfit, profile, key = null) {
    const max = CONFIG.net.maxPlayers;
    if (this.players.size >= max) return { ok: false, reason: `The expedition is full (${max} players max).` };
    if (key && [...this.players.values()].some((q) => q.key === key)) return { ok: false, reason: 'You are already in this expedition.' };
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const clean = String(name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14) || `Player ${slot + 1}`;
    const sp = this.spawnPoint(slot);
    // (a saved profile comes from the client: never trust it)
    const prof = sanitizeProfile(profile);
    const mods = skillMods(prof.skills);
    const p = {
      id: this.id(),
      slot,
      name: clean,
      outfit: sanitizeOutfit(outfit, slot),
      x: sp.x, y: this.terrain.heightAt(sp.x, sp.z), z: sp.z,
      yaw: sp.yaw, pitch: 0, spd: 0, eq: 0, fl: 0,
      prof,
      mods,
      maxHp: P.maxHealth + mods.maxHpAdd,
      hp: P.maxHealth + mods.maxHpAdd,
      alive: true,
      deadT: 0,
      downed: false,         // lying on the ground, bleeding out (a teammate can revive)
      downT: 0,
      downedAt: 0,
      reviving: null,        // { to, until } while this player revives a downed teammate
      lastHurtAt: -99,
      lastStandUsed: false,
      invulnUntil: 0,
      bloodlustUntil: 0,
      sprinting: false, sprintArmed: false, lastSprintAt: -99,
      nextDashAt: 0, dashUntil: 0,
      nextSkillAt: 0,
      eating: null,
      hot: null,
      inv: this.freshInventory(),
      lastInput: this.now,
      lobbySeen: this.lobbyClock ?? 0,   // (lastInput's twin while the island waits in its lobby: idleFor)
      lastMoveAt: this.now,
      moveBudget: 3.5,
      breath: DIVE.breath,   // seconds of air left while the head is under water (see `breathe`)
      drownT: 0,
      epoch: 0,              // bumped by every correction/teleport (see correct())
      lastSeq: -1,           // newest state packet seen (`s`)
      knockBudgetUntil: 0,
      creative: false,       // invincible, may fly (toggled by the player)
      nextMeleeAt: 0,
      nextFireAt: 0,
      key: key || null,
    };
    this.players.set(p.id, p);
    const saved = key ? this.roster.get(key) : null;
    if (saved) { applyRosterRecord(this, p, saved); this.roster.delete(key); }
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
      ...(this.inLobby ? { lobby: this.lobbyState() } : {}),
    });
    this.sendProf(p);
    this.event(EV.PLAYER_JOIN, { player: this.publicPlayer(p) }, p.id);
    if (this.inLobby) this.sendLobby(p.id);
    this.toast(`${p.name} joined the expedition`, 'team');
    this.log(`join #${p.id} "${p.name}" slot ${slot} (${this.players.size} players)`);
    return { ok: true, id: p.id };
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.key) this.roster.set(p.key, rosterRecord(this, p));   // the character waits in the expedition
    this.players.delete(id);
    this.event(EV.PLAYER_LEAVE, { id });
    this.toast(`${p.name} left the expedition`, 'team');
    this.dinos.forgetPlayer(id);
    if (this.inLobby) this.sendLobby();
    this.log(`leave #${id} "${p.name}" (${this.players.size} players)`);
    this.checkpoint('leave');
  }

  freshInventory() {
    // (island 1: each explorer finds the bow at the hunter's camp; elsewhere it was found on island 1)
    const bow = !this.layout.bowCamp;
    // (island 1: the explorers wash ashore empty-handed; Jonas' spear stands at the cold camp fire)
    const armed = !this.layout.arrival;
    return {
      guns: this.gunInventory(), reloading: null,
      bow,
      arrows: bow ? W.bow.startArrows : 0,
      arrowUses: Array(bow ? W.bow.startArrows : 0).fill(W.bow.uses),
      spear: armed,
      spearHealth: armed ? W.spear.durability : 0,
      spearFound: armed,     // has had a spear: only then does the free resupply hand out a new one
      traps: armed ? W.trap.startCount : 0,
      fruit: [],
      torch: false,          // owns the hand-held torch (picked up at the island's torch spots)
      loot: Object.fromEntries(LOOT_KEYS.map((k) => [k, 0])),
    };
  }

  publicPlayer(p) {
    return { id: p.id, slot: p.slot, name: p.name, outfit: p.outfit, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r3(p.yaw), hp: Math.ceil(p.hp), maxHp: p.maxHp, alive: p.alive, downed: p.downed, host: p.key === OWNER_KEY };
  }

  sendInv(p) {
    p.inv.caps = this.caps();
    p.inv.buffs = this.buffsLeft(p);
    p.inv.upgrades = [...this.upgrades];
    this.send(p.id, { t: MSG.INV, inv: p.inv });
  }

  /** Effects of the team's workbench upgrades. */
  mods() { return upgradeMods(this.upgrades); }

  /** Fruit buffs still running on `p`: { kind: seconds left } (sent with the inventory). */
  buffsLeft(p) {
    const out = {};
    for (const [k, until] of Object.entries(p.buffs || {})) if (until > this.now) out[k] = Math.round((until - this.now) * 10) / 10;
    return out;
  }

  /** `target` gets the good of a fruit of `type` (eaten, or fed by a Field Medic with `by`'s skills). */
  applyFruit(target, type, by = target) {
    const ft = CONFIG.fruit.types[type];
    if (!ft) return;
    this.healPlayer(target, ft.heal * by.mods.fruitHealMul);
    if (ft.hot > 0) target.hot = { rate: (ft.hot * by.mods.fruitHealMul) / ft.hotTime, t: ft.hotTime };
    const buff = ft.buff && CONFIG.fruit.buffs[ft.buff];
    if (buff) {
      target.buffs = { ...(target.buffs || {}), [ft.buff]: this.now + buff.time };
      this.sendInv(target);
    }
  }

  /** Inventory limits: config base values plus team upgrades from contracts and the workbench. */
  caps() {
    const b = this.mission ? this.mission.bonus() : { arrows: 0, fruit: 0, carry: 0, traps: 0 };
    const u = this.mods();
    return {
      arrows: W.bow.maxArrows + b.arrows + u.quiver,
      fruit: CONFIG.fruit.maxCarried + b.fruit,
      carry: P.maxCarryWeight + b.carry,
      traps: W.trap.startCount + b.traps + u.traps,
      slots: P.backpackSlots,
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

  /** Put loot into a player's pack: false (and a "pack full" alert) when it is too heavy or a new kind finds no free backpack slot. */
  addLoot(p, kind, n) {
    const caps = this.caps();
    if (!(p.inv.loot[kind] > 0) && this.lootStacks(p) >= caps.slots) {
      this.fullAlert(p, `Your backpack is full – ${caps.slots} kinds at most, drop or deposit one`, 'weight');
      return false;
    }
    if (this.carryWeight(p) + CONFIG.loot[kind].weight * n > caps.carry + 1e-6) {
      this.fullAlert(p, `Your pack is full (${this.carryWeight(p)}/${caps.carry}) – drop off loot at the hut`, 'weight');
      return false;
    }
    p.inv.loot[kind] += n;
    this.toast(`${CONFIG.loot[kind].name} +${n}`, kind, p.id);
    return true;
  }

  /** Backpack slots in use: one per material kind the player carries. */
  lootStacks(p) {
    let n = 0;
    for (const k of LOOT_KEYS) if (p.inv.loot[k] > 0) n++;
    return n;
  }

  carryWeight(p) {
    let w = 0;
    for (const k of LOOT_KEYS) w += p.inv.loot[k] * CONFIG.loot[k].weight;
    return w;
  }

  hurtPlayer(p, dmg, { kx = 0, kz = 0, down = 0, src = null, from = null } = {}) {
    if (!p.alive || dmg <= 0 || p.creative || this.now < p.invulnUntil) return;
    // Unshakable: the client scales the knockdown TIME with the same mods, we scale what it is sent
    const knock = p.mods.knockMul;
    if (knock !== 1) { kx *= knock; kz *= knock; if (knock === 0) down = 0; }
    p.lastHurtAt = this.now;
    // Lotus Skin (glow lotus): less damage while it lasts
    if (p.buffs?.lotusskin > this.now) dmg *= CONFIG.fruit.buffs.lotusskin.damageMul;
    p.hp = Math.max(0, p.hp - dmg);
    // Last Stand: one lethal hit per life leaves 1 HP and a moment of invulnerability
    if (p.hp <= 0 && p.mods.lastStand && !p.lastStandUsed) {
      p.lastStandUsed = true;
      p.hp = 1;
      p.invulnUntil = this.now + p.mods.lastStandInvuln;
    }
    if (p.eating) p.eating = null;   // getting hit interrupts eating
    this.stopButcher(p);             // ... and butchering
    this.stopRevive(p);              // ... and reviving
    // A dinosaur's knockback can briefly exceed normal sprint speed.
    if (kx || kz) {
      p.knockBudgetUntil = this.now + 1;
      p.moveBudget = Math.max(p.moveBudget, Math.min(7, Math.hypot(kx, kz) * 0.5));
    }
    this.event(EV.HURT, { id: p.id, dmg: Math.round(dmg), hp: Math.ceil(p.hp), kx: r2(kx), kz: r2(kz), down, src, from });
    if (p.hp <= 0) this.killPlayer(p, src);
  }

  /**
   * Breath (diving): while the head is under the water the air drains one second per second, above it it refills
   * `refill` times as fast; with none left the lungs hurt `drownDps` HP per second (every `drownTick` s) until the
   * head is out. The client counts the same way for its meter (controller.js). Creative players never drown.
   */
  breathe(p, dt) {
    if (p.creative) { p.breath = DIVE.breath; p.drownT = 0; return; }
    if (this.terrain.headUnderwater(p.x, p.y, p.z)) {
      p.breath = Math.max(0, p.breath - dt);
      if (p.breath > 0) { p.drownT = 0; return; }
      p.drownT += dt;
      if (p.drownT >= DIVE.drownTick) {
        p.drownT -= DIVE.drownTick;
        this.hurtPlayer(p, DIVE.drownDps * DIVE.drownTick, { src: 'drown' });
      }
    } else {
      p.breath = Math.min(DIVE.breath, p.breath + DIVE.refill * dt);
      p.drownT = 0;
    }
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
    if (!p.alive || p.eating || p.butcher || !d || d.alive || d.butchered || !d.settled) return;
    if (this.carcassDistance(p, d) > K.reach + P.radius || Math.abs(p.y - d.y) > 4 * (d.scale || 1)) return;
    // one butcher per carcass at a time: a teammate already at work keeps it
    if (d.butcherBy != null && d.butcherBy !== p.id && this.players.get(d.butcherBy)?.butcher?.dino === d.id) {
      return this.toast(`${this.players.get(d.butcherBy).name} is already butchering it`, 'bones', p.id);
    }
    // 3 s, an alpha 5 s, a boss 10 s (shared/dinoRank.js); Butcher's Eye halves it
    const time = butcherTime(d) * p.mods.knifeTimeMul;
    p.butcher = { dino: d.id, until: this.now + time, x: p.x, z: p.z };
    d.butcherBy = p.id;
    d.deadT = Math.max(d.deadT, time + 2);   // the carcass stays until it is done
    this.event(EV.BUTCHER, { id: p.id, dino: d.id, secs: time });
  }

  stopButcher(p) {
    if (!p.butcher) return;
    const d = this.dinos.get(p.butcher.dino);
    if (d?.butcherBy === p.id) d.butcherBy = null;
    p.butcher = null;
    this.event(EV.BUTCHER, { id: p.id, dino: null, secs: 0 });
  }

  updateButcher(p) {
    const b = p.butcher;
    const d = this.dinos.get(b.dino);
    if (!p.alive || !d || d.butchered || Math.hypot(p.x - b.x, p.z - b.z) > W.knife.moveCancel) return this.stopButcher(p);
    if (this.now < b.until) return;
    p.butcher = null;
    d.butchered = true;
    d.butcherBy = null;
    d.deadT = Math.min(d.deadT, W.knife.sinkTime);
    const loot = carcassLoot(d);
    this.dropLoot(d.x, d.z, loot);
    this.event(EV.BUTCHER, { id: p.id, dino: null, secs: 0, done: true });
    this.event(EV.BUTCHERED, { id: d.id });
    const parts = Object.entries(loot).map(([k, n]) => `${n} ${CONFIG.loot[k].name.toLowerCase()}`).join(', ');
    this.toast(`${p.name} butchered the ${CONFIG.dinos[d.type].name}: ${parts}`, 'bones');
  }

  /** A lethal hit: downed when a living teammate could still revive, else defeated (the old death). */
  killPlayer(p, src) {
    if (this.hasRescuer(p)) this.downPlayer(p, src);
    else this.defeatPlayer(p, src);
  }

  /** Is another player alive (so not downed and not dead) who could revive `p`? */
  hasRescuer(p) {
    for (const q of this.players.values()) if (q !== p && q.alive) return true;
    return false;
  }

  downPlayer(p, src) {
    p.butcher = null;
    p.alive = false;
    p.downed = true;
    p.downT = P.bleedOutTime;
    p.downedAt = this.now;
    p.eating = null;
    p.hot = null;
    p.buffs = {};
    p.spd = 0;
    p.reviving = null;
    if (p.inv.reloading) { p.inv.reloading = null; this.sendInv(p); }
    this.event(EV.DOWN, { id: p.id, secs: P.bleedOutTime, by: src });
    this.toast(`${p.name} is down! Revive them before they bleed out`, 'skull');
  }

  /** True death: the carried loot falls where the player died and they respawn after the delay. */
  defeatPlayer(p, src, respawnIn = P.respawnDelay) {
    p.butcher = null;
    p.alive = false;
    p.downed = false;
    p.reviving = null;
    p.deadT = respawnIn;
    p.eating = null;
    p.hot = null;
    p.buffs = {};
    // Carried loot and fruit fall where the player died, to be picked up again.
    const dropped = this.dropCarried(p);
    this.sendInv(p);
    this.event(EV.DEATH, { id: p.id, by: src });
    this.toast(`${p.name} was defeated${dropped ? ' – the carried loot lies where they fell' : ''}!`, 'skull');
    if (dropped) this.mission.onLootChanged();
  }

  /** Empties p's loot and fruit onto the ground around them, one stack per kind; returns how many stacks fell. */
  dropCarried(p) {
    const stacks = [];
    for (const k of LOOT_KEYS) if (p.inv.loot[k] > 0) stacks.push([k, p.inv.loot[k]]);
    const fruit = new Map();
    for (const f of p.inv.fruit) fruit.set(f, (fruit.get(f) || 0) + 1);
    stacks.push(...fruit);
    for (const k of LOOT_KEYS) p.inv.loot[k] = 0;
    p.inv.fruit = [];
    stacks.forEach(([kind, n], i) => {
      const a = (i / stacks.length) * Math.PI * 2 + p.yaw, r = stacks.length > 1 ? 0.9 : 0;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      // the ground under the body (a cave floor, not the surface above it)
      // (no droppedBy: walking back over the spot auto-loots it like any other loot)
      const item = this.spawnItem(kind, x, z, n, this.layout.groundAt(x, z, p.y + P.stepHeight), null, false);
      this.event(EV.ITEM_ADD, { item });
    });
    return stacks.length;
  }

  // ------------------------------------------------------------------ revive

  /** Hold E at a downed teammate: starts the channel (finished in updateRevive). */
  startRevive(p, toId) {
    const q = this.players.get(toId);
    if (!p.alive || p.eating || !q || q === p || !q.downed || !this.near(p, q.x, q.z, P.reviveRange + 0.5)) return;
    if (p.reviving?.to === q.id) return;
    this.stopRevive(p);
    const t = P.reviveTime * p.mods.reviveTimeMul;
    p.reviving = { to: q.id, until: this.now + t };
    this.playerNoise(p, 'revive', q.x, q.z);   // a predator nearby hears the rescue at the body
    this.event(EV.REVIVE, { id: q.id, by: p.id, to: q.id, secs: r2(t) });
  }

  stopRevive(p) {
    if (!p.reviving) return;
    const to = p.reviving.to;
    p.reviving = null;
    this.event(EV.REVIVE, { id: to, by: p.id, to, secs: 0 });
  }

  updateRevive(p) {
    const q = this.players.get(p.reviving.to);
    if (!q || !q.downed || p.eating || Math.hypot(p.x - q.x, p.z - q.z) > P.reviveRange + 1) return this.stopRevive(p);
    if (this.now < p.reviving.until) return;
    p.reviving = null;
    this.revivePlayer(q, p);
  }

  /** `by` brought the downed `q` back on their feet where they lay. */
  revivePlayer(q, by) {
    q.downed = false;
    q.downT = 0;
    q.alive = true;
    q.hp = Math.ceil(P.reviveHpFrac * q.maxHp);
    q.invulnUntil = this.now + REVIVE_INVULN;
    q.lastStandUsed = false;
    q.lastHurtAt = this.now;
    q.lastMoveAt = this.now;
    q.moveBudget = 3.5;
    q.knockBudgetUntil = 0;
    this.event(EV.REVIVED, { id: q.id, by: by.id, x: r2(q.x), z: r2(q.z) });
    this.correct(q);   // fresh epoch: the client resets its prediction
    this.toast(`${by.name} revived ${q.name}`, 'team');
  }

  /** A downed player bleeds out, or is given up on when nobody is left to help. */
  updateDowned(p, dt) {
    p.downT -= dt;
    if (p.downT <= 0 || !this.hasRescuer(p)) this.defeatPlayer(p, null);
  }

  // ------------------------------------------------------------------ skills / xp

  sendProf(p) {
    const prof = p.creative ? creativeProfile() : { xp: p.prof.xp, bonus: p.prof.bonus, skills: p.prof.skills };
    this.send(p.id, { t: MSG.PROF, prof });
  }

  /** The bought skills changed: new mods and max HP (a higher max also raises current HP by the same amount). */
  refreshMods(p) {
    const old = p.maxHp;
    // creative mode: every skill at max rank (the earned profile stays untouched underneath)
    p.mods = skillMods(p.creative ? creativeProfile().skills : p.prof.skills);
    p.maxHp = P.maxHealth + p.mods.maxHpAdd;
    if (p.maxHp > old) p.hp += p.maxHp - old;
    p.hp = Math.min(p.hp, p.maxHp);
  }

  /** XP (and bonus skill points) for every connected player, wherever they are, alive or not. */
  awardXp(amount, why, bonus = 0) {
    for (const p of this.players.values()) {
      const before = progress(p.prof);
      p.prof.xp = Math.min(MAX_XP, p.prof.xp + amount);
      p.prof.bonus = Math.min(MAX_BONUS_POINTS, p.prof.bonus + bonus);
      const now = progress(p.prof);
      if (now.xp === before.xp && now.total === before.total) continue;   // maxed out: nothing changed
      this.send(p.id, { t: MSG.EV, e: EV.XP, amount, why, ...(now.level !== before.level ? { level: now.level } : {}), free: now.free });
      this.sendProf(p);
    }
  }

  skillAction(p, m) {
    if (this.now < p.nextSkillAt) return;
    p.nextSkillAt = this.now + 0.1;
    if (p.creative) return this.toast('Creative mode already has every skill', 'info', p.id);
    if (m.op === 'buy') {
      // SKILLS is a plain object: only real ids may reach buy() ("constructor" would crash it)
      if (typeof m.id !== 'string' || !SKILL_IDS.includes(m.id)) return;
      const ok = canBuy(p.prof, m.id);
      if (!ok.ok) return this.toast(ok.reason, 'info', p.id);
      p.prof.skills = buy(p.prof, m.id);
    } else if (m.op === 'reset') {
      const st = this.stations();
      if (!p.alive || !this.nearAny(p, [st.fire, st.safe, st.workbench, st.wardrobe, st.board, ...st.dropOff, ...st.refill], 6)) {
        return this.toast('Skills can only be reset at your camp', 'info', p.id);
      }
      if (!Object.keys(p.prof.skills).length) return;
      p.prof.skills = {};
    } else return;
    this.refreshMods(p);
    this.sendProf(p);
  }

  /** Dash (Endurance capstone): the client moves itself, the server grants the extra distance. */
  grantDash(p) {
    if (!p.alive || !p.mods.dash || this.now < p.nextDashAt) return;
    p.nextDashAt = this.now + DASH.cooldown;
    p.dashUntil = this.now + DASH_WINDOW;
    p.moveBudget += DASH.distance + 1;
  }

  /** Damage multiplier for `p` hitting dinosaur `d` with `weapon` (Brute Force, Marksman, Executioner, Sprint Strike, Bloodlust). */
  damageMul(p, d, weapon) {
    if (weapon === 'trap' || weapon === 'tower') return 1;
    const m = p.mods;
    let mul = weapon === 'spear' ? m.meleeMul : GUNS.includes(weapon) ? m.gunMul : 1;
    if (m.executionerBonus && d.hp <= m.executionerBelow * d.maxHp) mul *= 1 + m.executionerBonus;
    if (m.sprintStrike && p.sprintArmed && this.now - p.lastSprintAt <= SPRINT_STRIKE_WINDOW) { mul *= 2; p.sprintArmed = false; }
    if (this.now < p.bloodlustUntil) mul *= 1 + m.bloodlustDmg;
    // Sharp Edge (obsidian fig)
    if (p.buffs?.sharpedge > this.now) mul *= CONFIG.fruit.buffs.sharpedge.dinoDamageMul;
    return mul;
  }

  /** `p` brought a dinosaur down: Bloodlust heals and arms the damage bonus (refreshes, never stacks). */
  onPlayerKill(p) {
    if (!p.mods.bloodlust || !p.alive) return;
    this.healPlayer(p, p.mods.bloodlustHeal * p.maxHp);
    p.bloodlustUntil = this.now + p.mods.bloodlustTime;
  }

  /**
   * Player `p` made a noise of `kind` (ai/senses.js NOISE) at its feet or at (x, z): dinosaurs in earshot
   * hear it. Stalker hushes it; repeats within the kind's `every` seconds are one noise (automatic fire).
   */
  playerNoise(p, kind, x = p.x, z = p.z) {
    const n = NOISE[kind], at = (p.noiseAt ??= {});
    if (this.now - (at[kind] ?? -99) < n.every) return;
    at[kind] = this.now;
    this.dinos.noise(x, z, n.radius * (p.mods?.stalkerMul ?? 1), kind, p.id);
  }

  /** Dinosaurs see this much of their usual range (the volcano's ash rain). */
  sightMul() { return this.volcano?.sightMul() ?? 1; }

  /** Restore HP (capped at max HP). */
  healPlayer(p, amount) { p.hp = Math.min(p.maxHp, p.hp + amount); }

  // ------------------------------------------------------------------ base

  /** The camp functions available right now (hut on island 1, landing camp + base later). */
  stations() { return campStations(this.layout, this.base, this.levelIndex); }

  /** The zone dinosaurs keep out of: { x, z, r } or null (no base yet / base damaged). */
  safeZone() {
    // asked for every dinosaur step: computed once per tick (reset in step())
    if (this._safe === undefined) this._safe = baseSafeZone(this.layout, this.base, this.levelIndex);
    return this._safe;
  }

  /** Is `p` within `range` of any of the points? */
  nearAny(p, points, range) { return points.some((s) => s && this.near(p, s.x, s.z, range)); }

  /** Where players (re)spawn: around the base campfire once one stands (island 1: its camp fire once lit), else the landing beach. */
  spawnPoint(slot) {
    const plot = this.base.stage > 0 ? this.layout.basePlots[this.base.plot] : null;
    const pts = plot ? baseSpawnPoints(plot) : this.base.fireLit && this.layout.campSpawnPoints ? this.layout.campSpawnPoints : this.layout.spawnPoints;
    return pts[slot % pts.length];
  }

  publicBase() {
    const b = this.base;
    return { ...b, building: b.building && { stage: b.building.stage, left: r2(Math.max(0, b.building.until - this.now)) }, towers: b.towers.map(({ cool, ...t }) => t) };
  }

  /** Take `cost` from the hut store; false when the team can't afford it. Creative mode builds for free. */
  pay(p, cost) {
    if (p.creative) return true;
    if (!canAfford({ cost }, this.store)) return false;
    for (const [k, n] of Object.entries(cost)) this.store[k] -= n;
    return true;
  }

  /** Creative mode: a full quiver, spear, traps and gun reserves, topped up again and again. */
  creativeSupply(p) {
    const inv = p.inv, caps = this.caps();
    let changed = false;
    const set = (k, v) => { if (inv[k] !== v) { inv[k] = v; changed = true; } };
    if (inv.arrows < caps.arrows || inv.arrowUses.some((u) => u < W.bow.uses)) {
      inv.arrows = caps.arrows;
      inv.arrowUses = Array(caps.arrows).fill(W.bow.uses);
      changed = true;
    }
    set('bow', true);
    set('spear', true);
    set('spearFound', true);
    set('spearHealth', W.spear.durability);
    set('traps', Math.max(inv.traps, caps.traps));
    for (const [k, ammo] of Object.entries(inv.guns)) {
      if (ammo.owned === false) { ammo.owned = true; changed = true; }
      const full = CONFIG.weapons[k].reserve;
      if (ammo.reserve < full) { ammo.reserve = full; changed = true; }
    }
    if (changed) this.sendInv(p);
  }

  /** Island 1: put up the camp table on its site at the tent (shared/base.js CAMP_BENCH), paid from the hut store. */
  buildCampBench(p) {
    const site = this.stations().benchSite;
    if (!p.alive || !site || !this.near(p, site.x, site.z, CAMP_BENCH.reach + P.radius)) return;
    if (!this.pay(p, CAMP_BENCH.cost)) return this.toast('Not enough materials in the hut store for the camp table', 'crate', p.id);
    this.base.bench = true;
    this.event(EV.STORE, { store: this.store });
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`${p.name} built the camp table – craft supplies and first upgrades`, 'crate');
  }

  /** Island 1: light the cold camp fire the team washed ashore beside (ACT.BASE op 'kindle'): from now on it heals, and the team respawns round it. */
  kindleCampFire(p) {
    const fire = this.layout.arrival?.fire;
    if (!p.alive || !fire || this.base.fireLit || !this.near(p, fire.x, fire.z, CAMP_FIRE_REACH + 1)) return;
    this.base.fireLit = true;
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`${p.name} lit the camp fire – here you are safe`, 'flame');
    this.checkpoint('fire');
  }

  /** Build (op 'build' on a plot) or grow (op 'upgrade') the team's base from the hut store. */
  baseAction(p, m) {
    const b = this.base;
    const deny = (text) => this.toast(text, 'crate', p.id);
    if (m.op === 'bench') return this.buildCampBench(p);
    if (m.op === 'kindle') return this.kindleCampFire(p);
    if (!p.alive || !hasBasePlots(this.layout)) return;
    if (m.op === 'tower' || m.op === 'towerUp') return this.towerAction(p, m);
    if (m.op === 'repair') return this.repairBase(p);
    if (b.building) return deny('The team is already building – wait for it to finish');
    let plot, stage;
    if (m.op === 'build') {
      if (b.plot != null) return deny('Your base already stands on this island');
      plot = this.layout.basePlots[m.plot];
      if (!plot || !this.near(p, plot.x, plot.z, plot.r + PLOT_REACH)) return;
      stage = 1;
    } else if (m.op === 'upgrade') {
      plot = b.plot != null ? this.layout.basePlots[b.plot] : null;
      if (!plot || !this.near(p, plot.x, plot.z, plot.r + PLOT_REACH)) return;
      if (b.stage >= MAX_STAGE) return deny('Your base is fully built');
      stage = b.stage + 1;
    } else return;
    if (!this.pay(p, stageCost(stage, this.levelIndex))) return deny('Not enough loot in the hut store');
    if (m.op === 'build') b.plot = m.plot;
    b.building = { stage, until: this.now + BUILD_TIME, by: p.id };
    this.event(EV.STORE, { store: this.store });
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`${p.name} started building the ${BASE_STAGES[stage].name.toLowerCase()} – ${BUILD_TIME} s`, BASE_STAGES[stage].icon);
  }

  /** Build a tower on a free tower spot (op 'tower') or upgrade one (op 'towerUp'). Towers stand at once. */
  towerAction(p, m) {
    const b = this.base;
    const deny = (text) => this.toast(text, 'crate', p.id);
    const plot = b.plot != null ? this.layout.basePlots[b.plot] : null;
    if (!plot || b.stage < 1 || !this.near(p, plot.x, plot.z, plot.r + PLOT_REACH)) return;
    const slot = m.slot | 0;
    const slots = BASE_STAGES[b.stage].towerSlots;
    if (slot < 0 || slot >= TOWER_SLOTS.length) return;
    if (slot >= slots) return deny(slots ? `Grow the base to build more towers (${slots} spots)` : 'Towers need the lodge (stage 2)');
    const have = b.towers.find((t) => t.slot === slot);
    let kind, level;
    if (m.op === 'tower') {
      if (have) return deny('This tower spot is taken');
      kind = TOWERS[m.kind] ? m.kind : null;
      if (!kind) return;
      level = 1;
    } else {
      if (!have) return;
      if (have.level >= 2) return deny('This tower is fully upgraded');
      kind = have.kind;
      level = 2;
    }
    if (!this.pay(p, towerCost(kind, level, this.levelIndex))) return deny('Not enough loot in the hut store');
    const T = TOWERS[kind];
    if (have) {
      have.level = 2;
      have.hp = have.maxHp = Math.round(T.hp * 1.4);
      have.damaged = false;
    } else {
      b.towers.push({ slot, kind, level: 1, hp: T.hp, maxHp: T.hp, damaged: false, cool: 0 });
      applyBaseColliders(this.layout, b);
    }
    this.event(EV.STORE, { store: this.store });
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`${p.name} built: ${level >= 2 ? T.upgrade.name : T.name}`, T.icon);
  }

  /** Repair the base and every knocked-out tower after a raid (one payment for all). */
  repairBase(p) {
    const b = this.base;
    const plot = b.plot != null ? this.layout.basePlots[b.plot] : null;
    if (!plot || !this.near(p, plot.x, plot.z, plot.r + PLOT_REACH)) return;
    const cost = repairCost(b, this.levelIndex);
    if (!cost) return this.toast('Nothing to repair', 'crate', p.id);
    if (!this.pay(p, cost)) return this.toast('Not enough loot in the hut store', 'crate', p.id);
    if (b.damaged) { b.damaged = false; b.hp = b.maxHp; }
    for (const t of b.towers) if (t.damaged) { t.damaged = false; t.hp = t.maxHp; }
    this._safe = undefined;
    this.event(EV.STORE, { store: this.store });
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`${p.name} repaired the base`, 'home');
  }

  /** A stage under construction is finished: it stands, collides and works. */
  finishBuilding() {
    const b = this.base;
    const S = BASE_STAGES[b.building.stage];
    b.stage = b.building.stage;
    b.building = null;
    b.maxHp = S.hp;
    b.hp = S.hp;
    b.damaged = false;
    applyBaseColliders(this.layout, b);
    // nobody may end up inside the new walls
    for (const p of this.players.values()) {
      if (!p.alive || penetration(p.x, p.z, P.radius, this.layout.playerColliders, p.y + 0.05, p.y + P.height, P.stepHeight) <= 0.01) continue;
      const spot = findUnstuckSpot(this.terrain, this.layout, p.x, p.z);
      if (!spot) continue;
      p.x = spot.x; p.y = spot.y; p.z = spot.z;
      p.lastMoveAt = this.now;
      this.correct(p, { unstuck: 1 });
    }
    this.event(EV.BASE, { base: this.publicBase() });
    this.toast(`The ${S.name.toLowerCase()} is built! ${S.stage === 1 ? 'The campfire heals and dinosaurs keep away.' : ''}`, 'quest');
    this.checkpoint('base');
  }

  respawnPlayer(p) {
    const sp = this.spawnPoint(p.slot);
    p.alive = true;
    p.downed = false;
    p.lastStandUsed = false;
    p.invulnUntil = 0;
    p.hp = p.maxHp;
    p.x = sp.x; p.z = sp.z; p.y = this.terrain.heightAt(sp.x, sp.z);
    p.yaw = sp.yaw;
    p.lastMoveAt = this.now;
    p.moveBudget = 3.5;
    p.breath = DIVE.breath; p.drownT = 0;
    p.knockBudgetUntil = 0;
    if (p.inv.bow) p.inv.arrows = Math.max(p.inv.arrows, W.bow.startArrows);
    this.normalizeArrows(p.inv);
    if (!p.inv.spear) p.inv.spearHealth = W.spear.durability;
    p.inv.spear = true;
    p.inv.guns = this.gunInventory(); p.inv.reloading = null;
    this.sendInv(p);
    p.epoch++;
    this.event(EV.RESPAWN, { id: p.id, x: r2(p.x), z: r2(p.z), yaw: p.yaw, k: p.epoch });
  }

  // ------------------------------------------------------------------ messages

  receive(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    p.lastInput = this.now;
    p.lobbySeen = this.lobbyClock ?? 0;
    switch (msg.t) {
      // (nobody plays in the lobby: movement and actions wait for Start)
      case MSG.STATE: return this.inLobby ? undefined : this.onState(p, msg);
      case MSG.ACT: return this.inLobby ? undefined : this.receiveAction(p, msg);
      case MSG.PING: return this.send(id, { t: MSG.PONG, c: msg.c, now: r3(this.now) });
      case MSG.KICK: return this.onKick(p, msg);
      case MSG.START: return this.onStart(p);
    }
  }

  /** Seconds since `p` was last heard from (the host's silent-client timeout; the lobby has its own clock). */
  idleFor(p) {
    return this.inLobby ? (this.lobbyClock ?? 0) - p.lobbySeen : this.now - p.lastInput;
  }

  /** Who waits in the lobby: everything its screen shows (characters, outfits, skill trees). */
  lobbyState() {
    return {
      members: [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => ({
        id: p.id, slot: p.slot, name: p.name, outfit: p.outfit, host: p.key === OWNER_KEY,
        prof: { xp: p.prof.xp, bonus: p.prof.bonus, skills: { ...p.prof.skills } },
      })),
    };
  }

  /** Everyone in the lobby gets its current members (`except`: who just got them with the welcome). */
  sendLobby(except) {
    if (this.inLobby) this.event(EV.LOBBY, this.lobbyState(), except);
  }

  /**
   * The owner starts the expedition from its lobby: the island comes alive and every explorer gets
   * a fresh welcome to build it (as after sailing). Late joiners then play at once.
   */
  onStart(p) {
    if (!this.inLobby || p.key !== OWNER_KEY) return;
    this.inLobby = false;
    for (const q of this.players.values()) {
      Object.assign(q, { lastInput: this.now, lastMoveAt: this.now, epoch: q.epoch + 1 });
      this.send(q.id, { t: MSG.WELCOME, id: q.id, slot: q.slot, now: r3(this.now), k: q.epoch, inv: q.inv, world: this.fullState() });
      this.sendProf(q);
    }
    this.log(`start: ${this.players.size} explorer(s)`);
  }

  /**
   * The expedition's owner removes another explorer. The host (server/gameHost.js `kick`) tells
   * them why, closes their connection and keeps them out of this expedition; the character stays
   * in the roster like any other leave. A host without `kick` (the solo worker) ignores it.
   */
  onKick(p, msg) {
    const target = this.players.get(msg.id);
    if (p.key !== OWNER_KEY || !target || target === p || typeof this.host.kick !== 'function') return;
    this.log(`kick #${target.id} "${target.name}" by #${p.id}`);
    this.host.kick(target.id, 'The host removed you from this expedition.');
  }

  /**
   * Tell a client where it really is. Bumps the player's correction epoch, so
   * state packets it sent before receiving this (still based on the old
   * position) are ignored instead of being rejected one by one.
   */
  correct(p, extra) {
    p.epoch++;
    this.send(p.id, { t: MSG.CORRECT, x: r2(p.x), y: r2(p.y), z: r2(p.z), k: p.epoch, s: p.lastSeq, ...extra });
  }

  onState(p, m, { historical = false, at = this.now } = {}) {
    if (!p.alive) return false;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    // stale (sent before the last correction/teleport) or overtaken (unreliable transport)
    if (num(m.k, p.epoch) !== p.epoch) return false;
    if (Number.isFinite(m.s)) {
      if (m.s <= p.lastSeq) return false;
      p.lastSeq = m.s;
    }
    const previous = { x: p.x, y: p.y, z: p.z };
    const x = num(m.x, p.x), z = num(m.z, p.z);
    let y = num(m.y, p.y);
    // the roof of the Hollow Mountain caps the height (Infinity elsewhere)
    y = Math.min(y, this.terrain.ceilingAt(x, z) - P.height - 0.05);
    // A small distance reserve accommodates packet bunching without allowing
    // repeated state packets to move faster than the player's sprint.
    const creative = p.creative;
    const sinceLast = Math.max(0, at - p.lastMoveAt);
    // a dash briefly lifts the cap by its distance (grantDash)
    const cap = creative ? 10 : at < p.dashUntil ? MOVE_RESERVE + DASH.distance + 1 : at < p.knockBudgetUntil ? 7 : MOVE_RESERVE;
    p.moveBudget = Math.min(cap,
      p.moveBudget + Math.max(0, at - p.lastMoveAt) * (creative ? P.creative.flySpeed + 4 : 11 * (p.buffs?.quickfoot > at ? CONFIG.fruit.buffs.quickfoot.speedMul : 1)));
    p.lastMoveAt = at;
    const distance = Math.hypot(x - p.x, z - p.z);
    const lim = CONFIG.world.size / 2 - 5;
    const ground = this.layout.groundAt(x, z, y + P.stepHeight);
    resolveCircle(x, z, P.radius, this.layout.playerColliders, collisionResult, y + 0.05, y + P.height, P.stepHeight - 0.05);
    const blocked = Math.hypot(collisionResult.x - x, collisionResult.z - z) > 0.6 || this.groveBlocks(p, x, z);
    // diving: wholly under the surface a body swims at DIVE.vertical m/s up or down at most and never below the bottom
    const wet = !creative && this.terrain.waterDepthAt(x, z) > P.swim.depth - 0.2 && this.terrain.waterDepthAt(p.x, p.z) > P.swim.depth - 0.2;
    const diveBad = wet && (y < ground - 0.35 || Math.abs(y - p.y) > DIVE.vertical * 1.5 * sinceLast + 1.2);
    if (diveBad || distance > p.moveBudget + 0.05 || Math.abs(x) > lim || Math.abs(z) > lim ||
        !Number.isFinite(ground) || y < ground - 2 || y > ground + (creative ? P.creative.maxHeight + 5 : 20) ||
        // rivers and lakes may be swum; only the open sea is off-limits
        (!creative && this.terrain.seaDepthAt(x, z) > CONFIG.world.maxWadeDepth + 0.2) || blocked ||
        // the Hollow Mountain's rock is closed to anyone on foot: no climbing its flanks, no standing on its top
        (this.terrain.isCave && !creative && this.terrain.heightAt(x, z) > CAVE_WALK_MAX)) {
      if (!historical) this.correct(p);
      return false;
    }
    p.moveBudget -= distance;
    p.x = x; p.z = z; p.y = y;
    p.yaw = num(m.yaw, p.yaw);
    p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, num(m.pitch, p.pitch)));
    p.spd = Math.max(0, Math.min(20, num(m.spd, 0)));
    p.eq = Math.max(0, Math.min(EQUIP.length - 1, m.eq | 0));
    p.fl = (m.fl | 0) & (63 | PF.DASH | (p.inv.torch ? PF.TORCH : 0));   // DOWNED is the server's to set; a lit torch only with one in the pack
    if (this.terrain.headUnderwater(p.x, p.y, p.z)) p.fl &= ~PF.TORCH;     // ... and it goes out under water
    if (p.fl & PF.SPRINT) {
      if (!p.sprinting) p.sprintArmed = true;   // Sprint Strike arms when a sprint starts
      p.sprinting = true;
      p.lastSprintAt = at;
    } else p.sprinting = false;
    if (!historical) {
      if (p.sprinting) this.playerNoise(p, 'sprint');
      else if (p.spd > 0.6) this.playerNoise(p, 'walk');
      this.resolvePlayerDinos(p, previous);
      const h = (p.stateHistory ??= []);
      h.push({ s: p.lastSeq, at, epoch: p.epoch, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        spd: p.spd, eq: p.eq, fl: p.fl, moveBudget: p.moveBudget, lastMoveAt: at });
      while (h.length > 64) h.shift();
    }
    return true;
  }

  receiveAction(p, m) {
    const state = m.state;
    // The client dashes in the same state packet: grant the distance before that state is validated.
    if (m.a === ACT.DASH) this.grantDash(p);
    // The dev pin teleport carries the pose it jumps to: never validate that as movement (onAct checks devTools/creative).
    if (m.a === ACT.DEV_TP) return this.onAct(p, m);
    // Dead or downed clients send no usable movement: these acts don't need a pose.
    if (!p.alive && (m.a === ACT.SKILL || m.a === ACT.RESPAWN)) return this.onAct(p, m);
    if (!state) return this.onAct(p, m); // compatible with older clients
    if (!Number.isSafeInteger(state.s) || !Number.isSafeInteger(state.k) || state.k !== p.epoch ||
        !['x', 'y', 'z', 'yaw', 'pitch', 'spd', 'eq', 'fl'].every(key => Number.isFinite(state[key]))) return;
    if (state.s > p.lastSeq) {
      if (this.onState(p, state)) this.onAct(p, m);
      return;
    }
    // A newer unreliable state may overtake this reliable action. Validate
    // its origin between the two accepted checkpoints, without moving the
    // current player backwards or bypassing distance/collision authority.
    const h = p.stateHistory ?? [];
    const exact = h.find(s => s.s === state.s && s.epoch === p.epoch);
    let pose = exact;
    if (!pose) {
      const before = h.findLast(s => s.s < state.s && s.epoch === p.epoch);
      const after = h.find(s => s.s > state.s && s.epoch === p.epoch);
      if (!before || !after) return;
      const candidate = { ...p, ...before, lastSeq: before.s };
      if (!this.onState(candidate, state, { historical: true, at: after.at }) ||
          Math.hypot(candidate.x - after.x, candidate.z - after.z) > candidate.moveBudget + 0.05) return;
      pose = candidate;
    }
    if (m.a === ACT.UNSTUCK || m.a === ACT.CREATIVE) return this.onAct(p, m);
    const keys = ['x', 'y', 'z', 'yaw', 'pitch', 'spd', 'eq', 'fl'];
    const saved = Object.fromEntries(keys.map(key => [key, p[key]]));
    Object.assign(p, Object.fromEntries(keys.map(key => [key, pose[key]])));
    try { return this.onAct(p, m); } finally { Object.assign(p, saved); }
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
      const sp = this.spawnPoint(p.slot);
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
    if (horizontal > DINO_SIGHTING.range) return false;
    const eyeY = p.y + P.eyeHeight;
    const targetY = d.y + (d.type === 'brachio' ? 5 : d.type === 'trex' ? 2.5 : 1);
    const dy = targetY - eyeY;
    const distance = Math.hypot(horizontal, dy);
    if (distance > DINO_SIGHTING.range) return false;
    const forward = (-dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)) / Math.max(horizontal, 0.001);
    if (forward < DINO_SIGHTING.forward || Math.abs(Math.atan2(dy, horizontal) - p.pitch) > DINO_SIGHTING.pitch) return false;
    return !lineBlocked({ x: p.x, y: eyeY, z: p.z }, { x: d.x, y: targetY, z: d.z }, this.terrain, this.layout);
  }

  onAct(p, m) {
    const inv = p.inv;
    switch (m.a) {
      case ACT.CREATIVE: {
        const on = !!m.on;
        if (on === !!p.creative) return;
        p.creative = on;
        if (on) this.creativeUsed = true;
        this.refreshMods(p);
        this.sendProf(p);
        if (on && p.alive) { p.hp = p.maxHp; this.creativeSupply(p); }
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
        this.playerNoise(p, 'melee');
        this.dinos.damage(d, W.spear.damage * (1 + this.mods().spearDamage), plausibleZone(d, pose, m.p, m.zone), p.id, 'spear');   // skill multipliers: DinoSystem.damage
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
          if (!inv.bow || inv.arrows <= 0) return;
          this.normalizeArrows(inv);
          health = inv.arrowUses.shift() - 1;
          inv.arrows--;
        } else {
          if (!inv.spear) return;
          health = Math.max(0, (inv.spearHealth ?? W.spear.durability) - W.spear.useWear);
          inv.spear = false;
          inv.spearHealth = 0;
        }
        this.playerNoise(p, 'bow');   // a bow string or a throw (ai/senses.js)
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
        } else if (GUNS.includes(it.kind)) {
          if (!inv.guns[it.kind] || inv.guns[it.kind].owned !== false) return;
          inv.guns[it.kind] = { ...it.ammo, owned: true };
        } else if (it.kind === 'torch') {
          if (inv.torch) return this.fullAlert(p, 'You already carry a torch', 'torch');
          inv.torch = true;
          this.toast('Torch taken – light it with L', 'torch', p.id);
          const spawn = this.torchSpawns[it.spot];
          if (spawn) { spawn.item = null; spawn.respawnAt = this.now + TORCH.respawnTime; }
        } else if (it.kind === 'trap') {
          if (inv.traps + it.n > caps.traps) return this.fullAlert(p, 'You cannot carry more traps', 'trap');
          inv.traps += it.n;
        } else if (CONFIG.fruit.types[it.kind]) {
          if (inv.fruit.length + it.n > caps.fruit) return this.fullAlert(p, 'Your fruit pouch is full', 'fruit');
          inv.fruit.push(...Array(it.n).fill(it.kind));
        } else if (CONFIG.loot[it.kind]) {
          if (!this.addLoot(p, it.kind, it.n)) return;
        } else return;
        this.removeItem(it.id, p.id);
        this.sendInv(p);
        this.mission.onLootChanged();
        return;
      }
      case ACT.GATHER: {
        if (!p.alive) return;
        const r = this.resources[m.spot | 0];
        const spot = this.layout.resourceSpots[m.spot | 0];
        if (!r || !spot || !r.up || !this.near(p, spot.x, spot.z, CONFIG.resources.reach + 1)) return;
        if (!this.addLoot(p, spot.type, 1)) return;
        r.up = false;
        r.regrowAt = this.now + CONFIG.resources.regrow[spot.type];
        this.event(EV.RESOURCE, { spot: spot.id, up: false, by: p.id });
        this.sendInv(p);
        this.mission.onLootChanged();
        return;
      }
      case ACT.LIGHT: {
        // a wall torch, lit with the hand torch: it must be burning (PF.TORCH: owned, raised, not under water) and near
        const wt = this.layout.wallTorches?.[m.torch | 0];
        if (!p.alive || !wt || this.wallTorchesLit.has(wt.id) || !(p.fl & PF.TORCH)) return;
        if (!this.near(p, wt.x, wt.z, WALL_TORCH.reach + 1)) return;
        this.wallTorchesLit.add(wt.id);
        this.event(EV.WALL_TORCH, { torch: wt.id, by: p.id });
        return;
      }
      case ACT.READ: return this.story.read(p, m.note);
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
        this.stopRevive(p);
        this.sendInv(p);
        this.event(EV.EAT, { id: p.id, fruit: type });
        return;
      }
      case ACT.GIVE: {
        if (!p.alive || inv.fruit.length === 0) return;
        const q = this.players.get(m.to);
        if (!q || !q.alive || q === p || !this.near(p, q.x, q.z, P.giveRange + 1.5)) return;
        // Field Medic: { to, heal: true } feeds the teammate one of my fruit on the spot instead of handing it over
        if (m.heal && p.mods.fieldMedic) {
          if (p.eating || q.hp >= q.maxHp) return;
          const type = inv.fruit.splice(this.bestFruitIndex(p, q), 1)[0];
          this.applyFruit(q, type, p);
          this.sendInv(p);
          this.event(EV.HEAL, { id: q.id, by: p.id, hp: Math.ceil(q.hp) });
          return;
        }
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
      case ACT.DROP: {
        if (!p.alive || p.downed) return;
        const kind = m.kind;
        let n = 0, health = null;
        if (LOOT_KEYS.includes(kind)) { n = inv.loot[kind] || 0; inv.loot[kind] = 0; }
        else if (Object.hasOwn(CONFIG.fruit.types, kind)) {
          n = inv.fruit.filter(f => f === kind).length;
          inv.fruit = inv.fruit.filter(f => f !== kind);
        } else if (GUNS.includes(kind)) {
          if (!inv.guns[kind] || inv.guns[kind].owned === false) return;
          const ammo = { loaded: inv.guns[kind].loaded, reserve: inv.guns[kind].reserve };
          inv.guns[kind] = { owned: false, loaded: 0, reserve: 0 };
          if (inv.reloading === kind) inv.reloading = null;
          this.dropInventoryItem(p, kind, 1, null, ammo);
          this.sendInv(p); return;
        } else if (kind === 'trap') { n = inv.traps; inv.traps = 0; }
        else if (kind === 'spear' && inv.spear) {
          n = 1; health = inv.spearHealth; inv.spear = false; inv.spearHealth = 0;
        } else if (kind === 'arrow') {
          this.normalizeArrows(inv);
          const counts = new Map();
          for (const uses of inv.arrowUses) counts.set(uses, (counts.get(uses) || 0) + 1);
          for (const [uses, count] of counts) this.dropInventoryItem(p, kind, count, uses);
          inv.arrows = 0; inv.arrowUses = [];
          this.sendInv(p); return;
        }
        if (!n) return;
        this.dropInventoryItem(p, kind, n, health);
        this.sendInv(p);
        this.mission.onLootChanged();
        return;
      }
      case ACT.DEPOSIT: {
        if (!p.alive) return;
        if (m.kind != null && !LOOT_KEYS.includes(m.kind)) return;
        if (!this.nearAny(p, this.stations().dropOff, 6)) {
          if (m.kind != null) this.toast('Move closer to a hut drop-off to store loot', 'crate', p.id);
          return;
        }
        let total = 0;
        const parts = [];
        for (const k of LOOT_KEYS) {
          if (m.kind != null && k !== m.kind) continue;
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
        const wd = this.stations().wardrobe;
        if (!wd || !this.near(p, wd.x, wd.z, 6)) return;
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
      case ACT.SAIL: {
        // a player at the repaired boat decides when the team leaves (sim/mission.js sail)
        const reason = this.mission.sail(p);
        if (reason) this.toast(reason, 'boat', p.id);
        return;
      }
      case ACT.UNSTUCK: return this.unstuck(p, !!m.manual);
      case ACT.DEV_TP: {
        // dev pin tool (client/core/devPins.js): revisit a pinned spot. Only a solo world started with ?dev allows it
        // (`devTools`, set by sim/worker.js), and only in creative mode; never on a hosted server.
        if (!this.devTools || !p.creative || ![m.x, m.y, m.z].every(Number.isFinite)) return;
        const lim = this.terrain.half;
        p.x = Math.max(-lim, Math.min(lim, m.x)); p.z = Math.max(-lim, Math.min(lim, m.z)); p.y = m.y;
        p.lastMoveAt = this.now;
        p.moveBudget = 3.5;
        this.correct(p);
        return;
      }
      case ACT.BUTCHER: return m.stop ? this.stopButcher(p) : this.startButcher(p, m.dino);
      case ACT.REFILL: {
        if (!p.alive || !this.nearAny(p, this.stations().refill, 6)) return;
        // free basic resupply only; everything else is crafted (ACT.CRAFT)
        if (inv.bow) inv.arrows = Math.max(inv.arrows, Math.min(W.bow.startArrows, this.caps().arrows));
        this.normalizeArrows(inv);
        // (a spear only for whoever has had one: island 1's explorers take Jonas' first)
        if (inv.spearFound) {
          if (!inv.spear) inv.spearHealth = W.spear.durability;
          inv.spear = true;
        }
        inv.guns = this.gunInventory(); inv.reloading = null;
        this.sendInv(p);
        this.toast('Basic ammunition resupplied', 'arrow', p.id);
        return;
      }
      case ACT.CRAFT: return this.craft(p, m.recipe);
      case ACT.BASE: return this.baseAction(p, m);
      case ACT.SKILL: return this.skillAction(p, m);
      case ACT.REVIVE: return m.stop ? this.stopRevive(p) : this.startRevive(p, m.to);
      case ACT.DASH: return;   // already granted in receiveAction, ahead of the bundled state
      case ACT.RESPAWN: {
        // giving up while downed (after the bleed-out grace): true death, back on the beach at once
        if (p.downed && this.now - p.downedAt >= P.respawnDelay) this.defeatPlayer(p, null, 0);
        return;
      }
    }
  }

  /** Craft a supply or a team upgrade from the hut store at the workbench. */
  craft(p, id) {
    const st = this.stations();
    const h = st.workbench;
    const r = RECIPE_BY_ID[id];
    const deny = (text) => this.toast(text, 'crate', p.id);
    if (!h) return deny(st.benchSite ? 'Build the camp table first' : 'Build a camp first – its workbench crafts');
    if (!r || !p.alive || !this.near(p, h.x, h.z, 6)) return;
    const inv = p.inv;
    if (unlockIsland(r) > this.levelIndex + 1) return deny(`${r.name} unlocks on island ${unlockIsland(r)}`);
    if (st.miniBench && (r.tier || 0) > CAMP_BENCH.maxTier) return deny('The camp table only makes tier-1 recipes');
    if (r.kind === 'upgrade') {
      if (this.upgrades.has(r.id)) return deny(`${r.name} is already built`);
      if (r.requires && !this.upgrades.has(r.requires)) return deny(`Build ${RECIPE_BY_ID[r.requires].name} first`);
    } else {
      const caps = this.caps();
      if (r.give.arrows && inv.arrows >= caps.arrows) return deny('Your quiver is full');
      if (r.give.traps && inv.traps >= caps.traps) return deny('You carry as many traps as you can');
      if (r.give.spear && inv.spear) return deny('You still have your spear');
    }
    if (!this.pay(p, r.cost)) return deny('Not enough loot in the hut store');
    if (r.kind === 'upgrade') {
      this.upgrades.add(r.id);
      this.toast(`${p.name} built: ${r.name}!`, 'quest');
      this.onCapsChanged();
    } else {
      const caps = this.caps();
      if (r.give.arrows) { inv.arrows = Math.min(caps.arrows, inv.arrows + r.give.arrows); this.normalizeArrows(inv); }
      if (r.give.traps) inv.traps = Math.min(caps.traps, inv.traps + r.give.traps);
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

  /** Which of p's fruit to eat (or feed `target`, default p themself). */
  bestFruitIndex(p, target = p) {
    const f = p.inv.fruit;
    const missing = target.maxHp - target.hp;
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

  dropInventoryItem(p, kind, n, health, ammo = null) {
    const item = this.spawnItem(kind, p.x - Math.sin(p.yaw) * 1.5, p.z - Math.cos(p.yaw) * 1.5, n, null, health, false);
    item.droppedBy = p.id;
    if (ammo) item.ammo = ammo;
    this.event(EV.ITEM_ADD, { item });
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

  /**
   * One torch on the ground at each `layout.torchSpots` entry (islands without
   * spots have none). A taken torch comes back after `TORCH.respawnTime`, so
   * every player can get one; a player who already owns one does not use it up.
   */
  placeTorches() {
    this.torchSpawns = (this.layout.torchSpots ?? []).map((s, spot) => ({ spot, x: s.x, z: s.z, y: Number.isFinite(s.y) ? s.y : null, item: null, respawnAt: 0 }));
    for (const s of this.torchSpawns) this.#spawnTorch(s, false);
  }

  /**
   * The reward of a dive: each `layout.sumps` entry has a cache of loot (teeth, claws, plates, bones, a skull) on the floor
   * of its submerged passage, in a ring a metre or two wide. It never despawns and nothing else needs it (`keep`).
   */
  placeSumpCaches() {
    for (const sm of this.layout.sumps ?? []) {
      const entries = Object.entries(sm.cache.loot);
      const total = entries.reduce((a, [, n]) => a + n, 0);
      let i = 0;
      for (const [kind, n] of entries) {
        for (let k = 0; k < n; k++, i++) {
          const a = (i / total) * Math.PI * 2, r = 0.5 + (i % 2) * 0.9;
          this.spawnItem(kind, sm.cache.x + Math.cos(a) * r, sm.cache.z + Math.sin(a) * r, 1, null, null, false).keep = true;
        }
      }
    }
  }

  #spawnTorch(s, publish) {
    const it = this.spawnItem('torch', s.x, s.z, 1, s.y, null, false);
    it.spot = s.spot;
    if (publish) this.event(EV.ITEM_ADD, { item: it });
    s.item = it.id;
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
    // (the island and its clock wait for Start: raids, eruptions and regrowth are timed by `now`;
    // only the lobby's own clock runs, for the silent-client timeout)
    if (this.inLobby) { this.lobbyClock = (this.lobbyClock ?? 0) + dt; return; }
    this.now += dt;
    this._safe = undefined;
    if (this.base.building && this.now >= this.base.building.until) this.finishBuilding();

    // Healing Aura sources (the strongest aura in range counts, they never stack)
    let auras = null;
    for (const p of this.players.values()) if (p.alive && p.mods.auraHps > 0) (auras ??= []).push(p);

    for (const p of this.players.values()) {
      updateGunReload(this, p);
      if (p.creative && p.alive && this.now >= (p.nextSupplyAt ?? 0)) {
        p.nextSupplyAt = this.now + 0.5;
        this.creativeSupply(p);
      }
      if (p.butcher) this.updateButcher(p);
      if (!p.alive) {
        if (p.downed) this.updateDowned(p, dt);
        else {
          p.deadT -= dt;
          if (p.deadT <= 0) this.respawnPlayer(p);
        }
        continue;
      }
      if (p.reviving) this.updateRevive(p);
      // eating
      if (p.eating) {
        p.eating.t -= dt;
        if (p.eating.t <= 0) {
          const type = p.eating.type;
          p.eating = null;
          this.applyFruit(p, type);
        }
      }
      if (p.hot) {
        this.healPlayer(p, p.hot.rate * dt);
        p.hot.t -= dt;
        if (p.hot.t <= 0) p.hot = null;
      }
      // Regeneration (out of combat) and teammates' Healing Aura
      if (p.hp < p.maxHp) {
        let rate = p.mods.regenHps > 0 && this.now - p.lastHurtAt >= p.mods.regenDelay ? p.mods.regenHps : 0;
        if (auras) {
          let best = 0;
          for (const a of auras) if (a !== p && a.mods.auraHps > best && this.near(p, a.x, a.z, a.mods.auraRadius)) best = a.mods.auraHps;
          rate += best;
        }
        if (rate > 0) this.healPlayer(p, rate * dt);
      }
      this.breathe(p, dt);
      if (!p.alive) continue;
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
        this.awardXp(RELIC_XP, 'Boat part', RELIC_POINTS);
        this.checkpoint('relic');
      }
      // the hunter's camp (island 1): walk up to it to take your own bow, with a full quiver's start
      const camp = this.layout.bowCamp;
      if (camp && !p.inv.bow && (camp.x - p.x) ** 2 + (camp.z - p.z) ** 2 <= W.bow.pickupReach ** 2 && Math.abs(camp.y - p.y) < 3) {
        p.inv.bow = true;
        p.inv.arrows = Math.max(p.inv.arrows, Math.min(W.bow.startArrows, this.caps().arrows));
        this.normalizeArrows(p.inv);
        this.event(EV.BOW_FOUND, { id: p.id });
        this.toast(`${p.name} found a bow`, 'bow');
        this.sendInv(p);
      }
      // island 1's arrival: walk up to Jonas' spear in the sand to take it (whoever has none)
      const spear = this.layout.arrival?.spear;
      if (spear && !p.inv.spear && (spear.x - p.x) ** 2 + (spear.z - p.z) ** 2 <= W.spear.pickupRange ** 2 && Math.abs(spear.y - p.y) < 3) {
        p.inv.spear = p.inv.spearFound = true;
        p.inv.spearHealth = W.spear.durability;
        this.event(EV.SPEAR_FOUND, { id: p.id });
        this.toast(`${p.name} took Jonas' spear`, 'spear');
        this.sendInv(p);
      }
      // the hut / the base campfire is a safe, healing place
      const st = this.stations();
      if (st.fire && p.hp < p.maxHp && this.near(p, st.fire.x, st.fire.z, st.healR)) {
        this.healPlayer(p, P.hutHealPerSecond * st.healRate * dt);
      }
    }

    // fruit regrowth
    for (const f of this.fruit) {
      if (f.count === 0 && this.now >= f.regrowAt) {
        f.count = this.rollFruitCount();
        this.event(EV.FRUIT, { spot: f.spot, count: f.count });
      }
    }
    // map resources grow back
    for (const r of this.resources) {
      if (!r.up && this.now >= r.regrowAt) {
        r.up = true;
        this.event(EV.RESOURCE, { spot: r.spot, up: true });
      }
    }
    // taken torches at their spots come back
    for (const s of this.torchSpawns) if (s.item === null && this.now >= s.respawnAt) this.#spawnTorch(s, true);
    // stale items
    for (const it of this.items.values()) {
      if (it.dino) this.updateAttachedItem(it);
      if (it.kind === 'torch' || it.keep) continue;
      const life = it.kind === 'arrow' ? W.bow.arrowLifetime * 3 : it.kind === 'spear' ? Infinity : CONFIG.lootDespawn;
      if (this.now - it.t > life) this.removeItem(it.id);
    }
    // forgotten projectiles
    for (const [k, pr] of this.projectiles) if (this.now - pr.t > 20) this.projectiles.delete(k);
    // old tracks
    while (this.tracks.length && this.now - this.tracks[0].t > CONFIG.tracks.lifetime) this.tracks.shift();

    this.dinos.update(dt);
    updateTowers(this, dt);
    this.raids.update(dt);
    this.volcano.update(dt);
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
      const fl = q.fl | (q.eating ? 4 : 0) | (q.downed ? PF.DOWNED : 0);
      p.push([q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.yaw), r3(q.pitch), r2(q.spd), q.eq, fl, Math.ceil(q.hp), q.alive ? 1 : 0, carry, q.maxHp]);
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
    return { t: MSG.SNAP, now: r3(this.now), w: this.worldEpoch, n: this.snapSeq, tickMs: r2(this.tickDurationMs ?? 0), p, d: rows };
  }

  /** A fresh set of firearms. */
  gunInventory() {
    return gunInventory();
  }

  fullState() {
    return {
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      dinos: this.dinos.describeAll(),
      items: [...this.items.values()],
      fruit: this.fruit.map((f) => f.count),
      resources: this.resources.filter((r) => !r.up).map((r) => r.spot),   // the spots gathered right now
      wallTorches: [...(this.wallTorchesLit ?? [])],
      story: this.story.public(),
      spottedDinos: [...this.spottedDinos],
      traps: [...this.traps.values()],
      tracks: this.tracks.slice(-200),
      mission: this.mission.state(),
      store: this.store,
      level: { index: this.levelIndex, variant: this.variant },
      relics: this.relics.map((r) => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, z: r.z, found: r.found })),
      boat: { repaired: this.mission.phase !== 'search' },
      base: this.publicBase(),
      raid: this.raids.public(),
      volcano: this.volcano.public(),
    };
  }
}
