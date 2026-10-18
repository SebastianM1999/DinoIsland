// Pocket order: which tool sits in which numbered pocket (keys 1-8, hotbar,
// inventory). A client-side preference: `order[pocket]` is an EQUIP index, so
// `game.eq` and everything sent to the server keep meaning the EQUIP index.
// DOM-free apart from the guarded preference storage (core/persistence.js).

import { EQUIP } from '../../shared/protocol.js';
import { storageKey } from '../../shared/brand.js';
import { storage as preferences } from '../core/persistence.js';

const STORE_KEY = storageKey('pockets');

/** The default order: pocket N holds EQUIP[N]. */
export const identityOrder = () => EQUIP.map((_, i) => i);

/** Is `order` a permutation of the EQUIP indices? */
export function validPocketOrder(order) {
  if (!Array.isArray(order) || order.length !== EQUIP.length) return false;
  const seen = new Set();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= EQUIP.length || seen.has(i)) return false;
    seen.add(i);
  }
  return true;
}

/** The remembered order, or the default one when nothing (valid) is stored or storage is blocked. */
export function loadPocketOrder(storage = preferences) {
  try {
    let order = JSON.parse(storage?.getItem(STORE_KEY) || 'null');
    // Extend valid older saves without losing the player's pocket arrangement.
    if (Array.isArray(order) && [6, 7].includes(order.length) && new Set(order).size === order.length
      && order.every(i => Number.isInteger(i) && i >= 0 && i < order.length)) order = [...order, ...identityOrder().slice(order.length)];
    return validPocketOrder(order) ? order : identityOrder();
  } catch {
    return identityOrder();
  }
}

export function savePocketOrder(order, storage = preferences) {
  if (!validPocketOrder(order)) return;
  try { storage?.setItem(STORE_KEY, JSON.stringify(order)); } catch { /* storage may be blocked */ }
}

/** A new order with pockets `a` and `b` exchanged (the same order for invalid pockets). */
export function swapPockets(order, a, b) {
  const next = order.slice();
  if (a === b || !(a >= 0 && a < next.length) || !(b >= 0 && b < next.length)) return next;
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** The pocket holding EQUIP index `eq` (-1 when unknown). */
export const pocketOf = (order, eq) => order.indexOf(eq);

/**
 * The EQUIP index `step` pockets away from `eq` (wheel: +1 / -1), skipping
 * tools `usable(eq)` refuses; `eq` itself when no other pocket is usable.
 */
export function nextPocket(order, eq, step, usable = () => true) {
  const n = order.length;
  const from = Math.max(0, pocketOf(order, eq));
  for (let k = 1; k < n; k++) {
    const candidate = order[(((from + step * k) % n) + n) % n];
    if (usable(candidate)) return candidate;
  }
  return eq;
}
