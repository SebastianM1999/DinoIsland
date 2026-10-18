// Guests of a saved expedition (phase 4): Steam players reach the host process's expedition through
// desktop/hostBridge.js and are known by their Steam identity; LAN / internet guests by a host-issued
// credential (server/saveCoordinator.js). Both get their character back exactly once; names never
// identify anybody.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.js';
import { OWNER_KEY, SaveCoordinator, guestKey } from '../server/saveCoordinator.js';
import { SteamSession } from '../desktop/steam-session.js';
import { createRemoteHost, createBridgeEndpoint } from '../desktop/hostBridge.js';
import { MSG } from '../src/shared/protocol.js';
import { SteamHub } from './helpers/fakeSteam.js';

async function saveHost(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dino-guests-'));
  const { httpServer, host, saves, internet } = createGameServer({ saves: true });
  await saves.useRoot(root);
  t.after(async () => {
    await saves.shutdown();
    internet.stop();
    host.stop();
    httpServer.closeAllConnections();
    await new Promise((r) => httpServer.close(r));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { httpServer, host, saves };
}

/** The process channel between main (Steam) and the host process, in memory and asynchronous. */
function processChannel(host) {
  const toMain = new EventEmitter();
  let endpoint = null;
  const channel = {
    postMessage: (m) => setImmediate(() => endpoint(structuredClone(m))),
    on: (e, fn) => toMain.on(e, fn),
    off: (e, fn) => toMain.off(e, fn),
  };
  endpoint = createBridgeEndpoint(host, (m) => setImmediate(() => toMain.emit('message', structuredClone(m))));
  return channel;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('Steam friends play the host process\'s saved expedition and come back to their own characters', async (t) => {
  const { host, saves } = await saveHost(t);
  const hub = new SteamHub();
  const remote = createRemoteHost(processChannel(host));
  const users = [0, 1, 2].map((i) => hub.createUser(i));
  const events = users.map(() => []);
  const sessions = users.map((u, i) => new SteamSession(u, { emit: (e) => events[i].push(e), createHost: () => remote }));
  t.after(() => { sessions.forEach((s) => s.dispose()); remote.dispose(); });
  const pump = async () => { for (let i = 0; i < 4; i++) { sessions.forEach((s) => s.tick()); await settle(); } };

  const { token, expedition } = await saves.create({ name: 'Steam run' }, { lobby: 'open' });
  const [hostSession, guest, stranger] = sessions;
  await assert.rejects(hostSession.hostGame('friends', 'not-a-token'), /Invalid expedition token/);
  const h = await hostSession.hostGame('friends', token);
  hostSession.send(h.sessionId, { t: MSG.HELLO, name: 'Host' });
  const g = await guest.joinGame(h.lobbyId);
  guest.send(g.sessionId, { t: MSG.HELLO, name: 'Ada' });
  await pump();
  const world = host.world;
  assert.deepEqual([...world.players.values()].map((p) => p.key).sort(), [OWNER_KEY, `steam-${users[1].id}`].sort());
  assert.ok(events[1].some((e) => e.message?.t === MSG.WELCOME), 'the guest plays the expedition');

  // the guest earns something and leaves; the expedition keeps the character
  host.playerByKey(`steam-${users[1].id}`).inv.loot.hide = 7;
  host.playerByKey(`steam-${users[1].id}`).prof.xp = 321;
  guest.leave();
  await pump();
  assert.equal(world.roster.get(`steam-${users[1].id}`).inv.loot.hide, 7);

  // Save & quit on the host, then open it again tomorrow
  assert.equal((await saves.close()).ok, true);
  await pump();
  assert.equal(hostSession.sessionId, null, 'closing the expedition ends the Steam session too');
  assert.ok(events[0].some((e) => e.type === 'closed'));
  const reopened = await saves.open(expedition.id, { lobby: 'open' });
  const h2 = await hostSession.hostGame('friends', reopened.token);
  hostSession.send(h2.sessionId, { t: MSG.HELLO, name: 'Host' });
  // someone else called Ada is someone else
  const s = await stranger.joinGame(h2.lobbyId);
  stranger.send(s.sessionId, { t: MSG.HELLO, name: 'Ada' });
  const g2 = await guest.joinGame(h2.lobbyId);
  guest.send(g2.sessionId, { t: MSG.HELLO, name: 'Ada' });
  await pump();
  const back = host.playerByKey(`steam-${users[1].id}`);
  assert.equal(back.inv.loot.hide, 7);
  assert.equal(back.prof.xp, 321);
  assert.equal(host.playerByKey(`steam-${users[2].id}`).inv.loot.hide, 0);
  assert.equal(host.world.roster.size, 0, 'nobody waits twice');
});

test('a private expedition admits no Steam guest, and a Steam identity can only come from the bridge', () => {
  const c = new SaveCoordinator({ timers: { setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} } });
  c.current = { id: '0f8fad5b-d9cb-469f-a165-70867728950e', token: 'tok', lobby: 'private' };
  assert.equal(c.admit({ addr: 'steam', steamId: '76561198000000001' }).ok, false);
  c.current.lobby = 'open';
  assert.deepEqual(c.admit({ addr: 'steam', steamId: '76561198000000001' }), { ok: true, key: 'steam-76561198000000001' });
  // a malformed identity is treated like any other guest: asked for its credential
  assert.deepEqual(c.admit({ addr: 'steam', steamId: 'x' }), { ok: false, ident: c.current.id });
});

/** A LAN guest that does what the client (net.js) does: answer IDENT with its credential, keep CREDENTIAL. */
function lanGuest(port, name, wallet) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    const seen = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: MSG.HELLO, name })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      seen.push(msg.t);
      if (msg.t === MSG.IDENT) ws.send(JSON.stringify({ t: MSG.HELLO, name, credential: wallet[msg.world] ?? null }));
      if (msg.t === MSG.CREDENTIAL) wallet[msg.world] = msg.token;
      if (msg.t === MSG.WELCOME) setTimeout(() => resolve({ ws, seen }), 30);   // (a new guest's CREDENTIAL follows right after)
      if (msg.t === MSG.REJECT) resolve({ ws, rejected: msg.reason, seen });
    });
    ws.on('error', reject);
  });
}
const closeWs = (ws) => new Promise((r) => { if (ws.readyState === WebSocket.CLOSED) { r(); return; } ws.once('close', r); ws.close(); });

