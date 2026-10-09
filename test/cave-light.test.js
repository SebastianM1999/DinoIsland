// The Hollow Mountain's baked lighting (client/world/caveLight.js): ambient occlusion, sky visibility, water shimmer and the crystal
// glow with line of sight, per vertex of the volume mesh, stored in the bake (assets/cave/island4-v7.bin). Checked on the committed
// bake and on the live code: darkness inside, daylight at the openings, no glow through rock, a deterministic bake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { volumeLattice } from '../src/shared/caveVolume.js';
import { decodeMesh } from '../src/shared/caveBake.js';
import { readCaveBake } from '../server/caveBake.js';
import { buildGlowField } from '../src/client/world/caveStyle.js';
import { buildSkyField } from '../src/client/world/caveSky.js';
import { bakeCaveLight, latticeSampler } from '../src/client/world/caveLight.js';

const LEVEL = 3;
const VARIANT = levelDef(LEVEL).variant;
const plan = planIsland(LEVEL, VARIANT);
const terrain = new Terrain(plan);
const layout = buildLayout(terrain);
const baked = readCaveBake(LEVEL, VARIANT, { mesh: true });
const chunks = decodeMesh(baked.mesh);
const sky = buildSkyField(terrain, layout);
const glow = buildGlowField(layout);
const lat = volumeLattice(plan, terrain.half);
const field = latticeSampler(lat);

function* vertices(step = 1) {
  for (const c of chunks) for (let v = 0; v < c.pos.length / 3; v += step) yield { c, v, x: c.pos[v * 3], y: c.pos[v * 3 + 1], z: c.pos[v * 3 + 2], ny: c.nor[v * 3 + 1], ao: c.lt[v * 3], sky: c.lt[v * 3 + 1], shim: c.lt[v * 3 + 2] };
}

test('the baked light is all in range, and every vertex has it', () => {
  let n = 0;
  for (const q of vertices(7)) {
    n++;
    for (let k = 0; k < 3; k++) assert.ok(q.c.lt[q.v * 3 + k] >= 0 && q.c.lt[q.v * 3 + k] <= 1, 'ao / sky / shimmer in 0..1');
    for (let k = 0; k < 3; k++) assert.ok(q.c.gl[q.v * 3 + k] >= 0 && q.c.gl[q.v * 3 + k] <= 1);
  }
  assert.ok(n > 50000);
});

test('ambient occlusion: open ground reads bright, corners and crevices dark', () => {
  let flat = 0, flatN = 0, low = 0, all = 0;
  for (const q of vertices(5)) {
    if (q.ny > 0.95 && field(q.x, q.y + 2.5, q.z) > 2.4) { flat += q.ao; flatN++; }   // a floor with 2.5 m of free air above it
    if (q.sky > 0.02) continue;                        // (inside the mountain)
    all++;
    if (q.ao < 0.7) low++;
  }
  assert.ok(flatN > 1000, `${flatN} open floor vertices`);
  assert.ok(flat / flatN > 0.9, `open floors average ${(flat / flatN).toFixed(2)}`);
  assert.ok(low / all > 0.04 && low / all < 0.6, `${(100 * low / all).toFixed(1)} % of the inside is occluded: it has corners and still reads as open space`);
});

test('daylight: dark deep inside, full on the outside of the mountain, the same field as the sky texture', () => {
  let inside = 0, outside = 0, nIn = 0, nOut = 0, worst = 0;
  for (const q of vertices(9)) {
    worst = Math.max(worst, Math.abs(q.sky - sky.visAt(q.x, q.y, q.z)));
    if (q.y > 30) { outside += q.sky; nOut++; }
  }
  for (const n of plan.cave.maze.nodes) {
    // the chamber floors a long way in
    const d = plan.cave.depthAt(n.x, n.z);
    if (d < 40) continue;
    const y = terrain.heightAt(n.x, n.z) + 1;
    inside += sky.visAt(n.x, y, n.z); nIn++;
  }
  assert.ok(worst < 1 / 255 + 1e-3, `the baked daylight differs from the sky field by ${worst}`);
  assert.ok(nIn > 5 && inside / nIn < 0.02, 'the chambers deep in the mountain see no sky');
  assert.ok(nOut > 1000 && outside / nOut > 0.95, 'the skin up on the mountain sees all of it');
});

