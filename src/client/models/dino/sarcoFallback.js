import * as THREE from 'three';
import { Rig } from './rig.js';
import { blob, mesh, spike, place } from '../kit.js';

export const SARCO_ANIM = { gait: 'quad', walkSpeed: 3, runSpeed: 8.5,
  walkStride: 1.866 * .9, runStride: 3.775 * .9, bob: .05, stepHeight: .18 };

const SARCO_LOOK = { dark: '#14271b', light: '#27372a', eyes: ['#ff220e', '#ffce20'], tooth: '#c7bea1', emissive: 2, scale: [1, .9, .9] };
/** Pale cave palette and a ~5 m, slim and low build for the Sump Lurker fallback (clouded eyes, no glow). */
const SUMP_LOOK = { dark: '#7d8993', light: '#c5ced2', eyes: ['#dfe8ea', '#dfe8ea'], tooth: '#f2efe2', emissive: 0, scale: [.17, .18, .3], long: .55 };

/** Low, long crocodile silhouette keeps missing art playable without a wrong species. */
export function buildSarcoFallback(look = SARCO_LOOK) {
  const r = new Rig();
  r.body.position.y = 1.65;
  const mass = (joint, radii, pos, zone, radius) => {
    joint.add(mesh(place(blob(...radii, c => c.y > 0 ? look.dark : look.light), pos)));
    r.hitZones.push({ zone, joint, offset: new THREE.Vector3(...pos), radius });
  };
  mass(r.body, [1.7, 1.2, 2.7], [0, 0, 0], 'body', 1.65);
  r.head = new THREE.Group(); r.head.position.set(0, .3, -2.3); r.body.add(r.head);
  mass(r.head, [1, .65, 2.7], [0, 0, -2], 'head', 1);
  r.jaw = new THREE.Group(); r.jaw.position.set(0, -.32, 0); r.head.add(r.jaw);
  mass(r.jaw, [.9, .18, 2.6], [0, -.05, -2.05], 'head', .8);
  for (const side of [-1, 1]) {
    const eyeColor = look.eyes[side < 0 ? 0 : 1];
    const eye = mesh(blob(.18, .16, .18, eyeColor));
    eye.material = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: look.emissive });
    eye.position.set(side * .8, .6, -.8); r.head.add(eye);
    for (let i = 0; i < 13; i++) r.jaw.add(mesh(place(spike(.07, .24, look.tooth), [side * .78, .05, -i * .33 - .3])));
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
  r.body.scale.set(...look.scale); r.body.position.y *= look.scale[1];
  return r.finalize();
}
export const buildSumpLurkerFallback = () => buildSarcoFallback(SUMP_LOOK);
