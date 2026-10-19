// The expedition lobby: a hosted expedition waits here until its host presses Start (sim/world.js
// `inLobby`). Every explorer stands on one stage in their outfit, with their level and a read-only
// look at their skill tree; the host starts the expedition or removes someone, everyone can leave.
// Explorers who join after Start never see it: they play at once.
import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { MSG, EV } from '../../shared/protocol.js';
import { sanitizeProfile } from '../../shared/skills.js';
import { PlayerModel } from '../models/playerModel.js';
import { buildSkillView } from './skillModel.js';

const SLOTS = CONFIG.net.maxPlayers;
const SPACING = 1.55;
const KICK_CONFIRM_MS = 3000;

/** Where slot `slot` stands on the stage (slot 0 on the left as seen by the camera). */
export const standX = (slot) => ((SLOTS - 1) / 2 - slot) * SPACING;

/** What a lobby card shows for one explorer (DOM-free, so it can be tested headlessly). */
export function lobbyCard(member, myId) {
  const prof = sanitizeProfile(member.prof);
  return {
    name: member.name + (member.id === myId ? ' (you)' : ''),
    host: !!member.host,
    level: buildSkillView(prof).level,
    prof,
  };
}

/** One WebGL scene for the whole stage: a wooden platform per slot, an explorer on each taken one. */
class LobbyStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.models = new Map();   // slot -> { model, id, outfit }
    this.raf = 0;
    this.lastT = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 40);
    // (explorers face -z, like the character preview: the camera stands in front of them)
    this.camera.position.set(0, 1.55, -8.4);
    this.camera.lookAt(0, 0.95, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4dd, 0x4a5a7a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, -3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2);
    rim.position.set(2, 2, 3);
    this.scene.add(rim);
    const wood = new THREE.MeshStandardMaterial({ color: 0x9b6636, roughness: 0.9 });
    const disc = new THREE.CylinderGeometry(0.62, 0.68, 0.08, 24);
    for (let slot = 0; slot < SLOTS; slot++) {
      const platform = new THREE.Mesh(disc, wood);
      platform.position.set(standX(slot), -0.04, 0);
      this.scene.add(platform);
    }
    this.raf = requestAnimationFrame(this.#loop);
  }

  /** Put every member on their slot's platform in their outfit; empty the others. */
  sync(members) {
    const taken = new Set();
    for (const m of members) {
      if (!Number.isInteger(m.slot) || m.slot < 0 || m.slot >= SLOTS) continue;
      taken.add(m.slot);
      const outfit = JSON.stringify(m.outfit ?? null);
      let entry = this.models.get(m.slot);
      if (entry && entry.id !== m.id) { this.scene.remove(entry.model.root); entry = null; }
      if (!entry) {
        const model = new PlayerModel(m.slot, m.outfit);
        model.setEquipped('none');
        model.root.position.set(standX(m.slot), 0, 0);
        this.scene.add(model.root);
        entry = { model, id: m.id, outfit };
        this.models.set(m.slot, entry);
      } else if (entry.outfit !== outfit) {
        entry.model.setOutfit(m.outfit);
        entry.outfit = outfit;
      }
    }
    for (const [slot, entry] of this.models) if (!taken.has(slot)) { this.scene.remove(entry.model.root); this.models.delete(slot); }
  }

  /** Horizontal position of slot `slot` on the canvas, 0..1 (where its card goes). */
  screenX(slot) {
    const v = new THREE.Vector3(standX(slot), 0, 0).project(this.camera);
    return (v.x + 1) / 2;
  }

  #loop = (t) => {
    this.raf = requestAnimationFrame(this.#loop);
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const ratio = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.onResize?.();
    }
    for (const { model } of this.models.values()) {
      // (a slow look around, each explorer a little out of step with the others)
      model.root.rotation.y = Math.sin(t / 1600 + model.root.position.x) * 0.35;
      model.animate(dt, { spd: 0, pitch: 0, eq: 'none', drawing: false, eating: false, attacking: false, carry: 0, alive: true, grounded: true });
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * Show the lobby of `net`'s expedition until the host starts it (resolves true: `net.welcome` is the
 * island to build) or this explorer leaves or is disconnected (resolves false after `leave(reason)`).
 * `title`: the expedition's name; `invite()`: open the Steam friend picker (Steam sessions only);
 * `leave(reason)`: back to the menu (reason: why the session ended, null when the player chose to leave).
 */
