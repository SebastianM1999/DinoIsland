// The page side of saved expeditions: client/net/expeditions.js (browser backend over a store,
// desktop host backend over /saves), client/core/persistence.js and the desktop preference files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { browserExpeditions, BrowserExpeditionStore, hostExpeditions, pickExpeditions } from '../src/client/net/expeditions.js';
import { migrateLocalPreferences, readItem, writeItem } from '../src/client/core/persistence.js';
import { formatPlayTime, formatSavedAt } from '../src/client/ui/expeditionPanel.js';
import { sealSave, SAVE_SCHEMA } from '../src/shared/saveSchema.js';
import { storageKey } from '../src/shared/brand.js';
import { MSG, PROTOCOL_VERSION } from '../src/shared/protocol.js';
import { Net } from '../src/client/net/net.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld } from '../src/sim/worldSave.js';

const require = createRequire(import.meta.url);
const { PersonalStore, JsonFileStore, identityFolder } = require('../desktop/personal-store.cjs');

const A = '0f8fad5b-d9cb-469f-a165-70867728950e';
const WORLD = exportWorld(new ServerWorld({ send() {} }, { level: 0 }));
const doc = (id, name, savedAt = 1, gen = 1) => sealSave({ id, name, createdAt: 1, savedAt, gen, world: WORLD });

/** An in-memory stand-in for IndexedDB records, with the store's own fallback rules. */
class MemoryStore {
  constructor() { this.records = new Map(); this.fail = null; }
  async list() { return [...this.records.values()].map((r) => ({ ...BrowserExpeditionStore.usable(r), id: r.id })).filter((x) => x.doc).map((x) => ({ id: x.id, name: x.doc.name, savedAt: x.doc.savedAt })); }
  async read(id) { const r = this.records.get(id); return r ? BrowserExpeditionStore.usable(r) : null; }
  async write(d) {
    if (this.fail) { const e = new Error('full'); e.name = this.fail; throw e; }
    const r = this.records.get(d.id);
    this.records.set(d.id, { id: d.id, current: d, previous: r?.current ?? null });
  }
  async remove(id) { this.records.delete(id); }
}

function fakeWorker(posted) {
  return class {
    postMessage(m) {
      posted.push(m);
      if (m.type === 'start') queueMicrotask(() => this.onmessage({ data: { t: MSG.WELCOME, id: 1, slot: 0, now: 0, k: 0, world: { level: { index: 0, variant: 1 } } } }));
      if (m.type === 'save') queueMicrotask(() => this.onmessage({ data: { type: 'save-capture', world: WORLD, reason: 'manual' } }));
    }
    terminate() {}
  };
}

test('browser: a new expedition gets its own id and every capture is stored as the newest save', async (t) => {
  const posted = [];
  const old = globalThis.Worker;
  globalThis.Worker = fakeWorker(posted);
  t.after(() => { globalThis.Worker = old; });
  const store = new MemoryStore();
  let clock = 100;
  const backend = browserExpeditions(store, { now: () => clock, uuid: () => A });
  const net = await backend.start({ create: { name: 'Jungle run', level: 1 } }, { name: 'Ada', outfit: null });
  const start = posted.find((m) => m.type === 'start');
  assert.deepEqual(start.save, {}, 'a new saved expedition');
  assert.equal(start.opts.level, 1);
  assert.equal(net.expedition.id, A);
  const heard = [];
  net.onSave((s) => heard.push(s));
  net.onSaveCapture(WORLD, 'auto');
  clock = 200;
  const result = await backend.saveAndQuit(net);
  assert.equal(result.ok, true);
  assert.equal(store.records.get(A).current.savedAt, 200);
  assert.equal(store.records.get(A).current.name, 'Jungle run');
  assert.equal(store.records.get(A).previous.savedAt, 100, 'the save before stays as a fallback');
  assert.ok(store.records.get(A).current.gen > store.records.get(A).previous.gen);
  assert.deepEqual(heard.map((s) => s.ok), [true, true]);
  // continue it
  const again = await backend.start({ id: A }, { name: 'Ada' });
  assert.equal(posted.filter((m) => m.type === 'start')[1].save.level, WORLD.level);
  assert.equal(again.expedition.name, 'Jungle run');
});

