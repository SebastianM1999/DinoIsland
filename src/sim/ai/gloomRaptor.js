// Gloom Raptor: the cave-dwelling, nearly blind cousin of the Velociraptor. It lives in packs in the
// tunnel maze of the "Hollow Mountain" level. The pack logic (wander, flank, hit-and-run, fear) is the
// raptor's (`packHunterBrain`); what differs is how it notices players: by NOISE, not by sight.

import { CONFIG } from '../../shared/config.js';
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
  /** Packs only exist where the level layout provides cave spots: `layout.caveDinoSpots = [{ x, z, radius }]`. */
  spawnInitial(sys) {
    const layout = sys.world.layout;
    const spots = layout.caveDinoSpots;
    const total = layout.level?.dinos?.[TYPE] ?? 0;
    if (!Array.isArray(spots) || !spots.length || !(total > 0)) return;
    const base = Math.floor(total / spots.length), extra = total % spots.length;
    spots.forEach((s, i) => {
      const n = base + (i < extra ? 1 : 0);
      if (n > 0) spawnPack(sys, TYPE, s.x, s.z, n, { x: s.x, z: s.z }, Math.min(8, s.radius ?? 8));
    });
  },
  ...packHunterBrain(TYPE, C, hearTarget),
};
