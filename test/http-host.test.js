import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { CONFIG } from '../src/shared/config.js';
import { EQUIP } from '../src/shared/protocol.js';
import { createGameServer } from '../server/index.js';

test('HTTP host serves the game and routes firearm shots and reloads between two co-op players', async (t) => {
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

  // Verify the live transport routes new equipment, private ammo updates,
  // reload completion and remote shot effects to the other player.
  function message(ws, match) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { ws.off('message', receive); reject(new Error('gun message timed out')); }, 4000);
      function receive(raw) {
        const m = JSON.parse(raw.toString());
        if (!match(m)) return;
        clearTimeout(timeout); ws.off('message', receive); resolve(m);
      }
      ws.on('message', receive);
    });
  }
  for (const kind of ['pistol', 'rifle']) {
    const player = host.world.players.get(a.welcome.id);
    a.ws.send(JSON.stringify({ t: 'state', x: player.x, y: player.y, z: player.z, yaw: 0, pitch: 0, eq: EQUIP.indexOf(kind) }));
    const ammo = message(a.ws, m => m.t === 'inv' && m.inv.guns[kind].loaded === CONFIG.weapons[kind].magazine - 1);
    const remote = message(b.ws, m => m.t === 'ev' && m.e === 'shot' && m.kind === kind);
    a.ws.send(JSON.stringify({ t: 'act', a: 'shot', kind, o: [player.x, player.y + CONFIG.player.eyeHeight, player.z], dir: [0, 0, -1] }));
    const [inv, event] = await Promise.all([ammo, remote]);
    assert.equal(inv.inv.guns[kind].reserve, CONFIG.weapons[kind].reserve);
    assert.equal(event.by, a.welcome.id);
    assert.ok(event.end.every(Number.isFinite));
    const reloaded = message(a.ws, m => m.t === 'inv' && m.inv.reloading === null && m.inv.guns[kind].loaded === CONFIG.weapons[kind].magazine);
    a.ws.send(JSON.stringify({ t: 'act', a: 'reload', kind }));
    assert.equal((await reloaded).inv.guns[kind].reserve, CONFIG.weapons[kind].reserve - 1);
  }
});
