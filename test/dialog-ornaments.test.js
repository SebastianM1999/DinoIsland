import test from 'node:test';
import assert from 'node:assert/strict';
import { initDialogOrnaments, ornamentRect } from '../src/client/ui/dialogOrnaments.js';

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
  const dispose = initDialogOrnaments({ doc, win });
  flush();
  assert.equal(overlays[0].hidden, true, 'inventory foliage stays behind the settings modal');
  assert.equal(overlays[1].hidden, false);
  assert.equal(overlays[1].style.left, '78px');
  assert.equal(overlays[1].style.zIndex, '61');
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
  assert.equal(overlays[0].style.zIndex, '3');

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
