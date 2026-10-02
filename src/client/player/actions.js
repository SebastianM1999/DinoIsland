// Local player actions: tool slots, spear/bow combat, trap + bait placement,
// eating and giving fruit, E-interactions (pickup, harvest, hut), carry
// slowdown, and the HUD parts that depend on them (hotbar, prompt, hints).
// Every gameplay effect is a request to the authoritative server.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { ACT, EV, PF, EQUIP } from '../../shared/protocol.js';
import { shotEnd } from '../../shared/gunshots.js';
import { insideGrove } from '../../shared/grove.js';
import { segmentColliders } from '../../shared/collision.js';
import { dinoBodyCircles } from '../../shared/dinoContact.js';
import { PLOT_KINDS, MAX_STAGE, plotPoint } from '../../shared/base.js';
import { stakePoint } from '../world/base.js';
import { upgradeMods } from '../../shared/crafting.js';
import { GunEffects } from '../entities/gunEffects.js';
import { spearLaunch } from './spearThrow.js';
import { Viewmodel } from './viewmodel.js';
import { mesh } from '../models/kit.js';
import { trapGeometry, meatGeometry } from '../models/weapons.js';

const W = CONFIG.weapons;
const P = CONFIG.player;
/** Warn about dinosaurs (all but the Brachiosaurus) closer than this (m). */
const DINO_ALERT_RANGE = 50;
const LOOT_KEYS = Object.keys(CONFIG.loot);
const SLOT_LABEL = { spear: 'Spear', bow: 'Bow', trap: 'Trap', bait: 'Meat bait', fruit: 'Fruit', pistol: 'P-19 pistol', rifle: 'M4A1 rifle' };
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _eye = new THREE.Vector3();

export class PlayerActions {
  constructor(game) {
    this.game = game;
    this.vm = new Viewmodel(game.gfx, game.me.slot);
    this.gunEffects = new GunEffects(game);
    this.reloadT = 0;
    this.cooldown = 0;
    this.drawT = 0;
    this.drawing = false;
    this.eatingT = 0;
    this.butcher = null;     // { dino, t, time, x, z, confirmed } while holding V at a carcass
    this.butcherRetry = 0;
    this.autoPickT = 0;
    this.pickRequested = new Map();   // item id -> time until we may ask again
    this.nextFullAlert = 0;
    this.lastFullText = '';
    this.lastLoot = 0;
    this.promptAction = null;

    // placement ghosts
    const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffe07a', transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostTrap = new THREE.Mesh(trapGeometry(false), ghostMat);
    this.ghostBait = new THREE.Mesh(meatGeometry(), ghostMat);
    this.ghostBait.scale.setScalar(1.6);
    this.ghostTrap.visible = this.ghostBait.visible = false;
    game.gfx.scene.add(this.ghostTrap, this.ghostBait);

    const net = game.net;
    net.on(`ev:${EV.EAT}`, (m) => {
      if (m.id !== game.me.id) return;
      this.eatingT = CONFIG.fruit.eatTime;
      this.vm.eat(m.fruit, CONFIG.fruit.eatTime);
      game.audio?.play('eat');
    });
    net.on(`ev:${EV.BUTCHER}`, (m) => {
      if (m.id !== game.me.id) return;
      if (!m.dino) this.butcher = null;                       // finished or cancelled by the server
      else if (this.butcher?.dino === m.dino) { this.butcher.confirmed = true; this.butcher.time = m.t; }
    });
    net.on(`ev:${EV.DINO_HIT}`, (m) => {
      if (m.by !== game.me.id) return;
      game.hud.hitMarker(m.weak);
      if (m.armor) game.hud.toast('The plates deflect your hit – aim for the flank or neck!', 'info');
      game.audio?.play(m.weak ? 'hitWeak' : 'hit');
    });
    net.on(`ev:${EV.DEATH}`, (m) => {
      if (m.id !== game.me.id) return;
      this.drawing = false;
      this.drawT = 0;
      game.hud.prompt(null);
      game.hud.eatProgress(null);
    });
  }

  get inv() { return this.game.me.inv; }
  /** Effects of the team's workbench upgrades (server sends the built ids with every inventory). */
  get mods() { return upgradeMods(this.inv.upgrades); }
  get tool() { return EQUIP[this.game.eq]; }

