// Run after convert-dino-pack.py. Add faces and rest-space skin patterns to pack GLBs.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildHead } from '../src/client/models/dino/theropod.js';
import { DINO_PALETTES, paintSkinDetails } from '../src/client/models/dino/skinStyle.js';
import { exportGLB } from './glb-export.mjs';

for (const type of ['raptor', 'trex', 'stego']) {
  const path = new URL(`../assets/models/dinos/${type}.glb`, import.meta.url);
  const bytes = await fs.readFile(path);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  if (gltf.scene.getObjectByName('DetailedFace')) throw new Error(`${type}: regenerate the original GLB before detailing it again`);
  let head, skin;
  gltf.scene.traverse(o => { if (o.name === 'Head') head = o; if (o.isSkinnedMesh) skin = o; });
  skin.skeleton.update();
  const geometry = skin.geometry, si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
  const headIndex = skin.skeleton.bones.indexOf(head), headWeight = [];
  const bounds = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < si.count; i++) {
    let weight = 0;
    for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === headIndex) weight += sw.array[i * 4 + k];
    headWeight.push(weight);
    if (weight > .7) {
      v.fromBufferAttribute(geometry.attributes.position, i);
      skin.applyBoneTransform(i, v); skin.localToWorld(v); bounds.expandByPoint(v);
    }
  }
  const indices = [];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const triangle = [0, 1, 2].map(k => geometry.index.getX(i + k));
    if (triangle.reduce((sum, j) => sum + headWeight[j], 0) / 3 < .25) indices.push(...triangle);
  }
  geometry.setIndex(indices);
  paintSkinDetails(geometry, type, { preserve: true });
  // A proper skull, cheeks, nostrils, eyes, teeth, throat and separate lower jaw.
  const size = bounds.getSize(new THREE.Vector3());
  const face = new THREE.Group(); face.name = 'DetailedFace';
  const desiredWorld = new THREE.Matrix4().compose(
    new THREE.Vector3(bounds.getCenter(v).x, bounds.min.y + size.y * .46, bounds.min.z - size.z * .05),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
  const local = head.matrixWorld.clone().invert().multiply(desiredWorld);
  local.decompose(face.position, face.quaternion, face.scale); head.add(face);
  const length = size.z * .98, width = size.x * .56, height = size.y * (type === 'stego' ? .36 : .46);
  const palette = DINO_PALETTES[type];
  const C = { ...palette, mouth: '#56262d', tongue: '#c76b70', throat: '#351d29', tooth: '#fff1d7', lip: palette.back };
  const carnivore = type !== 'stego';
  const P = { L: length, back: length * .25, W: width, H: height,
    tipW: width * (type === 'trex' ? .75 : .5), tipH: height * .52, taper: .75,
    mouthY: -height * .28, radial: 12, flatTop: type === 'trex' ? .2 : 0,
    hingeT: .12, jawLen: length * .94, jawDepth: height * (type === 'trex' ? .55 : .40), jawRest: .025, jawCream: 1.65,
    eye: { t: .22, up: .38, size: height * (type === 'stego' ? .36 : .32), yaw: .2 },
    nostril: height * .10, cheek: { t: .15, r: [width * .35, height * .48, length * .14], up: .3 },
    horn: { t: .2, r: [width * .28, height * .22, length * .13], x: .7, up: .9 }, stripes: true,
    teeth: { from: .95, to: .37, upper: carnivore ? 8 : 0, lower: carnivore ? 7 : 0,
      front: carnivore ? 3 : 0, size: height * .32, lowFrom: .92, lowTo: .4 },
  };
  const { jaw, lids } = buildHead(face, P, C); jaw.name = 'FaceJaw'; lids.scale.y = .12;
  // Jaw/lids are new transforms, so give them explicit static tracks in all actions.
  // This also keeps the runtime's overlay reset independent of previous clips.
  for (const clip of gltf.animations) {
    clip.tracks.push(new THREE.QuaternionKeyframeTrack('FaceJaw.quaternion', [0, clip.duration], [...jaw.quaternion.toArray(), ...jaw.quaternion.toArray()]));
  }
  await exportGLB(gltf.scene, gltf.animations, path);
  console.log('Detailed', type, 'source head bounds', size.toArray());
}
