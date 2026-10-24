import test from 'node:test';
import assert from 'node:assert/strict';
import { initDialogOrnaments, ornamentRect, ORNAMENT_Z } from '../src/client/ui/dialogOrnaments.js';
import { vineSvg } from '../src/client/ui/dialogVines.js';

test('dialog foliage straddles the measured viewport border by 22 pixels', () => {
  assert.deepEqual(ornamentRect({ left: 80, top: 40, width: 720, height: 600 }),
    { left: 58, top: 18, width: 764, height: 644 });
});

test('ornaments follow visible dialogs, respect modal layers and stop observing removed panels', () => {
  let queued, mutation, resized, disconnected = 0, reads = 0;
  const observed = new Set(), overlays = [], listeners = new Map();
  const makePanel = (layer) => ({
    parentElement: null, hidden: false, layer, matches: selector => selector.startsWith('.home-panel'),
    closest(selector) { return selector.startsWith('[hidden]') && this.hidden ? this : null; },
    getClientRects() { return this.hidden ? [] : [{}]; },
    getBoundingClientRect() { reads++; return { left: 100, top: 50, width: 400, height: 300 }; },
    getAnimations: () => [],
  });
  const inventory = makePanel(2), settings = makePanel(60);
  let panels = [inventory, settings];
  const doc = {
    body: { append(element) { overlays.push(element); } },
    querySelectorAll: () => panels,
    createElement: () => ({ style: {}, setAttribute() {}, remove() { this.removed = true; } }),
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: event => listeners.delete(event),
  };
  const win = {
    requestAnimationFrame(fn) { assert.equal(queued, undefined); queued = fn; return 1; },
    cancelAnimationFrame() { queued = undefined; },
    getComputedStyle: panel => ({ zIndex: String(panel.layer), visibility: 'visible' }),
    addEventListener() {}, removeEventListener() {},
    ResizeObserver: class {
      constructor(callback) { resized = callback; }
      observe(panel) { observed.add(panel); }
      unobserve(panel) { observed.delete(panel); }
      disconnect() { disconnected++; observed.clear(); }
    },
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe() {}
      disconnect() { disconnected++; }
    },
  };
  const flush = () => { const fn = queued; queued = undefined; fn(); };
  let draws = 0;
  const dispose = initDialogOrnaments({ doc, win, random: () => (++draws * 0.3719) % 1 });
  flush();
  assert.equal(overlays[0].hidden, true, 'inventory foliage stays behind the settings modal');
  assert.equal(overlays[1].hidden, false);
  assert.equal(overlays[1].style.left, '78px');
  assert.equal(overlays[1].style.zIndex, String(ORNAMENT_Z), 'foliage sits above every other page layer');
  assert.match(overlays[1].innerHTML, /^<svg [^>]*width="444" height="344"/);
  const firstVines = overlays[1].innerHTML;
  assert.equal(overlays[1].inert, true);
  const idleReads = reads;
  assert.equal(queued, undefined, 'there is no continuous animation/layout loop');
  mutation([{ type: 'attributes', target: { matches: () => false, querySelector: () => null } }]);
  assert.equal(queued, undefined, 'ordinary HUD visibility writes never trigger layout reads');
  assert.equal(reads, idleReads);

  settings.hidden = true;
  mutation([{ type: 'attributes', target: settings }]);
  assert.equal(typeof queued, 'function', 'closing the modal schedules the underlying frame');
  resized(); // Both events coalesce into one layout batch.
  flush();
  assert.equal(overlays[0].hidden, false);
  assert.equal(overlays[1].hidden, true);
  assert.equal(overlays[0].style.zIndex, String(ORNAMENT_Z));

  settings.hidden = false;
  resized();
  flush();
  assert.notEqual(overlays[1].innerHTML, firstVines, 'reopening a dialog grows a fresh set of vines');
  const reopened = overlays[1].innerHTML;
  resized();
  flush();
  assert.equal(overlays[1].innerHTML, reopened, 'a relayout at the same size keeps the vines');
  settings.hidden = true;

  panels = [inventory];
  listeners.get('scroll')();
  flush();
  assert.equal(overlays[1].removed, true);
  assert.equal(observed.has(settings), false);
  dispose();
  assert.equal(disconnected, 2);
  assert.equal(observed.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(overlays[0].removed, true);
});

test('vines are seeded per dialog and never tile one repeating strand', () => {
  const a = vineSvg(800, 600, 1), b = vineSvg(800, 600, 2);
  assert.equal(vineSvg(800, 600, 1), a, 'same seed and size reproduce the same vines');
  assert.notEqual(a, b, 'another seed grows other vines');
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const svg = vineSvg(800, 600, seed, { id: 'x' });
    const stems = [...svg.matchAll(/<path d="([^"]+)" stroke="#7d7a45"/g)].map(match => match[1]);
    assert.ok(stems.length >= 3, `seed ${seed} grows stems along most edges`);
    // Compare stem shapes relative to their start: a tiled vine repeats the same offsets.
    const shapes = stems.map(d => { const n = d.match(/-?\d+(\.\d+)?/g).map(Number); return n.map((v, i) => v - n[i % 2]).join(); });
    assert.equal(new Set(shapes).size, shapes.length, `seed ${seed} has no two identical strands`);
    assert.ok(!/NaN|Infinity/.test(svg));
    for (const [, x, y] of svg.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)) {
      if (x === '-1' && y === '-1') continue;
      const inBand = Math.min(+x, +y, 800 - x, 600 - y);
      assert.ok(inBand >= 8 && inBand <= 30, `seed ${seed} keeps foliage in the frame band (${x}, ${y})`);
    }
  }
  assert.doesNotMatch(vineSvg(40, 40, 1), /stroke="#7d7a45"/, 'tiny frames get no strands');
  assert.match(vineSvg(800, 600, 1, { id: 'dv7' }), /id="dv7-s"/, 'gradient/filter ids are unique per overlay');
});
