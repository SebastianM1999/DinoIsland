// Boat dialog: opens with E at the wreck on the east beach. Shows the three
// boat parts of this island (found / still missing, with a hint where to
// look), and the Repair button once all of them are found.

import { RELICS } from '../../shared/relics.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BoatPanel {
  /** @param {{ onRepair: () => void, onClose: () => void }} opts */
  constructor({ onRepair, onClose }) {
    this.onRepair = onRepair;
    this.onClose = onClose;
    this.mission = null;
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-boat brush';
    this.el.setAttribute('aria-label', 'The wrecked boat');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'repair') this.onRepair?.();
      if (b.dataset.act === 'close') this.onClose?.();
    });
  }

  /** Creative mode repairs the boat without the parts. */
  setCreative(on) {
    this.creative = !!on;
    if (!this.el.hidden) this.render();
  }

  /** Latest mission state (relics, boat, objectives). */
  setMission(m) {
    this.mission = m;
    if (!this.el.hidden) this.render();
  }

  render() {
    const m = this.mission;
    if (!m) return;
    const relics = m.relics || [];
    const found = relics.filter((r) => r.found).length;
    const all = found === relics.length && relics.length > 0;
    const repaired = !!m.boat?.repaired;
    const sail = m.objectives?.[m.objectives.length - 1];
    const cards = relics.map((r) => {
      const def = RELICS[r.kind];
      return `<li class="boat-part${r.found ? ' is-found' : ''}" style="--c:${def.color}">
        <span class="boat-part-ic">${icon(r.kind)}</span>
        <span class="boat-part-txt"><b>${esc(def.name)}</b>
          <small>${r.found ? `Found${r.by ? ` by ${esc(r.by)}` : ''}` : `Missing – look ${esc(def.hint)}`}</small></span>
        <span class="boat-part-state">${r.found ? icon('check') : '?'}</span>
      </li>`;
    }).join('');
    let status, action = '';
    if (repaired) {
      status = `The boat is seaworthy! ${esc(sail?.text || 'Gather everyone here to set sail.')}`;
    } else if (all || this.creative) {
      status = all ? 'All parts are here. Fix her up and get ready to sail!' : 'Creative mode: the boat can be repaired without the parts.';
      action = `<button type="button" class="wd-btn wd-primary" data-act="repair">${icon('boat')} Repair the boat</button>`;
    } else {
      status = `${relics.length - found} part${relics.length - found === 1 ? '' : 's'} still missing. Search the island – the hints tell you where.`;
      action = `<button type="button" class="wd-btn" disabled>${icon('boat')} Repair the boat</button>`;
    }
    this.el.innerHTML = `
      <header class="hud-panel-head">
        <h2>${icon('boat')} The Wreck</h2>
        <span class="hud-panel-close"><kbd>E</kbd> / <kbd>Esc</kbd> Close</span>
      </header>
      <p class="boat-status${all || repaired ? ' is-ready' : ''}">${status}</p>
      <div class="boat-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${relics.length}" aria-valuenow="${found}">
        <i style="width:${relics.length ? Math.round((found / relics.length) * 100) : 0}%"></i><b>${found}/${relics.length} parts</b>
      </div>
      <ul class="boat-parts">${cards}</ul>
      <footer class="wd-foot">${action}<button type="button" class="wd-btn" data-act="close">Close</button></footer>`;
  }

  onOpen() { this.render(); }
}
