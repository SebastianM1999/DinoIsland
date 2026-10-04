// Built ground and stone walls of the team base (world/base.js), in the plot
// frame (origin = plot centre, front / gate toward local -z):
//   stoneWall  – the fort's masonry wall on volcanic islands: coursed blocks of
//                varied size with offset joints on a wide plinth, coping and
//                merlons, pillars where the straight sections meet, gate towers.
//                Stays inside the palisade colliders of shared/base.js.
//   baseFloor  – laid flagstones (an irregular tiling with real gaps) around the
//                campfire and along paths from the gate to the fire and the
//                buildings, plus a plank porch before the cabin; it grows with
//                the base stage. Decoration only (a few cm high, no collider).

import * as THREE from 'three';
import { paint, place, deform, jitter, smoothNormals } from '../models/kit.js';
import { makeRng, hash2 } from '../../shared/rng.js';
import { BASE_LOCAL, PALISADE_R, TOWER_SLOTS, palisadeSegments } from '../../shared/base.js';
import { CABIN } from './hut/cabin.js';
import { tone, plank, log, COL } from './hut/pieces.js';

const TAU = Math.PI * 2;
const SEGMENTS = 26;                       // must match shared/base.js PALISADE_SEGMENTS
const SEG_LEN = (TAU * PALISADE_R) / SEGMENTS;
const _c = new THREE.Color();

// ------------------------------------------------------------------ blocks

/**
 * One dressed stone block (w along x, h, d along z), base at y = 0: corners
 * knocked off a little and faces pillowed, top lit, foot darker.
 */
function block(w, h, d, color, seed) {
  let g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  g = deform(g, (v) => {
    const ex = Math.abs(v.x) / (w / 2), ey = Math.abs(v.y) / (h / 2), ez = Math.abs(v.z) / (d / 2);
    // chamfer: pull the outermost corners inward
    const corner = Math.max(0, ex + ey + ez - 2.2);
    v.multiplyScalar(1 - corner * 0.06);
    v.x += jitter(v, 0.018, seed);
    v.y += jitter(v, 0.012, seed + 1);
    v.z += jitter(v, 0.018, seed + 2);
  });
  g = smoothNormals(g, (35 * Math.PI) / 180);
  const top = tone(color, 1.12), foot = tone(color, 0.78);
  g = paint(g, (c, n) => {
    if (n.y > 0.6) return top;
    const k = (c.y + h / 2) / h;
    return _c.set(foot).lerp(new THREE.Color(color), Math.min(1, k * 1.6));
  });
  g.translate(0, h / 2, 0);
  return g;
}

/** A stone colour from the palette with an own brightness. */
const stoneCol = (pal, rng) => {
  const c = tone(pal[Math.floor(rng() * pal.length)], 0.8 + rng() * 0.45);
  // now and then a weathered pale or a rust-warm block
  const u = rng();
  return u < 0.1 ? tone(c, 1.3) : u < 0.18 ? '#' + _c.set(c).lerp(new THREE.Color('#8a5a44'), 0.35).getHexString() : c;
};

/**
 * Courses of blocks along x from -len/2 to len/2 (local section frame: x along
 * the wall, z across it), joints offset course to course.
 */
function courses(out, len, rows, rng, pal, place3) {
  let y = 0;
  rows.forEach((row, k) => {
    let x = -len / 2 + (k % 2 ? row.minW * 0.5 : 0);
    if (k % 2) {   // a half block starts every other course so joints never line up
      const w0 = row.minW * 0.5 - 0.03;
      out.push(place3(block(w0, row.h, row.d, stoneCol(pal, rng), rng.int(1, 9999)), -len / 2 + w0 / 2, y, row.dz || 0));
    }
    while (x < len / 2 - 0.05) {
      let w = row.minW + rng() * (row.maxW - row.minW);
      if (len / 2 - (x + w) < row.minW * 0.6) w = len / 2 - x;      // last block fills the course
      const bw = w - 0.035;
      const sink = rng() * 0.02;
      out.push(place3(block(bw, row.h - 0.03, row.d - rng() * 0.05, stoneCol(pal, rng), rng.int(1, 9999)), x + w / 2, y - sink, (row.dz || 0) + (rng() - 0.5) * 0.04));
      x += w;
    }
    y += row.h;
  });
  return y;
}