test('LAN guests get a credential and their character back with it; a name alone gets nothing', async (t) => {
  const { httpServer, host, saves } = await saveHost(t);
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const { expedition } = await saves.create({ name: 'LAN run' }, { lobby: 'open' });

  const wallet = {};
  const first = await lanGuest(port, 'Ben', wallet);
  assert.deepEqual(first.seen.slice(0, 2), [MSG.IDENT, MSG.WELCOME]);
  const token = wallet[expedition.id];
  assert.match(token, /^[0-9a-f-]{36}$/);
  const key = guestKey(token);
  assert.ok(!key.includes(token), 'the host keeps only a hash of the credential');
  host.playerByKey(key).inv.loot.hide = 4;
  await closeWs(first.ws);
  await settle();
  assert.equal(host.world.roster.get(key).inv.loot.hide, 4);

  // the host saves and restarts the expedition
  await saves.close();
  await saves.open(expedition.id, { lobby: 'open' });
  const strangerWallet = {};
  const impostor = await lanGuest(port, 'Ben', strangerWallet);
  assert.notEqual(strangerWallet[expedition.id], token);
  assert.equal(host.playerByKey(guestKey(strangerWallet[expedition.id])).inv.loot.hide, 0, 'the same name is a new explorer');
  const again = await lanGuest(port, 'Benjamin', wallet);
  assert.ok(!again.seen.includes(MSG.CREDENTIAL), 'a known guest gets no new credential');
  assert.equal(host.playerByKey(key).inv.loot.hide, 4);
  // the same credential twice at once is refused
  const twice = await lanGuest(port, 'Ben', wallet);
  assert.equal(twice.rejected, 'You are already in this expedition.');
  for (const c of [impostor, again]) await closeWs(c.ws);
});

test('an explorer away while the team sailed on returns at the new camp, resupplied once', async (t) => {
  const { host, saves } = await saveHost(t);
  await saves.create({ name: 'Travel' }, { lobby: 'open' });
  const world = host.world;
  const { id } = world.join('Ada', null, undefined, null, 'steam-76561198000000009');
  const p = world.players.get(id);
  p.inv.loot.meat = 2;
  p.inv.arrows = 1; p.inv.arrowUses = [1];
  p.inv.spear = false;
  world.leave(id);
  world.nextLevel();
  const back = world.players.get(world.join('Ada', null, undefined, null, 'steam-76561198000000009').id);
  const sp = world.spawnPoint(back.slot);
  assert.ok(Math.hypot(back.x - sp.x, back.z - sp.z) < 0.01, 'never at the old island\'s coordinates');
  assert.equal(back.inv.loot.meat, 2, 'the backpack is kept');
  assert.equal(back.inv.arrows, world.caps().arrows, 'the travel resupply, as the others got it');
  assert.equal(back.inv.spear, true);
  world.leave(back.id);
  const again = world.players.get(world.join('Ada', null, undefined, null, 'steam-76561198000000009').id);
  assert.equal(again.inv.arrows, world.caps().arrows);
  assert.equal(world.roster.size, 0);
});
