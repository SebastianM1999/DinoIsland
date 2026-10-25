import { uiIcon, uiLabel, setUiLabel, setUiAction } from './uiIcons.js';
// Shell menus outside the HUD: the settings dialog (volume, FOV, mouse)
// and the contents of the pause screen.

import { CONFIG } from '../../shared/config.js';
import { CONTRACTS } from '../../shared/missions.js';
import { SETTING_DEFS, setSetting, resetSettings, onSettings } from '../core/settings.js';

const $ = (id) => document.getElementById(id);

export { UI_ICON_SPRITE as ICON_SPRITE } from './uiIcons.js';

/**
 * Settings dialog. `onClose` runs after it closes (e.g. to show the pause
 * card again). Returns { open(tab), close(), isOpen() }.
 */
export function initSettings({ onClose } = {}) {
  const root = $('settings');
  const panel = $('settings-general');
  const tabs = { general: $('tab-general'), graphics: $('tab-graphics'), controls: $('tab-controls') };
  const panels = { general: panel, graphics: $('settings-graphics'), controls: $('settings-controls') };
  const order = Object.keys(tabs);
  let returnFocus = null;

  // Build one labelled slider row per setting, grouped by heading.
  let group = '';
  const rows = new Map();
  const settingIcons = { master:'volume-2', music:'music', sfx:'audio-lines', fov:'eye', sens:'mouse', renderScale:'monitor', ambientOcclusion:'sun', fpsLimit:'gauge', stats:'gauge' };
  for (const d of SETTING_DEFS) {
    // Graphics settings get their own tab; the rest share "Sound & view".
    const target = d.group === 'Graphics' ? panels.graphics : panel;
    if (d.group !== group && target === panel) {
      const h = document.createElement('h3');
      h.className = 'settings-group';
      h.innerHTML = uiLabel(d.group === 'Sound' ? 'volume-2' : 'eye', d.group);
      target.append(h);
    }
    group = d.group;
    const row = document.createElement('div');
    row.className = 'setting-row';
    const id = `set-${d.id}`;
    const toggle = d.type === 'toggle';
    row.innerHTML = `
      <label for="${id}">${uiIcon(settingIcons[d.id])}${d.label}</label>
      ${toggle ? `<input type="checkbox" id="${id}">` : `<input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}">`}
      <output for="${id}"></output>`;
    const input = row.querySelector('input');
    if (toggle) input.addEventListener('change', () => setSetting(d.id, input.checked ? 1 : 0));
    else input.addEventListener('input', () => setSetting(d.id, Number(input.value)));
    rows.set(d.id, { input, out: row.querySelector('output'), d });
    target.append(row);
  }
  onSettings((s) => {
    for (const { input, out, d } of rows.values()) {
      if (d.type === 'toggle') input.checked = s[d.id] > 0;
      else input.value = s[d.id];
      const pct = ((s[d.id] - d.min) / (d.max - d.min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
      out.textContent = d.labels ? d.labels[s[d.id]] : d.id === 'master' || d.id === 'music' || d.id === 'sfx'
        ? (s[d.id] === 0 ? 'Off' : `${s[d.id]}${d.unit}`)
        : `${s[d.id]}${d.unit}`;
    }
  });

  const credits = document.createElement('details');
  credits.className = 'audio-credits';
  credits.innerHTML = `<summary>${uiIcon('music')}Audio credits</summary>
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
    <a href="/assets/audio/CREDITS.md" target="_blank" rel="noopener">All sound effect credits and modification notices</a>.</p>
    <p>Pistol/rifle shots, terrain footsteps and creature calls use recorded or performed
    <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 sounds</a>.
    See the credits above for creators, sources and edits.</p>
    <p>Spear throw, bow release and weapon impact generated with
    <a href="https://elevenlabs.io/sound-effects" target="_blank" rel="noopener">ElevenLabs Sound Effects</a>,
    under the generating account's <a href="https://elevenlabs.io/terms-of-use" target="_blank" rel="noopener">ElevenLabs terms</a>.</p>`;
  panel.append(credits);

  function selectTab(name) {
    for (const k of Object.keys(tabs)) {
      tabs[k].setAttribute('aria-selected', String(k === name));
      tabs[k].tabIndex = k === name ? 0 : -1;
      panels[k].hidden = k !== name;
    }
  }
  for (const k of order) tabs[k].addEventListener('click', () => selectTab(k));
  root.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const current = order.findIndex((k) => tabs[k].getAttribute('aria-selected') === 'true');
    const next = order[(current + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    selectTab(next);
    tabs[next].focus();
  });

  function open(tab = 'general') {
    returnFocus = document.activeElement;
    selectTab(tab);
    root.hidden = false;
    (tab === 'general' ? rows.get('master').input : tab === 'graphics' ? rows.get('renderScale').input : tabs.controls).focus();
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

/** Fill the pause card with the current expedition and team (`game.kickPlayer(id)`: the host's Kick). */
export function renderPause(game) {
  const m = game.mission;
  $('pause-mission-title').textContent = m?.title || 'Expedition';
  const ul = $('pause-objectives');
  const objectives = m?.objectives || [];
  $('pause-mission-progress').textContent = `${objectives.filter(o => o.done).length}/${objectives.length}`;
  ul.replaceChildren(...(m?.objectives || []).map((o) => {
    const li = document.createElement('li');
    li.className = o.done ? 'done' : '';
    li.innerHTML = o.done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-check"/></svg>' : '<span class="dot" aria-hidden="true"></span>';
    li.append(o.text);
    return li;
  }));
  const current = ul.querySelector('li:not(.done)');
  if (current) current.classList.add('current');

  // (island 1: the team contracts come with the boat quest, once the wreck is found)
  const locked = !!m?.contracts?.some((c) => c.locked);
  $('pause-contracts').replaceChildren(...(locked ? [Object.assign(document.createElement('li'), { textContent: 'Find the wreck first – the team contracts come with the boat' })] : CONTRACTS.map((contract, index) => {
    const progress = m?.contracts?.[index];
    const li = document.createElement('li');
    li.className = progress?.done ? 'done' : '';
    li.title = contract.text;
    li.textContent = contract.title + ' · ' + (progress?.progress || 0) + '/' + contract.goal + (progress?.done ? ' · Complete' : '');
    return li;
  })));

  renderTeam(game);
}

const KICK_CONFIRM_MS = 3000;
/** The party list's rows by player id: kept across the pause card's refreshes, so a kick button keeps focus and its confirm state. */
const teamRows = new Map();

function teamRow(id) {
  let row = teamRows.get(id);
  if (row) return row;
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'name';
  const label = document.createElement('span');
  const badge = document.createElement('span');
  badge.className = 'host-badge';
  setUiAction(badge, 'crown', 'Host');
  name.append(label, badge);
  const bar = document.createElement('span');
  bar.className = 'hp';
  const fill = document.createElement('i');
  bar.append(fill);
  const state = document.createElement('span');
  state.className = 'state';
  const action = document.createElement('span');
  action.className = 'action';
  const kick = document.createElement('button');
  kick.type = 'button';
  kick.className = 'btn kick';
  action.append(kick);
  li.append(name, bar, state, action);
  row = { li, label, badge, fill, state, kick, timer: 0, who: '', onKick: null };
  const describe = () => kick.setAttribute('aria-label', kick.dataset.confirm ? `Confirm: remove ${row.who} from the expedition` : `Remove ${row.who} from the expedition`);
  // (removing a player needs a second click, like leaving: a stray click must not end a friend's game)
  row.reset = () => { clearTimeout(row.timer); delete kick.dataset.confirm; setUiAction(kick, 'user-minus', 'Kick'); describe(); };
  kick.addEventListener('click', () => {
    if (!kick.dataset.confirm) {
      kick.dataset.confirm = '1';
      setUiLabel(kick, 'Confirm kick');
      describe();
      row.timer = setTimeout(row.reset, KICK_CONFIRM_MS);
      return;
    }
    row.reset();
    kick.disabled = true;   // (until the player is gone, or the next refresh if the host ignored it)
    row.onKick?.();
  });
  row.describe = describe;
  row.reset();
  teamRows.set(id, row);
  return row;
}

/** The pause card's party list: every explorer with health, who hosts, and Kick for the host. */
function renderTeam(game) {
  const team = game.team || [{ id: game.me.id, name: game.me.name, slot: game.me.slot, hp: game.me.hp, alive: game.me.alive, host: game.me.host, isYou: true }];
  const iHost = team.some((p) => p.isYou && p.host);
  $('pause-team-count').textContent = `${team.length} explorer${team.length === 1 ? '' : 's'}`;
  const ids = new Set(team.map((p) => p.id));
  for (const [id, row] of teamRows) if (!ids.has(id)) { row.reset(); row.li.remove(); teamRows.delete(id); }
  const rows = team.map((p) => {
    const row = teamRow(p.id);
    const hp = Math.max(0, Math.round(p.hp ?? 0));
    row.li.style.setProperty('--c', CONFIG.playerColors[p.slot % 4]);
    row.label.textContent = p.name + (p.isYou ? ' (you)' : '');
    // (alone, "Host" says nothing: the marker matters once friends are in)
    row.badge.hidden = !p.host || team.length < 2;
    row.fill.style.width = `${Math.min(100, (hp / CONFIG.player.maxHealth) * 100)}%`;
    row.state.textContent = p.alive === false ? 'Down' : `${hp}`;
    const canKick = iHost && !p.isYou;
    row.kick.hidden = !canKick;
    if (!canKick) row.reset();
    else if (!row.kick.dataset.confirm) row.kick.disabled = false;
    row.who = p.name;
    row.describe();
    row.onKick = () => game.kickPlayer(p.id);
    return row.li;
  });
  const ul = $('pause-team');
  // (reorder only when needed: moving a focused button out of the list would drop its focus)
  if (rows.length !== ul.children.length || rows.some((li, i) => ul.children[i] !== li)) ul.replaceChildren(...rows);
}

