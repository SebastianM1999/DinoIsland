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
 *  fallen:  [{ x, z, len, r, yaw }]  column drums lying on the plaza
 *  rubble:  [{ x, z, r, h }]         half-buried heaps of tumbled blocks (h above r.y)
 *  slabs:   [{ x, z, len, h, yaw, tilt }] collapsed wall sections, leaning and
 *           half-buried (h = top above r.y, long axis = local x like walls)
 *  roots:   [{ x, z, yaw, len }]     big jungle roots creeping in over the plaza (flat)
 * Rubble and slabs keep >= RUINS_MIN_GAP to every other solid piece or
 * overlap nothing, so no player-trapping slots appear.
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
  const gap = (x, z, r, hx = 0, hz = 0) => {
    let g = Infinity;
    for (const o of solids) g = Math.min(g, segDist(x, z, hx, hz, o) - r - o.r);
    return g;
  };
  const entrance = (x, z, pad) => z < -2 && Math.abs(x) < 2.6 + pad;   // walkway through the arch

  const rubble = [];
  for (let tries = 0; tries < 60 && rubble.length < 6; tries++) {
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
  return { pillars, arch, walls, fallen, rubble, slabs, roots };
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

/** Colliders: { circles: [{x, z, r, top, kind:'ruins'}], boxes: [{x, z, hw, hd, rot, top}] }. */
export function ruinsColliders(r) {
  const y = r.y ?? 0;
  const L = ruinsLayout(r);
  const circles = [], boxes = [];
  const circle = (lx, lz, rad, top) => {
    const p = toWorld(r, lx, lz);
    circles.push({ x: p.x, z: p.z, r: rad, top: y + top, kind: 'ruins' });
  };
  for (const p of L.pillars) circle(p.x, p.z, 0.6, p.h);
  for (const s of [-1, 1]) circle(L.arch.x + s * L.arch.span / 2, L.arch.z, 0.62, L.arch.h + 0.6);
  for (const w of L.walls) boxes.push(siteBox(r, w.x, w.z, w.len / 2, 0.4, y + w.h, w.yaw));
  for (const f of L.fallen) boxes.push(siteBox(r, f.x, f.z, f.len / 2, f.r, y + f.r * 2, f.yaw));
  boxes.push(siteBox(r, 0, 0, 1.0, 1.0, y + RUINS_ALTAR_TOP));
  for (const p of L.rubble) if (p.h > 0.6) circle(p.x, p.z, p.r * 0.85, p.h);
  for (const sl of L.slabs) if (sl.h > 0.6) boxes.push(siteBox(r, sl.x, sl.z, sl.len / 2, 0.45, y + sl.h, sl.yaw));
  return { circles, boxes };
}

/** Relic spot: the altar top center (stand it at y = r.y + RUINS_ALTAR_TOP). */
export function ruinsCenter(r) {
  return toWorld(r, 0, 0);
}
