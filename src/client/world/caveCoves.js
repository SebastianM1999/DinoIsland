// The two outdoor coves of the Hollow Mountain: the boat the team arrived on
// (west cove, moored, intact) and dune grass. Nothing man-made in or at the
// mountain (no lanterns, timber supports or logs: the owner wants the caves wild).
// Decoration only (no colliders, `layout` owns those).

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { MAT } from '../models/kit.js';
import { buildBoat } from '../models/props/boat.js';
import { grassGeometry } from './veg/plants.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Distance from (x, z) to the nearest of `pts`. */
const nearest = (pts, x, z) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);

export function buildCaveCoves(terrain, layout, { roofY }) {
  const group = new THREE.Group();
  group.name = 'cave-coves';
  const rng = makeRng(layout.plan.seed ^ 0xc07e);
  const maze = layout.plan.cave.maze;
  const updaters = [];

  // places that stay clear of decoration: camp, torches, boats, the mouths
  const keepClear = [layout.hut, layout.hut.campfire, layout.hut.dropOff, layout.hut.missionBoard, layout.hut.wardrobe, layout.hut.arrowRack, layout.boat, layout.arrivalBoat,
    layout.caveEntrance, layout.caveExit, ...(layout.torchSpots || [])].filter(Boolean);
  const sides = [-1, 1];

  // ------------------------------------------------------------ the boat we came on
  if (layout.arrivalBoat) {
    const boat = buildBoat(layout.arrivalBoat);
    boat.setRepaired?.(true);
    group.add(boat.group);
    updaters.push((dt, time) => boat.update?.(dt, time));
  }

  // ------------------------------------------------------------ dune grass
  {
    const spots = [];
    for (const side of sides) {
      let placed = 0;
      for (let tries = 0; tries < 3000 && placed < 190; tries++) {
        const x = side * (222 + rng() * 118), z = (rng() - 0.5) * 200;
        const h = terrain.heightAt(x, z);
        if (h < 1.6 || h > 5 || terrain.slopeAt(x, z) > 0.35 || terrain.waterLevelAt(x, z) !== null) continue;
        if (nearest(keepClear, x, z) < 7) continue;
        // clumps: only where a slow wave pattern is high
        if (Math.sin(x * 0.07 + z * 0.045) + Math.sin(z * 0.09 - x * 0.03) < -0.2) continue;
        spots.push({ x, z, h, s: 0.9 + rng() * 1.6, rot: rng() * TAU, t: rng() });
        placed++;
      }
    }
    if (spots.length) {
      const g = grassGeometry();
      const mesh = new THREE.InstancedMesh(g, MAT.standard, spots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      const a = new THREE.Color('#5a7f72'), b = new THREE.Color('#9aa872'), c = new THREE.Color();
      spots.forEach((s, i) => {
        q.setFromAxisAngle(V(0, 1, 0), s.rot);
        m4.compose(V(s.x, s.h - 0.03, s.z), q, V(s.s, s.s * (0.8 + s.t * 0.7), s.s));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c.copy(a).lerp(b, s.t * 0.8));
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'dune-grass';
      group.add(mesh);
    }
  }

  return {
    group,
    update(dt, time) {
      for (const u of updaters) u(dt, time);
    },
  };
}
