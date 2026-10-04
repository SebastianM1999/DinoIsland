// The swamp arena's look (Misty Swamp): a ring of huge dead mangroves on
// arched stilt roots with tangled roots between them – the wall –, open at the
// west and east gates (a warning sign at the entrance), root walls closing the
// waist north and south out into the sea; bones in the mud of the basin.
// Data from the shared layout (shared/swampArena.js, layout.swampArena); the
// wall's colliders are boxes in layout.colliders. The basin's water is a bog
// (world/water.js), its mud painted in terrainMesh.js.

import * as THREE from 'three';
import { MAT, paint, place, merge, tube, mesh } from '../models/kit.js';
import { makeRng } from '../../shared/rng.js';
import { SWAMP_ARENA, gateOffset } from '../../shared/swampArena.js';
import { deadMangroveGeometry } from './veg/trees.js';
import { LEAF_MAT, instanced, finishInstanced } from './veg/shapes.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROOT = ['#5a554d', '#4a463f', '#625c52'];
const BONE = '#cfc4ab';

/** Skull or a rib cage lying in the mud (local, ground at y = 0). */
function boneGeometry(kind) {
  if (kind === 'skull') {
    return merge([
      paint(new THREE.SphereGeometry(0.45, 10, 7).scale(1.4, 0.8, 0.9), BONE),
      place(paint(new THREE.SphereGeometry(0.3, 8, 6).scale(1.5, 0.6, 0.7), BONE), [0.6, -0.08, 0]),
      place(paint(new THREE.SphereGeometry(0.1, 6, 4), '#2a2220'), [0.25, 0.12, 0.3]),
      place(paint(new THREE.SphereGeometry(0.1, 6, 4), '#2a2220'), [0.25, 0.12, -0.3]),
    ].map((g) => place(g, [0, 0.1, 0])));
  }
  const parts = [paint(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6).rotateZ(Math.PI / 2), BONE)];
  for (let k = 0; k < 5; k++) parts.push(place(paint(new THREE.TorusGeometry(0.55 - k * 0.05, 0.045, 5, 12, Math.PI * 0.9), BONE), [-0.7 + k * 0.35, 0, 0], [0, Math.PI / 2, 0]));
  return merge(parts);
}

/** The warning sign by the gate: a crooked post, a board with a red cross, a skull on top. */
function signGeometry() {
  const parts = [
    paint(new THREE.CylinderGeometry(0.11, 0.14, 2.6, 7).translate(0, 1.3, 0), '#4a3c2e'),
    place(paint(new THREE.BoxGeometry(1.3, 0.75, 0.08), (c) => (Math.abs(Math.abs(c.x) - Math.abs(c.y) * 1.4) < 0.12 ? '#8a1c14' : '#6b5a44')), [0, 1.85, 0.12], [0, 0, 0.06]),
    place(boneGeometry('skull'), [0, 2.55, 0], [0, Math.PI / 2, 0], 0.6),
  ];
  return place(merge(parts), [0, 0, 0], [0.05, 0, -0.04]);
}

/** Tangled roots filling the walls between the big trees (one merged geometry, world space). */
function rootTangle(a, terrain, rng) {
  const parts = [];
  const gateHalf = SWAMP_ARENA.gateW / 2 + 0.6;
  // the waist walls: arches along x = a.x, out to where the sea gets deep
  for (const w of a.waist || []) {
    const len = Math.abs(w.z1 - w.z0);
    for (let d = 0; d < len; d += 1.6) {
      for (let k = 0; k < 2; k++) {
        const z0 = w.z0 + w.side * (d - rng.range(0.2, 0.9)), z1 = w.z0 + w.side * (d + rng.range(0.7, 1.6));
        const at = (z, y) => { const x = a.x + rng.range(-0.8, 0.8); return V(x, Math.max(terrain.heightAt(x, z), -1.5) + y, z); };
        parts.push(tube([at(z0, -0.3), at((z0 + z1) / 2, rng.range(1.6, 3.6)), at(z1, -0.3)],
          (t) => 0.17 - 0.05 * Math.abs(t - 0.5), { radial: 5, color: () => ROOT[Math.floor(rng() * ROOT.length)], capStart: false, capEnd: false }));
      }
    }
  }
  for (let ang = 0; ang < TAU; ang += 0.075) {
    if (gateOffset(a, a.x + Math.cos(ang) * a.r, a.z + Math.sin(ang) * a.r) < gateHalf) continue;
    // two or three arches crossing the wall line at slightly different radii
    for (let k = 0; k < 2 + (rng() < 0.4 ? 1 : 0); k++) {
      const r0 = a.r + rng.range(-0.9, 0.9), span = rng.range(0.25, 0.45), h = rng.range(1.4, 3.4);
      const a0 = ang - span / 2, a1 = ang + span / 2;
      const at = (an, rr, y) => {
        const x = a.x + Math.cos(an) * rr, z = a.z + Math.sin(an) * rr;
        return V(x, terrain.heightAt(x, z) + y, z);
      };
      parts.push(tube([at(a0, r0 + rng.range(-0.6, 0.6), -0.3), at(ang, r0, h), at(a1, r0 + rng.range(-0.6, 0.6), -0.3)],
        (t) => 0.16 - 0.05 * Math.abs(t - 0.5), { radial: 5, color: () => ROOT[Math.floor(rng() * ROOT.length)], capStart: false, capEnd: false }));
    }
  }
  return merge(parts);
}

export function buildSwampArena(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'swamp-arena';
  const a = layout.swampArena;
  if (!a) return { group, update() {} };
  const rng = makeRng(layout.plan.seed ^ 0x5a3b);

  // the giants on the wall: two dead-mangrove variants, instanced
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const v of [0, 1]) {
    const list = a.roots.filter((r, i) => i % 2 === v);
    if (!list.length) continue;
    const g = deadMangroveGeometry(v);
    const trunk = instanced(g.trunk, MAT.standard, list.length, { name: `arena-giants-${v}` });
    const moss = instanced(g.foliage, LEAF_MAT, list.length, { cast: false, name: `arena-moss-${v}` });
    list.forEach((r, i) => {
      e.set(0, r.rot, 0); q.setFromEuler(e);
      m4.compose(p.set(r.x, r.y - 0.2, r.z), q, s.set(r.scale, r.scale * (r.tall ? 1.35 : 1.05), r.scale));
      trunk.setMatrixAt(i, m4);
      moss.setMatrixAt(i, m4);
    });
    finishInstanced(trunk); finishInstanced(moss);
    group.add(trunk, moss);
  }
  group.add(mesh(rootTangle(a, terrain, rng), MAT.standard));
  // the sign, bones
  const solid = [];
  if (a.sign) solid.push(place(signGeometry(), [a.sign.x, a.sign.y, a.sign.z], [0, -a.sign.angle + Math.PI / 2, 0]));
  for (const b of a.bones) solid.push(place(boneGeometry(b.kind), [b.x, b.y - 0.05, b.z], [0, b.rot, 0], b.s));
  if (solid.length) group.add(mesh(merge(solid), MAT.standard));
  return { group, update() {} };
}