  // ------------------------------------------------------------------ helpers

  aim() {
    const cam = this.game.gfx.camera;
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    // Gameplay origin: the eye without head bob, landing dip or correction
    // glide, i.e. the point the server validates shots against.
    const p = this.game.player.pos;
    _eye.set(p.x, p.y + P.eyeHeight, p.z);
    return { origin: _eye, dir: _fwd, right: _right, up: _up };
  }

  bestFruit() {
    const f = this.inv.fruit;
    if (!f.length) return null;
    const missing = P.maxHealth - this.game.me.hp;
    let best = null, bestHeal = Infinity, biggest = null, bigHeal = -1;
    for (const t of f) {
      const h = CONFIG.fruit.types[t].heal;
      if (h >= missing && h < bestHeal) { best = t; bestHeal = h; }
      if (h > bigHeal) { biggest = t; bigHeal = h; }
    }
    return best || biggest;
  }

  carryWeight() {
    let w = 0;
    for (const k of LOOT_KEYS) w += (this.inv.loot[k] || 0) * CONFIG.loot[k].weight;
    return w;
  }

  placementPoint() {
    const p = this.game.player;
    const d = 2.8;
    const x = p.pos.x - Math.sin(p.yaw) * d, z = p.pos.z - Math.cos(p.yaw) * d;
    return { x, z, y: this.game.terrain.heightAt(x, z), yaw: p.yaw };
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    const g = this.game;
    const input = g.input;
    const alive = g.me.alive;
    const net = g.net;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.eatingT = Math.max(0, this.eatingT - dt);
    const eating = this.eatingT > 0;
    const panel = g.hud.isPanelOpen();

    // --- slot selection
    for (let i = 0; i < EQUIP.length; i++) if (input.wasPressed(`slot${i + 1}`)) this.select(i);
    const wheel = g.lastWheel || 0;
    if (wheel) this.select((g.eq + (wheel > 0 ? 1 : EQUIP.length - 1)) % EQUIP.length);

    // --- carry slowdown (and eating makes you slow and vulnerable)
    const w = this.carryWeight();
    g.player.speedFactor = Math.max(P.minCarrySpeed, 1 - w * P.carrySlowPerUnit) * (eating ? 0.5 : 1) * (this.butcher ? 0.35 : 1);

    const tool = this.tool;
    const canAct = alive && !eating && !panel && input.locked;

    // --- primary / secondary per tool
    if (tool === 'spear') {
      if (canAct && input.wasPressed('primary') && this.cooldown <= 0 && this.inv.spear) this.stab();
      if (canAct && input.wasPressed('secondary') && this.cooldown <= 0 && this.inv.spear) this.throwSpear();
    } else if (tool === 'bow') {
      if (canAct && input.isHeld('primary') && this.inv.arrows > 0 && this.cooldown <= 0) {
        if (!this.drawing) g.audio?.play('bowDraw');
        this.drawing = true;
        this.drawT = Math.min(W.bow.maxDrawTime, this.drawT + dt);
      }
      if (this.drawing && (!input.isHeld('primary') || !canAct)) {
        if (canAct && this.drawT >= W.bow.minDrawToFire) this.shootArrow();
        this.drawing = false;
        this.drawT = 0;
        this.vm.release();
      }
    } else if (tool === 'pistol' || tool === 'rifle') {
      const ammo = this.inv.guns?.[tool];
      const ready = canAct && this.vm.tool === tool && !this.vm.pendingTool && this.vm.switchT < 0.05;
      if (ready && input.wasPressed('reloadHint')) this.reloadGun();
      const trigger = tool === 'rifle' ? input.isHeld('primary') : input.wasPressed('primary');
      if (ready && trigger && this.cooldown <= 0 && !this.inv.reloading) {
        if (ammo?.loaded > 0) this.shootGun();
        else { g.audio?.play('empty'); this.cooldown = 0.25; }
      }
    } else if (tool === 'fruit') {
      if (canAct && input.wasPressed('primary')) this.eat();
    }
    if (tool !== 'bow' && this.drawing) { this.drawing = false; this.drawT = 0; }
    this.gunEffects.update(dt);
    this.reloadT = this.inv.reloading ? this.reloadT + dt : 0;
    // guns are always fired from the hip (no aim-down-sights)
    this.vm.setGunPose(false, this.inv.reloading === tool ? Math.min(0.98, this.reloadT / W[tool].reloadTime) : 0);
    this.vm.setDraw(this.drawing ? this.drawT / W.bow.maxDrawTime : 0);

    // placement tools with a ghost preview
    const placing = alive && (tool === 'trap' && this.inv.traps > 0 || tool === 'bait' && this.inv.baits > 0);
    const pp = this.placementPoint();
    this.ghostTrap.visible = placing && tool === 'trap';
    this.ghostBait.visible = placing && tool === 'bait';
    if (placing) {
      const gh = tool === 'trap' ? this.ghostTrap : this.ghostBait;
      gh.position.set(pp.x, pp.y + (tool === 'bait' ? 0.15 : 0.02), pp.z);
      gh.rotation.y = pp.yaw;
      if (canAct && input.wasPressed('primary') && this.cooldown <= 0) {
        net.act(tool === 'trap' ? ACT.TRAP : ACT.BAIT, { x: +pp.x.toFixed(2), z: +pp.z.toFixed(2), yaw: +pp.yaw.toFixed(3) });
        this.vm.place();
        this.cooldown = 0.6;
        g.audio?.play('place');
      }
    }

    // --- eat / give
    if (alive && !panel && input.wasPressed('eat')) this.eat();
    if (alive && !panel && input.wasPressed('give')) this.give();

    // --- knife (hold V at a carcass), then interactions (E) + prompt
    this.updateKnife(dt, alive && !panel && !eating && input.locked, input.isHeld('knife'));
    this.updateInteraction(alive && !panel, input.wasPressed('interact'));

    // --- automatic looting: walk over items to collect them
    this.autoPickT -= dt;
    if (alive && this.autoPickT <= 0) {
      this.autoPickT = 0.15;
      this.autoLoot();
    }

    // --- flags for remote animation
    if (this.drawing) g.flags |= PF.DRAW; else g.flags &= ~PF.DRAW;

    // --- viewmodel
    const fruitType = this.bestFruit();
    this.vm.setTool(tool, { hasSpear: this.inv.spear, fruitType, hasArrow: this.inv.arrows > 0 });
    this.vm.setKnife(!!this.butcher);
    this.vm.root.visible = alive;
    this.vm.update(dt, { speed: g.player.moveSpeed, sprint: g.player.sprinting, grounded: g.player.onGround, lookX: g.lastMouse?.x || 0, lookY: g.lastMouse?.y || 0 });

    this.updateHud(dt, fruitType, w);
  }

