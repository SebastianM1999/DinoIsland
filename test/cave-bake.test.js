// The Hollow Mountain bake (src/shared/caveBake.js, scripts/bakeCave.mjs, assets/cave/island4-v7.bin): the committed file of the
// fixed map is what a live build makes, a stale one is ignored, and both loaders (the browser's, via bytes, and Node's, via
// the provider) hand the very same grid to the Terrain. If a test here fails because the file is stale: node scripts/bakeCave.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { buildCaveTerrainMesh } from '../src/client/world/caveTerrain.js';
import {
  walkKey, meshKey, caveBakeFor, registerCaveBake, forgetCaveBakes, setCaveBakeProvider, unpackBake, packBake,
  encodeWalk, decodeWalk, encodeMesh, decodeMesh, BAKE_FORMAT, bakeFile,
} from '../src/shared/caveBake.js';
import { registerBakeBytes } from '../src/shared/caveBakeLoad.js';
import { readCaveBake, bakePath } from '../server/caveBake.js';
import { makeRng } from '../src/shared/rng.js';

const LEVEL = 3;
const VARIANT = levelDef(LEVEL).variant;
const STALE = 'the bake is stale: run  node scripts/bakeCave.mjs  and commit assets/cave';

// live build first (no bake registered): the reference
const plan = planIsland(LEVEL, VARIANT);
const live = new Terrain(plan);
const layout = buildLayout(live);

test('the fixed map has a bake of a sane size, named after its island and variant', () => {
  assert.equal(bakeFile(LEVEL, VARIANT), `island4-v${VARIANT}.bin`);
  const size = fs.statSync(bakePath(LEVEL, VARIANT)).size;
  assert.ok(size < 15e6, `the bake is ${(size / 1e6).toFixed(1)} MB`);
  assert.ok(size > 1e6);
});

test('the committed bake carries the keys of the live code (else it is stale)', () => {
  const b = readCaveBake(LEVEL, VARIANT, { mesh: true });
  assert.ok(b, 'the file reads');
  assert.equal(b.header.format, BAKE_FORMAT);
  assert.equal(b.header.walkKey, walkKey(plan), STALE);
  assert.ok(b.walk && b.mesh);
});

test('the baked walk grid is bit for bit the live one, and the Terrain takes it', () => {
  const b = readCaveBake(LEVEL, VARIANT);
  const walk = decodeWalk(b.walk);
  assert.deepEqual(walk.tileIndex, live.walk.tileIndex, STALE);
  assert.deepEqual(walk.floor, live.walk.floor, STALE);
  assert.deepEqual(walk.ceil, live.walk.ceil, STALE);
  assert.equal(walk.nx, live.walk.nx);
  // through the provider (Node hosts): a Terrain built with it carries the baked grid and answers like the live one
  forgetCaveBakes();
  setCaveBakeProvider((l, v) => readCaveBake(l, v));
  const baked = new Terrain(planIsland(LEVEL, VARIANT));
  assert.equal(baked.walk.stats.baked, true);
  const rng = makeRng(5);
  for (let i = 0; i < 4000; i++) {
    const x = rng.range(-300, 300), z = rng.range(-290, 290);
    assert.equal(baked.heightAt(x, z), live.heightAt(x, z));
    assert.equal(baked.ceilingAt(x, z), live.ceilingAt(x, z));
  }
  assert.deepEqual(baked.heights, live.heights);
  setCaveBakeProvider(null);
  forgetCaveBakes();
});

test('the browser path: the bytes of the file are inflated and registered, and a Terrain uses them', async () => {
  forgetCaveBakes();
  const bytes = new Uint8Array(fs.readFileSync(bakePath(LEVEL, VARIANT)));
  assert.equal(await registerBakeBytes(LEVEL, VARIANT, bytes, { mesh: false }), true);
  const p = planIsland(LEVEL, VARIANT);
  assert.ok(caveBakeFor(p, 'walk'));
  assert.equal(caveBakeFor(p, 'mesh'), null, 'the sim skipped the mesh section');
  assert.equal(new Terrain(p).walk.stats.baked, true);
  assert.equal(await registerBakeBytes(LEVEL, VARIANT, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), {}), false, 'foreign bytes are no bake');
  forgetCaveBakes();
});

