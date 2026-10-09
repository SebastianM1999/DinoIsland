// Bakes the Hollow Mountain of a fixed map: its painted volume mesh and its walk grid (floor and ceiling the sim and the
// controller collide with) into assets/cave/island<N>-v<variant>.bin, so loading the island skips seconds of meshing and
// painting (src/shared/caveBake.js has the format and the keys that make a stale file ignored).
//
//   node scripts/bakeCave.mjs [variant...]     (default: the fixed map of levels.js)
//
// Run it again after any change to the cave field (caveField/caveMaze/caveVolume), the walk sampling (caveWalk), the mesher
// (caveVolumeMesh), the vertex paint (caveTerrain) or the palette; test/cave-bake.test.js fails when the committed file is stale.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { packBake, encodeWalk, encodeMesh, walkKey } from '../src/shared/caveBake.js';
import { buildCaveTerrainMesh } from '../src/client/world/caveTerrain.js';
import { bakePath } from '../server/caveBake.js';

const LEVEL = 3;
const args = process.argv.slice(2).map(Number).filter((v) => v > 0);
const variants = args.length ? args : [levelDef(LEVEL).variant];

for (const variant of variants) {
  const t0 = performance.now();
  const plan = planIsland(LEVEL, variant);
  const terrain = new Terrain(plan);
  const tTerrain = performance.now();
  const layout = buildLayout(terrain);
  const mesh = buildCaveTerrainMesh(terrain, layout);
  const tMesh = performance.now();
  const group = mesh.children.find((c) => c.name === 'cave-volume');
  const chunks = group.children.map((c) => ({
    pos: c.geometry.attributes.position.array, nor: c.geometry.attributes.normal.array, col: c.geometry.attributes.color.array,
    sf: c.geometry.attributes.surface.array, sf2: c.geometry.attributes.surface2.array, idx: c.geometry.index.array,
    ci: c.userData.chunk[0], ck: c.userData.chunk[1],
  }));
  const walkRaw = encodeWalk(terrain.walk), meshRaw = encodeMesh(chunks);
  const gz = (u8) => new Uint8Array(zlib.gzipSync(u8, { level: 9 }));
  const walk = gz(walkRaw), meshZ = gz(meshRaw);
  const file = packBake({
    header: {
      level: LEVEL, variant, seed: plan.seed, walkKey: walkKey(plan), meshKey: mesh.userData.bakeKey,
      stats: { ...mesh.userData.volumeStats, walkTiles: terrain.walk.stats.tiles }, made: new Date().toISOString().slice(0, 10),
    },
    sections: { walk, mesh: meshZ },
  });
  const out = bakePath(LEVEL, variant);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, file);
  const mb = (n) => (n / 1048576).toFixed(2);
  console.log(`island ${LEVEL + 1} variant ${variant}: ${out}`);
  console.log(`  walk ${mb(walkRaw.length)} MB raw -> ${mb(walk.length)} MB, mesh ${mb(meshRaw.length)} MB raw -> ${mb(meshZ.length)} MB, file ${mb(file.length)} MB`);
  console.log(`  ${chunks.length} chunks, ${mesh.userData.volumeStats.triangles} triangles, built live in ${((tMesh - t0) / 1000).toFixed(1)} s (terrain ${((tTerrain - t0) / 1000).toFixed(1)} s)`);
}
