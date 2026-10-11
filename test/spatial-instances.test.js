import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpatialInstances } from '../src/client/world/veg/spatialInstances.js';
import { disposeIslandScenes } from '../src/client/core/resources.js';
import { buildVegetation, buildVegetationSteps, buildVegetationAsync } from '../src/client/world/vegetation.js';
import { BIOMES } from '../src/shared/levels.js';
import { buildSwampDecor, buildSwampDecorSteps } from '../src/client/world/veg/swampDecor.js';

function fixture(xs = [5, 35, 75], options = {}) {
  const group = new THREE.Group(), spatial = new SpatialInstances(group);
  const geometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.BoxGeometry(0.8, 0.8, 0.8)];
  const material = new THREE.MeshBasicMaterial();
  const source = new THREE.InstancedMesh(geometries[0], material, xs.length);
  source.castShadow = true;
  xs.forEach((x, i) => {
    source.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0));
    source.setColorAt(i, new THREE.Color(i / xs.length, 0.5, 1));
  });
  spatial.add(source, { geometries, ...options });
  spatial.setQuality({ lodNear: 20, shadowRange: 70 });
  return { group, spatial, geometries, material };
}

function positions(mesh) {
  return Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12]);
}

test('a distant crown uses lower detail even when its spatial batch has a nearby tree', () => {
  const { spatial } = fixture();
  assert.equal(spatial.chunks.length, 1, 'keep draw batching instead of creating a mesh per tree');
  spatial.update(new THREE.Vector3());
  const draws = spatial.chunks[0].meshes;
  assert.deepEqual(draws.map(positions), [[5], [35], [75]]);
  assert.ok(Math.abs(draws[2].instanceColor.array[0] - 2 / 3) < 0.000001, 'tint follows the selected instance');
  spatial.update(new THREE.Vector3(75, 0, 0));
  assert.deepEqual(draws.map(positions), [[75], [35], [5]], 'moving through the forest retains every tree exactly once');
});

test('LOD boundaries have hysteresis and stationary cameras do not upload instance buffers every frame', () => {
  const { spatial } = fixture([35]);
  const c = spatial.chunks[0], camera = new THREE.Vector3();
  spatial.update(camera);
  const buffers = c.meshes.map(m => m.instanceMatrix.array), versions = c.meshes.map(m => m.instanceMatrix.version);
  for (let i = 0; i < 100; i++) spatial.update(camera);
  assert.deepEqual(c.meshes.map(m => m.instanceMatrix.version), versions);
  c.meshes.forEach((m, i) => assert.equal(m.instanceMatrix.array, buffers[i]));
  spatial.update(camera.set(17, 0, 0));
  assert.equal(c.meshes[0].count, 1);
  spatial.update(camera.set(14, 0, 0));
  assert.equal(c.meshes[0].count, 1, 'the near tree stays near through the hysteresis band');
  spatial.update(camera.set(10, 0, 0));
  assert.equal(c.meshes[1].count, 1, 'it changes detail after leaving the band');
});

test('fog culling excludes distant objects inside a partly visible chunk and restores them on approach', () => {
  const { spatial } = fixture([5, 75]);
  spatial.setCullDistance(40);
  spatial.update(new THREE.Vector3());
  assert.deepEqual(spatial.chunks[0].meshes.flatMap(positions), [5]);
  spatial.update(new THREE.Vector3(75, 0, 0));
  assert.deepEqual(spatial.chunks[0].meshes.flatMap(positions), [75]);
  spatial.setCullDistance(Infinity);
  spatial.update(new THREE.Vector3(75, 0, 0));
  assert.deepEqual(spatial.chunks[0].meshes.flatMap(positions).sort((a, b) => a - b), [5, 75]);
});

