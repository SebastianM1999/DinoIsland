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
import { skillMods, DASH } from '../../shared/skills.js';
import { loadProfile } from './profile.js';
import { SkillPanel } from '../ui/skillPanel.js';
import { nearCamp } from '../ui/skillModel.js';
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
import { setSurfaceQuality } from '../world/surfaceDetail.js';
import { buildFruitPlants } from '../world/fruitPlants.js';
import { buildHut } from '../world/hut.js';
import { buildBaseView } from '../world/base.js';
import { BasePanel } from '../ui/basePanel.js';
import { campStations, safeZone, applyBaseColliders, hasBasePlots, freshBase } from '../../shared/base.js';
import { WIND } from '../models/kit.js';
import { RemotePlayers } from '../entities/remotePlayers.js';
import { Hud } from '../ui/hud.js';
import { DinoViews } from '../entities/dinoViews.js';
import { Tracks } from '../entities/tracks.js';
import { Torches } from '../entities/torches.js';
import { Items } from '../entities/items.js';
import { Projectiles } from '../entities/projectiles.js';
import { PlayerActions } from '../player/actions.js';
import { GameAudio } from '../audio/audio.js';
import { inBossMusicArea } from '../audio/region.js';
import { footstepSurface, woodSupports } from '../audio/surface.js';
import { creatureStepAudible } from '../audio/creatureSteps.js';
import { StepCadence } from '../audio/steps.js';
import { settings, setSetting, onSettings, FPS_LIMITS } from './settings.js';
import { PerfStats } from '../ui/perfStats.js';
import { storageKey } from '../../shared/brand.js';
import { Wardrobe } from '../ui/wardrobe.js';
import { BoatPanel } from '../ui/boatPanel.js';
import { CraftingPanel } from '../ui/craftingPanel.js';
import { Relics } from '../entities/relics.js';
import { buildSites } from '../world/sites.js';
import { buildGrove } from '../world/grove.js';
import { buildLogs } from '../world/logs.js';
import { GrovePrompt } from '../ui/grovePrompt.js';
import { mayEnterGrove, GROVE_STONE_REACH } from '../../shared/grove.js';
import { buildBossArena } from '../world/bossArena.js';
import { buildSwampArena } from '../world/swampArena.js';
import { buildSwampFx, thickSky } from '../world/swampFx.js';
import { buildVolcanoArena } from '../world/volcanoArena.js';
import { ashShelter } from '../../shared/volcanoArena.js';
import { buildVolcanoFx, ashSky } from '../world/volcanoFx.js';
import { BIOMES } from '../../shared/levels.js';
import { disposeIslandScenes } from './resources.js';

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
    if (reuse?.gfx) this.gfx.reset();
    this.gfx.applyBiome(this.layout.biome.sky);
    this.input = reuse?.input ?? new Input(canvas);
    this.player = new PlayerController(this.terrain, this.layout.playerColliders, this.layout.rockSurfaceAt);
    // progression: the net layer keeps the newest server profile (it can arrive while the island loads), else the saved one
    this.profile = net.prof ?? loadProfile();
    this.mods = skillMods(this.profile.skills);   // skill effects of the local player (the setter feeds the controller)
    this.player.onDash = () => this.net.act(ACT.DASH, {});
    this.downed = null;         // { left, t, canGiveUp, reviveBy?, reviveT? } while the server has us downed (bleeding out)
    this.reviveTarget = null;   // { id, name, progress } downed teammate in reach (set by PlayerActions)
    this.medicTarget = null;    // { id, name } hurt teammate we could heal with fruit (Field Medic)
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
    this.hudTimer = 0;
    this.audioQueryTimer = 0;
    this.audioForward = new THREE.Vector3();
    this.audioUp = new THREE.Vector3();
    this.renderTime = 0;      // server time remote entities are drawn at (sent with hits for lag compensation)
    this.corrections = 0;     // server position corrections received (performance overlay)
    // Camera-only offset after a small correction: the body snaps, the view glides.
    this.corrOffset = { x: 0, y: 0, z: 0 };
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
    this.hud.setXp(this.profile);
    try { this.hud.trackedContract = localStorage.getItem(storageKey('tracked')) || null; } catch { /* storage blocked */ }
    this.hud.onTrackContract = (id) => {
      try { if (id) localStorage.setItem(storageKey('tracked'), id); else localStorage.removeItem(storageKey('tracked')); } catch { /* ignore */ }
      this.#showMission();
    };
    this.input.onPanelToggle = (action) => {
      if (action === 'quests') {
        if (!this.hud.isPanelOpen()) this.hud.toggleMissionDetails();
        return true;
      }
      if (action === 'interact') {
        if (!(this.hud._boardOpen || this.hud.isExtraOpen('wardrobe') || this.hud.isExtraOpen('boat') || this.hud.isExtraOpen('crafting') || this.hud.isExtraOpen('base'))) return false;
        action = 'close';
      }
      if (action === 'close' && !this.hud.isPanelOpen()) return false;
      let open;
      if (action === 'inventory') open = this.hud.toggleInventory();
      else if (action === 'map') open = this.hud.toggleMap();
      else if (action === 'board') open = this.hud.toggleBoard();
      else if (action === 'wardrobe') open = this.hud.togglePanel('wardrobe');
      else if (action === 'boat') open = this.hud.togglePanel('boat');
      else if (action === 'crafting') open = this.hud.togglePanel('crafting');
      else if (action === 'base') open = this.hud.togglePanel('base');
      else if (action === 'skills') open = this.hud.togglePanel('skills');
      else if (action === 'grove') open = this.hud.togglePanel('grove');
      else {
        this.hud.toggleInventory(false);
        this.hud.toggleMap(false);
        this.hud.toggleBoard(false);
        this.hud.togglePanel('wardrobe', false);
        this.hud.togglePanel('boat', false);
        this.hud.togglePanel('crafting', false);
        this.hud.togglePanel('base', false);
        this.hud.togglePanel('skills', false);
        if (this.hud.isExtraOpen('grove')) this.hud.togglePanel('grove', false);
        open = false;
      }
      this.onPanelChange?.(open);
      if (open) this.input.exitLock();
      else this.input.requestLock();
      return true;
    };
    this.hud.onCloseBoard = () => this.input.onPanelToggle('close');
    this.hud.onCloseInventory = () => this.input.onPanelToggle('close');

    this.#buildWorld();
    this.stats = new PerfStats(this.overlay);
    this.unsubSettings = onSettings((s) => {
      this.stats.setMode(s.stats);
    });
    this.unsubGraphics = this.gfx.onGraphics((g) => {
      this.vegetation.setQuality(g);
      this.rocks.setQuality(g);
      setSurfaceQuality(g);
      this.swampFx.setQuality(g);
      this.volcanoFx.setQuality(g);
      this.vegetation.setDensity(g.grass);
    });
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

    this.torchLit = false;    // off-hand torch lit (L); sent as PF.TORCH, the server only accepts it with a torch in the pack
    this.torches = new Torches(this);   // after the island is built, before gfx.prepare(): creates its light pool
    this.systems.push(this.torches);
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
    this.craftingPanel = new CraftingPanel({
      onCraft: (recipe) => this.net.act(ACT.CRAFT, { recipe }),
      onRefill: () => this.net.act(ACT.REFILL),
      onClose: () => this.input.onPanelToggle('close'),
    });
    this.hud.addPanel('crafting', { el: this.craftingPanel.el, onOpen: () => { this.#syncCrafting(); this.craftingPanel.onOpen(); } });
    this.#syncCrafting();
    this.basePanel = new BasePanel({
      onBuild: (plot) => this.net.act(ACT.BASE, { op: 'build', plot }),
      onUpgrade: () => this.net.act(ACT.BASE, { op: 'upgrade' }),
      onTower: (slot, kind) => this.net.act(ACT.BASE, { op: 'tower', slot, kind }),
      onTowerUp: (slot) => this.net.act(ACT.BASE, { op: 'towerUp', slot }),
      onRepair: () => this.net.act(ACT.BASE, { op: 'repair' }),
      onClose: () => this.input.onPanelToggle('close'),
    });
    this.hud.addPanel('base', { el: this.basePanel.el, onOpen: () => { this.#syncBase(); this.basePanel.onOpen(); } });
    this.skillPanel = new SkillPanel({
      onBuy: (id) => this.net.act(ACT.SKILL, { op: 'buy', id }),
      onReset: () => this.net.act(ACT.SKILL, { op: 'reset' }),
      onClose: () => this.input.onPanelToggle('close'),
    });
    this.skillPanel.setProfile(this.profile);
    this.hud.addPanel('skills', { el: this.skillPanel.el, onOpen: () => { this.skillPanel.setAtCamp(this.#atCamp()); this.skillPanel.onOpen(); } });
    this.grovePrompt = new GrovePrompt({
      onClose: () => this.input.onPanelToggle('close'),
      speaker: () => this.me.name,
    });
    this.hud.addPanel('grove', { el: this.grovePrompt.el, onOpen: () => this.grovePrompt.onOpen() });
    this.boatPanel.setMission(this.mission);
    this.sites.boat.setRepaired?.(!!w.world.boat?.repaired);
    this.sites.boat.setParts?.((w.world.relics || []).filter((r) => r.found).map((r) => r.kind));
    this.#bindNet();
    this.net.stateProvider = () => this.#state();

    this.clock = new THREE.Clock(false);
    this.loop = this.loop.bind(this);
    this.lastFrameAt = -Infinity;   // FPS limiter
  }

  #buildWorld() {
    const scene = this.gfx.scene;
    scene.add(buildTerrainMesh(this.terrain, this.layout));

    this.sky = buildSky(this.gfx, this.layout);
    this.water = buildWater(this.terrain, this.layout, this.gfx.sunDir);
    this.vegetation = buildVegetation(this.terrain, this.layout);
    this.rocks = buildRocks(this.terrain, this.layout);
    this.fruitPlants = buildFruitPlants(this.terrain, this.layout);
    // islands with building plots start at a small landing camp; the team builds its own base
    this.hut = buildHut(this.terrain, this.layout, { landing: hasBasePlots(this.layout) });
    this.baseView = buildBaseView(this.terrain, this.layout);
    this.sites = buildSites(this.terrain, this.layout);
    this.grove = buildGrove(this.terrain, this.layout);
    this.logs = buildLogs(this.terrain, this.layout);
    this.bossArena = buildBossArena(this.terrain, this.layout);
    this.swampArena = buildSwampArena(this.terrain, this.layout);
    // the swamp's fog draws in where the mist is thick (swampFx.js mistiness)
    const swampSky = this.layout.biome.sky, swampThick = thickSky(swampSky || {});
    this.swampFx = buildSwampFx(this.terrain, this.layout, this.gfx.camera, (k) => this.gfx.blendBiome(swampSky, swampThick, k));
    this.volcanoArena = buildVolcanoArena(this.terrain, this.layout);
    // the volcano: ash rain thickens the air; a lava bomb landing nearby shakes the view
    const ashBase = this.layout.biome.sky, ashThick = ashSky(ashBase || {});
    this.volcanoFx = buildVolcanoFx(this.terrain, this.layout, this.gfx.camera, {
      onFog: (k) => this.gfx.blendBiome(ashBase, ashThick, k),
      onImpact: (x, y, z) => this.#bombImpact(x, y, z),
      onGeyser: (x, y, z) => {
        this.audio.play('geyserBlast', { pos: { x, y: y + 2, z } });
        if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 14) this.shake = Math.max(this.shake, 0.35);
      },
    });
    scene.add(this.sky.group, this.water.group, this.vegetation.group, this.rocks.group, this.fruitPlants.group, this.hut.group, this.baseView.group, this.sites.group, this.grove.group, this.logs.group, this.bossArena.group, this.swampArena.group, this.swampFx.group, this.volcanoArena.group, this.volcanoFx.group);
    this.worldUpdaters = [this.sky, this.water, this.vegetation, this.rocks, this.fruitPlants, this.hut, this.baseView, this.sites, this.grove, this.bossArena, this.swampArena, this.swampFx, this.volcanoArena, this.volcanoFx];
    this.shake = 0;
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
    this.setBase(world.base || freshBase());
    this.raid = world.raid || { phase: 'idle' };
    this.volcanoFx.setState(world.volcano);
    for (const c of world.volcano?.columns || []) this.volcanoArena.sink(c.id, c.left);
    if (world.volcano?.treasure) this.volcanoArena.openTreasure();
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
    this.hud.setMission({ ...m, objectives, trackedObjective: c ? objectives.at(-1) : null });
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

  /** E at the hut workbench. */
  openCrafting() {
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('crafting');
  }

  /** Push the hut store, built upgrades and island number into the crafting panel. */
  #syncCrafting() {
    this.craftingPanel.setState({
      store: this.store,
      upgrades: this.me.inv?.upgrades || [],
      island: this.mission?.level?.number ?? 1,
      creative: this.player.creative,
    });
  }

  /** The team's base changed (shared/base.js): colliders, model and panel follow. */
  setBase(base) {
    this.base = base;
    applyBaseColliders(this.layout, base);
    this.baseView.setBase(base);
    this.#syncBase();
  }

  /** Camp functions available right now (hut on island 1, landing camp + base later). */
  stations() { return campStations(this.layout, this.base, this.layout.level.index); }

  /** A point `dist` m out from the base in the direction a raid comes from. */
  #raidPoint(dist) {
    const home = this.stations().home;
    const a = this.raid?.dir ?? 0;
    return { x: home.x - Math.sin(a) * dist, y: home.y ?? 0, z: home.z - Math.cos(a) * dist };
  }

  /** E at a building plot's stake (plot index) or at the base flag (-1). */
  openBase(plot = -1) {
    this.basePlot = plot;
    if (!this.hud.isPanelOpen()) this.input.onPanelToggle('base');
  }

  #syncBase() {
    if (!this.basePanel) return;
    const plot = this.basePlot ?? -1;
    this.basePanel.setState({
      store: this.store, base: this.base, island: this.layout.level.number, creative: this.player.creative,
      plot, plotKind: (this.layout.basePlots[plot] || this.layout.basePlots[this.base?.plot ?? -1])?.kind ?? null,
    });
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
          if (row[12] > 0) this.me.mhp = row[12];
          this.#syncDowned(row[8]);
          continue;
        }
        this.remotes.onRow(m.now, row);
      }
      for (const sys of this.systems) sys.onSnapshot?.(m);
    });
    net.on(MSG.INV, (m) => { this.me.inv = m.inv; this.player?.setBuffs?.(m.inv.buffs); this.#syncCrafting(); });
    // the net layer already sanitized and saved m.prof; here it reaches the movement mods, the HUD ring and the panel
    net.on(MSG.PROF, (m) => this.#setProfile(m.prof));
    net.on(`ev:${EV.XP}`, (m) => this.hud.xpGain(m));
    net.on(MSG.CORRECT, (m) => {
      const pos = this.player.pos, o = this.corrOffset;
      this.corrections++;
      // small corrections glide the camera over (~0.1 s); teleports and unstuck snap
      const jump = Math.hypot(m.x - pos.x, m.y - pos.y, m.z - pos.z);
      this.correctionInfo = { distance: jump, reason: m.reason ?? '' };
      if (!m.unstuck && jump < 1.5) { o.x += pos.x - m.x; o.y += pos.y - m.y; o.z += pos.z - m.z; } else o.x = o.y = o.z = 0;
      pos.x = m.x;
      pos.y = m.y;
      pos.z = m.z;
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
    net.on(`ev:${EV.STORE}`, (m) => { this.store = m.store; this.#syncCrafting(); this.#syncBase(); });
    net.on(`ev:${EV.BASE}`, (m) => this.setBase(m.base));
    net.on(`ev:${EV.RAID}`, (m) => {
      this.raid = m.raid;
      if (m.raid.phase === 'warn') this.audio.play('roar_raptor', { pos: this.#raidPoint(60) });
    });
    // the volcano (sim/volcano.js)
    net.on(`ev:${EV.VOLCANO}`, (m) => {
      this.volcanoFx.setPhase(m.phase, m.left);
      const v = this.layout.volcano;
      const pos = v ? { x: v.x, y: v.craterY, z: v.z } : undefined;
      if (m.phase === 'rumble') { this.audio.play('rumble'); this.shake = Math.max(this.shake, 0.6); this.hud.toast('The volcano rumbles – an eruption is coming!', 'flame'); }
      if (m.phase === 'erupt') { this.audio.play('eruption', { pos, vol: 2 }); this.shake = Math.max(this.shake, 1); this.hud.toast('Eruption! Watch the red circles – lava bombs land there', 'flame'); }
      if (m.phase === 'ash') this.hud.toast(m.source === 'wind' ? 'Ash rain is blowing in – take shelter at the camp or your base' : 'Ash rain – the dinosaurs can barely see you, but it chokes you: take shelter', 'info');
    });
    net.on(`ev:${EV.GEYSER}`, (m) => {
      this.volcanoFx.geyser(m);
      const g = this.layout.geysers?.[m.id];
      if (g && Math.hypot(g.x - this.player.pos.x, g.z - this.player.pos.z) < 40) this.audio.play('geyserBubble', { pos: { x: g.x, y: g.y, z: g.z } });
    });
    net.on(`ev:${EV.COLUMN}`, (m) => {
      this.volcanoArena.sink(m.id, m.left);
      const st = this.layout.steps?.[m.id];
      if (st) this.audio.play('columnCrack', { pos: { x: st.x, y: st.top, z: st.z } });
    });
    net.on(`ev:${EV.TREASURE}`, () => {
      this.volcanoArena.openTreasure();
      const t = this.layout.treasure;
      if (t) this.audio.play('treasure', { pos: { x: t.x, y: t.y + 1, z: t.z } });
    });
    net.on(`ev:${EV.BOMB}`, (m) => {
      this.volcanoFx.bomb(m);
      if (Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z) < 45) this.audio.play('bombWhistle', { pos: { x: m.x, y: m.y + 10, z: m.z } });
    });
    net.on(`ev:${EV.TOWER_SHOT}`, (m) => {
      this.baseView.shoot(m);
      this.audio.play(m.kind === 'arrow' ? 'bow' : 'throw', { pos: { x: m.o[0], y: m.o[1], z: m.o[2] } });
    });
    net.on(`ev:${EV.HURT}`, (m) => {
      if (m.id === this.me.id) {
        this.me.hp = m.hp;
        this.lastHurtAt = this.time;
        this.hud.damageFlash(m.dmg);
        if (m.src) {
          const name = CONFIG.dinos[m.src]?.name || { lava: 'Lava', heat: 'Heat', bomb: 'Lava bomb', ash: 'Ash', geyser: 'Lava geyser' }[m.src] || 'Dinosaur';
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
        // Unshakable: the server scales the knockback; the knockdown time shrinks with it (0 = no knock at all)
        const km = this.mods.knockMul;
        if ((m.kx || m.kz) && km > 0) this.player.knock(m.kx, m.kz, m.down ? 5 : 3, m.down ? CONFIG.player.knockdownTime * km : 0.15);
      }
    });
    net.on(`ev:${EV.DEATH}`, (m) => {
      if (m.id === this.me.id) {
        this.me.alive = false;
        this.me.deathT = CONFIG.player.respawnDelay;
        this.audio.play('death');
        this.player.frozen = true;
        this.downed = null;
      }
    });
    // downed: frozen and lying, teammates may revive us until the countdown ends (then DEATH follows)
    net.on(`ev:${EV.DOWN}`, (m) => {
      if (m.id !== this.me.id) return;
      this.#setDowned(m.t);
    });
    net.on(`ev:${EV.REVIVE}`, (m) => {
      if (m.id !== this.me.id || !this.downed) return;
      this.downed.reviveBy = m.t > 0 ? m.by : null;
      this.downed.reviveT = m.t;
      this.downed.reviveAt = this.time;
    });
    net.on(`ev:${EV.REVIVED}`, (m) => {
      if (m.id !== this.me.id) return;
      this.me.alive = true;
      this.downed = null;
      this.player.frozen = false;
      this.player.teleport(m.x, m.z, this.player.yaw);   // like a respawn: the server reset our position and epoch
      this.hud.setDeath(false);
    });
    net.on(`ev:${EV.RESPAWN}`, (m) => {
      if (m.id === this.me.id) {
        this.me.alive = true;
        this.me.hp = this.maxHp;
        this.downed = null;
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

  #setProfile(profile) {
    this.profile = profile;
    this.mods = skillMods(profile.skills);
    this.hud.setXp(profile);
    this.skillPanel.setProfile(profile);
  }

  /** Near a camp station (hut / landing camp / base): skills can only be reset there. The server decides in the end. */
  #atCamp() {
    const p = this.player.pos;
    const r = CONFIG.player.hutHealRadius + 4;
    return nearCamp(this.stations(), p, r);
  }

  /** Skill effects of the local player; assigning feeds the movement controller. */
  get mods() { return this._mods; }
  set mods(m) {
    this._mods = m;
    this.player?.setMods(m);
  }

  /** Max HP: the server's value from our snapshot row, else base + Thick Skin. */
  get maxHp() { return this.me?.mhp > 0 ? this.me.mhp : CONFIG.player.maxHealth + this.mods.maxHpAdd; }

  #state() {
    const p = this.player;
    const state = {
      x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
      yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
      spd: +p.moveSpeed.toFixed(2),
      eq: this.eq,
      fl: this.flags | (p.sprinting ? PF.SPRINT : 0) | (p.onGround ? PF.GROUND : 0) | (p.knockTimer > 0 ? PF.KNOCKED : 0) | (p.dash.active ? PF.DASH : 0) | (this.torchLit && this.me.inv.torch ? PF.TORCH : 0),
    };
    this.flags &= ~PF.ATTACK; // one-shot animation pulse
    return state;
  }

  #setDowned(left) {
    if (this.downed) { this.downed.left = left; return; }
    this.downed = { left, t: 0, canGiveUp: false, reviveBy: null, reviveT: 0, reviveAt: 0 };
    this.player.frozen = true;
    this.player.vel.x = this.player.vel.z = 0;
    this.audio.play('hurt');
  }

  /** The PF.DOWNED flag in our own snapshot row: sets the state if the event was missed, clears it once the server lets go. */
  #syncDowned(fl) {
    if ((fl & PF.DOWNED) !== 0) {
      if (!this.downed && this.me.alive) this.#setDowned(CONFIG.player.bleedOutTime);
    } else if (this.downed && this.downed.t > 1) {
      this.downed = null;
      if (this.me.alive) this.player.frozen = false;
    }
  }

  #sendState() { this.net.sendState(this.#state()); }

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
  }

  stop() {
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
    this.unsubSettings();
    this.unsubGraphics();
    this.dinos.dispose();
    disposeIslandScenes(this.gfx.scene, this.gfx.viewScene);
    this.hud.dispose();
    this.overlay.remove();
    this.wardrobe.dispose?.();
    this.skillPanel.dispose();
    this.net.clearHandlers();
    this.net.stateProvider = null;
    this.net.onStateSent = null;
    this.hud.show(false);
    this.input.onPanelToggle = null;
    this.input.onLockChange = null;
    this.audio.update?.(0, { coast: 0, water: {}, danger: false });   // water loops fade out
    return { gfx: this.gfx, audio: this.audio, input: this.input };
  }

  loop(now = performance.now()) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    // FPS limiter: skip display refreshes until the next frame is due. The
    // 1 ms slack keeps a cap equal to the refresh rate from halving it.
    const cap = FPS_LIMITS[settings.fpsLimit] ?? 0;
    if (cap) {
      const interval = 1000 / cap, elapsed = now - this.lastFrameAt;
      if (elapsed < interval - 1) return;
      this.lastFrameAt = elapsed > interval * 2 ? now : this.lastFrameAt + interval;
    }
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;
    const updateStart = performance.now();
    this.update(dt);
    const cpuUpdateMs = performance.now() - updateStart;
    this.gfx.render(rawDt);
    this.input.endFrame();
    this.stats.frame(rawDt, { renderer: this.gfx.renderer, net: this.net, corrections: this.corrections,
      cpuUpdateMs, graphics: this.gfx.metrics, correctionInfo: this.correctionInfo });
  }

  /** Creative mode: invincible (server-side) and double-tap Space to fly. */
  setCreative(on) {
    this.player.setCreative(on);
    this.net.act(ACT.CREATIVE, { on });
    this.boatPanel.setCreative(on);
    this.#syncCrafting();
    this.#syncBase();
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
    if (input.wasPressed('stats')) setSetting('stats', (settings.stats + 1) % 3);   // compact → detailed → off
    const canMove = this.me.alive && !this.downed && !this.hud.isPanelOpen();
    p.hpFrac = this.me.hp / this.maxHp;
    if (this.downed) {
      const d = this.downed;
      d.t += dt;
      d.left = Math.max(0, d.left - dt);
      d.canGiveUp = d.t >= CONFIG.player.respawnDelay;
      // give up (Space) once the delay has passed; the server enforces the delay as well
      if (d.canGiveUp && input.wasPressed('jump') && !d.gaveUp) { d.gaveUp = true; this.net.act(ACT.RESPAWN, {}); }
    }
    const previousPos = { ...p.pos };
    p.update(dt, {
      forward: canMove && input.isHeld('forward'),
      back: canMove && input.isHeld('back'),
      left: canMove && input.isHeld('left'),
      right: canMove && input.isHeld('right'),
      jump: canMove && input.isHeld('jump'),
      sprint: canMove && input.isHeld('sprint'),
      dash: canMove && input.isHeld('dash'),   // the controller reacts to the press edge
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
      const interval = 1 / CONFIG.net.clientSendRate;
      this.sendTimer += interval;
      if (this.sendTimer <= 0) this.sendTimer = interval;
      this.#sendState();
    }

    const renderTime = this.renderTime = this.net.renderNow();
    this.remotes.update(dt, renderTime);

    WIND.uTime.value = this.time;
    const cam = this.gfx.camera.position;
    this.#mood(dt, cam);
    for (const u of this.worldUpdaters) u.update?.(dt, this.time, cam);
    for (const sys of this.systems) sys.update?.(dt, renderTime);
    if (!this.me.alive) this.me.deathT = Math.max(0, this.me.deathT - dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer += 1 / 30; this.#updateHud(dt); }
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
    const fwd = this.audioForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = this.audioUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd, up);
    const p = this.player;
    // footsteps (in water: a splashing step and a ring on the surface)
    if (this.stepCadence.update(p, dt)) {
      const surface = footstepSurface(p, this.terrain, this.layout, this.woodSupports);
      if (surface === 'water') {
        this.audio.play('waterStep', { movement: p.sprinting ? 'run' : 'walk', vol: Math.min(1.4, 0.55 + p.inWater * 0.8) * (p.sprinting ? 1.25 : 1) * (p.swimming ? 0.7 : 1) });
        this.water.ripple(p.pos.x, p.pos.z, Math.min(1, 0.3 + p.inWater * 0.5));
      } else this.audio.play('step', { surface, movement: p.sprinting ? 'run' : 'walk', vol: p.sprinting ? 1.3 : 1 });
    }
    this.#waterEvents(dt);
    // surf gets louder toward the coast
    const g = this.terrain.heightAt(p.pos.x, p.pos.z);
    const plan = this.layout.plan;
    const rim = Math.hypot(p.pos.x / plan.A, p.pos.z / plan.B);
    const coast = Math.max(0, Math.min(1, (rim - 0.7) / 0.3)) * (g < 6 ? 1 : 0.3);
    this.bossMusicArea = inBossMusicArea(this.layout, p.pos, this.bossMusicArea);
    this.audioQueryTimer -= dt;
    if (this.audioQueryTimer <= 0) {
      this.audioQueryTimer += 0.1;
      this.audioWater = this.#waterSoundscape(cam.position);
      this.audioDanger = this.#inDanger();
    }
    this.audio.update(dt, { coast, water: this.audioWater, danger: this.audioDanger, bossArea: this.bossMusicArea, ash: this.volcanoFx.ashRaining() ? 1 : 0 });
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
    const zone = safeZone(this.layout, this.base, this.layout.level.index);
    if (zone && Math.hypot(p.x - zone.x, p.z - zone.z) < zone.r + 6) return false;
    if (this.time - (this.lastHurtAt ?? -99) < 3) return true;
    for (const v of this.dinos.map.values()) {
      if (!v.alive || v.type === 'brachio') continue;
      const hostile = (v.fl & 1) !== 0 || v.st === DS.ATTACK || v.st === DS.CHARGE || v.st === DS.DIVE;
      if (!hostile) continue;
      const range = v.type === 'trex' ? 75 : v.type === 'ptera' ? 45 : v.type === 'gloom-raptor' ? 36 : v.type === 'sump-lurker' ? 24 : 40;   // the blind gloom raptor hunts by sound: closer
      if (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < range) return true;
    }
    return false;
  }

  /** Sound hooks called by the dinosaur views. */
  onRoar(v) { this.audio.play(`roar_${v.type}`, { pos: v.pos }); }
  onDinoAttack(v) { if (v.type !== 'brachio') this.audio.play(v.type === 'stego' ? 'bigStep' : 'bite', { pos: v.pos }); }
  onDinoHit(v, m) { if (m.by !== this.me.id) this.audio.play('hit', { pos: v.pos, vol: 0.7 }); }
  onDinoStep(v, step) {
    if (!creatureStepAudible(v, this.player.pos)) return;
    const water = this.terrain.waterLevelAt(v.pos.x, v.pos.z);
    const surface = footstepSurface({ pos: v.pos, inWater: water === null ? 0 : Math.max(0, water - v.pos.y), swimming: false }, this.terrain, this.layout, this.woodSupports);
    this.audio.play('dinoStep', { species: v.type, surface, movement: step.movement, weight: step.weight,
      size: v.scale, entityId: v.id, pos: v.pos, vol: step.volume });
  }

  /**
   * The volcano's ash rain for the local player: sheltered at the camp or a
   * base plot, else a grace time (as on the server, sim/volcano.js) before it hurts.
   */
  #updateAsh(dt) {
    const p = this.player, A = CONFIG.volcano.ash;
    const raining = this.volcanoFx.ashRaining() && this.me.alive && !p.creative;
    const out = raining && !ashShelter(this.layout, p.pos.x, p.pos.z);
    p.ashOutside = out;
    this.ashT = out ? (this.ashT ?? 0) + dt : 0;
    this.hud.setAsh(!raining ? '' : !out ? 'shelter' : this.ashT < A.after ? 'out' : 'hurt', A.after - this.ashT);
  }

  #updateHud(dt) {
    const hud = this.hud;
    const p = this.player;
    hud.setHealth(this.me.hp, this.maxHp);
    hud.setStamina(p.stamina, p.maxStamina);
    hud.setSwamp(p.inBog && !p.flying);
    hud.setHeat(this.me.alive ? p.heat : 0, p.buffs.heatproof > 0);
    this.#updateAsh(dt);
    hud.setBuffs(p.buffs);
    hud.setCompass(p.yaw, this.compassMarkers());
    const team = [{ id: this.me.id, name: this.me.name, slot: this.me.slot, hp: this.me.hp, mhp: this.maxHp, alive: this.me.alive, downed: !!this.downed, isYou: true }];
    for (const rp of this.remotes.map.values()) team.push({ id: rp.id, name: rp.name, slot: rp.slot, hp: rp.hp, mhp: rp.mhp, alive: rp.alive, downed: (rp.fl & PF.DOWNED) !== 0, isYou: false });
    team.sort((a, b) => a.slot - b.slot);
    this.team = team;
    hud.setTeam(team);
    this.#updateSkillHud(hud, p);
    hud.setMinimap({
      x: p.pos.x, z: p.pos.z, yaw: p.yaw,
      players: [...this.remotes.map.values()].map((rp) => ({ x: rp.pos.x, z: rp.pos.z, yaw: rp.yaw, color: CONFIG.playerColors[rp.slot % 4] })),
      hut: this.stations().home,
      markers: [...this.#collect('minimapMarkers'), ...this.volcanoArena.minimapMarkers()],
    });
    if (!this.me.alive) {
      hud.setDeath(true, Math.ceil(this.me.deathT));
    }
  }

  /** XP-tree extras of the HUD: perk chips, downed overlay, revive / medic prompts, the panel's camp state. */
  #updateSkillHud(hud, p) {
    const m = this.mods;
    const dash = m.dash && p.dash ? { ready: p.dash.ready ?? p.dash.cooldownLeft <= 0, frac: 1 - (p.dash.cooldownLeft ?? 0) / DASH.cooldown } : null;
    const ad = m.adrenaline ? p.adrenaline : null;
    const adren = ad ? (ad.active ? { state: 'active', frac: ad.left / m.adrenalineTime }
      : ad.cooldownLeft > 0 ? { state: 'cooldown', frac: 1 - ad.cooldownLeft / m.adrenalineCooldown } : { state: 'ready', frac: 1 }) : null;
    hud.setPerks({ dash, adren });
    const d = this.downed;
    // giving up is Space once the respawn delay has passed (see update())
    hud.setDowned(d ? { left: d.left, key: d.canGiveUp ? 'Space' : '' } : null);
    const rt = this.reviveTarget, mt = this.medicTarget;
    const nameOf = (t) => t.name ?? this.remotes.get(t.id)?.name ?? 'teammate';
    hud.setAssist(rt ? { kind: 'revive', name: nameOf(rt), progress: rt.progress } : mt ? { kind: 'medic', name: nameOf(mt) } : null);
    if (this.hud.isExtraOpen('skills')) this.skillPanel.setAtCamp(this.#atCamp());
  }

  /** Compass markers: the hut, the boat and teammates. */
  compassMarkers() {
    const p = this.player.pos;
    const bearing = (x, z) => Math.atan2(-(x - p.x), -(z - p.z));
    const list = [
      { bearing: bearing(this.stations().home.x, this.stations().home.z), kind: 'hut' },
      { bearing: bearing(this.layout.boat.x, this.layout.boat.z), kind: 'boat' },
    ];
    // an announced / running raid: where it comes from
    if (this.raid && this.raid.phase !== 'idle') {
      const r = this.#raidPoint(120);
      list.push({ bearing: bearing(r.x, r.z), kind: 'dino' });
    }
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

  /** A lava bomb landed at (x, y, z): its boom, and the view shakes when it was close. */
  #bombImpact(x, y, z) {
    this.audio.play('bombImpact', { pos: { x, y, z }, vol: 1.6 });
    const d = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
    if (d < 30) this.shake = Math.max(this.shake, 0.9 * (1 - d / 30));
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
    // lying down: dead = low and rolled over, downed = low and slightly tilted (eased in)
    this.downBlend = (this.downBlend ?? 0) + ((this.downed ? 1 : 0) - (this.downBlend ?? 0)) * Math.min(1, dt * 5);
    const deadDrop = this.me.alive ? this.downBlend * 1.1 : 1.2;
    const o = this.corrOffset;
    const decay = Math.exp(-dt / 0.035);   // ~0.1 s to (almost) nothing
    const len = Math.hypot(o.x, o.y, o.z);
    const k = (len > 1.5 ? 1.5 / len : 1) * decay;
    o.x *= k; o.y *= k; o.z *= k;
    cam.position.set(
      p.pos.x + o.x + Math.cos(p.yaw) * bobX,
      p.pos.y + o.y + CONFIG.player.eyeHeight + bobY - p.landImpact * 0.25 - deadDrop,
      p.pos.z + o.z - Math.sin(p.yaw) * bobX,
    );
    const roll = this.me.alive ? (p.knockTimer > 0 ? Math.sin(this.time * 20) * 0.05 : 0) + this.downBlend * 0.35 : 0.5;
    // the ground shakes (volcano: rumbling, eruptions, bombs landing close)
    this.shake = Math.max(0, this.shake - dt * 0.45);
    const sh = this.shake * this.shake * 0.12;
    if (sh > 0) cam.position.add({ x: Math.sin(this.time * 37) * sh, y: Math.sin(this.time * 53) * sh * 0.6, z: Math.cos(this.time * 41) * sh });
    cam.rotation.set(p.pitch + (sh ? Math.sin(this.time * 29) * sh * 0.08 : 0), p.yaw, roll, 'YXZ');
    const targetFov = settings.fov + (p.sprinting ? 6 : 0) + (p.dash.active ? 5 : 0);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    this.gfx.followSun(p.pos.x, p.pos.y, p.pos.z);
    // light the viewmodel from the same sun direction, in camera space
    this.gfx.viewSun.position.copy(this.gfx.sunDir).applyQuaternion(cam.quaternion.clone().invert());
  }
}
