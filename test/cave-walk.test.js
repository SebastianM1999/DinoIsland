// Hollow Mountain hitboxes (shared/caveWalk.js): the floor and roof the sim and the client controller collide with are
// sampled from the very volume the client draws, so there are no invisible walls in the tunnels and no walking through
// the rock you see. The "visible" side here is the real mesh (client/world/caveVolumeMesh.js): vertical rays through its
// triangles give the visible floor and roof of a column, and the parity of the crossings above a point says whether the
// point lies in rock. The fixed map first, then a few more variants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { CONFIG } from '../src/shared/config.js';
import { makeRng } from '../src/shared/rng.js';
import { meshCaveVolume } from '../src/client/world/caveVolumeMesh.js';
import { PlayerController } from '../src/client/player/controller.js';
import { WALK, WALK_VERSION } from '../src/shared/caveWalk.js';

const LEVEL = 3;
const VARIANTS = [...new Set([levelDef(LEVEL).variant, 1, 2, 5])];
const P = CONFIG.player;
const HEAD = P.height + 0.05;
const cache = new Map();

/** Vertical rays through the mesh: a grid of triangles per 2 m cell. */
function rayIndex(vol) {
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

function island(variant) {
  let it = cache.get(variant);
  if (!it) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    const vol = meshCaveVolume(terrain.plan, { half: terrain.half });
    it = { variant, terrain, layout, plan: terrain.plan, ray: rayIndex(vol) };
    cache.set(variant, it);
  }
  return it;
}

/** does a body fit at (x, z) on the mesh's level floor `v`? (a ring of radius + a cell of play: clear air, the same floor, a body-high roof) */
function bodyFits(ray, x, z, v) {
  if (!v || v.ceil - v.floor < HEAD + 0.3) return false;
  const r = P.radius + WALK.cell + 0.1;
  for (let k = 0; k < 8; k++) {
    const q = ray.stand(x + Math.cos(k * Math.PI / 4) * r, z + Math.sin(k * Math.PI / 4) * r);
    if (!q || Math.abs(q.floor - v.floor) > 0.35 || q.ceil - q.floor < HEAD + 0.3) return false;
  }
  return true;
}

/** points along every tunnel's centre line and across its width (the passage and a little rock beside it) */
function* tunnelProbes(plan, { along = 4, across = 1.5, extra = 3, centreOnly = false } = {}) {
  for (const t of plan.cave.maze.tunnels) {
    for (let i = 0; i < t.pts.length - 1; i++) {
      const a = t.pts[i], b = t.pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let s = 0; s < L; s += along) {
        const cx = a.x + ux * s, cz = a.z + uz * s, w = a.w + (b.w - a.w) * s / L;
        if (centreOnly) { yield { x: cx, z: cz, centre: true, off: 0, w, tunnel: t }; continue; }
        for (let o = -w / 2 - extra; o <= w / 2 + extra + 1e-9; o += across) yield { x: cx - uz * o, z: cz + ux * o, centre: Math.abs(o) < 0.01, off: o, w, tunnel: t };
      }
    }
  }
}
/** could a player stand at (x, z)? (what the controller's step rules start from: a floor low enough, a body-high roof, a gentle floor) */
const walkable = (terrain, x, z) => {
  const h = terrain.heightAt(x, z);
  if (!(h < 14 && terrain.clearanceAt(x, z) >= HEAD)) return false;
  // (not on a cliff face, nor in a grid cell that has a wall corner: there the grid ramps up to the wall and the step rules
  // turn the player back; the last free node before it is not tested here either)
  const W = terrain.walk, c = W.cell, gx = Math.floor((x - W.ox) / c), gz = Math.floor((z - W.oz) / c);
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (Math.abs(terrain.heightAt(W.ox + (gx + i) * c, W.oz + (gz + j) * c) - h) > 1.2) return false;
  return true;
};

test('the walk grid is built from the volume: tiles, sizes and a repeatable build', () => {
  const { terrain } = island(VARIANTS[0]);
  const W = terrain.walk;
  assert.ok(W, 'the cave level has a walk grid');
  assert.equal(W.cell, WALK.cell);
  assert.ok(W.stats.tiles > 500 && W.stats.nodes > 100000, `tiles ${W.stats.tiles}`);
  assert.ok(W.stats.bytes < 12e6, `walk grid ${W.stats.bytes} bytes`);
  assert.ok(Number.isInteger(WALK_VERSION) && WALK_VERSION >= 1);
  // other islands have none
  assert.equal(new Terrain(planIsland(0, 1)).walk, null);
  // deterministic: a second build gives the very same numbers
  const again = new Terrain(planIsland(LEVEL, VARIANTS[0])).walk;
  assert.deepEqual(again.floor, W.floor);
  assert.deepEqual(again.ceil, W.ceil);
  assert.deepEqual(again.tileIndex, W.tileIndex);
});

