// Island 1's arrival (shared/layout.js `arrival`, docs/map-progression/14-story.md): Jonas'
// skeleton sits against a driftwood log at the cold camp fire, facing it (the bottle with his
// message lies in his lap: world/notes.js), and his spear stands in the sand beside him. The
// spear shows only while the local explorer has none; each explorer takes one (sim/world.js).

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh, limb, blob } from '../models/kit.js';
import { spearGeometry } from '../models/weapons.js';

const BONE = '#e9e0c8', BONE_DARK = '#c9bc9a', WOOD = '#8f7a63', WOOD_DARK = '#6e5c49';

/** A bone between two points (a limb along the segment). */
function bone(a, b, r0 = 0.035, r1 = 0.03) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = limb(r0, r1, d.length(), BONE, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** The skeleton sitting on the sand, back against the log (local +Z: the way he faces). */
function skeletonGeometry() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hip = V(0, 0.12, -0.05), neck = V(0, 0.68, -0.22);
  const parts = [
    // spine leaning back, ribs round it
    bone(hip, neck, 0.03, 0.025),
    place(paint(new THREE.SphereGeometry(0.16, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.75), BONE_DARK), [0, 0.46, -0.12], [-0.35, 0, 0], [1, 1.25, 0.8]),
    ...[0.36, 0.44, 0.52].map((y) => place(paint(new THREE.TorusGeometry(0.13 - (y - 0.36) * 0.25, 0.012, 4, 14, Math.PI * 1.4), BONE), [0, y, -0.14 + (y - 0.36) * 0.3], [Math.PI / 2 - 0.35, 0, Math.PI * 1.3])),
    // the skull, tipped to one side; dark sockets
    place(blob(0.1, 0.11, 0.12, BONE), [0.03, 0.82, -0.2], [0.2, 0.3, 0.35]),
    place(paint(new THREE.SphereGeometry(0.025, 6, 5), '#3a3026'), [0.0, 0.84, -0.1]),
    place(paint(new THREE.SphereGeometry(0.025, 6, 5), '#3a3026'), [0.08, 0.86, -0.12]),
    place(paint(new THREE.BoxGeometry(0.1, 0.04, 0.08), BONE_DARK), [0.03, 0.73, -0.14], [0.2, 0.3, 0.35]),
    // pelvis
    place(paint(new THREE.TorusGeometry(0.1, 0.03, 5, 10), BONE_DARK), [0, 0.12, -0.04], [Math.PI / 2 - 0.4, 0, 0], [1, 0.8, 1]),
    // legs stretched out toward the fire, one knee up
    bone(V(-0.09, 0.1, 0), V(-0.12, 0.08, 0.42)), bone(V(-0.12, 0.08, 0.42), V(-0.13, 0.05, 0.8)),
    bone(V(0.09, 0.1, 0), V(0.12, 0.34, 0.3)), bone(V(0.12, 0.34, 0.3), V(0.14, 0.05, 0.6)),
    // arms: one hangs at his side, one lies in his lap round the bottle
    bone(V(-0.15, 0.62, -0.2), V(-0.22, 0.32, -0.12)), bone(V(-0.22, 0.32, -0.12), V(-0.25, 0.06, 0.05)),
    bone(V(0.15, 0.62, -0.2), V(0.18, 0.36, -0.02)), bone(V(0.18, 0.36, -0.02), V(0.05, 0.16, 0.22)),
  ];
  return merge(parts);
}

/** A weathered driftwood log behind him (along local X). */
function logGeometry() {
  const trunk = paint(new THREE.CylinderGeometry(0.2, 0.24, 2.4, 9, 3), (c) => (Math.abs(c.y) > 1.05 ? WOOD_DARK : c.x > 0.1 ? '#a08b72' : WOOD));
  const stub = limb(0.07, 0.04, 0.45, WOOD_DARK, 5);
  return merge([place(trunk, [0, 0.2, -0.42], [0, 0, Math.PI / 2]), place(stub, [0.6, 0.35, -0.5], [0.4, 0, -0.9])]);
}

export function buildArrival(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'arrival';
  const a = layout.arrival;
  if (!a) return { group, setTaken() {}, update() {} };

  const seat = new THREE.Group();
  seat.position.set(a.skeleton.x, a.skeleton.y, a.skeleton.z);
  seat.rotation.y = a.skeleton.rot;
  seat.add(mesh(merge([skeletonGeometry(), logGeometry()]), MAT.standard));
  group.add(seat);

  // the spear, stuck slanting in the sand, point up
  const spear = mesh(spearGeometry(), MAT.standard);
  spear.position.set(a.spear.x, a.spear.y + 0.5, a.spear.z);   // (origin at the grip, 0.75 m up the shaft: the butt sinks 0.25 m)
  spear.rotation.set(-0.18, a.spear.rot, 0.12);
  group.add(spear);

  return {
    group,
    /** The local explorer has (true) or lacks (false) a spear: the one in the sand shows only while they lack one. */
    setTaken(has) { spear.visible = !has; },
    update() {},
  };
}
