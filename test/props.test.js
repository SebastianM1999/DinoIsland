import test from 'node:test';
import assert from 'node:assert/strict';
import { RELIC_KINDS } from '../src/shared/relics.js';
import { BIOMES } from '../src/shared/levels.js';
import { CAVE, CAVE_WALKWAY, caveColliders, caveInterior, caveMouth, caveRockPiles, caveRockPilesLocal } from '../src/shared/caveShape.js';
import { ruinsColliders, ruinsCenter, ruinsLayout, RUINS_ALTAR_TOP } from '../src/shared/ruinsShape.js';
import { BOAT, boatColliders, boatInteractPoint } from '../src/shared/boatShape.js';
import { resolveCircle } from '../src/shared/collision.js';
import { TRUNKS, treeColliders } from '../src/shared/treeShapes.js';
import { relicMesh, relicModel } from '../src/client/models/props/relics.js';
import { buildBoat } from '../src/client/models/props/boat.js';
import { buildCave } from '../src/client/models/props/cave.js';
import { buildSpringCave, springSdf, SPRING_LIP_OFFSET, SPRING_FLOOR } from '../src/client/models/props/springCave.js';
import { buildRuins } from '../src/client/models/props/ruins.js';
import { buildNest } from '../src/client/models/props/nest.js';
import { buildVolcanoFx } from '../src/client/models/props/volcano.js';
import { treeGeometry, TREE_VARIANTS, TREE_WIND, CROWN_TYPES } from '../src/client/world/veg/trees.js';
import { BUSH_TYPES } from '../src/client/world/veg/plants.js';

const meshes = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n++; }); return n; };
const blocked = (x, z, cols) => resolveCircle(x, z, 0.4, cols).hit;

test('every relic kind builds a model and an animated pickup', () => {
  for (const kind of RELIC_KINDS) {
    assert.ok(meshes(relicModel(kind)) > 0, kind);
    const pickup = relicMesh(kind);
    pickup.update(1.5);
    assert.ok(meshes(pickup) > 1, `${kind} pickup has model + glow`);
  }
});

test('cave walls ring the interior and leave the mouth open', () => {
  for (const rot of [0, 1.1, -2.4]) {
    const c = { x: 20, z: -30, y: 4, rot, seed: 3 };
    const rocks = caveRockPiles(c).map((p) => ({ x: p.x, z: p.z, r: p.r, top: c.y + p.h, kind: 'rock' }));
    const cols = { circles: [...caveColliders(c), ...rocks], boxes: [] };
    const inner = caveInterior(c), mouth = caveMouth(c);
    assert.ok(!blocked(inner.x, inner.z, cols), 'interior is walkable');
    assert.ok(!blocked(mouth.x, mouth.z, cols), 'mouth is walkable');
    // walk straight from the mouth to the relic without hitting a wall
    for (let t = 0; t <= 1; t += 0.05) {
      const x = mouth.x + (inner.x - mouth.x) * t, z = mouth.z + (inner.z - mouth.z) * t;
      assert.ok(!blocked(x, z, cols), `entrance path clear at t=${t.toFixed(2)}`);
    }
    // behind the cave (opposite the mouth) the wall blocks
    const back = { x: 2 * c.x - mouth.x, z: 2 * c.z - mouth.z };
    const dx = (back.x - c.x) / Math.hypot(back.x - c.x, back.z - c.z), dz = (back.z - c.z) / Math.hypot(back.x - c.x, back.z - c.z);
    assert.ok(blocked(c.x + dx * (CAVE.inner + CAVE.wallR), c.z + dz * (CAVE.inner + CAVE.wallR), cols), 'back wall is solid');
  }
});

