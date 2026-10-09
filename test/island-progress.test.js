import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/shared/levels.js';
import { storageKey } from '../src/shared/brand.js';
import { ISLAND_PROGRESS_KEY, loadIslandProgress, unlockIsland, unlockedStartingIsland } from '../src/client/core/islandProgress.js';

function storageFixture(value) {
  const records = new Map(value === undefined ? [] : [[ISLAND_PROGRESS_KEY, value]]);
  return {
    getItem: key => records.get(key) ?? null,
    setItem: (key, record) => records.set(key, record),
  };
}

test('new players start on the jungle and saved unlocks use the game storage namespace', () => {
  const storage = storageFixture();
  assert.equal(ISLAND_PROGRESS_KEY, storageKey('islandProgress'));
  assert.equal(loadIslandProgress(storage), 0);
  assert.equal(unlockedStartingIsland(LEVELS.length - 1, storage), 0);
  assert.equal(loadIslandProgress(null), 0);
});

test('earned island travel persists its index without extra increments or regressions', () => {
  const storage = storageFixture();
  assert.equal(unlockIsland(1, storage), 1);
  assert.deepEqual(JSON.parse(storage.getItem(ISLAND_PROGRESS_KEY)), { unlocked: 1 });
  assert.equal(unlockIsland(1, storage), 1);
  assert.equal(unlockIsland(0, storage), 1);
  assert.equal(loadIslandProgress(storage), 1);
  assert.equal(unlockIsland(LEVELS.length - 1, storage), LEVELS.length - 1);
});

test('malformed records and noninteger indices cannot unlock a starting island', () => {
  for (const raw of ['invalid JSON', 'null', '[]', '2', '"2"', '{}', '{"unlocked":"2"}', '{"unlocked":1.5}', '{"unlocked":null}', '{"unlocked":true}']) {
    assert.equal(loadIslandProgress(storageFixture(raw)), 0, raw);
  }
  const storage = storageFixture('{"unlocked":1}');
  for (const invalid of [undefined, null, '2', 1.5, NaN, Infinity, {}, true]) {
    assert.equal(unlockIsland(invalid, storage), 1);
    assert.equal(loadIslandProgress(storage), 1);
  }
});

test('island values stay inside the catalog and menu requests cannot exceed earned progress', () => {
  assert.equal(loadIslandProgress(storageFixture('{"unlocked":-8}')), 0);
  assert.equal(loadIslandProgress(storageFixture('{"unlocked":999}')), LEVELS.length - 1);
  const storage = storageFixture('{"unlocked":1}');
  for (const selected of [2, 999]) assert.equal(unlockedStartingIsland(selected, storage), 1);
  for (const selected of [-1, null, '1', NaN, 1.5]) assert.equal(unlockedStartingIsland(selected, storage), 0);
  assert.equal(unlockedStartingIsland(0, storage), 0);
  assert.equal(unlockedStartingIsland(1, storage), 1);
  assert.equal(unlockIsland(999, storage), LEVELS.length - 1);
  assert.equal(loadIslandProgress(storage), LEVELS.length - 1);
});

test('blocked storage fails closed and failed writes do not report an unsaved unlock', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadIslandProgress(blocked), 0);
  assert.equal(unlockIsland(1, blocked), 0);
  assert.equal(unlockIsland(1, null), 0);
  assert.equal(unlockedStartingIsland(2, blocked), 0);
  const readOnly = { getItem: () => '{"unlocked":1}', setItem() { throw new Error('quota'); } };
  assert.equal(unlockIsland(2, readOnly), 1);
  assert.equal(loadIslandProgress(readOnly), 1);
});