/** A square pillar of stacked blocks with a cap, centred at the origin. */
function pillar(out, size, height, rng, pal, at) {
  let y = -0.3;
  const n = Math.max(3, Math.round((height + 0.3) / 0.55));
  const ch = (height + 0.3) / n;
  for (let i = 0; i < n; i++) {
    const s = size * (i === 0 ? 1.08 : 1) - (i % 2) * 0.04;
    out.push(at(block(s, ch - 0.03, s, stoneCol(pal, rng), rng.int(1, 9999)), 0, y, 0, (rng() - 0.5) * 0.08));
    y += ch;
  }
  out.push(at(block(size + 0.12, 0.18, size + 0.12, tone(pal[0], 1.1), rng.int(1, 9999)), 0, y, 0, 0));
  out.push(at(block(size * 0.62, 0.22, size * 0.62, tone(pal[1 % pal.length], 1.05), rng.int(1, 9999)), 0, y + 0.18, 0, 0.785));
  return y + 0.4;
}

/**
 * The fort's masonry wall (volcanic style): one straight section per palisade
 * segment, pillars at the bends, two gate towers. Returns geometries in the plot frame.
 * @param {string[]} pal stone colours
 */
export function stoneWall(pal) {
  const out = [];
  const rng = makeRng(0x5701e);
  const segs = palisadeSegments();
  const step = TAU / SEGMENTS;
  const has = (a) => segs.some((s) => Math.abs(Math.atan2(Math.sin(s.a - a), Math.cos(s.a - a))) < step * 0.25);
  for (const sgm of segs) {
    // section frame: local x along the wall (tangent), z across it (outward = +z)
    const at = (g, x, y, z, ry = 0) => {
      const ca = Math.cos(sgm.a), sa = Math.sin(sgm.a);
      // tangent (cos a, -sin a), outward normal (sin a, cos a)
      return place(g, [sgm.lx + x * ca + z * sa, y, sgm.lz - x * sa + z * ca], [0, sgm.a + ry, 0]);
    };
    const len = SEG_LEN - 0.9;             // leave room for the pillars at both ends
    const rows = [
      { h: 0.5, d: 0.8, minW: 0.8, maxW: 1.3 },                        // plinth, partly sunk
      { h: 0.42, d: 0.66, minW: 0.55, maxW: 1.05 },
      { h: 0.36, d: 0.64, minW: 0.45, maxW: 0.95 },
      { h: 0.4, d: 0.64, minW: 0.5, maxW: 1.0 },
      { h: 0.34, d: 0.62, minW: 0.4, maxW: 0.85 },
    ];
    const plinthY = -0.3;
    const top = courses(out, len, rows, rng, pal, (g, x, y, z) => at(g, x, y + plinthY, z)) + plinthY;
    // coping and merlons
    out.push(at(block(len + 0.1, 0.14, 0.74, tone(pal[0], 1.08), rng.int(1, 9999)), 0, top, 0));
    const nm = Math.max(2, Math.floor(len / 0.95));
    for (let i = 0; i < nm; i++) {
      if (i % 2) continue;
      const x = -len / 2 + (i + 0.5) * (len / nm);
      out.push(at(block(len / nm - 0.08, 0.5 + rng() * 0.08, 0.5, stoneCol(pal, rng), rng.int(1, 9999)), x, top + 0.14, 0.04));
    }
    // a pillar where this section meets the next one
    const aNext = sgm.a + step;
    if (has(aNext)) {
      const pa = sgm.a + step / 2;
      const px = Math.sin(pa) * PALISADE_R, pz = Math.cos(pa) * PALISADE_R;
      pillar(out, 0.76, top + 0.25, rng, pal, (g, x, y, z, ry) => place(g, [px + x, y, pz + z], [0, pa + ry, 0]));
    }
  }
  // gate towers: wide pillars flanking the opening, a lintel-less gate
  for (const s of [-1, 1]) {
    const a = Math.PI + s * 0.36;
    const px = Math.sin(a) * PALISADE_R, pz = Math.cos(a) * PALISADE_R;
    pillar(out, 1.3, 3.6, rng, pal, (g, x, y, z, ry) => place(g, [px + x, y, pz + z], [0, a + ry, 0]));
  }
  return out;
}

// ------------------------------------------------------------------ floor

