// The boat on the east beach (see shared/boatShape.js for size + colliders).
// Broken: hull stranded and rolled onto the sand with a jagged hole in the
// starboard side, snapped mast (top half lying in the sand), torn sail rags,
// scattered planks, rope and a crate. Repaired: hull upright on chocks with a
// patch of fresh planks, mast with a billowing sail and a little pennant.
//
// API: buildBoat(b) -> { group, setRepaired(bool), setParts(kinds[]), update(dt, time) }
//   b = { x, z, y, rot }; group sits at (x, y, z), rotation.y = rot, bow = local +x.
//   setParts shows small relic models in the 3 deck sockets (BOAT.sockets).

import * as THREE from 'three';
import { MAT, deform, paint, place, part, merge, blob, limb, spike, tube, mesh, jitter } from '../kit.js';
import { makeRng } from '../../../shared/rng.js';
import { BOAT } from '../../../shared/boatShape.js';
import { COL, tone, plank, crate, barrel } from '../../world/hut/pieces.js';
import { TAU, smoothstep, orient, doubleSided, gridNormals, noise3 } from './common.js';
import { relicModel } from './relics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const L = BOAT.length, HW = BOAT.width / 2;

// ------------------------------------------------------------ hull shape
// u: 0 stern .. 1 bow; v: 0 port gunwale .. 0.5 keel .. 1 starboard gunwale.
const halfW = (u) => HW * Math.pow(Math.max(0, Math.sin(Math.PI * (0.22 + 0.78 * u))), 0.55);
const gunY = (u) => BOAT.gunwale + 0.5 * u * u * u + 0.2 * (1 - u) * (1 - u) * (1 - u);
const keelY = (u) => 0.02 + 1.15 * Math.pow(smoothstep(0.7, 1.0, u), 1.5) + 0.5 * smoothstep(0.14, 0.0, u);

/** Hull point; inner shells shrink by `inset`. */
function hullPoint(u, v, inset = 0, out = new THREE.Vector3()) {
  const a = v * Math.PI;
  const ca = Math.cos(a), sa = Math.sin(a);
  const W = Math.max(0, halfW(u) - inset);
  const g = gunY(u), k = keelY(u) + inset * 1.2;
  out.set(
    -L / 2 + u * L,
    g - (g - k) * Math.pow(Math.abs(sa), 0.55),
    -W * Math.sign(ca) * Math.pow(Math.abs(ca), 0.75),
  );
  return out;
}

/** Jagged hole on the starboard side (u, v in hull coords). */
const HOLE = { u: 0.5, v: 0.74, ru: 0.1, rv: 0.12 };
function inHole(u, v) {
  const du = (u - HOLE.u) / HOLE.ru, dv = (v - HOLE.v) / HOLE.rv;
  const a = Math.atan2(dv, du);
  const edge = 1 + 0.28 * Math.sin(a * 5 + 1.3) + 0.14 * Math.sin(a * 11);
  return du * du + dv * dv < edge * edge;
}

const STRAKES = 7;               // planks per side
const NU = 36, NV = STRAKES * 4; // grid
const HULL_COL = {
  wood: ['#a8723f', '#9b6636', '#b07a45', '#94602f'],
  seam: '#5a3a22',
  stripe: '#2f8f9a',
  bottom: '#a8452f',
  inner: '#6e4a2c',
};

