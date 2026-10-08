// Stegosaurus: territorial grazer. Gets angry when players come too close
// or attack it, charges in short bursts and swings its rump round to whip its
// spiked tail across everything behind it (swept arc hitbox, high damage +
// knockback). Hit it from the front and it whips its rump round and counters with a
// heavy swing - sprint out of reach during the wind-up to dodge.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { makeTailSweep, rearYaw, dir, smoothstep, grazeWander } from './territorial.js';

const C = CONFIG.dinos.stego;
const TAIL_TIME = 1.2;          // length of the Attack clip (art/sources/stego, Stegosaurus_Attack)
const STRIKE_END = 0.7;         // after this the tail only swings back: no more damage
const COUNTER_COOL = 3;
const COUNTER_AIM = 1.6;        // counter: the attacker ends up this far behind the hips ...
const COUNTER_SHIFT = 4.5;      // ... the body swings at most this far round its front legs to get there

/**
 * Tail sweep measured from the baked Attack clip: [time s, min angle, max angle] of the tail and
 * spikes around the hip pivot, angles from straight behind, + = the stego's right. The wind-up
 * carries the tail to the right (no damage), the strike whips it across to the left.
 */
const SWEEP = [[0.433, 0.328, 0.738], [0.467, 0.226, 0.645], [0.5, -0.013, 0.354], [0.533, -0.249, -0.051],
  [0.567, -0.573, -0.351], [0.6, -0.672, -0.415], [0.633, -0.871, -0.459], [0.667, -0.988, -0.464], [0.7, -1.032, -0.457]];
const PIVOT_BACK = 0.68;        // hip pivot behind the body centre (m, scale 1)
const TAIL_REACH = 4.1;         // pivot -> spike tips
const TAIL_HALF_WIDTH = 0.35;

const tail = makeTailSweep({ sweep: SWEEP, strikeEnd: STRIKE_END, pivotBack: PIVOT_BACK, reach: TAIL_REACH, halfWidth: TAIL_HALF_WIDTH });
const STRIKE_START = tail.strikeStart;
/** Angular span (around the hip pivot) the tail swept through between clip times t0 and t1. */
export const tailSweep = tail.tailSweep;
/** Hip pivot of the tail and where a player sits relative to it: distance + angle from behind. */
export const tailRelative = tail.tailRelative;

/** Swept tail hitbox: everyone inside the arc the tail crossed this tick gets hit once. */
function tailStrike(d, sys, t0, t1) {
  tail.tailStrike(d, sys, t0, t1, (p, rel) => {
    const counter = d.tailCounter;
    sys.hitPlayer(d, p, counter ? C.tailCounterDamage : C.tailDamage, counter ? C.tailCounterKnockback : C.tailKnockback, 1,
      { x: rel.px, z: rel.pz });
  });
}

const AIM_PHI = -0.2;            // target angle behind the stego: the middle of the strike arc

function startTail(d, sys, target, counter) {
  d.mode = 'tail';
  d.modeT = 0;
  d.tailVictims = new Set();
  d.tailCounter = counter;
  d.spin = null;
  if (counter) {
    // Pivot on the front legs: during the wind-up the rump swings round onto the attacker, so the
    // strike lands even on a spear stabbing the snout from 3 m. Committed - it does not follow
    // the player any more, so sprinting away during the wind-up dodges it.
    const k = d.scale || 1;
    const yaw = rearYaw(d, target.x, target.z, AIM_PHI);
    const [ax, az] = dir(yaw + AIM_PHI), [bx, bz] = dir(yaw);
    let gx = target.x - ax * COUNTER_AIM * k - bx * PIVOT_BACK * k, gz = target.z - az * COUNTER_AIM * k - bz * PIVOT_BACK * k;
    const shift = Math.hypot(gx - d.x, gz - d.z), max = COUNTER_SHIFT * k;
    if (shift > max) { gx = d.x + (gx - d.x) * max / shift; gz = d.z + (gz - d.z) * max / shift; }
    d.spin = { x: d.x, z: d.z, yaw: d.yaw, turn: angleDiff(d.yaw, yaw), gx, gz };
  }
  sys.cue(d, target.id);
}

/** Counter wind-up: rotate + slide the body toward the pivot goal (skips spots it cannot stand on). */
function spinStep(d, sys) {
  const s = d.spin, u = smoothstep(d.modeT / STRIKE_START);
  const x = s.x + (s.gx - s.x) * u, z = s.z + (s.gz - s.z) * u, yaw = s.yaw + s.turn * u;
  // never into water/cliffs; scenery is fine unless the step makes the overlap worse (the dino
  // system pushes the body out of trunks after every update anyway)
  if (sys.walkable(x, z, d) && (!sys.bodyBlocked(d, x, z, yaw) || sys.bodyBlocked(d, d.x, d.z, d.yaw))) { d.x = x; d.z = z; }
  d.yaw = yaw;
}

