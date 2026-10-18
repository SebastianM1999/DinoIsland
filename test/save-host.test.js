// A host that keeps the owner's expeditions (server/saveCoordinator.js, saveRoutes.js, gameHost
// load/unload): create, private solo, open lobby, save, Save & Quit, resume, rename, delete.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.js';
import { SaveCoordinator, OWNER_KEY } from '../server/saveCoordinator.js';
import { SaveStore } from '../server/saveStore.js';
import { MSG, EV } from '../src/shared/protocol.js';

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dino-host-saves-'));
  const { httpServer, host, saves, internet } = createGameServer({ saves: true });
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  t.after(async () => {
    await saves.shutdown();
    internet.stop();
    host.stop();
    httpServer.closeAllConnections();   // (fetch keeps its connections alive)
    await new Promise((r) => httpServer.close(r));
    await fs.rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`;
  const call = async (route, body, { headers = {}, method = 'POST' } = {}) => {
    const res = await fetch(`${origin}/saves${route}`, method === 'GET' ? { headers } :
      { method, headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json() };
  };
  const connect = (token, name = 'Ada') => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${token ? `?owner=${token}` : ''}`);
    const inbox = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: MSG.HELLO, name, outfit: null, profile: { xp: 99999 } })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      inbox.push(msg);
      // (a guest of an open expedition is asked for its credential first: this one has none)
      if (msg.t === MSG.IDENT) ws.send(JSON.stringify({ t: MSG.HELLO, name, outfit: null, credential: null }));
      if (msg.t === MSG.WELCOME) resolve({ ws, msg, inbox });
      if (msg.t === MSG.REJECT) resolve({ ws, rejected: msg.reason, inbox });
    });
    ws.on('error', reject);
  });
  const closeWs = (ws) => new Promise((r) => { if (ws.readyState === WebSocket.CLOSED) { r(); return; } ws.once('close', r); ws.close(); });
  return { root, port, host, saves, call, connect, closeWs };
}

test('a host with saves opens nothing until the owner picks an expedition', async (t) => {
  const { call, connect } = await setup(t);
  assert.equal((await call('', null, { method: 'GET' })).status, 409, 'no save folder yet');
  const { rejected } = await connect(null);
  assert.match(rejected, /No expedition is open/);
});

test('solo: create, play privately, save, quit, resume with the same character', async (t) => {
  const { root, host, saves, call, connect, closeWs } = await setup(t);
  assert.equal(await saves.useRoot(root), true);
  assert.deepEqual((await call('', null, { method: 'GET' })).body, []);
  const created = await call('/new', { name: 'My island', level: 0, lobby: 'private' });
  assert.equal(created.status, 200);
  const { token, expedition } = created.body;
  assert.equal(expedition.name, 'My island');
  // only the owner's own connection joins a private expedition
  assert.match((await connect(null, 'Stranger')).rejected, /private/);
  assert.match((await connect('wrong-token', 'Stranger')).rejected, /private/);
  const me = await connect(token);
  assert.equal(me.msg.world.level.index, 0);
  const player = host.playerByKey(OWNER_KEY);
  assert.equal(player.prof.xp, 0, 'progression belongs to the expedition, not to what the client sends');
  player.inv.loot.hide = 9;
  player.prof.xp = 500;
  const saved = await call('/save');
  assert.equal(saved.body.ok, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(me.inbox.some((m) => m.e === EV.SAVED && m.ok), 'the owner hears that the save landed');
  assert.equal((await call('/close')).body.ok, true);
  assert.equal(host.world, null);
  await closeWs(me.ws);
  const list = (await call('', null, { method: 'GET' })).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'My island');
  assert.deepEqual(list[0].party, ['Ada']);
  // resume
  const opened = await call('/open', { id: expedition.id, lobby: 'private' });
  assert.equal(opened.status, 200);
  const again = await connect(opened.body.token);
  assert.equal(again.msg.inv.loot.hide, 9);
  assert.equal(host.playerByKey(OWNER_KEY).prof.xp, 500);
  assert.equal((await connect(opened.body.token)).rejected, 'You are already in this expedition.');
});

test('hosting opens the same expedition to others; New Game never replaces an existing one', async (t) => {
  const { root, host, saves, call, connect } = await setup(t);
  await saves.useRoot(root);
  const a = (await call('/new', { name: 'Solo run', lobby: 'private' })).body;
  await connect(a.token);
  host.world.store.meat = 3;
  assert.equal((await call('/lobby', { lobby: 'open' })).body.open.lobby, 'open');
  const guest = await connect(null, 'Guest');
  assert.ok(guest.msg, 'a guest joins the open lobby');
  assert.equal(host.world.players.size, 2);
  // a second expedition: the first one is saved and closed, not replaced
  const b = (await call('/new', { name: 'With friends', lobby: 'open' })).body;
  assert.notEqual(b.expedition.id, a.expedition.id);
  const list = (await call('', null, { method: 'GET' })).body;
  assert.deepEqual(list.map((s) => s.name).sort(), ['Solo run', 'With friends']);
  assert.equal(list.find((s) => s.name === 'With friends').open, true);
  await call('/open', { id: a.expedition.id });
  assert.equal(host.world.store.meat, 3);
});