test('browser: a failed write is reported honestly and Save & quit stays until forced', async (t) => {
  const old = globalThis.Worker;
  globalThis.Worker = fakeWorker([]);
  t.after(() => { globalThis.Worker = old; });
  const store = new MemoryStore();
  const backend = browserExpeditions(store, { uuid: () => A });
  const net = await backend.start({ create: { name: 'x' } }, { name: 'Ada' });
  store.fail = 'QuotaExceededError';
  const failed = await backend.saveAndQuit(net);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /no storage space/);
  assert.equal(net.saveStatus.ok, false);
  assert.equal((await backend.saveAndQuit(net, { force: true })).ok, true);
  store.fail = 'Other';
  assert.equal((await backend.saveAndQuit(net)).error, 'full');
});

test('browser: damaged, newer and missing expeditions never start', async () => {
  const store = new MemoryStore();
  const backend = browserExpeditions(store);
  await assert.rejects(backend.start({ id: A }, {}), /no longer exists/);
  store.records.set(A, { id: A, current: { ...doc(A, 'x'), schema: SAVE_SCHEMA + 1 }, previous: null });
  await assert.rejects(backend.start({ id: A }, {}), /newer version/);
  store.records.set(A, { id: A, current: { ...doc(A, 'x'), checksum: 'bad' }, previous: null });
  await assert.rejects(backend.start({ id: A }, {}), /damaged/);
  await assert.rejects(backend.rename(A, 'y'), /cannot be renamed/);
  await assert.rejects(backend.exportFile(A), /cannot be exported/);
});

test('browser: the previous save stands in for a damaged newest one', () => {
  const good = doc(A, 'good');
  assert.equal(BrowserExpeditionStore.usable({ current: { ...good, checksum: 'x' }, previous: good }).recovered, true);
  assert.equal(BrowserExpeditionStore.usable({ current: good, previous: null }).recovered, false);
  assert.equal(BrowserExpeditionStore.usable({ current: null, previous: null }).doc, null);
  assert.equal(BrowserExpeditionStore.usable({ current: { schema: 'x' } }).doc, null);
});

test('browser: rename, export and import never touch another expedition', async () => {
  const store = new MemoryStore();
  let n = 0;
  const ids = [A, '7c9e6679-7425-40de-944b-e07fc1f90ae7'];
  const backend = browserExpeditions(store, { uuid: () => ids[n++] });
  await store.write(doc(A, 'Original'));
  assert.equal((await backend.rename(A, '  New <name> ')).name, 'New name');
  const blob = await backend.exportFile(A);
  n = 1;
  const imported = await backend.importFile(blob);
  assert.notEqual(imported.id, A);
  assert.match(imported.name, /\(import\)$/);
  assert.equal(store.records.size, 2);
  assert.equal((await store.read(A)).doc.name, 'New name');
  await assert.rejects(backend.importFile(new Blob(['{nope'])), /not an expedition save/);
  await assert.rejects(backend.importFile(new Blob([JSON.stringify({ ...doc(A, 'x'), schema: SAVE_SCHEMA + 1 })])), /newer version/);
  await assert.rejects(backend.importFile(new Blob([JSON.stringify({ ...doc(A, 'x'), checksum: 'bad' })])), /not a usable expedition/);
  await assert.rejects(backend.importFile({ size: 1e9 }), /too large/);
  await backend.remove(A);
  assert.equal(store.records.size, 1);
  assert.deepEqual(await backend.status(), { available: true, reason: null });
  const broken = browserExpeditions({ list: async () => { throw new Error('blocked'); } });
  assert.deepEqual(await broken.status(), { available: false, reason: 'blocked' });
});

