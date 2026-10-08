// Gloom Raptor: the cave-dwelling, nearly blind cousin of the Velociraptor. It lives in packs in the
// tunnel maze of the "Hollow Mountain" level. The pack logic (wander, flank, hit-and-run, fear) is the
// raptor's (`packHunterBrain`); what differs is how it notices players: by NOISE, not by sight.

import { CONFIG } from '../../shared/config.js';
import { plodderChambers } from '../../shared/caveDinos.js';
import { packHunterBrain, spawnPack } from './raptor.js';

const C = CONFIG.dinos['gloom-raptor'];
const TYPE = 'gloom-raptor';

/** A shot is heard this long after the trigger pull (seconds). */
const SHOT_MEMORY = 2.5;

/**
 * Light hook: does `d` notice `player` because of a carried light (torch, flare)? The torch feature
 * will return true here (a lit torch within `C.lightRadius`); until it exists nothing glows, so false.
 */
export function noticesLight(d, player) { // eslint-disable-line no-unused-vars
  return false;
}

/**
 * How far away `player` can be heard right now. Standing still is silent (the animal must nearly bump
 * into it, see `senseRadius`), walking is quiet, sprinting loud and gunfire/arrows loudest.
 */
export function noiseRadius(player, now) {
  let level = 0;
  if (now - (player.lastShotAt ?? -99) < SHOT_MEMORY) level = C.shotNoise;
  else if (player.sprinting) level = C.sprintNoise;
  else if ((player.spd ?? 0) > 0.6) level = C.walkNoise;
  return C.hearingRadius * level * (player.mods?.stalkerMul ?? 1);
}

/** Pack target selection: nearest player that is audible, touching distance, or carrying a light. */
function hearTarget(d, sys) {
  const now = sys.world.now;
  const sight = C.sightRadius * sys.world.sightMul();
  return sys.nearestPlayer(d, C.hearingRadius * C.shotNoise, (p) => {
    if (sys.inSafeZone(p)) return false;
    const dist = sys.distTo(d, p.x, p.z);
    return dist <= Math.max(C.senseRadius, sight * 0.5) || dist <= noiseRadius(p, now) || noticesLight(d, p);
  });
}

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
  ...packHunterBrain(TYPE, C, hearTarget),
};
