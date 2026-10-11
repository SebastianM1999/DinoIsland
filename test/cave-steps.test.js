import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { volumeLattice, volumeLatticeSteps } from '../src/shared/caveVolume.js';
import { meshCaveVolumeSteps } from '../src/client/world/caveVolumeMesh.js';
import { bakeCaveLightSteps } from '../src/client/world/caveLight.js';

// The Hollow Mountain is built live in a browser whose V8 disagrees with the baked file (see shared/package-info.md),
// so its heavy loops must hand control back often: one task of seconds froze the loading screen.

const plan = planIsland(3, levelDef(3).variant);
const half = 380;

function drain(steps) {
  let yields = 0, step;
  while (!(step = steps.next()).done) yields++;
  return { yields, value: step.value };
}

test('the cave lattice is built a row per step and equals the synchronous build', () => {
  const stepped = drain(volumeLatticeSteps(plan, half));
  assert.ok(stepped.yields >= 800, `${stepped.yields} steps (two passes over several hundred rows)`);
  const sync = volumeLattice(plan, half);
  assert.equal(sync, stepped.value, 'cached per plan: the synchronous call returns the stepped result');
  assert.ok(sync.total > 1e6 && sync.N > 1e5);
});

test('meshing and light baking yield per chunk and per few hundred vertices', () => {
  const mesh = drain(meshCaveVolumeSteps(plan, { half }));
  assert.ok(mesh.yields >= mesh.value.chunks.length, 'at least one step per chunk');
  const lat = volumeLattice(plan, half);
  const sample = mesh.value.chunks.slice(0, 2);
  const light = drain(bakeCaveLightSteps(lat, sample, { sources: [], visAt: () => 1, waterAt: () => null }));
  const vertices = sample.reduce((n, ch) => n + ch.pos.length / 3, 0);
  assert.ok(light.yields >= Math.floor(vertices / 256) - sample.length, `${light.yields} steps for ${vertices} vertices`);
  assert.equal(light.value.vertices, vertices);
  assert.ok(sample.every(ch => ch.lt.length === ch.pos.length && ch.gl.length === ch.pos.length));
});
