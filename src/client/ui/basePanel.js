// Base dialog (islands 2+): opens with E at a building plot's stake or at the
// base flag. Build the camp on the chosen plot, then grow it twice. Costs come
// from the shared hut store; the server validates everything (ACT.BASE).

import { CONFIG } from '../../shared/config.js';
import { canAfford } from '../../shared/crafting.js';
import { BASE_STAGES, MAX_STAGE, PLOT_KINDS, TOWERS, TOWER_SLOTS, stageCost, towerCost, repairCost } from '../../shared/base.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BasePanel {
  /**
   * @param {{ onBuild: (plot: number) => void, onUpgrade: () => void, onTower: (slot: number, kind: string) => void,
   *   onTowerUp: (slot: number) => void, onClose: () => void }} opts
   */
  constructor({ onBuild, onUpgrade, onTower, onTowerUp, onRepair, onClose }) {
    this.onBuild = onBuild;
    this.onUpgrade = onUpgrade;
    this.onRepair = onRepair;
    this.onTower = onTower;
    this.onTowerUp = onTowerUp;
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
      else if (act === 'tower') this.onTower?.(Number(b.dataset.slot), b.dataset.kind);
      else if (act === 'towerUp') this.onTowerUp?.(Number(b.dataset.slot));
      else if (act === 'repair') this.onRepair?.();
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

  /** Health of the base, and a repair button once a raid has knocked something out. */
  healthRow() {
    const base = this.state.base;
    if (!base || base.stage < 1) return '';
    const cost = repairCost(base, this.state.island - 1);
    const pct = base.maxHp ? Math.round((base.hp / base.maxHp) * 100) : 0;
    const broken = [base.damaged ? 'the base' : null, ...base.towers.filter((t) => t.damaged).map((t) => `tower ${t.slot + 1}`)].filter(Boolean);
    const sub = broken.length ? `Damaged: ${broken.join(', ')}. No healing or safe zone until it is repaired.` : 'Raids wear it down; between raids it patches itself up.';
    return `<li class="craft-row${broken.length ? ' is-hurt' : ''}"><span class="craft-ic">${icon('heart')}</span>
      <span class="craft-txt"><b>Base health <em>${pct}%</em></b><span class="base-hp"><i style="width:${pct}%"></i></span><small>${esc(sub)}</small></span>
      <span class="craft-costs">${cost ? this.costHtml(cost) : ''}</span>
      <button type="button" class="wd-btn${cost ? ' wd-primary' : ''}" data-act="repair"${cost && canAfford({ cost }, this.state.store) ? '' : ' disabled'}>Repair</button></li>`;
  }

  /** One row per tower spot: locked, free (choose a tower) or built (upgrade). */
  towerRows() {
    const base = this.state.base;
    if (!base || base.stage < 1) return '';
    const levelIndex = this.state.island - 1;
    const open = BASE_STAGES[base.stage].towerSlots;
    const rows = TOWER_SLOTS.map((_, slot) => {
      const t = base.towers.find((q) => q.slot === slot);
      if (slot >= open) {
        const need = BASE_STAGES[slot < 2 ? 2 : 3].name.toLowerCase();
        return `<li class="craft-row is-locked"><span class="craft-ic">${icon('tower')}</span>
          <span class="craft-txt"><b>Tower spot ${slot + 1}</b><small>Opens with the ${esc(need)}.</small></span>
          <button type="button" class="wd-btn" disabled>Locked</button></li>`;
      }
      if (!t) {
        const choice = Object.entries(TOWERS).map(([kind, T]) => {
          const cost = towerCost(kind, 1, levelIndex);
          const ok = canAfford({ cost }, this.state.store);
          return `<button type="button" class="wd-btn" data-act="tower" data-slot="${slot}" data-kind="${kind}" title="${esc(T.text)}"${ok ? '' : ' disabled'}>${icon(T.icon)}${esc(T.name)} ${this.costHtml(cost)}</button>`;
        }).join('');
        return `<li class="craft-row"><span class="craft-ic">${icon('tower')}</span>
          <span class="craft-txt"><b>Tower spot ${slot + 1}</b><small>Free – choose a tower.</small></span>
          <span class="base-tower-choice">${choice}</span></li>`;
      }
      const T = TOWERS[t.kind];
      const maxed = t.level >= 2;
      const cost = towerCost(t.kind, 2, levelIndex);
      const ok = !maxed && canAfford({ cost }, this.state.store);
      const sub = t.damaged ? 'Damaged – it fires again once repaired.' : maxed ? T.text : `Upgrade: ${T.upgrade.name} – ${T.upgrade.text}`;
      return `<li class="craft-row${maxed ? ' is-done' : ''}"><span class="craft-ic">${icon(T.icon)}</span>
        <span class="craft-txt"><b>${esc(maxed ? T.upgrade.name : T.name)} <em>spot ${slot + 1}</em></b><small>${esc(sub)}</small></span>
        <span class="craft-costs">${maxed ? '' : this.costHtml(cost)}</span>
        <button type="button" class="wd-btn${maxed ? '' : ' wd-primary'}" data-act="towerUp" data-slot="${slot}"${ok ? '' : ' disabled'}>${maxed ? `${icon('check')}Max` : 'Upgrade'}</button></li>`;
    }).join('');
    return `<h3 class="base-sub">${icon('tower')} Defence towers</h3><ul class="craft-list">${rows}</ul>`;
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
      <ul class="craft-list">${this.healthRow()}${rows}</ul>
      ${this.towerRows()}
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
