// In-game HUD for Dinosaur Island. Plain DOM + one canvas per map view.
// Layout and look follow inspiration/ingame-UI-no-BG.png and HUD-art.png.
//
// Performance rules: per-frame setters (compass, minimap, crosshair, bars)
// only touch `transform` / canvas pixels and skip writes when the value did
// not change. Nothing here reads layout during a frame.

import { EQUIP } from '../../shared/protocol.js';
import { CONFIG } from '../../shared/config.js';
import { icon, portraitSvg } from './icons.js';
import { buildMapBase, drawMap } from './minimap.js';
import { ITEM_INFO } from './itemInfo.js';
import { CONTRACTS as BOARD_CONTRACTS } from '../../shared/missions.js';
import { RELICS } from '../../shared/relics.js';

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const COMPASS_SPAN = 180;           // degrees visible across the compass strip
const MINIMAP_RADIUS = 120;         // meters shown from center to rim

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrapDeg = (d) => ((d % 360) + 540) % 360 - 180;
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

const LOOT_KEYS = ['meat', 'hide', 'teeth', 'plates', 'claws'];
const FRUIT_KEYS = ['berry', 'mango', 'dragon'];
const lootName = (k) => CONFIG.loot?.[k]?.name || k;
const fruitName = (k) => CONFIG.fruit?.types?.[k]?.name || k;

