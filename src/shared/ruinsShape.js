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
  return { pillars, arch, walls, fallen };
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
  return { circles, boxes };
}

/** Relic spot: the altar top center (stand it at y = r.y + RUINS_ALTAR_TOP). */
export function ruinsCenter(r) {
  return toWorld(r, 0, 0);
}
