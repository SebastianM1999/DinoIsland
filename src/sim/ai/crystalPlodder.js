// Crystal Plodder: the heavily armoured grazer of the Hollow Mountain's big halls. Peaceful as long as nobody hurts
// it or crowds it (`angerRadius`); then it turns its rump on the offender and swings its club tail (swept arc taken
// from the baked Attack clip, strong damage + knockback), charges a short burst at attackers who keep their distance,
// and calms down again after `calmTime` seconds of peace. It never leaves its hall far: no chasing across the maze.
// Shares the tail-sweep maths and the graze/wander loop with the Stegosaurus (`territorial.js`).

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { PLODDER_TYPE, plodderChambers } from '../../shared/caveDinos.js';
import { makeTailSweep, rearYaw, grazeWander } from './territorial.js';

const C = CONFIG.dinos[PLODDER_TYPE];
const TAIL_TIME = 1.2;          // length of the Attack clip (art/sources/crystal-plodder, CrystalPlodder_Attack)
const STRIKE_END = 0.7;         // after this the club only swings back: no more damage
const AIM_PHI = -0.4;           // target angle behind the plodder: the middle of the strike arc

/**
 * Club sweep measured from the baked Attack clip: [time s, min angle, max angle] of the club around the hip pivot
 * (angles from straight behind, + = the plodder's right), fitted metres. The wind-up carries the club to the right
 * (no damage), the strike whips it across to the left.
 */
const SWEEP = [[0.433, 0.187, 0.706], [0.467, 0.081, 0.606], [0.5, -0.184, 0.329], [0.533, -0.484, 0.001],
  [0.567, -0.665, -0.171], [0.6, -0.77, -0.262], [0.633, -0.858, -0.338], [0.667, -0.912, -0.36], [0.7, -0.909, -0.348]];
const tail = makeTailSweep({ sweep: SWEEP, strikeEnd: STRIKE_END, pivotBack: 0.63, reach: 2.33, halfWidth: 0.1 });
export const clubSweep = tail.tailSweep;
export const clubRelative = tail.tailRelative;
export const PLODDER_TIMING = { tail: TAIL_TIME, strikeStart: tail.strikeStart, strikeEnd: STRIKE_END };

/** A hall spawn point under a roof that clears the animal, preferring the spots the layout reserved. */
function spawnPoint(sys, s) {
  const ok = (p) => sys.terrain.clearanceAt(p.x, p.z) > C.height + 1 && sys.walkable(p.x, p.z, { type: PLODDER_TYPE, radius: C.radius });
  return [...(s.spawns ?? []), { x: s.x, z: s.z }].find(ok) ?? null;
}

function spawnIn(sys, s) {
  const p = spawnPoint(sys, s);
  if (!p) return null;
  return sys.spawn(PLODDER_TYPE, p.x, p.z, { group: `plodder-${s.id ?? 0}`, slot: 0, home: { x: s.x, z: s.z } });
}

function startTail(d, sys, target) {
  d.mode = 'tail';
  d.modeT = 0;
  d.tailVictims = new Set();
  sys.cue(d, target.id);
}

