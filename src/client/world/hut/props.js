// Static props around the hut: loot drop-off crates, workbench with arrow
// barrel, mission board, flagpole and the campfire's stones/logs/seats.
// Each builder works in its own local frame (origin at the prop's ground
// point) and returns { std, glossy, glow } geometry lists.

import * as THREE from 'three';
import { deform, paint, place, part, merge, jitter, rockGeometry, blob, spike, limb, tube } from '../../models/kit.js';
import { makeRng } from '../../../shared/rng.js';
import { COL, tone, box, plank, log, crate, barrel, lashing, footprint } from './pieces.js';

const out = () => ({ std: [], glossy: [], glow: [] });

// ------------------------------------------------------------ drop-off
/** Loot drop-off: pallet, stacked crates, an open crate of loot, hide rack. Fits 2.2 x 1.6 m. */
export function buildDropOff() {
  const o = out();
  const rng = makeRng(0xd809);
  const S = o.std;
  // Pallet (runners + deck boards).
  for (const z of [-0.6, 0, 0.6]) S.push(plank(2.08, 0.08, 0.12, tone(COL.plank[3], 0.85), [0, 0.04, z], [0, 0, 0], rng.int(1, 999)));
  for (let k = 0; k < 7; k++) S.push(plank(0.26, 0.04, 1.5, rng.pick(COL.plank), [-0.93 + k * 0.31, 0.1, 0], [0, (rng() - 0.5) * 0.03, 0], rng.int(1, 999)));
  const deckY = 0.12;
  // Crate A (bottom left) + crate B stacked on top.
  const A = crate(0.92, 0.56, 0.76, rng);
  for (const g of A) S.push(place(g, [-0.52, deckY, -0.18], [0, 0.04, 0]));
  const B = crate(0.66, 0.42, 0.56, rng, { brace: false });
  for (const g of B) S.push(place(g, [-0.5, deckY + 0.56, -0.14], [0, -0.18, 0]));
  // Rope binding around crate B.
  for (const x of [-0.14, 0.14]) S.push(place(box(0.035, 0.44, 0.6, COL.rope), [x, 0.21, 0], [0, 0, 0]));
  S[S.length - 1] = place(S[S.length - 1], [-0.5, deckY + 0.56, -0.14], [0, -0.18, 0]);
  S[S.length - 2] = place(S[S.length - 2], [-0.5, deckY + 0.56, -0.14], [0, -0.18, 0]);

  // Open crate C with loot.
  const cx = 0.5, cz = 0.02;
  const C = crate(0.9, 0.52, 0.78, rng, { open: true });
  const L = [];
  // Meat chunks (red with fat rim), bones, a rolled hide, a spiky tail plate.
  const meat = (s, seed) => {
    let g = new THREE.IcosahedronGeometry(s, 0);
    g = deform(g, (v) => { v.x += jitter(v, s * 0.25, seed); v.y *= 0.75; v.z += jitter(v, s * 0.25, seed + 1); });
    return paint(g, (c, n) => (n.y > 0.55 ? '#d8574a' : n.y < -0.3 ? '#8e2f2a' : jitter(c, 1, seed) > 0.2 ? '#f0d2b0' : '#b8403a'));
  };
  L.push(place(meat(0.2, 3), [-0.18, 0.4, -0.12]));
  L.push(place(meat(0.17, 5), [0.16, 0.42, 0.1]));
  L.push(place(meat(0.15, 8), [0.2, 0.4, -0.18]));
  const bone = (len) => merge([
    place(limb(0.03, 0.03, len, COL.bone, 5), [0, -len / 2, 0]),
    place(blob(0.05, 0.045, 0.05, COL.bone, { w: 5, h: 4 }), [0.02, len / 2, 0]),
    place(blob(0.05, 0.045, 0.05, COL.bone, { w: 5, h: 4 }), [-0.02, len / 2, 0]),
    place(blob(0.05, 0.045, 0.05, COL.bone, { w: 5, h: 4 }), [0.02, -len / 2, 0]),
    place(blob(0.05, 0.045, 0.05, COL.bone, { w: 5, h: 4 }), [-0.02, -len / 2, 0]),
  ]);
  L.push(place(bone(0.55), [-0.05, 0.56, 0.05], [0.3, 0.4, 1.2]));
  L.push(place(bone(0.4), [0.12, 0.5, -0.05], [-0.2, 1.9, 1.35]));
  // Rolled hide with lighter spots.
  let hide = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 8, 2);
  hide = paint(hide, (c, n) => (Math.abs(n.y) > 0.8 ? '#6d4127' : jitter(c, 1, 12) > 0.45 ? '#c8935a' : '#9a6038'));
  L.push(place(hide, [0.02, 0.5, 0.26], [0, 0, Math.PI / 2 - 0.25]));
  // Stegosaurus-style plate (orange-red) sticking out.
  let plate = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 6);
  plate = deform(plate, (v) => { if (v.x > 0) v.x *= 1.8; });
  L.push(part(plate, (c, n) => (Math.abs(n.y) > 0.8 ? '#e0643a' : '#b8482c'), [-0.25, 0.62, 0.2], [Math.PI / 2 - 0.2, 0, 1.1]));
  for (const g of C) S.push(place(g, [cx, deckY, cz], [0, -0.06, 0]));
  for (const g of L) S.push(place(g, [cx, deckY, cz], [0, -0.06, 0]));
  // Hide draped over the front edge of crate C.
  let drape = new THREE.PlaneGeometry(0.6, 0.55, 4, 4);
  drape = deform(drape, (v) => {
    const t = v.y / 0.55 + 0.5; // 0 bottom .. 1 top
    v.z = t > 0.7 ? -(t - 0.7) * 0.9 : 0;
    v.y = t > 0.7 ? 0.7 * 0.55 - 0.275 + (t - 0.7) * 0.2 : v.y;
    v.x += jitter(v, 0.03, 4);
    v.z += jitter(v, 0.02, 9);
  });
  drape = paint(drape, (c) => (jitter(c, 1, 21) > 0.4 ? '#d2a064' : '#a4693c'));
  S.push(place(drape, [cx + 0.02, deckY + 0.44, cz - 0.42], [0, Math.PI - 0.06, 0]));

  // Hide-stretching frame leaning against the back.
  {
    const F = [];
    const fw = 1.9, fh = 1.02;
    for (const s of [-1, 1]) F.push(log(fh + 0.12, 0.035, [s * fw / 2, fh / 2, 0], 'y', { body: COL.log[2], seed: 90 + s }));
    for (const y of [0.1, fh - 0.04]) F.push(log(fw + 0.14, 0.035, [0, y, 0], 'x', { body: COL.log[1], seed: 95 + y }));
    let skin = new THREE.PlaneGeometry(fw - 0.3, fh - 0.34, 5, 3);
    skin = deform(skin, (v) => { v.x *= 1 - 0.12 * Math.abs(v.y) * 2; v.z = jitter(v, 0.03, 31) - 0.02; });
    skin = paint(skin, (c) => (jitter(c, 1, 33) > 0.5 ? '#6f8a4e' : jitter(c, 1, 34) > 0.3 ? '#8aa35e' : '#7c9a58'));
    const skinBack = skin.clone();
    F.push(place(skin, [0, fh / 2 + 0.03, -0.01]));
    F.push(place(skinBack, [0, fh / 2 + 0.03, -0.01], [0, Math.PI, 0]));
    // Rope ties corner to frame.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      F.push(box(0.2, 0.018, 0.018, COL.rope, [sx * (fw / 2 - 0.12), fh / 2 + 0.03 + sy * (fh / 2 - 0.2), 0], [0, 0, sx * sy * 0.8]));
    }
    for (const g of F) S.push(place(g, [0, 0, 0.7], [-0.16, 0, 0]));
  }
  // A few nails/metal bits on the crates are already part of crate().
  return o;
}

