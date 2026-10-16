import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIP } from '../src/shared/protocol.js';
import { storageKey } from '../src/shared/brand.js';
import { identityOrder, validPocketOrder, loadPocketOrder, savePocketOrder, swapPockets, pocketOf, nextPocket } from '../src/client/player/pockets.js';

const KEY = storageKey('pockets');
const memory = (init = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
};

test('only a permutation of the EQUIP indices is a pocket order', () => {
  assert.ok(validPocketOrder(identityOrder()));
  assert.ok(validPocketOrder([6, 5, 4, 3, 2, 1, 0]));
  for (const bad of [null, {}, [0, 1, 2], [0, 0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 4, 1.5], [0, 1, 2, 3, 4, '5'], [...identityOrder(), 6]]) {
    assert.equal(validPocketOrder(bad), false, JSON.stringify(bad));
  }
});

test('a saved order survives a reload; missing, corrupt or blocked storage falls back to the default order', () => {
  const store = memory();
  assert.deepEqual(loadPocketOrder(store), identityOrder());
  savePocketOrder([3, 1, 2, 0, 4, 5, 6], store);
  assert.deepEqual(loadPocketOrder(store), [3, 1, 2, 0, 4, 5, 6]);
  savePocketOrder([0, 0, 0, 0, 0, 0], store);   // an invalid order is never written
  assert.deepEqual(loadPocketOrder(store), [3, 1, 2, 0, 4, 5, 6]);
  assert.deepEqual(loadPocketOrder(memory({ [KEY]: '{not json' })), identityOrder());
  assert.deepEqual(loadPocketOrder(memory({ [KEY]: '[1,1,2,3,4,5]' })), identityOrder());
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.deepEqual(loadPocketOrder(blocked), identityOrder());
  assert.doesNotThrow(() => savePocketOrder(identityOrder(), blocked));
});

test('swapping two pockets exchanges their tools and leaves the original order alone', () => {
  const order = identityOrder();
  const next = swapPockets(order, 0, 3);
  assert.equal(EQUIP[next[3]], 'spear', 'the spear moved to pocket 4');
  assert.equal(EQUIP[next[0]], 'fruit');
  assert.deepEqual(order, identityOrder());
  assert.ok(validPocketOrder(next));
  assert.deepEqual(swapPockets(order, 2, 2), order);
  assert.deepEqual(swapPockets(order, -1, 9), order);
  assert.equal(pocketOf(next, EQUIP.indexOf('spear')), 3);
});

test('the wheel steps through pockets in their order and skips tools that cannot be held', () => {
  const order = [3, 0, 1, 2, 4, 5];   // fruit, spear, bow, trap, pistol, rifle
  assert.equal(nextPocket(order, 3, 1), 0);
  assert.equal(nextPocket(order, 3, -1), 5, 'wraps around backwards');
  const noBowNoGuns = (eq) => !['bow', 'pistol', 'rifle'].includes(EQUIP[eq]);
  assert.equal(nextPocket(order, 0, 1, noBowNoGuns), 2, 'spear -> trap, the locked bow skipped');
  assert.equal(nextPocket(order, 2, 1, noBowNoGuns), 3, 'trap -> fruit, both guns skipped');
  assert.equal(nextPocket(order, 0, 1, () => false), 0, 'nothing else usable: stays');
});

test('pre-MPX pocket saves keep all six arranged tools and append the MPX', () => {
  assert.deepEqual(loadPocketOrder(memory({ [KEY]: '[3,0,1,2,5,4]' })), [3,0,1,2,5,4,6]);
  assert.deepEqual(loadPocketOrder(memory({ [KEY]: '[3,0,1,2,5,5]' })), identityOrder());
});
