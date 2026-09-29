// Shared building pieces for the hunting hut: logs, planks, crates, barrels,
// the dinosaur footprint emblem and a palette. Everything returns prepared,
// vertex-colored geometry (see models/kit.js) ready to be merged.

import * as THREE from 'three';
import { deform, paint, place, part, merge, jitter, wrap } from '../../models/kit.js';

export const COL = {
  log: ['#8a5a34', '#80522f', '#93603a', '#7a4d2c'],
  logEnd: '#e2b67c',
  logRing: '#c38c54',
  logCore: '#eccb96',
  plank: ['#a8723f', '#9b6636', '#b27d48', '#94602f'],
  plankDark: '#5a3a22',
  frame: '#b8844c',
  door: ['#6e4428', '#77492b', '#653d24', '#724629'],
  shutter: ['#8f4a2e', '#9a5233', '#86442a'],
  roof: ['#34466b', '#3c5078', '#2f3d5c', '#43557d', '#384a70'],
  roofUnder: '#5b3c26',
  ridge: '#27324a',
  stone: ['#9c93a8', '#8a8199', '#a79c9a', '#948b9f'],
  stoneDark: '#6f6878',
  metal: '#3b3d45',
  rope: '#c9a46a',
  bone: '#efe3c8',
  boneShade: '#d6c49f',
  navy: '#24345a',
  navyDark: '#1b2744',
  white: '#f4f1e8',
  paper: ['#f3e6c4', '#efe0b8', '#f6ecd2'],
  pin: '#d63c3c',
  char: '#2e2622',
  ash: '#4d4744',
  glass: '#2c3a52',
  glassHi: '#5f7ba0',
};

/** Color scaled by k (build time only). */
export function tone(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Box with optional vertex jitter; color may be a hex or paint() function. */
export function box(w, h, d, color, pos = [0, 0, 0], rot = [0, 0, 0], jit = 0, seed = 1) {
  let g = new THREE.BoxGeometry(w, h, d);
  if (jit) {
    g = deform(g, (v) => {
      v.x += jitter(v, jit, seed);
      v.y += jitter(v, jit, seed + 1);
      v.z += jitter(v, jit, seed + 2);
    });
  }
  return part(g, color, pos, rot);
}

/** A board whose faces get a subtle light top / dark bottom. */
export function plank(w, h, d, base, pos, rot = [0, 0, 0], seed = 1, jit = 0.008) {
  let g = new THREE.BoxGeometry(w, h, d);
  g = deform(g, (v) => {
    v.x += jitter(v, jit, seed);
    v.y += jitter(v, jit, seed + 1);
    v.z += jitter(v, jit, seed + 2);
  });
  g = paint(g, (c, n) => (n.y > 0.6 ? tone(base, 1.1) : n.y < -0.6 ? tone(base, 0.75) : base));
  return place(g, pos, rot);
}

/**
 * Horizontal (or arbitrary) log. Built along Y, then rotated so its axis is
 * `axis` ('x', 'y' or 'z'), then extra rotation `rot`, then moved to `pos`.
 * End caps are lighter with a growth ring and core.
 */
export function log(len, r, pos, axis = 'x', { body = COL.log[0], seed = 1, ends = [true, true], radial = 7, rot = null, charred = 0, endCol = COL.logEnd } = {}) {
  let g = new THREE.CylinderGeometry(r, r, len, radial, 1);
  g = deform(g, (v) => {
    const k = 1 + jitter(v, 0.08, seed);
    v.x *= k;
    v.z *= k;
  });
  g.rotateY(seed * 1.37);
  const half = len / 2;
  const toAxis = (geo) => {
    if (axis === 'x') geo.rotateZ(-Math.PI / 2);
    else if (axis === 'z') geo.rotateX(Math.PI / 2);
    return geo;
  };
  toAxis(g);
  const ai = axis === 'x' ? 'x' : axis === 'z' ? 'z' : 'y';
  const parts = [paint(g, (c, n) => {
    if (Math.abs(n[ai]) > 0.8) return charred ? COL.char : endCol;
    if (charred && Math.abs(c[ai]) > half * (1 - charred)) return COL.char;
    const j = jitter(c, 1, seed + 5);
    if (ai !== 'y') return n.y > 0.5 ? tone(body, 1.12) : n.y < -0.5 ? tone(body, 0.78) : j > 0.3 ? tone(body, 0.9) : body;
    return j > 0.3 ? tone(body, 0.9) : j < -0.4 ? tone(body, 1.08) : body;
  })];
  // Rings on the end faces (only where the end is visible).
  for (let e = 0; e < 2; e++) {
    if (!ends[e] || charred) continue;
    const sgn = e === 0 ? -1 : 1;
    const ring = new THREE.CircleGeometry(r * 0.64, radial);
    parts.push(toAxis(part(ring, COL.logRing, [0, sgn * (half + 0.004), 0], [sgn * -Math.PI / 2, 0, 0])));
    const core = new THREE.CircleGeometry(r * 0.28, 5);
    parts.push(toAxis(part(core, COL.logCore, [0, sgn * (half + 0.008), 0], [sgn * -Math.PI / 2, 0, 0])));
  }
  let out = merge(parts);
  if (rot) out = place(out, [0, 0, 0], rot);
  out.translate(pos[0], pos[1], pos[2]);
  return out;
}

/**
 * Wooden crate. Origin at bottom center. Returns geometry list.
 * open: no lid (contents are added by the caller).
 */
export function crate(w, h, d, rng, { open = false, brace = true } = {}) {
  const P = [];
  const inset = 0.035;
  const pick = () => rng.pick(COL.plank);
  // Dark core (visible through plank gaps). Open crates only get a floor.
  if (open) P.push(box(w - 0.06, 0.06, d - 0.06, COL.plankDark, [0, h * 0.35, 0]));
  else P.push(box(w - inset * 2, h - inset * 2, d - inset * 2, COL.plankDark, [0, h / 2, 0]));
  // Side planks (3 rows) on the four faces.
  const rows = 3, gap = 0.025;
  const ph = (h - gap * (rows + 1)) / rows;
  for (let i = 0; i < rows; i++) {
    const y = gap + ph / 2 + i * (ph + gap);
    for (const s of [-1, 1]) {
      P.push(plank(w - 0.02, ph, 0.04, pick(), [0, y, s * (d / 2 - 0.02)], [0, 0, 0], rng.int(1, 999)));
      P.push(plank(0.04, ph, d - 0.1, pick(), [s * (w / 2 - 0.02), y, 0], [0, 0, 0], rng.int(1, 999)));
    }
  }
  if (!open) {
    const n = 3, pw = (d - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      P.push(plank(w - 0.02, 0.04, pw, pick(), [0, h - 0.02, -d / 2 + gap + pw / 2 + i * (pw + gap)], [0, 0, 0], rng.int(1, 999)));
    }
  }
  // Frame: corner posts + rims (lighter).
  const f = 0.065;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(plank(f, h, f, COL.frame, [sx * (w / 2 - f / 2 + 0.012), h / 2, sz * (d / 2 - f / 2 + 0.012)], [0, 0, 0], rng.int(1, 999)));
  }
  for (const y of [f / 2, h - f / 2]) {
    for (const s of [-1, 1]) {
      P.push(plank(w - f, f, 0.05, COL.frame, [0, y, s * (d / 2 + 0.005)], [0, 0, 0], rng.int(1, 999)));
      P.push(plank(0.05, f, d - f, COL.frame, [s * (w / 2 + 0.005), y, 0], [0, 0, 0], rng.int(1, 999)));
    }
  }
  if (brace) {
    const bl = Math.hypot(w - f * 2, h - f * 2);
    const ang = Math.atan2(h - f * 2, w - f * 2);
    for (const s of [-1, 1]) P.push(plank(bl, f * 0.9, 0.04, COL.frame, [0, h / 2, s * (d / 2 + 0.025)], [0, 0, s * ang], rng.int(1, 999)));
  }
  // Nails on the front / back rims.
  for (const s of [-1, 1]) for (const sx of [-1, 1]) for (const y of [f / 2, h - f / 2]) {
    P.push(box(0.025, 0.025, 0.012, COL.metal, [sx * (w / 2 - 0.1), y, s * (d / 2 + 0.034)]));
  }
  return P;
}

