// Special places of an island: the wrecked boat on the east beach, caves,
// the old ruins, the dinosaur nest and (on volcanic islands) the volcano's
// smoke and glow. Models come from client/models/props/*.

import * as THREE from 'three';
import { buildBoat } from '../models/props/boat.js';
import { buildCave } from '../models/props/cave.js';
import { buildRuins } from '../models/props/ruins.js';
import { buildNest } from '../models/props/nest.js';
import { buildVolcanoFx } from '../models/props/volcano.js';

const ANIM_RANGE = 260;

export function buildSites(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'sites';
  const updaters = [];

  const boat = buildBoat(layout.boat);
  group.add(boat.group);
  updaters.push({ pos: new THREE.Vector3(layout.boat.x, layout.boat.y, layout.boat.z), u: boat });

  for (const c of layout.caves) group.add(buildCave(c, layout.biome));
  if (layout.ruins) group.add(buildRuins(layout.ruins, layout.biome));
  if (layout.nest) group.add(buildNest(layout.nest));
  if (layout.volcano) {
    const fx = buildVolcanoFx(layout.volcano);
    group.add(fx.group);
    updaters.push({ pos: null, u: fx });
  }

  group.traverse((o) => {
    if (o.isMesh && !o.material?.transparent) { o.castShadow = o.castShadow ?? true; o.receiveShadow = true; }
  });

  return {
    group,
    boat,
    update(dt, time, camPos) {
      for (const { pos, u } of updaters) {
        if (pos && camPos && camPos.distanceToSquared(pos) > ANIM_RANGE * ANIM_RANGE) continue;
        u.update?.(dt, time, camPos);
      }
    },
  };
}
