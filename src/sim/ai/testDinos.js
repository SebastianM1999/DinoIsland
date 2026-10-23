// Test species (docs/newDinos) whose own behaviour is not written yet: Dilophosaurus and Spinosaurus. Each runs
// the raptor's pack brain (`packHunterBrain`) as a pack of one: wander round its home, chase, attack (plays the
// Attack clip), back off. They notice players with their senses (ai/senses.js).
// All the new island 1 species (these two and the herbivores in triceratops.js, ankylosaurus.js,
// pachycephalosaurus.js) live on a ring round the hut (`ringHome`) on islands whose `level.dinos` names them.

import { CONFIG } from '../../shared/config.js';
import { packHunterBrain, spawnPack } from './raptor.js';

export const TEST_DINO_TYPES = ['dilophosaurus', 'spinosaurus'];
/** Every species on the hut ring, in ring order (the angle comes from the index). */
const RING_TYPES = ['triceratops', 'ankylosaurus', 'pachycephalosaurus', 'dilophosaurus', 'spinosaurus'];
const RING = 45;              // metres from the hut, far enough that predators do not camp the camp

/** The home of `type` on the hut ring, or null when this island has none of them (count = `level.dinos[type]`). */
export function ringHome(sys, type) {
  const layout = sys.world.layout;
  const n = layout.level?.dinos?.[type] ?? 0;
  const hut = layout.hut;
  if (!(n > 0) || !hut) return null;
  const a = (RING_TYPES.indexOf(type) / RING_TYPES.length) * Math.PI * 2;
  const cx = hut.x + Math.cos(a) * RING, cz = hut.z + Math.sin(a) * RING;
  const home = sys.randomWalkablePoint({ type, home: { x: cx, z: cz } }, cx, cz, 15);
  return { x: home.x, z: home.z, n };
}

function testBrain(type) {
  const C = CONFIG.dinos[type];
  return {
    ...packHunterBrain(type, C),
    spawnInitial(sys) {
      const home = ringHome(sys, type);
      if (!home) return;
      for (let i = 0; i < home.n; i++) spawnPack(sys, type, home.x, home.z, C.groupSize, { x: home.x, z: home.z });
    },
  };
}

export const TEST_BRAINS = Object.fromEntries(TEST_DINO_TYPES.map((type) => [type, testBrain(type)]));
