// Personal and device preferences of the desktop game, stored as small JSON files under
// Electron's userData instead of the page's localStorage (whose origin includes the random
// local port, so it would look empty after every launch).
//
//   saves/device/settings.json              graphics calibration, volume, FOV... (this PC)
//   saves/profiles/<identity>/personal.json name, outfit, pocket order, tracked contract
//
// The renderer sees one flat key/value map (keys `di.*`, values strings) through the
// preload's window.dinoStore; `route` decides which file a key lives in. Writes are
// debounced, atomic (temporary file, flush, rename) and keep the previous file as `.bak`.

const fs = require('node:fs');
const path = require('node:path');

const KEY = /^di\.[\w.-]{1,40}$/;
const MAX_VALUE = 64 * 1024;
const MAX_KEYS = 64;
/** Keys that belong to this computer rather than to the player. */
const DEVICE_KEYS = new Set(['di.settings', 'di.graphics-tier']);
/** Progression keys of older builds: progression now belongs to each expedition. */
const RETIRED_KEYS = new Set(['di.profile', 'di.islandProgress']);

class JsonFileStore {
  constructor(file, { delayMs = 250 } = {}) {
    this.file = file;
    this.delayMs = delayMs;
    this.timer = null;
    this.data = this.#load();
  }

  #load() {
    for (const file of [this.file, `${this.file}.bak`]) {
      try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.fromEntries(Object.entries(value).filter(([k, v]) => KEY.test(k) && typeof v === 'string'));
        }
      } catch { /* missing or damaged: try the backup, then start empty */ }
    }
    return {};
  }

  set(key, value) {
    if (value === null) delete this.data[key];
    else this.data[key] = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /** Write now (also on quit). Errors are logged; the previous file stays usable. */
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const temp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fd = fs.openSync(temp, 'w');
      try { fs.writeFileSync(fd, JSON.stringify(this.data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
      fs.renameSync(temp, this.file);
      return true;
    } catch (error) {
      console.error(`[store] could not write ${this.file}:`, error.message);
      return false;
    }
  }
}

/** Both stores for one player on this computer. */
class PersonalStore {
  /** @param {string} savesDir userData/saves  @param {string} identity folder name of the player */
  constructor(savesDir, identity, options) {
    this.device = new JsonFileStore(path.join(savesDir, 'device', 'settings.json'), options);
    this.personal = new JsonFileStore(path.join(savesDir, 'profiles', identity, 'personal.json'), options);
  }

  route(key) { return DEVICE_KEYS.has(key) ? this.device : this.personal; }

  snapshot() { return { ...this.device.data, ...this.personal.data }; }

  /** Validated write from the renderer. Returns false for anything that is not a plain preference. */
  set(key, value) {
    if (typeof key !== 'string' || !KEY.test(key) || RETIRED_KEYS.has(key)) return false;
    if (value !== null && (typeof value !== 'string' || value.length > MAX_VALUE)) return false;
    const store = this.route(key);
    if (value !== null && !(key in store.data) && Object.keys(store.data).length >= MAX_KEYS) return false;
    store.set(key, value);
    return true;
  }

  flush() { this.device.flush(); this.personal.flush(); }
}

/** The save folder name of a player: their Steam account, else this computer's local player. */
function identityFolder(steamId) {
  return steamId && /^\d{16,20}$/.test(steamId) ? `steam-${steamId}` : 'local';
}

module.exports = { JsonFileStore, PersonalStore, identityFolder, DEVICE_KEYS };
