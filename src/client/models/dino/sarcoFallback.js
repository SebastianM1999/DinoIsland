import * as THREE from 'three';
import { Rig } from './rig.js';
import { blob, mesh, spike, place } from '../kit.js';

export const SARCO_ANIM = { gait: 'quad', walkSpeed: 3, runSpeed: 8.5,
  walkStride: 1.866, runStride: 3.775, bob: .05, stepHeight: .18 };

/** Low, long crocodile silhouette keeps missing art playable without a wrong species. */
export function buildSarcoFallback() {
  const r = new Rig();
  r.body.position.y = 1.65;
  const mass = (joint, radii, pos, zone, radius) => {
    joint.add(mesh(place(blob(...radii, c => c.y > 0 ? '#14271b' : '#27372a'), pos)));
    r.hitZones.push({ zone, joint, offset: new THREE.Vector3(...pos), radius });
  };
  mass(r.body, [1.7, 1.2, 2.7], [0, 0, 0], 'body', 1.65);
  r.head = new THREE.Group(); r.head.position.set(0, .3, -2.3); r.body.add(r.head);
  mass(r.head, [1, .65, 2.7], [0, 0, -2], 'head', 1);
  r.jaw = new THREE.Group(); r.jaw.position.set(0, -.32, 0); r.head.add(r.jaw);
  mass(r.jaw, [.9, .18, 2.6], [0, -.05, -2.05], 'head', .8);
  for (const side of [-1, 1]) {
    const eye = mesh(blob(.18, .16, .18, side < 0 ? '#ff220e' : '#ffce20'));
    eye.material = new THREE.MeshStandardMaterial({ color: side < 0 ? 0xff220e : 0xffce20,
      emissive: side < 0 ? 0xff220e : 0xffce20, emissiveIntensity: 2 });
    eye.position.set(side * .8, .6, -.8); r.head.add(eye);
    for (let i = 0; i < 13; i++) r.jaw.add(mesh(place(spike(.07, .24, '#c7bea1'), [side * .78, .05, -i * .33 - .3])));
  }
  let parent = r.body;
  for (let i = 0; i < 8; i++) {
    const joint = new THREE.Group(); joint.position.set(0, i ? -.08 : -.1, i ? .86 : 2.25);
    parent.add(joint); r.tail.push(joint);
    mass(joint, [.95 * (1 - i / 9), .7 * (1 - i / 9), .72], [0, 0, .4], 'tail', .8 * (1 - i / 10));
    parent = joint;
  }
  for (const front of [false, true]) for (const side of [-1, 1]) {
    const hip = new THREE.Group(), knee = new THREE.Group(), foot = new THREE.Group();
    hip.position.set(side * 1.5, -.2, front ? -1.8 : 1.6); knee.position.y = -.7; foot.position.y = -.65;
    r.body.add(hip); hip.add(knee); knee.add(foot);
    mass(hip, [.45, .5, .45], [0, -.3, 0], 'leg', .48);
    mass(knee, [.32, .45, .3], [0, -.3, 0], 'leg', .36);
    mass(foot, [.42, .15, .65], [0, 0, -.25], 'leg', .5);
    r.legs.push({ hip, knee, foot, l1: .7, l2: .65, kneeDir: front ? 1 : -1,
      offset: front === (side > 0) ? 0 : .5, front });
  }
  return r.finalize();
}
