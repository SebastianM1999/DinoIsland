// Smooth baked source keyframes and close locomotion loops in transform space.
// This retains the authored IK; no runtime IK is applied to root-parented feet.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportGLB } from './glb-export.mjs';

for (const type of ['raptor', 'trex', 'stego']) {
  const path = new URL(`../assets/models/dinos/${type}.glb`, import.meta.url), bytes = await fs.readFile(path);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const clip of gltf.animations.filter(c => /_(Walk|Run)$/.test(c.name))) {
    const count = Math.max(48, Math.ceil(clip.duration * 60));
    const times = Array.from({ length: count + 1 }, (_, i) => i / count * clip.duration);
    const samples = clip.tracks.map(track => {
      const size = track.getValueSize(), interpolate = track.createInterpolant();
      let data = times.slice(0, -1).map(t => Array.from(interpolate.evaluate(t)));
      const quaternion = track instanceof THREE.QuaternionKeyframeTrack;
      // Blend the final section into frame zero, repairing source run foot seams.
      const first = data[0];
      for (let i = Math.floor(count * .90); i < count; i++) {
        const k = THREE.MathUtils.smoothstep(i / count, .90, 1);
        if (quaternion) data[i] = new THREE.Quaternion().fromArray(data[i]).slerp(new THREE.Quaternion().fromArray(first), k).normalize().toArray();
        else data[i] = data[i].map((v, j) => THREE.MathUtils.lerp(v, first[j], k));
      }
      // Cyclic low-pass filter takes out abrupt knee accelerations at sparse keys.
      for (let pass = 0; pass < 3; pass++) data = data.map((current, i) => {
        const a = data[(i + count - 1) % count], b = data[(i + 1) % count];
        if (quaternion) {
          const center = new THREE.Quaternion().fromArray(current);
          const left = new THREE.Quaternion().fromArray(a), right = new THREE.Quaternion().fromArray(b);
          return center.slerp(left.slerp(right, .5), .5).normalize().toArray();
        }
        return current.map((v, j) => (a[j] + v * 2 + b[j]) / 4);
      });
      return { track, size, data, quaternion };
    });
    // Re-time slow/held frames moderately using leg angular motion. Limiting
    // the correction preserves stance duration and avoids a speed pulse.
    const motion = times.slice(0, -1).map((_, i) => {
      let energy = 0;
      for (const s of samples.filter(s => s.quaternion && /UpLeg|LowLeg/.test(s.track.name))) {
        const angle = new THREE.Quaternion().fromArray(s.data[i]).angleTo(new THREE.Quaternion().fromArray(s.data[(i + 1) % count]));
        energy += angle * angle;
      }
      return Math.sqrt(energy);
    });
    const mean = motion.reduce((a, b) => a + b, 0) / count;
    const weight = motion.map(m => mean > 1e-5 ? THREE.MathUtils.clamp(m / mean, .55, 1.6) : 1);
    const total = weight.reduce((a, b) => a + b, 0);
    let sum = 0; const retimed = [0];
    for (const w of weight) { sum += w; retimed.push(sum / total * clip.duration); }
    clip.tracks = samples.map(({ track, data }) => {
      const result = track.clone(); result.times = new Float32Array(retimed);
      result.values = new Float32Array([...data.flat(), ...data[0]]);
      return result;
    });
  }
  await exportGLB(gltf.scene, gltf.animations, path);
  console.log('Smoothed locomotion:', type);
}
