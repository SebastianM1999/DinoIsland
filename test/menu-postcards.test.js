import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/shared/levels.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// ---------------------------------------------------------------- slideshow behaviour (fake DOM, fake clock)

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle(name, enabled) { if (enabled) values.add(name); else values.delete(name); },
    contains: name => values.has(name),
    get list() { return [...values]; },
  };
}

/** A slideshow on fake layers; `decodes` records every decode so a test can hold, release or fail it. */
async function studio(t, { reduced = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const saved = ['Image', 'document', 'matchMedia'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const decodes = [], notices = [], listeners = new Map();
  const make = () => ({ src: '', classList: classList(),
    decode() { return new Promise((resolve, reject) => decodes.push({ src: this.src, layer: this, resolve, reject })); } });
  const layers = [make(), make()];
  const root = { classList: classList(), querySelectorAll: () => layers };
  const on = (type, fn) => listeners.set(type + fn.name, [type, fn]);
  const off = (type, fn) => listeners.delete(type + fn.name);
  const media = { matches: reduced, listeners: new Set(),
    addEventListener(type, fn) { this.listeners.add(fn); }, removeEventListener(type, fn) { this.listeners.delete(fn); } };
  globalThis.document = { hidden: false, addEventListener: on, removeEventListener: off };
  globalThis.matchMedia = () => media;
  globalThis.Image = class { decode() { return Promise.resolve(); } };
  const { createMenuPostcards, SHOT_MS, FADE_MS, MOTION_VARIANTS } = await import('../src/client/ui/menuPostcards.js');
  const api = await createMenuPostcards(root, info => notices.push(info));
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  // resolve every pending layer decode until quiet
  const flush = async () => {
    for (let guard = 0; guard < 40; guard++) {
      await settle();
      const pending = decodes.splice(0);
      if (!pending.length) return;
      pending.forEach(item => item.resolve());
    }
  };
  const front = () => layers.filter(layer => layer.classList.contains('is-front'));
  t.after(() => {
    api.dispose();
    for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  });
  return { api, layers, root, decodes, notices, listeners, media, flush, settle, front, shown: () => front()[0]?.src,
    SHOT_MS, FADE_MS, MOTION_VARIANTS, tick: async (ms) => { t.mock.timers.tick(ms); await settle(); } };
}

const shotNumber = (src) => Number(/island-\d+-(\d+)\./.exec(src)[1]);
const islandNumber = (src) => Number(/island-(\d+)-/.exec(src)[1]);

test('the first photograph appears as soon as it decodes and the rest of the island follows', async t => {
  const s = await studio(t);
  assert.equal(s.root.classList.contains('has-preview'), false);
  assert.ok(s.decodes.some(item => item.src.includes('island-1-1.')), 'the first shot decodes on a layer');
  await s.flush();
  assert.equal(s.root.classList.contains('has-preview'), true);
  assert.equal(s.front().length, 1);
  assert.equal(islandNumber(s.shown()), 1);
  assert.equal(shotNumber(s.shown()), 1);
  assert.equal(s.notices.at(-1).loading, false);
  assert.equal(s.notices.at(-1).available, true);
});

test('shots cycle through the whole island on alternating layers and wrap around', async t => {
  const s = await studio(t);
  await s.flush();
  const seen = [shotNumber(s.shown())];
  const frontLayers = [s.front()[0]];
  for (let i = 0; i < 6; i++) {
    await s.tick(s.SHOT_MS);
    await s.flush();
    seen.push(shotNumber(s.shown()));
    frontLayers.push(s.front()[0]);
    assert.equal(s.front().length, 1, 'exactly one layer is in front after each swap');
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 1, 2], 'every shot of the island in order, then around again');
  assert.ok(frontLayers.every((layer, i) => i === 0 || layer !== frontLayers[i - 1]), 'the two layers alternate');
});

test('the next photograph is decoded on the hidden layer before it fades in', async t => {
  const s = await studio(t);
  await s.flush();
  const before = s.front()[0];
  await s.tick(s.SHOT_MS);
  // The decode of shot 2 is still pending: nothing may have faded yet.
  assert.equal(s.front()[0], before);
  assert.equal(shotNumber(before.src), 1);
  const pending = s.decodes.find(item => shotNumber(item.src) === 2);
  assert.ok(pending && pending.layer !== before, 'decoding happens on the layer that is not showing');
  pending.resolve();
  await s.settle();
  assert.equal(shotNumber(s.shown()), 2);
  assert.ok(before.classList.contains('is-leaving'), 'the old layer keeps animating while it fades out');
  await s.tick(s.FADE_MS + 300);
  assert.equal(before.classList.contains('is-leaving'), false, 'and is released after the crossfade');
  assert.equal(before.classList.list.some(name => name.startsWith('kb-')), false);
});

test('a broken photograph is skipped without blanking the screen', async t => {
  const s = await studio(t);
  await s.flush();
  await s.tick(s.SHOT_MS);
  s.decodes.find(item => shotNumber(item.src) === 2).reject(new Error('decode failed'));
  await s.settle();
  assert.equal(shotNumber(s.shown()), 1, 'the previous photograph stays');
  await s.tick(s.SHOT_MS);
  await s.flush();
  assert.equal(shotNumber(s.shown()), 3, 'the next shot carries on');
});

test('each shot gets another Ken Burns variant', async t => {
  const s = await studio(t);
  await s.flush();
  const kb = () => s.front()[0].classList.list.find(name => name.startsWith('kb-'));
  const variants = [kb()];
  for (let i = 1; i < s.MOTION_VARIANTS * 2; i++) { await s.tick(s.SHOT_MS); await s.flush(); variants.push(kb()); }
  assert.equal(new Set(variants).size, s.MOTION_VARIANTS);
  assert.ok(variants.every((name, i) => i === 0 || name !== variants[i - 1]), 'never the same motion twice in a row');
  for (const name of variants) assert.match(read('css/menu.css'), new RegExp(`\\.menu-preview-image\\.${name}\\b`));
});

test('selecting another island crossfades to its first shot and stale selections are ignored', async t => {
  const s = await studio(t);
  await s.flush();
  const jump = s.api.setIsland(1);
  const stale = s.api.setIsland(2);
  await s.flush();
  await Promise.all([jump, stale]);
  assert.equal(islandNumber(s.shown()), 3, 'the latest selection wins');
  assert.equal(shotNumber(s.shown()), 1);
  assert.equal(s.notices.at(-1).index, 2);
  await s.tick(s.SHOT_MS);
  await s.flush();
  assert.equal(islandNumber(s.shown()), 3, 'cycling continues inside the selected island only');
  assert.equal(shotNumber(s.shown()), 2);
  const wrapped = s.api.setIsland(LEVELS.length + 1);   // indices wrap
  await s.flush(); await wrapped;
  assert.equal(islandNumber(s.shown()), 2);
});

test('every island is selectable, including the Hollow Mountain', async t => {
  const s = await studio(t);
  for (let index = 0; index < LEVELS.length; index++) {
    const selected = s.api.setIsland(index);
    await s.flush(); await selected;
    assert.equal(islandNumber(s.shown()), index + 1);
    assert.equal(s.notices.at(-1).available, true);
  }
});

test('reduced motion shows a still photograph: no cycling, island switches still work', async t => {
  const s = await studio(t, { reduced: true });
  await s.flush();
  assert.equal(s.api.motionEnabled, false);
  assert.equal(s.root.classList.contains('is-still'), true);
  const first = s.shown();
  await s.tick(s.SHOT_MS * 5);
  await s.flush();
  assert.equal(s.shown(), first);
  const next = s.api.setIsland(1);
  await s.flush(); await next;
  assert.equal(islandNumber(s.shown()), 2);
  // The preference can change while the menu is open.
  s.media.matches = false;
  s.media.listeners.forEach(fn => fn());
  assert.equal(s.api.motionEnabled, true);
  assert.equal(s.root.classList.contains('is-still'), false);
  await s.tick(s.SHOT_MS);
  await s.flush();
  assert.equal(shotNumber(s.shown()), 2);
  assert.match(read('css/menu.css'), /prefers-reduced-motion: reduce\) \{ \.menu-preview-image \{ animation: none/);
});

test('dialogs and a hidden tab pause the slideshow and the remaining time carries over', async t => {
  const s = await studio(t);
  await s.flush();
  await s.tick(s.SHOT_MS - 2000);
  s.api.setSuspended(true);
  assert.equal(s.root.classList.contains('is-still'), true, 'CSS motion pauses with the timer');
  await s.tick(s.SHOT_MS * 3);
  await s.flush();
  assert.equal(shotNumber(s.shown()), 1, 'nothing advances while a dialog is open');
  s.api.setSuspended(false);
  assert.equal(s.root.classList.contains('is-still'), false);
  await s.tick(1900);
  await s.flush();
  assert.equal(shotNumber(s.shown()), 1, 'only the time that was left (2 s) counts, not a fresh interval');
  await s.tick(200);
  await s.flush();
  assert.equal(shotNumber(s.shown()), 2);
  // hidden tab
  const visibility = [...s.listeners.values()].find(([type]) => type === 'visibilitychange')[1];
  document.hidden = true; visibility();
  assert.equal(s.root.classList.contains('is-still'), true);
  await s.tick(s.SHOT_MS * 2); await s.flush();
  assert.equal(shotNumber(s.shown()), 2);
  document.hidden = false; visibility();
  await s.tick(s.SHOT_MS); await s.flush();
  assert.equal(shotNumber(s.shown()), 3);
});

test('disposing stops timers and listeners, and a late decode cannot repaint', async t => {
  const s = await studio(t);
  const late = s.api.setIsland(1);
  s.api.dispose();
  const noticeCount = s.notices.length;
  assert.equal(s.listeners.size, 0);
  assert.equal(s.media.listeners.size, 0);
  await s.flush(); await late;
  await s.tick(s.SHOT_MS * 3);
  assert.equal(s.notices.length, noticeCount);
  assert.equal(s.front().some(layer => islandNumber(layer.src) === 2), false);
});

// ---------------------------------------------------------------- the menu never builds the island

test('the normal menu path creates no WebGL renderer and loads no map models', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/client/ui/menuTour.js')), false, 'the live tour is gone');
  const main = read('src/client/main.js');
  assert.doesNotMatch(main, /menuTour|createMenuTour|WebGLRenderer|has-live-tour/);
  assert.match(main, /import\('\.\/ui\/menuPostcards\.js'\)/);
  // main.js reaches the photo studio only behind the developer query, via a dynamic import.
  assert.equal([...main.matchAll(/menuPreviewCapture/g)].length, 1);
  assert.match(main, /if \(DEBUG_QUERY\.has\('capturePreviews'\)\) void import\('\.\/ui\/menuPreviewCapture\.js'\)/);
  const html = read('index.html');
  assert.doesNotMatch(html, /menu-tour/);
  assert.equal([...html.matchAll(/class="menu-preview-image"/g)].length, 2, 'two stacked layers');
  assert.doesNotMatch(read('css/menu.css'), /menu-tour|has-live-tour/);
});

test('the slideshow module graph holds no Three.js, world builder or sim code', () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of read(file).matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      assert.doesNotMatch(match[1], /^three(\/|$)/, `${file} must not import three`);
      if (match[1].startsWith('.')) walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
    }
  };
  walk('src/client/ui/menuPostcards.js');
  walk('src/client/ui/mapPreviews.js');
  for (const file of seen) assert.doesNotMatch(file, /world\/|sim\/|models\/|core\/game/, `${file} is not a menu dependency`);
});

