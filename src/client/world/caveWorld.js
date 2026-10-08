// Everything the Hollow Mountain adds on top of the shared world builders (built only
// for `layout.plan.cave`, see core/game.js `#buildWorld`):
//   caveMesh.js   the roof
//   caveDecor.js  stalactites, stalagmites, columns, crystals, mushrooms, glow halos
//   caveFx.js     pooled crystal lights, the cave air (sun / fog / exposure by depth into the
//                 mountain), water lamps, drips, dust, daylight lures
//   caveCoves.js  the two outdoor coves (arrival wreck, driftwood, lanterns, mine supports)
// `update(dt, time, cam)` runs every frame; `audio` is set by Game.

import * as THREE from 'three';
import { buildCaveRoof } from './caveMesh.js';
import { buildCaveDecor } from './caveDecor.js';
import { buildCaveFx, caveTier } from './caveFx.js';
import { buildCaveCoves } from './caveCoves.js';

export function buildCaveWorld(terrain, layout, gfx, terrainMesh, water) {
  const group = new THREE.Group();
  group.name = 'cave-world';
  const tier = caveTier(gfx);
  const roof = buildCaveRoof(terrain, layout, terrainMesh.userData.caveMats.roof, terrainMesh.userData.sky);
  group.add(roof);
  const roofY = roof.userData.roofY;
  const decor = buildCaveDecor(terrain, layout, { roofY, tier });
  decor.roofY = roofY;
  group.add(decor.group);
  const fx = buildCaveFx(terrain, layout, gfx, water, tier, decor, terrainMesh.userData.sky);
  group.add(fx.group);
  const coves = buildCaveCoves(terrain, layout, { roofY });
  group.add(coves.group);

  const api = {
    group, roof, decor, fx, coves, sky: terrainMesh.userData.sky, audio: null,
    get inside() { return fx.inside; },
    get wet() { return fx.wet; },
    update(dt, time, cam) {
      fx.update(dt, time, cam, { audio: api.audio });
      decor.update(dt, time, cam);
      coves.update?.(dt, time, cam);
    },
  };
  return api;
}
