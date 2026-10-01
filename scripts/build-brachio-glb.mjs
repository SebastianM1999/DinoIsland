// SUPERSEDED: assets/models/dinos/brachio.glb is now built from
// art/sources/brachio/brachio.blend (run its `bbuild` text block). Running this
// script overwrites it with the older procedural Brachiosaurus.
// Bake the project's Brachiosaurus at its natural proportions. Apatosaurus is
// unsuitable here: fitting its horizontal neck to 11 m stretches every leg.
import * as THREE from 'three';
import { buildBrachio, BRACHIO_ANIM } from '../src/client/models/dino/brachio.js';
import { DinoAnimator } from '../src/client/models/dino/rig.js';
import { paintSkinDetails } from '../src/client/models/dino/skinStyle.js';
import { exportGLB } from './glb-export.mjs';

const rig = buildBrachio();
rig.body.name = 'Body'; rig.chest.name = 'Shoulders'; rig.head.name = 'Head'; rig.jaw.name = 'FaceJaw';
rig.neck.forEach((b, i) => b.name = `Neck${i + 1}`);
rig.tail.forEach((b, i) => b.name = `Tail${i + 1}`);
for (const leg of rig.legs) {
  const suffix = `${leg.front ? 'Front' : 'Back'}${leg.side > 0 ? 'R' : 'L'}`;
  leg.hip.name = suffix.replace(/(R|L)$/, 'UpLeg$1');
  leg.knee.name = suffix.replace(/(R|L)$/, 'LowLeg$1');
  leg.foot.name = suffix.replace(/(R|L)$/, 'Foot$1');
}
let id = 0;
rig.root.traverse(o => { if (!o.name) o.name = `BrachioPart${++id}`; });
paintSkinDetails(rig.skin.geometry, 'brachio', { preserve: true });
const nodes = []; rig.root.traverse(o => nodes.push(o));
const rest = nodes.map(o => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
const animator = new DinoAnimator(rig, { ...BRACHIO_ANIM, bob: .06, sway: .018, stepHeight: .35 });
const clips = [];
function plantHindFoot(leg) {
  rig.root.updateMatrixWorld(true);
  const target = new THREE.Vector3(leg.restX, leg.footH, leg.restZ);
  rig.root.localToWorld(target); leg.hip.parent.worldToLocal(target); target.sub(leg.hip.position);
  const forward = -target.z, down = -target.y;
  const distance = THREE.MathUtils.clamp(Math.hypot(forward, down), Math.abs(leg.l1 - leg.l2) + .001, leg.l1 + leg.l2 - .001);
  const alpha = Math.acos(THREE.MathUtils.clamp((leg.l1 ** 2 + distance ** 2 - leg.l2 ** 2) / (2 * leg.l1 * distance), -1, 1));
  const beta = Math.acos(THREE.MathUtils.clamp((leg.l1 ** 2 + leg.l2 ** 2 - distance ** 2) / (2 * leg.l1 * leg.l2), -1, 1));
  leg.hip.rotation.x = Math.atan2(forward, down) + leg.kneeDir * alpha;
  leg.knee.rotation.x = -leg.kneeDir * (Math.PI - beta);
  leg.foot.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x - rig.body.rotation.x;
}
for (const [state, duration] of [['Idle', 4], ['Walk', 3], ['Run', 2], ['Attack', 1.45], ['Death', 1.4]]) {
  const frames = Math.round(duration * 60), times = [], values = nodes.map(() => ({ p: [], q: [], s: [] }));
  for (let frame = 0; frame <= frames; frame++) {
    const t = frame / 60, ph = frame / frames, wave = Math.sin(ph * Math.PI * 2);
    nodes.forEach((o, i) => { o.position.copy(rest[i].p); o.quaternion.copy(rest[i].q); o.scale.copy(rest[i].s); });
    animator.time = t; animator.phase = ph % 1; animator.idleLookT = Infinity; animator.idleLook = 0;
    animator.amp = state === 'Walk' || state === 'Run' ? 1 : 0;
    animator.runBlend = state === 'Run' ? 1 : 0; animator.dead = 0; animator.shiftT = 0;
    animator.update(0, { speed: animator.amp ? (state === 'Run' ? 6 : 2) : 0, dist: 0 });
    // Periodic secondary motion, so the exported loops have identical endpoints.
    rig.head.rotation.x = rig.restX(rig.head) + wave * .012;
    rig.head.rotation.z = wave * .01;
    rig.chest.scale.set(1 + wave * .01, 1 + wave * .006, 1);
    rig.tail.forEach((b, i) => { b.rotation.x = rig.restX(b); b.rotation.y = Math.sin(ph * Math.PI * 2 - i * .4) * .015; });
    rig.neck.forEach(b => b.rotation.y = rig.restY(b));
    if (state === 'Attack') {
      const rise = t < .8 ? THREE.MathUtils.smoothstep(t, 0, .8) : 1 - THREE.MathUtils.smoothstep(t, .8, .97);
      rig.body.rotation.x += rise * .30; rig.body.position.y += rise * .40;
      for (const leg of rig.legs) if (leg.front) { leg.hip.rotation.x += rise * .65; leg.knee.rotation.x -= rise * .85; }
      for (const leg of rig.legs) if (!leg.front) plantHindFoot(leg);
      rig.neck.forEach(b => b.rotation.x += rise * .025);
      rig.jaw.rotation.x -= rise * .15;
    }
    if (state === 'Death') {
      const fall = THREE.MathUtils.smoothstep(t, 0, 1.1);
      rig.tilt.rotation.z = fall * Math.PI * .44; rig.tilt.position.y = -fall * 1.1;
      rig.neck.forEach(b => b.rotation.x -= fall * .08);
    }
    if (state === 'Walk' || state === 'Run' || state === 'Idle') {
      // Avoid numerical endpoint drift in every transform, including the feet.
      if (frame === frames) nodes.forEach((o, i) => {
        o.position.fromArray(values[i].p, 0); o.quaternion.fromArray(values[i].q, 0); o.scale.fromArray(values[i].s, 0);
      });
    }
    times.push(t);
    nodes.forEach((o, i) => { values[i].p.push(...o.position.toArray()); values[i].q.push(...o.quaternion.toArray()); values[i].s.push(...o.scale.toArray()); });
  }
  const tracks = [];
  nodes.forEach((o, i) => {
    for (const [key, size, kind, property] of [['p', 3, THREE.VectorKeyframeTrack, 'position'], ['q', 4, THREE.QuaternionKeyframeTrack, 'quaternion'], ['s', 3, THREE.VectorKeyframeTrack, 'scale']]) {
      const data = values[i][key];
      if (data.some((v, j) => Math.abs(v - data[j % size]) > 1e-6)) tracks.push(new kind(`${o.name}.${property}`, times, data));
    }
  });
  clips.push(new THREE.AnimationClip(`Brachiosaurus_${state}`, duration, tracks));
}
nodes.forEach((o, i) => { o.position.copy(rest[i].p); o.quaternion.copy(rest[i].q); o.scale.copy(rest[i].s); });
await exportGLB(rig.root, clips, new URL('../assets/models/dinos/brachio.glb', import.meta.url));
console.log('Exported Brachiosaurus with periodic gaits and defensive stomp');