  select(i) {
    if (i === this.game.eq) return;
    this.game.eq = i;
    this.drawing = false;
    this.drawT = 0;
    this.game.audio?.play('switch');
  }

  stab() {
    const g = this.game;
    const { origin, dir } = this.aim();
    this.vm.stab();
    this.cooldown = W.spear.cooldown;
    g.flags |= PF.ATTACK;
    g.audio?.play('swing');
    const hit = g.dinos.raycast(origin, dir, W.spear.range);
    // no stabbing through a tree trunk or rock
    const end = hit && origin.clone().addScaledVector(dir, hit.dist);
    if (hit && segmentColliders(origin.x, origin.y, origin.z, end.x, end.y, end.z, g.layout.colliders, g.layout.groundAt) >= 0) return;
    if (hit) g.net.act(ACT.MELEE, { dino: hit.view.id, zone: hit.zone, p: hit.point.toArray().map((n) => +n.toFixed(2)), rt: +g.renderTime.toFixed(3) });
  }

  throwSpear() {
    const g = this.game;
    this.vm.throwSpear(() => {
      if (!g.running || !g.me.alive) return;
      const { origin, velocity, rotation } = spearLaunch(g.gfx.camera, 1 + this.mods.throwSpeed);
      g.projectiles.fire('spear', origin, velocity, 1, rotation);
      g.audio?.play('throw');
    });
    this.cooldown = W.spear.throwCooldown * (1 + this.mods.throwCooldown);
    g.flags |= PF.ATTACK;
    this.inv.spear = false; // optimistic; the server confirms with an inventory update
  }