test('along every tunnel and across its width the walkable floor and roof are the visible ones', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan, ray } = island(variant);
    let n = 0, worstF = 0, worstC = 0, at = null;
    for (const p of tunnelProbes(plan)) {
      const v = ray.stand(p.x, p.z);
      // (within the wall's clearance and a cell of it the walk grid ramps up to the wall: only a free body's spot is compared)
      if (!v || v.floor > 14 || v.floor < -4 || !bodyFits(ray, p.x, p.z, v)) continue;
      n++;
      const dF = Math.abs(terrain.heightAt(p.x, p.z) - v.floor);
      if (dF > worstF) { worstF = dF; at = p; }
      // (a roof sheet thinner than the lattice, ~1.5 m of rock over a mouth, is not in the sim's roof)
      const rockAbove = (ray.spans(p.x, p.z).find((s) => s[0] > v.ceil) ?? [Infinity])[0] - v.ceil;
      if (Number.isFinite(v.ceil) && rockAbove > 2.5) worstC = Math.max(worstC, Math.abs(terrain.ceilingAt(p.x, p.z) - v.ceil));
      assert.ok(dF < 0.35, `variant ${variant}: floor at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) walk ${terrain.heightAt(p.x, p.z).toFixed(2)} visible ${v.floor.toFixed(2)}`);
    }
    assert.ok(n > 300, `variant ${variant}: ${n} probes`);
    assert.ok(worstC < 0.8, `variant ${variant}: roof off by ${worstC.toFixed(2)} m`);
    void at;
  }
});

