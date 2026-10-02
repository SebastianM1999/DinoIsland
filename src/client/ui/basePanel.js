// Base dialog (islands 2+): opens with E at a building plot's stake or at the
// base flag. Build the camp on the chosen plot, then grow it twice. Costs come
// from the shared hut store; the server validates everything (ACT.BASE).

import { CONFIG } from '../../shared/config.js';
import { canAfford } from '../../shared/crafting.js';
import { BASE_STAGES, MAX_STAGE, PLOT_KINDS, stageCost } from '../../shared/base.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BasePanel {
  /** @param {{ onBuild: (plot: number) => void, onUpgrade: () => void, onClose: () => void }} opts */
  constructor({ onBuild, onUpgrade, onClose }) {
    this.onBuild = onBuild;
    this.onUpgrade = onUpgrade;
    this.onClose = onClose;
    this.state = { store: {}, base: null, island: 2, plot: -1, plotKind: null };
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-craft brush';
    this.el.setAttribute('aria-label', 'Base');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === 'build') this.onBuild?.(this.state.plot);
      else if (act === 'upgrade') this.onUpgrade?.();
      else if (act === 'close') this.onClose?.();
    });
    this.timer = null;
  }

  /** Store, base state, island number (1-based) and the plot the panel was opened at. */
  setState(state) {
    this.state = { ...this.state, ...state };
    if (!this.el.hidden) this.render();
  }

  costHtml(cost) {
    const have = this.state.store || {};
    return Object.entries(cost).map(([k, n]) => {
      const ok = (have[k] || 0) >= n;
      return `<span class="craft-cost${ok ? '' : ' is-short'}" title="${esc(CONFIG.loot[k].name)}: ${have[k] || 0} in store">${icon(k)}<b>${n}</b></span>`;
    }).join('');
  }

  stageRow(stage) {
    const S = BASE_STAGES[stage];
    const base = this.state.base || { stage: 0 };
    const levelIndex = this.state.island - 1;
    const cost = stageCost(stage, levelIndex);
    const building = base.building?.stage === stage;
    const done = base.stage >= stage;
    const next = !done && !building && base.stage === stage - 1 && !base.building;
    // the first stage can only be started from a plot stake; later ones anywhere at the base
    const canStart = next && (stage > 1 || this.state.plot >= 0) && canAfford({ cost }, this.state.store);
    let label = 'Locked';
    if (done) label = 'Built';
    else if (building) label = `${Math.ceil(base.building.left ?? 0)} s`;
    else if (next) label = stage === 1 ? 'Build here' : 'Upgrade';
    const cls = done ? ' is-done' : next || building ? '' : ' is-locked';
    return `<li class="craft-row${cls}">
      <span class="craft-ic">${icon(S.icon)}</span>
      <span class="craft-txt"><b>${esc(S.name)} <em>stage ${stage}</em></b><small>${esc(S.text)}</small></span>
      <span class="craft-costs">${done ? '' : this.costHtml(cost)}</span>
      <button type="button" class="wd-btn${next ? ' wd-primary' : ''}" data-act="${stage === 1 ? 'build' : 'upgrade'}"${canStart ? '' : ' disabled'}>${done ? icon('check') : ''}${label}</button>
    </li>`;
  }

  render() {
    const { store = {}, base, plotKind } = this.state;
    const stock = Object.keys(CONFIG.loot).map((k) => `<span class="craft-stock${store[k] ? '' : ' is-zero'}" title="${esc(CONFIG.loot[k].name)}">${icon(k)}<b>${store[k] || 0}</b></span>`).join('');
    const kind = PLOT_KINDS[plotKind] || null;
    const built = (base?.stage ?? 0) > 0 || base?.building;
    const title = built ? `Your base: ${esc(BASE_STAGES[Math.max(1, base.stage)].name)}` : `Building plot${kind ? `: ${esc(kind.name)}` : ''}`;
    const intro = built
      ? 'Grow the base with loot from the hut store. Every stage stands after a short build.'
      : `${kind ? `${esc(kind.text)} ` : ''}Choose where your team builds its base on this island – the other plots disappear once you build.`;
    const rows = Array.from({ length: MAX_STAGE }, (_, i) => this.stageRow(i + 1)).join('');
    this.el.innerHTML = `
      <header class="hud-panel-head">
        <h2>${icon(BASE_STAGES[Math.max(1, base?.stage || 1)].icon)} ${title}</h2>
        <span class="hud-panel-close"><kbd>E</kbd> / <kbd>Esc</kbd> Close</span>
      </header>
      <p class="base-intro">${intro}</p>
      <div class="craft-stockbar"><span class="craft-stock-label">${icon('home')} Hut store</span>${stock}</div>
      <ul class="craft-list">${rows}</ul>
      <footer class="wd-foot"><button type="button" class="wd-btn" data-act="close">Close</button></footer>`;
  }

  onOpen() {
    this.render();
    // count the build timer down while the panel is open
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.el.hidden || !this.el.isConnected) { clearInterval(this.timer); return; }
      const b = this.state.base?.building;
      if (b) { b.left = Math.max(0, (b.left ?? 0) - 1); this.render(); }
    }, 1000);
  }
}
