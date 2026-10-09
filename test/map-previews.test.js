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

test('All map photographs decode before selection and subsequent loads reuse the cache', async () => {
  const f = await fixture('success');
  try {
    const first = f.api.preloadMapPreviews();
    assert.equal(f.api.preloadMapPreviews(), first);
    await first;
    assert.equal(f.requests.length, 9);
    for (let island = 0; island < 3; island++) {
      assert.equal(f.api.mapPreviewFrames(island).length, 3);
      assert.ok(f.api.mapPreviewFrames(island).every(src => src.includes(`island-${island + 1}-`)));
    }
    const copy = f.api.mapPreviewFrames(0);
    copy.pop();
    assert.equal(f.api.mapPreviewFrames(0).length, 3);
    await f.api.preloadMapPreviews();
    assert.equal(f.requests.length, 9);
    assert.deepEqual(f.api.previewURLs(-1), []);
    assert.deepEqual(f.api.previewURLs(3), []);
  } finally { f.restore(); }
});

test('A missing island postcard leaves other islands usable and does not reject loading', async () => {
  const f = await fixture('failure', src => src.includes('island-2-'));
  try {
    await f.api.preloadMapPreviews();
    assert.equal(f.api.mapPreviewFrames(0).length, 3);
    assert.equal(f.api.mapPreviewFrames(1).length, 0);
    assert.equal(f.api.mapPreviewFrames(2).length, 3);
  } finally { f.restore(); }
});