test('browser store: without IndexedDB it says how to fix it', async () => {
  await assert.rejects(new BrowserExpeditionStore(null).list(), /storage is blocked/);
});

test('desktop: the host backend talks to /saves and joins with the owner token', async (t) => {
  const calls = [];
  const oldFetch = globalThis.fetch, oldWs = globalThis.WebSocket, oldLocation = globalThis.location;
  globalThis.location = { protocol: 'http:', host: '127.0.0.1:5000' };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url === '/saves/open') return { ok: true, json: async () => ({ token: 't0k', expedition: { id: A, name: 'x' }, recovered: true }) };
    if (url === '/saves/close') return { ok: false, json: async () => ({ error: 'disk full' }) };
    if (url === '/saves/status') return { ok: true, json: async () => ({ available: false, reason: 'Start Steam' }) };
    return { ok: true, json: async () => [] };
  };
  let opened;
  globalThis.WebSocket = class { constructor(u) { opened = u; this.readyState = 1; queueMicrotask(() => { this.onopen(); this.onmessage({ data: JSON.stringify({ t: MSG.WELCOME, id: 1, slot: 0, now: 0, world: { level: { index: 0 } } }) }); }); } send() {} close() {} };
  t.after(() => { globalThis.fetch = oldFetch; globalThis.WebSocket = oldWs; globalThis.location = oldLocation; });
  const net = await hostExpeditions.start({ id: A, lobby: 'open' }, { name: 'Ada' });
  assert.equal(opened, 'ws://127.0.0.1:5000/?owner=t0k');
  assert.deepEqual(calls[0], { url: '/saves/open', body: { id: A, lobby: 'open' } });
  assert.equal(net.expedition.recovered, true);
  assert.deepEqual(await hostExpeditions.saveAndQuit(net), { ok: false, error: 'disk full' });
  assert.deepEqual(await hostExpeditions.status(), { available: false, reason: 'Start Steam' });
  assert.deepEqual(await hostExpeditions.list(), []);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(hostExpeditions.rename(A, 'y'), /not answering/);
  globalThis.fetch = async () => ({ ok: false, json: async () => { throw new Error('html'); } });
  await assert.rejects(hostExpeditions.remove(A), /request failed/);
  await assert.rejects(hostExpeditions.setLobby('open'), /request failed/);
  net.close();
  assert.equal(pickExpeditions().kind, 'browser');
});

test('preferences: blocked storage is tolerated, and the desktop store takes over old local preferences once', () => {
  const mem = (data = {}) => ({ data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } });
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(readItem('a', blocked), null);
  assert.equal(writeItem('a', 1, blocked), false);
  assert.equal(writeItem('a', 1, null), false);
  const s = mem();
  assert.equal(writeItem('a', 5, s), true);
  assert.equal(readItem('a', s), '5');
  assert.equal(writeItem('a', null, s), true);
  assert.equal(readItem('a', s), null);
  const local = mem({ [storageKey('name')]: 'Ada', [storageKey('settings')]: '{"fov":80}', [storageKey('profile')]: '{"xp":9}' });
  const desktop = mem({ [storageKey('settings')]: '{"fov":90}' });
  assert.equal(migrateLocalPreferences(desktop, local), 1);
  assert.equal(desktop.data[storageKey('name')], 'Ada');
  assert.equal(desktop.data[storageKey('settings')], '{"fov":90}', 'never overwrites');
  assert.equal(desktop.data[storageKey('profile')], undefined, 'progression is not carried: it belongs to expeditions');
  local.data[storageKey('outfit')] = '{}';
  assert.equal(migrateLocalPreferences(desktop, local), 0, 'only once');
  assert.equal(migrateLocalPreferences(null, local), 0);
  assert.equal(migrateLocalPreferences(blocked, local), 0);
});

