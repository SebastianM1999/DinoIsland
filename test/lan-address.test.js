import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAddresses } from '../server/lanAddress.js';
import { websocketAddress } from '../src/client/net/lan.js';
import { createGameServer } from '../server/index.js';

test('shareable LAN addresses use the listening port, exclude loopback and prefer physical interfaces', () => {
  const list = lanAddresses(54321, {
    'vEthernet (VM)': [{ family: 'IPv4', address: '172.22.0.1', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '192.168.1.15', internal: false }, { family: 'IPv6', address: '::1', internal: true }],
    loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });
  assert.deepEqual(list.map(entry => entry.address), ['ws://192.168.1.15:54321', 'ws://172.22.0.1:54321']);
});

test('join field accepts plain IPs, explicit ports, IPv6 and full URLs without changing their port', () => {
  assert.equal(websocketAddress(' 192.168.1.10 '), 'ws://192.168.1.10:8080/');
  assert.equal(websocketAddress('192.168.1.10:54321'), 'ws://192.168.1.10:54321/');
  assert.equal(websocketAddress('localhost:80'), 'ws://localhost/');
  assert.equal(websocketAddress('ws://192.168.1.10:80'), 'ws://192.168.1.10/');
  assert.equal(websocketAddress('https://game.example/'), 'wss://game.example/');
  assert.equal(websocketAddress('::1'), 'ws://[::1]:8080/');
  assert.equal(websocketAddress('[::1]:54321'), 'ws://[::1]:54321/');
  for (const invalid of ['', 'not an ip', 'file:///secret', 'ws://user:password@example.com', 'ws://host/#fragment', '192.168.1.10:99999']) assert.throws(() => websocketAddress(invalid));
});

test('HTTP connection info exposes the actual dynamically allocated port', async t => {
  const { httpServer, host } = createGameServer();
  t.after(() => { host.stop(); httpServer.close(); });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/connection`);
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.port, port);
  for (const entry of info.addresses) assert.equal(new URL(entry.address).port, String(port));
});