test('ruins, boat and nest colliders are sane', () => {
  const r = { x: 5, z: 5, y: 2, rot: 0.7, seed: 11 };
  const rc = ruinsColliders(r);
  assert.ok(rc.circles.length >= 6 && rc.boxes.length >= 3);
  const center = ruinsCenter(r);
  assert.ok(blocked(center.x, center.z, rc), 'altar is solid');
  assert.ok(RUINS_ALTAR_TOP > 0.8 && RUINS_ALTAR_TOP < 1.5);
  for (const b of rc.boxes) assert.ok(b.top > r.y && Number.isFinite(b.rot));

  const boat = { x: -10, z: 3, y: 1, rot: 0.9 };
  const bc = { circles: [], boxes: boatColliders(boat) };
  assert.ok(blocked(boat.x, boat.z, bc), 'hull is solid');
  const ip = boatInteractPoint(boat);
  assert.ok(!blocked(ip.x, ip.z, bc), 'interact spot is free');
  assert.ok(Math.hypot(ip.x - boat.x, ip.z - boat.z) < BOAT.length / 2);
  // bow is at local +x -> world (cos rot, -sin rot)
  const bow = { x: boat.x + Math.cos(boat.rot) * 4.6, z: boat.z - Math.sin(boat.rot) * 4.6 };
  assert.ok(blocked(bow.x, bow.z, bc), 'bow is covered');
});

test('props build for both biomes', () => {
  for (const id of ['jungle', 'volcano']) {
    assert.ok(meshes(buildCave({ x: 0, z: 0, y: 0, rot: 0.3, seed: 2 }, BIOMES[id])) > 0);
    assert.ok(meshes(buildRuins({ x: 0, z: 0, y: 0, rot: 0.3, seed: 2 }, BIOMES[id])) > 0);
  }
  assert.ok(meshes(buildNest({ x: 0, z: 0, y: 0, rot: 0, size: 1.2 })) > 0);
  const boat = buildBoat({ x: 0, z: 0, y: 0, rot: 0 });
  boat.setParts(['egg', 'sail', 'rudder']);
  boat.setRepaired(true);
  boat.update(0.016, 2);
  boat.setRepaired(false);
  const fx = buildVolcanoFx({ x: 0, z: 0, craterY: 40, craterR: 10 });
  for (let i = 0; i < 30; i++) fx.update(0.05, i * 0.05, { x: 0, y: 0, z: 0 });
});

test('every tree type has geometry, wind, and matching colliders; bush types build', () => {
  for (const [type, n] of Object.entries(TREE_VARIANTS)) {
    assert.ok(TREE_WIND[type], `${type} wind`);
    assert.equal(TRUNKS[type].length, n, `${type} variants match TRUNKS`);
    for (let v = 0; v < n; v++) {
      const g = treeGeometry(type, v);
      assert.ok(g.trunk.attributes.position.count > 0 && g.foliage.attributes.position.count > 0, `${type}:${v}`);
      const cols = treeColliders({ id: v, type, x: 0, z: 0, y: 0, scale: 1, rot: 0, lean: 0, hue: 0.5 });
      assert.ok(cols.length > 0 && cols.every((c) => c.r > 0 && c.top > c.bottom));
    }
  }
  for (const [k, b] of Object.entries(BUSH_TYPES)) {
    assert.ok(b.geometry().attributes.position.count > 0, k);
    assert.ok(b.wind.strength > 0 && 'pivotY' in b.wind && 'frequency' in b.wind && 'heightScale' in b.wind);
  }
});

test('pines: the needles cover the trunk to its tip and nothing floats above them', () => {
  assert.ok(!CROWN_TYPES.has('pine'), 'no lumpy crown warp on the thin tiers');
  for (let v = 0; v < TREE_VARIANTS.pine; v++) {
    const g = treeGeometry('pine', v);
    g.trunk.computeBoundingBox();
    const trunkTop = g.trunk.boundingBox.max.y;
    const p = g.foliage.attributes.position;
    // the highest foliage point stands above the trunk's end
    let top = -Infinity;
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
    assert.ok(top > trunkTop + 0.8, `pine ${v}: the tip ${top.toFixed(2)} over the trunk ${trunkTop.toFixed(2)}`);
    // no gap up the crown: every metre from the lowest tier to the tip holds foliage
    let low = Infinity;
    for (let i = 0; i < p.count; i++) low = Math.min(low, p.getY(i));
    for (let y = low; y < top; y += 0.5) {
      let hit = false;
      for (let i = 0; i < p.count && !hit; i++) hit = Math.abs(p.getY(i) - y) < 0.6;
      assert.ok(hit, `pine ${v}: a gap in the crown at ${y.toFixed(1)} m`);
    }
  }
});

