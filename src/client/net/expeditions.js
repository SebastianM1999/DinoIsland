// The player's saved expeditions, seen from the page. Two backends with one interface:
//
// - host (desktop): the expeditions live in the host process (desktop/host-process.js,
//   server/saveCoordinator.js) and are managed over its loopback-only /saves routes. Playing one
//   opens it on the host and connects to it like a LAN game, with the owner token: solo is the
//   open expedition with a private lobby.
// - browser: the expeditions live in this origin's IndexedDB. Playing one restores it into the
//   solo worker (sim/worker.js), whose captures are sealed and stored here. A browser may evict
//   site data, so expeditions can be exported to and imported from files.
//
// Both: list() -> summaries, start(choice, player) -> Net, rename, remove, saveAndQuit(net).

import { Net } from './net.js';
import { sealSave, checkSave, migrateSave, saveSummary, cleanSaveName, validSaveId, MAX_SAVE_BYTES } from '../../shared/saveSchema.js';

const wsOrigin = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

// ------------------------------------------------------------------ desktop host

async function api(route, body) {
  let res;
  try {
    res = await fetch(`/saves${route}`, body === undefined ? { cache: 'no-store' } :
      { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('The game host is not answering. Restart the game.');
  }
  const value = await res.json().catch(() => null);
  if (!res.ok) throw new Error(value?.error || 'The expedition request failed.');
  return value;
}

export const hostExpeditions = {
  kind: 'host',
  /** { available, reason } */
  async status() { const s = await api('/status'); return { available: s.available, reason: s.reason }; },
  list: () => api(''),
  rename: (id, name) => api('/rename', { id, name }),
  remove: (id) => api('/delete', { id }),
  setLobby: (lobby) => api('/lobby', { lobby }),
  /**
   * Open an expedition (`{ id }`) or create one (`{ create: { name, level } }`) on the host, then join it.
   * lobby 'private' = solo, 'open' = LAN / internet friends may join too.
   */
  async start({ id, create, lobby = 'private', url = null, steam = null }, { name, outfit }) {
    const opened = id ? await api('/open', { id, lobby }) : await api('/new', { ...create, lobby });
    if (steam) {
      // Steam friends: the lobby feeds this expedition (desktop/hostBridge.js); we join it as its owner
      const net = await Net.steam(steam.bridge, { host: true, visibility: steam.visibility, ownerToken: opened.token }, name, outfit);
      net.expedition = { ...opened.expedition, kind: 'host', recovered: !!opened.recovered };
      return net;
    }
    // (`url`: the internet test's own host address, which carries its tunnel token)
    const address = new URL(url ?? `${wsOrigin()}/`);
    address.searchParams.set('owner', opened.token);
    const net = await Net.connect(address.href, name, outfit);
    net.expedition = { ...opened.expedition, kind: 'host', recovered: !!opened.recovered };
    return net;
  },
  /** Save & Quit: the host saves and closes the expedition. `force` closes it even when the save fails. */
  async saveAndQuit(_net, { force = false } = {}) {
    try { return await api('/close', { force }); } catch (error) { return { ok: false, error: error.message }; }
  },
};

// ------------------------------------------------------------------ browser

const DB_NAME = 'dinosaur-island';
const STORE = 'expeditions';

function request(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

/** IndexedDB records { id, current, previous }: the newest save and the one before it. */
export class BrowserExpeditionStore {
  constructor(idb = globalThis.indexedDB) { this.idb = idb; this.db = null; }

  async #open() {
    if (this.db) return this.db;
    if (!this.idb) throw new Error('This browser cannot keep expeditions (storage is blocked). Allow site data or use the desktop game.');
    const open = this.idb.open(DB_NAME, 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' }); };
    this.db = await request(open);
    return this.db;
  }

  async #tx(mode, fn) {
    const db = await this.#open();
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.')); });
    return result;
  }

  /** The newest usable document of a record: { doc, recovered, future, reason }. */
  static usable(record) {
    let reason = null;
    for (const [doc, recovered] of [[record?.current, false], [record?.previous, true]]) {
      if (!doc) continue;
      try {
        const check = checkSave(migrateSave(structuredClone(doc)));
        if (check.future) return { doc, recovered: false, future: true, reason: check.reason };
        if (check.ok) return { doc, recovered };
        reason = check.reason;
      } catch (error) { reason = error.message; }
    }
    return { doc: null, recovered: true, reason: reason ?? 'empty' };
  }

  async list() {
    const records = await this.#tx('readonly', (s) => request(s.getAll()));
    return records.filter((r) => validSaveId(r?.id)).map((r) => {
      const found = BrowserExpeditionStore.usable(r);
      return found.doc ? { ...saveSummary(found.doc), id: r.id, recovered: found.recovered, incompatible: !!found.future }
        : { ...saveSummary({ id: r.id }), id: r.id, damaged: true, reason: found.reason };
    }).sort((a, b) => b.savedAt - a.savedAt);
  }

  async read(id) {
    const record = await this.#tx('readonly', (s) => request(s.get(id)));
    return record ? BrowserExpeditionStore.usable(record) : null;
  }

  /** Store `doc` as the newest save; the previous valid one is kept as the fallback. */
  async write(doc) {
    if (JSON.stringify(doc).length > MAX_SAVE_BYTES) throw new Error('The expedition is too large to save.');
    return this.#tx('readwrite', async (s) => {
      const record = await request(s.get(doc.id));
      const before = record ? BrowserExpeditionStore.usable(record) : null;
      if (before?.future) throw new Error('This expedition was saved by a newer version of the game.');
      await request(s.put({ id: doc.id, current: doc, previous: before?.doc && !before.recovered ? before.doc : record?.previous ?? null }));
    });
  }

  remove(id) { return this.#tx('readwrite', (s) => request(s.delete(id))); }
}

/** Storage errors in words a player can act on. */
function storageMessage(error) {
  if (error?.name === 'QuotaExceededError') return 'The browser has no storage space left for this site. Free some space or export your expeditions.';
  return error?.message || 'The expedition could not be saved.';
}

export function browserExpeditions(store = new BrowserExpeditionStore(), { now = Date.now, uuid = () => crypto.randomUUID() } = {}) {
  return {
    kind: 'browser',
    store,
    async status() {
      try { await store.list(); return { available: true, reason: null }; } catch (error) { return { available: false, reason: storageMessage(error) }; }
    },
    list: () => store.list(),
    async rename(id, name) {
      const found = await store.read(id);
      if (!found?.doc || found.future) throw new Error('That expedition cannot be renamed.');
      const doc = { ...found.doc, name: cleanSaveName(name), gen: found.doc.gen + 1 };
      await store.write(doc);
      return saveSummary(doc);
    },
    remove: (id) => store.remove(id),
    /** Restore `{ id }` (or create `{ create: { name, level } }`) into the solo worker and keep its saves here. */
    async start({ id, create }, { name, outfit }) {
      let meta, world = {}, level = 0;
      if (id) {
        const found = await store.read(id);
        if (!found) throw new Error('That expedition no longer exists.');
        if (found.future) throw new Error('This expedition was saved by a newer version of the game.');
        if (!found.doc) throw new Error(`This expedition is damaged and has no usable backup (${found.reason}).`);
        meta = { id, name: found.doc.name, createdAt: found.doc.createdAt, gen: found.doc.gen };
        world = found.doc.world;
      } else {
        meta = { id: uuid(), name: cleanSaveName(create?.name), createdAt: now(), gen: 0 };
        level = Number.isInteger(create?.level) ? create.level : 0;
      }
      const net = await Net.local(name, outfit, { level }, world);
      net.expedition = { id: meta.id, name: meta.name, kind: 'browser', savedAt: 0 };
      let chain = Promise.resolve();
      const persist = (data, reason) => {
        const savedAt = now();   // (the moment of the capture, not of the write)
        const run = chain.then(async () => {
          const doc = sealSave({ id: meta.id, name: net.expedition.name, createdAt: meta.createdAt, savedAt, gen: ++meta.gen, world: data });
          try {
            await store.write(doc);
            net.expedition.savedAt = savedAt;
            net.reportSave({ ok: true, at: savedAt, reason });
            return { ok: true, savedAt };
          } catch (error) {
            const status = { ok: false, at: savedAt, reason, error: storageMessage(error) };
            net.reportSave(status);
            return status;
          }
        });
        chain = run.catch(() => {});
        return run;
      };
      net.onSaveCapture = (data, reason) => { void persist(data, reason); };
      net.saveNow = async () => persist(await net.captureSave(), 'manual');
      return net;
    },
    async saveAndQuit(net, { force = false } = {}) {
      const result = await net.saveNow();
      return result.ok || force ? { ...result, ok: result.ok || force } : result;
    },
    /** A file the player can keep (browser data can be cleared). */
    async exportFile(id) {
      const found = await store.read(id);
      if (!found?.doc) throw new Error('That expedition cannot be exported.');
      return new Blob([JSON.stringify(found.doc)], { type: 'application/json' });
    },
    /** Add an exported expedition as a new, independent expedition (it never replaces one). */
    async importFile(file) {
      if (file.size > MAX_SAVE_BYTES) throw new Error('That file is too large to be an expedition.');
      let doc;
      try { doc = migrateSave(JSON.parse(await file.text())); } catch { throw new Error('That file is not an expedition save.'); }
      const check = checkSave(doc);
      if (!check.ok) throw new Error(check.future ? 'That expedition was saved by a newer version of the game.' : `That file is not a usable expedition (${check.reason}).`);
      const copy = sealSave({ id: uuid(), name: `${cleanSaveName(doc.name)}`.slice(0, 24) + ' (import)', createdAt: doc.createdAt, savedAt: now(), gen: 1, world: doc.world });
      await store.write(copy);
      return saveSummary(copy);
    },
  };
}

/** The backend for this page: the desktop host when the desktop store is present, else the browser. */
export function pickExpeditions() {
  return globalThis.dinoStore ? hostExpeditions : browserExpeditions();
}
