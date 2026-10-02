// The game's name and identifiers in one place (browser, server and desktop).
//
// To rebrand: change the values here, then the few static places that cannot
// import this module – package.json (name, description, build.appId,
// build.productName; the desktop window titles read productName) and the
// <title> in index.html. Before changing `slug` or `storagePrefix`, read the
// notes on them: both have player-visible consequences.

export const BRAND = {
  name: 'Dinosaur Island',
  // Steam lobby filter, Steam protocol id and temp-folder names. Builds with a
  // different slug can no longer see or join each other's lobbies.
  slug: 'dinosaur-island',
  // localStorage key prefix (settings, player name, outfit, tracked contract).
  storagePrefix: 'di.',
  // Earlier prefixes: their values are copied once to the current prefix
  // (migrateStorage), so players keep their settings after a rename.
  legacyStoragePrefixes: [],
};

/** localStorage key for `name` under the current brand. */
export const storageKey = (name) => BRAND.storagePrefix + name;

/** Copy values saved under a legacy prefix to the current one (never overwrites). */
export function migrateStorage(storage = globalThis.localStorage) {
  try {
    for (const prefix of BRAND.legacyStoragePrefixes) {
      if (prefix === BRAND.storagePrefix) continue;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const next = BRAND.storagePrefix + key.slice(prefix.length);
        if (storage.getItem(next) === null) storage.setItem(next, storage.getItem(key));
      }
    }
  } catch { /* storage may be blocked */ }
}
