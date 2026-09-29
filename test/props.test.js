import test from 'node:test';
import assert from 'node:assert/strict';
import { RELIC_KINDS } from '../src/shared/relics.js';
import { BIOMES } from '../src/shared/levels.js';
import { CAVE, caveColliders, caveInterior, caveMouth } from '../src/shared/caveShape.js';
import { ruinsColliders, ruinsCenter, RUINS_ALTAR_TOP } from '../src/shared/ruinsShape.js';
import { BOAT, boatColliders, boatInteractPoint } from '../src/shared/boatShape.js';
import { resolveCircle } from '../src/shared/collision.js';
import { TRUNKS, treeColliders } from '../src/shared/treeShapes.js';
import { relicMesh, relicModel } from '../src/client/models/props/relics.js';
import { buildBoat } from '../src/client/models/props/boat.js';
import { buildCave } from '../src/client/models/props/cave.js';
import { buildRuins } from '../src/client/models/props/ruins.js';
import { buildNest } from '../src/client/models/props/nest.js';
import { buildVolcanoFx } from '../src/client/models/props/volcano.js';
import { treeGeometry, TREE_VARIANTS, TREE_WIND } from '../src/client/world/veg/trees.js';
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
    const cols = { circles: caveColliders(c), boxes: [] };
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
