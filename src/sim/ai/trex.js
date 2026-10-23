// T-Rex: rare apex predator that creates danger and chaos. Patrols a long
// loop, stops and looks when something catches its eye, walks over to
// noises it hears (a gunshot carries far), roars at players it sees and
// chases them while the chase pays (a sprinting player can escape, breaking
// the line of sight makes it search where it lost you; the hut is always
// safe), bites hard, then rests.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { LEVEL, perceive, perceived, alarm, forget, afterDowned, searchGoal, senseSpec } from './senses.js';
import { curve, score } from './utility.js';

const C = CONFIG.dinos.trex;
const SIGHT = senseSpec('trex').sightRange;
const E = C.ai.chase;
const BITE_WINDUP = 0.45;
/** Another player this close to the target: it is not alone (a lone target is worth a longer chase). */
const ALONE = 14;

/**
 * Chase economics (docs/dino-ai-concept.md 1, "chase economics"): how much the chase it sees is still worth,
 * 0..1. It drops while the gap does not close (allowed longer for a weak or lone target), the further it is
 * from where the chase began (`leash`) and the more hurt the T-Rex is. Below `E.worth` after `E.commitMin` s
 * it gives up; this replaces a fixed chase timer.
 */
export function chaseWorth(d, sys, t, dt) {
  const c = d.chase ??= { x: d.x, z: d.z, best: Infinity, stall: 0 };
  const dist = Math.hypot(t.x - d.x, t.z - d.z);
  if (dist < c.best - 0.5) { c.best = dist; c.stall = 0; } else c.stall += dt;
  const p = t.p;
  const weak = p?.maxHp ? 1 - p.hp / p.maxHp : 0;
  let alone = true;
  for (const q of sys.world.players.values()) if (q !== p && q.alive && Math.hypot(q.x - t.x, q.z - t.z) < ALONE) alone = false;
  const allow = E.giveUpNoGain * (1 + 0.6 * weak + (alone ? 0.3 : 0));
  return score([
    curve.inv(c.stall, allow * 0.4, allow),
    curve.inv(Math.hypot(d.x - c.x, d.z - c.z), E.leash * 0.6, E.leash),
    curve.linear(d.hp / (d.maxHp || 1), 0.1, 0.35),
  ]);
}

/** Back to the patrol, resting a while before it hunts again. */
function givesUp(d) {
  d.mode = 'patrol';
  d.modeT = 0;
  d.targetId = null;
  d.search = null;
  d.chase = null;
  d.rest = C.restTime;
}