// ----------------------------------------------------------- workbench
/** Workbench with tools, tool wall and an arrow barrel at +x. Fits 2.8 x 1.2 m. */
export function buildWorkbench() {
  const o = out();
  const rng = makeRng(0xbe7c);
  const S = o.std, G = o.glossy;
  const bx = -0.32, bw = 2.0, top = 0.86;
  // Tabletop from three thick planks.
  for (let k = 0; k < 3; k++) S.push(plank(bw + (rng() - 0.5) * 0.06, 0.08, 0.25, rng.pick(COL.plank), [bx, top, -0.27 + k * 0.27], [0, 0, 0], rng.int(1, 999), 0.01));
  // Legs, stretchers, lower shelf.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.push(plank(0.11, top - 0.04, 0.11, tone(COL.log[1], 1.05), [bx + sx * (bw / 2 - 0.12), (top - 0.04) / 2, sz * 0.3], [0, 0, 0], rng.int(1, 999)));
  for (const sz of [-1, 1]) S.push(plank(bw - 0.2, 0.08, 0.06, COL.frame, [bx, 0.24, sz * 0.3], [0, 0, 0], rng.int(1, 999)));
  for (let k = 0; k < 3; k++) S.push(plank(bw - 0.3, 0.04, 0.17, rng.pick(COL.plank), [bx, 0.3, -0.19 + k * 0.19], [0, 0, 0], rng.int(1, 999)));
  // Stuff on the lower shelf: stones and a small crate.
  for (let k = 0; k < 3; k++) S.push(place(rockGeometry({ radius: 0.09, seed: 40 + k, squash: 0.7, colors: COL.stone }), [bx - 0.7 + k * 0.16, 0.36, -0.05]));
  for (const g of crate(0.4, 0.3, 0.32, rng, { brace: false })) S.push(place(g, [bx + 0.5, 0.32, 0], [0, 0.2, 0]));
  // Tool wall behind the bench.
  const wz = 0.47;
  for (const sx of [-1, 1]) S.push(plank(0.1, 1.95, 0.1, tone(COL.log[0], 1.05), [bx + sx * (bw / 2 - 0.06), 0.975, wz + 0.03], [0, 0, 0], rng.int(1, 999)));
  for (let k = 0; k < 5; k++) S.push(plank(bw - 0.04, 0.17, 0.04, rng.pick(COL.plank), [bx, 1.02 + k * 0.18, wz], [0, 0, (rng() - 0.5) * 0.01], rng.int(1, 999)));
  S.push(plank(bw + 0.1, 0.1, 0.16, COL.frame, [bx, 1.96, wz - 0.02], [0, 0, 0], 7));
  // Pegs.
  const pegs = [-0.75, -0.3, 0.2, 0.55];
  for (const px of pegs) S.push(place(limb(0.022, 0.018, 0.12, tone(COL.frame, 0.8), 4), [bx + px, 1.62, wz - 0.02], [-Math.PI / 2, 0, 0]));
  // Hanging hand axe (stone head lashed to a handle).
  {
    const A = [];
    A.push(place(limb(0.025, 0.02, 0.6, COL.log[2], 5), [0, -0.6, 0]));
    let head = new THREE.OctahedronGeometry(0.1, 0);
    head = deform(head, (v) => { v.x *= 1.3; v.z *= 0.35; });
    A.push(part(head, (c, n) => (n.x < -0.3 ? '#c9c4cf' : '#7a7686'), [-0.08, -0.08, 0]));
    A.push(lashing(0.035, 0.08, 3, [0, -0.12, 0]));
    for (const g of A) S.push(place(g, [bx - 0.75, 1.6, wz - 0.08]));
  }
  // Hanging bow (curved limb + string).
  {
    const pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6 - 0.5; pts.push(new THREE.Vector3(Math.cos(t * 2.4) * 0.3 - 0.3, t * 1.1, 0)); }
    const bow = tube(pts, (t) => 0.02 + 0.012 * Math.sin(Math.PI * t), { radial: 5, color: (t) => (t > 0.42 && t < 0.58 ? '#c24a32' : '#8a5a34') });
    S.push(place(bow, [bx + 0.3 , 1.35, wz - 0.1]));
    S.push(place(limb(0.005, 0.005, 1.1, '#f0e6d0', 3), [bx + 0.3 + Math.cos(1.2) * 0.3 - 0.3, 1.35 - 0.55, wz - 0.1]));
  }
  // Spear hanging diagonally across the wall.
  {
    const P = [];
    P.push(place(limb(0.025, 0.022, 1.8, COL.log[0], 5), [0, -0.9, 0]));
    P.push(place(spike(0.05, 0.22, '#6f7280', '#b9bcc8', 4), [0, 0.9, 0], [0, 0.4, 0], [1, 1, 0.45]));
    P.push(lashing(0.03, 0.1, 3, [0, 0.82, 0]));
    P.push(lashing(0.03, 0.16, 4, [0, -0.1, 0]));
    for (const g of P) S.push(place(g, [bx + 0.05, 1.5, wz - 0.05], [0, 0, -1.25]));
  }
  // Tools on the top: hammer, knife, whetstone, flint tips, arrow shafts, vise.
  const T = top + 0.04;
  {
    const at = [bx - 0.4, T, -0.12], rot = [0, 0.35, 0];
    S.push(place(place(limb(0.018, 0.016, 0.36, COL.log[2], 5), [0, 0.02, 0], [0, 0, Math.PI / 2]), at, rot));
    G.push(place(box(0.08, 0.07, 0.16, COL.metal, [-0.34, 0.035, 0]), at, rot));
  }
  G.push(place(box(0.2, 0.012, 0.05, '#aab0bc'), [bx - 0.1, T + 0.008, 0.05], [0, -0.5, 0]));
  S.push(place(box(0.12, 0.03, 0.04, '#3a2618'), [bx - 0.24, T + 0.016, 0.12], [0, -0.5, 0]));
  S.push(box(0.2, 0.05, 0.08, '#7a7f8c', [bx + 0.2, T + 0.025, 0.2], [0, 0.3, 0], 0.01, 3));
  for (let k = 0; k < 3; k++) S.push(place(spike(0.05, 0.16, '#5f6272', '#b9bcc8', 4), [bx + 0.18 + k * 0.1, T + 0.012, -0.18], [-Math.PI / 2, 0, 0.1 * k], [1, 1, 0.4]));
  for (let k = 0; k < 4; k++) S.push(place(limb(0.011, 0.011, 0.8, '#c89a62', 4), [bx + 0.35, T + 0.012, -0.02 + k * 0.03], [0, 0, Math.PI / 2 + (k - 1.5) * 0.02]));
  // Feathers bundle.
  for (let k = 0; k < 3; k++) S.push(place(blob(0.12, 0.012, 0.035, k === 1 ? COL.white : '#d8433a', { w: 5, h: 3 }), [bx + 0.72, T + 0.015 + k * 0.012, 0.12], [0, 0.4 + k * 0.3, 0]));
  // Vise at the left end.
  G.push(box(0.16, 0.14, 0.12, COL.metal, [bx - bw / 2 + 0.1, T + 0.07, -0.26]));
  G.push(box(0.04, 0.14, 0.16, '#50535d', [bx - bw / 2 + 0.2, T + 0.07, -0.26]));
  G.push(place(limb(0.012, 0.012, 0.22, COL.metal, 4), [bx - bw / 2 + 0.26, T + 0.06, -0.26], [0, 0, Math.PI / 2]));

  // Arrow barrel (the arrows themselves are an InstancedMesh, see fx.js).
  for (const g of barrel(0.28, 0.72, rng, { top: '#3a2616' })) S.push(place(g, [1.05, 0, 0]));
  return o;
}

