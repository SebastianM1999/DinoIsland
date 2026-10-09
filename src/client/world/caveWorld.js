// Everything the Hollow Mountain adds on top of the shared world builders (built only
// for `layout.plan.cave`, see core/game.js `#buildWorld`):
//   (the mountain itself, roof included, is the volume mesh of terrainMesh -> caveTerrain.js / caveVolumeMesh.js)
//   caveDecor.js  stalactites, stalagmites, columns, crystals, mushrooms, glow halos
//   caveFx.js     pooled crystal lights, the cave air (sun / fog / exposure by depth into the
//                 mountain), water lamps, drips, dust, daylight lures
//   wallTorches.js the sconces the team lights one by one (flames, halos, a small light pool)
//   caveCoves.js  the two outdoor coves (the arrival boat, dune grass; nothing man-made at the mountain)
// `update(dt, time, cam)` runs every frame; `audio` is set by Game.

import * as THREE from 'three';
import { caveRoofBase } from '../../shared/caveField.js';
import { buildCaveDecor } from './caveDecor.js';
import { buildCaveFx, caveTier } from './caveFx.js';
import { buildCaveCoves } from './caveCoves.js';
import { buildWallTorches } from './wallTorches.js';
import { CAVE_SKY } from './caveSky.js';

export function buildCaveWorld(terrain, layout, gfx, terrainMesh, water) {
  const group = new THREE.Group();
  group.name = 'cave-world';
  const tier = caveTier(gfx);
  // where the decor hangs from: the roof of the volume (the sim's ceiling grid is sampled from the very same field, so it is the
  // visible roof), the stalactites' tops start a little inside the rock; where the grid has no roof (the rim of a wall) the
  // designed roof plus the noise's reach
  const plan = layout.plan;
  const roofY = (x, z) => { const c = terrain.ceilingAt(x, z); return c < Infinity ? c + 0.2 : caveRoofBase(plan, x, z) + 0.9; };
  const decor = buildCaveDecor(terrain, layout, { roofY, tier });
  decor.roofY = roofY;
  group.add(decor.group);
  const fx = buildCaveFx(terrain, layout, gfx, water, tier, decor, terrainMesh.userData.sky);
  group.add(fx.group);
  const coves = buildCaveCoves(terrain, layout, { roofY });
  group.add(coves.group);
  const wallTorches = buildWallTorches(terrain, layout, gfx);
  group.add(wallTorches.group);

  const api = {
    group, decor, fx, coves, wallTorches, sky: terrainMesh.userData.sky, audio: null,
    get inside() { return fx.inside; },
    get wet() { return fx.wet; },
    update(dt, time, cam) {
      CAVE_SKY.uCaveT.value = time % 3600;   // (the water shimmer of the volume's shader)
      fx.update(dt, time, cam, { audio: api.audio });
      decor.update(dt, time, cam);
      coves.update?.(dt, time, cam);
      wallTorches.update(dt, time, cam);
    },
  };
  return api;
}