const FLOOR = {
  jungle: { stone: ['#8f8577', '#857b6f', '#9a8e7c', '#7d756c', '#948a7a', '#8a8a80'], deck: COL.plank, beam: COL.log[3], rock: ['#9c93a8', '#8a8199', '#a79c9a'] },
  volcano: { stone: ['#857b80', '#776e74', '#8e8488', '#6f676d', '#7d7378'], deck: ['#6b5240', '#5e4636', '#735944', '#634a39'], beam: '#4f3a2b', rock: ['#5a5058', '#4b4452', '#625761'] },
  // swamp: wet mossy flags, dark planks
  swamp: { stone: ['#6f6b60', '#646156', '#77725f', '#5d5a50', '#6a6b5a'], deck: ['#5a4a3a', '#4f4033', '#615040', '#47392d'], beam: '#47392d', rock: ['#6c6a64', '#5e5c58', '#77716a'] },
};

/** Distance from p to the segment a-b (2D). */
function segDist(px, pz, [ax, az], [bx, bz]) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

const inBoxes = (boxes, x, z, pad = 0) => boxes.some(([bx, bz, hx, hz]) => Math.abs(x - bx) < hx + pad && Math.abs(z - bz) < hz + pad);

/**
 * Laid flagstones in a local frame: an irregular tiling (a grid with jittered
 * shared corners, each cell shrunk for the joint) clipped to a yard around the
 * fire and to paths. `yardGaps` / `pathGaps` (0..1) leave slabs out so earth and
 * grass show between them – a full pavement at 0, loose stepping stones near 0.5.
 * Every slab is tagged userData.stone (callers give it the stone detail material).
 * @param {{ fire: number[], yardR: number, fireClear?: number, paths: number[][][], pathW: number,
 *   clear: number[][], ground: (x:number, z:number)=>number, palette: string[], seed: number,
 *   bound?: number, yardGaps?: number, pathGaps?: number }} o
 */
export function flagstones(o) {
  const out = [];
  const { fire, yardR, paths, pathW, clear, ground, palette, seed } = o;
  const fireClear = o.fireClear ?? 1.25, bound = o.bound ?? Infinity;
  const yardGaps = o.yardGaps ?? 0, pathGaps = o.pathGaps ?? 0;
  const rng = makeRng(seed);
  const cell = 0.78;
  const corner = (i, j) => [
    i * cell + (hash2(i, j, seed + 71) - 0.5) * cell * 0.42,
    j * cell + (hash2(i, j, seed + 73) - 0.5) * cell * 0.42,
  ];
  let reach = yardR + Math.hypot(fire[0], fire[1]);
  for (const [a, b] of paths) reach = Math.max(reach, Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1]));
  const span = Math.ceil(reach / cell) + 2;
  for (let j = -span; j < span; j++) {
    for (let i = -span; i < span; i++) {
      const pts = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      // inside the yard or on a path, with a ragged edge
      const edgeN = (hash2(i, j, seed + 77) - 0.5) * 0.45;
      const fd = Math.hypot(cx - fire[0], cz - fire[1]);
      const inYard = fd < yardR + edgeN;
      let pathD = Infinity;
      for (const [a, b] of paths) pathD = Math.min(pathD, segDist(cx, cz, a, b));
      const onPath = pathD < pathW / 2 + edgeN * 0.6;
      if (!inYard && !onPath) continue;
      if (fd < fireClear || Math.hypot(cx, cz) > bound) continue;
      if (inBoxes(clear, cx, cz)) continue;
      // gaps: more toward the outer edge of the yard and the sides of a path
      const gapHash = hash2(i, j, seed + 79);
      if (inYard) {
        const edge = Math.max(0, (fd - yardR * 0.45) / (yardR * 0.55));
        if (gapHash < yardGaps * (0.35 + edge)) continue;
      } else if (gapHash < pathGaps + (pathD > pathW / 2 - 0.4 ? 0.25 : 0)) continue;
      const shape = new THREE.Shape();
      const shrink = inYard ? 0.93 : 0.86;
      pts.forEach(([x, z], k) => {
        const sx = cx + (x - cx) * shrink, sz = cz + (z - cz) * shrink;
        if (k === 0) shape.moveTo(sx, -sz); else shape.lineTo(sx, -sz);
      });
      shape.closePath();
      const depth = 0.07 + rng() * 0.03;
      let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.025, bevelSegments: 1, steps: 1 });
      g.rotateX(-Math.PI / 2);                        // shape (x, -z) -> ground plane, extrusion up
      g.deleteAttribute('uv');
      const col = tone(palette[Math.floor(rng() * palette.length)], 0.86 + rng() * 0.28);
      const side = tone(col, 0.72);
      g = paint(g, (c, n) => (n.y > 0.5 ? col : side));
      const y = ground(cx, cz) - depth * 0.55 + (rng() - 0.5) * 0.02;
      const slab = place(g, [0, y, 0], [(rng() - 0.5) * 0.035, 0, (rng() - 0.5) * 0.035]);
      slab.userData.stone = true;
      out.push(slab);
    }
  }
  return out;
}

