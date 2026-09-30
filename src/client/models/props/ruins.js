// Ruins: an old stone plaza (~14 m across) laid out by shared/ruinsShape.js
// (so the stones match the colliders): paving slabs with gaps, a ring of
// fluted pillars (some whole, some snapped), a partial arch at the entrance,
// two low block walls, fallen column drums and a stepped altar in the middle
// (the relic stands on it at RUINS_ALTAR_TOP). Jungle: moss, vines and ferns.
// Volcano: scorched, ash-dusted stone and ash drifts. Cut stone has soft bevels.
//
// API: buildRuins(r, biome) -> THREE.Group at (r.x, r.y, r.z), rotation.y = r.rot.
//   RUINS_ALTAR_TOP (re-exported) = altar top height above r.y.

import * as THREE from 'three';
import { MAT, deform, paint, place, merge, tube, blob, mesh } from '../kit.js';
import { leafStrip, arcPath, LEAF_MAT } from '../../world/veg/shapes.js';
import { fernGeometry } from '../../world/veg/plants.js';
import { footprint } from '../../world/hut/pieces.js';
import { makeRng } from '../../../shared/rng.js';
import { ruinsLayout, RUINS_ALTAR_TOP, RUINS_RADIUS } from '../../../shared/ruinsShape.js';
import { TAU, noise3, fbm3, smoothstep, roundedBox, tintGlow } from './common.js';

export { RUINS_ALTAR_TOP };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function palette(biome) {
  const volcano = biome?.id === 'volcano';
  return volcano
    ? { volcano, stone: ['#6d6468', '#5e565b', '#7a7074'].map((h) => new THREE.Color(h)), seam: new THREE.Color('#3a3438'), top: new THREE.Color(biome?.terrain?.ash || '#8f8a8c'), low: new THREE.Color(biome?.terrain?.scorch || '#2e2629'), rune: '#ff8a3a',
      earth: ['#4a4144', '#5e5558', biome?.terrain?.ash || '#6f686c'].map((h) => new THREE.Color(h)) }
    : { volcano, stone: ['#bcb19c', '#aaa08d', '#c9bea8'].map((h) => new THREE.Color(h)), seam: new THREE.Color('#857b6a'), top: new THREE.Color(biome?.rocks?.moss || '#6fa845'), low: new THREE.Color('#5d7f3a'), rune: '#6fe3ff',
      earth: [biome?.terrain?.dirtDark || '#b0814c', biome?.terrain?.floor || '#4c9434', biome?.terrain?.grass || '#7cc34a'].map((h) => new THREE.Color(h)) };
}

