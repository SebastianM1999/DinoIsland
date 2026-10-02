// The player's progression profile ({ xp, bonus, skills }, see shared/skills.js)
// lives in localStorage: the server is authoritative while playing, but a solo
// worker or a LAN host starts from nothing, so the client carries the save and
// sends it in `hello`. The server re-validates it (sanitizeProfile), so an
// edited save can never exceed its point budget.

import { storageKey } from '../../shared/brand.js';
import { freshProfile, sanitizeProfile } from '../../shared/skills.js';

export const PROFILE_KEY = storageKey('profile');

/** localStorage, or null when it is blocked (private window, sandboxed frame). */
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** The saved profile, always valid; a fresh one when nothing usable is stored. */
export function loadProfile(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(PROFILE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : freshProfile();
  } catch {
    return freshProfile();
  }
}

/** Persist `profile` (sanitized first). Returns false when storage is unavailable. */
export function saveProfile(profile, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(PROFILE_KEY, JSON.stringify(sanitizeProfile(profile)));
    return true;
  } catch {
    return false;
  }
}