test('crystal glow only where a source can be seen: no glow through rock', () => {
  let lit = 0, checked = 0;
  for (const q of vertices(1)) {
    const g = q.c.gl[q.v * 3] + q.c.gl[q.v * 3 + 1] + q.c.gl[q.v * 3 + 2];
    if (g < 0.02) continue;
    lit++;
    if (lit % 9) continue;
    checked++;
    // some source within reach with a clear line from just off the surface
    let ok = false;
    const nx = q.c.nor[q.v * 3], ny = q.c.nor[q.v * 3 + 1], nz = q.c.nor[q.v * 3 + 2];
    const sx = q.x + nx * 0.35, sy = q.y + ny * 0.35, sz = q.z + nz * 0.35;
    for (const s of glow.sources) {
      if (Math.hypot(s.x - q.x, (s.y - q.y) * 0.77, s.z - q.z) >= s.r) continue;
      const ex = s.x - sx, ey = s.y - sy, ez = s.z - sz, len = Math.hypot(ex, ey, ez);
      let min = 9;
      const n = Math.max(2, Math.min(40, Math.ceil(len / 0.8)));
      for (let i = 1; i < n; i++) min = Math.min(min, field(sx + ex * i / n, sy + ey * i / n, sz + ez * i / n));
      if (min > 0.1) { ok = true; break; }
    }
    assert.ok(ok, `glow at (${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}) with no visible source`);
  }
  assert.ok(lit > 3000 && checked > 300, `${lit} glowing vertices`);
});

test('the glow pools round the crystals: bright next to a crystal hall, none in a tunnel far from every source', () => {
  let near = 0, nNear = 0;
  const crystals = layout.caveDecor.crystals.slice(0, 40);
  for (const q of vertices(3)) {
    const g = Math.max(q.c.gl[q.v * 3], q.c.gl[q.v * 3 + 1], q.c.gl[q.v * 3 + 2]);
    let d = Infinity;
    for (const s of glow.sources) d = Math.min(d, Math.hypot(s.x - q.x, s.y - q.y, s.z - q.z) - s.r);
    if (d > 4) assert.equal(g, 0, 'glow far outside every source radius');
  }
  for (const c of crystals) for (const q of vertices(3)) {
    if (Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z) < 2.5 && q.ny > 0.5) { near += Math.max(q.c.gl[q.v * 3], q.c.gl[q.v * 3 + 1], q.c.gl[q.v * 3 + 2]); nNear++; }
  }
  assert.ok(nNear > 20 && near / nNear > 0.05, `the floor beside crystals glows ${(near / Math.max(1, nNear)).toFixed(3)}`);
});

test('water shimmer: only just above flooded water, never underwater or far from it', () => {
  let n = 0;
  for (const q of vertices(1)) {
    if (q.shim < 0.05) continue;
    n++;
    assert.ok(q.y < 9, 'shimmer high on the mountain');
    let wet = false, lvl = -Infinity;
    for (let k = 0; k < 17; k++) {
      const r = k === 0 ? 0 : k <= 8 ? 1.8 : 4, a = (k - 1) * Math.PI / 4 + 0.4;
      const w = terrain.waterLevelAt(q.x + Math.cos(a) * r, q.z + Math.sin(a) * r);
      if (w !== null) { wet = true; lvl = Math.max(lvl, w); }
    }
    assert.ok(wet, 'shimmer with no water near');
    assert.ok(q.y - lvl > -0.35 && q.y - lvl < 3.5, `shimmer ${(q.y - lvl).toFixed(2)} m over the water`);
  }
  assert.ok(n > 500, `${n} shimmering vertices`);
});

