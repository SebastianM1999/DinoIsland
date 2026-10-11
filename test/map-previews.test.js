import test from 'node:test';
import assert from 'node:assert/strict';

async function fixture(tag, fail = () => false) {
  const old = globalThis.Image;
  const requests = [];
  globalThis.Image = class {
    decode() { requests.push(this.src); return fail(this.src) ? Promise.reject(new Error('Missing photograph')) : Promise.resolve(); }
  };
  const api = await import(`../src/client/ui/mapPreviews.js?${tag}`);
  return { api, requests, restore() { globalThis.Image = old; } };
}

test('Only the selected island photographs decode and subsequent loads reuse its cache', async () => {
  const f = await fixture('success');
  try {
    const first = f.api.preloadMapPreviews();
    assert.equal(f.api.preloadMapPreviews(), first);
    await first;
    assert.equal(f.requests.length, 3);
    assert.equal(f.api.mapPreviewFrames(1).length, 0);
    await f.api.preloadMapPreviews(1);
    await f.api.preloadMapPreviews(2);
    for (let island = 0; island < 3; island++) {
      assert.equal(f.api.mapPreviewFrames(island).length, 3);
      assert.ok(f.api.mapPreviewFrames(island).every(src => src.includes(`island-${island + 1}-`)));
    }
    const copy = f.api.mapPreviewFrames(0);
    copy.pop();
    assert.equal(f.api.mapPreviewFrames(0).length, 3);
    await f.api.preloadMapPreviews();
    assert.equal(f.requests.length, 9);
    await f.api.preloadMapPreviews(-1);
    assert.equal(f.requests.length, 9);
    assert.deepEqual(f.api.previewURLs(-1), []);
    assert.deepEqual(f.api.previewURLs(4), []);
  } finally { f.restore(); }
});

test('A missing island postcard leaves other islands usable and does not reject loading', async () => {
  const f = await fixture('failure', src => src.includes('island-2-'));
  try {
    await Promise.all([0, 1, 2].map(index => f.api.preloadMapPreviews(index)));
    assert.equal(f.api.mapPreviewFrames(0).length, 3);
    assert.equal(f.api.mapPreviewFrames(1).length, 0);
    assert.equal(f.api.mapPreviewFrames(2).length, 3);
  } finally { f.restore(); }
});

test('A pending photograph from another island cannot delay the selected island', async () => {
  const old = globalThis.Image;
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  globalThis.Image = class {
    decode() { return this.src.includes('island-3-') ? blocked : Promise.resolve(); }
  };
  try {
    const api = await import('../src/client/ui/mapPreviews.js?independent');
    const otherIsland = api.preloadMapPreviews(2);
    await api.preloadMapPreviews(0);
    assert.equal(api.mapPreviewFrames(0).length, 3);
    assert.equal(api.mapPreviewFrames(2).length, 0);
    unblock(); await otherIsland;
    assert.equal(api.mapPreviewFrames(2).length, 3);
  } finally { unblock?.(); globalThis.Image = old; }
});

test('The cave has a live bake preview without requesting nonexistent postcard assets', async () => {
  const f = await fixture('cave');
  try {
    await f.api.preloadMapPreviews(3);
    assert.deepEqual(f.api.previewURLs(3), []);
    assert.deepEqual(f.api.mapPreviewFrames(3), []);
    assert.deepEqual(f.requests, []);
  } finally { f.restore(); }
});