test('cave rubble piles are deterministic, stay off the walkway and match the model frame', () => {
  for (const seed of [1, 2, 3, 17, 99]) {
    const local = caveRockPilesLocal(seed);
    assert.ok(local.length >= 6, `seed ${seed}: enough rubble`);
    assert.deepEqual(local, caveRockPilesLocal(seed), 'deterministic');
    for (const p of local) {
      assert.ok(p.r > 0 && p.h > 0 && p.h < 2);
      if (p.z < -4) assert.ok(Math.abs(p.x) - p.r >= CAVE_WALKWAY - 1e-9, 'walkway stays free');
    }
    const c = { x: -12, z: 40, y: 3, rot: 2.2, seed };
    const world = caveRockPiles(c);
    assert.equal(world.length, local.length);
    // world = local turned like THREE rotation.y
    const p = local[0], w = world[0];
    assert.ok(Math.abs(w.x - (c.x + p.x * Math.cos(c.rot) + p.z * Math.sin(c.rot))) < 1e-9);
    assert.ok(Math.abs(w.z - (c.z - p.x * Math.sin(c.rot) + p.z * Math.cos(c.rot))) < 1e-9);
  }
});

test('spring cave builds for both biomes with a clear lip and a free fall zone', () => {
  for (const id of ['jungle', 'volcano']) {
    const g = buildSpringCave({ x: 10, y: 20, z: -5, rot: 0.8, width: 4.5 }, BIOMES[id]);
    assert.ok(meshes(g) >= 2);
    assert.equal(g.position.y, 20);
    assert.ok(Math.abs(g.rotation.y - 0.8) < 1e-9);
    assert.ok(g.userData.water?.isMesh, 'stream surface exposed');
  }
  assert.ok(SPRING_LIP_OFFSET > 0 && SPRING_LIP_OFFSET < 0.6, 'outlet has no projecting shelf');
  for (const seed of [1, 77, 500, 3333, 9000]) {
    const { sdf } = springSdf(4.5, seed);
    // the stream bed inside the opening sits just below the lip height
    for (const [x, z] of [[0, 1.5], [1.5, 1], [-1.5, 1]]) {
      let floor = null;
      for (let y = 1; y > -1.5; y -= 0.02) if (sdf(x, y, z) < 0) { floor = y; break; }
      assert.ok(floor !== null && floor > SPRING_FLOOR - 0.3 && floor < 0.1, `seed ${seed}: floor at ${x},${z} = ${floor}`);
    }
    // the opening is open (air) up to ~3.5 m above the lip
    assert.ok(sdf(0, 3.3, -0.5) > 0 && sdf(1.8, 1.5, 0) > 0, 'opening is open');
    // in front of the lip and below it, nothing blocks the falling water
    for (let y = -0.1; y > -6; y -= 0.25) {
      for (const x of [-2, 0, 2]) assert.ok(sdf(x, y, -SPRING_LIP_OFFSET - 0.05) > 0, `seed ${seed}: water path clear at y=${y.toFixed(2)} x=${x}`);
    }
  }
});

test('ruins overgrowth: rubble and collapsed walls get colliders and leave the entrance free', () => {
  for (const seed of [1, 2, 11, 42, 77]) {
    const r = { x: 0, z: 0, y: 1, rot: 0, seed };
    const L = ruinsLayout(r);
    assert.ok(L.rubble.length >= 3 && L.roots.length >= 3, `seed ${seed}`);
    const cols = ruinsColliders(r);
    const tall = L.rubble.filter((p) => p.h > 0.6).length + L.slabs.filter((s) => s.h > 0.6).length;
    assert.ok(cols.circles.length + cols.boxes.length >= 6 + tall);
    for (const p of L.rubble.filter((q) => q.h > 0.6)) assert.ok(blocked(p.x, p.z, cols), 'tall rubble is solid');
    // straight walk from outside through the arch to the altar
    for (let z = -11; z < -1.6; z += 0.25) assert.ok(!blocked(0, z, cols), `seed ${seed}: entrance clear at z=${z}`);
  }
});
