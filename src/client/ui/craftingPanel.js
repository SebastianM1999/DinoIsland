// Crafting box dialog: opens with E at the hut workbench. Two tabs – supplies
// (arrows, traps, bait, spear; crafted again and again) and team upgrades
// (built once, a new tier unlocks on every island). Everything is paid from
// the shared hut store; the server validates each craft.

import { CONFIG } from '../../shared/config.js';
import { RECIPES, unlockIsland, canAfford } from '../../shared/crafting.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LINE_NAME = { bow: 'Bow', spear: 'Spear', gear: 'Gear' };

export class CraftingPanel {
  /** @param {{ onCraft: (id: string) => void, onRefill: () => void, onClose: () => void }} opts */
  constructor({ onCraft, onRefill, onClose }) {
    this.onCraft = onCraft;
    this.onRefill = onRefill;
    this.onClose = onClose;
    this.tab = 'supplies';
    this.state = { store: {}, upgrades: [], island: 1 };
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-craft brush';
    this.el.setAttribute('aria-label', 'Crafting box');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === 'craft') this.onCraft?.(b.dataset.id);
      else if (act === 'refill') this.onRefill?.();
      else if (act === 'tab') { this.tab = b.dataset.tab; this.render(); }
      else if (act === 'close') this.onClose?.();
    });
  }

  /** Latest hut store, built upgrade ids and island number. */
  /** Enough loot in the hut store? Creative mode always is. */
  afford(r) { return !!this.state.creative || canAfford(r, this.state.store); }

  setState(state) {
    this.state = { ...this.state, ...state };
    if (!this.el.hidden) this.render();
  }

  costHtml(r) {
    const have = this.state.store || {};
    return Object.entries(r.cost).map(([k, n]) => {
      const ok = !!this.state.creative || (have[k] || 0) >= n;
      return `<span class="craft-cost${ok ? '' : ' is-short'}" title="${esc(CONFIG.loot[k].name)}: ${have[k] || 0} in store">${icon(k)}<b>${n}</b></span>`;
    }).join('');
  }

  row(r) {
    const built = new Set(this.state.upgrades);
    const locked = unlockIsland(r) > this.state.island;
    const isUpgrade = r.kind === 'upgrade';
    const done = isUpgrade && built.has(r.id);
    const needsPrev = isUpgrade && r.requires && !built.has(r.requires);
    const afford = this.afford(r);
    let label = 'Craft';
    if (done) label = 'Built';
    else if (locked) label = `Island ${unlockIsland(r)}`;
    else if (needsPrev) label = 'Needs previous';
    const disabled = done || locked || needsPrev || !afford;
    const cls = done ? ' is-done' : locked || needsPrev ? ' is-locked' : '';
    const sub = locked ? `Unlocks on island ${unlockIsland(r)}` : esc(r.text);
    return `<li class="craft-row${cls}">
      <span class="craft-ic">${icon(r.icon)}</span>
      <span class="craft-txt"><b>${esc(r.name)}${isUpgrade ? ` <em>${LINE_NAME[r.line]} · tier ${r.tier}</em>` : ''}</b><small>${sub}</small></span>
      <span class="craft-costs">${this.costHtml(r)}</span>
      <button type="button" class="wd-btn${done ? '' : ' wd-primary'}" data-act="craft" data-id="${r.id}"${disabled ? ' disabled' : ''}>${done ? icon('check') : ''}${label}</button>
    </li>`;
  }

  render() {
    const store = this.state.store || {};
    const stock = Object.keys(CONFIG.loot).map((k) => `<span class="craft-stock${store[k] ? '' : ' is-zero'}" title="${esc(CONFIG.loot[k].name)}">${icon(k)}<b>${store[k] || 0}</b></span>`).join('');
    const kind = this.tab === 'upgrades' ? 'upgrade' : 'supply';
    const rows = RECIPES.filter((r) => r.kind === kind)
      .sort((a, b) => (a.tier || 0) - (b.tier || 0))
      .map((r) => this.row(r)).join('');
    const tabBtn = (id, text) => `<button type="button" class="craft-tab${this.tab === id ? ' is-on' : ''}" data-act="tab" data-tab="${id}">${text}</button>`;
    const refill = this.tab === 'supplies'
      ? `<button type="button" class="wd-btn" data-act="refill">${icon('arrow')} Free basic resupply</button>` : '';
    this.el.innerHTML = `
      <header class="hud-panel-head">
        <h2>${icon('crate')} Crafting box</h2>
        <span class="hud-panel-close"><kbd>E</kbd> / <kbd>Esc</kbd> Close</span>
      </header>
      <div class="craft-stockbar"><span class="craft-stock-label">${icon('home')} Hut store</span>${stock}</div>
      <nav class="craft-tabs">${tabBtn('supplies', 'Supplies')}${tabBtn('upgrades', 'Team upgrades')}</nav>
      <ul class="craft-list">${rows}</ul>
      <footer class="wd-foot">${refill}<button type="button" class="wd-btn" data-act="close">Close</button></footer>`;
  }

  onOpen() { this.render(); }
}
