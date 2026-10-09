// Vertical rays through the Hollow Mountain's real mesh (client/world/caveVolumeMesh.js): the visible floors and roofs of a column,
// the shared truth the walk tests compare the sim's floor and ceiling with.

/** Vertical rays through the mesh: a grid of triangles per 2 m cell. */
export function rayIndex(vol) {
  const CELL = 2, tri = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const c of vol.chunks) {
    for (let i = 0; i < c.pos.length; i += 3) {
      x0 = Math.min(x0, c.pos[i]); x1 = Math.max(x1, c.pos[i]); z0 = Math.min(z0, c.pos[i + 2]); z1 = Math.max(z1, c.pos[i + 2]);
    }
  }
  const nx = Math.ceil((x1 - x0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
  const counts = new Uint32Array(nx * nz + 1);
  const T = [];   // flat: ax,az,ay, bx,bz,by, cx,cz,cy, nyDir
  for (const c of vol.chunks) {
    for (let t = 0; t < c.idx.length; t += 3) {
      const a = c.idx[t] * 3, b = c.idx[t + 1] * 3, d = c.idx[t + 2] * 3, p = c.pos;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      const ny = uz * vx - ux * vz;   // y of (u x v)
      if (Math.abs(ny) < 1e-9) continue;
      tri.push([p[a], p[a + 2], p[a + 1], p[b], p[b + 2], p[b + 1], p[d], p[d + 2], p[d + 1], ny > 0 ? 1 : -1]);
    }
  }
  const cellsOf = (t) => {
    const lx = Math.min(t[0], t[3], t[6]), hx = Math.max(t[0], t[3], t[6]), lz = Math.min(t[1], t[4], t[7]), hz = Math.max(t[1], t[4], t[7]);
    return [Math.floor((lx - x0) / CELL), Math.floor((hx - x0) / CELL), Math.floor((lz - z0) / CELL), Math.floor((hz - z0) / CELL)];
  };
  for (const t of tri) { const [i0, i1, j0, j1] = cellsOf(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * nx + i + 1]++; }
  for (let k = 0; k < nx * nz; k++) counts[k + 1] += counts[k];
  const fill = counts.slice(0, nx * nz), list = new Uint32Array(counts[nx * nz]);
  tri.forEach((t, id) => { const [i0, i1, j0, j1] = cellsOf(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) list[fill[j * nx + i]++] = id; });
  /** sorted crossings of the vertical line at (x, z): [{y, up}] (up: the face looks up, rock below it) */
  function hits(x, z) {
    x += 0.00731; z += 0.00419;   // (off the shared edges)
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    const out = [];
    if (i < 0 || j < 0 || i >= nx || j >= nz) return out;
    for (let k = counts[j * nx + i]; k < counts[j * nx + i + 1]; k++) {
      const t = tri[list[k]];
      const d = (t[4] - t[7]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[1] - t[7]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((t[4] - t[7]) * (x - t[6]) + (t[6] - t[3]) * (z - t[7])) / d;
      const l2 = ((t[7] - t[1]) * (x - t[6]) + (t[0] - t[6]) * (z - t[7])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      out.push({ y: l1 * t[2] + l2 * t[5] + l3 * t[8], up: t[9] > 0 });
    }
    return out.sort((a, b) => a.y - b.y);
  }
  /** air spans [[bottom, top]] of the column (top = Infinity for the sky) */
  function spans(x, z) {
    const h = hits(x, z), out = [];
    let start = NaN;
    for (const e of h) {
      if (e.up) { if (start !== start) start = e.y; } else if (start === start) { out.push([start, e.y]); start = NaN; }
    }
    if (start === start) out.push([start, Infinity]);
    return out;
  }
  /** the visible floor and roof a body stands under at (x, z): the first span that is tall enough */
  function stand(x, z) {
    for (const s of spans(x, z)) if (s[1] - s[0] >= HEAD) return { floor: s[0], ceil: s[1] };
    return null;
  }
  /** is (x, y, z) inside the rock? (an odd number of faces above it) */
  function inRock(x, y, z) {
    let n = 0;
    for (const e of hits(x, z)) if (e.y > y) n++;
    return n % 2 === 1;
  }
  return { hits, spans, stand, inRock };
}
