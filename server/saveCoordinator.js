// The owner's saved expeditions on a host (the desktop host process; any Node host given a
// save folder): which expedition is open, who may join it, when it is saved.
//
// - Solo is the open expedition with a private lobby: only the owner's connection (loopback +
//   the token handed out by `open`) joins, under the roster key OWNER_KEY. An open lobby also
//   admits guests (Steam friends).
// - Saves are captured between ticks (this runs on the host's event loop, never inside
//   world.step), written one after another (SaveStore generations), autosaved every
//   `autosaveMs` and shortly after checkpoints (new island, boat part, base stage, boss, leave).
// - A failed write keeps the previous generation, tells the owner, and retries with backoff.

import { randomUUID, createHash } from 'node:crypto';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld, restoreWorld, worldOptions } from '../src/sim/worldSave.js';
import { sealSave, cleanSaveName, saveSummary, validSaveId } from '../src/shared/saveSchema.js';
import { LEVELS } from '../src/shared/levels.js';
import { MSG, EV, OWNER_KEY } from '../src/shared/protocol.js';
import { SaveStore, describeIoError } from './saveStore.js';

export { OWNER_KEY };
export const LOBBIES = ['private', 'open'];
const RETRY_MS = [5000, 15000, 60000];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'local']);
const STEAM_ID = /^[1-9]\d{15,19}$/;
const CREDENTIAL = /^[0-9a-f-]{36}$/;
/** A guest's roster key: derived from (never equal to) the credential only that guest holds. */
export const guestKey = (credential) => `guest-${createHash('sha256').update(credential).digest('hex').slice(0, 32)}`;

export class SaveCoordinatorError extends Error {}

export class SaveCoordinator {
  constructor({ now = Date.now, autosaveMs = 60_000, checkpointDelayMs = 1500, log = (...a) => console.log('[saves]', ...a), timers = globalThis } = {}) {
    this.now = now;
    this.autosaveMs = autosaveMs;
    this.checkpointDelayMs = checkpointDelayMs;
    this.log = log;
    this.timers = timers;
    this.store = null;
    this.host = null;
    this.current = null;     // { id, name, createdAt, token, lobby, savedAt, lastError, lastNow }
    this.chain = Promise.resolve();
    this.autosave = null;
    this.checkpointTimer = null;
    this.retryTimer = null;
    this.retries = 0;
    this.unavailable = 'Expeditions are still loading.';
  }

  /** The game host this coordinator drives (server/gameHost.js, started `worldless`). */
  attach(host) { this.host = host; }

  /** Use `root` for this player's expeditions; refuses when another game instance owns it. */
  async useRoot(root, StoreClass = SaveStore) {
    const store = new StoreClass(root);
    if (!(await store.lock())) {
      this.unavailable = 'Another copy of the game is using these expeditions. Close it first.';
      return false;
    }
    await this.store?.unlock();
    this.store = store;
    this.unavailable = null;
    return true;
  }

  /** Say why expeditions cannot be used (for example: Steam is not running). */
  setUnavailable(reason) { this.unavailable = reason; }

