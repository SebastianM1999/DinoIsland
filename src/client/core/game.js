// Client game shell: owns the renderer, the world view, the local player,
// the connection to the authoritative world, and the main rAF loop.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { Terrain } from '../../shared/terrain.js';
import { buildLayout } from '../../shared/layout.js';
import { MSG, EV, PF, DS } from '../../shared/protocol.js';
import { CONTRACTS } from '../../shared/missions.js';
import { Renderer } from './renderer.js';
import { Input } from '../input/input.js';
import { PlayerController } from '../player/controller.js';
import { buildTerrainMesh } from '../world/terrainMesh.js';
import { buildSky } from '../world/sky.js';
import { buildWater } from '../world/water.js';
import { buildVegetation } from '../world/vegetation.js';
import { buildRocks } from '../world/rocks.js';
import { buildFruitPlants } from '../world/fruitPlants.js';
import { buildHut } from '../world/hut.js';
import { WIND } from '../models/kit.js';
import { RemotePlayers } from '../entities/remotePlayers.js';
import { Hud } from '../ui/hud.js';
import { DinoViews } from '../entities/dinoViews.js';
import { Tracks } from '../entities/tracks.js';
import { Items } from '../entities/items.js';
import { Projectiles } from '../entities/projectiles.js';
import { PlayerActions } from '../player/actions.js';
import { GameAudio } from '../audio/audio.js';
import { settings } from './settings.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../net/net.js').Net} net connected session (welcome received)
   */
  constructor(canvas, net) {
    this.canvas = canvas;
    this.net = net;
    this.terrain = new Terrain();
    this.layout = buildLayout(this.terrain);
    this.gfx = new Renderer(canvas);
    this.input = new Input(canvas);
    this.player = new PlayerController(this.terrain, this.layout.colliders);
    this.time = 0;
    this.running = false;
    this.debug = false;
    this.sendTimer = 0;
    this.pingTimer = 0;
    this.onLeave = null;

    // Overlay for nameplates and other screen-space labels.
    this.overlay = document.createElement('div');
    this.overlay.className = 'world-overlay';
    document.body.appendChild(this.overlay);

    this.audio = new GameAudio();
    this.stepDist = 0;
    this.hud = new Hud(document.getElementById('hud'));
    this.hud.initMinimap(this.terrain, this.layout);
    try { this.hud.trackedContract = localStorage.getItem('di.tracked') || null; } catch { /* storage blocked */ }
    this.hud.onTrackContract = (id) => {
      try { if (id) localStorage.setItem('di.tracked', id); else localStorage.removeItem('di.tracked'); } catch { /* ignore */ }
      this.#showMission();
    };
    this.input.onPanelToggle = (action) => {
      if (action === 'close' && !this.hud.isPanelOpen()) return false;
      let open;
      if (action === 'inventory') open = this.hud.toggleInventory();
      else if (action === 'map') open = this.hud.toggleMap();
      else if (action === 'board') open = this.hud.toggleBoard();
      else {
        this.hud.toggleInventory(false);
        this.hud.toggleMap(false);
        this.hud.toggleBoard(false);
        open = false;
      }
      this.onPanelChange?.(open);
      if (open) this.input.exitLock();
      else this.input.requestLock();
      return true;
    };

    this.#buildWorld();
    this.remotes = new RemotePlayers(this.gfx.scene, this.gfx.camera, this.overlay);

    const w = net.welcome;
    this.me = { id: w.id, slot: w.slot, name: '', hp: CONFIG.player.maxHealth, alive: true, inv: w.inv, deathT: 0 };
    this.mission = w.world.mission;
    this.store = w.world.store;
    this.flags = 0;           // PF flags for animation sync (attack pulse etc.)
    this.eq = 0;              // selected hotbar slot

    // Gameplay systems. Each may implement onWelcome(world), onSnapshot(msg),
    // update(dt, renderTime), minimapMarkers(out), compassMarkers(bearing, out).
    this.dinos = new DinoViews(this);
    this.tracks = new Tracks(this);
    this.items = new Items(this);
    this.projectiles = new Projectiles(this);
    this.actions = new PlayerActions(this);
    this.systems = [this.dinos, this.tracks, this.items, this.actions, this.projectiles];

    this.#applyWelcome(w);
    this.#bindNet();

    this.clock = new THREE.Clock(false);
    this.loop = this.loop.bind(this);
  }

  #buildWorld() {
    const scene = this.gfx.scene;
    scene.add(buildTerrainMesh(this.terrain, this.layout));

    this.sky = buildSky(this.gfx);
    this.water = buildWater(this.terrain, this.layout, this.gfx.sunDir);
    this.vegetation = buildVegetation(this.terrain, this.layout);
    this.rocks = buildRocks(this.terrain, this.layout);
    this.fruitPlants = buildFruitPlants(this.terrain, this.layout);
    this.hut = buildHut(this.terrain, this.layout);
    scene.add(this.sky.group, this.water.group, this.vegetation.group, this.rocks.group, this.fruitPlants.group, this.hut.group);
    this.worldUpdaters = [this.sky, this.water, this.vegetation, this.fruitPlants, this.hut];

    // Debug view of colliders (F3).
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    const dm = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    for (const c of this.layout.colliders.circles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, 3, 10), dm);
      m.position.set(c.x, this.terrain.heightAt(c.x, c.z) + 1.5, c.z);
      this.debugGroup.add(m);
    }
    for (const b of this.layout.colliders.boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, 3, b.hd * 2), dm);
      m.position.set(b.x, this.terrain.heightAt(b.x, b.z) + 1.5, b.z);
      m.rotation.y = -b.rot;
      this.debugGroup.add(m);
    }
    scene.add(this.debugGroup);
  }

  // ------------------------------------------------------------------ network

  #applyWelcome(w) {
    const world = w.world;
    for (const p of world.players) {
      if (p.id === w.id) {
        this.me.name = p.name;
        this.player.teleport(p.x, p.z, p.yaw);
      } else {
        this.remotes.add(p);
      }
    }
    this.fruitCounts = world.fruit.slice();
    world.fruit.forEach((count, id) => this.fruitPlants.setCount(id, count));
    this.hud.setPlayer({ name: this.me.name, slot: this.me.slot });
    this.#showMission();
    for (const sys of this.systems) sys.onWelcome?.(world);
  }

  /** Quest log = main expedition + the contract pinned on the mission board. */
  #showMission() {
    const m = this.mission;
    if (!m) return;
    this.hud.setBoard(m);
    const id = this.hud.trackedContract;
    const i = CONTRACTS.findIndex((c) => c.id === id);
    const c = i >= 0 ? m.contracts?.[i] : null;
    const objectives = c
      ? [...m.objectives, { text: `${CONTRACTS[i].title}: ${c.progress}/${CONTRACTS[i].goal}`, done: c.done }]
      : m.objectives;
    this.hud.setMission({ ...m, objectives });
  }

  /** E at the mission board. */
  openBoard() {
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('board');
  }

  #bindNet() {
    const net = this.net;
    net.on(MSG.SNAP, (m) => {
      for (const row of m.p) {
        if (row[0] === this.me.id) {
          this.me.hp = row[9];
          continue;
        }
        this.remotes.onRow(m.now, row);
      }
      for (const sys of this.systems) sys.onSnapshot?.(m);
    });
    net.on(MSG.INV, (m) => { this.me.inv = m.inv; });
    net.on(MSG.CORRECT, (m) => {
      this.player.pos.x = m.x;
      this.player.pos.y = m.y;
      this.player.pos.z = m.z;
      this.player.vel.x = this.player.vel.z = 0;
    });
    net.on(`ev:${EV.PLAYER_JOIN}`, (m) => this.remotes.add(m.player));
    net.on(`ev:${EV.PLAYER_LEAVE}`, (m) => this.remotes.remove(m.id));
    net.on(`ev:${EV.FRUIT}`, (m) => {
      this.fruitCounts[m.spot] = m.count;
      this.fruitPlants.setCount(m.spot, m.count);
    });
    net.on(`ev:${EV.TOAST}`, (m) => this.hud.toast(m.text, m.icon));
    net.on(`ev:${EV.FULL}`, (m) => this.actions.fullAlert(m.text, m.icon));
    net.on(`ev:${EV.ITEM_REMOVE}`, (m) => { if (m.by === this.me.id) this.audio.play('pickup'); });
    net.on(`ev:${EV.TRAP_SNAP}`, (m) => {
      const tr = this.items.traps.get(m.id)?.data;
      this.audio.play('trapSnap', tr ? { pos: { x: tr.x, y: tr.y + 0.5, z: tr.z } } : {});
    });
    net.on(`ev:${EV.MISSION}`, (m) => {
      if (m.mission.step !== this.mission.step) this.audio.play(m.mission.complete ? 'complete' : 'quest');
      this.mission = m.mission;
      this.#showMission();
      this.hud.missionComplete(m.mission.complete, { completedIn: m.mission.completedIn, store: this.store });
    });
    net.on(`ev:${EV.STORE}`, (m) => { this.store = m.store; });
    net.on(`ev:${EV.HURT}`, (m) => {
      if (m.id === this.me.id) {
        this.me.hp = m.hp;
        this.lastHurtAt = this.time;
        this.hud.damageFlash(m.dmg);
        if (m.src) {
          const name = CONFIG.dinos[m.src]?.name || 'Dinosaur';
          let direction = 'nearby';
          if (m.from) {
            const dx = m.from.x - this.player.pos.x, dz = m.from.z - this.player.pos.z;
            const length = Math.hypot(dx, dz) || 1;
            const forward = (-dx * Math.sin(this.player.yaw) - dz * Math.cos(this.player.yaw)) / length;
            const right = (dx * Math.cos(this.player.yaw) - dz * Math.sin(this.player.yaw)) / length;
            direction = [m.from.y > this.player.pos.y + 3 ? 'above' : '',
              forward > 0.38 ? 'ahead' : forward < -0.38 ? 'behind' : '',
              right > 0.38 ? 'right' : right < -0.38 ? 'left' : ''].filter(Boolean).join(' ') || 'nearby';
          }
          this.hud.damageSource(`${name} · ${direction}`);
        }
        this.audio.play('hurt');
        if (m.kx || m.kz) this.player.knock(m.kx, m.kz, m.down ? 5 : 3, m.down ? CONFIG.player.knockdownTime : 0.15);
      }
    });
    net.on(`ev:${EV.DEATH}`, (m) => {
      if (m.id === this.me.id) {
        this.me.alive = false;
        this.me.deathT = CONFIG.player.respawnDelay;
        this.audio.play('death');
        this.player.frozen = true;
      }
    });
    net.on(`ev:${EV.RESPAWN}`, (m) => {
      if (m.id === this.me.id) {
        this.me.alive = true;
        this.me.hp = CONFIG.player.maxHealth;
        this.player.frozen = false;
        this.player.teleport(m.x, m.z, m.yaw);
        this.hud.setDeath(false);
      }
    });
    net.onClose = (reason) => {
      this.stop();
      this.onLeave?.(reason || 'Disconnected from the server');
    };
  }

  #sendState() {
    const p = this.player;
    this.net.send({
      t: MSG.STATE,
      x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
      yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
      spd: +p.moveSpeed.toFixed(2),
      eq: this.eq,
      fl: this.flags | (p.sprinting ? PF.SPRINT : 0) | (p.onGround ? PF.GROUND : 0) | (p.knockTimer > 0 ? PF.KNOCKED : 0),
    });
    this.flags &= ~PF.ATTACK; // one-shot animation pulse
  }

  // ------------------------------------------------------------------ loop

  start() {
    this.audio.resume();
    this.audio.startAmbient();
    this.running = true;
    this.input.enabled = true;
    this.hud.show(true);
    this.clock.start();
    requestAnimationFrame(this.loop);
    // Heartbeat on a timer: background tabs pause rAF, but must not time out.
    this.heartbeat = setInterval(() => {
      if (document.hidden) this.net.send({ t: MSG.PING, c: performance.now() / 1000 });
    }, 2000);
  }

  stop() {
    clearInterval(this.heartbeat);
    this.running = false;
    this.input.enabled = false;
    this.input.exitLock();
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.update(dt);
    this.gfx.render();
    this.input.endFrame();
  }

  update(dt) {
    const input = this.input;
    const p = this.player;
    const mouse = input.takeMouse();
    const looking = input.locked && !this.hud.isPanelOpen();
    if (looking) p.look(mouse.x, mouse.y);
    this.lastMouse = looking ? mouse : { x: 0, y: 0 };
    this.lastWheel = looking ? mouse.wheel : 0;

    if (input.wasPressed('debug')) {
      this.debug = !this.debug;
      this.debugGroup.visible = this.debug;
    }
    // E toggles the mission board closed again (opening is an interaction)
    if (this.hud._boardOpen && input.wasPressed('interact')) this.input.onPanelToggle('close');
    const canMove = this.me.alive && !this.hud.isPanelOpen();
    p.update(dt, {
      forward: canMove && input.isHeld('forward'),
      back: canMove && input.isHeld('back'),
      left: canMove && input.isHeld('left'),
      right: canMove && input.isHeld('right'),
      jump: canMove && input.isHeld('jump'),
      sprint: canMove && input.isHeld('sprint'),
    });
    this.#updateCamera(dt);

    // network
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 1 / CONFIG.net.clientSendRate;
      this.#sendState();
    }
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = 2;
      this.net.send({ t: MSG.PING, c: performance.now() / 1000 });
    }

    const renderTime = this.net.serverNow() - CONFIG.net.interpDelay;
    this.remotes.update(dt, renderTime);

    WIND.uTime.value = this.time;
    const cam = this.gfx.camera.position;
    for (const u of this.worldUpdaters) u.update?.(dt, this.time, cam);
    for (const sys of this.systems) sys.update?.(dt, renderTime);
    this.#updateHud(dt);
    this.#updateAudio(dt);
  }

  #updateAudio(dt) {
    const cam = this.gfx.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd, up);
    const p = this.player;
    // footsteps
    this.stepDist += p.moveSpeed * dt * (p.onGround ? 1 : 0);
    if (this.stepDist > (p.sprinting ? 2.2 : 1.7)) {
      this.stepDist = 0;
      this.audio.play(p.inWater > 0.2 ? 'splash' : 'step', { vol: p.sprinting ? 1.3 : 1 });
    }
    // surf gets louder toward the coast
    const g = this.terrain.heightAt(p.pos.x, p.pos.z);
    const coast = Math.max(0, Math.min(1, (Math.hypot(p.pos.x, p.pos.z) - 110) / 70)) * (g < 6 ? 1 : 0.3);
    const fall = this.layout.waterfall?.bottom;
    const waterfallDistance = fall ? Math.hypot(p.pos.x - fall.x, p.pos.z - fall.z) : Infinity;
    this.audio.update(dt, { coast, waterfallDistance, danger: this.#inDanger() });
  }

  /**
   * Danger music only for a real threat: a nearby dinosaur that is hostile
   * (chasing / angry flag from the server), diving or attacking, or a recent
   * hit. Calm grazers, circling Pteranodons and the safe hut stay friendly.
   */
  #inDanger() {
    const p = this.player.pos;
    const h = this.layout.hut.campfire;
    if (Math.hypot(p.x - h.x, p.z - h.z) < CONFIG.player.hutHealRadius + 6) return false;
    if (this.time - (this.lastHurtAt ?? -99) < 3) return true;
    for (const v of this.dinos.map.values()) {
      if (!v.alive || v.type === 'brachio') continue;
      const hostile = (v.fl & 1) !== 0 || v.st === DS.ATTACK || v.st === DS.CHARGE || v.st === DS.DIVE;
      if (!hostile) continue;
      const range = v.type === 'trex' ? 75 : v.type === 'ptera' ? 45 : 40;
      if (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < range) return true;
    }
    return false;
  }

  /** Sound hooks called by the dinosaur views. */
  onRoar(v) { this.audio.play(`roar_${v.type}`, { pos: v.pos }); }
  onDinoAttack(v) { if (v.type !== 'brachio') this.audio.play(v.type === 'stego' ? 'bigStep' : 'bite', { pos: v.pos }); }
  onDinoHit(v, m) { if (m.by !== this.me.id) this.audio.play('hit', { pos: v.pos, vol: 0.7 }); }
  onDinoStep(v) { this.audio.play('bigStep', { pos: v.pos, vol: v.type === 'trex' ? 1.2 : 0.7 }); }

  #updateHud(dt) {
    const hud = this.hud;
    const p = this.player;
    hud.setHealth(this.me.hp, CONFIG.player.maxHealth);
    hud.setStamina(p.stamina, CONFIG.player.maxStamina);
    hud.setCompass(p.yaw, this.compassMarkers());
    const team = [{ id: this.me.id, name: this.me.name, slot: this.me.slot, hp: this.me.hp, alive: this.me.alive, isYou: true }];
    for (const rp of this.remotes.map.values()) team.push({ id: rp.id, name: rp.name, slot: rp.slot, hp: rp.hp, alive: rp.alive, isYou: false });
    team.sort((a, b) => a.slot - b.slot);
    this.team = team;
    hud.setTeam(team);
    hud.setMinimap({
      x: p.pos.x, z: p.pos.z, yaw: p.yaw,
      players: [...this.remotes.map.values()].map((rp) => ({ x: rp.pos.x, z: rp.pos.z, yaw: rp.yaw, color: CONFIG.playerColors[rp.slot % 4] })),
      hut: { x: this.layout.hut.x, z: this.layout.hut.z },
      markers: this.#collect('minimapMarkers'),
    });
    if (!this.me.alive) {
      this.me.deathT = Math.max(0, this.me.deathT - dt);
      hud.setDeath(true, Math.ceil(this.me.deathT));
    }
  }

  /** Compass markers: the hut and teammates. */
  compassMarkers() {
    const p = this.player.pos;
    const bearing = (x, z) => Math.atan2(-(x - p.x), -(z - p.z));
    const list = [{ bearing: bearing(this.layout.hut.x, this.layout.hut.z), kind: 'hut' }];
    for (const rp of this.remotes.map.values()) {
      list.push({ bearing: bearing(rp.pos.x, rp.pos.z), kind: 'player', color: CONFIG.playerColors[rp.slot % 4] });
    }
    for (const sys of this.systems) sys.compassMarkers?.(bearing, list);
    return list;
  }

  #collect(method) {
    const out = [];
    for (const sys of this.systems) sys[method]?.(out);
    return out;
  }

  #updateCamera(dt) {
    const p = this.player;
    const cam = this.gfx.camera;
    // Head bob scaled by speed; a small dip on landing; lying down when dead.
    const bobAmt = p.onGround ? Math.min(1, p.moveSpeed / CONFIG.player.sprintSpeed) : 0;
    const phase = p.distance * (p.sprinting ? 1.25 : 1.6);
    const bobY = Math.abs(Math.sin(phase)) * 0.07 * bobAmt;
    const bobX = Math.cos(phase) * 0.035 * bobAmt;
    p.landImpact = Math.max(0, p.landImpact - dt * 3);
    const deadDrop = this.me.alive ? 0 : 1.2;
    cam.position.set(
      p.pos.x + Math.cos(p.yaw) * bobX,
      p.pos.y + CONFIG.player.eyeHeight + bobY - p.landImpact * 0.25 - deadDrop,
      p.pos.z - Math.sin(p.yaw) * bobX,
    );
    const roll = this.me.alive ? (p.knockTimer > 0 ? Math.sin(this.time * 20) * 0.05 : 0) : 0.5;
    cam.rotation.set(p.pitch, p.yaw, roll, 'YXZ');
    const targetFov = settings.fov + (p.sprinting ? 6 : 0);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    this.gfx.followSun(p.pos.x, p.pos.y, p.pos.z);
    // light the viewmodel from the same sun direction, in camera space
    this.gfx.viewSun.position.copy(this.gfx.sunDir).applyQuaternion(cam.quaternion.clone().invert());
  }
}
