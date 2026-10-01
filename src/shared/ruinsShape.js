// Ruins site: an overgrown stone plaza (~14 m across) with a ring of pillars
// (some broken), a partial arch at the entrance, two low walls, fallen column
// drums and a stepped altar in the middle where the relic sits.
// Shared by server (colliders, relic spot) and client (models/props/ruins.js),
// both use ruinsLayout() so the hitboxes match the stones exactly.
//
// Frame (see siteFrame.js): r = { x, z, y, rot, seed }, group.rotation.y = rot.
// The arch (entrance) is at local -z. Heights are above r.y.

import { makeRng } from './rng.js';
import { toWorld, siteBox } from './siteFrame.js';

/** Height of the altar top above r.y (the relic stands on it). */
export const RUINS_ALTAR_TOP = 1.1;
/** Plaza radius. */
export const RUINS_RADIUS = 7;

/**
 * Local layout (deterministic from r.seed):
 *  pillars: [{ x, z, h, state: 'full'|'broken'|'stump', r }]
 *  arch:    { x, z, span, h, broken } – two posts at x ± span/2
 *  walls:   [{ x, z, len, h, yaw }]  (yaw like THREE rotation.y, long axis = local x)
 *  fallen:  [{ x, z, len, r, yaw, piece? }] column drums lying on the plaza
 *           (piece: broken off the snapped pillar next to it)
 *  rubble:  [{ x, z, r, h }]         half-buried heaps of tumbled blocks (h above r.y)
 *  slabs:   [{ x, z, len, h, yaw, tilt }] collapsed wall sections, leaning and
 *           half-buried (h = top above r.y, long axis = local x like walls)
 *  roots:   [{ x, z, yaw, len }]     big jungle roots creeping in over the plaza (flat)
 *  blocks:  [{ x, z, w, h, d, y, yaw, tilt }] loose blocks lying flat (y = center height)
 * Rubble, slabs and pillar pieces keep >= RUINS_MIN_GAP to every other solid
 * piece, so no player-trapping slots appear. Every stone is solid and its
 * top is ground (`stand`): low ones you step onto, the rest you jump onto.
 */
