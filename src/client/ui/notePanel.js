import { journalMargin } from './journalMargins.js';
import { uiIcon } from './uiIcons.js';
// The story's letters and journal (shared/notes.js): E at a note opens it on a sheet of paper;
// J opens the team's journal, every note it has read, island by island. A note in the journal
// opens the same sheet; Back returns to the list.

import { NOTE_BY_ID, NOTES } from '../../shared/notes.js';
import { LEVELS } from '../../shared/levels.js';
import { RECIPES } from '../../shared/crafting.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class NotePanel {
  /** @param {{ onClose: () => void }} opts */
  constructor({ onClose }) {
    this.onClose = onClose;
    this.read = new Set();   // note ids the team has read
    this.note = null;        // the note on the sheet, or null for the journal list
    this.fromJournal = false;
    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-note brush';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Note');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.note) this.showNote(b.dataset.note, true);
      else if (b.dataset.act === 'back') this.showJournal();
      else if (b.dataset.act === 'close') this.onClose?.();
    });
  }

  /** The team's journal (ids of every note read, from the welcome and EV.NOTE). */
  setRead(ids) {
    this.read = new Set(ids);
    if (!this.el.hidden && !this.note) this.render();
  }

  markRead(id) {
    this.read.add(id);
    if (!this.el.hidden && !this.note) this.render();
  }

  /** Put note `id` on the sheet (call before opening the panel). */
  showNote(id, fromJournal = false) {
    if (!NOTE_BY_ID[id]) return;
    this.note = id;
    this.fromJournal = fromJournal;
    this.render();
  }

  showJournal() {
    this.note = null;
    this.fromJournal = false;
    this.render();
  }

  render() {
    const n = this.note && NOTE_BY_ID[this.note];
    this.el.dataset.mode = n ? 'note' : 'journal';
    this.el.setAttribute('aria-label', n ? n.title : 'Journal');
    const close = `<button type="button" class="wd-btn" data-act="close">${uiIcon('x')} Close <kbd>E</kbd></button>`;
    if (n) {
      const learned = RECIPES.filter((r) => r.learn === n.id);   // (the recipes this note teaches: shared/crafting.js)
      this.el.innerHTML = `
      ${journalMargin('journal')}
        <article class="note-sheet note-${n.prop}">
          <h2>${esc(n.title)}</h2>
          ${n.text.map((t) => `<p>${esc(t)}</p>`).join('')}
          <p class="note-author">– ${esc(n.author)}</p>
        </article>
        ${learned.length ? `<p class="note-learned">${uiIcon('book-open')} Teaches the team: ${learned.map((r) => esc(r.name)).join(', ')}</p>` : ''}
        <div class="note-actions">${this.fromJournal ? `<button type="button" class="wd-btn" data-act="back">${uiIcon('arrow-left')} Back to the journal</button>` : ''}${close}</div>`;
      return;
    }
    const islands = LEVELS.map((L, i) => ({ L, notes: NOTES.filter((x) => x.island === i && this.read.has(x.id)) })).filter((g) => g.notes.length);
    const body = islands.length
      ? islands.map(({ L, notes }) => `
        <h3>${esc(L.name)}</h3>
        <ul class="note-list">${notes.map((x) => `<li><button type="button" data-note="${x.id}">${uiIcon('scroll-text')}<b>${esc(x.title)}</b><small>${esc(x.author)}</small></button></li>`).join('')}</ul>`).join('')
      : '<p class="note-empty">No notes yet. Look around – the castaways before you left word.</p>';
    this.el.innerHTML = `
      ${journalMargin('journal')}
      <header class="hud-panel-head"><h2>${uiIcon('book-open')} Journal</h2><span class="hud-panel-close"><kbd>J</kbd> Close</span></header>
      <div class="note-journal">${body}</div>
      <div class="note-actions">${close}</div>`;
  }

  onOpen() {
    this.render();
    this.el.querySelector('button')?.focus({ preventScroll: true });
  }
}
