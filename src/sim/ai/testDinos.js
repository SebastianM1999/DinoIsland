// Test species (docs/newDinos): Triceratops, Ankylosaurus, Pachycephalosaurus, Dilophosaurus, Spinosaurus.
// Their Blender models are in the game before their own behaviour is written, so each one runs the raptor's
// pack brain (`packHunterBrain`) as a pack of one: wander round its home, chase, attack (plays the Attack clip),
// back off. Predators notice players by sight; `peaceful` species (CONFIG) only fight back after a hit.
// They spawn on a ring round the hut on islands whose `level.dinos` names them (island 1).

import { CONFIG } from '../../shared/config.js';
import { packHunterBrain, spawnPack } from './raptor.js';

export const TEST_DINO_TYPES = ['triceratops', 'ankylosaurus', 'pachycephalosaurus', 'dilophosaurus', 'spinosaurus'];
const RING = 45;              // metres from the hut, far enough that predators do not camp the camp

function testBrain(type, index) {
  const C = CONFIG.dinos[type];
  const acquire = C.peaceful ? () => null
    : (d, sys) => sys.nearestPlayer(d, C.sightRadius * sys.world.sightMul(), (p) => !sys.inSafeZone(p));
  return {
    ...packHunterBrain(type, C, acquire),
    spawnInitial(sys) {
      const layout = sys.world.layout;
      const n = layout.level?.dinos?.[type] ?? 0;
      const hut = layout.hut;
      if (!(n > 0) || !hut) return;
      const a = (index / TEST_DINO_TYPES.length) * Math.PI * 2;
      const cx = hut.x + Math.cos(a) * RING, cz = hut.z + Math.sin(a) * RING;
      const home = sys.randomWalkablePoint({ type, home: { x: cx, z: cz } }, cx, cz, 15);
      for (let i = 0; i < n; i++) spawnPack(sys, type, home.x, home.z, C.groupSize, { x: home.x, z: home.z });
    },
  };
}

export const TEST_BRAINS = Object.fromEntries(TEST_DINO_TYPES.map((type, i) => [type, testBrain(type, i)]));
