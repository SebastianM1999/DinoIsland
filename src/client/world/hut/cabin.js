// The log cabin itself: interlocking log walls, gable plank roof, stone
// chimney, door, windows with shutters and flower boxes, lantern and a
// trophy skull. Local frame: origin at layout.hut (x, ground y, z); the
// cabin box is centered at z = +1, door faces north (-z).

import * as THREE from 'three';
import { deform, paint, place, part, merge, jitter, rockGeometry, blob, spike, limb } from '../../models/kit.js';
import { makeRng } from '../../../shared/rng.js';
import { COL, tone, box, plank, log, lashing } from './pieces.js';

// Cabin dimensions (see layout.js collider: center z+1, half 5.4 x 4.2).
export const CABIN = {
  CZ: 1,          // cabin center z (local)
  HX: 4.9,        // side wall centerline |x|
  HZ: 3.8,        // front/back wall centerline distance from CZ
  R: 0.22,        // log radius
  STEP: 0.4,      // row spacing
  EXT: 0.36,      // corner overhang of log ends
  RIDGE: 6.5,     // ridge height
  SLOPE: 0.78,    // roof rise per meter
  EAVE: 4.45,     // eave distance from ridge line
  GABLE: 5.42,    // roof half-length along x
  chimney: { x: -3.0, d: 1.1, top: 7.45 },
};

