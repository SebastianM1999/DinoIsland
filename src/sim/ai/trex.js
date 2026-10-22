// T-Rex: rare apex predator that creates danger and chaos. Patrols a long
// loop, stops and looks when something catches its eye, walks over to
// noises it hears (a gunshot carries far), roars at players it sees and
// chases them for a limited time (a sprinting player can escape, breaking
// the line of sight makes it search where it lost you; the hut is always
// safe), bites hard, then rests.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { LEVEL, perceive, perceived, alarm, forget, afterDowned, searchGoal, senseSpec } from './senses.js';

const C = CONFIG.dinos.trex;
const SIGHT = senseSpec('trex').sightRange;
const BITE_WINDUP = 0.45;

/** Back to the patrol, resting a while before it hunts again. */
function givesUp(d) {
  d.mode = 'patrol';
  d.modeT = 0;
  d.targetId = null;
  d.search = null;
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
        d.chaseT += dt;
        // hiding between trees that are too close for its body works: it gives up
        if (lost || d.chaseT > C.chaseTime || (d.blockedT || 0) > 3 || sys.distTo(d, t.x, t.z) > SIGHT * 1.6) {
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