  #need() {
    if (!this.store) throw new SaveCoordinatorError(this.unavailable || 'Expeditions are unavailable.');
  }

  async list() {
    this.#need();
    const list = await this.store.list();
    return list.map((s) => ({ ...s, open: s.id === this.current?.id }));
  }

  status() {
    const c = this.current;
    return {
      available: !!this.store, reason: this.store ? null : this.unavailable,
      open: c ? { id: c.id, name: c.name, lobby: c.lobby, savedAt: c.savedAt, error: c.lastError } : null,
    };
  }

  /** Start a new expedition in a fresh slot and host it. Never touches another expedition. */
  async create({ name, level = 0 } = {}, { lobby = 'private' } = {}) {
    this.#need();
    await this.#closeCurrent();
    const index = Number.isInteger(level) && level >= 0 && level < LEVELS.length ? level : 0;
    const id = randomUUID();
    const createdAt = this.now();
    this.host.load((io) => new ServerWorld(io, { level: index, alphas: true, lobby: lobby !== 'private' }));
    this.#begin({ id, name: cleanSaveName(name), createdAt, lobby, savedAt: 0 });
    const saved = await this.save('new');
    if (!saved.ok) {
      this.host.unload('The expedition could not be saved.');
      this.#end();
      throw new SaveCoordinatorError(saved.error);
    }
    return { token: this.current.token, expedition: this.#summary() };
  }

  /** Load a saved expedition and host it. */
  async open(id, { lobby = 'private' } = {}) {
    this.#need();
    if (!validSaveId(id)) throw new SaveCoordinatorError('Unknown expedition.');
    if (this.current?.id === id) {
      this.setLobby(lobby);
      this.current.token = randomUUID();
        return { token: this.current.token, expedition: this.#summary() };
    }
    const found = await this.store.read(id);
    if (!found) throw new SaveCoordinatorError('That expedition no longer exists.');
    if (found.future) throw new SaveCoordinatorError('This expedition was saved by a newer version of the game. Update the game to continue it.');
    if (!found.doc) throw new SaveCoordinatorError(`This expedition is damaged and has no usable backup (${found.reason}).`);
    const { doc } = found;
    await this.#closeCurrent();
    try {
      // (hosted for friends: everyone meets in the lobby first, the owner starts; solo plays at once)
      this.host.load((io) => restoreWorld(new ServerWorld(io, { ...worldOptions(doc.world), alphas: true, lobby: lobby !== 'private' }), doc.world));
    } catch (error) {
      this.host.unload('The expedition could not be loaded.');
      throw new SaveCoordinatorError(`This expedition does not fit this version of the game (${error.message}).`);
    }
    this.#begin({ id, name: doc.name, createdAt: doc.createdAt, lobby, savedAt: doc.savedAt });
    this.current.lastNow = this.host.world.now;
    if (found.recovered) this.log(`expedition ${id}: the newest save was damaged, recovered generation ${found.gen}`);
    return { token: this.current.token, expedition: this.#summary(), recovered: !!found.recovered };
  }

  setLobby(lobby) {
    if (!this.current) throw new SaveCoordinatorError('No expedition is open.');
    if (!LOBBIES.includes(lobby)) throw new SaveCoordinatorError('Unknown lobby setting.');
    this.current.lobby = lobby;
  }

  /**
   * Who may join the open expedition, and as whom (gameHost `admit`):
   * - the owner: loopback + the token from `open`/`create` -> OWNER_KEY;
   * - a Steam guest: the authenticated Steam identity of its connection (desktop/steam-session.js) -> `steam-<id>`;
   * - any other guest: first asked for its credential (`ident`), then its own key, or a new
   *   credential (`issue`) when it has none. Names are never identity.
   */
  admit({ addr, url, steamId, credential } = {}) {
    const c = this.current;
    if (!c) return { ok: false, reason: 'No expedition is open on this host.' };
    let token = null;
    try { token = new URL(url ?? '/', 'http://host').searchParams.get('owner'); } catch { /* no token */ }
    if (token && token === c.token && LOOPBACK.has(addr)) return { ok: true, key: OWNER_KEY };
    if (c.lobby === 'private') return { ok: false, reason: 'This expedition is private.' };
    if (typeof steamId === 'string' && STEAM_ID.test(steamId)) return { ok: true, key: `steam-${steamId}` };
    if (credential === undefined) return { ok: false, ident: c.id };
    if (typeof credential === 'string' && CREDENTIAL.test(credential)) return { ok: true, key: guestKey(credential) };
    const issued = randomUUID();
    return { ok: true, key: guestKey(issued), issue: { world: c.id, token: issued } };
  }

  /** gameHost `onCheckpoint`: save soon (bursts coalesce into one write). */
  checkpoint() {
    if (!this.current || this.checkpointTimer) return;
    this.checkpointTimer = this.timers.setTimeout(() => { this.checkpointTimer = null; void this.save('checkpoint'); }, this.checkpointDelayMs);
  }

  /**
   * Capture the open world now and write it as the next generation. Writes run one after
   * another, so an older capture can never land after a newer one.
   * @returns {Promise<{ ok:true, savedAt:number, gen:number } | { ok:false, error:string }>}
   */
  save(reason = 'manual') {
    const run = this.chain.then(() => this.#write(reason));
    this.chain = run.catch(() => {});
    return run;
  }

  async #write(reason) {
    const c = this.current;
    const world = this.host?.world;
    if (!c || !world) return { ok: false, error: 'No expedition is open.' };
    const started = performance.now();
    const data = exportWorld(world);
    const savedAt = this.now();
    const doc = sealSave({ id: c.id, name: c.name, createdAt: c.createdAt, savedAt, gen: 0, world: data });
    const captureMs = performance.now() - started;
    try {
      const gen = await this.store.write(doc);
      if (this.current === c) {
        c.savedAt = savedAt;
        c.lastError = null;
        c.lastNow = data.now;
        this.retries = 0;
        this.#notify({ ok: true, at: savedAt, reason });
      }
      this.log(`saved ${c.id} gen ${gen} (${reason}, capture ${captureMs.toFixed(1)} ms)`);
      return { ok: true, savedAt, gen };
    } catch (error) {
      const message = describeIoError(error);
      this.log(`save of ${c.id} failed (${reason}): ${error.message}`);
      if (this.current === c) {
        c.lastError = message;
        this.#notify({ ok: false, at: savedAt, reason, error: message });
        this.#retry();
      }
      return { ok: false, error: message };
    }
  }

  #retry() {
    if (this.retryTimer) return;
    const delay = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries++;
    this.retryTimer = this.timers.setTimeout(() => { this.retryTimer = null; if (this.current) void this.save('retry'); }, delay);
  }

  #notify(result) {
    const owner = this.host?.playerByKey(OWNER_KEY);
    if (owner) this.host.world.send(owner.id, { t: MSG.EV, e: EV.SAVED, ...result });
  }

  /** Save & Quit: the final save, then the world is closed. A failed save keeps it open unless `force`. */
  async close({ force = false } = {}) {
    if (!this.current) return { ok: true };
    const result = await this.save('quit');
    if (!result.ok && !force) return result;
    this.host.unload('The host closed the expedition.');
    this.#end();
    return result;
  }

  /** Rename an expedition (only its label: its identity is the id). */
  async rename(id, name) {
    this.#need();
    const clean = cleanSaveName(name);
    if (this.current?.id === id) {
      this.current.name = clean;
      const result = await this.save('rename');
      if (!result.ok) throw new SaveCoordinatorError(result.error);
      return this.#summary();
    }
    const found = await this.store.read(id);
    if (!found?.doc) throw new SaveCoordinatorError(found?.future ? 'This expedition was saved by a newer version of the game.' : 'That expedition cannot be renamed.');
    found.doc.name = clean;
    found.doc.savedAt = this.now();
    await this.store.write(found.doc).catch((error) => { throw new SaveCoordinatorError(describeIoError(error)); });
    return saveSummary(found.doc);
  }

  /** Delete one expedition. The open one must be closed first. */
  async remove(id) {
    this.#need();
    if (!validSaveId(id)) throw new SaveCoordinatorError('Unknown expedition.');
    if (this.current?.id === id) throw new SaveCoordinatorError('Close this expedition before deleting it.');
    await this.store.remove(id);
  }

  /** The host process is quitting: save the open expedition and release the folder. */
  async shutdown() {
    const result = this.current ? await this.close({ force: true }) : { ok: true };
    await this.store?.unlock();
    return result;
  }

  #summary() {
    const c = this.current;
    const w = this.host.world;
    return { id: c.id, name: c.name, level: w.levelIndex, island: LEVELS[w.levelIndex]?.name, lobby: c.lobby, savedAt: c.savedAt };
  }

  #begin({ id, name, createdAt, lobby, savedAt }) {
    if (!LOBBIES.includes(lobby)) lobby = 'private';
    this.current = { id, name, createdAt, lobby, savedAt, token: randomUUID(), lastError: null, lastNow: 0 };
    this.retries = 0;
    this.autosave = this.timers.setInterval(() => {
      const w = this.host.world;
      if (this.current && w && w.now > this.current.lastNow + 1) void this.save('auto');
    }, this.autosaveMs);
  }

  #end() {
    this.timers.clearInterval(this.autosave);
    this.timers.clearTimeout(this.checkpointTimer);
    this.timers.clearTimeout(this.retryTimer);
    this.autosave = this.checkpointTimer = this.retryTimer = null;
    this.current = null;
  }

  async #closeCurrent() {
    if (!this.current) return;
    const result = await this.close();
    if (!result.ok) throw new SaveCoordinatorError(`The open expedition could not be saved: ${result.error}`);
  }
}
