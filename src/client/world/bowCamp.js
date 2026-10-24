// Elias' abandoned camp on island 1, just below the summit (shared/layout.js bowCamp): a cut stump
// with a bow lying on it, a quiver leaning against it and a tipped-over basket. The
// bow (and a soft golden glow round the stump) shows only while the local explorer
// still has no bow of their own – each explorer takes their own (sim/world.js).

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh, tube, limb } from '../models/kit.js';
import { bowGeometry, arrowGeometry } from '../models/weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STUMP_TOP = 0.55;
/** The camp is drawn a little larger than life, so it reads from the trail. */
const SCALE = 1.25;

function stumpGeometry() {
  const bark = paint(new THREE.CylinderGeometry(0.4, 0.5, STUMP_TOP, 11, 2), (c, n) =>
    (n.y > 0.9 ? (Math.hypot(c.x, c.z) < 0.16 ? '#c9a06a' : Math.hypot(c.x, c.z) < 0.28 ? '#b88d58' : '#a77c4a') : (Math.floor(Math.atan2(c.z, c.x) * 3) % 2 ? '#6b4a30' : '#5a3d27')));
  const roots = [0, 2.1, 4.2].map((a) => place(limb(0.13, 0.04, 0.6, '#5a3d27', 5), [Math.cos(a) * 0.35, 0.06, Math.sin(a) * 0.35], [0, -a, -1.25]));
  return merge([place(bark, [0, STUMP_TOP / 2, 0]), ...roots]);
}

function quiverGeometry() {
  const body = paint(new THREE.CylinderGeometry(0.085, 0.07, 0.55, 9, 1, true), (c) => (Math.abs(c.y) > 0.2 ? '#6b4026' : '#b07a44'));
  const bottom = paint(new THREE.CircleGeometry(0.06, 9), '#4a2e1c');
  const strap = place(tube([V(0.07, -0.2, 0), V(0.12, 0, 0.02), V(0.07, 0.22, 0)], () => 0.012, { radial: 4, color: () => '#c7995a' }), [0, 0, 0]);
  const arrows = [-0.03, 0.02, 0.035].map((x, i) => place(arrowGeometry(), [x, 0.05, (i - 1) * 0.03], [0, i, 0], 0.62));
  return merge([place(body, [0, 0, 0]), place(bottom, [0, -0.275, 0], [Math.PI / 2, 0, 0]), strap, ...arrows]);
}

function basketGeometry() {
  const wall = paint(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 12, 3, true), (c) => (Math.floor((c.y + 0.15) * 20 + Math.atan2(c.z, c.x) * 2) % 2 ? '#e8c47a' : '#c99d52'));
  const floor = paint(new THREE.CircleGeometry(0.2, 12), '#b48a46');
  return merge([wall, place(floor, [0, -0.15, 0], [Math.PI / 2, 0, 0])]);
}

/** A cold fire ring: a few grey stones round two charred sticks. */
function fireRingGeometry() {
  const stones = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    stones.push(place(paint(new THREE.DodecahedronGeometry(0.11, 0), i % 2 ? '#9a94a0' : '#7f7a86'), [Math.cos(a) * 0.38, 0.03, Math.sin(a) * 0.38], [0, a, 0], [1, 0.7, 1.2]));
  }
  // (a stick lies along X, centred, then turned about Y)
  const stick = (yaw, x, z) => place(place(limb(0.035, 0.03, 0.55, '#2b2220', 5), [0.275, 0.04, 0], [0, 0, Math.PI / 2]), [x, 0, z], [0, yaw, 0]);
  return merge([...stones, stick(0.5, -0.05, 0.05), stick(-0.6, 0.05, -0.05)]);
}

export function buildBowCamp(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'bow-camp';
  const c = layout.bowCamp;
  if (!c) return { group, setTaken() {}, minimapMarkers: () => [], update() {} };
  group.position.set(c.x, c.y, c.z);
  group.rotation.y = c.rot;          // (local +Z faces the trail)
  group.scale.setScalar(SCALE);

  const props = mesh(merge([
    stumpGeometry(),
    // the quiver leans on the stump's trail side, the basket lies tipped over beside it
    place(quiverGeometry(), [0.62, 0.27, 0.3], [0.1, 0.5, 0.32]),
    place(basketGeometry(), [-0.62, 0.25, 0.42], [Math.PI / 2 - 0.15, 0, 0.5]),
    place(fireRingGeometry(), [0.1, 0, 1.25]),
  ]), MAT.standard);
  group.add(props);

  // the bow, lying across the stump; and a soft golden glow on the ground round it
  const bow = mesh(bowGeometry(), MAT.standard);
  bow.position.set(0, STUMP_TOP + 0.04, 0);
  bow.rotation.set(Math.PI / 2, 0, 0.9);
  bow.scale.setScalar(1.15);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.4, 32), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 2;
  group.add(bow, glow);

  let taken = false;
  return {
    group,
    /** The local explorer has (true) or still lacks (false) a bow: the bow on the stump shows only while they lack one. */
    setTaken(has) {
      taken = !!has;
      bow.visible = glow.visible = !taken;
    },
    /** Where to find the bow, for whoever still lacks one. */
    minimapMarkers: () => (taken ? [] : [{ kind: 'objective', x: c.x, z: c.z, color: '#ffd36a' }]),
    update(dt, time) {
      if (taken) return;
      glowMat.opacity = 0.25 + 0.15 * Math.sin(time * 2.4);
    },
  };
}
