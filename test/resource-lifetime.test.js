import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retainResource, retainObjectResources, disposeIslandScenes } from '../src/client/core/resources.js';

function disposals(resource) {
  let count = 0;
  resource.addEventListener('dispose', () => count++);
  return () => count;
}

test('leaving an island disposes shared island-owned GPU objects once across scenes', () => {
  const world = new THREE.Scene(), viewmodel = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const map = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map });
  const counts = [geometry, material, map].map(disposals);
  world.add(new THREE.Mesh(geometry, material));
  viewmodel.add(new THREE.Mesh(geometry, [material, material]));
  disposeIslandScenes(world, viewmodel, null);
  assert.deepEqual(counts.map(count => count()), [1, 1, 1]);
  assert.equal(world.children.length, 0);
  assert.equal(viewmodel.children.length, 0);
  disposeIslandScenes(world, viewmodel);
  assert.deepEqual(counts.map(count => count()), [1, 1, 1], 'repeated teardown does not dispose detached resources again');
});

test('cached model resources survive island teardown and can be reused on the next island', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const model = new THREE.Group();
  model.add(new THREE.Mesh(geometry, material), new THREE.Group());
  const counts = [geometry, material, texture].map(disposals);
  assert.equal(retainObjectResources(model), model);
  scene.add(model);
  disposeIslandScenes(scene);
  assert.deepEqual(counts.map(count => count()), [0, 0, 0]);
  const next = new THREE.Scene();
  next.add(new THREE.Mesh(geometry, material));
  disposeIslandScenes(next);
  assert.deepEqual(counts.map(count => count()), [0, 0, 0]);
});

test('shader uniforms release owned textures while a cache-owned texture is preserved', () => {
  const scene = new THREE.Scene();
  const owned = new THREE.Texture(), cached = retainResource(new THREE.Texture());
  const shader = new THREE.ShaderMaterial({ uniforms: { ownMap: { value: owned }, sharedMap: { value: cached } } });
  const material = new THREE.MeshBasicMaterial({ map: owned });
  const counts = [owned, cached, shader, material].map(disposals);
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [shader, material]));
  disposeIslandScenes(scene);
  assert.deepEqual(counts.map(count => count()), [1, 0, 1, 1]);
});

test('instanced meshes release their per-instance buffers during teardown', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  const count = disposals(mesh);
  scene.add(mesh);
  disposeIslandScenes(scene);
  assert.equal(count(), 1);
  assert.equal(retainResource(null), null);
  assert.equal(retainResource(undefined), undefined);
});