export const trexBrain = {
  spawnInitial(sys) {
    const pts = sys.world.layout.trexPatrol;
    const count = sys.world.layout.level.dinos.trex;
    if (pts.length < 3) return;
    for (let i = 0; i < count; i++) {
      const k = Math.floor((i / count) * pts.length);
      sys.spawn('trex', pts[k].x, pts[k].z, { wp: (k + 1) % pts.length });
    }
  },

  respawn(sys) {
    const pts = sys.world.layout.trexPatrol;
    const i = Math.floor(Math.random() * pts.length);
    sys.spawn('trex', pts[i].x, pts[i].z, { wp: (i + 1) % pts.length });
  },

  init(d) {
    d.mode = 'patrol';
    d.modeT = 0;
    d.cool = 0;
    d.rest = 0;
    d.roarT = 0;
    d.nextRoar = 20 + Math.random() * 20;
  },

  /** Nudged free by the dino system: skip the unreachable patrol point. */
  onStuck(d, sys) {
    const n = sys.world.layout.trexPatrol.length;
    if (d.mode === 'patrol' && n) d.wp = (d.wp + 1) % n;
  },

  onHurt(d, sys, byId) {
    const p = sys.world.players.get(byId);
    alarm(d, sys, byId);
    if (!p || d.mode === 'chase' || d.mode === 'bite') return;
    d.targetId = byId;
    d.mode = 'roar';
    d.modeT = 0;
    d.rest = 0;
    sys.roar(d);
  },

  update(d, sys, dt) {
    d.modeT += dt;
    d.cool = Math.max(0, d.cool - dt);
    d.rest = Math.max(0, d.rest - dt);
    const pts = sys.world.layout.trexPatrol;

    // its target went down: it never finishes them off - a reviver it perceives, the next player, or nobody
    if (d.targetId != null && sys.world.players.get(d.targetId)?.downed && d.mode !== 'bite') {
      const next = afterDowned(d, sys, d.targetId);
      if (next) d.targetId = next.id;
      else givesUp(d);
    }
    const t = d.targetId != null ? perceived(d, sys, d.targetId) : null;
    const target = t?.p ?? null;
    const lost = !t;

    switch (d.mode) {
      case 'patrol': {
        d.fl &= ~1;
        if (d.rest <= 0) {
          const p = perceive(d, sys, LEVEL.ALERT);
          if (p) {
            d.targetId = p.id;
            d.modeT = 0;
            if (p.seen) { d.mode = 'roar'; sys.roar(d); } else d.mode = 'investigate';
            return;
          }
          // something caught its eye or ear: stop and look that way
          const hunch = perceive(d, sys, LEVEL.SUSPICIOUS);
          if (hunch) {
            sys.halt(d, dt);
            sys.turnTo(d, Math.atan2(-(hunch.x - d.x), -(hunch.z - d.z)), dt, C.turnRate);
            d.st = DS.ALERT;
            return;
          }
        }
        // occasional roar just to be scary
        d.nextRoar -= dt;
        if (d.nextRoar <= 0) {
          d.nextRoar = 25 + Math.random() * 25;
          d.mode = 'idleRoar';
          d.modeT = 0;
          sys.roar(d);
          return;
        }
        const wp = pts[d.wp % pts.length];
        const left = sys.steer(d, wp.x, wp.z, C.walkSpeed, dt);
        d.st = DS.WALK;
        if (left < 6) d.wp = (d.wp + 1) % pts.length;
        return;
      }
      case 'idleRoar':
      case 'roar': {
        sys.halt(d, dt);
        d.st = DS.ROAR;
        if (target) sys.turnTo(d, Math.atan2(-(target.x - d.x), -(target.z - d.z)), dt, C.turnRate * 1.5);
        if (d.modeT > 1.6) {
          d.mode = d.mode === 'roar' && !lost ? 'chase' : 'patrol';
          d.modeT = 0;
          d.chaseT = 0;
          d.chase = null;
        }
        return;
      }
      case 'investigate': {
        // heard something: walk over to where the noise was and look round there
        d.fl &= ~1;
        if (lost) { givesUp(d); d.rest = 0; return; }
        if (t.seen) { d.mode = 'roar'; d.modeT = 0; sys.roar(d); return; }
        const goal = searchGoal(d, sys, t);
        if (!goal) { forget(d, t.id); givesUp(d); d.rest = 0; return; }
        sys.steer(d, goal.x, goal.z, C.walkSpeed * 1.6, dt);
        d.st = DS.WALK;
        return;
      }
      case 'chase': {
        d.fl |= 1;
        d.chaseT = (d.chaseT || 0) + dt;
        // a chase that no longer pays (gap not closing, too far from where it began, badly hurt) is dropped;
        // hiding between trees that are too close for its body works too
        const worth = t?.seen ? chaseWorth(d, sys, t, dt) : 1;
        if (lost || (d.chaseT > E.commitMin && worth < E.worth) || (d.blockedT || 0) > 3 || sys.distTo(d, t.x, t.z) > SIGHT * 1.6) {
          if ((d.blockedT || 0) > 3) sys.roar(d);
          d.blockedT = 0;
          givesUp(d);
          return;
        }
        if (!t.seen) {
          // lost sight of you: where it saw you last, then around there
          const goal = searchGoal(d, sys, t);
          if (!goal) { forget(d, t.id); givesUp(d); return; }
          sys.steer(d, goal.x, goal.z, t.age < 3 ? C.runSpeed * 0.85 : C.walkSpeed * 1.6, dt);
          d.st = d.spd > C.walkSpeed * 1.3 ? DS.RUN : DS.WALK;
          return;
        }
        d.search = null;
        const dist = sys.distTo(d, target.x, target.z);
        if (dist < C.biteRange && d.cool <= 0) {
          d.mode = 'bite';
          d.modeT = 0;
          d.bitten = false;
          d.biteAt = target.id;
          sys.cue(d, target.id);
          return;
        }
        sys.steer(d, target.x, target.z, C.runSpeed, dt);
        d.st = DS.RUN;
        return;
      }
      case 'bite': {
        d.st = DS.ATTACK;
        sys.move(d, C.walkSpeed * 0.5, dt);
        if (target) sys.turnTo(d, Math.atan2(-(target.x - d.x), -(target.z - d.z)), dt, C.turnRate * 2);
        if (!d.bitten && d.modeT > BITE_WINDUP) {
          d.bitten = true;
          // the live player, never a remembered spot (a bite on someone who went down meanwhile: hurtPlayer refuses)
          const victim = sys.world.players.get(d.biteAt);
          if (victim && sys.distTo(d, victim.x, victim.z) < C.biteRange + 1) {
            sys.hitPlayer(d, victim, C.biteDamage, C.knockback, 1);
          }
        }
        if (d.modeT > 1.0) {
          d.mode = 'chase';
          d.cool = C.biteCooldown;
        }
        return;
      }
    }
  },
};
