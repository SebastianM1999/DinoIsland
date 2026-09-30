// Cave site: a big rocky dome with a hollow inside and one arched entrance,
// set into the flank of a hill: rock shoulders, a back ridge and two
// buttresses beside the mouth merge the dome with the rising slope, a brow
// overhangs the entrance, and rubble/boulders lie scattered around the mouth.
// Shared by server (colliders, relic spot) and client (models/props/cave.js).
//
// Frame (see siteFrame.js): c = { x, z, y, rot, seed }, group.rotation.y = rot.
// The entrance faces local -z, i.e. world direction (-sin rot, -cos rot).
// The generator flattens the terrain at the cave spot (inside + in front);
// behind and beside the cave the terrain may rise and bury the rock.

import { makeRng } from './rng.js';
import { toWorld } from './siteFrame.js';

export const CAVE = {
  radius: 7.2,       // outer footprint radius of the rock dome at ground level
  inner: 5.0,        // walkable interior radius (wall collider inner edge)
  height: 5.5,       // interior ceiling height
  top: 7.0,          // outer dome height
  mouth: 2.5,        // clear half-width of the entrance (arch is ~2.6 wide at the floor)
  mouthHeight: 4.6,  // arch apex
  wallR: 1.0,        // radius of the wall collider circles
  base: -2.6,        // the rock shell reaches this far below c.y (meets lower ground)
};

/** Half-width of the walkway kept free in front of the mouth (local |x|). */
export const CAVE_WALKWAY = 2.9;

/**
 * Extra rock masses (local ellipsoids, heights above c.y) that merge the
 * dome into the hillside: back ridge, shoulders, mouth buttresses and the
 * brow over the entrance. Deterministic from the seed. The client unions them
 * into the rock SDF; masses touching the ground (y - ry < 0) get colliders.
 * @returns {{x:number,y:number,z:number,rx:number,ry:number,rz:number}[]}
 */
export function caveMasses(seed = 1) {
  const rng = makeRng(((seed | 0) * 48271 + 101) >>> 0);
  const j = (a) => (rng() - 0.5) * 2 * a;
  const out = [];
  out.push({ x: j(0.6), y: 1.0 + j(0.3), z: 5.6 + j(0.4), rx: 7.4 + j(0.4), ry: 7.2 + j(0.5), rz: 4.8 + j(0.3) });       // back ridge
  for (const s of [-1, 1]) {
    out.push({ x: s * (6.8 + j(0.3)), y: 0.4 + j(0.3), z: 0.8 + j(0.5), rx: 3.4 + j(0.3), ry: 5.0 + j(0.6), rz: 4.3 + j(0.3) }); // shoulder
    out.push({ x: s * (5.6 + j(0.3)), y: 0.0 + j(0.3), z: 6.2 + j(0.4), rx: 3.5 + j(0.3), ry: 4.2 + j(0.5), rz: 3.4 + j(0.3) }); // rear shoulder
    out.push({ x: s * (4.9 + j(0.15)), y: -0.3 + j(0.2), z: -6.9 + j(0.25), rx: 1.9 + j(0.15), ry: 3.4 + j(0.4), rz: 2.1 + j(0.15) }); // mouth buttress
  }
  out.push({ x: j(0.3), y: 5.2 + j(0.2), z: -5.4 + j(0.2), rx: 4.9 + j(0.3), ry: 2.3 + j(0.15), rz: 2.5 + j(0.2) });      // brow (no collider)
  return out;
}

/** Ground footprint of an ellipsoid mass as circles { x, z, r } (local), or []. */
function massFootprint(m) {
  if (m.y - m.ry >= 0) return [];
  const k = Math.sqrt(Math.max(0, 1 - (m.y / m.ry) ** 2));
  const a = m.rx * k, b = m.rz * k;
  const out = [];
  if (a >= b) {
    const n = Math.max(1, Math.ceil((a - b) / (b * 0.8)) + 1);
    for (let i = 0; i < n; i++) out.push({ x: m.x + (n === 1 ? 0 : -(a - b) + (2 * (a - b) * i) / (n - 1)), z: m.z, r: b * 0.92 });
  } else {
    const n = Math.max(1, Math.ceil((b - a) / (a * 0.8)) + 1);
    for (let i = 0; i < n; i++) out.push({ x: m.x, z: m.z + (n === 1 ? 0 : -(b - a) + (2 * (b - a) * i) / (n - 1)), r: a * 0.92 });
  }
  return out;
}

