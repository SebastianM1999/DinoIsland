// Client game shell: owns the renderer, the world view, the local player,
// the connection to the authoritative world, and the main rAF loop.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { resolveDinoContact } from '../../shared/dinoContact.js';
import { Terrain } from '../../shared/terrain.js';
import { buildLayout } from '../../shared/layout.js';
import { planIsland } from '../../shared/island.js';
import { RELICS } from '../../shared/relics.js';
import { MSG, EV, PF, DS, ACT } from '../../shared/protocol.js';
import { CONTRACTS } from '../../shared/missions.js';
import { Renderer } from './renderer.js';
import { Input } from '../input/input.js';
import { PlayerController } from '../player/controller.js';
import { StuckDetector } from '../player/stuck.js';
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
import { footstepSurface, woodSupports } from '../audio/surface.js';
import { StepCadence } from '../audio/steps.js';
import { settings } from './settings.js';
import { Wardrobe } from '../ui/wardrobe.js';
import { BoatPanel } from '../ui/boatPanel.js';
import { Relics } from '../entities/relics.js';
import { buildSites } from '../world/sites.js';
import { buildGrove } from '../world/grove.js';
import { buildLogs } from '../world/logs.js';
import { GrovePrompt } from '../ui/grovePrompt.js';
import { mayEnterGrove, GROVE_STONE_REACH } from '../../shared/grove.js';
import { buildBossArena } from '../world/bossArena.js';
import { BIOMES } from '../../shared/levels.js';

