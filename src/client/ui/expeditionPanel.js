import { uiLabel, setUiLabel } from './uiIcons.js';
// The expedition picker on the title screen: every saved expedition as a card (island, play
// time, last save, party) with Continue / Host, Rename, Delete (and Export in the browser),
// plus "New expedition", which always creates a separate expedition. Used for solo play and,
// on the desktop, for choosing which expedition to host for Steam friends.

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatPlayTime(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 1) return 'just started';
  if (m < 60) return `${m} min played`;
  return `${Math.floor(m / 60)} h ${m % 60} min played`;
}

export function formatSavedAt(at, now = Date.now()) {
  if (!at) return 'not saved yet';
  const d = new Date(at);
  const today = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `saved ${today ? `today, ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`}`;
}

const PURPOSES = {
  solo: { eyebrow: 'Play solo', title: 'Choose an expedition', play: 'Continue', start: 'Start' },
  steam: { eyebrow: 'Host with Steam friends', title: 'Which expedition do you host?', play: 'Host', start: 'Start and host' },
};

/**
 * @param {{ backend, open:(name:string)=>void, onPlay:(choice:object, purpose:string)=>void }} options
 *   backend: client/net/expeditions.js; open: shows the home panel; onPlay starts the game.
 */
export function initExpeditionPanel({ backend, open, onPlay }) {
  const $ = (id) => document.getElementById(id);
  const list = $('expedition-list');
  const status = $('expedition-status');
  const nameInput = $('expedition-name');
  const tools = $('expedition-tools');
  const importInput = $('expedition-import');
  let purpose = 'solo';
  let entries = [];
  let busy = false;
  tools.hidden = !backend.importFile;

  function say(text) { status.textContent = text; }

  function card(s) {
    const p = PURPOSES[purpose];
    const badges = [
      s.open && '<span class="expedition-badge">Open now</span>',
      s.creative && '<span class="expedition-badge">Creative used</span>',
      s.recovered && '<span class="expedition-badge is-warn">Restored from a backup</span>',
      s.incompatible && '<span class="expedition-badge is-warn">Needs a newer game version</span>',
      s.damaged && '<span class="expedition-badge is-warn">Damaged</span>',
    ].filter(Boolean).join('');
    const playable = !s.incompatible && !s.damaged;
    return `<li class="expedition-card" data-id="${esc(s.id)}">
      <div class="expedition-main">
        <strong class="expedition-name">${esc(s.name)}</strong>
        <span>${s.damaged ? esc(`No usable save (${s.reason ?? 'unreadable'})`) : `Island ${s.level + 1} · ${esc(s.island)} · ${formatPlayTime(s.playSeconds)}`}</span>
        <span>${esc(formatSavedAt(s.savedAt))}${s.party?.length ? ` · ${esc(s.party.join(', '))}` : ''}</span>
        ${badges ? `<span class="expedition-badges">${badges}</span>` : ''}
      </div>
      <div class="expedition-actions">
        ${playable ? `<button type="button" class="btn btn-primary" data-act="play">${uiLabel('play', p.play)}</button>` : ''}
        ${playable ? `<button type="button" class="menu-link" data-act="rename">${uiLabel('pencil', 'Rename')}</button>` : ''}
        ${playable && backend.exportFile ? `<button type="button" class="menu-link" data-act="export">${uiLabel('download', 'Export')}</button>` : ''}
        ${s.incompatible ? '' : `<button type="button" class="menu-link expedition-delete" data-act="delete">${uiLabel('trash-2', 'Delete')}</button>`}
      </div>
    </li>`;
  }

  async function refresh() {
    try {
      entries = await backend.list();
      list.innerHTML = entries.length ? entries.map(card).join('') : '<li class="expedition-empty">No expeditions yet. Start your first one above.</li>';
      nameInput.placeholder = `Expedition ${entries.length + 1}`;
    } catch (error) {
      entries = [];
      list.innerHTML = '';
      say(error.message);
    }
  }

  function startRename(item, entry) {
    const main = item.querySelector('.expedition-name');
    const input = document.createElement('input');
    input.maxLength = 32;
    input.value = entry.name;
    input.className = 'expedition-rename';
    input.setAttribute('aria-label', 'New expedition name');
    main.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() && input.value.trim() !== entry.name) {
        try { await backend.rename(entry.id, input.value); say('Expedition renamed.'); } catch (error) { say(error.message); }
      }
      await refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void finish(false); }
    });
    input.addEventListener('blur', () => void finish(true));
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button || busy) return;
    const item = button.closest('.expedition-card');
    const entry = entries.find((e) => e.id === item?.dataset.id);
    if (!entry) return;
    const act = button.dataset.act;
    if (act === 'play') { onPlay({ id: entry.id, island: entry.level, name: entry.name }, purpose); return; }
    if (act === 'rename') { startRename(item, entry); return; }
    if (act === 'export') {
      try {
        const blob = await backend.exportFile(entry.id);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${entry.name.replace(/[^\w-]+/g, '_') || 'expedition'}.dino-expedition.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (error) { say(error.message); }
      return;
    }
    if (act === 'delete') {
      // a second click within a few seconds confirms: deleting cannot be undone
      if (!button.dataset.confirm) {
        button.dataset.confirm = '1';
        setUiLabel(button, `Delete "${entry.name}" for good?`);
        setTimeout(() => { if (button.isConnected) { delete button.dataset.confirm; setUiLabel(button, 'Delete'); } }, 4000);
        return;
      }
      busy = true;
      try { await backend.remove(entry.id); say(`"${entry.name}" was deleted.`); } catch (error) { say(error.message); }
      busy = false;
      await refresh();
    }
  });

  $('btn-expedition-new').addEventListener('click', () => {
    if (busy) return;
    const name = nameInput.value.trim() || nameInput.placeholder;
    onPlay({ create: { name } }, purpose);
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-expedition-new').click(); } });

  $('btn-expedition-import')?.addEventListener('click', () => importInput.click());
  importInput?.addEventListener('change', async () => {
    const [file] = importInput.files;
    importInput.value = '';
    if (!file) return;
    try { const s = await backend.importFile(file); say(`Imported "${s.name}".`); } catch (error) { say(error.message); }
    await refresh();
  });

  return {
    async open(kind = 'solo') {
      purpose = PURPOSES[kind] ? kind : 'solo';
      const p = PURPOSES[purpose];
      $('expeditions-eyebrow').textContent = p.eyebrow;
      setUiLabel($('home-expeditions-title'), p.title);
      setUiLabel($('btn-expedition-new'), p.start);
      say('');
      nameInput.value = '';
      open('expeditions');
      const state = await backend.status().catch((error) => ({ available: false, reason: error.message }));
      if (!state.available) {
        list.innerHTML = '';
        $('btn-expedition-new').disabled = true;
        say(state.reason || 'Expeditions are unavailable.');
        return;
      }
      $('btn-expedition-new').disabled = false;
      await refresh();
    },
    refresh,
  };
}