export function buildRuins(r, biome) {
  const P = palette(biome);
  const L = ruinsLayout(r);
  const rng = makeRng(((r.seed ?? 1) * 104729 + 3) >>> 0);
  const seed = (r.seed ?? 1) | 0;
  const tmp = new THREE.Color();
  const std = [], leaf = [], glow = [];
  const leafs = [];                                   // extra fern spots [x, z]
  const ROOT2 = new THREE.Color('#8a6a4a');

  /** Stone painter in the piece's local frame; o = world-ish offset for noise. */
  const stone = (o = [0, 0, 0], shade = 1) => (c, n) => {
    const x = c.x + o[0], y = c.y + o[1], z = c.z + o[2];
    const t = fbm3(x * 0.6, y * 0.6, z * 0.6, seed);
    tmp.copy(P.stone[0]).lerp(P.stone[1], smoothstep(0, 0.6, t)).lerp(P.stone[2], smoothstep(0, -0.6, t));
    tmp.multiplyScalar(shade * (0.95 + 0.06 * noise3(x * 4, y * 4, z * 4, seed + 1)));
    const up = smoothstep(0.55, 0.9, n.y) * (0.5 + 0.5 * smoothstep(-0.2, 0.4, fbm3(x * 0.9, y * 0.9, z * 0.9, seed + 4)));
    const foot = 1 - smoothstep(0.0, 0.9, y);
    if (P.volcano) {
      tmp.lerp(P.top, up * 0.65);
      tmp.lerp(P.low, foot * 0.45 + (noise3(x * 1.5, y * 1.5, z * 1.5, seed + 8) > 0.45 ? 0.35 : 0));
    } else {
      tmp.lerp(P.top, up * 0.85);
      tmp.lerp(P.low, foot * 0.5 * (0.5 + 0.5 * noise3(x * 2, 0, z * 2, seed + 6)));
    }
    return tmp;
  };
  const warp = (amt, s) => (v) => { v.x += noise3(v.x * 2 + s, v.y * 2, v.z * 2, seed) * amt; v.y += noise3(v.x * 2, v.y * 2 + s, v.z * 2, seed + 1) * amt * 0.6; v.z += noise3(v.x * 2, v.y * 2, v.z * 2 + s, seed + 2) * amt; };
  const block = (w, h, d, pos, rot = [0, 0, 0], s = 1) => {
    const g = roundedBox(w, h, d, Math.min(0.07, h * 0.25), stone(pos, 0.92 + 0.12 * rng()), warp(0.025, s));
    return place(g, pos, rot);
  };

  // ------------------------------------------------------------ paving
  const step = 1.36;
  for (let gx = -5; gx <= 5; gx++) for (let gz = -5; gz <= 5; gz++) {
    const x = gx * step + ((gz % 2) ? step * 0.5 : 0), z = gz * step;
    if (Math.hypot(x, z) > RUINS_RADIUS - 0.4) continue;
    if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) continue;           // under the altar
    if (rng() < 0.17) continue;                                     // missing slab (grass shows)
    const tilt = rng() < 0.2 ? 0.06 : 0.015;
    std.push(block(1.26 + rng() * 0.06, 0.18, 1.26 + rng() * 0.06, [x, 0.0 + rng() * 0.03, z], [(rng() - 0.5) * tilt, (rng() - 0.5) * 0.08, (rng() - 0.5) * tilt], rng() * 9));
  }

  // ----------------------------------------------------------- pillars
  const shaftGeo = (h, radius, broken, s) => {
    let g = new THREE.CylinderGeometry(radius * 0.92, radius, h, 36, Math.max(1, Math.round(h / 1.4)), false);
    g.translate(0, h / 2, 0);
    g = deform(g, (v) => {
      const a = Math.atan2(v.z, v.x);
      const rr = Math.hypot(v.x, v.z);
      if (rr > radius * 0.5) {
        const k = 1 - 0.045 * Math.max(0, Math.cos(a * 12));         // flutes
        v.x *= k; v.z *= k;
      }
      if (broken && v.y > h - 0.01) {
        v.y = h - 0.35 * (0.5 + 0.5 * Math.sin(a * 3 + s)) - 0.18 * (0.5 + 0.5 * Math.sin(a * 7 + s * 2)) + 0.15 * (1 - rr / radius);
      }
    });
    return g;
  };
  const drumSeams = (h) => (c, n) => {
    const col = stone([0, 0, 0])(c, n);
    const f = (c.y % 0.9) / 0.9;
    if (f < 0.06 && c.y > 0.3) col.lerp(P.seam, 0.6);
    return col;
  };
  const pillar = (p) => {
    const parts = [];
    parts.push(block(1.15, 0.32, 1.15, [0, 0.16, 0]));
    parts.push(place(paint(new THREE.TorusGeometry(0.45, 0.07, 8, 28), stone([p.x, 0, p.z])), [0, 0.36, 0], [Math.PI / 2, 0, 0]));
    const h = p.h - 0.32;
    const broken = p.state !== 'full';
    parts.push(place(paint(shaftGeo(h - (broken ? 0 : 0.3), p.r, broken, p.x * 3.1), drumSeams(h)), [0, 0.32, 0]));
    if (!broken) {
      parts.push(place(paint(new THREE.TorusGeometry(0.42, 0.08, 8, 28), stone([p.x, p.h, p.z])), [0, p.h - 0.34, 0], [Math.PI / 2, 0, 0]));
      parts.push(block(1.05, 0.3, 1.05, [0, p.h - 0.15, 0]));
    }
    return merge(parts);
  };
  for (const p of L.pillars) {
    std.push(place(pillar(p), [p.x, 0, p.z], [0, rng() * TAU, 0]));
    // broken-off pieces lying next to snapped pillars
    if (p.state === 'broken') {
      const a = rng() * TAU;
      const len = 0.8 + rng() * 0.6;
      std.push(place(paint(shaftGeo(len, p.r, true, a), stone([p.x, 0, p.z])), [p.x + Math.cos(a) * 1.1, p.r * 0.95, p.z + Math.sin(a) * 1.1], [Math.PI / 2, a, 0.1]));
    }
    if (!P.volcano) vines(p.x, p.z, p.r + 0.04, Math.min(p.h, 3.2));
  }

  // --------------------------------------------------------------- arch
  {
    const A = L.arch, half = A.span / 2;
    for (const s of [-1, 1]) {
      const x = A.x + s * half;
      const n = Math.round(A.h / 0.9);
      for (let i = 0; i < n; i++) std.push(block(0.95, 0.88, 0.95, [x + (rng() - 0.5) * 0.04, 0.45 + i * 0.9, A.z], [0, (rng() - 0.5) * 0.06, 0]));
      std.push(block(1.1, 0.24, 1.1, [x, A.h + 0.12, A.z]));
    }
    // voussoirs around a half circle; the broken side stops early
    const R = half, cy = A.h + 0.24;
    const count = 9;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      if ((t - 0.5) * A.broken > 0.06) continue;           // this half fell down
      const a = Math.PI * (1 - t);
      std.push(block(0.62, 0.9, 0.9, [A.x + Math.cos(a) * (R + 0.02), cy + Math.sin(a) * (R + 0.02), A.z], [0, 0, a - Math.PI / 2]));
    }
    // keystone + fallen voussoirs on the broken side
    for (let k = 0; k < 3; k++) {
      std.push(block(0.62, 0.9, 0.9, [A.x + A.broken * (1.4 + k * 0.7 + rng() * 0.3), 0.3, A.z + 0.9 + rng() * 1.2], [rng() * 0.4, rng() * TAU, Math.PI / 2 - 0.2 + rng() * 0.3]));
    }
    if (!P.volcano) for (const s of [-1, 1]) vines(A.x + s * half, A.z, 0.55, A.h);
  }

  // -------------------------------------------------------------- walls
  for (const w of L.walls) {
    const parts = [];
    const rows = Math.max(2, Math.round(w.h / 0.45));
    for (let row = 0; row < rows; row++) {
      let x = -w.len / 2 + (row % 2 ? 0.45 : 0);
      while (x < w.len / 2 - 0.05) {
        const bl = Math.min(0.8 + rng() * 0.35, w.len / 2 - x);
        if (bl > 0.25 && !(row === rows - 1 && rng() < 0.35)) {
          parts.push(block(bl - 0.04, 0.43, 0.7 + (rng() - 0.5) * 0.06, [x + bl / 2, 0.215 + row * 0.45, (rng() - 0.5) * 0.04]));
        }
        x += bl;
      }
    }
    std.push(place(merge(parts), [w.x, 0, w.z], [0, w.yaw, 0]));
    // a couple of tumbled blocks at its foot
    for (let k = 0; k < 2; k++) {
      std.push(place(block(0.8, 0.43, 0.7), [w.x + Math.cos(w.yaw) * (rng() - 0.5) * w.len + Math.sin(w.yaw) * -1.0, 0.2, w.z - Math.sin(w.yaw) * (rng() - 0.5) * w.len + Math.cos(w.yaw) * -1.0], [0.1, rng() * TAU, 0.08]));
    }
  }

  // --------------------------------------------------- fallen columns
  for (const f of L.fallen) {
    const g = paint(shaftGeo(f.len, f.r, true, f.x), drumSeams(f.len));
    std.push(place(place(g, [0, -f.len / 2, 0]), [f.x, f.r * 0.92, f.z], [0, f.yaw, Math.PI / 2]));
  }

  // --------------------------------------------------------------- altar
  std.push(block(2.0, 0.3, 2.0, [0, 0.15, 0]));
  std.push(block(1.55, 0.35, 1.55, [0, 0.47, 0]));
  std.push(block(1.08, 0.4, 1.08, [0, 0.84, 0]));
  std.push(block(1.24, 0.08, 1.24, [0, RUINS_ALTAR_TOP - 0.04, 0]));
  // glowing footprint emblem on the four sides of the altar block
  const fp = footprint(0.34, P.rune);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    glow.push(place(fp.clone(), [Math.sin(a) * 0.545, 0.84, Math.cos(a) * 0.545], [0, a, 0]));
  }

  // --------------------------------------------------------- dressing
  if (!P.volcano) {
    const fern = fernGeometry();
    for (const [x, z] of leafs) leaf.push(place(fern.clone(), [x, 0.02, z], [0, rng() * TAU, 0], 0.8 + rng() * 0.6));
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU, rr = 2 + rng() * 5.5;
      leaf.push(place(fern.clone(), [Math.cos(a) * rr, 0.02, Math.sin(a) * rr], [0, rng() * TAU, 0], 0.7 + rng() * 0.6));
    }
  } else {
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU, rr = 1.5 + rng() * 5.5;
      std.push(place(blob(0.5 + rng() * 0.6, 0.12, 0.4 + rng() * 0.4, (c, n) => (n.y > 0.6 ? '#9a9496' : '#7a7476'), { w: 12, h: 6 }), [Math.cos(a) * rr, 0.02, Math.sin(a) * rr], [0, rng() * TAU, 0]));
    }
  }

  function rootColor(t, a, p) {
    const m = smoothstep(0.35, 0.95, Math.cos(a)) * (0.5 + 0.5 * noise3(p.x * 1.3, 0, p.z * 1.3, seed + 3));
    tmp.set('#6b4f3a').lerp(ROOT2, 0.5 + 0.5 * noise3(p.x * 2, p.y * 2, p.z * 2, seed + 5));
    return tmp.lerp(P.top, m * 0.8);
  }
  /** Creeper hanging over an edge: from the top (height h) down both faces. */
  function drape(x, z, h, spread) {
    const a = rng() * TAU;
    for (const s of [-1, 1]) {
      const ox = Math.cos(a) * spread * s, oz = Math.sin(a) * spread * s;
      const len = h * (0.45 + rng() * 0.45);
      const pts = [V(x, h + 0.04, z), V(x + ox * 0.9, h - len * 0.4, z + oz * 0.9), V(x + ox * 1.05, h - len, z + oz * 1.05)];
      std.push(tube(pts, () => 0.03, { radial: 5, color: () => '#3f7a2c', capStart: false }));
      for (let i = 1; i < 3; i++) {
        const q = pts[i], l = Math.hypot(ox, oz) || 1;
        leaf.push(leafStrip(arcPath(q, ox / l, oz / l, 0.22, 0.4, 1.2, 3), (t) => (t >= 1 ? 0.005 : 0.08 * Math.sin(Math.PI * (0.1 + 0.9 * t))), {
          side: V(-oz / l, 0, ox / l), ridge: 0.3, serrate: 0, color: (t, hh) => (hh ? '#7cc545' : '#4e9a34'),
        }));
      }
    }
  }

  function vines(x, z, radius, h) {
    const turns = 1.2 + rng() * 0.6, a0 = rng() * TAU;
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, a = a0 + t * turns * TAU;
      pts.push(V(x + Math.cos(a) * radius, 0.3 + t * h * (0.6 + rng() * 0.2), z + Math.sin(a) * radius));
    }
    std.push(tube(pts, () => 0.035, { radial: 5, color: () => '#3f7a2c', capStart: false }));
    for (let i = 1; i < 7; i++) {
      const q = pts[i], dx = q.x - x, dz = q.z - z, l = Math.hypot(dx, dz) || 1;
      leaf.push(leafStrip(arcPath(q, dx / l, dz / l, 0.25, 0.5, 1.2, 3), (t) => (t >= 1 ? 0.005 : 0.08 * Math.sin(Math.PI * (0.1 + 0.9 * t))), {
        side: V(-dz / l, 0, dx / l), ridge: 0.3, serrate: 0, color: (t, hh) => (hh ? '#7cc545' : '#4e9a34'),
      }));
    }
  }

  const group = new THREE.Group();
  group.name = 'ruins';
  group.position.set(r.x, r.y ?? 0, r.z);
  group.rotation.y = r.rot || 0;
  group.add(mesh(merge(std), MAT.standard));
  if (leaf.length) group.add(mesh(merge(leaf), LEAF_MAT, { cast: false }));
  group.add(mesh(merge(glow), tintGlow(0.9, 0.4), { cast: false }));
  return group;
}