export const crystalPlodderBrain = {
  /** One plodder per eligible hall (`plodderChambers`: crystal halls first, never relic/entrance/exit/raptor chambers). */
  spawnInitial(sys) {
    for (const s of plodderChambers(sys.world.layout)) spawnIn(sys, s);
  },

  respawn(sys, r) {
    const rooms = plodderChambers(sys.world.layout);
    const home = rooms.find((s) => `plodder-${s.id ?? 0}` === r.group) ?? rooms[0];
    if (home) spawnIn(sys, home);
  },

  init(d) {
    d.anger = 0;
    d.mode = 'graze';
    d.modeT = 3 + Math.random() * 4;
    d.cool = 0;
    d.chargeDir = 0;
    d.hitThisCharge = false;
    d.wander = null;
    d.tailVictims = new Set();
  },

  /** Nudged free by the dino system: graze a moment, then wander somewhere else. */
  onStuck(d) {
    if (d.mode === 'walk') { d.mode = 'graze'; d.modeT = 1 + Math.random() * 2; }
  },

  onHurt(d, sys, byId) {
    d.anger = C.calmTime;
    if (sys.world.players.get(byId)) d.targetId = byId;
    sys.roar(d);
  },

  update(d, sys, dt) {
    d.cool = Math.max(0, d.cool - dt);
    const home = d.home;

    // crowded: a player inside the hall and very close upsets it (it warns with a bellow first)
    const intruder = sys.nearestPlayer(d, C.angerRadius, (p) => !sys.inSafeZone(p));
    if (intruder) {
      if (d.anger <= 0) sys.roar(d);
      d.anger = C.calmTime;
      d.targetId = d.targetId || intruder.id;
    }
    let target = d.targetId ? sys.world.players.get(d.targetId) : null;
    if (target && (!target.alive || sys.inSafeZone(target) || Math.hypot(target.x - home.x, target.z - home.z) > C.territoryRadius * 2.2)) {
      target = null;
      d.targetId = null;
      d.anger = Math.min(d.anger, 2);
    }
    if (d.anger > 0) d.anger -= dt;

    if (d.anger > 0 && target) {
      d.fl |= 1;
      const dist = sys.distTo(d, target.x, target.z);
      const toTarget = Math.atan2(-(target.x - d.x), -(target.z - d.z));

      if (d.mode === 'tail') {
        const t0 = d.modeT;
        d.modeT += dt;
        d.st = DS.TAIL;
        sys.halt(d, dt);
        // wind-up: swing the rump toward the target, then commit - no more turning once the strike starts
        if (d.modeT < tail.strikeStart) sys.turnTo(d, rearYaw(d, target.x, target.z, AIM_PHI), dt, C.turnRate * 2);
        tail.tailStrike(d, sys, t0, d.modeT, (p, rel) => sys.hitPlayer(d, p, C.tailDamage, C.tailKnockback, 1, { x: rel.px, z: rel.pz }));
        if (d.modeT >= TAIL_TIME) { d.mode = 'recover'; d.modeT = 0; d.cool = 1.5; }
        return;
      }
      if (d.mode === 'charge') {
        d.modeT += dt;
        d.st = DS.CHARGE;
        sys.turnTo(d, d.chargeDir + angleDiff(d.chargeDir, toTarget) * 0.25, dt, 0.6);
        sys.move(d, C.chargeSpeed, dt, 12);
        if (!d.hitThisCharge && dist < d.radius + 1.3) {
          d.hitThisCharge = true;
          sys.hitPlayer(d, target, C.chargeDamage, 9, 1);
          sys.cue(d, target.id);
        }
        const strayed = Math.hypot(d.x - home.x, d.z - home.z) > C.territoryRadius * 1.5;
        if (d.modeT > C.chargeDuration || (d.hitThisCharge && d.modeT > 0.4) || strayed) { d.mode = 'recover'; d.modeT = 0; d.cool = C.chargeCooldown; }
        return;
      }
      // choose the next move: club when close, short charge when the attacker keeps its distance
      if (d.cool <= 0 && dist < C.tailRange * (d.scale || 1)) { startTail(d, sys, target); return; }
      if (d.cool <= 0 && dist >= C.tailRange && dist < C.chargeRange) {
        d.mode = 'charge';
        d.modeT = 0;
        d.chargeDir = toTarget;
        d.hitThisCharge = false;
        sys.roar(d);
        return;
      }
      // recovering / out of range: keep the rump toward the offender but stay put
      d.mode = 'face';
      sys.halt(d, dt);
      sys.turnTo(d, dist < C.tailRange * 1.8 ? rearYaw(d, target.x, target.z, AIM_PHI) : toTarget, dt, C.turnRate);
      d.st = DS.ALERT;
      return;
    }

    // --- calm: graze and wander inside the hall
    grazeWander(d, sys, dt, C, home);
  },
};
