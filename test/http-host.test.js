import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

test('HTTP host serves the game and joins two co-op players', async (t) => {
  const { httpServer, host } = createGameServer();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => { host.stop(); httpServer.close(); });
  const base = `http://127.0.0.1:${httpServer.address().port}`;

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Dinosaur Island/);
  const vendor = await fetch(`${base}/vendor/three/build/three.module.js`);
  assert.equal(vendor.status, 200);
  const outside = await fetch(`${base}/src/%2e%2e/package.json`);
  assert.equal(outside.status, 404);

  async function join(name) {
    const ws = new WebSocket(base.replace('http:', 'ws:'));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const welcome = new Promise((resolve, reject) => {
      ws.on('message', function onMessage(raw) {
        const msg = JSON.parse(raw.toString());
        if (msg.t === 'welcome') { ws.off('message', onMessage); resolve(msg); }
      });
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ t: 'hello', name }));
    return { ws, welcome: await welcome };
  }
  const a = await join('A');
  const b = await join('B');
  assert.notEqual(a.welcome.id, b.welcome.id);
  assert.equal(b.welcome.world.players.length, 2);
  const status = await (await fetch(`${base}/status`)).json();
  assert.equal(status.players.length, 2);
});
