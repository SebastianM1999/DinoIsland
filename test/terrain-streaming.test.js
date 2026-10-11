import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainChunks, splitTerrainGeometry } from '../src/client/world/terrainChunks.js';
import { disposeIslandScenes } from '../src/client/core/resources.js';
import { runBuildSteps } from '../src/client/core/buildSteps.js';

function grid(n = 4) {
  const geo = new THREE.BufferGeometry();
  const positions = [], colors = [], surfaces = [], index = [];
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    positions.push(x, Math.sin(x) + Math.cos(z), z);
    colors.push(x / n, z / n, .5);
    surfaces.push(x / n, z / n, .2, .3);
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const a = z * (n + 1) + x, c = a + n + 1;
    index.push(a, c, a + 1, a + 1, c, c + 1);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('surface', new THREE.Float32BufferAttribute(surfaces, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function finish(steps) {
  let step;
  do { step = steps.next(); } while (!step.done);
  return step.value;
}

test('terrain chunks preserve every rendered triangle and smooth attributes across seams', () => {
  const geo = grid();
  const chunks = finish(splitTerrainGeometry(geo, 4, 2));
  assert.equal(chunks.length, 4);
  const original = [];
  for (const idx of geo.index.array) original.push([...geo.attributes.position.array.slice(idx * 3, idx * 3 + 3)].join(','));
  const reconstructed = [];
  for (const ch of chunks) {
    assert(ch.index instanceof Uint16Array);
    for (const idx of ch.index) reconstructed.push([...ch.attributes.position.array.slice(idx * 3, idx * 3 + 3)].join(','));
    for (let local = 0; local < ch.attributes.position.array.length / 3; local++) {
      const p = ch.attributes.position.array.slice(local * 3, local * 3 + 3);
      const global = p[2] * 5 + p[0];
      for (const [name, attr] of Object.entries(geo.attributes)) {
        assert.deepEqual(ch.attributes[name].array.slice(local * attr.itemSize, (local + 1) * attr.itemSize), attr.array.slice(global * attr.itemSize, (global + 1) * attr.itemSize), `${name} is unchanged at ${p}`);
      }
    }
  }
  assert.deepEqual(reconstructed.sort(), original.sort());
  geo.dispose();
});

test('terrain streaming bounds uploads, evicts distant GPU buffers, and revisits complete ground', () => {
  const geo = grid(12);
  const chunks = finish(splitTerrainGeometry(geo, 12, 2));
  const material = new THREE.MeshBasicMaterial();
  const view = new TerrainChunks(chunks, material, 2);
  view.loadAround({ x: 0, z: 0 }, 1);
  assert(view.pending.length > 2);
  view.pump(2);
  assert.equal(view.children.length, 2, 'one loading slice obeys its upload count');
  while (view.pending.length) view.pump(2);
  const first = view.children[0];
  let evicted = 0;
  first.geometry.addEventListener('dispose', () => evicted++);
  view.loadAround({ x: 12, z: 12 }, 1);
  view.pump(Infinity);
  assert.equal(evicted, 1);
  assert(!view.children.includes(first));
  assert(view.children.length < chunks.length / 2, 'only nearby geometry remains resident');
  view.loadAround({ x: 0, z: 0 }, 1);
  view.pump(Infinity);
  const restored = view.children.find(mesh => mesh.userData.chunk.join(',') === first.userData.chunk.join(','));
  assert(restored, 'evicted ground is recreated on revisit');
  assert.deepEqual(restored.geometry.attributes.position.array, first.geometry.attributes.position.array);
  assert.notEqual(restored.geometry, first.geometry);
  const scene = new THREE.Scene(); scene.add(view);
  let materialDisposals = 0;
  material.addEventListener('dispose', () => materialDisposals++);
  view.release();
  disposeIslandScenes(scene);
  assert.equal(materialDisposals, 1);
  assert.equal(evicted, 1, 'teardown does not dispose an evicted buffer again');
  assert.equal(view.chunks.length, 0);
  const detachedChildren = view.children.length;
  view.pump(Infinity);
  assert.equal(view.children.length, detachedChildren, 'a released controller cannot allocate new buffers');
  view.clear();
  geo.dispose();
});

test('construction yields to the UI while preserving builder order and final result', async () => {
  const events = [];
  let clock = 0;
  function* build() { for (let i = 0; i < 6; i++) { events.push(i); clock += 3; yield; } return 'ready'; }
  const result = await runBuildSteps(build(), { now: () => clock, budgetMs: 4, pause: async () => events.push('paint') });
  assert.equal(result, 'ready');
  assert.deepEqual(events, [0, 1, 'paint', 2, 3, 'paint', 4, 5, 'paint']);
});

test('cancelling staged construction closes the builder and prevents later world work', async () => {
  const controller = new AbortController();
  const events = [];
  function* build() { try { events.push('first'); yield; events.push('obsolete'); } finally { events.push('released'); } }
  await assert.rejects(runBuildSteps(build(), { signal: controller.signal, budgetMs: 0, pause: async () => controller.abort() }), { name: 'AbortError' });
  assert.deepEqual(events, ['first', 'released']);
});