export function buildCabin() {
  const { CZ, HX, HZ, R, STEP, EXT, RIDGE, SLOPE, EAVE, GABLE } = CABIN;
  const rng = makeRng(0x6a7d11);
  const std = [];
  const glossy = [];
  const glow = [];
  const roofY = (d) => RIDGE - SLOPE * Math.abs(d); // top of roof at distance d from ridge
  const logCol = () => rng.pick(COL.log);

  const FRONT = CZ - HZ, BACK = CZ + HZ;

  // ------------------------------------------------------------ openings
  const doorW = 1.4, doorX = 0.7;
  const openings = {
    front: [
      { a: doorX - doorW / 2, b: doorX + doorW / 2, y0: 0, y1: 2.4, kind: 'door' },
      { a: -3.3, b: -2.1, y0: 0.84, y1: 2.0, kind: 'window', box: true },
      { a: 2.6, b: 3.8, y0: 0.84, y1: 2.0, kind: 'window', box: true },
    ],
    back: [{ a: -1.2, b: 0.0, y0: 0.84, y1: 2.0, kind: 'window' }],
    east: [{ a: -0.6 + CZ, b: 0.6 + CZ, y0: 1.04, y1: 2.2, kind: 'window' }],
    west: [],
  };

  // Split [from, to] around the openings that the row at height y crosses.
  const segments = (from, to, y, ops) => {
    let segs = [[from, to, true, true]];
    for (const o of ops) {
      if (y < o.y0 || y > o.y1) continue;
      const next = [];
      for (const [a, b, ea, eb] of segs) {
        if (o.b <= a || o.a >= b) { next.push([a, b, ea, eb]); continue; }
        if (o.a > a) next.push([a, o.a, ea, true]);
        if (o.b < b) next.push([o.b, b, true, eb]);
      }
      segs = next;
    }
    return segs;
  };

  // ------------------------------------------------- front + back walls
  for (let i = 0; i < 8; i++) {
    const y = R + i * STEP;
    for (const [wz, ops] of [[FRONT, openings.front], [BACK, openings.back]]) {
      for (const [a, b, ea, eb] of segments(-(HX + EXT), HX + EXT, y, ops)) {
        const len = b - a;
        if (len < 0.15) continue;
        std.push(log(len, R * (0.96 + rng() * 0.08), [(a + b) / 2, y, wz], 'x', { body: logCol(), seed: rng.int(1, 9999), ends: [ea, eb] }));
      }
    }
  }

  // -------------------------------------------- side walls + gable rows
  for (let i = 0; ; i++) {
    const y = R + STEP / 2 + i * STEP;
    const roofLimit = (RIDGE - 0.12 - (y + R)) / SLOPE;
    const half = Math.min(HZ + EXT, roofLimit);
    if (half < 0.3) break;
    const gable = half < HZ + EXT - 0.01;
    for (const [wx, ops] of [[HX, openings.east], [-HX, openings.west]]) {
      for (const [a, b, ea, eb] of segments(CZ - half, CZ + half, y, ops)) {
        const len = b - a;
        if (len < 0.15) continue;
        std.push(log(len, R * (0.96 + rng() * 0.08), [wx, y, (a + b) / 2], 'z', { body: logCol(), seed: rng.int(1, 9999), ends: [ea && !gable, eb && !gable] }));
      }
    }
  }

  // ------------------------------------------------ foundation stones
  let sseed = 11;
  const stoneRow = (x0, z0, x1, z1, n) => {
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const s = 0.26 + rng() * 0.08;
      const g = rockGeometry({ radius: s, seed: sseed++, squash: 0.5, colors: COL.stone, moss: rng() < 0.4 ? '#6f9a4a' : null });
      std.push(place(g, [x0 + (x1 - x0) * t, 0.02, z0 + (z1 - z0) * t], [0, rng() * 6.28, 0], [1.2, 1, 1]));
    }
  };
  stoneRow(-HX, FRONT, -0.3, FRONT, 6);
  stoneRow(1.7, FRONT, HX, FRONT, 4);
  stoneRow(-HX, BACK, HX, BACK, 12);
  stoneRow(-HX, FRONT + 0.8, -HX, BACK - 0.8, 7);
  stoneRow(HX, FRONT + 0.8, HX, BACK - 0.8, 7);

  // -------------------------------------------------------------- roof
  const ang = Math.atan(SLOPE);
  const slopeLen = EAVE / Math.cos(ang);
  const nPl = 24;
  const pw = (GABLE * 2) / nPl;
  for (const s of [-1, 1]) {
    for (let k = 0; k < nPl; k++) {
      const x = -GABLE + pw / 2 + k * pw;
      const raised = k % 2 === 0 ? 0.025 : 0;
      const extra = (rng() - 0.5) * 0.12;
      const L = slopeLen + 0.1 + extra;
      const dMid = (L / 2) * Math.cos(ang) - 0.05;
      const thick = 0.08 + rng() * 0.03;
      const base = rng.pick(COL.roof);
      let g = new THREE.BoxGeometry(pw - 0.015, thick, L);
      g = deform(g, (v) => { v.y += jitter(v, 0.012, k + s * 7); v.x += jitter(v, 0.01, k + 3); });
      g = paint(g, (c, n) => (n.y < -0.5 ? COL.roofUnder : n.y > 0.5 ? (jitter(c, 1, k) > 0.55 ? tone(base, 1.1) : base) : tone(base, 0.8)));
      const y = roofY(dMid) + thick / 2 + raised - 0.02;
      std.push(place(g, [x, y, CZ + s * dMid], [s * ang, (rng() - 0.5) * 0.01, 0]));
    }
    // Barge boards along the gable edges.
    for (const gx of [-GABLE - 0.03, GABLE + 0.03]) {
      const dMid = (slopeLen / 2) * Math.cos(ang);
      std.push(plank(0.07, 0.24, slopeLen + 0.12, COL.frame, [gx, roofY(dMid) - 0.02, CZ + s * dMid], [s * ang, 0, 0], rng.int(1, 999)));
    }
    // Purlins poking out of the gables (with light ends).
    for (const d of [1.9, 3.5]) {
      std.push(log(GABLE * 2 - 0.1, 0.16, [0, roofY(d) - 0.3, CZ + s * d], 'x', { body: logCol(), seed: rng.int(1, 9999) }));
    }
  }
  // Ridge beam + ridge cap.
  std.push(log(GABLE * 2 - 0.05, 0.2, [0, RIDGE - 0.36, CZ], 'x', { body: logCol(), seed: 77 }));
  std.push(box(GABLE * 2 + 0.1, 0.26, 0.26, (c, n) => (n.y < -0.3 ? COL.ridge : tone(COL.ridge, 1.15)), [0, RIDGE + 0.06, CZ], [Math.PI / 4, 0, 0]));

  // ------------------------------------------------------------ chimney
  {
    const { x: cx, d, top } = CABIN.chimney;
    const cz = CZ - d;
    const y0 = roofY(d) - 0.6;
    const layer = 0.26;
    const w = 0.86;
    std.push(box(w - 0.1, top - y0, w - 0.1, COL.stoneDark, [cx, (top + y0) / 2, cz]));
    let li = 0;
    for (let y = y0; y < top - 0.1; y += layer, li++) {
      // Two stones per side, alternating joints.
      for (let side = 0; side < 4; side++) {
        const along = side % 2 === 0;
        const off = li % 2 ? 0.14 : -0.14;
        const sgn = side < 2 ? 1 : -1;
        for (const k of [-1, 1]) {
          const len = w / 2 + (k === 1 ? off : -off) - 0.03;
          const pos = along
            ? [cx + (k === -1 ? -w / 2 + len / 2 : w / 2 - len / 2), y + layer / 2, cz + sgn * (w / 2 - 0.08)]
            : [cx + sgn * (w / 2 - 0.08), y + layer / 2, cz + (k === -1 ? -w / 2 + len / 2 : w / 2 - len / 2)];
          const size = along ? [len, layer - 0.035, 0.18] : [0.18, layer - 0.035, len];
          std.push(box(size[0], size[1], size[2], rng.pick(COL.stone), pos, [0, 0, 0], 0.025, sseed++));
        }
      }
    }
    // Cap slab and flue opening.
    std.push(box(w + 0.18, 0.12, w + 0.18, tone(COL.stone[1], 0.9), [cx, top + 0.06, cz], [0, 0, 0], 0.02, 5));
    std.push(box(0.4, 0.03, 0.4, '#1d1a1c', [cx, top + 0.125, cz]));
    // Flashing where it meets the roof.
    std.push(box(w + 0.1, 0.1, w + 0.1, COL.stoneDark, [cx, roofY(d) + 0.04, cz], [-ang * 0.9, 0, 0]));
  }

  // --------------------------------------------------------------- door
  {
    const P = [];
    const h = 2.4;
    const inner = doorW - 0.24;
    // Frame posts + lintel + threshold.
    for (const s of [-1, 1]) P.push(plank(0.13, h, 0.56, COL.frame, [s * (doorW / 2 - 0.065), h / 2, 0], [0, 0, 0], 31 + s));
    P.push(plank(doorW + 0.34, 0.2, 0.6, COL.frame, [0, h + 0.02, -0.02], [0, 0, 0], 35));
    P.push(plank(doorW, 0.08, 0.58, tone(COL.frame, 0.85), [0, 0.04, 0], [0, 0, 0], 36));
    // Door planks.
    const n = 5, pwd = inner / n;
    for (let k = 0; k < n; k++) {
      P.push(plank(pwd - 0.012, h - 0.12, 0.07, COL.door[k % COL.door.length], [-inner / 2 + pwd / 2 + k * pwd, (h - 0.12) / 2 + 0.06, -0.02], [0, 0, 0], 40 + k));
    }
    // Z-brace.
    for (const by of [0.5, 1.85]) P.push(plank(inner - 0.1, 0.13, 0.05, tone(COL.door[0], 1.15), [0, by, -0.08], [0, 0, 0], 50 + by));
    const dl = Math.hypot(inner - 0.2, 1.35);
    P.push(plank(dl, 0.12, 0.045, tone(COL.door[0], 1.15), [0, 1.175, -0.08], [0, 0, Math.atan2(1.35, inner - 0.2)], 53));
    // Hinges, handle ring and nails (metal -> glossy).
    const G = [];
    for (const by of [0.5, 1.85]) {
      G.push(box(0.42, 0.07, 0.02, COL.metal, [-inner / 2 + 0.2, by, -0.115]));
      G.push(box(0.06, 0.1, 0.03, COL.metal, [-inner / 2 + 0.02, by, -0.115]));
    }
    G.push(part(new THREE.TorusGeometry(0.07, 0.014, 4, 8), COL.metal, [inner / 2 - 0.16, 1.1, -0.13], [0, 0, 0]));
    G.push(box(0.05, 0.05, 0.04, COL.metal, [inner / 2 - 0.16, 1.17, -0.11]));
    for (let k = 0; k < n; k++) for (const by of [0.5, 1.85]) G.push(box(0.022, 0.022, 0.02, COL.metal, [-inner / 2 + pwd / 2 + k * pwd, by, -0.115]));
    // Porch step (three planks on two sleeper logs).
    for (let k = 0; k < 2; k++) P.push(plank(doorW + 0.6, 0.07, 0.17, rng.pick(COL.plank), [0, 0.2, -0.32 - k * 0.18], [0, 0, 0], 60 + k));
    for (const s of [-1, 1]) P.push(log(0.44, 0.09, [s * (doorW / 2 + 0.1), 0.08, -0.4], 'z', { body: logCol(), seed: 70 + s }));
    const off = [doorX, 0, FRONT];
    for (const g of P) std.push(place(g, off));
    for (const g of G) glossy.push(place(g, off));

    // Lantern on a bracket left of the door.
    const lx = doorX - doorW / 2 - 0.42, ly = 2.2, lz = FRONT - R - 0.34;
    std.push(box(0.06, 0.06, 0.42, COL.metal, [lx, ly + 0.28, FRONT - R - 0.17]));
    std.push(box(0.12, 0.3, 0.04, tone(COL.frame, 0.9), [lx, ly + 0.2, FRONT - R - 0.01]));
    glossy.push(part(new THREE.ConeGeometry(0.15, 0.13, 4), COL.metal, [lx, ly + 0.08, lz], [0, Math.PI / 4, 0]));
    glossy.push(box(0.2, 0.03, 0.2, COL.metal, [lx, ly - 0.24, lz]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) glossy.push(box(0.022, 0.26, 0.022, COL.metal, [lx + sx * 0.085, ly - 0.1, lz + sz * 0.085]));
    glossy.push(part(new THREE.TorusGeometry(0.04, 0.01, 3, 6), COL.metal, [lx, ly + 0.17, lz], [0, 0, 0]));
    glow.push(box(0.14, 0.2, 0.14, '#ffd27a', [lx, ly - 0.1, lz]));
    glow.push(place(blob(0.035, 0.06, 0.035, '#fff4c8', { w: 5, h: 4 }), [lx, ly - 0.08, lz]));

    // Trophy: a horned dino skull on a plaque above the door.
    const sk = [];
    sk.push(plank(0.62, 0.36, 0.05, tone(COL.frame, 0.8), [0, 0, 0.02], [0, 0, 0], 91));
    let cranium = new THREE.IcosahedronGeometry(0.2, 1);
    cranium = deform(cranium, (v) => { v.z *= v.z < 0 ? 1.7 : 1.0; v.y *= 0.8; if (v.z < -0.1) v.y *= 0.7; v.x *= v.z < -0.1 ? 0.75 : 1; });
    sk.push(part(cranium, (c, nn) => (nn.y < -0.4 ? COL.boneShade : COL.bone), [0, 0.02, -0.2]));
    for (const s of [-1, 1]) {
      sk.push(part(blob(0.055, 0.05, 0.03, '#2b2220', { w: 6, h: 4 }), '#2b2220', [s * 0.1, 0.07, -0.33]));
      sk.push(place(spike(0.045, 0.3, COL.bone, '#fff8e6', 5), [s * 0.12, 0.12, -0.24], [-0.9, 0, s * -0.35]));
    }
    sk.push(place(spike(0.04, 0.16, COL.bone, '#fff8e6', 5), [0, 0.05, -0.52], [-1.3, 0, 0]));
    // Frill.
    let frill = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 9, 1, false, -Math.PI * 0.55, Math.PI * 1.1);
    sk.push(part(frill, COL.boneShade, [0, 0.12, -0.02], [Math.PI / 2 - 0.35, 0, 0]));
    for (const g of sk) std.push(place(g, [doorX, 2.84, FRONT - R - 0.02]));
  }

  // ------------------------------------------------------------ windows
  const windowGeo = (w, h, withBox, seed) => {
    const P = [], G = [];
    const r2 = makeRng(seed);
    // Frame inside the opening + trim on the face.
    for (const s of [-1, 1]) P.push(plank(0.1, h, 0.54, COL.frame, [s * (w / 2 - 0.05), h / 2, 0], [0, 0, 0], seed + s));
    for (const y of [0.05, h - 0.05]) P.push(plank(w - 0.2, 0.1, 0.54, COL.frame, [0, y, 0], [0, 0, 0], seed + y * 10));
    for (const s of [-1, 1]) P.push(plank(0.09, h + 0.16, 0.05, tone(COL.frame, 1.08), [s * (w / 2 + 0.03), h / 2, -R - 0.02], [0, 0, 0], seed + 3 + s));
    P.push(plank(w + 0.24, 0.1, 0.05, tone(COL.frame, 1.08), [0, h + 0.06, -R - 0.02], [0, 0, 0], seed + 9));
    // Sill.
    P.push(plank(w + 0.36, 0.08, 0.32, tone(COL.frame, 1.12), [0, -0.02, -R - 0.08], [0, 0, 0], seed + 11));
    // Glass: subdivided plane so the reflection band gets its own facets.
    let gl = new THREE.PlaneGeometry(w - 0.2, h - 0.2, 4, 4);
    gl = paint(gl, (c) => (Math.abs(c.x + c.y * 0.9 - 0.05) < 0.14 || Math.abs(c.x + c.y * 0.9 + 0.3) < 0.05 ? COL.glassHi : COL.glass));
    G.push(place(gl, [0, h / 2, 0.02], [0, Math.PI, 0]));
    // Muntins.
    P.push(plank(0.05, h - 0.2, 0.05, COL.frame, [0, h / 2, -0.01], [0, 0, 0], seed + 12));
    P.push(plank(w - 0.2, 0.05, 0.05, COL.frame, [0, h / 2, -0.01], [0, 0, 0], seed + 13));
    // Open shutters flat against the wall.
    const sw = w / 2;
    for (const s of [-1, 1]) {
      const sx = s * (w / 2 + 0.13 + sw / 2);
      const col = r2.pick(COL.shutter);
      for (let k = 0; k < 3; k++) P.push(plank(sw / 3 - 0.012, h + 0.04, 0.05, k === 1 ? tone(col, 0.92) : col, [sx - sw / 3 + k * sw / 3, h / 2, -R - 0.04], [0, 0, 0], seed + 20 + k + s * 5));
      for (const y of [0.22, h - 0.22]) P.push(plank(sw - 0.04, 0.09, 0.04, tone(col, 1.15), [sx, y, -R - 0.085], [0, 0, 0], seed + 30 + y));
      const dl = Math.hypot(sw - 0.12, h - 0.44);
      P.push(plank(dl, 0.08, 0.035, tone(col, 1.15), [sx, h / 2, -R - 0.085], [0, 0, s * Math.atan2(h - 0.44, sw - 0.12)], seed + 40 + s));
      G.push(box(0.14, 0.04, 0.02, COL.metal, [s * (w / 2 + 0.12), 0.22, -R - 0.1]));
      G.push(box(0.14, 0.04, 0.02, COL.metal, [s * (w / 2 + 0.12), h - 0.22, -R - 0.1]));
    }
    if (withBox) {
      // Flower box with poppy flowers.
      P.push(plank(w + 0.1, 0.2, 0.24, tone(COL.shutter[0], 0.95), [0, -0.2, -R - 0.2], [0, 0, 0], seed + 50));
      P.push(box(w - 0.02, 0.03, 0.18, '#4a3322', [0, -0.09, -R - 0.2]));
      for (let k = 0; k < 7; k++) {
        const fx = -w / 2 + 0.1 + (k / 6) * (w - 0.2);
        const fz = -R - 0.2 + (r2() - 0.5) * 0.1;
        P.push(place(blob(0.075, 0.06, 0.065, r2() < 0.5 ? '#5c9a3c' : '#4d8a34', { w: 5, h: 4 }), [fx, -0.05, fz]));
        if (k % 2 === 0 || r2() < 0.4) {
          const fc = r2.pick(['#e8453c', '#ffc93c', '#f07a2e', '#ff6a8a']);
          const fy = 0.02 + r2() * 0.08;
          P.push(place(limb(0.01, 0.008, fy + 0.02, '#4d8a34', 3), [fx, -0.08, fz]));
          P.push(place(blob(0.045, 0.03, 0.045, fc, { w: 5, h: 3 }), [fx, fy, fz]));
          P.push(place(blob(0.015, 0.015, 0.015, '#3a2a1a', { w: 4, h: 3 }), [fx, fy + 0.025, fz]));
        }
      }
    }
    return { P, G };
  };
  const addWindow = (o, wall) => {
    const w = o.b - o.a, h = o.y1 - o.y0;
    const { P, G } = windowGeo(w, h, !!o.box, Math.floor((o.a + 10) * 100));
    let pos, rot;
    const cx = (o.a + o.b) / 2;
    if (wall === 'front') { pos = [cx, o.y0, FRONT]; rot = [0, 0, 0]; }
    else if (wall === 'back') { pos = [cx, o.y0, BACK]; rot = [0, Math.PI, 0]; }
    else if (wall === 'east') { pos = [HX, o.y0, cx]; rot = [0, -Math.PI / 2, 0]; }
    for (const g of P) std.push(place(g, pos, rot));
    for (const g of G) glossy.push(place(g, pos, rot));
  };
  for (const o of openings.front) if (o.kind === 'window') addWindow(o, 'front');
  for (const o of openings.back) addWindow(o, 'back');
  for (const o of openings.east) addWindow(o, 'east');

  // Rope + hooks: a coil of rope hanging on the west gable wall.
  {
    const coil = new THREE.TorusGeometry(0.2, 0.04, 4, 10);
    std.push(part(coil, COL.rope, [-HX - R - 0.04, 1.6, CZ + 2.0], [0, Math.PI / 2, 0], [1, 1.2, 1]));
    std.push(part(new THREE.TorusGeometry(0.16, 0.035, 4, 10), tone(COL.rope, 0.9), [-HX - R - 0.08, 1.55, CZ + 2.05], [0, Math.PI / 2, 0.3], [1, 1.2, 1]));
    std.push(box(0.12, 0.05, 0.05, COL.metal, [-HX - R - 0.02, 1.84, CZ + 2.0]));
  }

  return { std, glossy, glow };
}
