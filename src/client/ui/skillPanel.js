// Illustrated expedition skill tree panel (key K): level and XP, then
// Fighting / Endurance / Durability as three columns of icon tiles grouped by
// tier. Hovering or focusing a tile shows what it does in the footer. Buying
// sends one rank to the server (ACT.SKILL) and updates the view optimistically;
// the server's MSG.PROF is the truth and replaces the guess (or a timeout
// reverts it when the buy was refused).

import { buildSkillView, skillView, previewBuy, refundOf, xpTableText } from './skillModel.js';
import { skillIcon, treeIcon, LOCK_ICON, TICK_ICON } from './skillIcons.js';
import { freshProfile } from '../../shared/skills.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REVERT_MS = 2000;     // an optimistic buy the server never confirmed is dropped after this
const CONFIRM_MS = 4000;    // the reset button stays armed this long
let panelSequence = 0;

function ensureStylesheet() {
  if (typeof document === 'undefined' || document.querySelector('link[data-skills-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../../css/skills.css', import.meta.url).href;
  link.dataset.skillsCss = '';
  document.head.appendChild(link);
}

export class SkillPanel {
  /**
   * @param {{ onBuy?: (id: string) => void, onReset?: () => void, onClose: () => void, readOnly?: boolean, title?: string }} opts
   * readOnly: someone else's tree (the lobby): tiles explain, nothing is bought or reset; title: the heading.
   */
  constructor({ onBuy, onReset, onClose, readOnly = false, title = 'Skill tree' }) {
    ensureStylesheet();
    this.readOnly = readOnly;
    this.title = title;
    this.onBuy = onBuy;
    this.onReset = onReset;
    this.onClose = onClose;
    this.server = freshProfile();     // last profile the server confirmed
    this.view = this.server;          // what is drawn (server + unconfirmed buys)
    this.atCamp = false;
    this.confirming = false;
    this.hoverId = null;              // tile under the pointer / with keyboard focus: its text fills the footer
    this.focusId = null;
    this.descId = `skill-description-${++panelSequence}`;
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-skills';
    this.el.setAttribute('aria-label', 'Skills');
    this.el.addEventListener('click', (e) => {
      const card = e.target.closest('[data-skill]');
      if (card) { if (this.readOnly) card.focus(); else this.buy(card.dataset.skill); return; }
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'reset') this.reset();
      else if (b.dataset.act === 'cancel') this.setConfirming(false);
      else if (b.dataset.act === 'close') this.onClose?.();
    });
    this.el.addEventListener('keydown', (e) => this.#onKey(e));
    // hover on the tiles fills the footer; moving off a tile (onto the panel) shows the focused one / the hint again
    this.el.addEventListener('pointerover', (e) => this.#setHover('hoverId', e.target.closest?.('[data-skill]')?.dataset.skill ?? null));
    this.el.addEventListener('pointerleave', () => this.#setHover('hoverId', null));
    this.el.addEventListener('focusin', (e) => {
      // Keyboard inspection takes over from a pointer left on another tile.
      this.hoverId = null;
      this.focusId = e.target.closest?.('[data-skill]')?.dataset.skill ?? null;
      this.#updateDesc();
    });
    this.el.addEventListener('focusout', (e) => { if (!e.relatedTarget?.closest?.('[data-skill]')) this.#setHover('focusId', null); });
  }

  /** The server's profile (also drops any unconfirmed guess). */
  setProfile(profile) {
    this.server = this.view = profile;
    clearTimeout(this.revertTimer);
    this.#renderIfOpen();
  }

  /** Reset is only possible at a camp station. */
  setAtCamp(atCamp) {
    if (this.atCamp === !!atCamp) return;
    this.atCamp = !!atCamp;
    this.#renderIfOpen();
  }

  buy(id) {
    const next = previewBuy(this.view, id);
    if (!next) { this.#shake(id); return false; }
    this.view = next;
    clearTimeout(this.revertTimer);
    this.revertTimer = setTimeout(() => { this.view = this.server; this.#renderIfOpen(); }, REVERT_MS);
    this.onBuy?.(id);
    this.render(id);
    return true;
  }

  reset() {
    if (!this.confirming) { this.setConfirming(true); return; }
    this.setConfirming(false);
    this.onReset?.();
  }

  setConfirming(on) {
    this.confirming = on;
    clearTimeout(this.confirmTimer);
    if (on) this.confirmTimer = setTimeout(() => this.setConfirming(false), CONFIRM_MS);
    this.#renderIfOpen();
    if (on) this.el.querySelector('[data-act=reset]')?.focus();
  }

  onOpen() {
    this.confirming = false;
    this.hoverId = this.focusId = null;
    this.render(null);
    // land on the first thing worth buying, else the first tile
    (this.el.querySelector('.sk-tile.is-available') || this.el.querySelector('.sk-tile'))?.focus({ preventScroll: true });
  }

  dispose() {
    clearTimeout(this.revertTimer);
    clearTimeout(this.confirmTimer);
  }

  #renderIfOpen() { if (!this.el.hidden) this.render(); }

  #setHover(key, id) {
    if (this[key] === id) return;
    this[key] = id;
    this.#updateDesc();
  }

  #shake(id) {
    this.el.querySelector(`[data-skill="${id}"]`)?.animate?.(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-0.3em)' }, { transform: 'translateX(0.3em)' }, { transform: 'translateX(0)' }],
      { duration: 220 });
  }

  /** Arrow keys move between tiles (Tab is taken by the inventory); Enter/Space buy via the native click. */
  #onKey(e) {
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!dir) return;
    const cols = [...this.el.querySelectorAll('.sk-col')].map((c) => [...c.querySelectorAll('[data-skill]')]);
    let ci = cols.findIndex((c) => c.includes(document.activeElement));
    if (ci < 0) { cols[0]?.[0]?.focus(); e.preventDefault(); return; }
    let ri = cols[ci].indexOf(document.activeElement);
    const cur = cols[ci][ri];
    if (dir[0]) {
      // inside a column left/right steps within the 2-wide rows; past its edge it hops to the neighbour column
      const sib = cols[ci][ri + dir[0]];
      if (sib && sib.offsetTop === cur.offsetTop) { sib.focus(); e.preventDefault(); return; }
      ci = Math.max(0, Math.min(cols.length - 1, ci + dir[0]));
      const y = cur.offsetTop;
      ri = cols[ci].reduce((best, t, i) => (Math.abs(t.offsetTop - y) < Math.abs(cols[ci][best].offsetTop - y) ? i : best), 0);
    } else {
      // up/down moves to the nearest tile in the row above/below, keeping the horizontal position
      const x = cur.offsetLeft, y = cur.offsetTop;
      const rows = cols[ci].filter((t) => (dir[1] > 0 ? t.offsetTop > y : t.offsetTop < y));
      if (rows.length) {
        const ty = dir[1] > 0 ? Math.min(...rows.map((t) => t.offsetTop)) : Math.max(...rows.map((t) => t.offsetTop));
        const row = rows.filter((t) => t.offsetTop === ty);
        const best = row.reduce((b, t) => (Math.abs(t.offsetLeft - x) < Math.abs(b.offsetLeft - x) ? t : b));
        ri = cols[ci].indexOf(best);
      }
    }
    cols[ci][ri]?.focus();
    e.preventDefault();
  }

  #tileHtml(s) {
    const pips = Array.from({ length: s.max }, (_, i) => `<i class="${i < s.rank ? 'on' : ''}"></i>`).join('');
    const label = `${s.name}, rank ${s.rank} of ${s.max}${s.state === 'locked' ? `, locked: ${s.reason}` : s.state === 'maxed' ? ', maxed' : `, costs ${s.cost}`}`;
    const cls = `is-${s.state}${s.lock ? ` lock-${s.lock}` : ''}${s.capstone ? ' is-cap' : ''}`;
    const stateLabel = s.state === 'maxed' ? 'Maxed' : s.lock === 'gate' ? 'Tier locked' : s.lock === 'points' ? 'Need points' : 'Learn rank';
    return `<button type="button" class="sk-tile ${cls}" data-skill="${s.id}" aria-disabled="${s.state !== 'available'}" aria-label="${esc(label)}" aria-describedby="${this.descId}">
      <span class="sk-disc">${skillIcon(s.id)}</span>
      <span class="sk-name">${esc(s.name)}</span>
      <span class="sk-meta"><b>${s.rank}/${s.max}</b><span>${s.cost} ${s.cost === 1 ? 'point' : 'points'}</span></span>
      <span class="sk-pips" aria-hidden="true">${pips}</span>
      <span class="sk-state">${s.lock === 'gate' ? LOCK_ICON : ''}${stateLabel}</span>
      ${s.state === 'maxed' ? `<span class="sk-done" aria-hidden="true">${TICK_ICON}</span>` : ''}
    </button>`;
  }

  /** Footer text: the hint, or the explanation of the hovered / focused skill. */
  #descHtml() {
    const id = this.hoverId ?? this.focusId;
    if (!id) {
      const free = buildSkillView(this.view).free;
      if (this.readOnly) return `<span class="sk-hint">Hover or focus a skill to see what it does &middot; ${free} point${free === 1 ? '' : 's'} unspent &middot; arrow keys move</span>`;
      return`<span class="sk-hint">Hover or focus a skill to see what it does &middot; click or Enter to learn a rank (${free} point${free === 1 ? '' : 's'} available) &middot; arrow keys move</span>`;
    }
    const s = skillView(this.view, id);
    const status = s.state === 'maxed' ? '<em class="sk-st is-max">Maxed</em>'
      : s.state === 'locked' ? `<em class="sk-st is-bad">${esc(s.reason)}</em>`
        : this.readOnly ? '' : `<em class="sk-st is-ok">Click to learn:${s.cost} point${s.cost > 1 ? 's' : ''}</em>`;
    return `<span class="sk-detail-disc sk-${s.tree}" aria-hidden="true">${skillIcon(s.id)}</span><b class="sk-d-name">${esc(s.name)}</b><span class="sk-d-rank">Rank ${s.rank}/${s.max}</span>${status}
      <span class="sk-d-line">${s.now ? `<i>Now</i> ${esc(s.now)}` : '<i>Now</i> Not learned yet'}</span>
      ${s.next ? `<span class="sk-d-line"><i>Next</i> ${esc(s.next)}</span>` : ''}`;
  }

  #updateDesc() {
    const d = this.el.querySelector('.sk-desc');
    if (d) d.innerHTML = this.#descHtml();
  }

  render(focusId = document.activeElement?.dataset?.skill) {
    const scroll = this.el.querySelector('.sk-cols')?.scrollTop ?? 0;   // innerHTML below resets it
    const v = buildSkillView(this.view);
    const frac = Math.max(0, Math.min(1, v.frac));
    const refund = refundOf(this.view);
    const cols = v.trees.map((t) => `
      <section class="sk-col sk-${t.id}" aria-label="${esc(t.name)}">
        <header class="sk-colhead">
          <span class="sk-treeic">${treeIcon(t.id)}</span>
          <span class="sk-treetxt"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span>
          <span class="sk-badge" title="Points spent in ${esc(t.name)}">${t.spent}</span>
        </header>
        ${t.tiers.map((g) => `
          <div class="sk-tier${g.open ? '' : ' is-locked'}">
            <span class="sk-tierlabel">${esc(g.label)}</span>
            <span class="sk-gate">${g.open ? TICK_ICON : LOCK_ICON}${g.gate === 0 ? 'Available from start' : g.open ? 'Tier unlocked' : `${t.spent}/${g.gate} spent · ${g.gate - t.spent} needed`}</span>
            ${g.gate > 0 ? `<span class="sk-gate-track" role="progressbar" aria-label="${esc(t.name)} ${esc(g.label)} unlock progress" aria-valuemin="0" aria-valuemax="${g.gate}" aria-valuenow="${Math.min(t.spent, g.gate)}"><span style="transform:scaleX(${Math.min(1, t.spent / g.gate)})"></span></span>` : ''}
          </div>
          <div class="sk-tiles">${g.skills.map((s) => this.#tileHtml(s)).join('')}</div>`).join('')}
      </section>`).join('');
    const resetLabel = this.confirming ? `Refund ${refund} point${refund === 1 ? '' : 's'} - confirm` : 'Reset skills';
    const resetOff = !this.atCamp || refund === 0 || !!this.view.creative;
    // One illustrated panel is shared by the home preview, lobby and live HUD.
    this.el.innerHTML = `
      <header class="sk-head">
        <div class="sk-heading"><h2>${treeIcon('endurance')} <span>${esc(this.title)}</span></h2>
          <p class="sk-kicker">Prepare your expedition</p>
          <p class="sk-intro">${this.readOnly ? 'Each expedition has its own level and skills. Earn points there and spend them at its camp.' : 'Forge your own path. Learn new skills, strengthen your explorer, and prepare for the hunt.'}</p>
        </div>
        <button type="button" class="sk-close-top" data-act="close" aria-label="Close skill tree" title="Close (Esc)">×</button>
      <div class="sk-xprow" role="group" aria-label="Experience" title="${esc(xpTableText())}">
        <span class="sk-xp-emblem" aria-hidden="true">${treeIcon('endurance')}</span>
        <span class="sk-xpbar" role="progressbar" aria-label="Explorer experience" aria-valuemin="0" aria-valuemax="${v.need}" aria-valuenow="${v.into}"><span class="hud-bar-fill" style="transform:scaleX(${frac})"></span></span>
        <span class="sk-xpnum">${v.capped ? 'Max level' : `${v.into} / ${v.need} XP`}</span>
      </div>
      <div class="sk-progress">
        <span class="sk-level">${treeIcon('endurance')} Level ${v.level}${v.capped ? ' (max)' : ''}</span>
        <span class="sk-free${v.free > 0 ? ' has-free' : ''}"><b>${v.free}</b> skill point${v.free === 1 ? '' : 's'} ${this.readOnly ? 'unspent' : 'to spend'}</span>
      </div>
      </header>
      <div class="sk-cols">${cols}</div>
      <footer class="wd-foot sk-foot">
        <div class="sk-desc" id="${this.descId}" aria-live="polite">${this.#descHtml()}</div>
        <div class="sk-actions${this.confirming ? ' is-confirming' : ''}">
          ${this.readOnly ? '' : `${this.atCamp ? '' : '<span class="sk-note">Reset only at camp</span>'}
          ${this.confirming ? '<button type="button" class="wd-btn" data-act="cancel">Cancel</button>' : ''}
          <button type="button" class="wd-btn${this.confirming ? ' sk-danger' : ''}" data-act="reset"${resetOff ? ' disabled' : ''} title="${this.atCamp ? 'Refund every spent point' : 'Only at camp'}"><span aria-hidden="true">↶</span> ${resetLabel}</button>`}
          <button type="button" class="wd-btn sk-close-btn" data-act="close"><span aria-hidden="true">×</span> Close</button>
        </div>
      </footer>`;
    const cols_ = this.el.querySelector('.sk-cols');
    if (cols_) cols_.scrollTop = scroll;
    if (focusId) this.el.querySelector(`[data-skill="${focusId}"]`)?.focus({ preventScroll: true });
    this.#updateDesc();
  }
}