export const stegoBrain = {
  spawnInitial(sys) {
    sys.world.layout.dinoZones.stego.forEach((z, zi) => {
      const spawns = z.spawns.length ? z.spawns : [{ x: z.x, z: z.z }];
      for (let i = 0; i < C.groupSize; i++) {
        const s = spawns[i % spawns.length];
        sys.spawn('stego', s.x + i * 5, s.z + i * 2, { group: `stego-${zi}`, slot: i, home: { x: z.x, z: z.z } });
      }
    });
  },

  respawn(sys, r) {
    const zones = sys.world.layout.dinoZones.stego;
    const z = zones[Number(String(r.group).split('-')[1]) || 0] || zones[0];
    if (!z) return;
    const p = sys.randomWalkablePoint({ type: 'stego', home: z }, z.x, z.z, 12);
    sys.spawn('stego', p.x, p.z, { group: r.group, slot: 0, home: { x: z.x, z: z.z } });
  },

  init(d) {
    d.anger = 0;
    d.mode = 'graze';
    d.modeT = 3 + Math.random() * 4;
    d.chargeDir = 0;
    d.cool = 0;
    d.hitThisCharge = false;
    d.wander = null;
  },

  /** Nudged free by the dino system: graze a moment, then wander somewhere else. */
  onStuck(d) {
    if (d.mode === 'walk') { d.mode = 'graze'; d.modeT = 1 + Math.random() * 2; }
  },

  onHurt(d, sys, byId) {
    d.anger = C.calmTime;
    const p = sys.world.players.get(byId);
    if (p) d.targetId = byId;
    // Attacked from the front: whip round fast and answer with a heavy tail swing.
    if (p && d.alive && d.mode !== 'tail' && (d.counterCool || 0) <= 0
      && sys.distTo(d, p.x, p.z) < C.counterRange * (d.scale || 1)
      && Math.abs(angleDiff(d.yaw, Math.atan2(-(p.x - d.x), -(p.z - d.z)))) < C.counterCone) {
      d.targetId = byId;
      d.counterCool = COUNTER_COOL;
      startTail(d, sys, p, true);
    }
    // the whole group gets upset
    for (const o of sys.list) if (o.type === 'stego' && o.alive && o !== d && sys.distTo(o, d.x, d.z) < 30) { o.anger = C.calmTime; o.targetId = o.targetId || byId; }
  },

  update(d, sys, dt) {
    d.cool = Math.max(0, d.cool - dt);
    d.counterCool = Math.max(0, (d.counterCool || 0) - dt);
    const home = d.home;

    // provocation: players inside the territory and close to the animal
    const intruder = sys.nearestPlayer(d, C.angerRadius, (p) => !sys.inSafeZone(p) && Math.hypot(p.x - home.x, p.z - home.z) < C.territoryRadius * 1.3);
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
        // wind-up: swing the rump toward the target (aim at the middle of the strike arc), then
        // commit - no more turning once the strike starts, so a quick sprint away dodges it
        if (d.spin && d.modeT <= STRIKE_START + dt) spinStep(d, sys);
        else if (d.modeT < STRIKE_START) sys.turnTo(d, rearYaw(d, target.x, target.z, AIM_PHI), dt, C.turnRate * 1.6);
        tailStrike(d, sys, t0, d.modeT);
        if (d.modeT >= TAIL_TIME) { d.mode = 'recover'; d.modeT = 0; d.cool = 1.2; d.tailCounter = false; d.spin = null; }
        return;
      }
      if (d.mode === 'charge') {
        d.modeT += dt;
        d.st = DS.CHARGE;
        // committed charge: only small steering corrections
        sys.turnTo(d, d.chargeDir + angleDiff(d.chargeDir, toTarget) * 0.25, dt, 0.6);
        sys.move(d, C.chargeSpeed, dt, 12);
        if (!d.hitThisCharge && dist < d.radius + 1.3) {
          d.hitThisCharge = true;
          sys.hitPlayer(d, target, C.chargeDamage, 9, 1);
          sys.cue(d, target.id);
        }
        if (d.modeT > C.chargeDuration || (d.hitThisCharge && d.modeT > 0.4)) { d.mode = 'recover'; d.modeT = 0; d.cool = C.chargeCooldown; }
        return;
      }
      // choose the next attack
      if (d.cool <= 0 && dist < C.tailRange * (d.scale || 1)) {
        startTail(d, sys, target, false);
        return;
      }
      if (d.cool <= 0 && dist > 6 && dist < 28) {
        d.mode = 'charge';
        d.modeT = 0;
        d.chargeDir = toTarget;
        d.hitThisCharge = false;
        sys.roar(d);
        return;
      }
      // recover / reposition: face the intruder, stomp slowly toward them
      d.mode = 'face';
      if (dist > 4) {
        sys.steer(d, target.x, target.z, C.walkSpeed * 1.3, dt, C.turnRate);
        d.st = DS.WALK;
      } else {
        sys.halt(d, dt);
        sys.turnTo(d, toTarget, dt, C.turnRate);
        d.st = DS.ALERT;
      }
      return;
    }

    // --- calm: graze and wander inside the territory
    grazeWander(d, sys, dt, C, home);
  },
};