/** Outer (+ inner) hull shell as one geometry; hole=true leaves the jagged hole open. */
function hullGeometry(hole) {
  const pos = [], col = [];
  const c = new THREE.Color();
  const P = (u, v, inset) => hullPoint(u, v, inset);
  const outerCol = (u, v) => {
    const side = v < 0.5 ? v : 1 - v;                  // 0 at gunwale .. 0.5 keel
    const s = side * 2 * STRAKES;                      // strake coordinate
    const f = s - Math.floor(s);
    if (s < 0.6) return c.set(HULL_COL.stripe);
    if (s > STRAKES * 0.62) c.set(HULL_COL.bottom);
    else c.set(HULL_COL.wood[Math.floor(s) % 4]);
    if (f < 0.13) c.lerp(new THREE.Color(HULL_COL.seam), 0.55);
    const n = noise3(u * 30, v * 8, 1, 3);
    return c.multiplyScalar(0.94 + 0.08 * n);
  };
  const tri = (a, b, d, ca, cb, cd) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cd.r, cd.g, cd.b);
  };
  for (const inner of [false, true]) {
    const inset = inner ? 0.1 : 0;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV, v1 = (j + 1) / NV;
        if (hole && inHole((u0 + u1) / 2, (v0 + v1) / 2)) continue;
        const a = P(u0, v0, inset), b = P(u1, v0, inset), d = P(u0, v1, inset), e = P(u1, v1, inset);
        const cols = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]].map(([u, v]) => (inner ? c.set(HULL_COL.inner).multiplyScalar(0.9 + 0.1 * Math.sin(v * 60)) : outerCol(u, v)).clone());
        // outward faces for the outer shell, inward for the inner one
        if (inner) { tri(a, d, b, cols[0], cols[2], cols[1]); tri(b, d, e, cols[1], cols[2], cols[3]); }
        else { tri(a, b, d, cols[0], cols[1], cols[2]); tri(b, e, d, cols[1], cols[3], cols[2]); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const parts = [g];
  // transom board (flat stern, a real hard edge)
  const ring = [];
  for (let j = 0; j <= NV; j++) ring.push(hullPoint(0, j / NV, 0));
  const tp = [], tc = [];
  const center = V(-L / 2, (gunY(0) + keelY(0)) / 2 + 0.2, 0);
  c.set(COL.plank[2]);
  for (let j = 0; j < NV; j++) {
    const a = ring[j], b = ring[j + 1];
    tp.push(center.x - 0.01, center.y, center.z, b.x - 0.01, b.y, b.z, a.x - 0.01, a.y, a.z);
    for (let k = 0; k < 3; k++) tc.push(c.r, c.g, c.b);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  tg.computeVertexNormals();
  parts.push(tg);
  // gunwale rails + stem post
  for (const s of [0, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(hullPoint(Math.min(0.995, i / 6), s, -0.04).add(V(0, 0.03, 0)));
    parts.push(tube(pts, () => 0.075, { radial: 8, color: () => '#7a4d2c' }));
  }
  const stem = [];
  for (let i = 0; i <= 6; i++) { const u = 0.8 + i * 0.0333; stem.push(V(-L / 2 + Math.min(1, u) * L + 0.03, keelY(Math.min(1, u)) - 0.02 + (i === 6 ? 0.1 : 0), 0)); }
  stem.push(V(L / 2 + 0.06, gunY(1) + 0.2, 0));
  parts.push(tube(stem, () => 0.1, { radial: 8, color: () => '#6d4428' }));
  // keel runner
  parts.push(tube([V(-L / 2 + 0.05, keelY(0) - 0.04, 0), V(-2, -0.04, 0), V(2, -0.02, 0), V(3.6, 0.3, 0)], () => 0.09, { radial: 8, color: () => '#5e3c24' }));
  if (hole) parts.push(...splinters());
  return merge(parts);
}

/** Broken plank ends sticking into the hole. */
function splinters() {
  const out = [];
  const rng = makeRng(77);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + rng() * 0.2;
    // walk from the hole center outward until we leave the hole
    let r = 0.3;
    while (r < 2 && inHole(HOLE.u + Math.cos(a) * HOLE.ru * r, HOLE.v + Math.sin(a) * HOLE.rv * r)) r += 0.05;
    const u = HOLE.u + Math.cos(a) * HOLE.ru * r, v = HOLE.v + Math.sin(a) * HOLE.rv * r;
    const p = hullPoint(u, v, 0.05);
    const c = hullPoint(HOLE.u, HOLE.v, 0.05);
    const dir = c.clone().sub(p).normalize();
    dir.x += (rng() - 0.5) * 0.4; dir.y += (rng() - 0.5) * 0.4; dir.z += 0.25;
    const len = 0.18 + rng() * 0.3;
    const g = spike(0.06, len, rng() < 0.5 ? '#c79a62' : '#a8723f', '#e2c08a', 3);
    out.push(orient(g, [p.x, p.y, p.z], [dir.x, dir.y, dir.z], [1, 1, 0.35], rng() * TAU));
  }
  return out;
}

/** Inner half-width of the hull at height y for station u (0 when below the keel). */
function deckHalfWidth(u, y) {
  let best = 0;
  for (let j = 0; j <= 40; j++) {
    const p = hullPoint(u, 0.5 + j / 80, 0.1);
    if (p.y >= y) { best = Math.abs(p.z); break; }
  }
  return keelY(u) + 0.12 > y ? 0 : best;
}

function deckGeometry(broken) {
  const rng = makeRng(broken ? 31 : 32);
  const parts = [];
  const y = BOAT.deckY, pw = 0.22;
  for (let z = -HW + pw / 2; z < HW; z += pw + 0.012) {
    let a = null, b = null;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      if (deckHalfWidth(u, y) > Math.abs(z) + pw * 0.5) { if (a === null) a = u; b = u; }
    }
    if (a === null) continue;
    const x0 = -L / 2 + a * L + 0.05, x1 = -L / 2 + b * L - 0.05;
    if (broken && rng() < 0.22) {
      // a missing / lifted plank
      if (rng() < 0.5) continue;
      parts.push(plank(x1 - x0 - 1.2, 0.05, pw, rng.pick(COL.plank), [(x0 + x1) / 2 + 0.6, y + 0.12, z], [0.08, 0, 0.12], rng.int(1, 999)));
      continue;
    }
    parts.push(plank(x1 - x0, 0.05, pw, rng.pick(COL.plank), [(x0 + x1) / 2, y, z], [0, 0, 0], rng.int(1, 999)));
  }
  // thwarts (bench planks)
  for (const x of [-1.2, 2.4]) {
    const u = (x + L / 2) / L;
    const w = deckHalfWidth(u, y + 0.45) * 2;
    if (w > 0.4) parts.push(plank(0.3, 0.07, w, COL.plank[2], [x, y + 0.45, 0], [0, 0, 0], 5));
  }
  return merge(parts);
}