export function runLobby(net, { title = 'Expedition', invite = null, leave }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'lobby';
    root.className = 'screen lobby-screen';
    root.innerHTML = `
      <header class="lobby-head">
        <p class="menu-eyebrow">EXPEDITION LOBBY</p>
        <h2 class="lobby-title"></h2>
        <p class="lobby-sub" role="status" aria-live="polite"></p>
      </header>
      <div class="lobby-stage">
        <canvas class="lobby-canvas" aria-hidden="true"></canvas>
        <ul class="lobby-cards" aria-label="Explorers"></ul>
      </div>
      <footer class="lobby-actions">
        <button type="button" class="btn btn-primary lobby-start">Start expedition</button>
        <button type="button" class="btn lobby-invite">Invite friends</button>
        <button type="button" class="btn btn-danger lobby-leave">Leave</button>
      </footer>
      <div class="lobby-skills" hidden><div class="lobby-skills-mount"></div></div>`;
    document.body.append(root);
    const $ = (sel) => root.querySelector(sel);
    $('.lobby-title').textContent = title;
    const startBtn = $('.lobby-start');
    const inviteBtn = $('.lobby-invite');
    inviteBtn.hidden = !invite;
    const stage = new LobbyStage($('.lobby-canvas'));
    const cards = [];
    let members = [];
    let done = false;
    let panel = null, viewing = null, returnFocus = null;

    for (let slot = 0; slot < SLOTS; slot++) {
      const li = document.createElement('li');
      li.className = 'lobby-card';
      li.style.setProperty('--c', CONFIG.playerColors[slot % 4]);
      const head = document.createElement('span');
      head.className = 'lobby-card-head';
      const name = document.createElement('b');
      name.className = 'lobby-name';
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = 'Host';
      head.append(name, badge);
      const level = document.createElement('span');
      level.className = 'lobby-level';
      const skills = document.createElement('button');
      skills.type = 'button';
      skills.className = 'btn lobby-skills-btn';
      skills.textContent = 'Skills';
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'btn kick';
      li.append(head, level, skills, kick);
      const card = { li, name, badge, level, skills, kick, member: null, timer: 0 };
      card.resetKick = () => { clearTimeout(card.timer); delete kick.dataset.confirm; kick.textContent = 'Kick'; };
      card.resetKick();
      skills.addEventListener('click', () => { if (card.member) void showSkills(card.member.id); });
      kick.addEventListener('click', () => {
        if (!card.member) return;
        if (!kick.dataset.confirm) {
          kick.dataset.confirm = '1';
          kick.textContent = 'Confirm kick';
          card.timer = setTimeout(card.resetKick, KICK_CONFIRM_MS);
          return;
        }
        card.resetKick();
        kick.disabled = true;
        net.send({ t: MSG.KICK, id: card.member.id });
      });
      cards.push(card);
      $('.lobby-cards').append(li);
    }

    function place() {
      for (let slot = 0; slot < SLOTS; slot++) cards[slot].li.style.left = `${(stage.screenX(slot) * 100).toFixed(2)}%`;
    }
    stage.onResize = place;

    function render() {
      members = Array.isArray(net.lobbyMembers) ? net.lobbyMembers : [];
      const iHost = members.some((m) => m.id === net.myId && m.host);
      stage.sync(members);
      for (let slot = 0; slot < SLOTS; slot++) {
        const card = cards[slot];
        const m = members.find((x) => x.slot === slot) ?? null;
        if (card.member?.id !== m?.id) { card.resetKick(); card.kick.disabled = false; }
        card.member = m;
        card.li.classList.toggle('is-open', !m);
        if (!m) {
          card.name.textContent = 'Open slot';
          card.badge.hidden = true;
          card.level.textContent = 'Waiting for an explorer…';
          card.skills.hidden = card.kick.hidden = true;
          continue;
        }
        const view = lobbyCard(m, net.myId);
        card.name.textContent = view.name;
        card.badge.hidden = !view.host;
        card.level.textContent = `Level ${view.level}`;
        card.skills.hidden = false;
        card.skills.setAttribute('aria-label', `Show ${m.name}'s skills`);
        card.kick.hidden = !iHost || m.id === net.myId;
        card.kick.setAttribute('aria-label', `Remove ${m.name} from the expedition`);
      }
      startBtn.hidden = !iHost;
      $('.lobby-sub').textContent = iHost
        ? `${members.length} of ${SLOTS} explorers. Start when everyone is here; friends can still join later.`
        : 'Waiting for the host to start the expedition…';
      // (the viewed explorer left: their tree goes too; otherwise it follows their newest skills)
      if (viewing !== null) {
        const m = members.find((x) => x.id === viewing);
        if (!m) closeSkills();
        else panel?.setProfile(sanitizeProfile(m.prof));
      }
      place();
    }

    async function showSkills(id) {
      const m = members.find((x) => x.id === id);
      if (!m) return;
      returnFocus = document.activeElement;
      viewing = id;
      const overlay = $('.lobby-skills');
      overlay.hidden = false;
      if (!panel) {
        // HUD styles are normally loaded only when an expedition starts (as for the title screen's tree)
        const href = new URL('../../../css/hud.css', import.meta.url).href;
        if (![...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          const ready = new Promise((r) => { link.onload = r; link.onerror = r; });
          document.head.append(link);
          await ready;   // (an unstyled panel would flash empty first)
        }
        const { SkillPanel } = await import('./skillPanel.js');
        if (done || viewing !== id) return;
        panel = new SkillPanel({ readOnly: true, onClose: closeSkills });
        $('.lobby-skills-mount').replaceChildren(panel.el);
      }
      panel.title = m.id === net.myId ? 'Your skills' : `${m.name}'s skills`;
      panel.setProfile(sanitizeProfile(m.prof));
      panel.el.hidden = false;
      panel.onOpen();
    }

    function closeSkills() {
      viewing = null;
      $('.lobby-skills').hidden = true;
      if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
    }

    function finish(started) {
      if (done) return;
      done = true;
      net.off(`ev:${EV.LOBBY}`, render);
      net.off(MSG.WELCOME, onWelcome);
      if (net.onClose === onClose) net.onClose = null;
      for (const card of cards) clearTimeout(card.timer);
      panel?.dispose();
      stage.dispose();
      root.remove();
      resolve(started);
    }

    /** The host pressed Start: a welcome without a lobby is the island to build. */
    function onWelcome(welcome) {
      if (welcome.lobby) { render(); return; }
      net.welcome = welcome;
      finish(true);
    }
    function onClose(reason) {
      finish(false);
      leave(reason || 'The expedition ended.');
    }

    startBtn.addEventListener('click', () => {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting…';
      net.send({ t: MSG.START });
    });
    inviteBtn.addEventListener('click', () => invite?.());
    $('.lobby-leave').addEventListener('click', () => { finish(false); leave(null); });
    $('.lobby-skills').addEventListener('pointerdown', (event) => { if (event.target === event.currentTarget) closeSkills(); });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && viewing !== null) { event.preventDefault(); event.stopPropagation(); closeSkills(); }
    });

    net.on(`ev:${EV.LOBBY}`, render);
    net.on(MSG.WELCOME, onWelcome);
    net.onClose = onClose;
    // (Start, or the end of the session, may have come before this screen listened)
    if (net.closed) { onClose(net.closeReason); return; }
    if (!net.inLobby && net.lastWelcome) { onWelcome(net.lastWelcome); return; }
    render();
    (startBtn.hidden ? $('.lobby-leave') : startBtn).focus({ preventScroll: true });
  });
}
