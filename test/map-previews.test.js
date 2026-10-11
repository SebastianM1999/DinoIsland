import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/shared/levels.js';

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
    const count = f.api.PREVIEW_SHOT_COUNTS[0];
    const first = f.api.preloadMapPreviews();
    assert.equal(f.api.preloadMapPreviews(), first);
    await first;
    assert.equal(f.requests.length, count);
    assert.equal(f.api.mapPreviewFrames(1).length, 0);
    for (let island = 1; island < LEVELS.length; island++) await f.api.preloadMapPreviews(island);
    for (let island = 0; island < LEVELS.length; island++) {
      assert.equal(f.api.mapPreviewFrames(island).length, f.api.PREVIEW_SHOT_COUNTS[island]);
      assert.ok(f.api.mapPreviewFrames(island).every(src => src.includes(`island-${island + 1}-`) && src.endsWith('.webp')));
    }
    const copy = f.api.mapPreviewFrames(0);
    copy.pop();
    assert.equal(f.api.mapPreviewFrames(0).length, count);
    await f.api.preloadMapPreviews();
    assert.equal(f.requests.length, f.api.PREVIEW_SHOT_COUNTS.reduce((a, b) => a + b, 0));
    const requested = f.requests.length;
    await f.api.preloadMapPreviews(-1);
    assert.equal(f.requests.length, requested);
    assert.deepEqual(f.api.previewURLs(-1), []);
    assert.deepEqual(f.api.previewURLs(LEVELS.length), []);
  } finally { f.restore(); }
});

test('A missing island photograph leaves other islands usable and does not reject loading', async () => {
  const f = await fixture('failure', src => src.includes('island-2-'));
  try {
    await Promise.all([0, 1, 2].map(index => f.api.preloadMapPreviews(index)));
    assert.equal(f.api.mapPreviewFrames(0).length, f.api.PREVIEW_SHOT_COUNTS[0]);
    assert.equal(f.api.mapPreviewFrames(1).length, 0);
    assert.equal(f.api.mapPreviewFrames(2).length, f.api.PREVIEW_SHOT_COUNTS[2]);
  } finally { f.restore(); }
});

test('One broken shot is dropped while the island keeps the rest', async () => {
  const f = await fixture('partial', src => src.endsWith('island-3-2.webp'));
  try {
    await f.api.preloadMapPreviews(2);
    const frames = f.api.mapPreviewFrames(2);
    assert.equal(frames.length, f.api.PREVIEW_SHOT_COUNTS[2] - 1);
    assert.ok(!frames.some(src => src.endsWith('island-3-2.webp')));
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
    assert.equal(api.mapPreviewFrames(0).length, api.PREVIEW_SHOT_COUNTS[0]);
    assert.equal(api.mapPreviewFrames(2).length, 0);
    unblock(); await otherIsland;
    assert.equal(api.mapPreviewFrames(2).length, api.PREVIEW_SHOT_COUNTS[2]);
  } finally { unblock?.(); globalThis.Image = old; }
});

test('The Hollow Mountain has photographs like every other island and never requests missing files', async () => {
  const f = await fixture('cave');
  try {
    assert.ok(f.api.PREVIEW_SHOT_COUNTS[3] >= 4);
    await f.api.preloadMapPreviews(3);
    assert.equal(f.api.previewURLs(3).length, f.api.PREVIEW_SHOT_COUNTS[3]);
    assert.equal(f.api.mapPreviewFrames(3).length, f.api.PREVIEW_SHOT_COUNTS[3]);
    assert.deepEqual(f.requests, f.api.previewURLs(3));
  } finally { f.restore(); }
});
