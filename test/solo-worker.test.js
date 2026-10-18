// The solo worker (sim/worker.js) as a saved expedition's host: it restores a save, joins the
// explorer under the owner key and hands captures to the page. Run here with fake worker globals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld } from '../src/sim/worldSave.js';
import { MSG } from '../src/shared/protocol.js';

/** Load a fresh copy of the worker module with its own fake postMessage/close. */
async function bootWorker(t) {
  const posted = [];
  globalThis.postMessage = (m) => posted.push(m);
  let closed = false;
  globalThis.close = () => { closed = true; };
  globalThis.onmessage = null;   // (a worker global; the module assigns it)
  await import(`../src/sim/worker.js?copy=${Math.random()}`);
  const send = (data) => globalThis.onmessage({ data });
  t.after(() => { send({ type: 'stop' }); delete globalThis.postMessage; delete globalThis.close; delete globalThis.onmessage; });
  return { posted, send, closed: () => closed };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a saved expedition comes back in the solo worker with the explorer\'s character', async (t) => {
  const world = new ServerWorld({ send() {} }, { level: 1 });
  const { id } = world.join('Ada', null, undefined, { xp: 777, bonus: 0, skills: {} }, 'owner');
  world.players.get(id).inv.loot.hide = 3;
  world.store.meat = 6;
  const save = JSON.parse(JSON.stringify(exportWorld(world)));
  const { posted, send } = await bootWorker(t);
  await send({ type: 'start', name: 'Ada', outfit: null, opts: {}, save });
  const welcome = posted.find((m) => m.t === MSG.WELCOME);
  assert.equal(welcome.world.level.index, 1);
  assert.equal(welcome.inv.loot.hide, 3);
  assert.equal(welcome.world.store.meat, 6);
  assert.equal(posted.find((m) => m.t === MSG.PROF).prof.xp, 777);
  // the first capture marks the start; a requested one answers Save & quit
  assert.ok(posted.some((m) => m.type === 'save-capture' && m.reason === 'new'));
  send({ type: 'save' });
  const manual = posted.find((m) => m.type === 'save-capture' && m.reason === 'manual');
  assert.equal(manual.world.store.meat, 6);
  assert.equal(manual.world.roster[0].key, 'owner');
  await wait(120);
  assert.ok(posted.some((m) => m.t === MSG.SNAP), 'the worker keeps ticking');
});

test('testing sessions (no save) never send captures', async (t) => {
  const { posted, send } = await bootWorker(t);
  await send({ type: 'start', name: 'Ada', outfit: null, opts: { level: 1, baseStage: 1, raidIn: 5 } });
  assert.ok(posted.find((m) => m.t === MSG.WELCOME));
  send({ type: 'msg', msg: { t: MSG.PING, c: 1 } });
  assert.equal(posted.filter((m) => m.type === 'save-capture' && m.reason !== 'manual').length, 0);
});

test('a save that does not fit this version is refused with a reason', async (t) => {
  const world = new ServerWorld({ send() {} }, { level: 0 });
  const save = exportWorld(world);
  save.fruit = save.fruit.slice(1);
  const { posted, send } = await bootWorker(t);
  await send({ type: 'start', name: 'Ada', outfit: null, opts: {}, save });
  assert.match(posted.find((m) => m.t === MSG.REJECT).reason, /could not be loaded/);
});