/** Fresh plank patch over the hole (repaired state). */
function patchGeometry() {
  const parts = [];
  const rng = makeRng(9);
  const bands = 4;
  for (let b = 0; b < bands; b++) {
    const v0 = HOLE.v - HOLE.rv * 1.4 + (b / bands) * HOLE.rv * 2.8;
    const v1 = v0 + (HOLE.rv * 2.8) / bands - 0.006;
    const u0 = HOLE.u - HOLE.ru * 1.45 + (rng() - 0.5) * 0.02, u1 = HOLE.u + HOLE.ru * 1.45 + (rng() - 0.5) * 0.02;
    const nu = 8, nv = 2;
    const pos = [];
    const P = (i, j) => hullPoint(u0 + (u1 - u0) * (i / nu), v0 + (v1 - v0) * (j / nv), -0.04);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = P(i, j), bb = P(i + 1, j), d = P(i, j + 1), e = P(i + 1, j + 1);
      pos.push(a.x, a.y, a.z, d.x, d.y, d.z, bb.x, bb.y, bb.z, bb.x, bb.y, bb.z, d.x, d.y, d.z, e.x, e.y, e.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(paint(g, b % 2 ? '#e6bb82' : '#dcae72'));
    // nails at both ends
    for (const u of [u0 + 0.008, u1 - 0.008]) {
      const p = hullPoint(u, (v0 + v1) / 2, -0.055);
      parts.push(place(blob(0.022, 0.022, 0.022, COL.metal, { w: 8, h: 6 }), [p.x, p.y, p.z]));
    }
  }
  return merge(parts);
}

// ---------------------------------------------------------------- cloth
/** Animated cloth: indexed grid whose vertices are rewritten per frame. */
function cloth(w, h, cols, rows, colorFn) {
  const geo = new THREE.PlaneGeometry(w, h, cols, rows);
  geo.deleteAttribute('uv');
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.set(colorFn(p.getX(i) / w + 0.5, p.getY(i) / h + 0.5));
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const base = new Float32Array(p.array);
  const m = mesh(geo, doubleSided(MAT.standard));
  return { mesh: m, geo, base, cols, rows };
}

function sail() {
  const W = 3.4, H = 3.9;
  const s = cloth(W, H, 10, 12, (u, v) => {
    if (Math.abs(v - 0.3) < 0.045) return '#c84a3a';                     // red band
    if (u > 0.62 && u < 0.84 && v > 0.52 && v < 0.72) return '#dcc594';  // patch
    if (u > 0.14 && u < 0.3 && v > 0.12 && v < 0.24) return '#c9dcec';   // patch
    return Math.floor(u * 5) % 2 ? '#f6eedb' : '#ede2c6';
  });
  s.geo.rotateY(Math.PI / 2);          // plane across the boat (y-z), billows toward +x
  s.base.set(s.geo.attributes.position.array);
  s.update = (time) => {
    const a = s.geo.attributes.position.array, b = s.base;
    const gust = 0.85 + 0.15 * Math.sin(time * 0.7);
    for (let i = 0; i < a.length; i += 3) {
      const z = b[i + 2], y = b[i + 1];
      const u = z / W + 0.5, v = y / H + 0.5;
      const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1));
      a[i] = b[i] + belly * 0.75 * gust + Math.sin(time * 3.1 + u * 5 + v * 3) * 0.03 * belly;
      a[i + 1] = y;
      a[i + 2] = z * (1 - 0.06 * belly);
    }
    s.geo.attributes.position.needsUpdate = true;
    gridNormals(s.geo.attributes.position, s.geo.attributes.normal, s.cols, s.rows);
  };
  s.update(0);
  s.geo.computeBoundingSphere();
  return s;
}