/** The air over the boss arena: the volcano island's ash, darker and redder. */
const BOSS_SKY = {
  ...BIOMES.volcano.sky,
  background: '#3a2626', fog: '#4a2a26', fogNear: 25, fogFar: 170,
  top: '#1c1418', horizon: '#7a3424', cloud: '#5a3a36',
  sun: '#ff8a5a', sunIntensity: 1.25, hemiSky: '#6a5a6e', hemiGround: '#8a2e1a', hemiIntensity: 1.0,
  exposure: 0.95,
};

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../net/net.js').Net} net connected session (welcome received)
   * @param {{gfx, audio, input}|null} [reuse] renderer/audio/input of the previous island
   */
  constructor(canvas, net, reuse = null) {
    this.canvas = canvas;
    this.net = net;
    const lv = net.welcome.world.level || { index: 0, variant: 1 };
    this.level = lv;
    this.terrain = new Terrain(planIsland(lv.index, lv.variant));
    this.layout = buildLayout(this.terrain);
    this.gfx = reuse?.gfx ?? new Renderer(canvas);
    if (reuse) this.gfx.reset();
    this.gfx.applyBiome(this.layout.biome.sky);
    this.input = reuse?.input ?? new Input(canvas);
    this.player = new PlayerController(this.terrain, this.layout.playerColliders, this.layout.rockSurfaceAt);
    // Primeval Grove: an invisible wall until the player may enter (TODO(grove-unlock) in shared/grove.js)
    const grove = this.layout.grove;
    if (grove) {
      this.groveArmed = true;
      this.player.barrier = {
        // just outside the standing stones, so walking up to the ring always meets the barrier (and the prompt)
        x: grove.x, z: grove.z, r: grove.r + GROVE_STONE_REACH,
        mayEnter: () => mayEnterGrove(this.player),
        onBlocked: () => this.#onGroveBlocked(),
      };
    }
    this.stuck = new StuckDetector((manual) => this.net.act(ACT.UNSTUCK, { manual }), (text) => this.hud?.toast(text, 'info'));
    this.time = 0;
    this.wasFlying = false;
    this.running = false;
    this.debug = false;
    this.sendTimer = 0;
    this.pingTimer = 0;
    this.onLeave = null;

    // Overlay for nameplates and other screen-space labels.
    this.overlay = document.createElement('div');
    this.overlay.className = 'world-overlay';
    document.body.appendChild(this.overlay);

    this.audio = reuse?.audio ?? new GameAudio();
    this.audio.setIsland(this.layout.biome.id);
    this.woodSupports = woodSupports(this.layout);
    this.stepCadence = new StepCadence();
    this.hud = new Hud(document.getElementById('hud'));
    this.hud.initMinimap(this.terrain, this.layout);
    try { this.hud.trackedContract = localStorage.getItem('di.tracked') || null; } catch { /* storage blocked */ }
    this.hud.onTrackContract = (id) => {
      try { if (id) localStorage.setItem('di.tracked', id); else localStorage.removeItem('di.tracked'); } catch { /* ignore */ }
      this.#showMission();
    };
    this.input.onPanelToggle = (action) => {
      if (action === 'interact') {
        if (!(this.hud._boardOpen || this.hud.isExtraOpen('wardrobe') || this.hud.isExtraOpen('boat'))) return false;
        action = 'close';
      }
      if (action === 'close' && !this.hud.isPanelOpen()) return false;
      let open;
      if (action === 'inventory') open = this.hud.toggleInventory();
      else if (action === 'map') open = this.hud.toggleMap();
      else if (action === 'board') open = this.hud.toggleBoard();
      else if (action === 'wardrobe') open = this.hud.togglePanel('wardrobe');
      else if (action === 'boat') open = this.hud.togglePanel('boat');
      else if (action === 'grove') open = this.hud.togglePanel('grove');
      else {
        this.hud.toggleInventory(false);
        this.hud.toggleMap(false);
        this.hud.toggleBoard(false);
        this.hud.togglePanel('wardrobe', false);
        this.hud.togglePanel('boat', false);
        if (this.hud.isExtraOpen('grove')) this.hud.togglePanel('grove', false);
        open = false;
      }
      this.onPanelChange?.(open);
      if (open) this.input.exitLock();
      else this.input.requestLock();
      return true;
    };
    this.hud.onCloseBoard = () => this.input.onPanelToggle('close');

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
    this.relics = new Relics(this);
    this.systems = [this.dinos, this.tracks, this.items, this.actions, this.projectiles, this.relics];

    this.#applyWelcome(w);
    this.wardrobe = new Wardrobe({
      slot: this.me.slot,
      outfit: this.me.outfit,
      onWear: (outfit) => this.net.act(ACT.OUTFIT, { outfit }),
      onClose: () => this.input.onPanelToggle('close'),
    });
    this.hud.addPanel('wardrobe', {
      el: this.wardrobe.el,
      onOpen: () => this.wardrobe.onOpen(),
      onClose: () => this.wardrobe.onClosed(),
    });
    this.boatPanel = new BoatPanel({
      onRepair: () => this.net.act(ACT.REPAIR),
      onClose: () => this.input.onPanelToggle('close'),
    });
    this.hud.addPanel('boat', { el: this.boatPanel.el, onOpen: () => this.boatPanel.onOpen() });
    this.grovePrompt = new GrovePrompt({
      onClose: () => this.input.onPanelToggle('close'),
      speaker: () => this.me.name,
    });
    this.hud.addPanel('grove', { el: this.grovePrompt.el, onOpen: () => this.grovePrompt.onOpen() });
    this.boatPanel.setMission(this.mission);
    this.sites.boat.setRepaired?.(!!w.world.boat?.repaired);
    this.sites.boat.setParts?.((w.world.relics || []).filter((r) => r.found).map((r) => r.kind));
    this.#bindNet();

    this.clock = new THREE.Clock(false);
    this.loop = this.loop.bind(this);
  }

  #buildWorld() {
    const scene = this.gfx.scene;
    scene.add(buildTerrainMesh(this.terrain, this.layout));

    this.sky = buildSky(this.gfx, this.layout);
    this.water = buildWater(this.terrain, this.layout, this.gfx.sunDir);
    this.vegetation = buildVegetation(this.terrain, this.layout);
    this.rocks = buildRocks(this.terrain, this.layout);
    this.fruitPlants = buildFruitPlants(this.terrain, this.layout);
    this.hut = buildHut(this.terrain, this.layout);
    this.sites = buildSites(this.terrain, this.layout);
    this.grove = buildGrove(this.terrain, this.layout);
    this.logs = buildLogs(this.terrain, this.layout);
    this.bossArena = buildBossArena(this.terrain, this.layout);
    scene.add(this.sky.group, this.water.group, this.vegetation.group, this.rocks.group, this.fruitPlants.group, this.hut.group, this.sites.group, this.grove.group, this.logs.group, this.bossArena.group);
    this.worldUpdaters = [this.sky, this.water, this.vegetation, this.fruitPlants, this.hut, this.sites, this.grove, this.bossArena];
    this.moodK = 0;

    // Debug view of colliders (F3).
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    const dm = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const dmRock = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true }); // blocks dinosaurs only
    for (const c of this.layout.colliders.circles) {
      const g = this.terrain.heightAt(c.x, c.z);
      const bottom = Math.max(c.bottom ?? g, g - 0.2), top = c.top ?? g + 3;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, top - bottom, 10), c.kind === 'rock' ? dmRock : dm);
      m.position.set(c.x, (top + bottom) / 2, c.z);
      this.debugGroup.add(m);
    }
    for (const b of this.layout.colliders.boxes) {
      const g = this.terrain.heightAt(b.x, b.z) - 0.2, top = b.top ?? g + 3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, top - g, b.hd * 2), dm);
      m.position.set(b.x, (top + g) / 2, b.z);
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
        this.me.outfit = p.outfit;
        this.actions.vm.setOutfit(p.outfit);
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

  /**
   * The player walked into the Primeval Grove's barrier: the curtain lights up
   * and (once per approach) the warning prompt opens. It re-arms when the
   * player has stepped back from the stones.
   */
  #onGroveBlocked() {
    this.grove?.flash();
    if (!this.groveArmed || !this.me?.alive || this.hud.isPanelOpen()) return;
    this.groveArmed = false;
    this.input.onPanelToggle('grove');
  }

  /** A projectile or shot hit the grove's barrier at world point `pt`. */
  onGroveBarrierHit(pt) {
    this.grove?.strike(pt);
  }

  /** E at the hut wardrobe. */
  openWardrobe() {
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('wardrobe');
  }

  /** E at the wrecked boat. */
  openBoat() {
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('boat');
  }

  /** E at the mission board. */
  openBoard() {
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('board');
  }

  #bindNet() {
    const net = this.net;
    // a second welcome means the team sailed on: main.js builds the next island
    net.on(MSG.WELCOME, (m) => this.onNewIsland?.(m));
    net.on(`ev:${EV.RELIC}`, (m) => {
      this.relics.found(m.id);
      this.audio.play('complete');
      const r = this.mission?.relics?.find((q) => q.id === m.id);
      const kinds = (this.mission?.relics || []).filter((q) => q.found || q.id === m.id).map((q) => q.kind);
      this.sites.boat.setParts?.(kinds);
      if (r && m.by === this.me.id) this.hud.toast(`${RELICS[r.kind].name} secured for the boat!`, r.kind);
    });
    net.on(`ev:${EV.BOAT}`, () => {
      this.sites.boat.setRepaired?.(true);
      this.audio.play('quest');
    });
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
      if (m.unstuck) { this.player.vel.y = 0; this.stuck.reset(this.player.pos); } else this.stuck.onCorrect(this.player.pos);
    });
    net.on(`ev:${EV.PLAYER_JOIN}`, (m) => this.remotes.add(m.player));
    net.on(`ev:${EV.PLAYER_LEAVE}`, (m) => this.remotes.remove(m.id));
    net.on(`ev:${EV.OUTFIT}`, (m) => {
      if (m.id === this.me.id) {
        this.me.outfit = m.outfit;
        this.actions.vm.setOutfit(m.outfit);
        this.wardrobe.setWorn(m.outfit);
        this.hud.toast('New outfit on!', 'team');
      } else {
        this.remotes.setOutfit(m.id, m.outfit);
      }
    });
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
      this.boatPanel.setMission(m.mission);
      this.hud.missionComplete(m.mission.complete, { completedIn: m.mission.completedIn, won: m.mission.won, next: m.mission.level?.number + 1 });
    });
    net.on(`ev:${EV.STORE}`, (m) => { this.store = m.store; });
    net.on(`ev:${EV.HURT}`, (m) => {
      if (m.id === this.me.id) {
        this.me.hp = m.hp;
        this.lastHurtAt = this.time;
        this.hud.damageFlash(m.dmg);
        if (m.src) {
          const name = CONFIG.dinos[m.src]?.name || (m.src === 'lava' ? 'Lava' : 'Dinosaur');
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
    this.audio.startMusic();
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
    this.audio.stopMusic();
    this.input.enabled = false;
    this.input.exitLock();
  }

  /**
   * Tear this island down (the next one is built by main.js). Returns the
   * renderer, audio and input so the next Game can reuse them.
   */
  dispose() {
    this.stop();
    this.dinos.dispose();
    this.overlay.remove();
    this.wardrobe.dispose?.();
    this.net.clearHandlers();
    this.hud.show(false);
    this.input.onPanelToggle = null;
    this.input.onLockChange = null;
    this.audio.update?.(0, { coast: 0, water: {}, danger: false });   // water loops fade out
    return { gfx: this.gfx, audio: this.audio, input: this.input };
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

  /** Creative mode: invincible (server-side) and double-tap Space to fly. */
  setCreative(on) {
    this.player.setCreative(on);
    this.net.act(ACT.CREATIVE, { on });
    this.hud.toast(on ? 'Creative mode on – double-tap Space to fly' : 'Creative mode off', 'bolt');
  }

  update(dt) {
    const input = this.input;
    const p = this.player;
    const mouse = input.takeMouse();
    const looking = input.locked && !this.hud.isPanelOpen();
    if (looking) p.look(mouse.x, mouse.y);
    this.lastMouse = looking ? mouse : { x: 0, y: 0 };
    this.lastWheel = looking ? mouse.wheel : 0;

    if (p.flying !== this.wasFlying) {
      this.wasFlying = p.flying;
      this.hud.toast(p.flying ? 'Flying – Space up, Shift down' : 'Landed', 'bolt');
    }
    if (input.wasPressed('debug')) {
      this.debug = !this.debug;
      this.debugGroup.visible = this.debug;
    }
    const canMove = this.me.alive && !this.hud.isPanelOpen();
    const previousPos = { ...p.pos };
    p.update(dt, {
      forward: canMove && input.isHeld('forward'),
      back: canMove && input.isHeld('back'),
      left: canMove && input.isHeld('left'),
      right: canMove && input.isHeld('right'),
      jump: canMove && input.isHeld('jump'),
      sprint: canMove && input.isHeld('sprint'),
    });
    if (this.me.alive && !p.creative) {
      const contact = resolveDinoContact(previousPos, p.pos, this.dinos.map.values(), this.layout.playerColliders);
      p.pos.x = contact.x; p.pos.z = contact.z;
      if (contact.hit) p.pos.y = Math.max(p.pos.y, p.groundAt(p.pos.x, p.pos.z, p.pos.y));
    }
    if (canMove && input.wasPressed('unstuck')) this.stuck.manual();
    // the grove prompt shows again once the player has stepped back from the stones
    const gv = this.layout.grove;
    if (gv && !this.groveArmed && Math.hypot(p.pos.x - gv.x, p.pos.z - gv.z) > gv.r + GROVE_STONE_REACH + 2.5) this.groveArmed = true;
    this.stuck.update(dt, p, canMove && ['forward', 'back', 'left', 'right'].some((a) => input.isHeld(a)), canMove);
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
    this.#mood(dt, cam);
    for (const u of this.worldUpdaters) u.update?.(dt, this.time, cam);
    for (const sys of this.systems) sys.update?.(dt, renderTime);
    this.#updateHud(dt);
    this.#updateAudio(dt);
  }

  /**
   * The boss arena darkens the air around it: sky, fog and light ease toward
   * the volcano island's ash and glow as the camera nears the islet, and back.
   */
  #mood(dt, cam) {
    const a = this.layout.bossArena;
    if (!a) return;
    const d = Math.hypot(cam.x - a.center.x, cam.z - a.center.z);
    const want = 1 - THREE.MathUtils.smoothstep(d, a.lakeR, a.outerR + 45);
    const k = this.moodK + (want - this.moodK) * Math.min(1, dt * 2.5);
    if (Math.abs(k - this.moodK) < 1e-4 && (k === 0 || Math.abs(want - k) < 1e-4)) return;
    this.moodK = Math.abs(k - want) < 1e-3 ? want : k;
    this.gfx.blendBiome(this.layout.biome.sky, BOSS_SKY, this.moodK);
    this.sky.mood?.(this.moodK, BOSS_SKY);
  }

  #updateAudio(dt) {
    const cam = this.gfx.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd, up);
    const p = this.player;
    // footsteps (in water: a splashing step and a ring on the surface)
    if (this.stepCadence.update(p, dt)) {
      const surface = footstepSurface(p, this.terrain, this.layout, this.woodSupports);
      if (surface === 'water') {
        this.audio.play('waterStep', { vol: Math.min(1.4, 0.55 + p.inWater * 0.8) * (p.sprinting ? 1.25 : 1) * (p.swimming ? 0.7 : 1) });
        this.water.ripple(p.pos.x, p.pos.z, Math.min(1, 0.3 + p.inWater * 0.5));
      } else this.audio.play('step', { surface, movement: p.sprinting ? 'run' : 'walk', vol: p.sprinting ? 1.3 : 1 });
    }
    this.#waterEvents(dt);
    // surf gets louder toward the coast
    const g = this.terrain.heightAt(p.pos.x, p.pos.z);
    const plan = this.layout.plan;
    const rim = Math.hypot(p.pos.x / plan.A, p.pos.z / plan.B);
    const coast = Math.max(0, Math.min(1, (rim - 0.7) / 0.3)) * (g < 6 ? 1 : 0.3);
    this.audio.update(dt, { coast, water: this.#waterSoundscape(cam.position), danger: this.#inDanger() });
  }

  /**
   * The local player and the water: a big splash when jumping / falling in, a
   * wake of rings while wading or swimming.
   * TODO(water-sim): dinosaurs and remote players wading don't ripple the water yet.
   */
  #waterEvents(dt) {
    const p = this.player;
    const depth = p.inWater;
    const prev = this.prevWaterDepth ?? depth;
    this.prevWaterDepth = depth;
    const fallSpeed = -(this.prevVelY ?? 0);
    this.prevVelY = p.vel.y;
    if (depth > 0.25 && prev < 0.05 || (p.swimming && !this.wasSwimming)) {
      const big = Math.min(1.5, 0.4 + Math.max(0, fallSpeed) / 8 + depth * 0.3);
      const y = this.terrain.waterLevelAt(p.pos.x, p.pos.z) ?? p.pos.y;
      this.water.splash(p.pos.x, y, p.pos.z, big);
      this.audio.play(big > 0.8 ? 'splashBig' : 'waterStep', { vol: big });
    }
    this.wasSwimming = p.swimming;
    // a wake of rings behind the player while moving through water
    this.wakeT = (this.wakeT ?? 0) - dt;
    if (depth > 0.15 && p.moveSpeed > 0.6 && this.wakeT <= 0) {
      this.wakeT = p.swimming ? 0.5 : 0.32;
      this.water.ripple(p.pos.x, p.pos.z, Math.min(0.9, 0.25 + p.moveSpeed * 0.06));
    }
  }

  /** Something (an arrow, a spear) hit the water at `pt`. */
  onWaterSplash(pt, strength = 0.4) {
    this.water.splash(pt.x, pt.y, pt.z, strength);
    this.audio.play(strength > 0.8 ? 'splashBig' : 'plop', { pos: pt, vol: 0.6 + strength * 0.5 });
  }

  /**
   * Where the water sounds come from, seen from the listener at `cam`: the
   * waterfall (impact, cascade, grotto), the nearest stretch of river and the
   * nearest pool – for the distance-driven water ambience in audio.js.
   */
  #waterSoundscape(cam) {
    const w = {};
    const L = this.layout;
    const wf = L.waterfall;
    if (wf?.impact) {
      const impact = { x: wf.impact.x, y: wf.impact.y + 0.5, z: wf.impact.z };
      const mid = { x: (wf.top.x + wf.impact.x) / 2, y: (wf.top.y + wf.impact.y) / 2, z: (wf.top.z + wf.impact.z) / 2 };
      const d3 = (q) => Math.hypot(cam.x - q.x, (cam.y - q.y) * 0.7, cam.z - q.z);
      w.fall = { impact, d: d3(impact), cascade: wf.cascade ?? 0, cascadePos: mid, cascadeD: d3(mid) };
      if (wf.source) w.spring = { pos: { x: wf.source.x, y: wf.source.y, z: wf.source.z }, d: d3(wf.source) };
    }
    const river = L.rivers.find((r) => r.kind === 'water');
    if (river) {
      let best = null;
      const pts = river.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((cam.x - a.x) * vx + (cam.z - a.z) * vz) / (vx * vx + vz * vz || 1)));
        const x = a.x + vx * u, z = a.z + vz * u;
        const d = Math.hypot(cam.x - x, cam.z - z) - (a.w + (b.w - a.w) * u) / 2;
        if (!best || d < best.d) {
          const slope = Math.max(0, a.y - b.y) / (Math.hypot(vx, vz) || 1);
          best = { d: Math.max(0, d), pos: { x, y: a.y + (b.y - a.y) * u, z }, w: a.w + (b.w - a.w) * u, slope };
        }
      }
      // size: width and pace (a narrow, steep stretch babbles; a broad one rushes)
      if (best) w.river = { pos: best.pos, d: best.d, size: Math.min(1, Math.max(0, (best.w - 5) / 9) + best.slope * 2) };
    }
    let pool = null;
    for (const pl of L.pools) {
      if (pl.kind !== 'water') continue;
      const d = Math.max(0, Math.hypot(cam.x - pl.x, cam.z - pl.z) - pl.r);
      if (!pool || d < pool.d) pool = { pos: { x: pl.x, y: pl.level, z: pl.z }, d, r: pl.r };
    }
    if (pool) w.pool = pool;
    const p = this.player;
    if (p.inWater > 0.05) w.wade = { depth: p.inWater, speed: p.moveSpeed, swimming: p.swimming };
    return w;
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

  /** Compass markers: the hut, the boat and teammates. */
  compassMarkers() {
    const p = this.player.pos;
    const bearing = (x, z) => Math.atan2(-(x - p.x), -(z - p.z));
    const list = [
      { bearing: bearing(this.layout.hut.x, this.layout.hut.z), kind: 'hut' },
      { bearing: bearing(this.layout.boat.x, this.layout.boat.z), kind: 'boat' },
    ];
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