test('rename and delete affect only the selected expedition', async (t) => {
  const { root, saves, call } = await setup(t);
  await saves.useRoot(root);
  const a = (await call('/new', { name: 'Same' })).body.expedition;
  const b = (await call('/new', { name: 'Same' })).body.expedition;   // duplicate names are fine: the id is the identity
  assert.equal((await call('/rename', { id: a.id, name: 'Renamed <x>' })).body.name, 'Renamed x');
  assert.equal((await call('/rename', { id: b.id, name: 'Open one' })).body.name, 'Open one');
  assert.match((await call('/delete', { id: b.id })).body.error, /Close this expedition/);
  assert.equal((await call('/delete', { id: a.id })).body.ok, true);
  const list = (await call('', null, { method: 'GET' })).body;
  assert.deepEqual(list.map((s) => s.name), ['Open one']);
  assert.match((await call('/open', { id: a.id })).body.error, /no longer exists/);
  assert.match((await call('/open', { id: 'nope' })).body.error, /Unknown/);
  assert.match((await call('/delete', { id: '../x' })).body.error, /Unknown/);
});

test('only the game page on this machine may manage expeditions', async (t) => {
  const { root, saves, call } = await setup(t);
  await saves.useRoot(root);
  assert.equal((await call('/new', {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/new', {}, { headers: { 'content-type': 'text/plain' } })).status, 403);
  assert.equal((await call('/save', null, { method: 'GET' })).status, 403);
  assert.equal((await call('/nothing')).status, 404);
  assert.equal((await call('/status', null, { method: 'GET' })).body.available, true);
  assert.equal((await call('/new', { name: 'x'.repeat(5000) })).status, 409, 'oversized requests are refused');
});

test('the gate: owner key only from loopback with the token, guests only in an open lobby', () => {
  const c = new SaveCoordinator({ timers: { setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} } });
  assert.match(c.admit({ addr: '127.0.0.1' }).reason, /No expedition/);
  c.current = { id: '0f8fad5b-d9cb-469f-a165-70867728950e', token: 'tok', lobby: 'private' };
  assert.deepEqual(c.admit({ addr: '127.0.0.1', url: '/?owner=tok' }), { ok: true, key: OWNER_KEY });
  assert.equal(c.admit({ addr: '192.168.1.20', url: '/?owner=tok' }).ok, false, 'a LAN machine cannot claim the owner');
  assert.equal(c.admit({ addr: '127.0.0.1', url: '/' }).ok, false);
  c.current.lobby = 'open';
  // a guest is first asked for its credential, then known by it (never by name)
  assert.deepEqual(c.admit({ addr: '192.168.1.20', url: '/' }), { ok: false, ident: c.current.id });
  assert.deepEqual(c.admit({ addr: '127.0.0.1', url: '%%bad' }), { ok: false, ident: c.current.id });
  const fresh = c.admit({ addr: '192.168.1.20', credential: null });
  assert.equal(fresh.issue.world, c.current.id);
  assert.deepEqual(c.admit({ addr: '192.168.1.21', credential: fresh.issue.token }), { ok: true, key: fresh.key });
  assert.notEqual(c.admit({ addr: '192.168.1.20', credential: 'forged' }).key, fresh.key, 'anything else gets a new character');
  assert.throws(() => c.setLobby('everyone'), /Unknown lobby/);
});

test('a failed save keeps the expedition open, tells the owner and retries', async (t) => {
  const { root, host, saves, call, connect } = await setup(t);
  await saves.useRoot(root);
  const { token } = (await call('/new', { name: 'x' })).body;
  const me = await connect(token);
  const write = saves.store.write.bind(saves.store);
  saves.store.write = async () => { const e = new Error('full'); e.code = 'ENOSPC'; throw e; };
  const closing = await call('/close');
  assert.equal(closing.body.ok, false);
  assert.match(closing.body.error, /disk is full/);
  assert.ok(host.world, 'still open: nothing is lost');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(me.inbox.some((m) => m.e === EV.SAVED && m.ok === false));
  assert.match((await call('/status', null, { method: 'GET' })).body.open.error, /disk is full/);
  assert.ok(saves.retryTimer, 'a retry is scheduled');
  saves.store.write = write;
  assert.equal((await call('/close', { force: true })).body.ok, true);
  assert.equal(saves.retryTimer, null);
});

test('checkpoints and autosave write at most one save per burst', async (t) => {
  const { root, host, saves, call, connect } = await setup(t);
  await saves.useRoot(root);
  const { token } = (await call('/new', { name: 'x' })).body;
  await connect(token);
  const reasons = [];
  const save = saves.save.bind(saves);
  saves.save = (reason) => { reasons.push(reason); return save(reason); };
  saves.checkpointDelayMs = 10;
  saves.checkpoint(); saves.checkpoint(); saves.checkpoint();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(reasons, ['checkpoint']);
  host.world.nextLevel();   // the world itself calls the checkpoint
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(reasons, ['checkpoint', 'checkpoint']);
});

test('the save folder is locked against a second instance; shutdown saves and releases it', async (t) => {
  const { root, saves, call, connect, host } = await setup(t);
  assert.equal(await saves.useRoot(root), true);
  class OtherInstance extends SaveStore { constructor(dir) { super(dir, { pid: process.pid + 1 }); } }
  const other = new SaveCoordinator();
  assert.equal(await other.useRoot(root, OtherInstance), false);
  assert.match(other.status().reason, /Another copy of the game/);
  await assert.rejects(other.list(), /Another copy/);
  const { token } = (await call('/new', { name: 'x' })).body;
  await connect(token);
  host.world.store.meat = 5;
  assert.equal((await saves.shutdown()).ok, true);
  assert.equal(saves.current, null);
  const third = new SaveCoordinator();
  assert.equal(await third.useRoot(root), true);
  const [entry] = await third.list();
  assert.equal(entry.name, 'x');
  saves.setUnavailable('Start Steam to load your expeditions.');
  await third.store.unlock();
});