function pennant() {
  const Lp = 1.2, Hp = 0.4;
  const s = cloth(Lp, Hp, 8, 2, (u) => (u < 0.5 ? '#24345a' : '#f4f1e8'));
  const p = s.geo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {       // taper into a triangle, pole at x=0
    const u = p[i] / Lp + 0.5;
    p[i] = u * Lp;
    p[i + 1] *= 1 - u * 0.92;
  }
  s.base.set(p);
  s.update = (time) => {
    const a = s.geo.attributes.position.array, b = s.base;
    for (let i = 0; i < a.length; i += 3) {
      const u = b[i] / Lp;
      a[i] = b[i];
      a[i + 1] = b[i + 1] - 0.05 * u * u;
      a[i + 2] = Math.sin(b[i] * 5 - time * 7) * 0.12 * u;
    }
    s.geo.attributes.position.needsUpdate = true;
    gridNormals(s.geo.attributes.position, s.geo.attributes.normal, s.cols, s.rows);
  };
  s.update(0);
  s.geo.computeBoundingSphere();
  return s;
}

/** Static torn cloth rag (jagged lower edge), hanging from its top edge. */
function ragGeometry(w, h, seed) {
  let g = new THREE.PlaneGeometry(w, h, 6, 6);
  g = deform(g, (v) => {
    const t = 0.5 - v.y / h;                    // 0 top .. 1 bottom
    v.y -= t * t * 0.1;
    v.z += Math.sin(v.x * 6 + seed) * 0.08 * t + t * 0.12;
    if (t > 0.55) v.y += (Math.sin(v.x * 23 + seed * 3) * 0.5 + 0.5) * h * 0.35 * (t - 0.55);
  });
  g.translate(0, -h / 2, 0);
  return paint(g, (c) => (jitter(c, 1, seed) > 0.6 ? '#ddd0b0' : '#efe4c8'));
}

