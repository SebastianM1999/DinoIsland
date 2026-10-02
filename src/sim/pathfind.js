// Coarse A* over walkable ground for dinosaurs that must reach a far goal
// (raiders heading for the team's base) or whose straight line is blocked
// (DinoSystem.steer detours). Cells are CELL metres; a cell is open when
// DinoSystem.walkable() accepts its centre for the given animal. Trees and
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

/** Can `d` walk straight from (x0, z0) to (x1, z1)? Same rule as DinoSystem.move(): steep only going down. */
function reachable(sys, d, x0, z0, x1, z1) {
  const t = sys.terrain, len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 0.75);
  let prev = t.heightAt(x0, z0);
  for (let s = 1; s <= n; s++) {
    const x = x0 + (x1 - x0) * (s / n), z = z0 + (z1 - z0) * (s / n), y = t.heightAt(x, z);
    if (!sys.walkable(x, z, d, y < prev)) return false;
    prev = y;
  }
  return true;
}

/**
 * Waypoints [{x, z}] from (fx, fz) to within `reach` metres of (tx, tz) for
 * dinosaur-like `d` ({ type, radius, raid? }), or null if there is no way.
 * `every`: keep every n-th cell as a waypoint (1 = all, for short detours that must
 * not cut across a steep corner). `info.closed` is set when the search ran out of
 * ground before its budget: the animal is shut in (a pit it ran down into), not
 * merely far from the goal.
 */
export function findPath(sys, d, fx, fz, tx, tz, reach = 8, maxNodes = MAX_NODES, { every = 2, info = null } = {}) {
  const key = (i, j) => i * 100000 + j;
  const ci = (v) => Math.round(v / CELL);
  // per cell (cached): 2 = walkable either way, 1 = only coming down (steep), 0 = never.
  // Edges are directed like DinoSystem.move(): steep cells are entered downhill only, so an
  // animal on a plateau finds the way down a wall it could never climb back up
  const open = new Map();
  const heights = new Map();
  const cell = (i, j) => {
    const k = key(i, j);
    let v = open.get(k);
    if (v === undefined) {
      const x = i * CELL, z = j * CELL;
      v = sys.walkable(x, z, d) ? 2 : sys.walkable(x, z, d, true) ? 1 : 0;
      open.set(k, v);
      heights.set(k, sys.terrain.heightAt(x, z));
    }
    return v;
  };
  const walk = (fi, fj, i, j) => {
    const v = cell(i, j);
    if (v !== 1) return v === 2;
    cell(fi, fj);
    return heights.get(key(i, j)) < heights.get(key(fi, fj));
  };
  const gi = ci(tx), gj = ci(tz);
  const h = (i, j) => Math.hypot(i - gi, j - gj);
  const heap = new Heap();
  const g = new Map();
  const from = new Map();
  // start from every corner cell it can actually walk to: the nearest cell centre may sit on top
  // of the steep step it just ran down
  const i0 = Math.floor(fx / CELL), j0 = Math.floor(fz / CELL);
  for (const [i, j] of [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]]) {
    if (!cell(i, j) || !reachable(sys, d, fx, fz, i * CELL, j * CELL)) continue;
    const c = Math.hypot(i * CELL - fx, j * CELL - fz) / CELL;
    g.set(key(i, j), c);
    heap.push({ i, j, f: c + h(i, j) });
  }
  // none: it stands on a steep bank it can only go further down (into water, say): shut in
  if (!heap.size) {
    if (info) info.closed = true;
    return null;
  }
  const reachCells = reach / CELL;
  let seen = 0;
  while (heap.size && seen++ < maxNodes) {
    const n = heap.pop();
    const nk = key(n.i, n.j);
    if (h(n.i, n.j) <= reachCells) {
      // walk back, then thin the path
      const pts = [];
      for (let k = nk; k !== undefined; k = from.get(k)) pts.push({ x: Math.round(k / 100000) * CELL, z: (k - Math.round(k / 100000) * 100000) * CELL });
      pts.reverse();
      return pts.filter((_, i) => i % every === 0 || i === pts.length - 1);
    }
    const gn = g.get(nk);
    for (const [di, dj] of DIRS) {
      const i = n.i + di, j = n.j + dj;
      if (!walk(n.i, n.j, i, j)) continue;
      // no corner cutting past an unwalkable cell
      if (di && dj && (!walk(n.i, n.j, n.i + di, n.j) || !walk(n.i, n.j, n.i, n.j + dj))) continue;
      const k = key(i, j);
      const cost = gn + (di && dj ? Math.SQRT2 : 1);
      if (cost >= (g.get(k) ?? Infinity)) continue;
      g.set(k, cost);
      from.set(k, nk);
      heap.push({ i, j, f: cost + h(i, j) });
    }
  }
  if (info) info.closed = heap.size === 0;
  return null;
}