/** Smooth stone (round, or flat with a low `squash`) with a lighter top and a dark foot. */
function pebble(r, squash, seed, pal) {
  let g = new THREE.IcosahedronGeometry(r, 1);
  g = deform(g, (v) => {
    const b = Math.sin((v.x / r) * 2.3 + seed) * Math.cos((v.z / r) * 1.9 - seed) * 0.16 + jitter(v, 0.05 * r, seed);
    v.multiplyScalar(1 + b);
    v.y *= squash;
    if (v.y < -r * 0.1) v.y = -r * 0.1 - (v.y + r * 0.1) * 0.2;
  });
  g = smoothNormals(g, Math.PI / 2.5);
  const top = tone(pal[1 % pal.length], 1.15), foot = tone(pal[2 % pal.length], 0.7);
  return paint(g, (c, n) => (n.y > 0.55 ? top : c.y < 0 ? foot : pal[0]));
}

/**
 * Loose camp clutter in a local frame, kept off paths and props: a few stones
 * of different shapes (round, flat, split), often two or three together,
 * fallen sticks and a stack of split firewood. Stones are tagged userData.stone.
 * @param {{ fire: number[], radius: number, paths: number[][][], pathW: number, clear: number[][],
 *   ground: (x:number, z:number)=>number, palette: { rock: string[], beam: string }, seed: number,
 *   stones?: number, sticks?: number, bound?: number }} o
 */
export function campClutter(o) {
  const out = [];
  const { fire, radius, paths, pathW, clear, ground, palette, seed } = o;
  const rng = makeRng(seed);
  const free = (x, z, r) => {
    if (Math.hypot(x - fire[0], z - fire[1]) < 2.4 + r) return false;
    if (Math.hypot(x, z) > (o.bound ?? Infinity)) return false;
    if (inBoxes(clear, x, z, r + 0.3)) return false;
    for (const [a, b] of paths) if (segDist(x, z, a, b) < pathW / 2 + r + 0.2) return false;
    return true;
  };
  const spot = (r) => {
    for (let t = 0; t < 30; t++) {
      const a = rng() * TAU, d = 2.6 + Math.sqrt(rng()) * (radius - 2.6);
      const x = fire[0] + Math.cos(a) * d, z = fire[1] + Math.sin(a) * d;
      if (free(x, z, r)) return [x, z];
    }
    return null;
  };
  const nStones = o.stones ?? 9;
  for (let k = 0; k < nStones; k++) {
    const r = 0.1 + rng() * rng() * 0.32;
    const at = spot(r);
    if (!at) continue;
    const count = rng() < 0.45 ? 2 + Math.floor(rng() * 2) : 1;
    for (let m = 0; m < count; m++) {
      const rr = m ? r * (0.45 + rng() * 0.4) : r;
      const x = at[0] + (m ? (rng() - 0.5) * r * 3.2 : 0), z = at[1] + (m ? (rng() - 0.5) * r * 3.2 : 0);
      const kind = Math.floor(rng() * 3);
      const pal = palette.rock.map((c) => tone(c, 0.85 + rng() * 0.3));
      let g;
      if (kind === 2) {
        // split stone: a chunky block with knocked-off corners, half sunk
        g = block(rr * 2.2, rr * 1.1, rr * 1.6, pal[0], rng.int(1, 9999));
        g.translate(0, -rr * 0.3, 0);
      } else {
        g = pebble(rr, kind === 1 ? 0.35 : 0.7, rng.int(1, 9999), pal);
      }
      const placed = place(g, [x, ground(x, z), z], [(rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3], [1 + rng() * 0.4, 1, 1 + rng() * 0.3]);
      placed.userData.stone = true;
      out.push(placed);
    }
  }
  // fallen sticks
  for (let k = 0; k < (o.sticks ?? 6); k++) {
    const at = spot(0.5);
    if (!at) continue;
    const len = 0.6 + rng() * 0.9;
    out.push(log(len, 0.025 + rng() * 0.025, [at[0], ground(at[0], at[1]) + 0.03, at[1]], 'x', { body: tone(palette.beam, 0.8 + rng() * 0.4), seed: rng.int(1, 999), rot: [0, rng() * TAU, 0], radial: 5 }));
  }
  // split firewood stacked near the fire
  const wood = spot(0.8);
  if (wood) {
    const rot = rng() * TAU;
    const y0 = ground(wood[0], wood[1]);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++) {
        const off = (k - (3 - row) / 2) * 0.17;
        const x = wood[0] + Math.cos(rot) * off, z = wood[1] - Math.sin(rot) * off;
        out.push(log(0.75, 0.08, [x, y0 + 0.08 + row * 0.14, z], 'z', { body: tone(palette.beam, 0.9 + rng() * 0.3), seed: rng.int(1, 999), rot: [0, rot, 0], radial: 6 }));
      }
    }
  }
  return out;
}

