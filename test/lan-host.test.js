// The desktop host listens on this machine only; hosting a LAN game (save lobby 'lan') opens its
// LAN port (server/lanListener.js) for exactly as long as that expedition is hosted that way.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.js';
import { LanListener } from '../server/lanListener.js';
import { SaveCoordinator } from '../server/saveCoordinator.js';
import { MSG, PROTOCOL_VERSION } from '../src/shared/protocol.js';

async function desktopHost(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dino-lan-'));
  const server = createGameServer({ saves: true, lanPort: 0 });
  server.lan.log = () => {};
  await server.saves.useRoot(root);
  await new Promise((r) => server.httpServer.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await server.saves.shutdown();
    server.internet.stop();
    server.host.stop();
    server.httpServer.closeAllConnections();
    await new Promise((r) => server.httpServer.close(r));
    await server.lan.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  return server;
}

/** A LAN friend: hello, answer IDENT with no credential yet, until welcome or reject. */
function friend(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    ws.on('open', () => ws.send(JSON.stringify({ t: MSG.HELLO, v: PROTOCOL_VERSION, name: 'Ben' })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.t === MSG.IDENT) ws.send(JSON.stringify({ t: MSG.HELLO, v: PROTOCOL_VERSION, name: 'Ben', credential: null }));
      if (msg.t === MSG.WELCOME || msg.t === MSG.REJECT) resolve({ ws, msg });
    });
    ws.on('error', reject);
  });
}

const reachable = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

test('a solo or internet expedition opens no LAN port; a LAN game opens it until it closes', async (t) => {
  const { httpServer, saves, lan, host } = await desktopHost(t);
  const port = httpServer.address().port;
  const connection = async () => (await fetch(`http://127.0.0.1:${port}/connection`)).json();

  const { expedition } = await saves.create({ name: 'Solo' }, { lobby: 'private' });
  assert.equal(lan.status().open, false);
  await saves.open(expedition.id, { lobby: 'open' });
  assert.equal(lan.status().open, false, 'Steam and internet friends come through loopback');

  await saves.open(expedition.id, { lobby: 'lan' });
  const door = lan.status();
  assert.equal(door.open, true, 'open before the owner is told the game is hosted');
  const info = await connection();
  assert.equal(info.port, door.port, 'the address to share names the LAN port');
  assert.deepEqual(info.lan, door);
  const ben = await friend(door.port);
  assert.equal(ben.msg.t, MSG.WELCOME, 'a LAN friend reaches the same game host');
  assert.equal(host.world.players.size, 1);

  // back to an open lobby: the door closes to newcomers, the player already in stays
  await saves.open(expedition.id, { lobby: 'open' });
  assert.equal(lan.status().open, false);
  assert.equal(await reachable(door.port), false);
  assert.equal(host.world.players.size, 1);

  await saves.open(expedition.id, { lobby: 'lan' });
  assert.equal(lan.status().open, true);
  assert.equal((await saves.close()).ok, true);
  assert.equal(lan.status().open, false, 'Save & quit closes the LAN port');
  ben.ws.close();
});

test('a LAN game whose preferred port is taken uses another one, and a port that cannot open is reported', async (t) => {
  const busy = net.createServer();
  await new Promise((r) => busy.listen(0, '127.0.0.1', r));
  t.after(() => busy.close());
  const taken = busy.address().port;
  const logs = [];
  const lan = new LanListener({ emit() {} }, { port: taken, host: '127.0.0.1', log: (m) => logs.push(m) });
  const [a, b] = await Promise.all([lan.start(), lan.start()]);
  assert.deepEqual(a, b, 'one door, however often it is asked for');
  assert.equal(a.open, true);
  assert.notEqual(a.port, taken);
  assert.deepEqual(await lan.start(), a);
  await lan.stop();
  await lan.stop();
  assert.deepEqual(lan.status(), { open: false, port: taken, error: null });

  const bad = new LanListener({ emit() {} }, { port: 0, host: '203.0.113.1', log: (m) => logs.push(m) });
  const result = await bad.start();
  assert.equal(result.open, false);
  assert.match(result.error, /could not open a port/);
  assert.ok(logs.some((m) => /open on port/.test(m)));
});

test('the coordinator admits guests in a LAN lobby and reports lobby changes in order', async () => {
  const timers = { setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} };
  const changes = [];
  const c = new SaveCoordinator({ timers, onLobby: async (lobby) => { await null; changes.push(lobby); } });
  c.current = { id: '0f8fad5b-d9cb-469f-a165-70867728950e', token: 'tok', lobby: 'private' };
  assert.equal(c.admit({ addr: '192.168.1.20' }).ok, false);
  c.setLobby('lan');
  assert.deepEqual(c.admit({ addr: '192.168.1.20' }), { ok: false, ident: c.current.id }, 'asked for its credential, like any guest');
  c.setLobby('open');
  assert.throws(() => c.setLobby('everyone'), /Unknown lobby/);
  await c.lobbyChange;
  assert.deepEqual(changes, ['lan', 'open']);

  const failing = new SaveCoordinator({ timers, log: (...a) => changes.push(a.join(' ')), onLobby: () => { throw new Error('no port'); } });
  failing.current = { id: 'x', lobby: 'private' };
  failing.setLobby('lan');
  await failing.lobbyChange;
  assert.match(changes.at(-1), /lobby change failed: no port/, 'a LAN failure never fails the expedition');
});
