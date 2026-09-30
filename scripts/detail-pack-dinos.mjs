// Run once after a fresh Blender conversion. Preserve the integrated source
// heads and add only two black eye dots plus rest-space body markings.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paintSkinDetails } from '../src/client/models/dino/skinStyle.js';
import { exportGLB } from './glb-export.mjs';

for (const type of ['raptor', 'trex', 'stego']) {
  const path = new URL(`../assets/models/dinos/${type}.glb`, import.meta.url);
  const bytes = await fs.readFile(path);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  if (gltf.scene.getObjectByName('FaceEyes')) throw new Error(`${type}: regenerate the original GLB before detailing it again`);
  let head, skin;
  gltf.scene.traverse(o => { if (o.name === 'Head') head = o; if (o.isSkinnedMesh) skin = o; });
  skin.skeleton.update();
  const geometry = skin.geometry, si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
  const headIndex = skin.skeleton.bones.indexOf(head);
  const bounds = new THREE.Box3(), points = [], v = new THREE.Vector3();
  for (let i = 0; i < si.count; i++) {
    let weight = 0;
    for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === headIndex) weight += sw.array[i * 4 + k];
    if (weight > .7) {
      v.fromBufferAttribute(geometry.attributes.position, i);
      skin.applyBoneTransform(i, v); skin.localToWorld(v);
      bounds.expandByPoint(v); points.push(v.clone());
    }
  }
  // No head triangles are removed or replaced.
  paintSkinDetails(geometry, type, { preserve: true });
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.min(size.x, size.y) * .10;
  const eyes = new THREE.Group(); eyes.name = 'FaceEyes'; head.add(eyes);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  for (const side of [-1, 1]) {
    const target = new THREE.Vector3(center.x + side * size.x * .48,
      bounds.min.y + size.y * .65, bounds.min.z + size.z * .25);
    const surface = points.reduce((a, b) => a.distanceToSquared(target) < b.distanceToSquared(target) ? a : b).clone();
    surface.x += side * radius * .12;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
    dot.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(dot.geometry.attributes.position.count * 3).fill(new THREE.Color('#080808').r), 3));
    dot.name = side < 0 ? 'EyeDotLeft' : 'EyeDotRight';
    const world = new THREE.Matrix4().compose(surface, new THREE.Quaternion(), new THREE.Vector3(radius * .45, radius, radius));
    head.matrixWorld.clone().invert().multiply(world).decompose(dot.position, dot.quaternion, dot.scale);
    eyes.add(dot);
  }
  await exportGLB(gltf.scene, gltf.animations, path);
  console.log('Preserved original head and added black dots:', type);
}
