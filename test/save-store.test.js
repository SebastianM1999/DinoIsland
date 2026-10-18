// server/saveStore.js: generations on disk, recovery from damaged files, locking, limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SaveStore, describeIoError, KEEP } from '../server/saveStore.js';
import { sealSave, SAVE_SCHEMA } from '../src/shared/saveSchema.js';
import { ServerWorld } from '../src/sim/world.js';
import { exportWorld } from '../src/sim/worldSave.js';

const A = '0f8fad5b-d9cb-469f-a165-70867728950e';
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const world = new ServerWorld({ send() {} }, { level: 0 });
const doc = (id, name = 'Run', savedAt = 1) => sealSave({ id, name, createdAt: 1, savedAt, gen: 0, world: exportWorld(world) });

async function tempStore(t, opts) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dino-saves-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new SaveStore(root, opts) };
}

test('every save is a new generation; only the newest few are kept', async (t) => {
  const { root, store } = await tempStore(t);
  for (let i = 1; i <= KEEP + 3; i++) assert.equal(await store.write(doc(A, `Run ${i}`, i)), i);
  const files = (await fs.readdir(path.join(root, A))).sort();
  assert.equal(files.length, KEEP);
  assert.equal(files.at(-1), 'gen-000000007.json');
  const { doc: newest, gen } = await store.read(A);
  assert.equal(gen, KEEP + 3);
  assert.equal(newest.name, `Run ${KEEP + 3}`);
});

test('a damaged newest generation falls back to the previous one and is kept for diagnosis', async (t) => {
  const { root, store } = await tempStore(t);
  await store.write(doc(A, 'good', 1));
  await store.write(doc(A, 'newer', 2));
  const newest = path.join(root, A, 'gen-000000002.json');
  await fs.writeFile(newest, (await fs.readFile(newest, 'utf8')).slice(0, 200));   // a torn write
  const found = await store.read(A);
  assert.equal(found.recovered, true);
  assert.equal(found.doc.name, 'good');
  assert.ok((await fs.readdir(path.join(root, A))).includes('gen-000000002.bad'));
  // the next save continues above every generation seen, never reusing the damaged number
  assert.equal(await store.write(doc(A, 'after', 3)), 3);
  const [listed] = await store.list();
  assert.equal(listed.name, 'after');
});

test('an expedition with no usable generation is listed as damaged, not hidden', async (t) => {
  const { root, store } = await tempStore(t);
  await fs.mkdir(path.join(root, A), { recursive: true });
  await fs.writeFile(path.join(root, A, 'gen-000000001.json'), '{"kind":"dino-island-expedition"');
  const [entry] = await store.list();
  assert.equal(entry.id, A);
  assert.equal(entry.damaged, true);
  assert.equal((await store.read(A)).doc, null);
});

test('a save made by a newer game is listed as incompatible and never overwritten', async (t) => {
  const { root, store } = await tempStore(t);
  const future = { ...doc(A), schema: SAVE_SCHEMA + 1 };
  await fs.mkdir(path.join(root, A), { recursive: true });
  await fs.writeFile(path.join(root, A, 'gen-000000005.json'), JSON.stringify(future));
  const [entry] = await store.list();
  assert.equal(entry.incompatible, true);
  await assert.rejects(store.write(doc(A)), (e) => e.code === 'FUTURE');
  assert.deepEqual(await fs.readdir(path.join(root, A)), ['gen-000000005.json']);
});

test('expeditions are independent: deleting one keeps every other', async (t) => {
  const { store } = await tempStore(t);
  await store.write(doc(A, 'A', 1));
  await store.write(doc(B, 'B', 2));
  assert.deepEqual((await store.list()).map((s) => s.name), ['B', 'A']);
  await store.remove(A);
  assert.deepEqual((await store.list()).map((s) => s.name), ['B']);
  assert.equal(await store.read(A), null);
});

test('paths only come from expedition ids', async (t) => {
  const { store } = await tempStore(t);
  await assert.rejects(store.read('../escape'), (e) => e.code === 'BAD_ID');
  await assert.rejects(store.remove('C:\\Windows'), (e) => e.code === 'BAD_ID');
  await assert.rejects(store.write({ ...doc(A), id: '..' }), (e) => e.code === 'BAD_ID');
  assert.deepEqual(await new SaveStore(path.join(os.tmpdir(), 'dino-missing-root-x')).list(), []);
});

test('a leftover temporary file of a crashed write is ignored and cleaned up', async (t) => {
  const { root, store } = await tempStore(t);
  await store.write(doc(A, 'first', 1));
  await fs.writeFile(path.join(root, A, 'gen-000000002.json.123.tmp'), '{"half');
  assert.equal((await store.read(A)).doc.name, 'first');
  await store.write(doc(A, 'second', 2));
  assert.ok(!(await fs.readdir(path.join(root, A))).some((n) => n.endsWith('.tmp')));
});

test('a failed write leaves the previous generation intact', async (t) => {
  const { root } = await tempStore(t);
  const good = new SaveStore(root);
  await good.write(doc(A, 'safe', 1));
  const failing = new SaveStore(root, { fsApi: { ...fs, rename: async () => { const e = new Error('no space'); e.code = 'ENOSPC'; throw e; } } });
  await assert.rejects(failing.write(doc(A, 'lost', 2)), (e) => e.code === 'ENOSPC');
  assert.equal((await good.read(A)).doc.name, 'safe');
  assert.match(describeIoError({ code: 'ENOSPC' }), /disk is full/);
  assert.match(describeIoError({ code: 'EACCES' }), /not writable/);
  assert.match(describeIoError({ code: 'EROFS' }), /read-only/);
  assert.match(describeIoError({ code: 'TOO_LARGE' }), /too large/);
  assert.equal(describeIoError(new Error('odd')), 'odd');
  assert.match(describeIoError(null), /could not be saved/);
});

test('one writer per save folder: a running instance keeps the lock, a dead one loses it', async (t) => {
  const { root } = await tempStore(t);
  const first = new SaveStore(root);
  assert.equal(await first.lock(), true);
  const second = new SaveStore(root, { pid: process.pid + 1 });
  assert.equal(await second.lock(), false, 'this test process still runs');
  await first.unlock();
  assert.equal(await second.lock(), true);
  await fs.writeFile(path.join(root, '.lock'), '999999999');
  const third = new SaveStore(root, { pid: process.pid + 2 });
  assert.equal(await third.lock(), true, 'a stale lock of a vanished process is taken over');
  await third.unlock();
  await third.unlock();
});

test('oversized expeditions are refused before anything is written', async (t) => {
  const { root, store } = await tempStore(t);
  const big = doc(A);
  big.world.items = Array.from({ length: 1 }, () => ({ pad: 'x'.repeat(9 * 1024 * 1024) }));
  await assert.rejects(store.write(big), (e) => e.code === 'TOO_LARGE');
  await assert.rejects(fs.readdir(path.join(root, A)));
});
