import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Viewmodel } from '../src/client/player/viewmodel.js';

test('MPX finger and thumb surfaces clear the weapon while holding, moving and pulling the trigger', () => {
  const vm = new Viewmodel({ viewCamera: new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 10) }, 0);
  const idle = { speed: 0, sprint: false, grounded: true, lookX: 0, lookY: 0 };
  vm.setTool('mpx');
  for (let i = 0; i < 200; i++) vm.update(1 / 60, idle);
  const gun = vm.guns.mpx;
  // Test the actual closed model surfaces, including receiver, grip, guard and foregrip.
  // An octree keeps this build-time regression out of the gameplay hot path.
  const solid = gun.clone();
  solid.remove(solid.children.find(o => o.geometry === gun.userData.flash.geometry));
  solid.position.set(0, 0, 0); solid.quaternion.identity(); solid.scale.setScalar(1);
  const tree = new Octree(); tree.trianglesPerLeaf = 32; tree.maxLevel = 10;
  tree.fromGraphNode(solid);
  const ray = new THREE.Ray(), dir = new THREE.Vector3(0.811, 0.324, 0.486).normalize();
  const p = new THREE.Vector3(), hit = new THREE.Vector3(), normal = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const insideDepth = point => {
    ray.set(point, dir);
    const triangles = [], distances = [];
    tree.getRayTriangles(ray, triangles);
    for (const t of triangles) {
      if (ray.intersectTriangle(t.a, t.b, t.c, false, hit)) {
        distances.push({ d: point.distanceTo(hit), sign: Math.sign(t.getNormal(normal).dot(dir)) });
      }
    }
    distances.sort((a, b) => a.d - b.d);
    // Shared triangle edges must count as one crossing, independent of winding.
    const crossings = distances.filter((h, i) => i === 0 || h.d - distances[i - 1].d > 1e-6 || h.sign !== distances[i - 1].sign);
    // Nonzero signed winding preserves overlapping solids; odd/even parity
    // would incorrectly call a point inside two overlapping grip pieces empty.
    const winding = crossings.reduce((sum, h) => sum + h.sign, 0);
    return winding !== 0 ? crossings[0].d : 0;
  };
  assert.ok(insideDepth(new THREE.Vector3(0, 0, 0.03)) > 0.001, 'the solid grip is detected');
  for (const sprint of [false, true]) {
    const motion = { ...idle, speed: sprint ? 7 : 4, sprint, lookX: 18, lookY: -12 };
    for (let i = 0; i < 60; i++) vm.update(1 / 60, motion);
    for (const trigger of [0, 0.25, 0.5, 0.75, 1]) {
      vm.armR.setTrigger(trigger); vm.root.updateMatrixWorld(true);
      const inverse = gun.matrixWorld.clone().invert();
      for (const [side, arm] of [['right', vm.armR], ['left', vm.armL]]) {
        for (const [digit, root] of [...arm.fingers.map((f, i) => ['finger ' + i, f.root]), ['thumb', arm.thumb.root]]) {
          root.traverse(o => {
            if (!o.isMesh) return;
            matrix.multiplyMatrices(inverse, o.matrixWorld);
            const vertices = o.geometry.getAttribute('position');
            for (let i = 0; i < vertices.count; i++) {
              p.fromBufferAttribute(vertices, i).applyMatrix4(matrix);
              assert.ok(insideDepth(p) <= 0.001, `${side} ${digit} vertex ${i}, trigger ${trigger}, sprint ${sprint}: skin crosses weapon`);
            }
          });
        }
      }
    }
  }
  // Per-grip knuckle offsets and trigger tuning cannot leak into another tool.
  const indexY = vm.armR.fingers[0].root.position.y;
  vm.setTool('rifle');
  for (let i = 0; i < 200; i++) vm.update(1 / 60, idle);
  assert.equal(vm.armR.pose, 'grip:rifle');
  assert.ok(Math.abs(vm.armR.fingers[0].root.position.y - (indexY - 0.006)) < 1e-9);
});
