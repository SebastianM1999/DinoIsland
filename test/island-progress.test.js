import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/shared/levels.js';
import { availableStartingIsland, unlockedStartingIsland } from '../src/client/core/islandProgress.js';

test('playtest access lets a new expedition start on every island', () => {
  for (let index = 0; index < LEVELS.length; index++) assert.equal(unlockedStartingIsland(index, true), index);
  assert.equal(availableStartingIsland(true), LEVELS.length - 1);
});

test('without playtest access every new expedition starts on the first island', () => {
  assert.equal(availableStartingIsland(false), 0);
  for (let index = 0; index < LEVELS.length; index++) assert.equal(unlockedStartingIsland(index, false), 0);
});

test('menu selections stay inside the island catalog', () => {
  assert.equal(unlockedStartingIsland(999, true), LEVELS.length - 1);
  for (const invalid of [-1, null, '1', NaN, 1.5, undefined]) assert.equal(unlockedStartingIsland(invalid, true), invalid === -1 ? 0 : 0);
});
