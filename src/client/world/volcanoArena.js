// The crater arena's look (Ashfall Isle): clusters of hexagonal basalt columns
// on the crater floor – cover to dodge and kite round –, glowing cracks at
// their feet, a warning sign at the notch where the path comes in, bones on
// the floor. Data from the shared layout (shared/volcanoArena.js,
// layout.volcanoArena); the columns' colliders are circles in
// layout.colliders. The lava moat is a lava flow (world/water.js), the floor
// and the wall are terrain.

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh } from '../models/kit.js';
import { boneGeometry, signGeometry } from './swampArena.js';

const BASALT = ['#2f2a30', '#38323a', '#2a2529'];

/** One column (local, ground at y = 0): a hexagonal prism, its top a little lighter and chipped. */
function columnGeometry(c, k) {
  const g = new THREE.CylinderGeometry(c.r * 0.92, c.r, c.h, 6, 3).translate(0, c.h / 2 - 0.15, 0);
  return paint(g, (p) => (p.y > c.h - 0.4 ? '#4a4248' : BASALT[(k + Math.floor(p.y * 1.3)) % BASALT.length]));
}

/** A ring of glowing cracks round a column's foot (emissive). */
function emberGeometry(c) {
  return paint(new THREE.TorusGeometry(c.r * 1.08, 0.06, 4, 12).rotateX(Math.PI / 2).translate(0, 0.04, 0), '#ff6a1c');
}

export function buildVolcanoArena(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'volcano-arena';
  const a = layout.volcanoArena;
  if (!a) return { group, update() {} };
  const solid = [], glow = [];
  let k = 0;
  for (const cl of a.columns) {
    for (const c of cl.parts) {
      solid.push(place(columnGeometry(c, k++), [c.x, c.y, c.z], [c.tilt, c.rot, c.tilt * 0.5]));
      glow.push(place(emberGeometry(c), [c.x, c.y, c.z], [0, c.rot, 0]));
    }
  }
  if (a.sign) solid.push(place(signGeometry(), [a.sign.x, a.sign.y, a.sign.z], [0, -a.sign.angle + Math.PI / 2, 0]));
  for (const b of a.bones) solid.push(place(boneGeometry(b.kind), [b.x, b.y - 0.05, b.z], [0, b.rot, 0], b.s));
  if (solid.length) group.add(mesh(merge(solid), MAT.standard));
  const embers = glow.length ? mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), { cast: false }) : null;
  if (embers) { embers.name = 'arena-embers'; group.add(embers); }
  return {
    group,
    update(dt, time) {
      // the cracks at the columns' feet breathe
      if (embers) embers.material.color.setScalar(0.75 + 0.25 * Math.sin(time * 1.7));
    },
  };
}