test('density changes retain a stable source prefix across detail levels without allocating more draws', () => {
  const { spatial, group } = fixture([5, 35, 75], { density: true });
  const drawCount = group.children.length;
  spatial.setDensity(2 / 3);
  spatial.update(new THREE.Vector3());
  assert.deepEqual(spatial.chunks[0].meshes.flatMap(positions), [5, 35]);
  spatial.setDensity(0);
  spatial.update(new THREE.Vector3());
  assert.ok(group.children.every(m => !m.visible && m.count === 0));
  spatial.setDensity(1);
  spatial.update(new THREE.Vector3());
  assert.equal(group.children.length, drawCount);
  assert.deepEqual(spatial.chunks[0].meshes.flatMap(positions), [5, 35, 75]);
});

test('Medium foliage shadow policy does not remove rock shadows or forest render content', () => {
  const vegetation = fixture([5], { foliage: true }), rock = fixture([5]);
  for (const f of [vegetation, rock]) {
    f.spatial.setQuality({ foliageShadows: false, shadows: true });
    f.spatial.update(new THREE.Vector3());
    assert.equal(f.spatial.chunks[0].mesh.visible, true);
  }
  assert.equal(vegetation.spatial.chunks[0].mesh.castShadow, false);
  assert.equal(rock.spatial.chunks[0].mesh.castShadow, true);
  vegetation.spatial.setQuality({ foliageShadows: true });
  vegetation.spatial.update(new THREE.Vector3());
  assert.equal(vegetation.spatial.chunks[0].mesh.castShadow, true);
});

test('island teardown disposes every LOD instance buffer once and retains shared geometry', () => {
  const { spatial, group, geometries, material } = fixture();
  const disposals = new Map();
  for (const resource of [...group.children, ...geometries, material]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  }
  const draws = [...group.children];
  spatial.update(new THREE.Vector3());
  disposeIslandScenes(group);
  disposeIslandScenes(group);
  assert.deepEqual(draws.map(m => disposals.get(m)), [1, 1, 1]);
  assert.deepEqual([...geometries, material].map(m => disposals.get(m)), [0, 0, 0, 0]);
});

function vegetationFixture() {
  const terrain = { waterLevelAt: () => null, lavaLevelAt: () => null, heightAt: () => 3, slopeAt: () => 0 };
  const layout = {
    biome: { ...BIOMES.jungle, vegetation: { ...BIOMES.jungle.vegetation, grass: 0.03, flowers: 0.3 } },
    plan: { seed: 791, A: 50, B: 30 }, hut: { campfire: { x: -100, z: -100 } },
    trees: [{ id: 1, type: 'palm', x: 12, y: 3, z: 4, scale: 1, rot: 0.2, lean: 0.01, hue: 0.3 }],
    bushes: [{ type: 'fern', x: 15, y: 3, z: 7, scale: 1, rot: 0.5, hue: 0.2 }],
    caves: [], distToPath: () => Infinity, jungleDensity: () => 0,
  };
  return { terrain, layout };
}

function vegetationContent(view) {
  return view.group.children.map(mesh => ({ name: mesh.name, count: mesh.count,
    matrices: [...mesh.instanceMatrix.array], colors: mesh.instanceColor && [...mesh.instanceColor.array],
    vertices: [...mesh.geometry.attributes.position.array] }));
}

test('cooperative vegetation construction preserves the synchronous seeded scenery exactly', async () => {
  const { terrain, layout } = vegetationFixture();
  const sync = buildVegetation(terrain, layout);
  const steps = buildVegetationSteps(terrain, layout);
  let step, yields = 0;
  do { step = steps.next(); if (!step.done) yields++; } while (!step.done);
  let pauses = 0;
  const asyncView = await buildVegetationAsync(terrain, layout, { budgetMs: 0, pause: async () => { pauses++; } });
  assert.ok(yields > 10, 'geometry variants and bounded placement trials provide work boundaries');
  assert.equal(pauses, yields);
  assert.deepEqual(vegetationContent(step.value), vegetationContent(sync));
  assert.deepEqual(vegetationContent(asyncView), vegetationContent(sync));
  for (const view of [sync, step.value, asyncView]) disposeIslandScenes(view.group);
});

