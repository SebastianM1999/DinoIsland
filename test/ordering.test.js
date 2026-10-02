// Packet ordering and action/state dependencies under unreliable transports
// (Steam sends snapshots and movement unreliably, actions reliably).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Net } from '../src/client/net/net.js';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, ACT, EQUIP } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { PerfStats } from '../src/client/ui/perfStats.js';

function client() {
  const transport = { sent: [], send(m) { this.sent.push(m); }, close() {} };
  const net = new Net(transport, 'online');
  const snaps = [];
  net.on(MSG.SNAP, (m) => snaps.push(m));
  transport.onMessage({ t: MSG.WELCOME, id: 1, k: 0, now: 1, w: 1, r: 1 });
  return { net, transport, snaps, deliver: (m) => transport.onMessage(m) };
}

test('a reordered older snapshot never reaches the handlers (health/animation stay newest)', () => {
  const { net, snaps, deliver } = client();
  deliver({ t: MSG.SNAP, now: 2, n: 2, w: 1, r: 1, d: [[7, 'hp', 40]] });
  deliver({ t: MSG.SNAP, now: 1.8, n: 1, w: 1, r: 1, d: [[7, 'hp', 70]] });
  deliver({ t: MSG.SNAP, now: 2, n: 2, w: 1, r: 1, d: [[7, 'hp', 70]] });   // duplicate
  assert.deepEqual(snaps.map((s) => s.now), [2]);
  assert.equal(net.telemetry.staleSnapshots, 2);
  clearInterval(net.heartbeat);
});

test('snapshots from another island are dropped', () => {
  const { net, snaps, deliver } = client();
  deliver({ t: MSG.SNAP, now: 3, n: 1, w: 2, r: 1, d: [] });
  assert.equal(snaps.length, 0);
  clearInterval(net.heartbeat);
});

test('a snapshot that overtakes its reliable prerequisite waits for it', () => {
  const { net, snaps, deliver } = client();
  const order = [];
  net.on(MSG.INV, () => order.push('inv'));
  net.on(MSG.SNAP, () => order.push('snap'));
  deliver({ t: MSG.SNAP, now: 2, n: 1, w: 1, r: 2, d: [] });   // server sent INV (r=2) first
  assert.equal(snaps.length, 0);
  deliver({ t: MSG.INV, inv: {}, w: 1, r: 2 });
  assert.deepEqual(order, ['inv', 'snap']);
  clearInterval(net.heartbeat);
});

test('the heartbeat starts on welcome (covers loading) and survives a synchronous echo', () => {
  const { net, transport } = client();
  assert.ok(net.heartbeat);
  assert.ok(transport.sent.some((m) => m.t === MSG.PING));
  net.close();
});

test('actions carry their own movement state, so a lost movement packet cannot reject a shot', () => {
  const w = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = w.join('Shooter');
  const p = w.players.get(id);
  p.eq = EQUIP.indexOf('pistol');
  const ammo = p.inv.guns.pistol;
  const loaded = ammo.loaded;
  // the player sprinted 0.43 m since the last STATE that reached the server
  w.now += 0.05;
  const moved = { x: p.x + 0.43, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 8.6, eq: p.eq, fl: 0 };
  const shot = { t: MSG.ACT, a: ACT.SHOT, kind: 'pistol', o: [moved.x, moved.y + CONFIG.player.eyeHeight, moved.z], dir: [0, 0, -1] };

  w.receiveAction(p, { ...shot });                   // old client: no bundled state
  assert.equal(ammo.loaded, loaded, 'origin 0.43 m off the last known state is rejected');

  w.receiveAction(p, { ...shot, state: { ...moved, s: p.lastSeq + 1, k: p.epoch } });
  assert.equal(ammo.loaded, loaded - 1);
  assert.equal(p.x, moved.x);
});

test('a bundled state with a stale correction epoch is ignored', () => {
  const w = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = w.join('Shooter');
  const p = w.players.get(id);
  p.eq = EQUIP.indexOf('pistol');
  const loaded = p.inv.guns.pistol.loaded;
  const state = { x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 0, eq: p.eq, fl: 0, s: p.lastSeq + 1, k: p.epoch - 1 };
  w.receiveAction(p, { t: MSG.ACT, a: ACT.SHOT, kind: 'pistol', o: [p.x, p.y + CONFIG.player.eyeHeight, p.z], dir: [0, 0, -1], state });
  assert.equal(p.inv.guns.pistol.loaded, loaded);
});

test('changing the stats mode does not report a falsely low FPS', () => {
  const el = { hidden: false, classList: { toggle() {} }, setAttribute() {}, innerHTML: '' };
  const saved = globalThis.document;
  globalThis.document = { createElement: () => el };
  let stats;
  try { stats = new PerfStats({ appendChild() {} }); } finally { globalThis.document = saved; }
  stats.setMode(1);
  const src = { renderer: { info: { render: {}, memory: {} } }, net: { mode: 'local', rtt: 0 }, corrections: 0 };
  for (let i = 0; i < 60; i++) stats.frame(1 / 60, src);   // one 1 s window at 60 FPS
  stats.setMode(1);
  stats.frame(1 / 60, src);
  assert.match(el.innerHTML, /^<span class="good">60 FPS/);
});