/**
 * Wall colliders: a ring of overlapping circles around the interior with a
 * gap at the entrance, two cheek circles each side of the entrance passage,
 * and circles covering the ground footprint of the hillside rock masses.
 * Circles: { x, z, r, top, kind: 'cave' }.
 */
export function caveColliders(c) {
  const out = [];
  const y = c.y ?? 0;
  const R = CAVE.inner + CAVE.wallR;            // ring center radius
  const top = y + CAVE.top;
  const n = 30;
  const push = (lx, lz, r = CAVE.wallR, t = top) => {
    const p = toWorld(c, lx, lz);
    out.push({ x: p.x, z: p.z, r, top: t, kind: 'cave' });
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;             // 0 = entrance center (local -z)
    const lx = Math.sin(a) * R, lz = -Math.cos(a) * R;
    if (lz < 0 && Math.abs(lx) < CAVE.mouth + CAVE.wallR) continue;
    push(lx, lz);
  }
  // entrance passage cheeks (the wall is thick there)
  const cx = CAVE.mouth + CAVE.wallR;
  for (const s of [-1, 1]) {
    push(s * cx, -5.6);
    push(s * (cx + 0.3), -6.6);
  }
  // hillside rock masses (only outside the interior ring matters)
  // (the interior is carved out of them, so circles reaching into it are
  // shrunk to the part outside the wall ring)
  for (const m of caveMasses(c.seed)) {
    for (const f of massFootprint(m)) {
      const d = Math.hypot(f.x, f.z);
      if (d + f.r <= R + CAVE.wallR) continue;
      let { x, z, r } = f;
      if (d - r < R) {
        r = (d + r - R) / 2;
        x = (f.x / d) * (R + r); z = (f.z / d) * (R + r);
      }
      if (r >= 0.4) push(x, z, r, y + m.y + m.ry);
    }
  }
  return out;
}

/**
 * Rubble and boulders scattered around the entrance, in the cave's local
 * frame: [{ x, z, r, h }] (h = height above c.y). Deterministic from seed.
 * They stay off the walkway (|x| > CAVE_WALKWAY in front of the mouth).
 */
export function caveRockPilesLocal(seed = 1) {
  const rng = makeRng(((seed | 0) * 69621 + 7) >>> 0);
  const out = [];
  const walls = caveColliders({ x: 0, z: 0, y: 0, rot: 0, seed });   // local frame
  // either overlap a neighbour clearly or leave a gap a mover fits through
  const spaced = (x, z, r, o, overlap) => {
    const g = Math.hypot(o.x - x, o.z - z) - o.r - r;
    return g >= 1.1 || g <= -overlap * Math.min(r, o.r);
  };
  const fits = (x, z, r) => {
    if (z < -4 && Math.abs(x) - r < CAVE_WALKWAY) return false;
    for (const o of out) if (!spaced(x, z, r, o, 0.2) || Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.8) return false;
    for (const o of walls) if (!spaced(x, z, r, o, 0.3)) return false;
    return true;
  };
  // big boulders at the foot of the buttresses, then smaller rubble further out
  const plan = [
    { n: 5, rMin: 0.85, rMax: 1.45, xMin: 3.4, xMax: 8.5, zMin: -12.0, zMax: -8.6 },
    { n: 9, rMin: 0.35, rMax: 0.75, xMin: 3.1, xMax: 10.0, zMin: -13.5, zMax: -8.0 },
  ];
  let side = rng() < 0.5 ? -1 : 1;
  for (const p of plan) {
    for (let k = 0, tries = 0; k < p.n && tries < 80; tries++) {
      side = -side;
      const r = p.rMin + (p.rMax - p.rMin) * rng() ** 1.4;
      const x = side * (p.xMin + (p.xMax - p.xMin) * rng());
      const z = p.zMin + (p.zMax - p.zMin) * rng();
      if (!fits(x, z, r)) continue;
      out.push({ x, z, r, h: r * (0.75 + rng() * 0.35) });
      k++;
    }
  }
  return out;
}

/** caveRockPilesLocal in world space: [{ x, z, r, h }] (h above c.y). */
export function caveRockPiles(c) {
  return caveRockPilesLocal(c.seed).map((p) => {
    const w = toWorld(c, p.x, p.z);
    return { x: w.x, z: w.z, r: p.r, h: p.h };
  });
}

/** A point deep inside the cave (relic spot), opposite the entrance. */
export function caveInterior(c) {
  return toWorld(c, 0, 2.6);
}

/** A point on the ground just outside the entrance. */
export function caveMouth(c) {
  return toWorld(c, 0, -(CAVE.radius + 1.6));
}