export function ruinsLayout(r) {
  const rng = makeRng(((r.seed ?? 1) * 7919 + 17) >>> 0);
  const pillars = [];
  for (let k = 0; k < 8; k++) {
    const phi = ((22.5 + 45 * k) * Math.PI) / 180;       // 0 = local +z (back)
    if (Math.cos(phi) < -0.85) continue;                   // entrance: the arch stands there
    const roll = rng();
    const state = roll < 0.35 ? 'full' : roll < 0.8 ? 'broken' : 'stump';
    const h = state === 'full' ? rng.range(3.6, 4.2) : state === 'broken' ? rng.range(1.3, 2.7) : rng.range(0.45, 0.7);
    pillars.push({ x: Math.sin(phi) * 5.6, z: Math.cos(phi) * 5.6, h, state, r: 0.42 });
  }
  const arch = { x: 0, z: -6.0, span: 3.8, h: 3.7, broken: rng() < 0.5 ? -1 : 1 };
  const walls = [
    { phi: (45 + rng.range(-8, 8)) * Math.PI / 180, len: rng.range(3.2, 4.0), h: rng.range(1.3, 1.9) },
    { phi: (-90 + rng.range(-10, 10)) * Math.PI / 180, len: rng.range(2.6, 3.4), h: rng.range(0.9, 1.4) },
  ].map((w) => ({ x: Math.sin(w.phi) * 6.9, z: Math.cos(w.phi) * 6.9, len: w.len, h: w.h, yaw: w.phi }));
  const fallen = [
    { x: 2.6 + rng.range(-0.3, 0.3), z: -2.5, len: 2.2, r: 0.4, yaw: rng.range(0.3, 0.9) },
    { x: -3.0, z: 2.2 + rng.range(-0.3, 0.3), len: 1.6, r: 0.4, yaw: rng.range(-1.2, -0.5) },
  ];
  // ---- solid pieces so far, for spacing the new ones (circles + segments)
  const solids = [];
  for (const p of pillars) solids.push({ x: p.x, z: p.z, r: 0.6 });
  for (const sgn of [-1, 1]) solids.push({ x: arch.x + sgn * arch.span / 2, z: arch.z, r: 0.62 });
  for (const w of walls) solids.push({ x: w.x, z: w.z, r: 0.4, hx: Math.cos(w.yaw) * w.len / 2, hz: -Math.sin(w.yaw) * w.len / 2 });
  for (const f of fallen) solids.push({ x: f.x, z: f.z, r: f.r, hx: Math.cos(f.yaw) * f.len / 2, hz: -Math.sin(f.yaw) * f.len / 2 });
  solids.push({ x: 0, z: 0, r: 1.3 });
  const entrance = (x, z, pad) => z < -2 && Math.abs(x) < 2.6 + pad;   // walkway through the arch

  const rubble = [];
  for (let tries = 0; tries < 60 && rubble.length < 5; tries++) {
    const phi = rng() * Math.PI * 2;
    if (Math.cos(phi) < -0.55) continue;                                // not in front of the arch
    const rad = rng.range(7.4, 9.8);
    const r = rng.range(0.9, 1.5), h = rng.range(0.5, 1.1);
    const x = Math.sin(phi) * rad, z = Math.cos(phi) * rad;
    if (entrance(x, z, r) || gap(x, z, r) < RUINS_MIN_GAP) continue;
    rubble.push({ x, z, r, h });
    solids.push({ x, z, r });
  }
  // low heaps (no collider) beside snapped pillars
  for (const p of pillars) {
    if (p.state !== 'broken' || rubble.length >= 8) continue;
    const a = Math.atan2(p.x, p.z) + rng.range(-0.5, 0.5);
    const x = p.x - Math.sin(a) * 1.3, z = p.z - Math.cos(a) * 1.3;
    if (entrance(x, z, 0.6)) continue;
    rubble.push({ x, z, r: 0.6, h: 0.35 });
  }
  const slabs = [];
  for (let tries = 0; tries < 40 && slabs.length < 2; tries++) {
    const phi = rng() * Math.PI * 2;
    if (Math.cos(phi) < -0.3) continue;
    const rad = rng.range(8.0, 9.6), len = rng.range(2.2, 3.2);
    const yaw = phi + rng.range(-0.35, 0.35);
    const x = Math.sin(phi) * rad, z = Math.cos(phi) * rad;
    const hx = Math.cos(yaw) * len / 2, hz = -Math.sin(yaw) * len / 2;
    if (gap(x, z, 0.45, hx, hz) < RUINS_MIN_GAP) continue;
    slabs.push({ x, z, len, h: rng.range(0.9, 1.5), yaw, tilt: rng.range(0.25, 0.5) * (rng() < 0.5 ? -1 : 1) });
    solids.push({ x, z, r: 0.45, hx, hz });
  }
  const roots = [];
  for (let k = 0; k < 5; k++) {
    const phi = (k / 5) * Math.PI * 2 + rng.range(-0.4, 0.4);
    if (Math.cos(phi) < -0.8) continue;
    roots.push({ x: Math.sin(phi) * 10.5, z: Math.cos(phi) * 10.5, yaw: phi + Math.PI + rng.range(-0.5, 0.5), len: rng.range(4.5, 7) });
  }
  // (drawn last, so the pieces above keep their places)
  // drums broken off the snapped pillars: lying outward from the pillar's foot
  for (const p of pillars) {
    if (p.state !== 'broken') continue;
    const own = solids.find((o) => o.x === p.x && o.z === p.z);
    const len = rng.range(0.8, 1.4);
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.atan2(p.x, p.z) + rng.range(-1.4, 1.4);
      const d = 0.62 + len / 2;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d, yaw = a - Math.PI / 2;
      const hx = Math.cos(yaw) * len / 2, hz = -Math.sin(yaw) * len / 2;
      if (entrance(x, z, 0.5) || gap(x, z, p.r, hx, hz, own) < RUINS_MIN_GAP) continue;
      fallen.push({ x, z, len, r: p.r, yaw, piece: true });
      solids.push({ x, z, r: p.r, hx, hz });
      break;
    }
  }
  // loose blocks lying flat (low: you step onto them): voussoirs that fell
  // from the broken half of the arch, tumbled blocks inside the walls
  const blocks = [];
  for (let k = 0; k < 3; k++) {
    const x = arch.x + arch.broken * (1.6 + k * 0.7 + rng() * 0.3), z = arch.z + 0.9 + rng() * 1.2;
    blocks.push({ x, z, w: 0.9, h: 0.58, d: 0.62, y: 0.2, yaw: rng() * Math.PI * 2, tilt: rng.range(-0.08, 0.08) });
  }
  for (const w of walls) {
    for (let k = 0; k < 2; k++) {
      const u = (rng() - 0.5) * w.len;
      blocks.push({ x: w.x + Math.cos(w.yaw) * u - Math.sin(w.yaw) * 1.0, z: w.z - Math.sin(w.yaw) * u - Math.cos(w.yaw) * 1.0,
        w: 0.8, h: 0.43, d: 0.7, y: 0.2, yaw: rng() * Math.PI * 2, tilt: rng.range(-0.08, 0.08) });
    }
  }
  return { pillars, arch, walls, fallen, rubble, slabs, roots, blocks };

  function gap(x, z, r, hx = 0, hz = 0, skip = null) {
    let g = Infinity;
    for (const o of solids) if (o !== skip) g = Math.min(g, segDist(x, z, hx, hz, o) - r - o.r);
    return g;
  }
}