  shootArrow() {
    const g = this.game;
    if (this.inv.arrows <= 0) return;
    const power = Math.min(1, this.drawT / W.bow.maxDrawTime);
    const { origin, dir, right, up } = this.aim();
    const speed = W.bow.minSpeed + (W.bow.maxSpeed + this.mods.bowSpeed - W.bow.minSpeed) * power;
    const o = origin.clone().addScaledVector(dir, 0.6).addScaledVector(right, 0.05).addScaledVector(up, -0.04);
    g.projectiles.fire('arrow', o, dir.clone().multiplyScalar(speed), power);
    this.inv.arrows--;
    this.cooldown = W.bow.cooldown;
    g.audio?.play('bow');
  }

  reloadGun() {
    const tool = this.tool, ammo = this.inv.guns?.[tool];
    if (!ammo || this.inv.reloading || ammo.loaded >= W[tool].magazine || !ammo.reserve) return;
    this.reloadT = 0;
    this.game.net.act(ACT.RELOAD, { kind: tool });
    this.game.audio?.play('reload');
  }

  shootGun() {
    const g = this.game, tool = this.tool;
    const aim = this.aim();
    const origin = aim.origin;
    // bullets spread in a small cone (wider while moving), so a gun is no laser
    const spec = W[tool];
    const move = Math.min(1, g.player.moveSpeed / P.sprintSpeed);
    const cone = spec.spread + spec.spreadMove * move;
    const r = cone * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const dir = aim.dir.clone().addScaledVector(aim.right, Math.cos(a) * r).addScaledVector(aim.up, Math.sin(a) * r).normalize();
    const blocked = new THREE.Vector3(...shotEnd(g, origin.toArray(), dir.toArray(), W[tool].range));
    const candidate = g.dinos.raycast(origin, dir, W[tool].range);
    const hit = candidate && candidate.dist <= blocked.distanceTo(origin) ? candidate : null;
    const end = hit ? hit.point : blocked;
    // the shot died on the Primeval Grove's barrier: show the ripple there
    if (!hit && insideGrove(g.layout, blocked.x, blocked.z, 0.05) && !insideGrove(g.layout, origin.x, origin.z)) g.onGroveBarrierHit?.(blocked);
    // a shot into water kicks up a little spout where it breaks the surface
    if (!hit) {
      const len = origin.distanceTo(blocked);
      for (let s = 0.5; s <= len; s += 0.5) {
        const x = origin.x + dir.x * s, y = origin.y + dir.y * s, z = origin.z + dir.z * s;
        const wl = g.terrain.waterLevelAt(x, z);
        if (wl !== null && y <= wl) { g.onWaterSplash?.(new THREE.Vector3(x, wl, z), 0.25); break; }
      }
    }
    g.net.act(ACT.SHOT, { kind: tool, o: origin.toArray(), dir: dir.toArray(),
      ...(hit ? { dino: hit.view.id, p: hit.point.toArray(), zone: hit.zone, rt: +g.renderTime.toFixed(3) } : {}) });
    // Position the tracer at the rendered muzzle, transformed into world space.
    const muzzle = this.vm.muzzlePosition(new THREE.Vector3());
    g.gfx.viewCamera.worldToLocal(muzzle); g.gfx.camera.localToWorld(muzzle);
    this.gunEffects.fire(muzzle, end);
    this.vm.fireGun();
    this.inv.guns[tool].loaded--;
    this.cooldown = W[tool].cooldown;
    g.flags |= PF.ATTACK; g.audio?.play(tool);
  }

  eat() {
    if (this.eatingT > 0 || !this.inv.fruit.length) {
      if (!this.inv.fruit.length) this.game.hud.toast('No fruit – look for berry bushes, mango trees and dragon fruit', 'fruit');
      return;
    }
    this.game.net.act(ACT.EAT, { fruit: this.bestFruit() });
    this.eatingT = CONFIG.fruit.eatTime; // predicted; the EAT event starts the animation
  }

