// The Hollow Mountain's wall torches (`layout.wallTorches`, shared/torch.js WALL_TORCH): an iron sconce
// with a pitch torch on the tunnel wall about every 50 m. Unlit they are dark; the team lights them one by
// one with a burning hand torch (E, server-checked) and they stay lit, so the cave gets brighter as the
// team explores. Every lit one shows its flame and glow; the nearest few get a pooled light (created at
// island build, driven by intensity only - never add, remove or hide lights later).

import * as THREE from 'three';
import { WALL_TORCH } from '../../shared/torch.js';
import { merge, paint, place } from '../models/kit.js';
import { glowMaterial } from './veg/shapes.js';
import { glowPoints } from './caveDecor.js';
import { withCaveSky } from './caveSky.js';

const IRON = '#2f2b2a', WOOD = '#5a4330', PITCH = '#231c17';
const REASSIGN = 0.25;   // seconds between choosing which lit torches get the pooled lights
const REACH = 46;        // a lit torch further than this from the camera gets no light

/** One sconce at the origin, the wall behind it on -x, the torch leaning out along +x. */
function sconceGeometry() {
  const g = [];
  g.push(place(paint(new THREE.BoxGeometry(0.08, 0.34, 0.2), IRON), [0.04, -0.05, 0]));                       // wall plate
  g.push(place(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), IRON), [0.2, -0.1, 0], [0, 0, Math.PI / 2 - 0.5]));   // arm
  g.push(place(paint(new THREE.TorusGeometry(0.075, 0.018, 6, 12), IRON), [0.33, 0.0, 0], [Math.PI / 2, 0, 0]));            // ring
  g.push(place(paint(new THREE.CylinderGeometry(0.035, 0.028, 0.62, 7), WOOD), [0.34, 0.06, 0], [0, 0, -0.25]));          // stick
  g.push(place(paint(new THREE.CylinderGeometry(0.075, 0.05, 0.2, 8), PITCH), [0.42, 0.36, 0], [0, 0, -0.25]));           // pitch head
  return merge(g);
}
/** Where the flame sits relative to the sconce origin. */
const FLAME_AT = new THREE.Vector3(0.45, 0.55, 0);

