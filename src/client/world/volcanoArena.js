// The crater arena's look (Ashfall Isle): clusters of hexagonal basalt columns
// on the crater floor – cover to dodge and kite round –, glowing cracks at
// their feet, a warning sign at the notch where the path comes in, bones on
// the floor. Data from the shared layout (shared/volcanoArena.js,
// layout.volcanoArena); the columns' colliders are circles in
// layout.colliders. The lava moat is a lava flow (world/water.js), the floor
// and the wall are terrain.
// Also the basalt columns of the mountain path's jump and runs over its lava
// fields and out to the lava lake treasure (layout.steps), glowing at the foot:
// the ones that sink (sink: true) are paler and cracked and go down and up
// with the server's cycle (sink; shared/volcanoArena.js columnTop, which also
// moves their colliders here so the local player sinks with them) – and the
// treasure chest on its islet (openTreasure, minimapMarkers once seen).

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh } from '../models/kit.js';
import { boneGeometry, signGeometry } from './swampArena.js';
import { columnTop, columnCycle } from '../../shared/volcanoArena.js';
import { CONFIG } from '../../shared/config.js';

const BASALT = ['#2f2a30', '#38323a', '#2a2529'];
const CONFIG_COLUMN = () => CONFIG.volcano.column;

/**
 * One column (local, ground at y = 0): a hexagonal prism, its top a little
 * lighter and chipped – a cracked one (it sinks) paler, with glowing seams.
 */
function columnGeometry(c, k, cracked = false) {
  const g = new THREE.CylinderGeometry(c.r * 0.92, c.r, c.h, 6, cracked ? 8 : 3).translate(0, c.h / 2 - 0.15, 0);
  if (cracked) return paint(g, (p) => (Math.abs(Math.sin(p.y * 5.1 + p.x * 3)) < 0.12 ? '#ff6a1c' : p.y > c.h - 0.4 ? '#7a6a64' : '#5e524e'));
  return paint(g, (p) => (p.y > c.h - 0.4 ? '#4a4248' : BASALT[(k + Math.floor(p.y * 1.3)) % BASALT.length]));
}

/** The treasure chest (local, ground at y = 0): a basalt box, an obsidian lid, a glowing seam. */
function chestGeometry() {
  const box = paint(new THREE.BoxGeometry(1.4, 0.75, 0.9).translate(0, 0.375, 0), '#3a3236');
  const bands = paint(new THREE.BoxGeometry(1.46, 0.12, 0.96).translate(0, 0.62, 0), '#b8862e');
  const seam = paint(new THREE.BoxGeometry(1.42, 0.05, 0.92).translate(0, 0.76, 0), '#ff8a2a');
  return merge([box, bands, seam]);
}
function lidGeometry() {
  // (hinged at the back edge: local origin on the hinge)
  return merge([
    paint(new THREE.BoxGeometry(1.44, 0.28, 0.94).translate(0, 0.14, 0.47), '#1c1820'),
    paint(new THREE.BoxGeometry(0.3, 0.1, 0.3).translate(0, 0.33, 0.47), '#b8862e'),
  ]);
}

/** A ring of glowing cracks round a column's foot (emissive). */
function emberGeometry(c) {
  return paint(new THREE.TorusGeometry(c.r * 1.08, 0.06, 4, 12).rotateX(Math.PI / 2).translate(0, 0.04, 0), '#ff6a1c');
}

export function buildVolcanoArena(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'volcano-arena';
  const a = layout.volcanoArena;
  if (!a) return { group, update() {}, sink() {}, openTreasure() {}, minimapMarkers: () => [] };
  const solid = [], glow = [];
  let k = 0;
  for (const cl of a.columns) {
    for (const c of cl.parts) {
      solid.push(place(columnGeometry(c, k++), [c.x, c.y, c.z], [c.tilt, c.rot, c.tilt * 0.5]));
      glow.push(place(emberGeometry(c), [c.x, c.y, c.z], [0, c.rot, 0]));
    }
  }
  // the jump-and-run columns: from deep in the lava up to their tops (sinking ones: meshes of their own)
  const sinking = [];
  for (const st of layout.steps || []) {
    const c = { r: st.r, h: 3.2, tilt: 0, rot: (st.x * 7.3 + st.z * 3.1) % 6.28 };
    if (st.sink) {
      const m = mesh(columnGeometry(c, k++, true), MAT.standard);
      m.position.set(st.x, st.top - c.h + 0.15, st.z);
      m.rotation.y = c.rot;
      group.add(m);
      sinking[st.id] = { st, m, base: st.top - c.h + 0.15, start: null };
    } else solid.push(place(columnGeometry(c, k++), [st.x, st.top - c.h + 0.15, st.z], [0, c.rot, 0]));
    const lava = terrain.lavaLevelAt(st.x, st.z);
    if (lava !== null) glow.push(place(emberGeometry(c), [st.x, lava + 0.02, st.z], [0, c.rot, 0]));
  }
  if (a.sign) solid.push(place(signGeometry(), [a.sign.x, a.sign.y, a.sign.z], [0, -a.sign.angle + Math.PI / 2, 0]));
  for (const b of a.bones) solid.push(place(boneGeometry(b.kind), [b.x, b.y - 0.05, b.z], [0, b.rot, 0], b.s));
  if (solid.length) group.add(mesh(merge(solid), MAT.standard));
  const embers = glow.length ? mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), { cast: false }) : null;
  if (embers) { embers.name = 'arena-embers'; group.add(embers); }
  // the lava lake treasure
  const tr = layout.treasure;
  let chest = null, lid = null, opened = false, seen = false;
  if (tr) {
    chest = mesh(chestGeometry(), MAT.standard);
    chest.position.set(tr.x, tr.y, tr.z);
    lid = mesh(lidGeometry(), MAT.standard);
    lid.position.set(tr.x, tr.y + 0.75, tr.z - 0.47);
    group.add(chest, lid);
  }
  let clock = 0;
  return {
    group,
    /** A sinking column started its cycle `left` s ago (EV.COLUMN, or the welcome). */
    sink(id, left = 0) {
      const s = sinking[id];
      if (s) s.start = clock - left;
    },
    /** The treasure was opened (EV.TREASURE, or the welcome): the lid swings up. */
    openTreasure() { opened = true; },
    /** The treasure on the minimap once someone came within 60 m of it, till it is opened. */
    minimapMarkers() { return tr && seen && !opened ? [{ kind: 'objective', x: tr.x, z: tr.z, color: '#ff8a2a' }] : []; },
    update(dt, time, cam) {   // (cam: the camera's position)
      clock += dt;
      // the cracks at the columns' feet breathe
      if (embers) embers.material.color.setScalar(0.75 + 0.25 * Math.sin(time * 1.7));
      // sinking columns: shake, down, up – their colliders with them
      for (const s of sinking) {
        if (!s || s.start == null) continue;
        const t = clock - s.start, done = t >= columnCycle(s.st);
        const top = done ? s.st.top : columnTop(s.st, t);
        s.m.position.y = s.base + (top - s.st.top);
        const shake = t < CONFIG_COLUMN().wobble ? 0.05 * Math.sin(t * 60) : 0;
        s.m.position.x = s.st.x + shake;
        const col = layout.stepColliders?.[s.st.id];
        if (col) { col.top = top; col.bottom = top - 4; }
        if (done) s.start = null;
      }
      if (lid) lid.rotation.x += ((opened ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 4);
      if (tr && cam && !seen && Math.hypot(cam.x - tr.x, cam.z - tr.z) < 60) seen = true;
    },
  };
}
