// Simple 2D collision against static world colliders (circles + oriented boxes).
// Used by the local player controller and by server-side dinosaur movement.

/**
 * Push a circle (x, z, r) out of all colliders. Returns {x, z, hit}.
 * @param {{circles:Array, boxes:Array}} colliders
 */
export function resolveCircle(x, z, r, colliders, out = { x: 0, z: 0, hit: false }) {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders.circles) {
      const dx = x - c.x, dz = z - c.z;
      const min = r + c.r;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = min - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
        hit = true;
      }
    }
    for (const b of colliders.boxes) {
      const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
      const dx = x - b.x, dz = z - b.z;
      // into box space
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const cx = Math.max(-b.hw, Math.min(b.hw, lx));
      const cz = Math.max(-b.hd, Math.min(b.hd, lz));
      let ex = lx - cx, ez = lz - cz;
      let d2 = ex * ex + ez * ez;
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
      // back to world space
      const wx = nx * cos - nz * sin;
      const wz = nx * sin + nz * cos;
      x += wx * push;
      z += wz * push;
      hit = true;
    }
  }
  out.x = x; out.z = z; out.hit = hit;
  return out;
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
