// Hollow Mountain volume (shared/caveVolume.js + client/world/caveVolumeMesh.js): the mountain is one closed, rounded
// skin. Pure geometry checks in node (no GPU): the field is deterministic, the mesh has no holes (rays from the sky and
// the sea reach every tunnel only through the mesh or an opening), is watertight (every interior edge has two faces),
// and nothing sticks out of the flank. The fixed map first, then a few more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { makeRng } from '../src/shared/rng.js';
import { caveRock, NOISE } from '../src/shared/caveVolume.js';
import { caveColumn } from '../src/shared/caveField.js';
import { meshCaveVolume } from '../src/client/world/caveVolumeMesh.js';

const LEVEL = 3;
const VARIANTS = [...new Set([levelDef(LEVEL).variant, 2, 5])];
const cache = new Map();
function island(variant) {
  let it = cache.get(variant);
  if (!it) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const vol = meshCaveVolume(terrain.plan, { half: terrain.half });
    it = { variant, terrain, plan: terrain.plan, vol, tris: null };
    cache.set(variant, it);
  }
  return it;
}
/** all triangles of all chunks as flat arrays [ax,ay,az,bx,by,bz,cx,cy,cz,...] */
function triangles(vol) {
  const out = [];
  for (const c of vol.chunks) for (let t = 0; t < c.idx.length; t += 3) {
    for (let k = 0; k < 3; k++) { const v = c.idx[t + k] * 3; out.push(c.pos[v], c.pos[v + 1], c.pos[v + 2]); }
  }
  return Float32Array.from(out);
}

test('the field is deterministic and the mesh builds the same twice', () => {
  const { plan, terrain } = island(VARIANTS[0]);
  const a = caveRock(plan), b = caveRock(plan);
  const rng = makeRng(77);
  for (let i = 0; i < 400; i++) {
    const x = rng.range(-300, 300), y = rng.range(-10, 60), z = rng.range(-280, 280);
    assert.equal(a.rock(x, y, z), b.rock(x, y, z));
    assert.equal(a.rock(x, y, z), a.rock(x, y, z));
  }
  const again = meshCaveVolume(plan, { half: terrain.half });
  const first = island(VARIANTS[0]).vol;
  assert.equal(again.stats.triangles, first.stats.triangles);
  assert.equal(again.chunks.length, first.chunks.length);
  for (const i of [0, again.chunks.length >> 1, again.chunks.length - 1]) {
    assert.deepEqual(Array.from(again.chunks[i].pos.subarray(0, 300)), Array.from(first.chunks[i].pos.subarray(0, 300)));
    assert.deepEqual(Array.from(again.chunks[i].idx.subarray(0, 300)), Array.from(first.chunks[i].idx.subarray(0, 300)));
  }
});

test('the field is air in the open tunnels, rock in the mountain and air above it', () => {
  for (const variant of VARIANTS) {
    const { plan, terrain } = island(variant);
    const rock = caveRock(plan), o = {};
    let tunnel = 0;
    for (let j = 8; j < terrain.n - 8; j += 3) for (let i = 8; i < terrain.n - 8; i += 3) {
      const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
      const c = caveColumn(plan, x, z, o);
      if (c.d < 12 || c.s > -6 || c.roof - c.floor < 5) continue;   // the middle of a tunnel or chamber
      tunnel++;
      assert.ok(rock.rock(x, (c.floor + c.roof) / 2, z) > 0.5, `variant ${variant}: air mid-tunnel at (${x.toFixed(0)}, ${z.toFixed(0)})`);
      assert.ok(rock.rock(x, c.floor - 3, z) < -0.5, `variant ${variant}: rock under the floor`);
      if (c.top > c.roof + 3) assert.ok(rock.rock(x, (c.roof + c.top) / 2 + 1, z) < -0.5 || c.top - c.roof < 5, `variant ${variant}: rock over the roof`);
      assert.ok(rock.rock(x, c.top + 12, z) > 2, `variant ${variant}: air over the mountain`);
    }
    assert.ok(tunnel > 100, 'a real maze');
  }
});

