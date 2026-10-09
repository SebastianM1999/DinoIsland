// Saved title-menu starting islands. Only earned gameplay travel should call
// unlockIsland; browsing the tour or selecting a debug start must not unlock it.
import { LEVELS } from '../../shared/levels.js';
import { storageKey } from '../../shared/brand.js';

export const ISLAND_PROGRESS_KEY = storageKey('islandProgress');

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function islandIndex(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(LEVELS.length - 1, value)) : null;
}

/** Highest earned starting island; new, unreadable or malformed saves start at 0. */
export function loadIslandProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(ISLAND_PROGRESS_KEY);
    if (!raw) return 0;
    const record = JSON.parse(raw);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return 0;
    return islandIndex(record.unlocked) ?? 0;
  } catch {
    return 0;
  }
}

/** Record an earned island index monotonically. Returns the persisted unlock. */
export function unlockIsland(index, storage = defaultStorage()) {
  const previous = loadIslandProgress(storage);
  const requested = islandIndex(index);
  if (requested === null || requested <= previous || !storage) return previous;
  try {
    storage.setItem(ISLAND_PROGRESS_KEY, JSON.stringify({ unlocked: requested }));
    return requested;
  } catch {
    return previous;
  }
}

/** Restrict an ordinary menu start to the saved, earned range. */
export function unlockedStartingIsland(selected, storage = defaultStorage()) {
  return Math.min(islandIndex(selected) ?? 0, loadIslandProgress(storage));
}