function ensureStylesheet() {
  if (document.querySelector('link[data-hud-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../../css/hud.css', import.meta.url).href;
  link.dataset.hudCss = '';
  document.head.appendChild(link);
}

export class Hud {
  /** @param {HTMLElement} root the #hud element */
  constructor(root) {
    ensureStylesheet();
    this.root = root;
    root.replaceChildren();              // a new island builds a fresh HUD in the same element
    root.classList.add('hud');
    root.setAttribute('aria-label', 'Game HUD');
    this._c = {};                       // last written values (change detection)
    this._mapBase = null;
    this._mapState = null;
    this._invOpen = false;
    this._mapOpen = false;
    this._inv = null;
    this._invDirty = true;
    this._build();
  }

  // ================================================================ DOM
  _build() {
    const r = this.root;
    r.innerHTML = '';

    // ---------- top-left: portrait + status bars + mission
    const tl = el('div', 'hud-tl');
    const status = el('div', 'hud-status');
    this.$portrait = el('div', 'hud-portrait', portraitSvg(CONFIG.playerColors[0], 0));
    const bars = el('div', 'hud-bars brush');
    const mkBar = (cls, ic, label) => {
      const row = el('div', `hud-bar ${cls}`);
      row.innerHTML = `<span class="hud-bar-ic">${icon(ic)}</span>
        <span class="hud-bar-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span class="hud-bar-fill"></span></span>`;
      bars.appendChild(row);
      return { meter: row.querySelector('[role=meter]'), fill: row.querySelector('.hud-bar-fill'), row };
    };
    this.$hp = mkBar('is-hp', 'heart', 'Health');
    this.$st = mkBar('is-st', 'bolt', 'Stamina');
    this.$name = el('div', 'hud-name');
    status.append(this.$portrait, bars);
    this.$mission = el('section', 'hud-mission brush');
    this.$mission.setAttribute('aria-label', 'Current mission');
    this.$mission.hidden = true;
    tl.append(status, this.$mission);

    // ---------- top-center: compass + hint
    const tc = el('div', 'hud-tc');
    this.$compass = el('div', 'hud-compass brush');
    this.$compass.setAttribute('aria-hidden', 'true');
    const strip = el('div', 'hud-compass-strip');
    this.$tape = el('div', 'hud-compass-tape');
    let tape = '';
    const LET = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    const SUB = { 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
    for (let d = -180; d <= 540; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const left = ((d + 180) / 720) * 100;
      if (LET[n]) tape += `<span class="cp-l${n === 0 ? ' is-n' : ''}" style="left:${left}%">${LET[n]}</span>`;
      else if (SUB[n]) tape += `<span class="cp-t is-mid" style="left:${left}%"></span>`;
      else tape += `<span class="cp-t" style="left:${left}%"></span>`;
    }
    this.$tape.innerHTML = tape;
    this.$cmarks = el('div', 'hud-compass-marks');
    this._cmPool = [];
    strip.append(this.$tape, this.$cmarks);
    const pointer = el('div', 'hud-compass-arrow', '<svg viewBox="0 0 20 20"><path d="M10 1 18 18 10 14 2 18z" fill="#ffc933" stroke="#1f2a44" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 1 18 18 10 14z" fill="#f0a91a"/></svg>');
    this.$compass.append(strip, pointer);
    this.$hint = el('div', 'hud-hint');
    this.$hint.setAttribute('role', 'status');
    this.$hint.hidden = true;
    tc.append(this.$compass, this.$hint);

    // ---------- top-right: minimap
    const tr = el('div', 'hud-tr');
    this.$minimap = el('div', 'hud-minimap');
    this.$minimap.setAttribute('aria-hidden', 'true');
    this.$mmCanvas = el('canvas', 'hud-minimap-canvas');
    this.$minimap.append(this.$mmCanvas, el('span', 'hud-minimap-n', 'N'));
    tr.append(this.$minimap);

    // ---------- center: crosshair, hit marker, eat ring, prompt
    const cc = el('div', 'hud-center');
    this.$cross = el('div', 'hud-cross', '<i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i><i class="dot"></i>');
    this.$hit = el('div', 'hud-hit', '<svg viewBox="0 0 40 40"><path d="M8 8l8 8M32 8l-8 8M8 32l8-8M32 32l-8-8" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>');
    this.$eat = el('div', 'hud-eat', `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg" pathLength="100"/></svg>`);
    this.$eat.hidden = true;
    this.$eatFg = this.$eat.querySelector('.fg');
    this.$prompt = el('div', 'hud-prompt brush');
    this.$prompt.setAttribute('role', 'status');
    this.$prompt.hidden = true;
    this.$threat = el('div', 'hud-threat brush');
    this.$threat.setAttribute('role', 'status');
    this.$threat.hidden = true;
    cc.append(this.$cross, this.$hit, this.$eat, this.$prompt, this.$threat);

    // ---------- bottom-left: key hints
    const bl = el('ul', 'hud-keys');
    bl.setAttribute('aria-label', 'Key hints');
    for (const [ic, key, label] of [['bag', 'Tab', 'Inventory'], ['map', 'M', 'Map'], ['give', 'G', 'Give fruit'], ['eat', 'F', 'Eat']]) {
      bl.insertAdjacentHTML('beforeend', `<li><span class="hud-keys-ic brush">${icon(ic)}</span><span class="hud-keys-lab brush"><kbd>${key}</kbd>${label}</span></li>`);
    }

    // ---------- bottom-center: carry info + hotbar
    const bc = el('div', 'hud-bc');
    this.$carry = el('div', 'hud-carry');
    this.$quiver = el('div', 'hud-pill hud-quiver brush');
    this.$fruitRow = el('div', 'hud-pill hud-fruitrow brush');
    this.$fruitRow.setAttribute('aria-label', 'Fruit carried');
    this.$loot = el('div', 'hud-pill hud-lootline brush');
    this.$loot.hidden = true;
    this.$carry.append(this.$quiver, this.$fruitRow, this.$loot);
    this.$hotbar = el('ol', 'hud-hotbar brush');
    this.$hotbar.setAttribute('aria-label', 'Equipment');
    this._slots = [];
    for (let i = 0; i < EQUIP.length; i++) {
      const li = el('li', 'hud-slot');
      li.innerHTML = `<span class="hud-slot-key">${i + 1}</span><span class="hud-slot-ic"></span><span class="hud-slot-count"></span>`;
      this.$hotbar.appendChild(li);
      this._slots.push({ li, ic: li.children[1], count: li.children[2], sig: '' });
    }
    bc.append(this.$carry, this.$hotbar);

    // ---------- bottom-right: team + toasts
    const br = el('div', 'hud-br');
    this.$team = el('ul', 'hud-team brush');
    this.$team.setAttribute('aria-label', 'Team');
    this.$team.hidden = true;
    this._teamRows = new Map();
    br.append(this.$team);
    this.$toasts = el('div', 'hud-toasts');
    this.$toasts.setAttribute('aria-live', 'polite');
    this.$toasts.setAttribute('role', 'log');

    // ---------- overlays
    this.$flash = el('div', 'hud-flash');
    this.$death = el('div', 'hud-death');
    this.$death.hidden = true;
    this.$death.setAttribute('role', 'alert');
    this.$death.innerHTML = `<div class="hud-death-card brush"><span class="hud-death-ic">${icon('skull')}</span><h2>You were defeated</h2><p class="hud-death-sub">Your carried loot is lost.</p><p class="hud-death-count"></p></div>`;
    this.$deathCount = this.$death.querySelector('.hud-death-count');
    this.$win = el('div', 'hud-win');
    this.$win.hidden = true;
    this.$win.setAttribute('role', 'alert');

    this.$invPanel = el('section', 'hud-panel hud-inv brush');
    this.$invPanel.setAttribute('aria-label', 'Inventory');
    this.$invPanel.hidden = true;
    this.$mapPanel = el('section', 'hud-panel hud-map brush');
    this.$mapPanel.setAttribute('aria-label', 'Island map');
    this.$mapPanel.hidden = true;
    this.$mapCanvas = el('canvas', 'hud-map-canvas');
    this.$mapPanel.innerHTML = `<header class="hud-panel-head"><h2>Island map</h2><span class="hud-panel-close"><kbd>M</kbd> Close</span></header>`;
    const mapWrap = el('div', 'hud-map-wrap');
    mapWrap.append(this.$mapCanvas, el('span', 'hud-map-n', 'N'));
    this.$mapPanel.append(mapWrap);
    this.$mapPanel.insertAdjacentHTML('beforeend', `<ul class="hud-map-legend">
      <li><i class="lg-you"></i>You</li><li><i class="lg-hut"></i>Hut</li><li><i class="lg-dino"></i>Spotted dinosaur</li>
      <li><i class="lg-track"></i>Tracks</li><li><i class="lg-obj"></i>Objective</li></ul>`);

    // mission board (opened with E at the signpost)
    this.$board = el('section', 'hud-panel hud-board brush');
    this.$board.setAttribute('aria-label', 'Mission board');
    this.$board.hidden = true;
    this._boardOpen = false;
    this._extras = new Map();
    this.$board.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-track]');
      if (!btn) return;
      const id = btn.dataset.track;
      this.trackedContract = this.trackedContract === id ? null : id;
      this._c.boardSig = null;
      this._renderBoard();
      this.onTrackContract?.(this.trackedContract);
    });

    // hover tooltip for inventory items
    this.$tip = el('div', 'hud-tip brush');
    this.$tip.setAttribute('role', 'tooltip');
    this.$tip.hidden = true;
    const showTip = (target, x, y) => {
      const info = target && ITEM_INFO[target.dataset.tip];
      if (!info) { this.$tip.hidden = true; return; }
      if (this.$tip.dataset.key !== target.dataset.tip) {
        this.$tip.dataset.key = target.dataset.tip;
        this.$tip.innerHTML = `<span class="hud-tip-head"><span class="hud-tip-ic">${icon(target.dataset.tip === 'bait' ? 'meat' : target.dataset.tip)}</span><b>${esc(info.name)}</b><em>${esc(info.kind)}</em></span>
          <span class="hud-tip-text">${esc(info.text)}</span>${info.use ? `<span class="hud-tip-use">${esc(info.use)}</span>` : ''}`;
      }
      this.$tip.hidden = false;
      // keep the tooltip on screen: flip left/up near the edges
      const w = this.$tip.offsetWidth, h = this.$tip.offsetHeight;
      const px = x + 18 + w > innerWidth ? x - w - 12 : x + 18;
      const py = y + 18 + h > innerHeight ? y - h - 12 : y + 18;
      this.$tip.style.transform = `translate(${px}px, ${py}px)`;
    };
    this.$invPanel.addEventListener('pointermove', (e) => showTip(e.target.closest('[data-tip]'), e.clientX, e.clientY));
    this.$invPanel.addEventListener('pointerleave', () => { this.$tip.hidden = true; });

    r.append(this.$flash, tl, tc, tr, cc, bl, bc, br, this.$toasts, this.$death, this.$win, this.$invPanel, this.$mapPanel, this.$board, this.$tip);

    // Canvas backing-store sizes follow their CSS size (no per-frame layout reads).
    this._mm = { w: 0, h: 0, dpr: 1 };
    this._bigMap = { w: 0, h: 0, dpr: 1 };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = e.contentRect;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const target = e.target === this.$mmCanvas ? this._mm : this._bigMap;
        target.w = Math.max(1, Math.round(box.width * dpr));
        target.h = Math.max(1, Math.round(box.height * dpr));
        target.dpr = dpr;
        e.target.width = target.w;
        e.target.height = target.h;
        if (e.target === this.$mmCanvas) this._drawMinimap();
        else this._drawBigMap();
      }
    });
    ro.observe(this.$mmCanvas);
    ro.observe(this.$mapCanvas);
    this._ro = ro;
    this._mmCtx = this.$mmCanvas.getContext('2d');
    this._bigCtx = this.$mapCanvas.getContext('2d');

    this.setCrosshair({});
    this.setInventory({ arrows: 0, maxArrows: CONFIG.weapons.bow.maxArrows, fruit: [], maxFruit: CONFIG.fruit.maxCarried, loot: {}, speedFactor: 1 });
  }

  // ================================================================ API
  /** Draw the minimap base once. */
  initMinimap(terrain, layout) {
    this._mapBase = buildMapBase(terrain, layout);
    this._drawMinimap();
    if (this._mapOpen) this._drawBigMap();
  }

  show(visible) { this.root.hidden = !visible; }

  setPlayer({ name, slot } = {}) {
    const key = `${name}|${slot}`;
    if (this._c.player === key) return;
    this._c.player = key;
    const s = slot | 0;
    this.$portrait.innerHTML = portraitSvg(CONFIG.playerColors[s] || CONFIG.playerColors[0], s);
    this.$portrait.title = name || '';
    this.$portrait.style.setProperty('--pc', CONFIG.playerColors[s] || '#fff');
  }

  setHealth(hp, max) { this._bar(this.$hp, 'hp', hp, max); }
  setStamina(value, max) { this._bar(this.$st, 'st', value, max); }

  _bar(b, key, v, max) {
    const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    const q = Math.round(f * 400) / 400;
    if (this._c[key] === q) return;
    const prev = this._c[key];
    this._c[key] = q;
    b.fill.style.transform = `scaleX(${q})`;
    const pct = Math.round(f * 100);
    if (this._c[key + 'pct'] !== pct) {
      this._c[key + 'pct'] = pct;
      b.meter.setAttribute('aria-valuenow', String(pct));
    }
    const low = f < 0.25;
    if (this._c[key + 'low'] !== low) {
      this._c[key + 'low'] = low;
      b.row.classList.toggle('is-low', low);
    }
    if (key === 'hp' && prev != null && q < prev - 0.001) {
      b.row.animate([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 260 });
    }
  }

  setMission(mission) {
    const sig = mission ? JSON.stringify(mission) : '';
    if (this._c.mission === sig) return;
    this._c.mission = sig;
    const m = this.$mission;
    if (!mission) { m.hidden = true; return; }
    m.hidden = false;
    m.classList.toggle('is-complete', !!mission.complete);
    const items = (mission.objectives || []).map((o) =>
      `<li class="${o.done ? 'is-done' : ''}"><span class="hud-check" aria-hidden="true">${o.done ? icon('check') : ''}</span><span>${esc(o.text)}</span><span class="sr">${o.done ? ' (done)' : ''}</span></li>`).join('');
    m.innerHTML = `<h2 class="hud-mission-title"><span class="hud-badge">${mission.complete ? icon('check') : '!'}</span>${esc(mission.title)}</h2><ul class="hud-mission-list">${items}</ul>`;
  }

  setCompass(yaw, markers) {
    const heading = ((-yaw * DEG) % 360 + 360) % 360;         // clockwise from north
    const h = Math.round(heading * 10) / 10;
    if (this._c.compass !== h) {
      this._c.compass = h;
      // tape covers -180..540 deg; strip shows COMPASS_SPAN deg = 1/4 of the tape
      const tx = ((h - COMPASS_SPAN / 2 + 180) / 720) * 100;
      this.$tape.style.transform = `translate3d(${-tx}%,0,0)`;
    }
    const list = markers || [];
    const pool = this._cmPool;
    let used = 0;
    for (const m of list) {
      const rel = wrapDeg(-m.bearing * DEG - heading);
      if (Math.abs(rel) > COMPASS_SPAN / 2 - 4) continue;
      let item = pool[used];
      if (!item) {
        const wrap = el('div', 'cp-mark');
        const inner = el('span', 'cp-mark-ic');
        wrap.appendChild(inner);
        this.$cmarks.appendChild(wrap);
        item = pool[used] = { wrap, inner, kind: '', color: '', x: NaN, shown: true };
      }
      const color = m.color || '';
      if (item.kind !== m.kind || item.color !== color) {
        item.kind = m.kind;
        item.color = color;
        item.wrap.dataset.kind = m.kind;
        item.inner.innerHTML = m.kind === 'hut' ? icon('home') : m.kind === 'boat' ? icon('boat') : m.kind === 'player' ? icon('person') : m.kind === 'dino' ? icon('track') : '';
        item.inner.style.color = color;
      }
      const x = Math.round((rel / COMPASS_SPAN) * 1000) / 10;
      if (item.x !== x) { item.x = x; item.wrap.style.transform = `translate3d(${x}%,0,0)`; }
      if (!item.shown) { item.shown = true; item.wrap.hidden = false; }
      used++;
    }
    for (let i = used; i < pool.length; i++) {
      if (pool[i].shown) { pool[i].shown = false; pool[i].wrap.hidden = true; }
    }
  }

  setMinimap(state) {
    this._mapState = state;
    this._drawMinimap();
    if (this._mapOpen) this._drawBigMap();
  }

  _drawMinimap() {
    const st = this._mapState;
    const { w, h, dpr } = this._mm;
    if (!w || this.root.hidden) return;
    drawMap(this._mmCtx, this._mapBase, st, {
      cx: st ? st.x : 0, cz: st ? st.z : 0, radius: MINIMAP_RADIUS, w, h, round: true, clampHut: true, scale: 6.5 * dpr * (w / dpr / 190),
    });
  }

  /** Map radius that fits the whole (oblong) island into a w x h view. */
  _fitRadius(size, w, h) {
    const isl = this._mapBase?.island;
    if (!isl) return size * 0.42;
    const pad = 1.15;
    // pxPerM = min(w, h) / (2 r): pick r so both island axes fit
    const rx = (isl.A * pad * Math.min(w, h)) / w;
    const rz = (isl.B * pad * Math.min(w, h)) / h;
    return Math.max(rx, rz, 60);
  }

  _drawBigMap() {
    const { w, h } = this._bigMap;
    if (!w || !this._mapOpen) return;
    const size = this._mapBase ? this._mapBase.size : CONFIG.world.size;
    drawMap(this._bigCtx, this._mapBase, this._mapState, {
      cx: 0, cz: 0, radius: this._fitRadius(size, w, h), w, h, round: false, clampHut: false, scale: Math.max(6, w / 90),
    });
  }

  setHotbar(slots, selected) {
    for (let i = 0; i < EQUIP.length; i++) {
      const s = slots && slots[i];
      const slot = this._slots[i];
      const sig = s ? `${s.id}|${s.label}|${s.count}|${s.enabled !== false}|${s.sub || ''}|${i === selected}` : `-|${i === selected}`;
      if (slot.sig === sig) continue;
      const prevId = slot.sig.split('|')[0];
      slot.sig = sig;
      const li = slot.li;
      li.classList.toggle('is-sel', i === selected);
      li.classList.toggle('is-off', !!s && s.enabled === false);
      li.classList.toggle('is-empty', !s);
      if (!s) { slot.ic.innerHTML = ''; slot.count.textContent = ''; li.removeAttribute('aria-label'); continue; }
      const icId = s.id === 'bait' ? 'meat' : s.id === 'fruit' ? (FRUIT_KEYS.includes(s.sub) ? s.sub : 'fruit') : s.id;
      const icKey = `${icId}`;
      if (slot.icKey !== icKey || prevId !== s.id) { slot.icKey = icKey; slot.ic.innerHTML = icon(icId); }
      slot.count.textContent = s.count == null ? '' : String(s.count);
      li.setAttribute('aria-label', `${i + 1}: ${s.label || s.id}${s.count != null ? `, ${s.count}` : ''}${i === selected ? ', selected' : ''}`);
      li.title = s.label || '';
    }
  }

  setInventory(inv) {
    if (!inv) return;
    this._inv = inv;
    // quiver
    const gunAmmo = inv.guns?.[inv.weapon];
    const q = gunAmmo ? `${inv.reloading ? 'Reloading - ' : ''}${gunAmmo.loaded}/${gunAmmo.reserve}` : `${inv.arrows ?? 0}/${inv.maxArrows ?? CONFIG.weapons.bow.maxArrows}`;
    if (this._c.quiver !== q) {
      this._c.quiver = q;
      this.$quiver.innerHTML = `<span class="hud-pill-ic">${icon(gunAmmo ? inv.weapon : 'quiver')}</span><span class="hud-pill-num">${q}</span><span class="sr">${gunAmmo ? ' rounds loaded / reserve' : ' arrows'}</span>`;
      this.$quiver.classList.toggle('is-empty', !(gunAmmo ? gunAmmo.loaded > 0 : inv.arrows > 0));
    }
    // fruit row
    const fruit = inv.fruit || [];
    const maxF = inv.maxFruit ?? CONFIG.fruit.maxCarried;
    const fs = `${fruit.join(',')}|${maxF}`;
    if (this._c.fruit !== fs) {
      this._c.fruit = fs;
      let html = '';
      for (let i = 0; i < maxF; i++) {
        const f = fruit[i];
        html += f ? `<span class="hud-fr" title="${esc(fruitName(f))}">${icon(FRUIT_KEYS.includes(f) ? f : 'fruit')}</span>` : '<span class="hud-fr is-empty"></span>';
      }
      html += `<span class="sr">${fruit.length} of ${maxF} fruit</span>`;
      this.$fruitRow.innerHTML = html;
    }
    // carried loot line
    const loot = inv.loot || {};
    const slowed = (inv.speedFactor ?? 1) < 0.95;
    const ls = LOOT_KEYS.map((k) => loot[k] || 0).join(',') + `|${slowed}`;
    if (this._c.loot !== ls) {
      this._c.loot = ls;
      const parts = LOOT_KEYS.filter((k) => loot[k] > 0)
        .map((k) => `<span class="hud-lt" title="${esc(lootName(k))}">${icon(k)}<b>${loot[k]}</b></span>`).join('');
      this.$loot.hidden = !parts;
      this.$loot.innerHTML = parts + (slowed ? `<span class="hud-slow">${icon('weight')}slowed</span>` : '');
    }
    this._invDirty = true;
    if (this._invOpen) this._renderInventory();
  }

  _renderInventory() {
    const inv = this._inv || {};
    this._invDirty = false;
    // Only rebuild when the contents change – rebuilding every frame would
    // break hover tooltips.
    const maxCarry = inv.maxCarry ?? CONFIG.player.maxCarryWeight;
    const sig = JSON.stringify([inv.guns, inv.reloading, inv.arrows, inv.maxArrows, inv.maxFruit, maxCarry, inv.traps, inv.baits, inv.fruit, inv.loot, inv.store, Math.round((inv.carryWeight || 0) * 10), Math.round((inv.speedFactor ?? 1) * 100)]);
    if (this._c.invSig === sig) return;
    this._c.invSig = sig;
    const cell = (ic, n, name, tip = ic) => `<li class="hud-cell${n ? '' : ' is-zero'}" data-tip="${tip}" tabindex="-1"><span class="hud-cell-ic">${icon(ic)}</span><span class="hud-cell-n">${n ?? ''}</span><span class="sr">${esc(name)}</span></li>`;
    const fruitCounts = {};
    for (const f of inv.fruit || []) fruitCounts[f] = (fruitCounts[f] || 0) + 1;
    const loot = inv.loot || {}, store = inv.store || {};
    const gear = [
      ...['pistol', 'rifle'].map(k => cell(k, `${inv.guns?.[k]?.loaded ?? 0}/${inv.guns?.[k]?.reserve ?? 0}`, k === 'pistol' ? 'Pistol' : 'Assault rifle')),
      cell('arrow', `${inv.arrows ?? 0}/${inv.maxArrows ?? CONFIG.weapons.bow.maxArrows}`, 'Arrows'),
      cell('trap', inv.traps ?? 0, 'Traps'),
      cell('meat', inv.baits ?? 0, 'Bait', 'bait'),
      ...FRUIT_KEYS.map((k) => cell(k, fruitCounts[k] || 0, fruitName(k))),
    ].join('');
    const carried = LOOT_KEYS.map((k) => cell(k, loot[k] || 0, lootName(k))).join('');
    const stored = LOOT_KEYS.map((k) => cell(k, store[k] || 0, lootName(k))).join('');
    const sf = inv.speedFactor ?? 1;
    const need = CONFIG.mission || {};
    this.$invPanel.innerHTML = `
      <header class="hud-panel-head"><h2>Inventory</h2><span class="hud-panel-close"><kbd>Tab</kbd> Close</span></header>
      <div class="hud-inv-body">
        <div>
          <h3>Gear &amp; fruit</h3><ul class="hud-grid">${gear}</ul>
          <h3>Carried loot</h3><ul class="hud-grid">${carried}</ul>
          <p class="hud-inv-stat">${icon('weight')} Load <b class="${(inv.carryWeight || 0) >= maxCarry ? 'is-slow' : ''}">${Math.round((inv.carryWeight || 0) * 10) / 10} / ${maxCarry}</b> · Speed <b class="${sf < 0.95 ? 'is-slow' : ''}">${Math.round(sf * 100)}%</b></p>
          <p class="hud-inv-note">Hover an item to see what it is for.</p>
        </div>
        <div class="hud-inv-store">
          <h3>${icon('home')} Hut store</h3><ul class="hud-grid">${stored}</ul>
          <p class="hud-inv-note">Mission needs ${need.requiredMeat ?? 3} meat and ${need.requiredHide ?? 1} hide in the store.</p>
        </div>
      </div>`;
  }

  setTeam(members) {
    const list = members || [];
    this.$team.hidden = list.length === 0;
    const ids = list.map((m) => m.id).join(',');
    if (this._c.teamIds !== ids) {
      this._c.teamIds = ids;
      this.$team.innerHTML = '';
      this._teamRows.clear();
      for (const m of list) {
        const li = el('li', 'hud-mate');
        li.innerHTML = `<span class="hud-mate-ic"></span><span class="hud-mate-name"></span><span class="hud-mate-bar"><span class="hud-mate-fill"></span></span>`;
        this.$team.appendChild(li);
        this._teamRows.set(m.id, { li, ic: li.children[0], name: li.children[1], fill: li.children[2].firstChild, sig: '', hp: -1 });
      }
    }
    const max = CONFIG.player.maxHealth;
    for (const m of list) {
      const row = this._teamRows.get(m.id);
      const sig = `${m.name}|${m.slot}|${m.alive}|${m.isYou}`;
      if (row.sig !== sig) {
        row.sig = sig;
        row.li.classList.toggle('is-dead', !m.alive);
        row.li.classList.toggle('is-you', !!m.isYou);
        row.ic.innerHTML = m.alive ? icon('person') : icon('skull');
        row.ic.style.color = CONFIG.playerColors[m.slot] || '#fff';
        row.name.textContent = m.name + (m.isYou ? ' (you)' : '');
        row.li.setAttribute('aria-label', `${m.name}${m.isYou ? ' (you)' : ''}${m.alive ? '' : ', defeated'}`);
      }
      const f = m.alive ? Math.max(0, Math.min(1, m.hp / max)) : 0;
      const q = Math.round(f * 200) / 200;
      if (row.hp !== q) { row.hp = q; row.fill.style.transform = `scaleX(${q})`; }
    }
  }

  prompt(text, key = 'E') {
    const sig = text == null ? null : `${key}|${text}`;
    if (this._c.prompt === sig) return;
    this._c.prompt = sig;
    if (sig == null) { this.$prompt.hidden = true; return; }
    this.$prompt.hidden = false;
    this.$prompt.innerHTML = `<kbd>${esc(key)}</kbd><span>${esc(text)}</span>`;
  }

  toast(text, iconId = 'info') {
    // "Meat +1" toasts from auto-looting merge into one counting toast ("Meat +4")
    const gain = /^(.+) \+(\d+)$/.exec(text);
    if (gain) {
      const prev = [...this.$toasts.children].find((c) => c.dataset.gain === gain[1] && !c.classList.contains('is-out'));
      if (prev) {
        prev.dataset.n = String(Number(prev.dataset.n) + Number(gain[2]));
        prev.querySelector('.hud-toast-t').textContent = `${gain[1]} +${prev.dataset.n}`;
        this._scheduleToastOut(prev, 3000);
        prev.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 160 });
        return;
      }
    }
    const t = el('div', 'hud-toast brush');
    t.innerHTML = `<span class="hud-toast-ic">${icon(iconId)}</span><span class="hud-toast-t">${esc(text)}</span>`;
    if (gain) { t.dataset.gain = gain[1]; t.dataset.n = gain[2]; }
    this._pushToast(t, 3000);
  }

  /** Add a toast; when there are too many, drop the oldest normal toast (alerts stay). */
  _pushToast(t, ms) {
    this.$toasts.appendChild(t);
    const all = [...this.$toasts.children];
    let extra = all.length - 4;
    for (const c of all) {
      if (extra <= 0) break;
      if (c !== t && !c.classList.contains('hud-alert')) { c.remove(); extra--; }
    }
    this._scheduleToastOut(t, ms);
  }

  _scheduleToastOut(t, ms) {
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 320);
    }, ms);
  }

  /** Tracking hint. The bubble is built once; a changing distance only updates the number. */
  hint(text, meters = null) {
    if (text == null) {
      if (this._c.hintText !== null) { this._c.hintText = null; this.$hint.hidden = true; }
      return;
    }
    if (!this._hintEls) {
      this.$hint.innerHTML = `<span class="hud-hint-bubble brush"><span class="hud-hint-ic">${icon('track')}</span><span class="hud-hint-t"></span><b class="hud-hint-m"></b></span>`;
      this._hintEls = { text: this.$hint.querySelector('.hud-hint-t'), m: this.$hint.querySelector('.hud-hint-m') };
    }
    if (this._c.hintText !== text) {
      this._c.hintText = text;
      this._hintEls.text.textContent = text;
    }
    const m = meters == null ? '' : `${Math.round(meters)} m`;
    if (this._c.hintM !== m) {
      this._c.hintM = m;
      this._hintEls.m.textContent = m;
      this._hintEls.m.hidden = !m;
    }
    if (this.$hint.hidden) this.$hint.hidden = false;
  }

  setCrosshair({ draw = 0, mode = 'default' } = {}) {
    const d = Math.round(Math.max(0, Math.min(1, draw)) * 50) / 50;
    if (this._c.xmode !== mode) {
      this._c.xmode = mode;
      this.$cross.hidden = mode === 'none';
      this.$cross.dataset.mode = mode;
    }
    if (this._c.xdraw !== d) {
      this._c.xdraw = d;
      this.$cross.style.setProperty('--spread', String(1 - d * 0.7));
      this.$cross.classList.toggle('is-drawn', d >= 0.98);
    }
  }

  hitMarker(weak = false) {
    this.$hit.classList.toggle('is-weak', !!weak);
    this.$hit.getAnimations().forEach((a) => a.cancel());
    this.$hit.animate([
      { opacity: 1, transform: `translate(-50%,-50%) scale(${weak ? 1.25 : 0.9}) rotate(0deg)` },
      { opacity: 1, transform: `translate(-50%,-50%) scale(${weak ? 1.45 : 1}) rotate(0deg)`, offset: 0.25 },
      { opacity: 0, transform: `translate(-50%,-50%) scale(${weak ? 1.6 : 1.1}) rotate(0deg)` },
    ], { duration: weak ? 380 : 260, easing: 'ease-out' });
  }

  damageFlash(amount) {
    const a = Math.max(0.25, Math.min(1, (amount || 0) / 35));
    this.$flash.getAnimations().forEach((x) => x.cancel());
    this.$flash.animate([{ opacity: a }, { opacity: 0 }], { duration: 350 + a * 450, easing: 'ease-out' });
  }

  damageSource(text) {
    clearTimeout(this._threatTimer);
    this.$threat.textContent = text;
    this.$threat.hidden = false;
    this.$threat.getAnimations().forEach((a) => a.cancel());
    this.$threat.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(0.4em)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
    ], { duration: 180, easing: 'ease-out' });
    this._threatTimer = setTimeout(() => { this.$threat.hidden = true; }, 2200);
  }

  setDeath(visible, seconds = 0) {
    const s = visible ? Math.max(0, Math.ceil(seconds)) : -1;
    if (this._c.death === s) return;
    this._c.death = s;
    this.$death.hidden = !visible;
    if (visible) this.$deathCount.textContent = s > 0 ? `Respawning at the hut in ${s}…` : 'Respawning…';
  }

  missionComplete(visible, info = {}) {
    if (!visible) { this.$win.hidden = true; this._c.win = null; return; }
    const sig = JSON.stringify(info || {});
    if (this._c.win === sig && !this.$win.hidden) return;
    this._c.win = sig;
    this.$win.innerHTML = info.won
      ? `<div class="hud-win-card brush">
      <span class="hud-win-ic">${icon('trophy')}</span>
      <h2>You escaped Dinosaur Island!</h2>
      <p>The boat is repaired and the whole team is aboard. Thanks for playing!</p>
      ${info.completedIn != null ? `<p class="hud-win-time">${icon('clock')} ${fmtTime(info.completedIn)} on the last island</p>` : ''}
      <p>A new adventure starts on a fresh first island in a moment…</p>
    </div>`
      : `<div class="hud-win-card brush">
      <span class="hud-win-ic">${icon('boat')}</span>
      <h2>Island complete!</h2>
      <p>All aboard – sailing to island ${esc(info.next ?? '')}…</p>
      ${info.completedIn != null ? `<p class="hud-win-time">${icon('clock')} ${fmtTime(info.completedIn)}</p>` : ''}
    </div>`;
    this.$win.hidden = false;
  }

  eatProgress(progress) {
    const p = progress == null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
    if (this._c.eat === p) return;
    this._c.eat = p;
    this.$eat.hidden = p == null;
    if (p != null) this.$eatFg.style.strokeDashoffset = String(100 - p);
  }

  /** Prominent warning (e.g. inventory full): red-rimmed toast that also pulses the load pill. */
  alert(text, iconId = 'weight') {
    const t = el('div', 'hud-toast hud-alert brush');
    t.setAttribute('role', 'alert');
    t.innerHTML = `<span class="hud-toast-ic">${icon(iconId)}</span><span class="hud-toast-t">${esc(text)}</span>`;
    this._pushToast(t, 3600);
    this.$carry.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-0.4em)' }, { transform: 'translateX(0.4em)' }, { transform: 'translateX(0)' }], { duration: 300, iterations: 2 });
  }

  _closePanels(except) {
    if (except !== 'inv' && this._invOpen) { this._invOpen = false; this.$invPanel.hidden = true; }
    if (except !== 'map' && this._mapOpen) { this._mapOpen = false; this.$mapPanel.hidden = true; }
    if (except !== 'board' && this._boardOpen) { this._boardOpen = false; this.$board.hidden = true; }
    for (const [name, p] of this._extras) if (except !== name && p.open) this._setExtra(p, false);
    this.$tip.hidden = true;
  }

  toggleInventory(force) {
    const open = force === undefined ? !this._invOpen : !!force;
    this._closePanels(open ? 'inv' : null);
    this._invOpen = open;
    if (open) this._renderInventory();
    this.$invPanel.hidden = !open;
    this.root.classList.toggle('has-panel', this.isPanelOpen());
    return open;
  }

  toggleMap(force) {
    const open = force === undefined ? !this._mapOpen : !!force;
    this._closePanels(open ? 'map' : null);
    this._mapOpen = open;
    this.$mapPanel.hidden = !open;
    this.root.classList.toggle('has-panel', this.isPanelOpen());
    if (open) this._drawBigMap();
    return open;
  }

  /** Mission board data (the full mission state from the server). */
  setBoard(mission) {
    this._boardMission = mission;
    if (this._boardOpen) this._renderBoard();
  }

  toggleBoard(force) {
    const open = force === undefined ? !this._boardOpen : !!force;
    this._closePanels(open ? 'board' : null);
    this._boardOpen = open;
    if (open) { this._c.boardSig = null; this._renderBoard(); }
    this.$board.hidden = !open;
    this.root.classList.toggle('has-panel', this.isPanelOpen());
    return open;
  }

  _renderBoard() {
    const m = this._boardMission;
    if (!m) return;
    const sig = JSON.stringify([m.step, m.objectives, m.relics, m.contracts, m.expeditionsDone, this.trackedContract]);
    if (this._c.boardSig === sig) return;
    this._c.boardSig = sig;
    const contracts = m.contracts || [];
    const defs = BOARD_CONTRACTS;
    const pin = (c) => `<i class="board-pin" style="--pin:${c}"></i>`;
    const bar = (p, goal) => `<span class="board-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${p}"><i style="width:${Math.round((p / goal) * 100)}%"></i></span>`;

    // --- main quest: the boat parts of this island
    const relics = m.relics || [];
    const found = relics.filter((r) => r.found).length;
    const steps = (m.objectives || []).filter((o) => !o.relic);
    const parts = relics.map((r) => {
      const def = RELICS[r.kind];
      return `<li class="board-part${r.found ? ' is-found' : ''}" style="--c:${def.color}">
        <span class="board-part-ic">${icon(r.kind)}</span>
        <span class="board-part-txt"><b>${esc(def.name)}</b><small>${r.found ? `Found${r.by ? ` by ${esc(r.by)}` : ''}` : esc(def.hint)}</small></span>
        <span class="board-part-state">${r.found ? icon('check') : '?'}</span>
      </li>`;
    }).join('');
    const quest = `
      <article class="board-note board-quest">
        ${pin('#ee4d5f')}
        <div class="board-quest-top">
          <div>
            <p class="board-kicker">Main quest${m.level ? ` · Island ${m.level.number}: ${esc(m.level.name)}` : ''}</p>
            <h3>${icon('boat')} ${m.complete ? 'All aboard – next island!' : 'Repair the boat and sail on'}</h3>
            <p>Find the ${relics.length} boat parts hidden on this island, fix the wreck on the east beach and set sail together.</p>
          </div>
          <div class="board-quest-score">${bar(found, Math.max(1, relics.length))}<b>${found}/${relics.length} parts</b></div>
        </div>
        <ul class="board-parts">${parts}</ul>
        <ul class="board-checks board-steps">
          ${steps.map((o) => `<li class="${o.done ? 'is-done' : ''}"><span class="board-box">${o.done ? icon('check') : ''}</span>${esc(o.text)}</li>`).join('')}
        </ul>
        <p class="board-foot">${icon('trophy')} Islands completed: <b>${m.expeditionsDone ?? 0}</b></p>
      </article>`;

    // --- contracts: active on the left, done on the right
    const active = [], done = [];
    defs.forEach((d, i) => {
      const c = contracts[i] || { progress: 0, done: false };
      (c.done ? done : active).push({ d, c, i });
    });
    const activeCards = active.map(({ d, c, i }) => {
      const tracked = this.trackedContract === d.id;
      const tilt = ((i * 37) % 5 - 2) * 0.5;
      return `
      <article class="board-note board-card${tracked ? ' is-tracked' : ''}" style="--tilt:${tilt}deg">
        ${pin(['#3fb3ff', '#7ccb45', '#ffc933', '#ff9a2e'][i % 4])}
        <header><span class="board-ic">${icon(d.icon)}</span><h4>${esc(d.title)}</h4></header>
        <p>${esc(d.text)}</p>
        <div class="board-progress">${bar(c.progress, d.goal)}<b>${c.progress}/${d.goal}</b></div>
        <p class="board-reward">${icon('trophy')} ${esc(d.reward.text)}</p>
        <button type="button" class="board-track" data-track="${d.id}" aria-pressed="${tracked}">${tracked ? 'Tracking' : 'Track'}</button>
      </article>`;
    }).join('');
    const doneCards = done.map(({ d }) => `
      <article class="board-note board-done">
        <span class="board-ic">${icon(d.icon)}</span>
        <div><h4>${esc(d.title)}</h4><p class="board-reward">${icon('trophy')} ${esc(d.reward.text)}</p></div>
        <span class="board-stamp">Done</span>
      </article>`).join('');

    this.$board.innerHTML = `
      <header class="board-head">
        <h2>${icon('quest')} Mission Board</h2>
        <p>Team contracts · rewards upgrade the whole team</p>
        <span class="hud-panel-close"><kbd>E</kbd> / <kbd>Esc</kbd> Close</span>
      </header>
      ${quest}
      <div class="board-cols">
        <section class="board-col" aria-label="Active tasks">
          <h3 class="board-col-title">Active tasks <b>${active.length}</b></h3>
          <div class="board-grid">${activeCards || '<p class="board-empty">Every contract is done – great work!</p>'}</div>
        </section>
        <section class="board-col board-col-done" aria-label="Done tasks">
          <h3 class="board-col-title">Done <b>${done.length}</b></h3>
          <div class="board-done-list">${doneCards || '<p class="board-empty">Nothing finished yet. Complete contracts to earn team upgrades.</p>'}</div>
        </section>
      </div>`;
  }

  /** Register a panel owned by another module (e.g. the wardrobe): { el, onOpen?, onClose? }. */
  addPanel(name, panel) {
    const p = { ...panel, open: false };
    panel.el.hidden = true;
    this._extras.set(name, p);
    this.root.append(panel.el);
  }

  togglePanel(name, force) {
    const p = this._extras.get(name);
    const open = force === undefined ? !p.open : !!force;
    this._closePanels(open ? name : null);
    this._setExtra(p, open);
    this.root.classList.toggle('has-panel', this.isPanelOpen());
    return open;
  }

  isExtraOpen(name) { return !!this._extras.get(name)?.open; }

  _setExtra(p, open) {
    if (p.open === open) return;
    p.open = open;
    p.el.hidden = !open;
    if (open) p.onOpen?.(); else p.onClose?.();
  }

  isPanelOpen() {
    if (this._invOpen || this._mapOpen || this._boardOpen) return true;
    for (const p of this._extras.values()) if (p.open) return true;
    return false;
  }
}
