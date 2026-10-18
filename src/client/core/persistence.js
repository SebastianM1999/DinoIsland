// Where the client keeps small preferences (name, outfit, settings, pocket order, graphics
// calibration, tracked contract): `storage`, a localStorage-shaped object.
//
// - Desktop: window.dinoStore from desktop/preload.cjs, backed by files under userData
//   (desktop/personal-store.cjs). The page's own localStorage is not used there: its origin
//   contains the local port, which changes between launches.
// - Browser: localStorage (null when blocked; every caller tolerates that).
//
// Expedition saves are not stored here: see client/net/expeditions.js.

import { storageKey } from '../../shared/brand.js';

/** Preference keys worth carrying over from an older desktop build's localStorage. */
const CARRIED = ['settings', 'graphics-tier', 'name', 'outfit', 'pockets', 'tracked'];
const MIGRATED = storageKey('migrated');

function localOrNull() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * Copy preferences from this origin's localStorage into the desktop store once. Older desktop
 * builds kept them there; that only works when the same local port comes up again, so this is
 * best effort. XP and skills are not carried: progression now belongs to each expedition.
 */
export function migrateLocalPreferences(target = globalThis.dinoStore ?? null, source = localOrNull()) {
  if (!target || !source) return 0;
  try {
    if (target.getItem(MIGRATED)) return 0;
    let copied = 0;
    for (const name of CARRIED) {
      const key = storageKey(name);
      const value = source.getItem(key);
      if (value != null && target.getItem(key) == null) { target.setItem(key, value); copied++; }
    }
    target.setItem(MIGRATED, '1');
    return copied;
  } catch {
    return 0;
  }
}

/** The current backend, looked up on every call (tests and the preload may install one late). */
const current = () => globalThis.dinoStore ?? localOrNull();
export const storage = {
  getItem: (key) => current()?.getItem(key) ?? null,
  setItem: (key, value) => {
    const store = current();
    if (!store) throw new Error('Storage is unavailable.');
    store.setItem(key, value);
  },
  removeItem: (key) => current()?.removeItem(key),
};

/** Read a key, tolerating blocked storage. */
export function readItem(key, store = storage) {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}

/** Write (or with null remove) a key. Returns false when storage is unavailable. */
export function writeItem(key, value, store = storage) {
  try {
    if (!store) return false;
    if (value == null) store.removeItem(key);
    else store.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
