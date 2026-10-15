// The expedition tent (island 1's camp and base stage 1, see shared/base.js
// CAMP_TENT for its collider) and the building site where the team puts up
// its camp table on island 1. Prepared vertex-coloured geometry to merge.

import * as THREE from 'three';
import { part, deform, jitter } from '../../models/kit.js';
import { COL, box, plank, log, lashing } from './pieces.js';

/** Jungle timber and hide; the base passes its biome style (client/world/base.js STYLE). */
export const TENT_STYLE = { log: COL.log, cloth: '#c98a4f', clothDark: '#a86a35' };

/** Lean-to tent: two A-frames, ridge pole and a hide / canvas roof, open toward local -z and +z. */
export function buildTent(style = TENT_STYLE) {
  const out = [];
  // W = full width at the ground, D = half length, H = ridge height
  const W = 4.6, D = 2.2, H = 2.6;
  const slant = Math.hypot(W / 2, H);
  const lean = Math.atan2(W / 2, H);          // leg tilt from vertical
  for (const z of [-D, D]) {
    for (const s of [-1, 1]) {
      // leg from the ground at x = s·W/2 up to the ridge
      out.push(log(slant + 0.35, 0.08, [s * W / 4, H / 2, z], 'y', { body: style.log[1], seed: 5 + s, rot: [0, 0, s * lean] }));
    }
  }
  out.push(log(D * 2 + 0.6, 0.08, [0, H, 0], 'z', { body: style.log[2], seed: 9 }));
  const rise = Math.atan2(H, W / 2);          // roof angle above the ground
  for (const s of [-1, 1]) {
    // thin slab (visible from both sides), sagging a little between the poles
    let cloth = new THREE.BoxGeometry(slant - 0.05, 0.04, D * 2 + 0.3, 6, 1, 4);
    cloth = deform(cloth, (v) => { v.y -= Math.cos((v.z / (D + 0.15)) * Math.PI / 2) * 0.06 + jitter(v, 0.015, 3); });
    out.push(part(cloth, (c) => (Math.abs(Math.sin(c.z * 3)) > 0.9 ? style.clothDark : style.cloth),
      [s * W / 4, H / 2 + 0.06, 0], [0, 0, -s * rise]));
  }
  // bedrolls inside
  out.push(box(0.7, 0.18, 1.7, style.clothDark, [-0.6, 0.09, 0.4], [0, 0.1, 0]));
  out.push(box(0.7, 0.18, 1.7, style.cloth, [0.6, 0.09, 0.2], [0, -0.08, 0]));
  return out;
}

/**
 * Where the camp table will stand: two corner stakes with a rope between them and a
 * lashed bundle of planks, inside the footprint of the table's collider (shared/layout.js).
 */
export function buildBenchSite() {
  const out = [];
  for (const sx of [-1, 1]) out.push(log(0.9, 0.05, [sx * 1.25, 0.45, -0.45], 'y', { body: COL.log[3], seed: 11 + sx, ends: [false, true] }));
  out.push(box(2.5, 0.02, 0.02, COL.rope, [0, 0.78, -0.45]));
  for (let k = 0; k < 4; k++) out.push(plank(1.9, 0.07, 0.26, COL.plank[k % COL.plank.length], [-0.1, 0.05 + k * 0.08, 0.1], [0, (k - 1.5) * 0.04, 0], 21 + k));
  for (const lx of [-0.7, 0.5]) out.push(lashing(0.2, 0.06, 2, [lx, 0.2, 0.1], [0, 0, Math.PI / 2]));
  return out;
}