test('a stale or foreign bake is rejected and the island builds live', () => {
  const b = readCaveBake(LEVEL, VARIANT);
  const p = planIsland(LEVEL, VARIANT);
  forgetCaveBakes();
  registerCaveBake(LEVEL, VARIANT, b);
  assert.ok(caveBakeFor(p, 'walk'), 'the fresh bake is accepted');
  // another walk-sampling version / field => another key
  for (const tampered of [{ ...b.header, walkKey: '0123456789abcdef' }, { ...b.header, walkKey: walkKey(p).slice(0, 15) + '0' }]) {
    registerCaveBake(LEVEL, VARIANT, { ...b, header: tampered });
    assert.equal(caveBakeFor(p, 'walk'), null);
    assert.equal(new Terrain(planIsland(LEVEL, VARIANT)).walk.stats.baked, undefined, 'built live');
  }
  // the key follows the map and the painter's numbers
  assert.notEqual(walkKey(planIsland(LEVEL, VARIANT + 1)), walkKey(p));
  assert.notEqual(meshKey(p, [1]), meshKey(p, [2]));
  assert.notEqual(meshKey(p, [1]), walkKey(p));
  // a file of another format or with a broken magic is none
  const raw = new Uint8Array(fs.readFileSync(bakePath(LEVEL, VARIANT)));
  assert.ok(unpackBake(raw));
  const broken = raw.slice(); broken[0] = 0x58;
  assert.equal(unpackBake(broken), null);
  const future = raw.slice(); new DataView(future.buffer).setUint32(4, BAKE_FORMAT + 1, true);
  assert.equal(unpackBake(future), null);
  // another island has no bake
  assert.equal(caveBakeFor(planIsland(0, 1), 'walk'), null);
  forgetCaveBakes();
});

test('pack, encode and decode round-trip: exact walk grid, mesh within its quantisation', () => {
  const walk = decodeWalk(encodeWalk(live.walk));
  assert.deepEqual(walk.floor, live.walk.floor);
  const rng = makeRng(9);
  const chunks = [0, 1].map((ci) => {
    const m = 300, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), sf = new Float32Array(m * 4), sf2 = new Float32Array(m * 2), lt = new Float32Array(m * 3), gl = new Float32Array(m * 3);
    for (let v = 0; v < m; v++) {
      for (let k = 0; k < 3; k++) { pos[v * 3 + k] = rng.range(-50, 50); col[v * 3 + k] = rng.range(0, 1.2); lt[v * 3 + k] = rng(); gl[v * 3 + k] = rng() * rng(); }
      const n = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)], l = Math.hypot(...n);
      nor.set(n.map((q) => q / l), v * 3);
      for (let k = 0; k < 4; k++) sf[v * 4 + k] = rng();
      for (let k = 0; k < 2; k++) sf2[v * 2 + k] = rng();
    }
    return { pos, nor, col, sf, sf2, lt, gl, idx: Uint32Array.from({ length: 90 }, () => Math.floor(rng() * m)), ci, ck: 3 };
  });
  const back = decodeMesh(encodeMesh(chunks));
  assert.equal(back.length, 2);
  back.forEach((b, c) => {
    const a = chunks[c];
    assert.deepEqual(Array.from(b.idx), Array.from(a.idx));
    assert.equal(b.ck, 3);
    for (let i = 0; i < a.pos.length; i++) assert.ok(Math.abs(a.pos[i] - b.pos[i]) < 0.003, 'positions within 3 mm');
    for (let v = 0; v < a.pos.length / 3; v++) {
      const dot = a.nor[v * 3] * b.nor[v * 3] + a.nor[v * 3 + 1] * b.nor[v * 3 + 1] + a.nor[v * 3 + 2] * b.nor[v * 3 + 2];
      assert.ok(dot > 0.998, `normal off by ${(Math.acos(Math.min(1, dot)) * 57.3).toFixed(2)} deg`);
    }
    for (let i = 0; i < a.col.length; i++) assert.ok(Math.abs(a.col[i] - b.col[i]) < 0.02 + 0.02 * a.col[i], 'colours within 8 bit gamma steps');
    for (let i = 0; i < a.sf.length; i++) assert.ok(Math.abs(a.sf[i] - b.sf[i]) < 1 / 255);
    for (let i = 0; i < a.lt.length; i++) assert.ok(Math.abs(a.lt[i] - b.lt[i]) < 1 / 255 + 1e-6, 'baked ao / sky / shimmer within 8 bits');
    for (let i = 0; i < a.gl.length; i++) assert.ok(Math.abs(a.gl[i] - b.gl[i]) < 0.012, 'baked glow within 8 bit sqrt steps');
  });
  const packed = packBake({ header: { x: 1 }, sections: { a: new Uint8Array([1, 2, 3]), b: new Uint8Array([9]) } });
  const un = unpackBake(packed);
  assert.deepEqual(Array.from(un.section('a')), [1, 2, 3]);
  assert.deepEqual(Array.from(un.section('b')), [9]);
  assert.equal(un.section('c'), null);
});