test('every passage centre is walkable ground under a body-high roof, and the roof never dips below head height where walkable', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan, ray } = island(variant);
    let centres = 0;
    for (const p of tunnelProbes(plan, { along: 3, centreOnly: true })) {
      if (p.tunnel.kind === 'falseExit') continue;   // (they end in a rock sill)
      const v = ray.stand(p.x, p.z);
      if (!v || v.floor > 14 || terrain.waterDepthAt(p.x, p.z) > 2) continue;   // (the sump dives, the rim of a false exit is rock)
      centres++;
      assert.ok(walkable(terrain, p.x, p.z), `variant ${variant}: the centre of a passage at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is blocked (h ${terrain.heightAt(p.x, p.z).toFixed(1)})`);
    }
    assert.ok(centres > 100);
    // anywhere in the tunnel band: where the sim lets you stand, a body fits under the roof
    const rng = makeRng(variant + 11);
    for (const p of tunnelProbes(plan, { along: 6, across: 0.7, extra: 2 })) {
      const x = p.x + rng.range(-0.3, 0.3), z = p.z + rng.range(-0.3, 0.3);
      if (!walkable(terrain, x, z)) continue;
      assert.ok(terrain.ceilingAt(x, z) - terrain.heightAt(x, z) >= HEAD - 1e-6, `variant ${variant}: roof under head height at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('no visible rock to walk through, no invisible wall in the passage', () => {
  for (const variant of VARIANTS) {
    const { terrain, plan, ray } = island(variant);
    const rng = makeRng(variant * 7 + 3);
    let through = 0, invisible = 0, checked = 0, free = 0;
    for (const p of tunnelProbes(plan, { along: 3.5, across: 0.4, extra: 3 })) {
      const x = p.x + rng.range(-0.1, 0.1), z = p.z + rng.range(-0.1, 0.1);
      const v = ray.stand(x, z);
      if (terrain.waterDepthAt(x, z) > 1.3) continue;      // (swimming: another rule)
      checked++;
      if (walkable(terrain, x, z)) {
        // standing here: the body axis (hip, chest, head) is in the open air of the mesh
        const h = terrain.heightAt(x, z);
        for (const dy of [0.5, 1.1, 1.7]) {
          // (inside the rock if the body axis and every point 0.3 m round it are: a ledge's edge may touch the body's side)
          if ([[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([ox, oz]) => ray.inRock(x + ox, h + dy, z + oz))) { through++; assert.fail(`variant ${variant}: walkable inside visible rock at (${x.toFixed(2)}, ${(h + dy).toFixed(2)}, ${z.toFixed(2)})`); }
        }
        if (!v || (bodyFits(ray, x, z, v) && Math.abs(h - v.floor) > 0.5)) assert.fail(`variant ${variant}: walkable at (${x.toFixed(2)}, ${z.toFixed(2)}) where the mesh has no floor (${h.toFixed(2)} vs ${v ? v.floor.toFixed(2) : 'none'})`);
      } else if (v && v.floor < 8) {
        // a body (radius + a cell of play) fits here on level ground: it must be walkable
        if (bodyFits(ray, x, z, v)) { free++; invisible++; assert.fail(`variant ${variant}: invisible wall at (${x.toFixed(2)}, ${z.toFixed(2)}): the mesh floor is ${v.floor.toFixed(2)}, the walk grid says ${terrain.heightAt(x, z).toFixed(2)} / roof ${terrain.ceilingAt(x, z).toFixed(2)}`); }
      }
    }
    assert.equal(through + invisible, 0);
    assert.ok(checked > 1000, `variant ${variant}: ${checked} probes`);
  }
});

test('the controller stops at the wall you see and never ends up inside the rock', () => {
  for (const variant of VARIANTS) {
    const { terrain, layout, plan, ray } = island(variant);
    const rng = makeRng(variant + 99);
    let runs = 0, worstGap = 0;
    for (const t of plan.cave.maze.tunnels.filter((q) => q.kind === 'tree' || q.kind === 'loop' || q.kind === 'exit')) {
      for (let k = 2; k < t.pts.length - 2; k += 4) {
        const a = t.pts[k], b = t.pts[k + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const side = rng() < 0.5 ? -1 : 1, nx = -(b.z - a.z) / L * side, nz = (b.x - a.x) / L * side;
        const v = ray.stand(a.x, a.z);
        if (!v || v.floor > 8 || terrain.waterDepthAt(a.x, a.z) > 0.3 || !walkable(terrain, a.x, a.z)) continue;
        // where the visible wall is along that direction (body height)
        let dist = -1;
        for (let d = 0; d < a.w; d += 0.05) if (ray.inRock(a.x + nx * d, v.floor + 1.0, a.z + nz * d)) { dist = d; break; }
        if (dist < 0) continue;
        const pc = new PlayerController(terrain, layout.playerColliders, layout.rockSurfaceAt);
        pc.teleport(a.x, a.z, v.floor);
        pc.yaw = Math.atan2(-nx, -nz);
        let maxOut = 0;
        for (let f = 0; f < 60 * 5; f++) {
          pc.update(1 / 60, { forward: true });
          const out = (pc.pos.x - a.x) * nx + (pc.pos.z - a.z) * nz;
          maxOut = Math.max(maxOut, out);
          for (const dy of [0.5, 1.1, 1.7]) assert.ok(!ray.inRock(pc.pos.x, pc.pos.y + dy, pc.pos.z), `variant ${variant}: the player walked into the rock at (${pc.pos.x.toFixed(2)}, ${pc.pos.z.toFixed(2)})`);
        }
        runs++;
        // (the wall is measured at hip height over the centre; the floor climbs the foot of the wall, and the player may slide
        // along it round a bend or out of a mouth: so it is "never inside" above, and "not stopped far short" here)
        worstGap = Math.max(worstGap, dist - maxOut);
        assert.ok(dist - maxOut < 1.8, `variant ${variant}: stopped ${(dist - maxOut).toFixed(2)} m short of the wall (invisible wall)`);
      }
    }
    assert.ok(runs >= 10, `variant ${variant}: ${runs} wall runs`);
    void worstGap;
  }
});

test('stalagmites, columns and stalactites sit on the volume\'s floor and roof', () => {
  for (const variant of VARIANTS) {
    const { terrain, layout, ray } = island(variant);
    const D = layout.caveDecor;
    for (const c of [...D.stalagmites, ...D.columns]) {
      const v = ray.stand(c.x, c.z);
      assert.ok(v, `variant ${variant}: decor in rock`);
      assert.ok(Math.abs(terrain.heightAt(c.x, c.z) - v.floor) < 0.4, `variant ${variant}: stalagmite base ${terrain.heightAt(c.x, c.z).toFixed(2)} vs floor ${v.floor.toFixed(2)}`);
      assert.ok(Math.abs(c.y - terrain.heightAt(c.x, c.z)) < 1e-6);
    }
    for (const c of D.columns) {
      // the column reaches into the rock above: its top (floor + h) is inside the roof
      assert.ok(ray.inRock(c.x, c.y + c.h - 0.05, c.z), `variant ${variant}: a column ends in the air`);
    }
    for (const s of D.stalactites) {
      const roof = terrain.ceilingAt(s.x, s.z);
      assert.ok(Number.isFinite(roof), `variant ${variant}: a stalactite where there is no roof`);
      const v = ray.stand(s.x, s.z);
      if (v && Number.isFinite(v.ceil)) assert.ok(Math.abs(roof - v.ceil) < 0.8, `variant ${variant}: stalactite roof ${roof.toFixed(2)} vs mesh ${v.ceil.toFixed(2)}`);
    }
  }
});

test('every dinosaur spot of the caves is walkable ground with head room, on the visible floor', () => {
  for (const variant of VARIANTS) {
    const { terrain, layout, ray } = island(variant);
    let n = 0;
    for (const spot of layout.caveDinoSpots) {
      for (const s of [{ x: spot.x, z: spot.z }, ...spot.spawns]) {
        if (terrain.waterDepthAt(s.x, s.z) > 1.3) continue;      // (a lurker's pool)
        const v = ray.stand(s.x, s.z);
        assert.ok(v, `variant ${variant}: a spawn in rock`);
        assert.ok(terrain.clearanceAt(s.x, s.z) > 3.4, `variant ${variant}: head room ${terrain.clearanceAt(s.x, s.z).toFixed(2)}`);
        assert.ok(Math.abs(terrain.heightAt(s.x, s.z) - v.floor) < 0.4, `variant ${variant}: spawn floor ${terrain.heightAt(s.x, s.z).toFixed(2)} vs mesh ${v.floor.toFixed(2)}`);
        assert.ok(terrain.isWalkable(s.x, s.z, 1.3, P.maxWalkSlope));
        n++;
      }
    }
    assert.ok(n >= 3, `variant ${variant}: ${n} spots`);
  }
});