/** Barrel with bulging staves and dark hoops. Origin at bottom center. */
export function barrel(r, h, rng, { top = COL.plankDark } = {}) {
  const radial = 11;
  let g = new THREE.CylinderGeometry(r, r, h, radial, 4);
  g.translate(0, h / 2, 0);
  g = deform(g, (v) => {
    const t = v.y / h;
    const k = 1 + 0.12 * Math.sin(Math.PI * t);
    v.x *= k;
    v.z *= k;
  });
  const staves = COL.plank.map((c) => tone(c, 0.95));
  g = paint(g, (c, n) => {
    if (n.y > 0.8) return top;
    if (n.y < -0.8) return COL.plankDark;
    const a = Math.atan2(c.z, c.x);
    const k = ((Math.floor((a + Math.PI) / (Math.PI * 2) * radial) % 4) + 4) % 4;
    return staves[k];
  });
  const P = [g];
  for (const t of [0.12, 0.35, 0.65, 0.88]) {
    const k = 1 + 0.12 * Math.sin(Math.PI * t);
    const hoop = new THREE.TorusGeometry(r * k + 0.012, 0.018, 3, radial);
    P.push(part(hoop, COL.metal, [0, t * h, 0], [Math.PI / 2, 0, 0]));
  }
  return P;
}

/** Rope lashing band around an axis at pos. */
export function lashing(radius, height, turns, pos, rot = [0, 0, 0]) {
  return place(wrap(radius, height, turns, COL.rope), pos, rot);
}

/**
 * White three-toed dinosaur footprint in the XY plane, facing +Z, toes up.
 * About `size` meters tall, centered at the origin.
 */
export function footprint(size, color = COL.white) {
  const parts = [];
  const poly = (pts) => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  // Heel pad.
  parts.push(poly([[0, -0.44], [0.19, -0.38], [0.27, -0.2], [0.23, -0.02], [0.11, 0.07], [-0.11, 0.07], [-0.23, -0.02], [-0.27, -0.2], [-0.19, -0.38]]));
  // Toes with pointed claws.
  const toe = (w, len, x, y, rz) => {
    const g = poly([[-w, 0], [-w * 1.15, len * 0.42], [-w * 0.72, len * 0.8], [0, len], [w * 0.72, len * 0.8], [w * 1.15, len * 0.42], [w, 0]]);
    return place(g, [x, y, 0], [0, 0, rz]);
  };
  parts.push(toe(0.085, 0.52, 0, 0.11, 0));
  parts.push(toe(0.08, 0.43, -0.13, 0.04, 0.62));
  parts.push(toe(0.08, 0.43, 0.13, 0.04, -0.62));
  const g = merge(parts.map((p, i) => place(paint(p, color), [0, 0, i * 0.0015])));
  g.translate(0, -0.06, 0);
  g.scale(size, size, 1);
  return g;
}