// ---------------------------------------------------------------- props
function mastGeometry(full) {
  const parts = [];
  const x = BOAT.mastX, y0 = BOAT.deckY - 0.3;
  const top = full ? BOAT.mastH : 2.4;
  const woodCol = (t, a, p) => (noise3(p.x * 3, p.y * 3, p.z * 8, 5) > 0.3 ? '#8a5a34' : '#9b6a3e');
  parts.push(tube([V(x, y0, 0), V(x, (y0 + top) / 2, 0), V(x, top, 0)], (t) => 0.13 - 0.04 * t, { radial: 9, color: woodCol, capEnd: full }));
  parts.push(place(new THREE.TorusGeometry(0.16, 0.035, 8, 24), [x, BOAT.deckY + 0.08, 0], [Math.PI / 2, 0, 0]));
  parts[parts.length - 1] = paint(parts[parts.length - 1], COL.rope);
  if (full) {
    // yard + boom
    parts.push(tube([V(x + 0.14, 6.6, -1.9), V(x + 0.14, 6.66, 0), V(x + 0.14, 6.6, 1.9)], () => 0.06, { radial: 7, color: () => '#80522f' }));
    parts.push(tube([V(x + 0.18, 2.72, -1.8), V(x + 0.18, 2.72, 1.8)], () => 0.055, { radial: 7, color: () => '#80522f' }));
    parts.push(place(blob(0.12, 0.1, 0.12, '#6d4428', { w: 12, h: 8 }), [x, top + 0.05, 0]));
    // stays to bow and stern + shrouds to the sides
    const rope = (a, b) => parts.push(tube([a, a.clone().lerp(b, 0.5).add(V(0, -0.05, 0)), b], () => 0.018, { radial: 5, color: () => '#b89a66', capStart: false, capEnd: false }));
    rope(V(x, top - 0.3, 0), V(L / 2 + 0.05, gunY(1) + 0.15, 0));
    rope(V(x, top - 0.3, 0), V(-L / 2 + 0.2, gunY(0) + 0.05, 0));
    for (const s of [-1, 1]) {
      rope(V(x, top - 0.9, 0), V(x - 0.4, gunY(0.58) + 0.02, s * (halfW(0.58) - 0.05)));
      rope(V(x, top - 0.9, 0), V(x - 1.2, gunY(0.46) + 0.02, s * (halfW(0.46) - 0.05)));
    }
  } else {
    // snapped top: splinters around the break
    const rng = makeRng(4);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      parts.push(orient(spike(0.05, 0.25 + rng() * 0.35, '#9b6a3e', '#e2c08a', 3), [x + Math.cos(a) * 0.06, top - 0.05, Math.sin(a) * 0.06], [Math.cos(a) * 0.25, 1, Math.sin(a) * 0.25], [1, 1, 0.5], a));
    }
  }
  return merge(parts);
}

function fallenMastGeometry() {
  const parts = [];
  const len = 4.6;
  parts.push(tube([V(0, 0, 0), V(len / 2, 0, 0), V(len, 0, 0)], (t) => 0.09 + 0.02 * (1 - t), { radial: 9, color: (t, a, p) => (noise3(p.x * 3, p.y * 8, 1, 5) > 0.3 ? '#8a5a34' : '#9b6a3e') }));
  const rng = makeRng(8);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    parts.push(orient(spike(0.045, 0.2 + rng() * 0.3, '#9b6a3e', '#e2c08a', 3), [-0.02, Math.cos(a) * 0.05, Math.sin(a) * 0.05], [-1, Math.cos(a) * 0.25, Math.sin(a) * 0.25], [1, 1, 0.5], a));
  }
  // yard still attached at the top end
  parts.push(tube([V(len - 0.2, 0.05, -1.6), V(len - 0.2, 0.12, 0), V(len - 0.2, 0.05, 1.6)], () => 0.06, { radial: 7, color: () => '#80522f' }));
  // torn sail draped on the sand
  let s = new THREE.PlaneGeometry(2.6, 2.2, 10, 8);
  s = deform(s, (v) => {
    const x = v.x, z = v.y;
    v.set(x, 0.04 + 0.12 * Math.max(0, Math.sin(x * 2.2 + z * 1.4)) + 0.05 * Math.sin(z * 4.1), z);
    if (x > 0.9) v.x += Math.sin(z * 9) * 0.18;
  });
  s = paint(s, (c) => (Math.abs(c.z + 0.35) < 0.14 ? '#c84a3a' : jitter(c, 1, 3) > 0.6 ? '#ddd0b0' : '#efe4c8'));
  parts.push(place(s, [len - 1.4, -0.08, 0.2], [0, 0.15, 0]));
  return merge(parts);
}

