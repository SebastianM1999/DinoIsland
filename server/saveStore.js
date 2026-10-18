// Expedition files on disk: one folder per world UUID, one immutable file per save generation.
//
//   <root>/<world-uuid>/gen-000000012.json   newest valid generation wins
//   <root>/<world-uuid>/gen-000000011.json   kept as backups (KEEP generations in all)
//   <root>/<world-uuid>/gen-000000010.bad    a damaged generation, kept for diagnosis
//   <root>/.lock                             the process that owns this root
//
// A generation is written to a temporary file, flushed to disk, closed and only then
// renamed to its final, never-before-used name; older generations are pruned afterwards.
// So a crash at any point leaves the previous generation intact. Names come only from
// validated UUIDs and counters: nothing a player types becomes part of a path.

import fs from 'node:fs/promises';
import path from 'node:path';
import { checkSave, migrateSave, saveSummary, validSaveId, MAX_SAVE_BYTES } from '../src/shared/saveSchema.js';

export const KEEP = 4;
const GEN = /^gen-(\d{9})\.json$/;
const ANY_GEN = /^gen-(\d{9})\.(json|bad)$/;
const genName = (gen) => `gen-${String(gen).padStart(9, '0')}.json`;

export class SaveStoreError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** A message a player can act on, for a failed file operation. */
export function describeIoError(error) {
  switch (error?.code) {
    case 'ENOSPC': return 'The disk is full. Free some space, then save again.';
    case 'EACCES': case 'EPERM': return 'The save folder is not writable (permissions or antivirus).';
    case 'EROFS': return 'The save folder is on a read-only drive.';
    case 'TOO_LARGE': return 'The expedition is too large to save.';
    default: return error?.message || 'The expedition could not be saved.';
  }
}

export class SaveStore {
  /** @param {string} root folder that holds one sub-folder per expedition */
  constructor(root, { keep = KEEP, fsApi = fs, pid = process.pid } = {}) {
    this.root = root;
    this.keep = Math.max(2, keep);
    this.fs = fsApi;
    this.pid = pid;
    this.locked = false;
  }

  #dir(id) {
    if (!validSaveId(id)) throw new SaveStoreError('Unknown expedition.', 'BAD_ID');
    return path.join(this.root, id);
  }

  /**
   * Become the only writer of this root (a second game instance must not write the same
   * expeditions). A lock left by a process that no longer runs is taken over.
   */
  async lock() {
    await this.fs.mkdir(this.root, { recursive: true });
    const file = path.join(this.root, '.lock');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.fs.writeFile(file, String(this.pid), { flag: 'wx' });
        this.locked = true;
        return true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const owner = Number(await this.fs.readFile(file, 'utf8').catch(() => ''));
        if (owner === this.pid || !processAlive(owner)) { await this.fs.rm(file, { force: true }); continue; }
        return false;
      }
    }
    return false;
  }

  async unlock() {
    if (!this.locked) return;
    this.locked = false;
    await this.fs.rm(path.join(this.root, '.lock'), { force: true }).catch(() => {});
  }

  /** Generation numbers in the folder, newest first (ANY_GEN: damaged ones too). */
  async #generations(id, pattern = GEN) {
    let names;
    try { names = await this.fs.readdir(this.#dir(id)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return names.map((n) => pattern.exec(n)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => b - a);
  }

  /**
   * The newest generation that parses and passes the check.
   * @returns {Promise<{ doc, gen, recovered:boolean, future?:boolean, reason?:string } | null>}
   */
  async read(id) {
    const dir = this.#dir(id);
    const gens = await this.#generations(id);
    let recovered = false, lastReason = null;
    for (const gen of gens) {
      const file = path.join(dir, genName(gen));
      let doc, reason;
      try {
        const stat = await this.fs.stat(file);
        if (stat.size > MAX_SAVE_BYTES) throw new Error('too large');
        doc = migrateSave(JSON.parse(await this.fs.readFile(file, 'utf8')));
        const check = checkSave(doc);
        if (check.future) return { doc, gen, recovered: false, future: true, reason: check.reason };
        if (!check.ok) reason = check.reason;
        else if (doc.id !== id) reason = 'belongs to another expedition';
      } catch (error) {
        reason = error.message;
      }
      if (!reason) return { doc, gen, recovered };
      // keep the damaged file for diagnosis, out of the way of the generations
      recovered = true;
      lastReason = reason;
      await this.fs.rename(file, file.replace(/\.json$/, '.bad')).catch(() => {});
    }
    // nothing usable: still an expedition (damaged), unless the folder holds no generation at all
    const damaged = gens.length || (await this.#generations(id, ANY_GEN)).length;
    return damaged ? { doc: null, gen: 0, recovered: true, reason: lastReason ?? 'every save of it is damaged' } : null;
  }

  /** Every expedition in the root with its summary; damaged or newer ones are listed, never hidden. */
  async list() {
    let names;
    try { names = await this.fs.readdir(this.root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const out = [];
    for (const id of names.filter(validSaveId)) {
      const found = await this.read(id).catch((error) => ({ doc: null, reason: error.message }));
      if (!found) continue;
      if (found.doc) out.push({ ...saveSummary(found.doc), id, recovered: !!found.recovered, incompatible: !!found.future });
      else out.push({ ...saveSummary({ id }), id, damaged: true, reason: found.reason });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Write `doc` as the next generation of its expedition. Returns the generation number. */
  async write(doc) {
    const dir = this.#dir(doc.id);
    const text = JSON.stringify(doc);
    if (Buffer.byteLength(text) > MAX_SAVE_BYTES) throw new SaveStoreError('The expedition is too large to save.', 'TOO_LARGE');
    await this.fs.mkdir(dir, { recursive: true });
    const gens = await this.#generations(doc.id);
    // a newer game's save is never overwritten by an older game
    if (gens.length) {
      const current = await this.read(doc.id);
      if (current?.future) throw new SaveStoreError('This expedition was saved by a newer version of the game.', 'FUTURE');
    }
    // (above every number ever used here, damaged ones included: a generation name is never reused)
    const gen = Math.max(doc.gen ?? 0, ((await this.#generations(doc.id, ANY_GEN))[0] ?? 0) + 1);
    doc.gen = gen;
    const body = JSON.stringify(doc);
    const final = path.join(dir, genName(gen));
    const temp = `${final}.${this.pid}.tmp`;
    const handle = await this.fs.open(temp, 'w');
    try {
      await handle.writeFile(body, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.fs.rename(temp, final);
    await syncDir(this.fs, dir);
    // prune: newest `keep` generations stay, stale temp files of crashed writes go
    for (const old of (await this.#generations(doc.id)).slice(this.keep)) await this.fs.rm(path.join(dir, genName(old)), { force: true });
    for (const name of await this.fs.readdir(dir)) if (name.endsWith('.tmp')) await this.fs.rm(path.join(dir, name), { force: true });
    return gen;
  }

  /** Delete one expedition (all its generations). Only that UUID's folder is touched. */
  async remove(id) {
    await this.fs.rm(this.#dir(id), { recursive: true, force: true });
  }
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** Make the rename itself durable where the platform allows it (not on Windows). */
async function syncDir(fsApi, dir) {
  if (process.platform === 'win32') return;
  let handle;
  try { handle = await fsApi.open(dir, 'r'); await handle.sync(); } catch { /* not supported here */ } finally { await handle?.close().catch(() => {}); }
}
