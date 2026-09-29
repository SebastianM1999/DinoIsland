// Wardrobe at the hut: pick a hat, shirt/jacket and pants with a live,
// rotatable 3D preview of your explorer. "Wear outfit" sends the choice to
// the server (which shares it with the team) and remembers it locally.

import * as THREE from 'three';
import { OUTFIT_SLOTS, sanitizeOutfit, sameOutfit } from '../../shared/outfits.js';
import { PlayerModel } from '../models/playerModel.js';

const STORE_KEY = 'di.outfit';

/** Outfit remembered from the last session (null if none). */
export function savedOutfit() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return o ? sanitizeOutfit(o) : null;
  } catch {
    return null;
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Wardrobe {
  /**
   * @param {{ slot:number, outfit:object, onWear:(o:object)=>void, onClose:()=>void }} opts
   */
  constructor({ slot, outfit, onWear, onClose }) {
    this.slot = slot;
    this.worn = sanitizeOutfit(outfit, slot);
    this.draft = { ...this.worn };
    this.onWear = onWear;
    this.onClose = onClose;
    this.yaw = 0.35;
    this.spin = true;
    this.raf = 0;

    const el = document.createElement('section');
    el.className = 'hud-panel hud-wardrobe brush';
    el.setAttribute('aria-label', 'Wardrobe');
    el.innerHTML = `
      <header class="hud-panel-head">
        <h2>Wardrobe</h2>
        <span class="hud-panel-close"><kbd>E</kbd> / <kbd>Esc</kbd> Close</span>
      </header>
      <div class="wd-body">
        <div class="wd-stage">
          <canvas class="wd-canvas" aria-label="Outfit preview – drag to turn"></canvas>
          <p class="wd-drag">Drag to turn</p>
        </div>
        <div class="wd-slots"></div>
      </div>
      <footer class="wd-foot">
        <button type="button" class="wd-btn" data-act="random">Surprise me</button>
        <button type="button" class="wd-btn" data-act="reset">Undo changes</button>
        <button type="button" class="wd-btn wd-primary" data-act="wear">Wear outfit</button>
      </footer>`;
    this.el = el;
    this.$slots = el.querySelector('.wd-slots');
    this.$wear = el.querySelector('[data-act="wear"]');
    this.canvas = el.querySelector('canvas');

    this.#buildSlots();
    el.addEventListener('click', (e) => this.#onClick(e));
    this.#bindDrag();
  }

  #buildSlots() {
    this.$slots.innerHTML = OUTFIT_SLOTS.map((s) => `
      <section class="wd-slot" data-slot="${s.key}">
        <header>
          <h3>${s.label}</h3>
          <div class="wd-cycle">
            <button type="button" class="wd-arrow" data-step="-1" aria-label="Previous ${s.label}">‹</button>
            <span class="wd-name" aria-live="polite"></span>
            <button type="button" class="wd-arrow" data-step="1" aria-label="Next ${s.label}">›</button>
          </div>
        </header>
        <div class="wd-swatches" role="radiogroup" aria-label="${s.label}">
          ${s.list.map((it, i) => `<button type="button" role="radio" class="wd-swatch" data-i="${i}" title="${esc(it.name)}" aria-label="${esc(it.name)}" style="--a:${it.color};--b:${it.accent || it.dark || it.brim || it.cuff || it.color}"><i></i></button>`).join('')}
        </div>
      </section>`).join('');
  }

  #onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const slotEl = b.closest('[data-slot]');
    if (slotEl) {
      const key = slotEl.dataset.slot;
      const list = OUTFIT_SLOTS.find((s) => s.key === key).list;
      if (b.dataset.i !== undefined) this.draft[key] = Number(b.dataset.i);
      else if (b.dataset.step) this.draft[key] = (this.draft[key] + Number(b.dataset.step) + list.length) % list.length;
      this.#refresh();
      return;
    }
    switch (b.dataset.act) {
      case 'random':
        for (const s of OUTFIT_SLOTS) this.draft[s.key] = Math.floor(Math.random() * s.list.length);
        this.#refresh();
        break;
      case 'reset':
        this.draft = { ...this.worn };
        this.#refresh();
        break;
      case 'wear':
        this.wear();
        break;
    }
  }

  wear() {
    if (!sameOutfit(this.draft, this.worn)) {
      this.worn = { ...this.draft };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.worn)); } catch { /* storage may be blocked */ }
      this.onWear?.(this.worn);
    }
    this.onClose?.();
  }

  /** Server confirmed (or another source changed) what we wear. */
  setWorn(outfit) {
    this.worn = sanitizeOutfit(outfit, this.slot);
    this.#refresh();
  }

  #refresh() {
    for (const s of OUTFIT_SLOTS) {
      const el = this.$slots.querySelector(`[data-slot="${s.key}"]`);
      const i = this.draft[s.key];
      el.querySelector('.wd-name').innerHTML = `${esc(s.list[i].name)} <small>${i + 1}/${s.list.length}</small>`;
      for (const sw of el.querySelectorAll('.wd-swatch')) {
        const on = Number(sw.dataset.i) === i;
        sw.setAttribute('aria-checked', String(on));
        sw.classList.toggle('is-worn', Number(sw.dataset.i) === this.worn[s.key]);
      }
    }
    const changed = !sameOutfit(this.draft, this.worn);
    this.$wear.textContent = changed ? 'Wear outfit' : 'Looking good!';
    this.$wear.classList.toggle('is-idle', !changed);
    this.model?.setOutfit(this.draft);
  }

  // ------------------------------------------------------------------ preview

  #initPreview() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.25, -4.9);
    this.camera.lookAt(0, 0.9, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4dd, 0x4a5a7a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, -3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2);
    rim.position.set(2, 2, 3);
    this.scene.add(rim);
    // little wooden platform
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.8, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x9b6636, roughness: 0.9, flatShading: true }),
    );
    disc.position.y = -0.04;
    this.scene.add(disc);
    this.model = new PlayerModel(this.slot, this.draft);
    this.model.setEquipped('none');
    this.scene.add(this.model.root);
  }

  #bindDrag() {
    let dragging = false, lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      this.spin = false;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    const end = () => { dragging = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  #loop = (t) => {
    this.raf = requestAnimationFrame(this.#loop);
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.spin) this.yaw += dt * 0.5;
    this.model.root.rotation.y = this.yaw;
    this.model.animate(dt, { spd: 0, pitch: 0, eq: 'none', drawing: false, eating: false, attacking: false, carry: 0, alive: true, grounded: true });
    this.renderer.render(this.scene, this.camera);
  };

  onOpen() {
    this.draft = { ...this.worn };
    this.spin = true;
    this.#initPreview();
    this.#refresh();
    this.lastT = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.#loop);
    this.el.querySelector('.wd-swatch[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  onClosed() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
