import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpatialInstances } from '../src/client/world/veg/spatialInstances.js';
import { disposeIslandScenes } from '../src/client/core/resources.js';

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
