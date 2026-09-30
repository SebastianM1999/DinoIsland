// Measure authored stance travel in metres after model fitting.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { registerDinoGLTF, buildGLBDino } from '../src/client/models/dino/glbDino.js';

for (const [type, spec] of Object.entries(GLB_DINOS)) {
  const bytes = await fs.readFile(new URL(`../assets/models/dinos/${type}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  registerDinoGLTF(type, gltf);
  const rig = buildGLBDino(type);
  const result = {};
  for (const state of ['walk', 'run']) {
    const mixer = new THREE.AnimationMixer(rig.model), clip = rig.clips[state];
    mixer.clipAction(clip).play();
    const samples = [], frames = 240;
    for (let i = 0; i < frames; i++) {
      mixer.setTime(i / frames * clip.duration);
      rig.root.updateMatrixWorld(true);
      samples.push(rig.feet.map(foot => foot.getWorldPosition(new THREE.Vector3())));
    }
    const floor = Math.min(...samples.flat().map(v => v.y));
    const velocities = [];
    for (let i = 1; i < frames; i++) for (let f = 0; f < rig.feet.length; f++) {
      const a = samples[i-1][f], b = samples[i][f];
      if (Math.max(a.y,b.y) < floor + spec.height * .04 && b.z > a.z)
        velocities.push((b.z - a.z) * frames);
    }
    velocities.sort((a,b) => a-b);
    result[state] = Number(velocities[Math.floor(velocities.length / 2)]?.toFixed(3));
    mixer.stopAllAction(); mixer.uncacheRoot(rig.model);
  }
  console.log(type, result);
  rig.dispose();
}
