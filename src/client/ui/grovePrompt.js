// The Primeval Grove prompt: shown when the player walks into the grove's
// barrier. A system warning (Yes / No); on Yes the explorer admits they are
// too scared to go in, then a hint explains what unlocks the grove.
//
// TODO(grove-unlock): once the skill/unlock system exists, players who have
// GROVE.requiredSkill never hit the barrier (see mayEnterGrove in
// shared/grove.js), so this prompt only needs new texts if the flow changes.

import { GROVE } from '../../shared/grove.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class GrovePrompt {
  /** @param {{ onClose: () => void, speaker: () => string }} opts */
  constructor({ onClose, speaker }) {
    this.onClose = onClose;
    this.speaker = speaker;
    this.stage = 'warn';
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-grove brush';
    this.el.setAttribute('role', 'alertdialog');
    this.el.setAttribute('aria-labelledby', 'grove-title');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'yes') this.show('fear');
      else if (b.dataset.act === 'next') this.show('hint');
      else this.onClose?.();
    });
  }

  /** Called by the HUD when the panel opens: always start with the warning. */
  onOpen() { this.show('warn'); }

  show(stage) {
    this.stage = stage;
    this.el.dataset.stage = stage;
    if (stage === 'warn') {
      this.el.innerHTML = `
        <header class="grove-head grove-warn">
          <span class="grove-badge" aria-hidden="true">!</span>
          <h2 id="grove-title">Warning</h2>
        </header>
        <p class="grove-text">Beyond these old stones lies the <b>${esc(GROVE.name)}</b>. Something ancient and enormous lives in there.</p>
        <p class="grove-ask">Do you really want to enter?</p>
        <footer class="wd-foot">
          <button type="button" class="wd-btn wd-primary" data-act="yes">Yes</button>
          <button type="button" class="wd-btn" data-act="no">No</button>
        </footer>`;
      this.el.querySelector('[data-act="no"]').focus();
    } else if (stage === 'fear') {
      this.el.innerHTML = `
        <header class="grove-head grove-speaker">
          <span class="grove-avatar" aria-hidden="true">${icon('person')}</span>
          <h2 id="grove-title">${esc(this.speaker?.() || 'You')}</h2>
        </header>
        <p class="grove-line">“…No. No, no, no. Did you <i>see</i> the size of that thing? I'm way too scared to go in there. Not yet.”</p>
        <footer class="wd-foot">
          <button type="button" class="wd-btn wd-primary" data-act="next">Continue</button>
        </footer>`;
      this.el.querySelector('[data-act="next"]').focus();
    } else {
      this.el.innerHTML = `
        <header class="grove-head grove-hint">
          <span class="grove-badge" aria-hidden="true">?</span>
          <h2 id="grove-title">Hint</h2>
        </header>
        <p class="grove-text">You can't enter the ${esc(GROVE.name)} yet. First unlock the skill <b>${esc(GROVE.requiredSkill)}</b> on one of the later islands – then come back and face the giant.</p>
        <footer class="wd-foot">
          <button type="button" class="wd-btn wd-primary" data-act="close">Got it</button>
        </footer>`;
      this.el.querySelector('[data-act="close"]').focus();
    }
  }
}
