// Shell menus outside the HUD: the settings dialog (volume, FOV, mouse)
// and the contents of the pause screen.

import { CONFIG } from '../../shared/config.js';
import { SETTING_DEFS, setSetting, resetSettings, onSettings } from '../core/settings.js';

const $ = (id) => document.getElementById(id);

/** Inline SVG icon sprite used by the menus (<use href="#i-…">). */
export const ICON_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-gear" viewBox="0 0 24 24"><path fill="currentColor" d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.2 0 1.8l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.8a5.6 5.6 0 0 1 0-1.8l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" transform="translate(0 1)"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 4.5v15a1 1 0 0 0 1.5.9l11.6-7.5a1 1 0 0 0 0-1.8L9.5 3.6A1 1 0 0 0 8 4.5z"/></symbol>
  <symbol id="i-keys" viewBox="0 0 24 24"><path fill="currentColor" d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm1 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM7 13v2h10v-2z"/></symbol>
  <symbol id="i-door" viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h9a2 2 0 0 1 2 2v3h-2V5H5v14h9v-3h2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm12.6 5.4L21.2 12l-3.6 3.6-1.4-1.4 1.2-1.2H9v-2h8.4l-1.2-1.2z"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></symbol>
  <symbol id="i-wing" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17c3.5-.5 6-2 8-4.5C13 10 15.5 5.5 21 4c-.5 3-1.8 5.2-3.6 6.8 1 .1 1.9 0 2.8-.3-.9 2-2.5 3.3-4.6 3.9.8.3 1.6.4 2.5.3-1.5 1.8-3.8 2.8-6.6 2.8L7 20H4.5l1-2.4c-.9 0-1.7-.2-2.5-.6z"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
</svg>`;

/**
 * Settings dialog. `onClose` runs after it closes (e.g. to show the pause
 * card again). Returns { open(tab), close(), isOpen() }.
 */
export function initSettings({ onClose } = {}) {
  const root = $('settings');
  const panel = $('settings-general');
  const tabs = { general: $('tab-general'), controls: $('tab-controls') };
  const panels = { general: panel, controls: $('settings-controls') };
  let returnFocus = null;

  // Build one labelled slider row per setting, grouped by heading.
  let group = '';
  const rows = new Map();
  for (const d of SETTING_DEFS) {
    if (d.group !== group) {
      group = d.group;
      const h = document.createElement('h3');
      h.className = 'settings-group';
      h.textContent = group;
      panel.append(h);
    }
    const row = document.createElement('div');
    row.className = 'setting-row';
    const id = `set-${d.id}`;
    row.innerHTML = `
      <label for="${id}">${d.label}</label>
      <input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}">
      <output for="${id}"></output>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => setSetting(d.id, Number(input.value)));
    rows.set(d.id, { input, out: row.querySelector('output'), d });
    panel.append(row);
  }
  onSettings((s) => {
    for (const { input, out, d } of rows.values()) {
      input.value = s[d.id];
      const pct = ((s[d.id] - d.min) / (d.max - d.min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
      out.textContent = d.id === 'master' || d.id === 'music' || d.id === 'sfx'
        ? (s[d.id] === 0 ? 'Off' : `${s[d.id]}${d.unit}`)
        : `${s[d.id]}${d.unit}`;
    }
  });

  const credits = document.createElement('details');
  credits.className = 'audio-credits';
  credits.innerHTML = `<summary>Audio credits</summary>
    <p>Emerald Jungle exploration: <a href="https://opengameart.org/content/forest-exploration" target="_blank" rel="noopener">Forest Exploration — Tsorthan Grove</a>.</p>
    <p>Music by Scott Buckley — <a href="https://www.scottbuckley.com.au" target="_blank" rel="noopener">www.scottbuckley.com.au</a>:<br>
    Main menu: <a href="https://www.scottbuckley.com.au/library/call-to-adventure/" target="_blank" rel="noopener">Call To Adventure</a>.<br>
    Emerald Jungle danger: <a href="https://www.scottbuckley.com.au/library/escape-velocity/" target="_blank" rel="noopener">Escape Velocity</a>.<br>
    Ashfall Isle exploration: <a href="https://www.scottbuckley.com.au/library/shadows-and-dust/" target="_blank" rel="noopener">Shadows and Dust</a>.<br>
    Ashfall Isle danger: <a href="https://www.scottbuckley.com.au/library/eyes-in-the-void/" target="_blank" rel="noopener">Eyes In The Void</a>.<br>
    Boss arena and causeway: <a href="https://www.scottbuckley.com.au/library/simulacra/" target="_blank" rel="noopener">Simulacra</a>.</p>
    <p>All music released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
    Music level balanced and encoded as Ogg Vorbis. Scott Buckley tracks crossfaded for looping;
    Forest Exploration uses the original loop.
    <a href="/assets/audio/CREDITS.md" target="_blank" rel="noopener">All sound effect credits and modification notices</a>.</p>`;
  panel.append(credits);

  function selectTab(name) {
    for (const k of Object.keys(tabs)) {
      tabs[k].setAttribute('aria-selected', String(k === name));
      tabs[k].tabIndex = k === name ? 0 : -1;
      panels[k].hidden = k !== name;
    }
  }
  tabs.general.addEventListener('click', () => selectTab('general'));
  tabs.controls.addEventListener('click', () => selectTab('controls'));
  root.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tabs.general.getAttribute('aria-selected') === 'true' ? 'controls' : 'general';
    selectTab(next);
    tabs[next].focus();
  });

  function open(tab = 'general') {
    returnFocus = document.activeElement;
    selectTab(tab);
    root.hidden = false;
    (tab === 'general' ? rows.get('master').input : tabs.controls).focus();
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    onClose?.();
    returnFocus?.focus?.();
  }

  $('btn-settings-close').addEventListener('click', close);
  $('btn-settings-done').addEventListener('click', close);
  $('btn-settings-reset').addEventListener('click', resetSettings);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  addEventListener('keydown', (e) => {
    if (!root.hidden && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  }, true);
  for (const b of document.querySelectorAll('[data-open-settings]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      open(b.dataset.openSettings || 'general');
    });
  }
  return { open, close, isOpen: () => !root.hidden };
}

/** Fill the pause card with the current expedition and team. */
export function renderPause(game) {
  const m = game.mission;
  $('pause-mission-title').textContent = m?.title || 'Expedition';
  const ul = $('pause-objectives');
  ul.replaceChildren(...(m?.objectives || []).map((o) => {
    const li = document.createElement('li');
    li.className = o.done ? 'done' : '';
    li.innerHTML = o.done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-check"/></svg>' : '<span class="dot" aria-hidden="true"></span>';
    li.append(o.text);
    return li;
  }));
  const current = ul.querySelector('li:not(.done)');
  if (current) current.classList.add('current');

  const team = game.team || [{ name: game.me.name, slot: game.me.slot, hp: game.me.hp, alive: game.me.alive, isYou: true }];
  $('pause-team').replaceChildren(...team.map((p) => {
    const li = document.createElement('li');
    li.style.setProperty('--c', CONFIG.playerColors[p.slot % 4]);
    const hp = Math.max(0, Math.round(p.hp ?? 0));
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name + (p.isYou ? ' (you)' : '');
    const bar = document.createElement('span');
    bar.className = 'hp';
    bar.innerHTML = `<i style="width:${Math.min(100, (hp / CONFIG.player.maxHealth) * 100)}%"></i>`;
    const state = document.createElement('span');
    state.className = 'state';
    state.textContent = p.alive === false ? 'Down' : `${hp}`;
    li.append(name, bar, state);
    return li;
  }));
}