/** Areas the base floor keeps clear of (props, buildings), as [x, z, halfX, halfZ] boxes in the plot frame. */
function keepClear(stage) {
  const b = (key, hx, hz) => [BASE_LOCAL[key][0], BASE_LOCAL[key][1], hx, hz];
  const out = [b('workbench', 1.6, 0.9), b('dropOff', 1.3, 1.0), b('flag', 0.5, 0.5)];
  if (stage === 1) out.push([BASE_LOCAL.tent[0], BASE_LOCAL.tent[1] + 0.5, 2.7, 2.5]);
  if (stage >= 2) {
    out.push([BASE_LOCAL.cabin[0], BASE_LOCAL.cabin[1] + CABIN.CZ, CABIN.HX + 0.5, CABIN.HZ + 0.4]);
    out.push(b('wardrobe', 0.75, 0.5), b('board', 0.8, 0.8));
  }
  if (stage >= 3) out.push(b('watchtower', 1.9, 1.9), b('trophies', 1.6, 0.6));
  return out;
}

/**
 * Flagstone yard, paths, porch and camp clutter for a base stage (1..3): the
 * camp loosely laid with earth between the slabs, the lodge closer, the fort
 * fully paved.
 * @param {'jungle'|'volcano'|'swamp'} biome
 * @param {number} stage
 * @param {(lx:number, lz:number)=>number} ground ground height in the plot frame
 * @returns {THREE.BufferGeometry[]}
 */
