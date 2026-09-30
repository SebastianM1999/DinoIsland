// Simple 2D collision against static world colliders (circles + oriented boxes).
// Used by the local player controller and by server-side dinosaur movement.

const CELL = 8;
const REACH = 2; // largest mover radius the grid lookup covers

/** Circles near (x, z): a lazily built grid, so movers only test their neighbourhood. */
function circlesNear(colliders, x, z) {
  let grid = colliders._grid;
  if (!grid || grid.n !== colliders.circles.length) {
    grid = colliders._grid = { n: colliders.circles.length, cells: new Map() };
    for (const c of colliders.circles) {
      const e = c.r + REACH;
      for (let ix = Math.floor((c.x - e) / CELL); ix <= Math.floor((c.x + e) / CELL); ix++) {
        for (let iz = Math.floor((c.z - e) / CELL); iz <= Math.floor((c.z + e) / CELL); iz++) {
          const key = ix * 4096 + iz;
          if (!grid.cells.has(key)) grid.cells.set(key, []);
          grid.cells.get(key).push(c);
        }
      }
    }
  }
  return grid.cells.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || [];
}

/** Resolver passes: each pass pushes out of every overlapping collider in turn. */
const PASSES = 4;
/** Overlap below this counts as touching, not penetrating (keeps resting contacts stable). */
const SKIN = 1e-3;

/** Overlap depth of circle (x, z, r) with one circle collider (<= 0: apart). */
function circleDepth(c, x, z, r) {
  const dx = x - c.x, dz = z - c.z, min = r + c.r;
  if (dx > min || dx < -min || dz > min || dz < -min) return -1;
  return min - Math.sqrt(dx * dx + dz * dz);
}

/** Overlap depth of circle (x, z, r) with one oriented box (<= 0: apart). */
function boxDepth(b, x, z, r) {
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * cos + dz * sin, lz = -dx * sin + dz * cos;
  const ex = Math.abs(lx) - b.hw, ez = Math.abs(lz) - b.hd;
  if (ex <= 0 && ez <= 0) return r - Math.max(ex, ez);          // centre inside
  return r - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
}

const inSpan = (c, y0, y1) => c.bottom === undefined || !(y1 < c.bottom || y0 > c.top);

/**
 * Deepest overlap of the circle (x, z, r) with any collider (0 when free).
 * Same height rules as resolveCircle.
 */
export function penetration(x, z, r, colliders, y0 = -Infinity, y1 = Infinity) {
  let worst = 0;
  const circles = r <= REACH ? circlesNear(colliders, x, z) : colliders.circles;
  for (const c of circles) {
    if (!inSpan(c, y0, y1)) continue;
    const d = circleDepth(c, x, z, r);
    if (d > worst) worst = d;
  }
  for (const b of colliders.boxes) {
    const d = boxDepth(b, x, z, r);
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Push a circle (x, z, r) out of all colliders. Returns {x, z, hit}.
 * [y0, y1] is the mover's height span: circle colliders with a bottom/top
 * (tree trunk slices, rocks) only count where they overlap it.
 *
 * Several passes, so a push out of one collider into its neighbour gets
 * corrected. When the mover is wedged between two circles (a gap narrower
 * than the body), the result is the point touching both that is nearest to
 * the input – the same spot every frame, so a player walking into the gap
 * stops there instead of ping-ponging between the trunks.
 * @param {{circles:Array, boxes:Array}} colliders
 */
export function resolveCircle(x, z, r, colliders, out = { x: 0, z: 0, hit: false }, y0 = -Infinity, y1 = Infinity) {
  const x0 = x, z0 = z;
  let hit = false, clean = true;
  for (let pass = 0; pass < PASSES; pass++) {
    clean = true;
    const circles = r <= REACH ? circlesNear(colliders, x, z) : colliders.circles;
    for (const c of circles) {
      if (!inSpan(c, y0, y1)) continue;
      const dx = x - c.x, dz = z - c.z;
      const min = r + c.r;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (min - d <= SKIN * 0.5) continue;
      clean = false;
      hit = true;
      if (d < 1e-6) { x += min; continue; }        // dead centre: any direction will do
      const k = (min - d) / d;
      x += dx * k;
      z += dz * k;
    }
    for (const b of colliders.boxes) {
      const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
      const dx = x - b.x, dz = z - b.z;
      // into box space
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const cx = Math.max(-b.hw, Math.min(b.hw, lx));
      const cz = Math.max(-b.hd, Math.min(b.hd, lz));
      const ex = lx - cx, ez = lz - cz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      let nx, nz, push;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = ex / d; nz = ez / d; push = r - d;
      } else {
        // centre inside the box: push out along the shallowest axis
        const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
        if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; }
        else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
      }
      if (push <= SKIN * 0.5) continue;
      clean = false;
      hit = true;
      // back to world space
      x += (nx * cos - nz * sin) * push;
      z += (nx * sin + nz * cos) * push;
    }
    if (clean) break;
  }
  if (!clean && penetration(x, z, r, colliders, y0, y1) > SKIN) {
    const wedge = wedgePoint(x0, z0, r, colliders, y0, y1);
    if (wedge) { x = wedge.x; z = wedge.z; }
  }
  out.x = x; out.z = z; out.hit = hit;
  return out;
}