test('the baked mesh matches a live build: same chunks, vertex counts, bounds and sampled vertices', () => {
  const b = readCaveBake(LEVEL, VARIANT, { mesh: true });
  forgetCaveBakes();
  const liveMesh = buildCaveTerrainMesh(live, layout);                 // (no bake registered: meshed and painted live)
  assert.equal(liveMesh.userData.volumeStats.baked, undefined);
  assert.equal(b.header.meshKey, liveMesh.userData.bakeKey, STALE);
  registerCaveBake(LEVEL, VARIANT, b);
  const bakedMesh = buildCaveTerrainMesh(live, layout);                // (the key matches: taken from the bake)
  assert.equal(bakedMesh.userData.volumeStats.baked, true);
  const groups = [liveMesh, bakedMesh].map((m) => m.children.find((c) => c.name === 'cave-volume').children);
  assert.equal(groups[1].length, groups[0].length, 'chunk count');
  let verts = 0, tris = 0;
  const box = (g) => { g.computeBoundingBox(); return g.boundingBox; };
  groups[0].forEach((a, i) => {
    const c = groups[1][i], ga = a.geometry, gc = c.geometry;
    assert.deepEqual(c.userData.chunk, a.userData.chunk);
    assert.equal(gc.attributes.position.count, ga.attributes.position.count, `chunk ${i} vertices`);
    assert.equal(gc.index.count, ga.index.count, `chunk ${i} indices`);
    assert.deepEqual(Array.from(gc.index.array.slice(0, 600)), Array.from(ga.index.array.slice(0, 600)));
    const ba = box(ga), bc = box(gc);
    for (const k of ['x', 'y', 'z']) { assert.ok(Math.abs(ba.min[k] - bc.min[k]) < 0.01 && Math.abs(ba.max[k] - bc.max[k]) < 0.01, `chunk ${i} bounds ${k}`); }
    const pa = ga.attributes.position.array, pc = gc.attributes.position.array, ca = ga.attributes.color.array, cc = gc.attributes.color.array;
    const la = ga.attributes.bake.array, lc = gc.attributes.bake.array, wa = ga.attributes.glow.array, wc = gc.attributes.glow.array;
    const na = ga.attributes.normal.array, nc = gc.attributes.normal.array, sa = ga.attributes.surface.array, sc = gc.attributes.surface.array;
    for (let v = 0; v < pa.length / 3; v += 37) {
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(pa[v * 3 + k] - pc[v * 3 + k]) < 0.005, `chunk ${i} vertex ${v} position`);
        assert.ok(Math.abs(ca[v * 3 + k] - cc[v * 3 + k]) < 0.02 + 0.02 * ca[v * 3 + k], `chunk ${i} vertex ${v} colour`);
      }
      const dot = na[v * 3] * nc[v * 3] + na[v * 3 + 1] * nc[v * 3 + 1] + na[v * 3 + 2] * nc[v * 3 + 2];
      assert.ok(dot > 0.998, `chunk ${i} vertex ${v} normal`);
      for (let k = 0; k < 4; k++) assert.ok(Math.abs(sa[v * 4 + k] - sc[v * 4 + k]) < 1 / 255 + 1e-6);
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(la[v * 3 + k] - lc[v * 3 + k]) < 1 / 255 + 1e-6, `chunk ${i} vertex ${v} baked light ${k}`);
        assert.ok(Math.abs(wa[v * 3 + k] - wc[v * 3 + k]) < 0.012, `chunk ${i} vertex ${v} baked glow ${k}`);
      }
    }
    verts += pa.length / 3; tris += ga.index.count / 3;
  });
  assert.equal(tris, liveMesh.userData.volumeStats.triangles);
  assert.equal(verts, liveMesh.userData.volumeStats.vertices);
  assert.equal(b.header.stats.triangles, tris);
  forgetCaveBakes();
});

test('a bake with another mesh key is not used for the mesh (built live), but the walk grid still is', () => {
  const b = readCaveBake(LEVEL, VARIANT, { mesh: true });
  forgetCaveBakes();
  registerCaveBake(LEVEL, VARIANT, { ...b, header: { ...b.header, meshKey: 'ffffffffffffffff' } });
  const p = planIsland(LEVEL, VARIANT);
  assert.ok(caveBakeFor(p, 'walk'), 'the walk key is the old one: still valid');
  const mesh = buildCaveTerrainMesh(live, layout);
  assert.equal(mesh.userData.volumeStats.baked, undefined, 'the stale mesh was not used');
  assert.ok(mesh.children.find((c) => c.name === 'cave-volume').children.length > 300, 'and it was meshed live');
  forgetCaveBakes();
});