test('desktop preference files: routed per device or player, atomic, recovered from the backup', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-prefs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new PersonalStore(root, 'steam-76561198000000000', { delayMs: 5 });
  assert.equal(store.set('di.settings', '{"fov":80}'), true);
  assert.equal(store.set('di.name', 'Ada'), true);
  assert.equal(store.set('di.profile', '{"xp":1}'), false, 'retired progression keys are refused');
  assert.equal(store.set('../evil', 'x'), false);
  assert.equal(store.set('di.name', 42), false);
  assert.equal(store.set('di.big', 'x'.repeat(70 * 1024)), false);
  store.flush();
  const device = path.join(root, 'device', 'settings.json');
  const personal = path.join(root, 'profiles', 'steam-76561198000000000', 'personal.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(device, 'utf8')), { 'di.settings': '{"fov":80}' });
  assert.deepEqual(JSON.parse(fs.readFileSync(personal, 'utf8')), { 'di.name': 'Ada' });
  // another Steam account on this PC has its own name, the same device settings
  const other = new PersonalStore(root, 'steam-76561198000000001');
  assert.deepEqual(other.snapshot(), { 'di.settings': '{"fov":80}' });
  store.set('di.name', null);
  store.set('di.name', 'Bea');
  store.flush();
  fs.writeFileSync(personal, '{torn');
  assert.equal(new JsonFileStore(personal).data['di.name'], 'Ada', 'a damaged file falls back to its backup');
  for (let i = 0; i < 70; i++) store.set(`di.k${i}`, '1');
  assert.ok(Object.keys(store.personal.data).length <= 64, 'a bounded number of keys');
  assert.equal(identityFolder('76561198000000000'), 'steam-76561198000000000');
  assert.equal(identityFolder('../x'), 'local');
  assert.equal(identityFolder(null), 'local');
  const unwritable = new JsonFileStore(path.join(device, 'not-a-dir', 'x.json'));
  assert.equal(unwritable.flush(), false);
});

test('picker labels: play time and save time in words', () => {
  assert.equal(formatPlayTime(20), 'just started');
  assert.equal(formatPlayTime(600), '10 min played');
  assert.equal(formatPlayTime(3 * 3600 + 120), '3 h 2 min played');
  assert.equal(formatSavedAt(0), 'not saved yet');
  const now = new Date(2026, 9, 18, 15, 0).getTime();
  assert.match(formatSavedAt(new Date(2026, 9, 18, 14, 3).getTime(), now), /^saved today, /);
  assert.doesNotMatch(formatSavedAt(new Date(2026, 9, 1, 14, 3).getTime(), now), /today/);
});