/**
 * Nearest free point to (x, z) that touches two overlapping circle colliders
 * at once (the notch between two trunks), or null.
 */
function wedgePoint(x, z, r, colliders, y0, y1) {
  const near = [];
  for (const c of r <= REACH ? circlesNear(colliders, x, z) : colliders.circles) {
    if (inSpan(c, y0, y1) && circleDepth(c, x, z, r + 0.5) > 0) near.push(c);
  }
  let best = null, bd = Infinity;
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i], b = near[j];
      const ra = a.r + r + SKIN * 0.25, rb = b.r + r + SKIN * 0.25;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 1e-6 || d > ra + rb || d < Math.abs(ra - rb)) continue;
      const u = (ra * ra - rb * rb + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, ra * ra - u * u));
      const mx = a.x + dx * u / d, mz = a.z + dz * u / d;
      for (const s of [1, -1]) {
        const px = mx - s * dz * h / d, pz = mz + s * dx * h / d;
        const q = (px - x) ** 2 + (pz - z) ** 2;
        if (q >= bd || penetration(px, pz, r, colliders, y0, y1) > SKIN) continue;
        bd = q; best = { x: px, z: pz };
      }
    }
  }
  return best;
}

/**
 * Segment [a,b] vs the static colliders as upright solids (circle -> cylinder,
 * box -> prism) from their `bottom` (default: ground) up to their `top`
 * (default: ground + 3 m). Rocks are skipped: they are ground (layout.groundAt).
 * Returns the fraction t in [0,1] of the first contact or -1.
 * @param {(x:number, z:number) => number} groundAt
 */
export function segmentColliders(ax, ay, az, bx, by, bz, colliders, groundAt) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const a = dx * dx + dz * dz;
  let best = -1;
  // [t0,t1] is where the segment is inside the footprint; test it against the height span
  const consider = (t0, t1, x, z, top, bottom) => {
    if (t1 < 0 || t0 > 1 || t0 > t1) return;
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    if (best >= 0 && t0 >= best) return;
    const ground = bottom ?? groundAt(x, z) - 0.5;
    top ??= ground + 3.5;
    const y0 = ay + dy * t0, y1 = ay + dy * t1;
    let t = -1;
    if (y0 <= top && y0 >= ground) t = t0;
    else if (y0 > top && y1 <= top) t = dy ? (top - ay) / dy : t0;      // drops onto the top
    else if (y0 < ground && y1 >= ground) t = dy ? (ground - ay) / dy : t0;
    if (t >= 0 && (best < 0 || t < best)) best = t;
  };
  const ylo = Math.min(ay, by), yhi = Math.max(ay, by);
  for (const c of colliders.circles) {
    if (c.kind === 'rock' || (c.bottom !== undefined && (yhi < c.bottom || ylo > c.top))) continue;
    const fx = ax - c.x, fz = az - c.z;
    const cc = fx * fx + fz * fz - c.r * c.r;
    if (a < 1e-9) { if (cc <= 0) consider(0, 1, c.x, c.z, c.top, c.bottom); continue; }
    const b = fx * dx + fz * dz;
    const disc = b * b - a * cc;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    consider((-b - sq) / a, (-b + sq) / a, c.x, c.z, c.top, c.bottom);
  }
  for (const bx2 of colliders.boxes) {
    const cos = Math.cos(bx2.rot), sin = Math.sin(bx2.rot);
    const lx = (ax - bx2.x) * cos + (az - bx2.z) * sin, lz = -(ax - bx2.x) * sin + (az - bx2.z) * cos;
    const ux = dx * cos + dz * sin, uz = -dx * sin + dz * cos;
    let t0 = 0, t1 = 1;
    for (const [p, u, h] of [[lx, ux, bx2.hw], [lz, uz, bx2.hd]]) {
      if (Math.abs(u) < 1e-9) { if (p < -h || p > h) { t0 = 2; break; } continue; }
      let e0 = (-h - p) / u, e1 = (h - p) / u;
      if (e0 > e1) [e0, e1] = [e1, e0];
      t0 = Math.max(t0, e0); t1 = Math.min(t1, e1);
    }
    consider(t0, t1, bx2.x, bx2.z, bx2.top);
  }
  return best;
}

/** Ray (origin o, unit dir d) vs sphere; returns distance or -1. */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc;
  if (t0 >= 0) return t0;
  const t1 = tca + thc;
  return t1 >= 0 ? 0 : -1;
}

/** Segment [a,b] vs sphere: returns fraction t in [0,1] of first contact or -1. */
export function segmentSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return -1;
  const t = raySphere(ax, ay, az, dx / len, dy / len, dz / len, cx, cy, cz, r);
  if (t < 0 || t > len) return -1;
  return t / len;
}