export function buildWallTorches(terrain, layout, gfx) {
  const group = new THREE.Group();
  group.name = 'wall-torches';
  const list = layout.wallTorches ?? [];
  const api = { group, setLit() {}, update() {} };
  if (!list.length) return api;

  // sconces: one merged mesh, lit by the sky field like the rest of the cave (dark from outside)
  const base = sconceGeometry();
  const geos = [], flames = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  for (const t of list) {
    const yaw = Math.atan2(-t.nz, t.nx);   // +x of the sconce faces out of the wall
    q.setFromAxisAngle(up, yaw);
    m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(1, 1, 1));
    geos.push(base.clone().applyMatrix4(m4));
    flames.push(v.copy(FLAME_AT).applyMatrix4(m4).clone());
  }
  base.dispose();
  const sconceMat = withCaveSky(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }), 1);
  const sconces = new THREE.Mesh(merge(geos), sconceMat);
  sconces.name = 'wall-torch-sconces';
  sconces.receiveShadow = true;
  group.add(sconces);

  // flames: an instanced, emissive teardrop per torch, scaled to nothing while unlit
  // (a soft teardrop: a sphere, narrowed toward the top, warm yellow at the core and orange at the tip)
  const flameGeo = new THREE.SphereGeometry(0.1, 14, 10);
  {
    const pos = flameGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 0.1, k = (y + 1) / 2;   // 0 bottom .. 1 top
      pos.setXYZ(i, pos.getX(i) * (1 - 0.75 * k * k), (y + 1) * 0.19, pos.getZ(i) * (1 - 0.75 * k * k));
      c.set('#ffe7a0').lerp(new THREE.Color('#ff8a2a'), k);
      col.set([c.r, c.g, c.b], i * 3);
    }
    flameGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flameGeo.computeVertexNormals();
  }
  const flameMesh = new THREE.InstancedMesh(flameGeo, glowMaterial(2.2, 0.6), list.length);
  flameMesh.name = 'wall-torch-flames';
  flameMesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < list.length; i++) flameMesh.setMatrixAt(i, zero);
  group.add(flameMesh);

  // halos: the warm glow round each flame (size 0 while unlit)
  const halos = glowPoints(flames.map((p, i) => ({ x: p.x, y: p.y + 0.15, z: p.z, size: 0, color: new THREE.Color('#ff9a46'), seed: (i * 0.618) % 1 })), { name: 'wall-torch-halos', range: [70, 160] });
  group.add(halos);
  const haloSize = halos.geometry.getAttribute('aSize');

  // the pooled lights (count by graphics tier), built now - before Renderer.prepare
  const L = WALL_TORCH.light;
  const count = WALL_TORCH.pool[['Low', 'Medium', 'High', 'Ultra'].indexOf(gfx?.graphics?.name ?? 'High')] ?? 3;
  const pool = gfx.addLightPool?.('wallTorch', { count, color: L.color, distance: L.distance, decay: L.decay }) ?? null;
  const slots = Array.from({ length: pool?.size ?? 0 }, () => ({ torch: -1, k: 0 }));

  const lit = new Set();
  let assignT = 0;
  const flicker = (time, i) => 0.82 + 0.1 * Math.sin(time * 9.3 + i * 2.1) + 0.06 * Math.sin(time * 23.7 + i * 5.3) + 0.04 * Math.sin(time * 3.1 + i);

  api.setLit = (ids) => {
    for (const id of ids) if (list[id]) lit.add(id);
    for (let i = 0; i < list.length; i++) haloSize.setX(i, lit.has(i) ? 3.6 : 0);
    haloSize.needsUpdate = true;
  };
  api.update = (dt, time, cam) => {
    halos.material.uniforms.uTime.value = time;
    // flames dance
    for (const i of lit) {
      const p = flames[i], s = flicker(time, i);
      m4.makeScale(0.9 + 0.2 * s, 0.75 + 0.5 * s, 0.9 + 0.2 * s).setPosition(p.x, p.y, p.z);
      flameMesh.setMatrixAt(i, m4);
    }
    if (lit.size) flameMesh.instanceMatrix.needsUpdate = true;
    if (!pool) return;
    // every REASSIGN s: the nearest lit torches take the lights; a slot fades out before it moves
    assignT -= dt;
    if (assignT <= 0 && cam) {
      assignT = REASSIGN;
      const want = [...lit].map((i) => ({ i, d: Math.hypot(flames[i].x - cam.x, flames[i].y - cam.y, flames[i].z - cam.z) }))
        .filter((o) => o.d < REACH).sort((a, b) => a.d - b.d).slice(0, slots.length).map((o) => o.i);
      for (const s of slots) if (s.torch >= 0 && !want.includes(s.torch)) s.next = -1;
      for (const i of want) {
        if (slots.some((s) => s.torch === i)) continue;
        const free = slots.find((s) => s.torch < 0) ?? slots.find((s) => s.next === -1 && s.k <= 0.05);
        if (free) { free.torch = i; free.next = undefined; free.k = 0; }
      }
    }
    slots.forEach((s, n) => {
      const target = s.torch >= 0 && s.next !== -1 ? 1 : 0;
      s.k += (target - s.k) * Math.min(1, dt * 4);
      if (s.torch < 0 || (target === 0 && s.k < 0.02)) { s.torch = -1; s.next = undefined; s.k = 0; pool.off(n); return; }
      const p = flames[s.torch];
      pool.set(n, p.x, p.y + 0.35, p.z, L.intensity * s.k * flicker(time, s.torch));
    });
  };
  return api;
}