export function baseFloor(biome, stage, ground) {
  if (stage < 1) return [];
  const F = FLOOR[biome] || FLOOR.jungle;
  const rng = makeRng(0xf100 + stage);
  const fire = BASE_LOCAL.fire;
  const door = [BASE_LOCAL.cabin[0] + 0.7, BASE_LOCAL.cabin[1] + CABIN.CZ - CABIN.HZ - 0.9];
  const gate = [0, -PALISADE_R + 0.6];
  const front = stage >= 3 ? gate : [0, -12];
  const paths = [[front, fire]];
  if (stage === 1) paths.push([fire, [BASE_LOCAL.tent[0], BASE_LOCAL.tent[1] - 2.6]]);
  if (stage >= 2) {
    paths.push([fire, door], [fire, [-6.2, 0.6]], [fire, [5.6, 0.4]]);
    // out to the front tower spots (the back ones from stage 3)
    for (const [x, z] of TOWER_SLOTS.slice(0, 2)) paths.push([fire, [x * 0.86, z * 0.86]]);
  }
  if (stage >= 3) {
    for (const [x, z] of TOWER_SLOTS.slice(2)) paths.push([[x * 0.55, 3.2], [x * 0.86, z * 0.8]]);
    paths.push([[-6.2, 0.6], [TOWER_SLOTS[2][0] * 0.55, 3.2]], [[5.6, 0.4], [TOWER_SLOTS[3][0] * 0.55, 3.2]]);
    paths.push([door, [7.4, 5.2]], [[7.4, 5.2], [BASE_LOCAL.watchtower[0] - 0.4, BASE_LOCAL.watchtower[1] - 2.2]], [fire, [BASE_LOCAL.trophies[0], BASE_LOCAL.trophies[1] - 1]]);
  }
  const pathW = stage >= 3 ? 1.9 : 1.6;
  const common = { fire, paths, pathW, clear: keepClear(stage), ground, bound: PALISADE_R - 0.9 };
  const out = flagstones({
    ...common, yardR: [0, 2.9, 4.6, 6.6][stage], palette: F.stone, seed: 0xf100 + stage,
    yardGaps: [0, 0.5, 0.25, 0.08][stage], pathGaps: [0, 0.45, 0.2, 0.05][stage],
  });
  out.push(...campClutter({ ...common, radius: 12, palette: F, seed: 0xc1 + stage, stones: [0, 10, 8, 6][stage], sticks: [0, 7, 5, 3][stage] }));

  // plank porch before the cabin door (lodge and fort)
  if (stage >= 2) {
    const cz = BASE_LOCAL.cabin[1] + CABIN.CZ - CABIN.HZ - 0.75;
    const cx = BASE_LOCAL.cabin[0];
    const w = CABIN.HX * 2 - 0.4, d = 1.25;
    const y0 = ground(cx, cz);
    for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) out.push(log(d + 0.1, 0.08, [cx + x, y0 + 0.05, cz], 'z', { body: F.beam, seed: 400 + x, ends: [false, true] }));
    const boards = 5;
    for (let k = 0; k < boards; k++) {
      const z = cz - d / 2 + (k + 0.5) * (d / boards);
      out.push(plank(w, 0.05, d / boards - 0.03, F.deck[k % F.deck.length], [cx, y0 + 0.16, z], [0, (rng() - 0.5) * 0.004, 0], 410 + k));
    }
    // front step
    out.push(plank(1.6, 0.06, 0.34, F.deck[1], [door[0], y0 + 0.07, cz - d / 2 - 0.2], [0, 0, 0], 420));
  }
  return out;
}

/**
 * Ground of the hunting hut camp (island 1) and the landing camp (later
 * islands) in the hut frame (origin = cabin, door toward -z): a loosely laid
 * ring of flagstones round the campfire, stepping stones to the cabin door,
 * the workbench, the drop-off crate, the mission board and down to the beach,
 * and a little clutter. `at` holds local [x, z] points; door, board and
 * wardrobe are null at the landing camp.
 * @param {{ fire: number[], door: number[]|null, bench: number[], drop: number[], board: number[]|null, wardrobe: number[]|null, flag: number[] }} at
 * @param {'jungle'|'volcano'|'swamp'} biome
 * @param {(lx:number, lz:number)=>number} ground ground height in the hut frame
 */
export function hutFloor(at, biome, ground) {
  const F = FLOOR[biome] || FLOOR.jungle;
  const { fire } = at;
  const paths = [[fire, [at.bench[0] + 1.4, at.bench[1] - 0.9]], [fire, [at.drop[0] - 1.2, at.drop[1] - 0.9]]];
  if (at.door) paths.push([fire, at.door]);
  if (at.board) paths.push([fire, [at.board[0] - 0.9, at.board[1] + 0.6]]);
  paths.push([fire, [fire[0] - 13, fire[1] + 1.5]]);              // toward the beach (west)
  const clear = [
    [at.bench[0], at.bench[1], 1.6, 0.9], [at.drop[0], at.drop[1], 1.3, 1.0], [at.flag[0], at.flag[1], 0.5, 0.5],
  ];
  if (at.door) clear.push([0, CABIN.CZ, CABIN.HX + 0.5, CABIN.HZ + 0.4]);
  if (at.board) clear.push([at.board[0], at.board[1], 0.8, 0.8]);
  if (at.wardrobe) clear.push([at.wardrobe[0], at.wardrobe[1], 0.75, 0.5]);
  const common = { fire, paths, pathW: 1.4, clear, ground };
  return [
    ...flagstones({ ...common, yardR: 3.6, palette: F.stone, seed: 0x4a7, yardGaps: 0.22, pathGaps: 0.3 }),
    ...campClutter({ ...common, radius: 12, palette: F, seed: 0x4b1, stones: 11, sticks: 8 }),
  ];
}
