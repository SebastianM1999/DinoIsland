// Local player actions: tool slots, spear/bow combat, trap + bait placement,
// eating and giving fruit, E-interactions (pickup, harvest, hut), carry
// slowdown, and the HUD parts that depend on them (hotbar, prompt, hints).
// Every gameplay effect is a request to the authoritative server.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { ACT, EV, PF, EQUIP } from '../../shared/protocol.js';
import { segmentColliders } from '../../shared/collision.js';
import { Viewmodel } from './viewmodel.js';
import { mesh } from '../models/kit.js';
import { trapGeometry, meatGeometry } from '../models/weapons.js';

const W = CONFIG.weapons;
const P = CONFIG.player;
const LOOT_KEYS = Object.keys(CONFIG.loot);
const SLOT_LABEL = { spear: 'Spear', bow: 'Bow', trap: 'Trap', bait: 'Meat bait', fruit: 'Fruit' };
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

export class PlayerActions {
  constructor(game) {
    this.game = game;
    this.vm = new Viewmodel(game.gfx, game.me.slot);
    this.cooldown = 0;
    this.drawT = 0;
    this.drawing = false;
    this.eatingT = 0;
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
  get tool() { return EQUIP[this.game.eq]; }

  // ------------------------------------------------------------------ helpers

  aim() {
    const cam = this.game.gfx.camera;
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    return { origin: cam.position, dir: _fwd, right: _right, up: _up };
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
    for (let i = 0; i < 5; i++) if (input.wasPressed(`slot${i + 1}`)) this.select(i);
    const wheel = g.lastWheel || 0;
    if (wheel) this.select((g.eq + (wheel > 0 ? 1 : 4)) % 5);

    // --- carry slowdown (and eating makes you slow and vulnerable)
    const w = this.carryWeight();
    g.player.speedFactor = Math.max(P.minCarrySpeed, 1 - w * P.carrySlowPerUnit) * (eating ? 0.5 : 1);

    const tool = this.tool;
    const canAct = alive && !eating && !panel && input.locked;

    // --- primary / secondary per tool
    if (tool === 'spear') {
      if (canAct && input.wasPressed('primary') && this.cooldown <= 0 && this.inv.spear) this.stab();
      if (canAct && input.wasPressed('secondary') && this.cooldown <= 0 && this.inv.spear) this.throwSpear();
    } else if (tool === 'bow') {
      if (canAct && input.isHeld('primary') && this.inv.arrows > 0 && this.cooldown <= 0) {
        this.drawing = true;
        this.drawT = Math.min(W.bow.maxDrawTime, this.drawT + dt);
      }
      if (this.drawing && (!input.isHeld('primary') || !canAct)) {
        if (canAct && this.drawT >= W.bow.minDrawToFire) this.shootArrow();
        this.drawing = false;
        this.drawT = 0;
        this.vm.release();
      }
    } else if (tool === 'fruit') {
      if (canAct && input.wasPressed('primary')) this.eat();
    }
    if (tool !== 'bow' && this.drawing) { this.drawing = false; this.drawT = 0; }
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

    // --- interactions (E) + prompt
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
    if (hit) g.net.act(ACT.MELEE, { dino: hit.view.id, zone: hit.zone, p: hit.point.toArray().map((n) => +n.toFixed(2)) });
  }

  throwSpear() {
    const g = this.game;
    const { origin, dir, right, up } = this.aim();
    const o = origin.clone().addScaledVector(right, 0.25).addScaledVector(up, -0.1).addScaledVector(dir, 0.3);
    const v = dir.clone().multiplyScalar(W.spear.throwSpeed).addScaledVector(up, 1.5);
    this.vm.throwSpear();
    this.cooldown = W.spear.throwCooldown;
    g.flags |= PF.ATTACK;
    g.audio?.play('throw');
    // launch slightly after the wind-up
    setTimeout(() => { if (g.running && g.me.alive) g.projectiles.fire('spear', o, v, 1); }, 220);
    this.inv.spear = false; // optimistic; the server confirms with an inventory update
  }

  shootArrow() {
    const g = this.game;
    if (this.inv.arrows <= 0) return;
    const power = Math.min(1, this.drawT / W.bow.maxDrawTime);
    const { origin, dir, right, up } = this.aim();
    const speed = W.bow.minSpeed + (W.bow.maxSpeed - W.bow.minSpeed) * power;
    const o = origin.clone().addScaledVector(dir, 0.6).addScaledVector(right, 0.05).addScaledVector(up, -0.04);
    g.projectiles.fire('arrow', o, dir.clone().multiplyScalar(speed), power);
    this.inv.arrows--;
    this.cooldown = W.bow.cooldown;
    g.audio?.play('bow');
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
    // 3. hut
    const h = g.layout.hut;
    if (near(h.dropOff, 4)) {
      const carrying = LOOT_KEYS.some((k) => inv.loot[k] > 0);
      return { text: carrying ? 'Drop off loot' : 'Loot drop-off (nothing to drop off)', run: carrying ? () => net.act(ACT.DEPOSIT) : null };
    }
    if (near(h.arrowRack, 4)) {
      return { text: 'Refill arrows, traps and bait', run: () => net.act(ACT.REFILL) };
    }
    if (near(h.missionBoard, 3.5)) {
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
      { id: 'spear', label: SLOT_LABEL.spear, count: null, enabled: inv.spear },
      { id: 'bow', label: SLOT_LABEL.bow, count: inv.arrows, enabled: inv.arrows > 0 },
      { id: 'trap', label: SLOT_LABEL.trap, count: inv.traps, enabled: inv.traps > 0 },
      { id: 'bait', label: SLOT_LABEL.bait, count: inv.baits, enabled: inv.baits > 0 },
      { id: 'fruit', label: SLOT_LABEL.fruit, count: inv.fruit.length, enabled: inv.fruit.length > 0, sub: fruitType || undefined },
    ], g.eq);
    const caps = this.caps;
    hud.setInventory({
      arrows: inv.arrows,
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
    hud.eatProgress(this.eatingT > 0 ? 1 - this.eatingT / CONFIG.fruit.eatTime : null);
    this.updateHint();
  }

  /** Tracking hint: fresh tracks nearby tell you where the animal went. */
  updateHint() {
    const g = this.game;
    const pos = g.player.pos;
    const step = g.mission?.step ?? 0;
    const hud = g.hud;
    if (!g.me.alive) return hud.hint(null);
    const track = g.tracks.nearest('brachio', pos, 12);
    const near = g.dinos.nearest('brachio', pos);
    if (track && near && step <= 1) {
      hud.hint('Fresh Brachiosaurus tracks – follow them!', Math.round(near.dist));
    } else if (near && near.dist < 90 && step <= 1 && g.dinos.spotted.has(near.view.id)) {
      // only animals the team has actually spotted – no hidden-dinosaur radar
      hud.hint('Brachiosaurus nearby', Math.round(near.dist));
    } else if (step === 3) {
      const h = g.layout.hut;
      hud.hint('Bring the loot back to the hut', Math.round(Math.hypot(h.x - pos.x, h.z - pos.z)));
    } else {
      hud.hint(null);
    }
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
