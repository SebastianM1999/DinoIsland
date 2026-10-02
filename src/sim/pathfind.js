// Coarse A* over walkable ground for dinosaurs that must reach a far goal
// (raiders heading for the team's base). Cells are CELL metres; a cell is open
// when DinoSystem.walkable() accepts its centre for the given animal. Trees and
// rocks are left to the local avoidance in DinoSystem.move().

const CELL = 4;
const MAX_NODES = 12000;   // per search: a failed search must stay cheap (it runs in a server tick)

/** Minimal binary heap on f-score. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Waypoints [{x, z}] from (fx, fz) to within `reach` metres of (tx, tz) for
 * dinosaur-like `d` ({ type, radius, raid? }), or null if there is no way.
 */
export function findPath(sys, d, fx, fz, tx, tz, reach = 8, maxNodes = MAX_NODES) {
  const key = (i, j) => i * 100000 + j;
  const ci = (v) => Math.round(v / CELL);
  const open = new Map();     // cached walkability per cell
  const walk = (i, j) => {
    const k = key(i, j);
    let v = open.get(k);
    if (v === undefined) { v = sys.walkable(i * CELL, j * CELL, d); open.set(k, v); }
    return v;
  };
  const si = ci(fx), sj = ci(fz), gi = ci(tx), gj = ci(tz);
  const h = (i, j) => Math.hypot(i - gi, j - gj);
  const heap = new Heap();
  const g = new Map([[key(si, sj), 0]]);
  const from = new Map();
  heap.push({ i: si, j: sj, f: h(si, sj) });
  const reachCells = reach / CELL;
  let seen = 0;
  while (heap.size && seen++ < maxNodes) {
    const n = heap.pop();
    const nk = key(n.i, n.j);
    if (h(n.i, n.j) <= reachCells) {
      // walk back, then thin the path to every other cell
      const pts = [];
      for (let k = nk; k !== undefined; k = from.get(k)) pts.push({ x: Math.round(k / 100000) * CELL, z: (k - Math.round(k / 100000) * 100000) * CELL });
      pts.reverse();
      return pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
    }
    const gn = g.get(nk);
    for (const [di, dj] of DIRS) {
      const i = n.i + di, j = n.j + dj;
      if (!walk(i, j)) continue;
      // no corner cutting past an unwalkable cell
      if (di && dj && (!walk(n.i + di, n.j) || !walk(n.i, n.j + dj))) continue;
      const k = key(i, j);
      const cost = gn + (di && dj ? Math.SQRT2 : 1);
      if (cost >= (g.get(k) ?? Infinity)) continue;
      g.set(k, cost);
      from.set(k, nk);
      heap.push({ i, j, f: cost + h(i, j) });
    }
  }
  return null;
}