/** Where the arrow instances stand (relative to the workbench origin). */
export const ARROW_BARREL = { x: 1.05, y: 0.52, z: 0, r: 0.2 };

// -------------------------------------------------------- mission board
/** Signpost with navy footprint banner and pinned notes. Front faces -z. Fits r 0.5 at ground. */
export function buildMissionBoard() {
  const o = out();
  const rng = makeRng(0xb0a7d);
  const S = o.std;
  const H = 3.05;
  // Posts.
  for (const s of [-1, 1]) {
    let p = new THREE.CylinderGeometry(0.075, 0.09, H, 7, 2);
    p.translate(0, H / 2, 0);
    p = deform(p, (v) => { v.x += jitter(v, 0.012, 3 + s); v.z += jitter(v, 0.012, 5 + s); });
    p = paint(p, (c, n) => (n.y > 0.8 ? COL.logEnd : jitter(c, 1, 7) > 0.3 ? tone(COL.log[0], 0.9) : COL.log[0]));
    S.push(place(p, [s * 0.4, 0, 0.04]));
    S.push(lashing(0.1, 0.12, 3, [s * 0.4, 2.55, 0.04]));
    S.push(place(rockGeometry({ radius: 0.1, seed: 60 + s, squash: 0.6, colors: COL.stone }), [s * 0.24, 0.02, -0.2]));
  }
  // Crossbeam with light ends + small plank roof.
  S.push(log(1.42, 0.075, [0, 2.72, 0.04], 'x', { body: COL.log[1], seed: 21 }));
  const rAng = 0.5;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) S.push(plank(0.4, 0.04, 0.34, rng.pick(COL.roof), [-0.6 + k * 0.4, 2.93, 0.04 + s * 0.14], [s * rAng, 0, 0], rng.int(1, 999)));
  }
  S.push(box(1.66, 0.08, 0.08, COL.ridge, [0, 3.03, 0.04], [Math.PI / 4, 0, 0]));
  for (const s of [-1, 1]) S.push(plank(0.07, 0.4, 0.07, COL.frame, [s * 0.4, 2.87, 0.04], [0, 0, 0], 9 + s));
  // Backboard: horizontal planks in front of the posts.
  for (let k = 0; k < 8; k++) S.push(plank(0.9, 0.2, 0.05, rng.pick(COL.plank), [0, 0.86 + k * 0.215, -0.07], [0, 0, (rng() - 0.5) * 0.015], rng.int(1, 999)));
  for (const s of [-1, 1]) S.push(plank(0.07, 1.75, 0.04, COL.frame, [s * 0.415, 1.61, -0.11], [0, 0, 0], 30 + s));
  // Banner rod + navy banner with a swallowtail.
  S.push(place(limb(0.02, 0.02, 0.96, COL.log[3], 5), [-0.48, 2.5, -0.15], [0, 0, -Math.PI / 2]));
  for (const s of [-1, 1]) S.push(place(blob(0.035, 0.035, 0.035, '#e0b03a', { w: 5, h: 4 }), [s * 0.49, 2.5, -0.15]));
  {
    const bw = 0.76, top = 2.48, bot = 1.3, notch = 0.2;
    const sh = new THREE.Shape();
    sh.moveTo(-bw / 2, top);
    sh.lineTo(bw / 2, top);
    sh.lineTo(bw / 2, bot);
    sh.lineTo(0, bot + notch);
    sh.lineTo(-bw / 2, bot);
    sh.closePath();
    let ban = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
    ban = paint(ban, (c, n) => (Math.abs(n.z) < 0.5 ? COL.navyDark : c.y > top - 0.1 || c.y < bot + notch * 0.2 ? COL.navyDark : COL.navy));
    S.push(place(ban, [0, 0, -0.17]));
    // Trim band near the top.
    S.push(box(bw, 0.05, 0.012, '#e0b03a', [0, top - 0.12, -0.176]));
    // Footprint emblem.
    S.push(place(footprint(0.62), [0, 1.93, -0.176], [0, Math.PI, 0]));
  }
  // Pinned notes under the banner and on the sides.
  const note = (w, h, pos, rz, seed) => {
    let g = new THREE.PlaneGeometry(w, h, 2, 2);
    g = deform(g, (v) => { v.z = jitter(v, 0.006, seed); if (v.y < -h * 0.3 && v.x > w * 0.2) v.z -= 0.02; });
    const col = COL.paper[seed % COL.paper.length];
    g = paint(g, (c) => (Math.abs(c.y) < h * 0.3 && Math.abs(c.x) < w * 0.35 && jitter(c, 1, seed) > -0.3 ? tone(col, 0.82) : col));
    S.push(place(g, pos, [0, Math.PI, rz]));
    S.push(place(blob(0.022, 0.022, 0.015, COL.pin, { w: 5, h: 3 }), [pos[0] + Math.sin(rz) * h * 0.4, pos[1] + h * 0.4, pos[2] - 0.012]));
  };
  note(0.26, 0.3, [-0.2, 1.05, -0.108], 0.08, 1);
  note(0.22, 0.26, [0.19, 1.0, -0.108], -0.12, 2);
  note(0.2, 0.22, [0.28, 2.2, -0.2], 0.1, 3);
  // Lashings holding the backboard.
  for (const s of [-1, 1]) S.push(lashing(0.1, 0.1, 2, [s * 0.4, 1.0, 0.04]));
  return o;
}

