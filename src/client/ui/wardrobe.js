// Wardrobe at the hut: pick a hat, shirt/jacket and pants with a live,
// rotatable 3D preview of your explorer. "Wear outfit" sends the choice to
// the server (which shares it with the team) and remembers it locally.

import { OUTFIT_SLOTS, sanitizeOutfit, sameOutfit } from '../../shared/outfits.js';
import { CharacterPreview } from './characterPreview.js';
import { storageKey } from '../../shared/brand.js';
import { readItem, writeItem } from '../core/persistence.js';

const STORE_KEY = storageKey('outfit');

/** Outfit remembered from the last session (null if none). */
export function savedOutfit() {
  try {
    const o = JSON.parse(readItem(STORE_KEY) || 'null');
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

    this.preview = new CharacterPreview(this.canvas, { slot, outfit: this.draft });

    this.#buildSlots();
    el.addEventListener('click', (e) => this.#onClick(e));
  }

  /** The preview's scene (null until first opened): its player model shares cached geometry with the island. */
  get scene() { return this.preview.scene ?? null; }

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
      writeItem(STORE_KEY, JSON.stringify(this.worn));
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
    this.preview.setOutfit(this.draft);
  }

  onOpen() {
    this.draft = { ...this.worn };
    this.preview.start();
    this.#refresh();
    this.el.querySelector('.wd-swatch[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  onClosed() {
    this.preview.stop();
  }

  /** Free the preview's WebGL context (a new island builds a new wardrobe). */
  dispose() {
    this.preview.dispose();
  }
}
