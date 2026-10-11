import test from 'node:test';
import assert from 'node:assert/strict';

test('Postcards return before decoding and stale selections or disposal cannot repaint the menu', async () => {
  const names = ['Image', 'document', 'matchMedia'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const decoders = new Map(), notices = [];
  function classes() {
    const values = new Set();
    return {
      add: name => values.add(name), remove: name => values.delete(name),
      toggle(name, enabled) { if (enabled) values.add(name); else values.delete(name); },
      contains: name => values.has(name),
    };
  }
  const layers = [0, 1].map(() => ({ src: '', classList: classes() }));
  const root = { classList: classes(), querySelectorAll: () => layers };
  const listeners = new Set();
  const listen = (name, fn) => listeners.add(fn), unlisten = (name, fn) => listeners.delete(fn);
  globalThis.document = { hidden: false, addEventListener: listen, removeEventListener: unlisten };
  globalThis.matchMedia = () => ({ matches: true, addEventListener: listen, removeEventListener: unlisten });
  globalThis.Image = class {
    decode() { return new Promise(resolve => { decoders.set(this.src, resolve); }); }
  };
  const finish = async island => {
    for (const [src, resolve] of decoders) if (src.includes(`island-${island}-`)) resolve();
    // Decode settlement, cache population, then the controller continuation.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  let postcards;
  try {
    const { createMenuPostcards } = await import('../src/client/ui/menuPostcards.js');
    postcards = await createMenuPostcards(root, info => notices.push(info));
    assert.equal(decoders.size, 3);
    assert.equal(root.classList.contains('has-preview'), false);
    const second = postcards.setIsland(1);
    assert.equal(decoders.size, 6);
    await finish(2); await second;
    assert.ok(layers.some(layer => layer.src.includes('island-2-')));
    assert.equal(notices.at(-1).index, 1);
    const snapshot = layers.map(layer => layer.src);
    await finish(1);
    assert.deepEqual(layers.map(layer => layer.src), snapshot);
    assert.equal(notices.at(-1).index, 1);
    const third = postcards.setIsland(2);
    postcards.dispose();
    const afterDispose = layers.map(layer => layer.src), noticeCount = notices.length;
    await finish(3); await third;
    assert.deepEqual(layers.map(layer => layer.src), afterDispose);
    assert.equal(notices.length, noticeCount);
    assert.equal(listeners.size, 0);
  } finally {
    postcards?.dispose();
    for (const resolve of decoders.values()) resolve();
    names.forEach((name, i) => {
      if (saved[i]) Object.defineProperty(globalThis, name, saved[i]); else delete globalThis[name];
    });
  }
});
