// Gloom Raptor: the cave-dwelling, nearly blind cousin of the Velociraptor. It lives in packs in the
// tunnel maze of the "Hollow Mountain" level. The pack logic (wander, surround, bite in turns, hit-and-run, fear, search) is the
// raptor's (`packHunterBrain`); what differs is its senses (CONFIG ai.senses, ai/senses.js): a few metres of
// sight, a long ear for noise events (it goes to where it heard the noise, not to where you went), anything
// within 7 m is felt, and a carried torch is seen from much further off.

import { CONFIG } from '../../shared/config.js';
import { plodderChambers } from '../../shared/caveDinos.js';
import { packHunterBrain, spawnPack } from './raptor.js';

const C = CONFIG.dinos['gloom-raptor'];
const TYPE = 'gloom-raptor';

export const gloomRaptorBrain = {
  /**
   * Packs only exist where the level layout provides cave chambers (`layout.caveDinoSpots`).
   * `level.dinos['gloom-raptor']` is the number of PACKS (2-3 each, like raptor zones); they take the
   * deep chambers first (relic chambers, then the biggest), never the entrance/exit halls or pockets,
   * and never a chamber a raptor zone or a Crystal Plodder (`plodderChambers`) already holds.
   */
  spawnInitial(sys) {
    const layout = sys.world.layout;
    const spots = layout.caveDinoSpots;
    const packs = layout.level?.dinos?.[TYPE] ?? 0;
    if (!Array.isArray(spots) || !spots.length || !(packs > 0)) return;
    const taken = new Set([...(layout.dinoZones?.raptor ?? []).map((z) => z.room), ...plodderChambers(layout).map((s) => s.id)].filter((r) => r != null));
    const tags = (s) => s.tags ?? [];
    const eligible = spots.filter((s) => (s.spawns?.length ?? 3) >= 3 && s.kind !== 'pocket'
      && !tags(s).includes('entrance') && !tags(s).includes('exit') && !taken.has(s.id));
    const order = [...eligible.filter((s) => tags(s).includes('relic')),
      ...eligible.filter((s) => !tags(s).includes('relic')).sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0))];
    order.slice(0, packs).forEach((s, i) => {
      spawnPack(sys, TYPE, s.x, s.z, 2 + (i % 2), { x: s.x, z: s.z }, Math.min(8, s.radius ?? 8));
    });
  },
  ...packHunterBrain(TYPE, C),
};
