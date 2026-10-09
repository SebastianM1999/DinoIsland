// Hollow Mountain: over every walkable node the sim's ceiling is the first rock above the floor that the player sees
// (vertical rays through the real mesh), also where the roof is a thin sheet over an opening such as a tunnel mouth. A
// sheet thinner than the 1.25 m lattice is found at some walk nodes and not at the next; blending a finite roof with
// "no roof" (a huge number) used to read as open sky, so a jump ended inside rock the sim thought was air.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { levelDef } from '../src/shared/levels.js';
import { Terrain } from '../src/shared/terrain.js';
import { CONFIG } from '../src/shared/config.js';
import { meshCaveVolume } from '../src/client/world/caveVolumeMesh.js';
import { rayIndex } from './helpers/caveRays.js';

const LEVEL = 3;
const HEAD = CONFIG.player.height + 0.05;
const STEP = 0.5;      // grid of the check, offset by half a cell so it samples between the walk grid's nodes
const TOL = 1.3;       // sim ceiling vs the visible one (the mesh rounds the lattice samples; a 0.2 m membrane is no roof)

/** top of the air span a body stands in at (x, z) on floor `h`, rock slivers thinner than 0.3 m (mesh membranes) looked through; Infinity for the sky */
function visibleCeiling(ray, x, z, h) {
  const spans = ray.spans(x, z);
  let i = spans.findIndex((s) => s[0] - 0.4 <= h && s[1] > h + HEAD);
  if (i < 0) return null;
  let top = spans[i][1];
  while (i + 1 < spans.length && spans[i + 1][0] - top < 0.3) top = spans[++i][1];
  return top;
}

test('over every walkable node the ceiling is the first visible rock above the floor, thin roof sheets included', () => {
  const plan = planIsland(LEVEL, levelDef(LEVEL).variant);
  const terrain = new Terrain(plan);
  const ray = rayIndex(meshCaveVolume(plan, { half: terrain.half }));
  const W = terrain.walk;
  let n = 0, open = 0;
  const bad = [];
  for (let z = W.oz + STEP / 2; z < -W.oz; z += STEP) for (let x = W.ox + STEP / 2; x < -W.ox; x += STEP) {
    if (!W.covers(x, z)) continue;
    const h = terrain.heightAt(x, z);
    if (!(h < 14) || !(terrain.clearanceAt(x, z) >= HEAD)) continue;
    const vis = visibleCeiling(ray, x, z, h);
    if (vis === null) continue;
    n++;
    const sim = terrain.ceilingAt(x, z);
    if (vis === Infinity) open++;
    if (!(sim - vis <= TOL || (sim === Infinity && vis === Infinity))) bad.push([x, z, h, sim, vis]);   // (a lower sim roof only makes a head bump where nothing shows; the sim must not miss rock)
  }
  assert.ok(n > 100000 && open > 1000, `${n} nodes, ${open} open`);
  const fmt = (b) => b.map((v) => (v === Infinity ? 'sky' : v.toFixed(1))).join('/');
  assert.equal(bad.length, 0, `${bad.length} nodes where the sim roof misses visible rock (sim/visible), e.g. ${bad.slice(0, 6).map(fmt).join(' ')}`);
});
