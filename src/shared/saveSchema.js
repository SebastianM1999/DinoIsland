// The expedition save document: one envelope format for every host (desktop files, a Node
// host's data directory, browser IndexedDB). Pure: no clock, no randomness, no I/O. Hosts
// pass the time and the world id in; the world section comes from sim/worldSave.js.
//
//   { kind, schema, content, id, name, createdAt, savedAt, gen,
//     summary: { level, variant, playSeconds, party, creative }, checksum, world }
//
// The checksum (FNV-1a over the world JSON) only catches accidental corruption (a torn or
// edited file). It is not anti-cheat: the host owns its saves.

import { LEVELS } from './levels.js';

export const SAVE_KIND = 'dino-island-expedition';
/** Bump with a migration in MIGRATIONS when the document layout changes. */
export const SAVE_SCHEMA = 1;
/** Bump when island content (layout ids, spot lists, loot keys) changes incompatibly. */
export const SAVE_CONTENT = 1;
export const MAX_SAVE_BYTES = 8 * 1024 * 1024;
export const SAVE_NAME_MAX = 32;
/** Expedition ids are random UUIDs; they are also folder names, so nothing else is accepted. */
export const SAVE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const validSaveId = (id) => typeof id === 'string' && SAVE_ID.test(id);

/** A display name: printable, trimmed, at most SAVE_NAME_MAX characters. Never used as a path. */
export function cleanSaveName(name, fallback = 'Expedition') {
  const clean = String(name ?? '').replace(/[^\p{L}\p{N} _\-.'!?&()]/gu, '').replace(/\s+/g, ' ').trim().slice(0, SAVE_NAME_MAX);
  return clean || fallback;
}

/** FNV-1a (32 bit) of a string, as 8 hex digits. */
export function saveChecksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Wrap a world section (sim/worldSave.js `exportWorld`) in the envelope.
 * @param {{ id:string, name:string, createdAt:number, savedAt:number, gen:number, world:object }} p
 */
export function sealSave({ id, name, createdAt, savedAt, gen, world }) {
  const players = world.roster ?? [];
  return {
    kind: SAVE_KIND,
    schema: SAVE_SCHEMA,
    content: SAVE_CONTENT,
    id,
    name: cleanSaveName(name),
    createdAt,
    savedAt,
    gen,
    summary: {
      level: world.level,
      variant: world.variant,
      playSeconds: Math.floor(world.now),
      party: players.map((p) => p.name).slice(0, 8),
      creative: !!world.creativeUsed,
    },
    checksum: saveChecksum(JSON.stringify(world)),
    world,
  };
}

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;

/** Pure sequential upgrades: MIGRATIONS[n] turns a schema n document into schema n + 1. */
const MIGRATIONS = {};

/** Upgrade an older document in place (a copy is the caller's choice). */
export function migrateSave(doc) {
  while (plain(doc) && doc.schema < SAVE_SCHEMA) {
    const step = MIGRATIONS[doc.schema];
    if (!step) throw new Error(`No migration from save schema ${doc.schema}`);
    step(doc);
    doc.schema++;
  }
  return doc;
}

/**
 * Check a parsed document before anything uses it.
 * @returns {{ ok:true } | { ok:false, reason:string, future?:boolean }}
 */
export function checkSave(doc) {
  if (!plain(doc) || doc.kind !== SAVE_KIND) return { ok: false, reason: 'not an expedition save' };
  if (!count(doc.schema) || !count(doc.content)) return { ok: false, reason: 'missing version' };
  if (doc.schema > SAVE_SCHEMA || doc.content > SAVE_CONTENT) return { ok: false, reason: 'made by a newer version of the game', future: true };
  if (!validSaveId(doc.id)) return { ok: false, reason: 'bad expedition id' };
  if (!count(doc.gen) || !Number.isFinite(doc.savedAt) || !Number.isFinite(doc.createdAt)) return { ok: false, reason: 'bad header' };
  const w = doc.world;
  if (!plain(w) || !Number.isInteger(w.level) || w.level < 0 || w.level >= LEVELS.length) return { ok: false, reason: 'bad island' };
  if (!Number.isFinite(w.now) || w.now < 0 || !count(w.nextId)) return { ok: false, reason: 'bad clock' };
  for (const key of ['items', 'traps', 'fruit', 'resources', 'torchSpawns', 'relics', 'roster', 'carcasses', 'bosses', 'wallTorchesLit', 'upgrades']) {
    if (!Array.isArray(w[key])) return { ok: false, reason: `bad ${key}` };
  }
  if (w.items.length > 5000 || w.traps.length > 500 || w.roster.length > 64 || w.carcasses.length > 500) return { ok: false, reason: 'too large' };
  for (const key of ['store', 'mission', 'base', 'raids']) if (!plain(w[key])) return { ok: false, reason: `bad ${key}` };
  if (doc.checksum !== saveChecksum(JSON.stringify(w))) return { ok: false, reason: 'checksum mismatch' };
  return { ok: true };
}

/** What a save list shows; safe to read from a document that failed `checkSave` with `future`. */
export function saveSummary(doc) {
  const s = plain(doc?.summary) ? doc.summary : {};
  const level = Number.isInteger(s.level) ? s.level : 0;
  return {
    id: doc?.id,
    name: cleanSaveName(doc?.name),
    level,
    island: LEVELS[level]?.name ?? `Island ${level + 1}`,
    playSeconds: count(s.playSeconds) ? s.playSeconds : 0,
    party: Array.isArray(s.party) ? s.party.filter((n) => typeof n === 'string').slice(0, 8) : [],
    creative: !!s.creative,
    createdAt: Number.isFinite(doc?.createdAt) ? doc.createdAt : 0,
    savedAt: Number.isFinite(doc?.savedAt) ? doc.savedAt : 0,
    gen: count(doc?.gen) ? doc.gen : 0,
  };
}