function ropeCoil(r = 0.28, turns = 3) {
  const pts = [];
  for (let i = 0; i <= turns * 5; i++) {
    const t = i / (turns * 5), a = t * TAU * turns;
    const rr = r * (0.55 + 0.45 * t);
    pts.push(V(Math.cos(a) * rr, 0.035 + 0.02 * Math.sin(a * 0.5), Math.sin(a) * rr));
  }
  return tube(pts, () => 0.035, { radial: 6, color: (t, a) => (Math.sin(t * 200 + a * 2) > 0 ? COL.rope : tone(COL.rope, 0.82)) });
}

function debrisGeometry() {
  const rng = makeRng(0xb0a7);
  const parts = [];
  const planks = [[-1.8, -3.4, 0.4, 1.8], [2.6, 3.0, -0.7, 1.4], [-4.2, 2.4, 1.2, 1.1], [0.8, -3.6, 1.9, 1.2], [4.6, -2.2, 0.3, 0.9]];
  for (const [x, z, yaw, len] of planks) {
    parts.push(plank(len, 0.05, 0.22, rng.pick(COL.plank), [x, 0.02, z], [0.03, yaw, 0.04], rng.int(1, 999)));
    // broken end
    parts.push(orient(spike(0.07, 0.25, '#b27d48', '#e2c08a', 3), [x + Math.cos(yaw) * len / 2, 0.03, z - Math.sin(yaw) * len / 2], [Math.cos(yaw), 0, -Math.sin(yaw)], [1, 1, 0.3]));
  }
  parts.push(place(ropeCoil(), [1.9, 0, 3.4]));
  parts.push(tube([V(2.1, 0.03, 3.1), V(2.8, 0.05, 2.6), V(3.4, 0.03, 2.7), V(4.1, 0.03, 2.2)], () => 0.035, { radial: 6, color: () => COL.rope, capStart: false }));
  for (const g of crate(0.8, 0.6, 0.7, rng)) parts.push(place(g, [-3.4, -0.08, 3.3], [0.12, 0.5, 0.06]));
  for (const g of barrel(0.3, 0.8, rng)) parts.push(place(g, [3.7, 0.3, -3.3], [Math.PI / 2 - 0.1, 0.4, 0], 1));
  // a broken oar
  parts.push(tube([V(-2.6, 0.05, 3.9), V(-1.6, 0.05, 4.3)], () => 0.035, { radial: 7, color: () => '#9b6a3e' }));
  let blade = new THREE.SphereGeometry(1, 16, 10);
  blade.scale(0.35, 0.025, 0.12);
  parts.push(part(blade, '#a8723f', [-1.3, 0.04, 4.42], [0, -0.38, 0]));
  return merge(parts);
}

function chocksGeometry() {
  const parts = [];
  const rng = makeRng(6);
  for (const x of [-2.6, 1.4]) {
    parts.push(place(tube([V(x, 0.12, -1.4), V(x, 0.12, 1.4)], () => 0.14, { radial: 9, color: (t, a, p) => (noise3(p.x, p.y * 9, p.z * 4, 2) > 0.3 ? '#7a4d2c' : '#8a5a34') }), [0, -0.05, 0]));
    for (const s of [-1, 1]) {
      const u = (x + L / 2) / L;
      parts.push(plank(0.28, 0.9, 0.12, rng.pick(COL.plank), [x, 0.5, s * (halfW(u) * 0.86 + 0.1)], [s * 0.35, 0, 0], rng.int(1, 99)));
    }
  }
  parts.push(place(ropeCoil(0.24, 2), [-1, 0, 2.6]));
  for (const g of crate(0.7, 0.5, 0.6, rng)) parts.push(place(g, [-3.9, 0, 2.5], [0, 0.3, 0]));
  return merge(parts);
}

function socketGeometry() {
  const parts = [];
  const coil = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * TAU * 1.05;
    coil.push(V(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3));
  }
  parts.push(tube(coil, () => 0.035, { radial: 6, color: (t) => (Math.sin(t * 120) > 0 ? COL.rope : tone(COL.rope, 0.85)) }));
  parts.push(place(blob(0.26, 0.03, 0.26, '#6d4428', { w: 14, h: 6 }), [0, 0.02, 0]));
  return merge(parts);
}

// ------------------------------------------------------------ the boat
const geoCache = {};
const cachedGeo = (k, fn) => (geoCache[k] ||= fn());