  /** Teammate you are looking at within give range. */
  lookedAtTeammate(range) {
    const g = this.game;
    const { origin, dir } = this.aim();
    let best = null, bestDot = 0.9;
    for (const rp of g.remotes.map.values()) {
      if (!rp.alive) continue;
      const to = rp.pos.clone().setY(rp.pos.y + 1.2).sub(origin);
      const d = to.length();
      if (d > range) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bestDot) { bestDot = dot; best = rp; }
    }
    return best;
  }

  give() {
    const target = this.lookedAtTeammate(P.giveRange);
    if (!target) return this.game.hud.toast('Look at a teammate close by to give them fruit', 'fruit');
    if (!this.inv.fruit.length) return this.game.hud.toast('You have no fruit to give', 'fruit');
    this.game.net.act(ACT.GIVE, { to: target.id });
  }

  // ------------------------------------------------------------------ interactions

  /**
   * The nearest carcass within knife reach that can still be butchered
   * (fallen pterosaurs only once they lie on the ground), roughly in front.
   */
  findCarcass() {
    const g = this.game;
    const pos = g.player.pos;
    const { dir } = this.aim();
    let best = null, bd = Infinity;
    for (const v of g.dinos.map.values()) {
      if (v.alive || v.butchered || !v.grounded()) continue;
      for (const [x, z, r] of dinoBodyCircles(v, v.pos.x, v.pos.z, v.yaw)) {
        const dx = x - pos.x, dz = z - pos.z;
        const d = Math.max(0, Math.hypot(dx, dz) - r);
        const facing = (dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) || 1);
        if (d <= W.knife.reach && (facing > 0.2 || d < 0.6) && d < bd) { bd = d; best = v; }
      }
    }
    return best;
  }

  updateKnife(dt, enabled, held) {
    const g = this.game;
    const pos = g.player.pos;
    this.butcherRetry = Math.max(0, this.butcherRetry - dt);
    const b = this.butcher;
    if (b) {
      b.t += dt;
      const v = g.dinos.map.get(b.dino);
      const moved = Math.hypot(pos.x - b.x, pos.z - b.z) > W.knife.moveCancel;
      // the server did not take it (too far, someone else is faster): don't hammer it
      const refused = !b.confirmed && b.t > 0.6;
      if (!enabled || !held || !v || v.butchered || moved || refused) {
        if (!refused) g.net.act(ACT.BUTCHER, { stop: 1 });
        this.butcher = null;
        if (refused) this.butcherRetry = 1;
      }
      return;
    }
    if (!enabled || !held || this.butcherRetry > 0) return;
    const v = this.findCarcass();
    if (!v) return;
    this.butcher = { dino: v.id, t: 0, time: CONFIG.dinos[v.type].butcher.time, x: pos.x, z: pos.z, confirmed: false };
    g.net.act(ACT.BUTCHER, { dino: v.id });
    g.audio?.play('swing');
  }

  updateInteraction(enabled, pressed) {
    const g = this.game;
    const hud = g.hud;
    if (!enabled) {
      hud.prompt(null);
      return;
    }
    const pos = g.player.pos;
    const act = this.findInteraction(pos);
    if (act) {
      hud.prompt(act.text, act.key || 'E');
      if (pressed && act.run) act.run();
    } else {
      hud.prompt(null);
    }
  }

  findInteraction(pos) {
    const g = this.game;
    const net = g.net;
    const inv = this.inv;
    const near = (o, r) => Math.hypot(o.x - pos.x, o.z - pos.z) < r;

    // (items on the ground are looted automatically – see autoLoot())
    // 1. ripe fruit
    let best = null, bd = Infinity;
    for (const s of g.layout.fruitSpots) {
      const r = s.type === 'mango' ? 3.4 : P.interactRange;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < r && d < bd && g.fruitCounts[s.id] > 0) { bd = d; best = s; }
    }
    if (best) {
      const name = CONFIG.fruit.types[best.type].name;
      if (inv.fruit.length >= this.caps.fruit) return { text: `Fruit pouch full (${this.caps.fruit})`, run: null };
      return { text: `Pick ${name} (${g.fruitCounts[best.id]} left)`, run: () => net.act(ACT.HARVEST, { spot: best.id }) };
    }
    // 2. a carcass to butcher with the knife (hold V)
    if (this.butcher) return { text: 'Butchering…', key: 'V', run: null };
    const carcass = this.findCarcass();
    if (carcass) return { text: `Hold to butcher the ${CONFIG.dinos[carcass.type].name}`, key: 'V', run: null };
    // 3. hut / landing camp / the team's base (shared/base.js campStations)
    const st = g.stations();
    if (st.dropOff.some((d) => near(d, 4))) {
      const carrying = LOOT_KEYS.some((k) => inv.loot[k] > 0);
      return { text: carrying ? 'Drop off loot' : 'Loot drop-off (nothing to drop off)', run: carrying ? () => net.act(ACT.DEPOSIT) : null };
    }
    const plots = g.layout.basePlots;
    if (plots.length) {
      const base = g.base;
      if (base?.plot == null) {
        const i = plots.findIndex((plot) => near(stakePoint(plot), 3.5));
        if (i >= 0) return { text: `Build a base here – ${PLOT_KINDS[plots[i].kind]?.name ?? 'building plot'}`, run: () => g.openBase(i) };
      } else {
        const flag = plotPoint(plots[base.plot], 'flag');
        if (near(flag, 3.5) || (base.stage === 0 && near(plotPoint(plots[base.plot], 'fire'), 6))) {
          return { text: base.stage >= MAX_STAGE ? 'Your base' : 'Manage the base', run: () => g.openBase(-1) };
        }
      }
    }
    const boat = g.layout.boat;
    if (boat && Math.hypot(boat.interact.x - pos.x, boat.interact.z - pos.z) < 5.5) {
      const m = g.mission;
      const found = (m?.relics || []).filter((r) => r.found).length;
      const text = m?.boat?.repaired ? 'Check the boat' : `Inspect the wreck (${found}/${m?.relics?.length ?? 3} parts)`;
      return { text, run: () => g.openBoat() };
    }
    if (st.wardrobe && near(st.wardrobe, 3)) {
      return { text: 'Change clothes', run: () => g.openWardrobe() };
    }
    if (st.workbench && near(st.workbench, 4)) {
      return { text: 'Open the crafting box', run: () => g.openCrafting() };
    }
    // the landing camp's supply bench: free basic resupply only (crafting needs a camp)
    const bench = st.refill.find((r) => near(r, 4));
    if (bench) return { text: 'Free basic resupply (build a camp to craft)', run: () => net.act(ACT.REFILL) };
    if (st.board && near(st.board, 3.5)) {
      return { text: 'Open the mission board', run: () => g.openBoard() };
    }
    // 4. give fruit
    const mate = inv.fruit.length ? this.lookedAtTeammate(P.giveRange) : null;
    if (mate) return { text: `Give fruit to ${mate.name}`, key: 'G', run: null };
    return null;
  }

  /** Current inventory limits from the server (base + contract rewards). */
  get caps() {
    return this.inv.caps || {
      arrows: W.bow.maxArrows, fruit: CONFIG.fruit.maxCarried, carry: P.maxCarryWeight,
      traps: W.trap.startCount, baits: W.bait.startCount,
    };
  }

  /**
   * Collect every item within reach. Capacity is checked here first so a full
   * pack shows one clear alert instead of hammering the server; the server
   * still validates every pickup.
   */
  autoLoot() {
    const g = this.game;
    const pos = g.player.pos;
    const R = P.autoLootRadius;
    const now = g.time;
    const caps = this.caps;
    let weight = this.carryWeight();
    for (const { data: it } of g.items.items.values()) {
      if ((it.dino || it.pose) && Math.abs(it.y - (pos.y + P.eyeHeight)) > 3.5) continue;
      if (Math.abs(it.x - pos.x) > R || Math.abs(it.z - pos.z) > R || Math.hypot(it.x - pos.x, it.z - pos.z) > R) continue;
      if (now < (this.pickRequested.get(it.id) ?? 0)) continue;   // already asked, wait for the server
      let full = null;
      if (it.kind === 'arrow') {
        if (this.inv.arrows >= caps.arrows) full = ['Your quiver is full', 'arrow'];
      } else if (it.kind === 'spear') {
        if (this.inv.spear) continue;
      } else if (CONFIG.loot[it.kind]) {
        const w = CONFIG.loot[it.kind].weight * it.n;
        if (weight + w > caps.carry + 1e-6) full = [`Your pack is full (${Math.round(weight * 10) / 10}/${caps.carry}) – drop off loot at the hut`, 'weight'];
        else weight += w;
      }
      if (full) {
        this.fullAlert(full[0], full[1]);
        continue;
      }
      this.pickRequested.set(it.id, now + 1.5);
      g.net.act(ACT.PICKUP, { item: it.id });
    }
    if (this.pickRequested.size > 64) {
      for (const [id, t] of this.pickRequested) if (t < now) this.pickRequested.delete(id);
    }
  }

  fullAlert(text, iconId) {
    const g = this.game;
    if (g.time < this.nextFullAlert && text === this.lastFullText) return;
    this.nextFullAlert = g.time + 4;
    this.lastFullText = text;
    g.hud.alert(text, iconId);
    g.audio?.play('full');
  }

  // ------------------------------------------------------------------ HUD

  updateHud(dt, fruitType, weight) {
    const g = this.game;
    const hud = g.hud;
    const inv = this.inv;
    hud.setHotbar([
      { id: 'spear', label: `${SLOT_LABEL.spear} health`, count: inv.spear ? `${inv.spearHealth ?? 100}%` : null, enabled: inv.spear },
      { id: 'bow', label: SLOT_LABEL.bow, count: inv.arrows, enabled: inv.arrows > 0 },
      { id: 'trap', label: SLOT_LABEL.trap, count: inv.traps, enabled: inv.traps > 0 },
      { id: 'bait', label: SLOT_LABEL.bait, count: inv.baits, enabled: inv.baits > 0 },
      { id: 'fruit', label: SLOT_LABEL.fruit, count: inv.fruit.length, enabled: inv.fruit.length > 0, sub: fruitType || undefined },
      ...['pistol', 'rifle'].map(id => ({ id, label: `${SLOT_LABEL[id]} - R reload`, count: inv.guns?.[id]?.loaded ?? 0, enabled: (inv.guns?.[id]?.loaded ?? 0) > 0 })),
    ], g.eq);
    const caps = this.caps;
    hud.setInventory({
      guns: inv.guns, reloading: inv.reloading, weapon: this.tool,
      arrows: inv.arrows,
      arrowUses: inv.arrowUses,
      spear: inv.spear,
      spearHealth: inv.spearHealth,
      maxArrows: caps.arrows,
      fruit: inv.fruit,
      maxFruit: caps.fruit,
      maxCarry: caps.carry,
      loot: inv.loot,
      carryWeight: weight,
      speedFactor: g.player.speedFactor,
      store: g.store,
      traps: inv.traps,
      baits: inv.baits,
    });
    const tool = this.tool;
    hud.setCrosshair({
      draw: this.drawing ? this.drawT / W.bow.maxDrawTime : 0,
      mode: !g.me.alive ? 'none' : tool === 'trap' || tool === 'bait' ? 'place' : 'default',
    });
    hud.eatProgress(this.butcher ? Math.min(1, this.butcher.t / this.butcher.time)
      : this.eatingT > 0 ? 1 - this.eatingT / CONFIG.fruit.eatTime : null);
    this.updateHint();
  }

  /**
   * Dinosaur alert: the nearest dangerous animal (every species except the
   * peaceful Brachiosaurus) within DINO_ALERT_RANGE metres, with its distance.
   */
  updateHint() {
    const g = this.game;
    const pos = g.player.pos;
    const hud = g.hud;
    if (!g.me.alive) return hud.hint(null);
    let near = null, best = DINO_ALERT_RANGE;
    for (const v of g.dinos.map.values()) {
      if (!v.alive || v.type === 'brachio') continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < best) { best = d; near = v; }
    }
    if (near) hud.hint(`${CONFIG.dinos[near.type].name} nearby!`, best, 'dino');
    else hud.hint(null);
  }

  compassMarkers(bearing, out) {
    const g = this.game;
    const step = g.mission?.step ?? 0;
    const pos = g.player.pos;
    if (step === 1) {
      // once tracks are found the trail points toward the herd
      const near = g.dinos.nearest('brachio', pos);
      if (near && g.dinos.spotted.has(near.view.id)) out.push({ bearing: bearing(near.view.pos.x, near.view.pos.z), kind: 'objective' });
    } else if (step === 2) {
      const it = g.items.nearestItem(pos, 400);
      if (it) out.push({ bearing: bearing(it.x, it.z), kind: 'objective' });
    }
    // dinosaurs you can see nearby
    for (const v of g.dinos.map.values()) {
      if (v.alive && g.dinos.spotted.has(v.id) && v.pos.distanceTo(pos) < 60) out.push({ bearing: bearing(v.pos.x, v.pos.z), kind: 'dino' });
    }
  }

}