test('cancelling vegetation construction releases both staging and completed chunk buffers once', async () => {
  const { terrain, layout } = vegetationFixture();
  const controller = new AbortController(), reason = new Error('menu preview changed');
  const created = new Set(), disposals = new Map(), cached = new Map();
  const originalSet = THREE.InstancedMesh.prototype.setMatrixAt;
  const originalDispatch = THREE.InstancedMesh.prototype.dispatchEvent;
  THREE.InstancedMesh.prototype.setMatrixAt = function (...args) {
    created.add(this);
    for (const resource of [this.geometry, this.material]) if (!cached.has(resource)) {
      cached.set(resource, 0);
      resource.addEventListener('dispose', () => cached.set(resource, cached.get(resource) + 1));
    }
    return originalSet.apply(this, args);
  };
  THREE.InstancedMesh.prototype.dispatchEvent = function (event) {
    if (event.type === 'dispose') disposals.set(this, (disposals.get(this) ?? 0) + 1);
    return originalDispatch.call(this, event);
  };
  try {
    let pauses = 0;
    await assert.rejects(buildVegetationAsync(terrain, layout, {
      signal: controller.signal, budgetMs: 0,
      pause: async () => { if (++pauses === 2) controller.abort(reason); },
    }), error => error === reason);
    assert.ok(created.size >= 3, 'cancellation happens after source and spatial chunk buffers exist');
    for (const mesh of created) assert.equal(disposals.get(mesh), 1, mesh.name);
    for (const count of cached.values()) assert.equal(count, 0, 'cached models survive cancellation');
    const rebuilt = buildVegetation(terrain, layout);
    assert.ok(rebuilt.group.children.some(m => m.count > 0), 'cached models remain usable after cancellation');
    disposeIslandScenes(rebuilt.group);
  } finally {
    THREE.InstancedMesh.prototype.setMatrixAt = originalSet;
    THREE.InstancedMesh.prototype.dispatchEvent = originalDispatch;
  }
});

test('swamp decor sampling and transforms are unchanged when work is split into bounded steps', () => {
  const { terrain, layout } = vegetationFixture();
  terrain.bogMask = true;
  terrain.bogAt = () => 0.6;
  terrain.bogLevelAt = () => 4;
  const sync = buildSwampDecor(terrain, layout), steps = buildSwampDecorSteps(terrain, layout);
  let step, yields = 0;
  do { step = steps.next(); if (!step.done) yields++; } while (!step.done);
  assert.ok(yields > 20, 'sampling and matrix writes yield in batches');
  const content = meshes => meshes.map(m => ({ name: m.name, count: m.count, matrices: [...m.instanceMatrix.array] }));
  assert.deepEqual(content(step.value), content(sync));
  assert.deepEqual(sync.map(m => m.count), [520, 240, 800]);
  for (const mesh of [...sync, ...step.value]) mesh.dispose();
});

test('abandoning swamp decor during matrix construction releases its incomplete source buffer', () => {
  const { terrain, layout } = vegetationFixture();
  terrain.bogMask = true;
  terrain.bogAt = () => 0.6;
  terrain.bogLevelAt = () => 4;
  const steps = buildSwampDecorSteps(terrain, layout), originalSet = THREE.InstancedMesh.prototype.setMatrixAt;
  const meshes = new Set(), disposed = new Map();
  THREE.InstancedMesh.prototype.setMatrixAt = function (...args) {
    if (!meshes.has(this)) {
      meshes.add(this);
      this.addEventListener('dispose', () => disposed.set(this, (disposed.get(this) ?? 0) + 1));
    }
    return originalSet.apply(this, args);
  };
  try {
    while (!meshes.size) assert.equal(steps.next().done, false);
    steps.return();
    for (const mesh of meshes) assert.equal(disposed.get(mesh), 1);
  } finally {
    steps.return();
    THREE.InstancedMesh.prototype.setMatrixAt = originalSet;
  }
});