test('watertight: every edge of the welded mesh has two faces, the only open rim is the region border', () => {
  for (const variant of VARIANTS) {
    const { vol } = island(variant);
    const wid = new Map(), pts = [];
    const edges = new Map();
    let collapsed = 0;
    const q = (v) => Math.round(v * 400);
    for (const c of vol.chunks) {
      const map = new Int32Array(c.pos.length / 3);
      for (let i = 0; i < map.length; i++) {
        const key = `${q(c.pos[i * 3])},${q(c.pos[i * 3 + 1])},${q(c.pos[i * 3 + 2])}`;
        let id = wid.get(key);
        if (id === undefined) { id = pts.length / 3; wid.set(key, id); pts.push(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]); }
        map[i] = id;
      }
      for (let t = 0; t < c.idx.length; t += 3) {
        const a = map[c.idx[t]], b = map[c.idx[t + 1]], d = map[c.idx[t + 2]];
        if (a === b || b === d || a === d) { collapsed++; continue; }
        for (const [p, r] of [[a, b], [b, d], [d, a]]) { const k = p < r ? p * 8e6 + r : r * 8e6 + p; edges.set(k, (edges.get(k) ?? 0) + 1); }
      }
    }
    const rim = vol.rock.region(1.5);
    let open = 0, inner = 0, fan = 0;
    for (const [k, n] of edges) {
      if (n === 2) continue;
      const p = Math.floor(k / 8e6), r = k % 8e6;
      if (n === 1) {
        open++;
        const mx = (pts[p * 3] + pts[r * 3]) / 2, mz = (pts[p * 3 + 2] + pts[r * 3 + 2]) / 2;
        if (rim(mx, mz)) inner++;
      } else fan++;
    }
    assert.ok(open > 0, 'the region has a rim');
    assert.ok(collapsed < 150, `variant ${variant}: ${collapsed} triangles collapse to a line when welded`);
    assert.equal(inner, 0, `variant ${variant}: ${inner} open edges inside the mountain (holes)`);
    // (surface nets pinch a few saddles into four-faced edges: harmless, but they must stay rare)
    assert.ok(fan < edges.size * 0.001, `variant ${variant}: ${fan} of ${edges.size} edges are not manifold`);
  }
});

test('nothing sticks out of the flank, the mesh stays inside its region', () => {
  for (const variant of VARIANTS) {
    const { plan, vol } = island(variant);
    const inside = vol.rock.region(6 + 3), o = {};
    const SPREAD = 2.6;
    let n = 0;
    for (const c of vol.chunks) {
      for (let v = 0; v < c.pos.length / 3; v += 23) {
        const x = c.pos[v * 3], y = c.pos[v * 3 + 1], z = c.pos[v * 3 + 2];
        assert.ok(inside(x, z), `variant ${variant}: vertex outside the region at (${x.toFixed(0)}, ${z.toFixed(0)})`);
        // the skin the field is cut to, anywhere within a voxel or two of the vertex (a steep flank moves sideways with the noise)
        let top = -Infinity;
        for (const [dx, dz] of [[0, 0], [SPREAD, 0], [-SPREAD, 0], [0, SPREAD], [0, -SPREAD], [SPREAD, SPREAD], [-SPREAD, -SPREAD], [SPREAD, -SPREAD], [-SPREAD, SPREAD]]) top = Math.max(top, caveColumn(plan, x + dx, z + dz, o).top);
        assert.ok(y <= top + NOISE.amp + 2.2, `variant ${variant}: vertex ${(y - top).toFixed(1)} m over the skin at (${x.toFixed(0)}, ${z.toFixed(0)})`);
        n++;
      }
    }
    assert.ok(n > 5000);
  }
});

// ---- rays: from the sky and from the sea toward the middle of the tunnels
function rayGrid(tris, size = 8) {
  const cells = new Map();
  for (let t = 0; t < tris.length; t += 9) {
    const x0 = Math.min(tris[t], tris[t + 3], tris[t + 6]), x1 = Math.max(tris[t], tris[t + 3], tris[t + 6]);
    const z0 = Math.min(tris[t + 2], tris[t + 5], tris[t + 8]), z1 = Math.max(tris[t + 2], tris[t + 5], tris[t + 8]);
    for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) for (let k = Math.floor(z0 / size); k <= Math.floor(z1 / size); k++) {
      const key = i * 4096 + k;
      let l = cells.get(key);
      if (!l) cells.set(key, l = []);
      l.push(t);
    }
  }
  /** does the segment o -> o + d * len cross any triangle? (Moeller-Trumbore) */
  return (ox, oy, oz, dx, dy, dz, len) => {
    const seen = new Set();
    for (let s = 0; s <= len; s += size * 0.5) {
      const px = ox + dx * s, pz = oz + dz * s;
      for (let i = Math.floor((px - size) / size); i <= Math.floor((px + size) / size); i++) for (let k = Math.floor((pz - size) / size); k <= Math.floor((pz + size) / size); k++) {
        for (const t of cells.get(i * 4096 + k) ?? []) {
          if (seen.has(t)) continue;
          seen.add(t);
          const e1x = tris[t + 3] - tris[t], e1y = tris[t + 4] - tris[t + 1], e1z = tris[t + 5] - tris[t + 2];
          const e2x = tris[t + 6] - tris[t], e2y = tris[t + 7] - tris[t + 1], e2z = tris[t + 8] - tris[t + 2];
          const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
          const a = e1x * hx + e1y * hy + e1z * hz;
          if (Math.abs(a) < 1e-12) continue;
          const f = 1 / a, sx = ox - tris[t], sy = oy - tris[t + 1], sz = oz - tris[t + 2];
          const u = f * (sx * hx + sy * hy + sz * hz);
          if (u < -1e-6 || u > 1 + 1e-6) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = f * (dx * qx + dy * qy + dz * qz);
          if (v < -1e-6 || u + v > 1 + 1e-6) continue;
          const tt = f * (e2x * qx + e2y * qy + e2z * qz);
          if (tt > 1e-4 && tt < len) return true;
        }
      }
    }
    return false;
  };
}

