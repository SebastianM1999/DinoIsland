import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { InternetHost } from '../server/internetHost.js';

test('internet test forwards only admitted WebSockets and closes when its owner leaves', async t => {
  const { httpServer, host } = createGameServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  let child, origin, started = 0;
  const internet = new InternetHost(httpServer, {
    getHelper: async () => ({ executable: 'fake-helper', config: 'fake-config' }),
    resolveAddress: async () => {},
    spawnProcess: (_file, args, options) => {
      assert.equal(options.windowsHide, true);
      origin = args[args.indexOf('--url') + 1]; started++;
      child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => { child.killed = true; child.emit('exit'); };
      queueMicrotask(() => child.stderr.write('https://friend-test.trycloudflare.com\nRegistered tunnel connection\n'));
      return child;
    },
  });
  t.after(() => { internet.stop(); host.stop(); httpServer.close(); });
  // Attach the same owner lifecycle hook used by createGameServer.
  const [state, concurrent] = await Promise.all([internet.start(), internet.start()]);
  assert.equal(started, 1);
  assert.equal(state.address, concurrent.address);
  assert.equal(state.state, 'ready');
  assert.match(state.address, /^wss:\/\/friend-test\.trycloudflare\.com\/\?room=[a-f0-9]{48}$/);
  assert.equal((await fetch(`${origin}/src/client/main.js`)).status, 404);
  await new Promise((resolve, reject) => {
    const unauthorized = new WebSocket(origin.replace('http:', 'ws:'));
    unauthorized.on('unexpected-response', (_req, response) => {
      assert.equal(response.statusCode, 403); unauthorized.terminate(); resolve();
    });
    unauthorized.on('open', () => reject(new Error('Unauthorized peer admitted')));
    unauthorized.on('error', () => {});
  });
  const room = new URL(state.address).search;
  const guest = new WebSocket(`${origin.replace('http:', 'ws:')}/${room}`);
  t.after(() => guest.terminate());
  const welcome = await new Promise((resolve, reject) => {
    guest.once('error', reject);
    guest.once('open', () => guest.send(JSON.stringify({ t: 'hello', name: 'Remote friend' })));
    guest.on('message', raw => { const msg = JSON.parse(raw); if (msg.t === 'welcome') resolve(msg); });
  });
  assert.equal(host.world.players.get(welcome.id).name, 'Remote friend');
  // A real host connection is closed by the server when its client exits.
  const owner = new EventEmitter();
  internet.trackHost(owner, { url: new URL(state.localHostAddress).pathname + new URL(state.localHostAddress).search });
  const closed = new Promise(resolve => guest.once('close', resolve));
  owner.emit('close');
  await closed;
  assert.equal(internet.status().state, 'stopped');
  assert.equal(child.killed, true);
  assert.equal(internet.proxy, null);
});

test('internet control endpoints reject cross-origin starts and untrusted requests', async t => {
  const { httpServer, host } = createGameServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => { host.stop(); httpServer.close(); });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  assert.equal((await fetch(`${base}/internet`)).status, 200);
  for (const origin of ['https://untrusted.example', 'http://localhost:1']) {
    const res = await fetch(`${base}/internet/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
    assert.equal(res.status, 403);
  }
  assert.equal((await fetch(`${base}/internet/start`)).status, 403);
});

test('tunnel startup failures release resources and allow a retry', async t => {
  const { httpServer, host } = createGameServer();
  let attempts = 0;
  const internet = new InternetHost(httpServer, { getHelper: async () => { attempts++; throw new Error('Download failed'); } });
  t.after(() => { internet.stop(); host.stop(); httpServer.close(); });
  await assert.rejects(internet.start(), /Download failed/);
  assert.equal(internet.status().state, 'stopped');
  await assert.rejects(internet.start(), /Download failed/);
  assert.equal(attempts, 2);
});

test('stopping during DNS resolution cannot revive the tunnel', async t => {
  const { httpServer, host } = createGameServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  let finishDNS, enteredDNS;
  const resolving = new Promise(resolve => { enteredDNS = resolve; });
  const internet = new InternetHost(httpServer, {
    getHelper: async () => ({ executable: 'fake-helper', config: 'fake-config' }),
    resolveAddress: () => { enteredDNS(); return new Promise(resolve => { finishDNS = resolve; }); },
    spawnProcess: () => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => child.emit('exit');
      queueMicrotask(() => child.stderr.write('https://friend-test.trycloudflare.com\nRegistered tunnel connection\n'));
      return child;
    },
  });
  t.after(() => { internet.stop(); host.stop(); httpServer.close(); });
  const starting = internet.start();
  const rejected = assert.rejects(starting, /abort|cancel/i);
  await resolving;
  internet.stop();
  finishDNS();
  await rejected;
  assert.equal(internet.status().state, 'stopped');
  assert.equal(internet.proxy, null);
});