/** Height of a wall's top course above r.y (whole 0.45 m courses). */
export const wallTop = (w) => Math.max(2, Math.round(w.h / 0.45)) * 0.45;

/**
 * Footprint of a collapsed wall section across its long axis (slab local z):
 * { z0, z1 } of the stones that show above ground, after the lean (see the
 * slab model: courses from -0.6 m up to tall, 0.7 m thick, tilted about x).
 */
export function slabSpan(sl) {
  const tall = sl.h / Math.cos(sl.tilt) + 0.6;
  const c = Math.cos(sl.tilt), s = Math.sin(sl.tilt);
  const yg = 0.6 / c;                       // where the face comes out of the ground
  let z0 = Infinity, z1 = -Infinity;
  for (const y of [yg, tall]) for (const zz of [-0.37, 0.37]) {
    const z = y * s + zz * c;
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return { z0, z1 };
}

/** Minimum free gap between two solid ruin pieces (player fits through). */
export const RUINS_MIN_GAP = 1.4;

/** Distance from segment (x,z)�(hx,hz) to piece o (circle or segment). */
function segDist(x, z, hx, hz, o) {
  const ohx = o.hx || 0, ohz = o.hz || 0;
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 4 - 1;
    const px = x + hx * t, pz = z + hz * t;
    const L = ohx * ohx + ohz * ohz;
    const u = L > 1e-9 ? Math.max(-1, Math.min(1, ((px - o.x) * ohx + (pz - o.z) * ohz) / L)) : 0;
    best = Math.min(best, Math.hypot(px - o.x - ohx * u, pz - o.z - ohz * u));
  }
  return best;
}

/**
 * Colliders, all `stand` (their tops are ground):
 * { circles: [{x, z, r, top, kind:'ruins', stand}], boxes: [{x, z, hw, hd, rot, top, kind, stand}] }.
 * Shapes follow the stones of models/props/ruins.js.
 */
export function ruinsColliders(r) {
  const y = r.y ?? 0;
  const L = ruinsLayout(r);
  const circles = [], boxes = [];
  const circle = (lx, lz, rad, top) => {
    const p = toWorld(r, lx, lz);
    circles.push({ x: p.x, z: p.z, r: rad, top: y + top, kind: 'ruins', stand: true });
  };
  const box = (lx, lz, hw, hd, top, yaw = 0) => boxes.push({ ...siteBox(r, lx, lz, hw, hd, y + top, yaw), kind: 'ruins', stand: true });
  // pillars: the shaft (r 0.42) on its 1.15 m square plinth
  for (const p of L.pillars) {
    circle(p.x, p.z, 0.55, p.h);
    box(p.x, p.z, 0.56, 0.56, 0.32);
  }
  // arch posts: stacked 0.95 m blocks
  for (const s of [-1, 1]) box(L.arch.x + s * L.arch.span / 2, L.arch.z, 0.5, 0.5, L.arch.h + 0.24);
  for (const w of L.walls) box(w.x, w.z, w.len / 2, 0.38, wallTop(w), w.yaw);
  // lying drums: axis at 0.92 r
  for (const f of L.fallen) box(f.x, f.z, f.len / 2, f.r * 0.95, f.r * 1.9, f.yaw);
  // the stepped altar: three steps you can walk up
  box(0, 0, 1.0, 1.0, 0.3);
  box(0, 0, 0.78, 0.78, 0.65);
  box(0, 0, 0.6, 0.6, RUINS_ALTAR_TOP);
  // rubble heaps: tumbled blocks around (low ring), the top block in the middle
  for (const p of L.rubble) {
    if (p.r > 0.8) {
      circle(p.x, p.z, p.r * 0.85, Math.min(p.h, 0.5));
      if (p.h > 0.5) circle(p.x, p.z, 0.42, p.h);
    } else {
      circle(p.x, p.z, 0.45, p.h);
    }
  }
  // collapsed wall sections: what shows above ground, after the lean
  for (const sl of L.slabs) {
    const { z0, z1 } = slabSpan(sl);
    const off = (z0 + z1) / 2;
    box(sl.x + Math.sin(sl.yaw) * off, sl.z + Math.cos(sl.yaw) * off, sl.len / 2, (z1 - z0) / 2, sl.h + 0.1, sl.yaw);
  }
  for (const b of L.blocks) box(b.x, b.z, b.w / 2, b.d / 2, b.y + b.h / 2, b.yaw);
  return { circles, boxes };
}

/** Relic spot: the altar top center (stand it at y = r.y + RUINS_ALTAR_TOP). */
export function ruinsCenter(r) {
  return toWorld(r, 0, 0);
}
