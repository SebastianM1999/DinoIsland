// Players on different builds: every hello carries the network version (shared/protocol.js
// PROTOCOL_VERSION), and a host refuses another version with a reason that says who must update,
// before the player touches the world. Steam lobbies of another version are filtered by the same number.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.js';
import { MSG, PROTOCOL_VERSION, versionMismatch } from '../src/shared/protocol.js';
import { STEAM_PROTOCOL } from '../desktop/steam-session.js';

test('versionMismatch names who has to update', () => {
  assert.equal(versionMismatch(PROTOCOL_VERSION), null);
  assert.match(versionMismatch(PROTOCOL_VERSION - 1), /newer version.*update your game/);
  assert.match(versionMismatch(undefined), /update your game/, 'a build from before the version check');
  assert.match(versionMismatch('2'), /update your game/, 'only a number is a version');
  assert.match(versionMismatch(PROTOCOL_VERSION + 1), /older version.*ask the host to update/);
  assert.ok(STEAM_PROTOCOL.endsWith(`-${PROTOCOL_VERSION}`), 'Steam lobbies of another version are not listed');
});

function hello(port, message) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    const seen = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: MSG.HELLO, name: 'Ada', ...message })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      seen.push(msg.t);
      if (msg.t === MSG.WELCOME || msg.t === MSG.REJECT) { ws.close(); resolve({ msg, seen }); }
    });
    ws.on('error', reject);
  });
}

test('a host refuses another build before it joins, and admits its own', async (t) => {
  const { httpServer, host } = createGameServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  t.after(async () => {
    host.stop();
    httpServer.closeAllConnections();
    await new Promise((r) => httpServer.close(r));
  });
  const { port } = httpServer.address();
  assert.equal(host.status().version, PROTOCOL_VERSION);

  const old = await hello(port, {});
  assert.equal(old.msg.t, MSG.REJECT);
  assert.match(old.msg.reason, /update your game/);
  const newer = await hello(port, { v: PROTOCOL_VERSION + 1 });
  assert.match(newer.msg.reason, /ask the host to update/);
  assert.equal(host.world.players.size, 0, 'neither joined the world');

  const same = await hello(port, { v: PROTOCOL_VERSION });
  assert.equal(same.msg.t, MSG.WELCOME);
});
