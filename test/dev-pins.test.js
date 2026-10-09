// The dev pin tool's server side: the teleport only works in a solo world started with ?dev, in creative mode;
// the HTTP endpoint only answers in a source checkout, from this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACT, MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { handleDevPins } from '../server/devPins.js';

function world(devTools) {
  const w = new ServerWorld({ send() {} }, { level: 0, variant: 3 });
  w.devTools = devTools;
  const { id } = w.join('Pinner');
  return { w, p: w.players.get(id), id };
}

test('ACT.DEV_TP moves a creative player only in a ?dev solo world', () => {
  const target = { x: 40, y: 30, z: -25 };
  for (const [dev, creative, moves] of [[false, true, false], [true, false, false], [true, true, true]]) {
    const { w, p, id } = world(dev);
    p.creative = creative;
    const from = { x: p.x, z: p.z };
    w.receive(id, { t: MSG.ACT, a: ACT.DEV_TP, ...target, state: { s: 99, k: p.epoch, x: target.x, y: target.y, z: target.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 } });
    const moved = p.x === target.x && p.z === target.z && p.y === target.y;
    assert.equal(moved, moves, `dev ${dev}, creative ${creative}`);
    if (!moves) assert.deepEqual({ x: p.x, z: p.z }, from);
  }
});

function fakeReq(url, method, address, body) {
  const listeners = {};
  const req = { url, method, headers: { 'content-type': 'application/json' }, socket: { remoteAddress: address },
    on(ev, fn) { (listeners[ev] ??= []).push(fn); return req; }, destroy() {} };
  const res = { code: 0, body: '', writableEnded: false,
    writeHead(c) { this.code = c; return this; }, end(b = '') { this.body = String(b); this.writableEnded = true; } };
  setImmediate(() => { if (body !== undefined) for (const fn of listeners.data ?? []) fn(Buffer.from(body)); for (const fn of listeners.end ?? []) fn(); });
  return { req, res };
}

test('the pin endpoint writes reports only for a local source checkout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pins-'));
  try {
    // no .git: not a source checkout, nothing answers
    let { req, res } = fakeReq('/__dev/pins', 'GET', '127.0.0.1');
    assert.equal(handleDevPins(req, res, root), true);
    assert.equal(res.code, 404);
    fs.mkdirSync(path.join(root, '.git'));
    // remote address: refused
    ({ req, res } = fakeReq('/__dev/pins', 'GET', '10.0.0.7'));
    handleDevPins(req, res, root);
    assert.equal(res.code, 404);
    // local: write one, list it
    ({ req, res } = fakeReq('/__dev/pin', 'POST', '127.0.0.1', JSON.stringify({ meta: { note: 'Hole in roof!', level: { index: 3, variant: 9 } }, png: 'data:image/png;base64,iVBORw0KGgo=' })));
    handleDevPins(req, res, root);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(res.code, 200);
    const { id } = JSON.parse(res.body);
    assert.match(id, /hole-in-roof$/);
    assert.ok(fs.existsSync(path.join(root, 'dev-pins', `${id}.json`)) && fs.existsSync(path.join(root, 'dev-pins', `${id}.png`)));
    ({ req, res } = fakeReq('/__dev/pins', 'GET', '::1'));
    handleDevPins(req, res, root);
    const list = JSON.parse(res.body);
    assert.equal(list.length, 1);
    assert.equal(list[0].note, 'Hole in roof!');
    assert.equal(list[0].screenshot, `${id}.png`);
    // other paths are not ours
    ({ req, res } = fakeReq('/status', 'GET', '127.0.0.1'));
    assert.equal(handleDevPins(req, res, root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a dev pin revisit link needs no variant on a fixed map, and keeps an override', async () => {
  const { revisitUrl } = await import('../src/client/core/devPins.js');
  const { levelDef } = await import('../src/shared/levels.js');
  const base = 'http://localhost:8080/';
  assert.equal(revisitUrl({ index: 3, variant: levelDef(3).variant }, base), `${base}?island=4&dev`);
  assert.equal(revisitUrl({ index: 3, variant: levelDef(3).variant + 5 }, base), `${base}?island=4&variant=${levelDef(3).variant + 5}&dev`);
});