// ------------------------------------------------------------ flagpole
export const FLAG_ATTACH = { y0: 7.35, y1: 8.8, r: 0.07 };

/** Flagpole (the cloth is animated in fx.js). Fits r 0.3 at ground. */
export function buildFlagpole() {
  const o = out();
  const S = o.std;
  const H = 9.1;
  let pole = new THREE.CylinderGeometry(0.06, 0.11, H, 7, 4);
  pole.translate(0, H / 2, 0);
  pole = deform(pole, (v) => { const k = v.y / H; v.x += Math.sin(k * 3) * 0.02 + jitter(v, 0.006, 2); v.z += jitter(v, 0.006, 3); });
  pole = paint(pole, (c, n) => (jitter(c, 1, 5) > 0.35 ? tone(COL.log[2], 1.08) : COL.log[2]));
  S.push(pole);
  // Finial.
  S.push(place(blob(0.1, 0.1, 0.1, '#e0b03a', { w: 6, h: 4 }), [0.0, H + 0.05, 0]));
  S.push(place(spike(0.05, 0.2, '#e0b03a', '#f6d46a', 5), [0, H + 0.12, 0]));
  // Base: tapered wooden block + stones + lashings.
  let base = new THREE.CylinderGeometry(0.17, 0.22, 0.5, 4, 1);
  base.rotateY(Math.PI / 4);
  base = paint(base, (c, n) => (n.y > 0.5 ? COL.logEnd : COL.log[1]));
  S.push(place(base, [0, 0.25, 0]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    S.push(place(rockGeometry({ radius: 0.1, seed: 100 + k, squash: 0.6, colors: COL.stone, moss: k % 2 ? '#6f9a4a' : null }), [Math.cos(a) * 0.21, 0.02, Math.sin(a) * 0.21]));
  }
  S.push(lashing(0.12, 0.12, 3, [0, 0.55, 0]));
  // Halyard rope from the top pulley down to a cleat.
  S.push(place(limb(0.008, 0.008, H - 1.3, COL.rope, 3), [0.1, 1.2, 0]));
  S.push(box(0.05, 0.16, 0.05, COL.log[3], [0.1, 1.2, 0]));
  S.push(box(0.04, 0.04, 0.2, COL.log[3], [0.12, 1.25, 0]));
  S.push(lashing(0.1, 0.06, 2, [0, FLAG_ATTACH.y0 - 0.05, 0]));
  S.push(lashing(0.08, 0.06, 2, [0, FLAG_ATTACH.y1 + 0.02, 0]));
  return o;
}

// ------------------------------------------------------------ campfire
/** Campfire stones, logs, embers, spit with meat and two log seats. */
export function buildCampfire() {
  const o = out();
  const rng = makeRng(0xf12e);
  const S = o.std;
  // Ash bed.
  let ash = new THREE.CircleGeometry(0.72, 9);
  ash = deform(ash, (v) => { v.z += jitter(v, 0.015, 3); });
  S.push(part(ash, (c) => (jitter(c, 1, 4) > 0.4 ? '#3b3533' : COL.ash), [0, 0.02, 0], [-Math.PI / 2, 0, 0]));
  // Stone ring.
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.15;
    const r = 0.86 + rng() * 0.05;
    const s = 0.2 + rng() * 0.08;
    const g = rockGeometry({ radius: s, seed: 200 + k, squash: 0.62, colors: COL.stone });
    // Soot on the inner faces.
    const g2 = paint(g, (c, nn) => (nn.x * -Math.cos(a) + nn.z * -Math.sin(a) > 0.55 ? '#5a5258' : COL.stone[k % 4]));
    S.push(place(g2, [Math.cos(a) * r, 0.05, Math.sin(a) * r], [0, rng() * 6, 0]));
  }
  // Two crossed flat logs + a tepee of leaning sticks with charred tops.
  S.push(log(1.1, 0.08, [0, 0.1, 0], 'x', { body: COL.log[1], seed: 301, charred: 0.3, rot: [0, 0.5, 0] }));
  S.push(log(1.1, 0.08, [0, 0.17, 0], 'x', { body: COL.log[3], seed: 302, charred: 0.3, rot: [0, -0.7, 0] }));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.2;
    const len = 0.85;
    const g = log(len, 0.05, [0, 0, 0], 'y', { body: COL.log[k % 4], seed: 310 + k, ends: [false, false] });
    // Char the upper third.
    const gc = paint(g, (c, nn) => (c.y > len * 0.12 ? COL.char : Math.abs(nn.y) > 0.8 ? COL.logEnd : tone(COL.log[k % 4], nn.x > 0 ? 1.08 : 0.9)));
    const lean = 0.55;
    const bx = Math.cos(a) * 0.36, bz = Math.sin(a) * 0.36;
    // Rotate: lean toward center.
    S.push(place(gc, [bx * 0.62, 0.36, bz * 0.62], [-lean * Math.sin(a), 0, lean * Math.cos(a)]));
  }
  // Glowing embers.
  for (let k = 0; k < 9; k++) {
    const a = rng() * 6.28, r = rng() * 0.42;
    o.glow.push(place(blob(0.07 + rng() * 0.05, 0.035, 0.06, rng() < 0.5 ? '#ff6a2a' : '#e8402a', { w: 5, h: 3 }), [Math.cos(a) * r, 0.04, Math.sin(a) * r]));
  }
  // Roasting spit: two forked sticks and a skewer with a meat chunk.
  for (const s of [-1, 1]) {
    S.push(place(limb(0.035, 0.03, 1.05, COL.log[0], 5), [s * 1.3, 0, 0.0]));
    S.push(place(limb(0.025, 0.02, 0.22, COL.log[0], 4), [s * 1.3, 0.9, 0], [0, 0, s * 0.5]));
    S.push(place(limb(0.025, 0.02, 0.22, COL.log[0], 4), [s * 1.3, 0.9, 0], [0, 0, -s * 0.5]));
  }
  S.push(place(limb(0.018, 0.018, 2.9, tone(COL.log[2], 1.1), 4), [-1.45, 1.0, 0], [0, 0, -Math.PI / 2]));
  {
    let m = new THREE.IcosahedronGeometry(0.2, 1);
    m = deform(m, (v) => { v.x *= 1.5; v.y *= 0.85; v.x += jitter(v, 0.03, 8); v.z += jitter(v, 0.03, 9); });
    S.push(part(m, (c, nn) => (nn.y < -0.5 ? '#5a2a18' : jitter(c, 1, 3) > 0.5 ? '#c07a3a' : '#8e3e22'), [0.05, 1.0, 0]));
    S.push(place(blob(0.04, 0.04, 0.04, COL.bone, { w: 5, h: 4 }), [0.4, 1.0, 0]));
  }
  // Log seats around the fire (low, within 3 m).
  for (const [a, len] of [[Math.PI * 0.95, 1.6], [Math.PI * 0.05 + 0.2, 1.5], [Math.PI * 1.55, 1.3]]) {
    const d = 2.25;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    S.push(log(len, 0.22, [x, 0.2, z], 'x', { body: rng.pick(COL.log), seed: rng.int(1, 9999), rot: [0, -a + Math.PI / 2, 0] }));
    // little wedges keeping it from rolling
    for (const s of [-1, 1]) {
      const tx = -Math.sin(a) * s * len * 0.35, tz = Math.cos(a) * s * len * 0.35;
      S.push(place(rockGeometry({ radius: 0.1, seed: 400 + s, squash: 0.6, colors: COL.stone }), [x + tx + Math.cos(a) * 0.24, 0.02, z + tz + Math.sin(a) * 0.24]));
    }
  }
  // Small firewood pile beside a seat.
  for (let k = 0; k < 5; k++) {
    const row = k < 3 ? 0 : 1;
    const x = -0.9 + (row ? (k - 3) * 0.16 + 0.08 : k * 0.16);
    S.push(log(0.6, 0.075, [x, 0.075 + row * 0.13, 0], 'z', { body: rng.pick(COL.log), seed: 500 + k }));
    S[S.length - 1] = place(S[S.length - 1], [Math.cos(Math.PI * 1.25) * 2.4, 0, Math.sin(Math.PI * 1.25) * 2.4 - 0.3], [0, 0.6, 0]);
  }
  return o;
}
