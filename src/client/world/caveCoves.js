// The two outdoor coves of the Hollow Mountain and the mouths of its tunnels:
// the boat the team arrived on (west cove, moored, intact), drift wood along the
// tide line, dune grass, lantern posts along the way to the tunnel mouth and
// beside the boat, and old timber supports in the tunnel mouths so the dark arch
// reads as a way in (and out). Decoration only (no colliders, `layout` owns those).

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';
import { MAT, tube, merge, paint, place } from '../models/kit.js';
import { buildBoat } from '../models/props/boat.js';
import { log as logPiece, COL, tone } from './hut/pieces.js';
import { grassGeometry } from './veg/plants.js';
import { glowMaterial } from './veg/shapes.js';
import { glowPoints } from './caveDecor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const WOOD = ['#6b5a4a', '#5e5044', '#7a6a58', '#4f4338'];       // weathered grey-brown drift wood
const TIMBER = ['#5d4630', '#664e34', '#52402c'];

/** Distance from (x, z) to the nearest of `pts`. */
const nearest = (pts, x, z) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);

export function buildCaveCoves(terrain, layout, { roofY }) {
  const group = new THREE.Group();
  group.name = 'cave-coves';
  const rng = makeRng(layout.plan.seed ^ 0xc07e);
  const maze = layout.plan.cave.maze;
  const halos = [];
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

  // ------------------------------------------------------------ drift wood
  {
    const geos = [];
    for (const side of sides) {
      let placed = 0;
      for (let tries = 0; tries < 900 && placed < 16; tries++) {
        const x = side * (225 + rng() * 118), z = (rng() - 0.5) * 190;
        const h = terrain.heightAt(x, z);
        if (h < 0.5 || h > 2.4 || terrain.slopeAt(x, z) > 0.3 || terrain.waterLevelAt(x, z) !== null) continue;
        if (nearest(keepClear, x, z) < 9) continue;
        const len = 2.2 + rng() * 4.2, r = 0.1 + rng() * 0.16, yaw = rng() * TAU;
        const pts = [], bend = (rng() - 0.5) * 0.9, ph = rng() * 6;
        for (let i = 0; i <= 5; i++) {
          const t = i / 5;
          pts.push(V(x + Math.cos(yaw) * (t - 0.5) * len + Math.sin(yaw) * bend * Math.sin(t * Math.PI), h + r * 0.55 + Math.sin(t * 4 + ph) * 0.05, z - Math.sin(yaw) * (t - 0.5) * len + Math.cos(yaw) * bend * Math.sin(t * Math.PI)));
        }
        const base = WOOD[(rng() * WOOD.length) | 0];
        geos.push(tube(pts, (t) => r * (1.15 - t * 0.5) * (1 + 0.12 * Math.sin(t * 11 + ph)), { radial: 7, color: (t, a) => (Math.cos(a) > 0.5 ? tone(base, 1.2) : tone(base, 0.8 + 0.25 * t)) }));
        if (rng() < 0.5) {   // a broken branch stub
          const bp = pts[1 + ((rng() * 3) | 0)];
          geos.push(tube([bp.clone(), bp.clone().add(V((rng() - 0.5) * 0.7, 0.45 + rng() * 0.3, (rng() - 0.5) * 0.7))], (u) => r * 0.38 * (1 - u * 0.7), { radial: 5, color: () => tone(base, 0.9) }));
        }
        placed++;
      }
    }
    if (geos.length) {
      const m = new THREE.Mesh(merge(geos), MAT.standard);
      m.name = 'driftwood'; m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
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

  // ------------------------------------------------------------ lanterns
  const lanternGeos = [], lanternGlass = [];
  const lantern = (x, z, face = 0, tall = 2.5) => {
    const y = terrain.heightAt(x, z);
    const parts = [];
    parts.push(logPiece(tall, 0.085, [0, tall / 2, 0], 'y', { body: TIMBER[0], seed: 3 + lanternGeos.length, ends: [false, true], radial: 7 }));
    const dx = Math.cos(face) * 0.38, dz = -Math.sin(face) * 0.38;
    parts.push(logPiece(0.55, 0.05, [dx * 0.5, tall - 0.12, dz * 0.5], 'x', { body: TIMBER[1], seed: 9, rot: [0, face, 0], ends: [false, false], radial: 6 }));
    for (const p of parts) { p.translate(x, y, z); lanternGeos.push(p); }
    // the lantern: a small iron cage around a glowing glass
    const lx = x + dx, lz = z + dz, ly = y + tall - 0.42;
    lanternGeos.push(place(paint(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 6, 1, true), '#2e2c2f'), [lx, ly, lz]));
    lanternGeos.push(place(paint(new THREE.ConeGeometry(0.16, 0.12, 6), '#2e2c2f'), [lx, ly + 0.2, lz]));
    lanternGlass.push(place(paint(new THREE.SphereGeometry(0.09, 10, 8), '#ffd48a'), [lx, ly, lz]));
    halos.push({ x: lx, y: ly, z: lz, size: 5.2, color: new THREE.Color('#ff9a46').multiplyScalar(0.9), seed: (lanternGeos.length * 0.37) % 1 });
  };
  {
    const camp = layout.hut.campfire, en = layout.caveEntrance, ex = layout.caveExit, ab = layout.arrivalBoat, bt = layout.boat;
    // west: along the way from the camp to the tunnel mouth, and at the mouth
    for (const t of [0.3, 0.55, 0.8]) {
      const x = camp.x + (en.x - camp.x) * t, z = camp.z + (en.z - camp.z) * t;
      const nx = -(en.z - camp.z), nz = en.x - camp.x, nl = Math.hypot(nx, nz) || 1;
      lantern(x + (nx / nl) * 3.6, z + (nz / nl) * 3.6, rng() * TAU);
    }
    lantern(en.x - 5, en.z - 9, 0.4); lantern(en.x - 5, en.z + 9, -0.4);
    if (ab) lantern(ab.x + 5, ab.z - 5, 0.6);
    // east: the way out is lit as well, and the boat
    lantern(ex.x + 5, ex.z - 9, 0.4); lantern(ex.x + 5, ex.z + 9, -0.4);
    if (bt) { lantern(bt.x - 7, bt.z - 6, 0.5); lantern(bt.x - 7, bt.z + 8, -0.5); }
  }

  // ------------------------------------------------------------ timber supports in the tunnel mouths
  {
    const supports = (tunnel, count) => {
      const pts = tunnel.pts;
      const seg = []; let tot = 0;
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); seg.push(d); tot += d; }
      const at = (s) => {
        let a = Math.min(Math.max(s, 0), tot - 1e-3), i = 0;
        while (i < seg.length - 1 && a > seg[i]) { a -= seg[i]; i++; }
        const f = a / seg[i];
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, z: pts[i].z + (pts[i + 1].z - pts[i].z) * f, dx: (pts[i + 1].x - pts[i].x) / seg[i], dz: (pts[i + 1].z - pts[i].z) / seg[i] };
      };
      // the roof begins where Terrain.ceilingAt becomes finite: walked from the outside in
      // (mouth tunnels start outside, the exit tunnel ends outside)
      const outward = tunnel.kind === 'exit';
      let roofEdge = outward ? 0 : tot;
      if (outward) { for (let q = tot; q > 0; q -= 1) { const c = at(q); if (terrain.ceilingAt(c.x, c.z) < 30) { roofEdge = q; break; } } }
      else { for (let q = 0; q < tot; q += 1) { const c = at(q); if (terrain.ceilingAt(c.x, c.z) < 30) { roofEdge = q; break; } } }
      for (let k = 0; k < count; k++) {
        const p = at(outward ? roofEdge - 2.5 - k * 7 : roofEdge + 2.5 + k * 7);
        const nx = -p.dz, nz = p.dx;
        const floor = terrain.heightAt(p.x, p.z);
        const edge = (sgn) => {
          let d = 0;
          while (d < 14 && terrain.heightAt(p.x + nx * sgn * d, p.z + nz * sgn * d) < floor + 1.5) d += 0.4;
          return Math.max(1.5, d - 0.9);
        };
        const L = { x: p.x + nx * edge(1), z: p.z + nz * edge(1) }, R = { x: p.x - nx * edge(-1), z: p.z - nz * edge(-1) };
        if (!(terrain.ceilingAt(p.x, p.z) < 40)) continue;
        const topY = (q) => Math.min(roofY(q.x, q.z) - 0.15, terrain.heightAt(q.x, q.z) + 12);
        const yl = terrain.heightAt(L.x, L.z), yr = terrain.heightAt(R.x, R.z), tl = topY(L), tr = topY(R);
        const seed = 5 + k * 3 + lanternGeos.length;
        for (const [q, y0, y1, sd] of [[L, yl, tl, seed], [R, yr, tr, seed + 1]]) {
          lanternGeos.push(logPiece(y1 - y0 + 0.3, 0.34, [q.x, (y0 + y1) / 2 - 0.1, q.z], 'y', { body: TIMBER[sd % 3], seed: sd, radial: 8, ends: [false, true] }));
        }
        // the cap beam across (tilted with the roof), two braces, a lantern on a rope
        const cx = (L.x + R.x) / 2, cz = (L.z + R.z) / 2, span = Math.hypot(L.x - R.x, L.z - R.z);
        const yaw = Math.atan2(-(R.z - L.z), R.x - L.x), tilt = Math.atan2(tr - tl, span);
        lanternGeos.push(logPiece(span + 1.4, 0.3, [cx, (tl + tr) / 2 + 0.1, cz], 'x', { body: TIMBER[(seed + 2) % 3], seed: seed + 2, rot: [0, yaw, tilt], radial: 8, ends: [true, true] }));
        for (const [q, y1, sgn] of [[L, tl, -1], [R, tr, 1]]) {
          const bx = q.x + (cx - q.x) * 0.22, bz = q.z + (cz - q.z) * 0.22;
          lanternGeos.push(logPiece(3.4, 0.14, [bx, y1 - 1.5, bz], 'x', { body: TIMBER[(seed + 1) % 3], seed: seed + 5, rot: [0, yaw, sgn * 0.78], radial: 6, ends: [false, false] }));
        }
        const ly = (tl + tr) / 2 - 1.6;
        lanternGeos.push(place(paint(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), COL.rope), [cx, ly + 0.9, cz]));
        lanternGeos.push(place(paint(new THREE.CylinderGeometry(0.2, 0.17, 0.46, 7, 1, true), '#2e2c2f'), [cx, ly + 0.05, cz]));
        lanternGlass.push(place(paint(new THREE.SphereGeometry(0.13, 10, 8), '#ffd48a'), [cx, ly, cz]));
        halos.push({ x: cx, y: ly, z: cz, size: 7, color: new THREE.Color('#ff9a46').multiplyScalar(0.9), seed: (k * 0.31) % 1 });
      }
    };
    for (const t of maze.tunnels) if (t.kind === 'mouth' || t.kind === 'exit') supports(t, 3);
  }
  if (lanternGeos.length) {
    const m = new THREE.Mesh(merge(lanternGeos), MAT.standard);
    m.name = 'posts-and-supports'; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  if (lanternGlass.length) {
    const glass = new THREE.Mesh(merge(lanternGlass), glowMaterial(1.6, 0.4));
    glass.name = 'lantern-glass';
    group.add(glass);
  }

  const points = halos.length ? glowPoints(halos, { name: 'lantern-halos', range: [60, 220] }) : null;
  if (points) group.add(points);
  return {
    group,
    update(dt, time) {
      for (const u of updaters) u(dt, time);
      if (points) points.material.uniforms.uTime.value = time;
    },
  };
}