export function buildBoat(b) {
  const group = new THREE.Group();
  group.name = 'boat';
  group.position.set(b.x, b.y ?? 0, b.z);
  group.rotation.y = b.rot || 0;

  const hullMat = doubleSided(MAT.standard);
  const hull = new THREE.Group();                         // everything that rolls with the hull
  group.add(hull);
  const hullBroken = mesh(cachedGeo('hullBroken', () => hullGeometry(true)), hullMat);
  const hullFixed = mesh(cachedGeo('hullFixed', () => hullGeometry(false)), hullMat);
  const patch = mesh(cachedGeo('patch', patchGeometry), doubleSided(MAT.standard));
  const deckBroken = mesh(cachedGeo('deckBroken', () => deckGeometry(true)));
  const deckFixed = mesh(cachedGeo('deckFixed', () => deckGeometry(false)));
  const mastFull = mesh(cachedGeo('mastFull', () => mastGeometry(true)), MAT.glossy);
  const mastStump = mesh(cachedGeo('mastStump', () => mastGeometry(false)), MAT.glossy);
  hull.add(hullBroken, hullFixed, patch, deckBroken, deckFixed, mastFull, mastStump);

  const sl = sail();
  sl.mesh.position.set(BOAT.mastX + 0.2, 4.66, 0);
  const pn = pennant();
  pn.mesh.position.set(BOAT.mastX, BOAT.mastH + 0.05, 0);
  pn.mesh.rotation.y = -0.6;
  hull.add(sl.mesh, pn.mesh);

  const rags = new THREE.Group();
  const ragGeo = cachedGeo('rags', () => merge([
    place(ragGeometry(0.8, 1.1, 1), [BOAT.mastX + 0.14, 2.3, 0.1], [0, Math.PI / 2, 0]),
    place(ragGeometry(0.5, 0.8, 4), [BOAT.mastX + 0.1, 2.0, -0.2], [0, Math.PI / 2 + 0.5, 0]),
  ]));
  rags.add(mesh(ragGeo, doubleSided(MAT.standard)));
  hull.add(rags);

  // sockets for delivered relics
  const sockets = BOAT.sockets.map(([x, z]) => {
    const s = new THREE.Group();
    s.position.set(x, BOAT.deckY + 0.03, z);
    s.add(mesh(cachedGeo('socket', socketGeometry)));
    hull.add(s);
    return s;
  });

  // things on the sand
  const brokenOnly = new THREE.Group();
  const fallen = mesh(cachedGeo('fallenMast', fallenMastGeometry), MAT.glossy);
  fallen.position.set(-0.4, 0.05, -HW - 1.6);
  fallen.rotation.y = 0.25;
  brokenOnly.add(fallen, mesh(cachedGeo('debris', debrisGeometry)));
  const fixedOnly = new THREE.Group();
  fixedOnly.add(mesh(cachedGeo('chocks', chocksGeometry)));
  group.add(brokenOnly, fixedOnly);

  let repaired = false;
  const setRepaired = (on) => {
    repaired = !!on;
    hullBroken.visible = deckBroken.visible = mastStump.visible = rags.visible = brokenOnly.visible = !repaired;
    hullFixed.visible = patch.visible = deckFixed.visible = mastFull.visible = sl.mesh.visible = pn.mesh.visible = fixedOnly.visible = repaired;
    if (repaired) { hull.position.set(0, 0.12, 0); hull.rotation.set(-0.02, 0, 0.01); }
    else { hull.position.set(0, -0.3, 0); hull.rotation.set(-0.22, 0, 0.06); }
  };

  const setParts = (kinds = []) => {
    sockets.forEach((s, i) => {
      while (s.children.length > 1) s.remove(s.children[1]);
      const k = kinds[i];
      if (!k) return;
      const m = relicModel(k);
      m.scale.setScalar(0.6);
      m.position.y = 0.04;
      m.rotation.y = i * 1.3;
      s.add(m);
    });
  };

  const update = (dt, time) => {
    if (!repaired) return;
    sl.update(time);
    pn.update(time);
  };

  setRepaired(false);
  return { group, setRepaired, setParts, update };
}