test('guest credentials: answered on IDENT, kept from CREDENTIAL, per expedition and bounded', async (t) => {
  const { guestCredential, rememberGuestCredential } = await import('../src/client/core/persistence.js');
  const data = {};
  const mem = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mem });
  const oldWs = globalThis.WebSocket;
  t.after(() => { globalThis.WebSocket = oldWs; if (oldLocal) Object.defineProperty(globalThis, 'localStorage', oldLocal); else delete globalThis.localStorage; });
  const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7', T1 = '11111111-1111-4111-8111-111111111111';
  assert.equal(guestCredential(A), null);
  assert.equal(rememberGuestCredential(A, 'not-a-token'), false);
  assert.equal(rememberGuestCredential('../x', T1), false);
  assert.equal(rememberGuestCredential(B, T1), true);
  const sent = [];
  let ws;
  globalThis.WebSocket = class { constructor() { this.readyState = 1; ws = this; } send(d) { sent.push(JSON.parse(d)); } close() {} };
  const connecting = Net.connect('ws://host', 'Ada', null);
  ws.onopen();
  ws.onmessage({ data: JSON.stringify({ t: MSG.IDENT, world: A }) });
  assert.deepEqual(sent.at(-1), { t: MSG.HELLO, v: PROTOCOL_VERSION, name: 'Ada', outfit: null, credential: null }, 'nothing held for this expedition yet');
  ws.onmessage({ data: JSON.stringify({ t: MSG.WELCOME, id: 1, slot: 0, now: 0, world: { level: { index: 0 } }, r: 1 }) });
  const net = await connecting;
  ws.onmessage({ data: JSON.stringify({ t: MSG.CREDENTIAL, world: A, token: T1, r: 2 }) });
  assert.equal(guestCredential(A), T1);
  assert.equal(guestCredential(B), T1, 'other expeditions keep theirs');
  net.close();
  const again = Net.connect('ws://host', 'Ada', null);
  ws.onopen();
  ws.onmessage({ data: JSON.stringify({ t: MSG.IDENT, world: A }) });
  assert.equal(sent.at(-1).credential, T1, 'only the credential of the asking expedition is sent');
  ws.onmessage({ data: JSON.stringify({ t: MSG.REJECT, reason: 'full' }) });
  await assert.rejects(again, /full/);
  for (let i = 0; i < 45; i++) rememberGuestCredential(`${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, T1);
  assert.ok(Object.keys(JSON.parse(data[storageKey('guest-credentials')])).length <= 40);
  data[storageKey('guest-credentials')] = '[1,2]';
  assert.equal(guestCredential(A), null, 'a damaged store is empty, not an error');
});

test('the Steam bridge carries connections both ways and forgets closed ones', async () => {
  const { createRemoteHost, createBridgeEndpoint } = await import('../desktop/hostBridge.js');
  const { EventEmitter } = await import('node:events');
  const toMain = new EventEmitter();
  const attached = [];
  const host = { attachConnection: (socket, addr, info) => attached.push({ socket, addr, info }) };
  const endpoint = createBridgeEndpoint(host, (m) => toMain.emit('message', m));
  const remote = createRemoteHost({ postMessage: (m) => endpoint(m), on: (e, f) => toMain.on(e, f), off: (e, f) => toMain.off(e, f) });
  const peer = Object.assign(new EventEmitter(), { sent: [], closed: null, send(d) { this.sent.push(d); }, close(code, reason) { this.closed = reason; this.emit('close'); } });
  remote.attachConnection(peer, 'steam', { steamId: '76561198000000001' });
  assert.equal(attached[0].info.steamId, '76561198000000001');
  const socket = attached[0].socket;
  const heard = [];
  socket.on('message', (d) => heard.push(d));
  peer.emit('message', Buffer.from('{"t":"hello"}'));
  assert.deepEqual(heard, ['{"t":"hello"}']);
  socket.send('{"t":"welcome"}');
  assert.deepEqual(peer.sent, ['{"t":"welcome"}']);
  socket.close(4001, 'The host closed the expedition.');
  assert.equal(peer.closed, 'The host closed the expedition.');
  socket.send('late');
  assert.equal(peer.sent.length, 1, 'nothing reaches a closed connection');
  // a guest that leaves: the host side hears it once
  const other = Object.assign(new EventEmitter(), { send() {}, close() { this.emit('close'); } });
  remote.attachConnection(other, 'steam', {});
  let closes = 0;
  attached[1].socket.on('close', () => closes++);
  other.close();
  other.emit('close');
  assert.equal(closes, 1);
  remote.attachConnection(Object.assign(new EventEmitter(), { send() {}, close() {} }));
  let stopped = 0;
  attached[2].socket.on('close', () => stopped++);
  remote.stop();
  assert.equal(stopped, 1, 'a Steam session that ends takes its connections out of the world');
  assert.equal(endpoint({ type: 'identity' }), false, 'other host-process messages are not the bridge\'s');
  assert.equal(endpoint({ type: 'conn-msg', id: 999, data: 'x' }), true);
  endpoint({ type: 'conn-open', id: 'x' });
  assert.equal(attached.length, 3);
  remote.dispose();
});