test('the bake is deterministic: baking a few chunks again gives the same numbers', () => {
  const sample = chunks.slice(100, 103).map((c) => ({ pos: c.pos, nor: c.nor }));
  const mk = () => sample.map((c) => ({ pos: c.pos, nor: c.nor }));
  const a = mk(), b = mk();
  const src = { sources: glow.sources, visAt: sky.visAt, waterAt: (x, z) => terrain.waterLevelAt(x, z) };
  bakeCaveLight(lat, a, src);
  bakeCaveLight(lat, b, src);
  a.forEach((c, i) => { assert.deepEqual(c.lt, b[i].lt); assert.deepEqual(c.gl, b[i].gl); });
  // (and it is what the file holds, to the file's 8 bits)
  // (the file's positions are 16-bit quantised: the numbers move a hair)
  a.forEach((c, i) => {
    let sum = 0, worst = 0;
    for (let k = 0; k < c.lt.length; k++) { const d = Math.abs(c.lt[k] - chunks[100 + i].lt[k]); sum += d; worst = Math.max(worst, d); }
    assert.ok(sum / c.lt.length < 0.004 && worst < 0.25, `the committed bake is stale (mean ${(sum / c.lt.length).toFixed(4)}, worst ${worst.toFixed(2)}): run node scripts/bakeCave.mjs`);
  });
});

test('the cave materials never add or hide a light for the baked light: it is attributes and uniforms only', async () => {
  const fs = await import('node:fs');
  for (const f of ['src/client/world/caveLight.js', 'src/client/world/caveSky.js']) {
    const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/new THREE\.\w*Light\b/.test(text) && !/\.visible\s*=/.test(text), `${f} makes or hides lights`);
  }
});

test('frame-cost proxies: what the frustum meets from typical views (chunks = draw calls, triangles)', async () => {
  const THREE = await import('three');
  const { setCaveBakeProvider, forgetCaveBakes } = await import('../src/shared/caveBake.js');
  const { buildCaveTerrainMesh } = await import('../src/client/world/caveTerrain.js');
  const { CONFIG } = await import('../src/shared/config.js');
  forgetCaveBakes();
  setCaveBakeProvider((l, v) => readCaveBake(l, v, { mesh: true }));
  const mesh = buildCaveTerrainMesh(terrain, layout);
  assert.equal(mesh.userData.volumeStats.baked, true, 'from the bake');
  const chunks = mesh.children.find((c) => c.name === 'cave-volume').children.map((c) => ({ sph: c.geometry.boundingSphere, tris: c.geometry.index.count / 3 }));
  const cam = new THREE.PerspectiveCamera(CONFIG.player.fov, 16 / 9, 0.1, 900);
  const seen = (x, y, z, yaw, pitch, far) => {
    cam.far = far; cam.position.set(x, y, z); cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let n = 0, t = 0;
    for (const c of chunks) if (fr.intersectsSphere(c.sph)) { n++; t += c.tris; }
    return { chunks: n, tris: t };
  };
  const nodes = plan.cave.maze.nodes, H = (x, z) => terrain.heightAt(x, z) + 1.7;
  // inside the mountain the fog ends at ~46 m (levels.js biome.sky.fogFar): that is what the camera can see there
  const inside = [[-150, 20, -Math.PI / 2], [nodes[2].x, nodes[2].z, 0.7], [nodes[1].x, nodes[1].z, 1.5], [nodes[4].x, nodes[4].z, 3]];
  for (const [x, z, yaw] of inside) {
    const r = seen(x, H(x, z), z, yaw, 0, 60);
    assert.ok(r.chunks <= 60 && r.tris <= 300000, `inside at (${x.toFixed(0)}, ${z.toFixed(0)}): ${r.chunks} chunks, ${r.tris} triangles`);
  }
  // from the beach the whole face is in view: the worst case (all of it, one draw call per chunk)
  const beach = seen(-232, 3, 20, -Math.PI / 2, 0.05, 900);
  assert.ok(beach.chunks <= 300 && beach.tris <= 1.1e6, `from the beach: ${beach.chunks} chunks, ${beach.tris} triangles`);
  forgetCaveBakes();
  setCaveBakeProvider(null);
});
