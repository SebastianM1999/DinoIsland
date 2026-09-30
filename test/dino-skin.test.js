import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loft } from '../src/client/models/dino/skin.js';

test('skin loft sides and domed caps face outward', () => {
  const bone = new THREE.Group();
  const surface = loft([{ p: new THREE.Vector3(0, 0, -2), rx: 1, ry: 1, bone },
    { p: new THREE.Vector3(0, 0, 2), rx: 1, ry: 1, bone }]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.pos, 3));
  geometry.setIndex(surface.idx); geometry.computeVertexNormals();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    p.fromBufferAttribute(geometry.attributes.position, i);
    n.fromBufferAttribute(geometry.attributes.normal, i);
    assert.ok(n.dot(p) > .2, `inward-facing skin normal at vertex ${i}`);
  }
});