test('the photographs cover the screen and stay compositor-only', () => {
  const css = read('css/menu.css').replace(/\r\n/g, '\n');
  assert.match(css, /#menu-preview \{ position: fixed; inset: 0; width: 100%; height: 100%; \}/);
  assert.match(css, /\.menu-preview-image \{[^}]*object-fit: cover/);
  assert.match(css, /\.menu-preview-image \{[^}]*inset: 0; width: 100%; height: 100%/);
  for (const name of ['kb-0', 'kb-1', 'kb-2', 'kb-3']) {
    const body = new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`).exec(css)?.[1] ?? '';
    assert.match(body, /transform: translate3d\(.*scale\(/, `${name} animates transform only`);
    assert.doesNotMatch(body, /\btop\b|\bleft\b|width|height|margin/);
    // never pan past the scaled layer: |translate| <= (scale - 1) / 2 at both ends
    const stops = [...body.matchAll(/translate3d\(([-\d.]+)%, ([-\d.]+)%, 0\) scale\(([\d.]+)\)/g)];
    assert.equal(stops.length, 2, `${name} has a start and an end`);
    for (const [, x, y, scale] of stops) {
      const limit = (Number(scale) - 1) / 2 * 100;
      assert.ok(Math.abs(Number(x)) <= limit && Math.abs(Number(y)) <= limit, `${name}: ${x}%, ${y}% exceeds ${limit}% at scale ${scale}`);
    }
  }
});

test('every island has at least four photographs on disk, in the committed count', async () => {
  const { PREVIEW_SHOT_COUNTS, previewURLs } = await import('../src/client/ui/mapPreviews.js');
  const files = fs.readdirSync(path.join(root, 'assets/previews'));
  assert.equal(PREVIEW_SHOT_COUNTS.length, LEVELS.length);
  LEVELS.forEach((level, index) => {
    assert.ok(PREVIEW_SHOT_COUNTS[index] >= 4, `${level.name} has at least four shots`);
    const wanted = Array.from({ length: PREVIEW_SHOT_COUNTS[index] }, (_, k) => `island-${index + 1}-${k + 1}.webp`);
    for (const file of wanted) assert.ok(files.includes(file), `${file} exists`);
    const extra = files.filter(file => file.startsWith(`island-${index + 1}-`) && !wanted.includes(file));
    assert.deepEqual(extra, [], 'no unreferenced photographs');
    assert.equal(previewURLs(index).length, wanted.length);
  });
  assert.deepEqual(files.filter(file => /\.jpe?g$/.test(file)), [], 'the old low-resolution JPEGs are gone');
});

test('photographs are 16:9, sharp enough for an ultrawide and within the size budget', () => {
  let bytes = 0;
  for (const file of fs.readdirSync(path.join(root, 'assets/previews')).filter(name => name.endsWith('.webp'))) {
    const data = fs.readFileSync(path.join(root, 'assets/previews', file));
    bytes += data.length;
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    const chunk = data.toString('ascii', 12, 16);
    let width, height;
    if (chunk === 'VP8 ') { width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff; }
    else if (chunk === 'VP8L') { const bits = data.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1; }
    else if (chunk === 'VP8X') { width = data.readUIntLE(24, 3) + 1; height = data.readUIntLE(27, 3) + 1; }
    assert.equal(width, 2560, `${file} width`);
    assert.equal(height, 1440, `${file} height`);
  }
  assert.ok(bytes <= 6 * 1048576, `all photographs together are ${(bytes / 1048576).toFixed(1)} MB`);
});