test('no holes: wherever the field has rock between the outside and a tunnel, a ray from the sky or the sea hits the mesh', () => {
  for (const variant of VARIANTS) {
    const it = island(variant);
    const { terrain, plan, vol } = it;
    const hit = rayGrid(it.tris ??= triangles(vol));
    const rock = vol.rock, rng = makeRng(variant * 31 + 5);
    // the middle of tunnel cells (the old ceiling is finite and the floor is open)
    const cells = [], col = {};
    for (let j = 6; j < terrain.n - 6; j++) for (let i = 6; i < terrain.n - 6; i++) {
      const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
      const c = caveColumn(plan, x, z, col);
      if (Number.isFinite(terrain.ceilingAt(x, z)) && c.d > 4 && c.s < -3 && c.roof - c.floor > 4.5) cells.push([x, (c.floor + Math.min(c.roof, c.floor + 8)) / 2, z]);
    }
    assert.ok(cells.length > 1500, 'a real maze');
    let rays = 0, blocked = 0;
    const origins = [[0, 1], [0, 15], [0, 60]];
    for (let n = 0; n < 220; n++) {
      const [px, py, pz] = cells[Math.floor(rng() * cells.length)];
      assert.ok(rock.rock(px, py, pz) > 0, `variant ${variant}: the cell's middle is open air`);
      const shots = [[px, 420, pz]];   // from the sky
      for (let r = 0; r < 3; r++) {
        const ang = rng() * Math.PI * 2, [, h] = origins[r];
        shots.push([px + Math.cos(ang) * 520, h, pz + Math.sin(ang) * 520]);   // from the sea
      }
      for (const [ox, oy, oz] of shots) {
        const len = Math.hypot(px - ox, py - oy, pz - oz), dx = (px - ox) / len, dy = (py - oy) / len, dz = (pz - oz) / len;
        // is there rock (at least 1.5 m deep) along the way? then the mesh must be crossed
        let deepRock = false;
        for (let s = 0; s < len - 2 && !deepRock; s += 2.5) {
          const x = ox + dx * s, y = oy + dy * s, z = oz + dz * s;
          if (Math.abs(x) > terrain.half || Math.abs(z) > terrain.half) continue;
          if (y < -20) continue;
          if (rock.rock(x, y, z) < -1.5) deepRock = true;
        }
        rays++;
        if (!deepRock) continue;
        blocked++;
        assert.ok(hit(ox, oy, oz, dx, dy, dz, len), `variant ${variant}: a ray from (${ox.toFixed(0)}, ${oy.toFixed(0)}, ${oz.toFixed(0)}) passes through rock to (${px.toFixed(0)}, ${py.toFixed(1)}, ${pz.toFixed(0)}) without meeting the mesh`);
      }
    }
    assert.ok(blocked > rays / 2, `variant ${variant}: most rays meet rock (${blocked} / ${rays})`);
  }
});

test('the mountain is closed from above: a vertical ray over every part of the flank and the tunnels hits the mesh', () => {
  for (const variant of VARIANTS) {
    const it = island(variant);
    const { terrain, plan, vol } = it;
    const hit = rayGrid(it.tris ??= triangles(vol));
    const inside = vol.rock.region(0), o = {};
    let n = 0;
    for (let z = -terrain.half; z < terrain.half; z += 4.3) for (let x = -terrain.half; x < terrain.half; x += 4.3) {
      if (!inside(x, z)) continue;
      const c = caveColumn(plan, x, z, o);
      if (c.top < -14) continue;   // (the sea floor reaches down to -16 m: a ray from the sky meets it, but not every sample is worth the time)
      n++;
      // (a cross of four rays: one that grazes a vertical cliff face may slip between its triangles, a hole swallows all four)
      assert.ok([[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([a, b]) => hit(x + a, 400, z + b, 0, -1, 0, 420)), `variant ${variant}: a vertical ray at (${x.toFixed(2)}, ${z.toFixed(2)}) falls through the mountain`);
    }
    assert.ok(n > 8000);
  }
});
