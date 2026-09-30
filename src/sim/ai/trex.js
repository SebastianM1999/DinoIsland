// T-Rex: rare apex predator that creates danger and chaos. Patrols a long
// loop, roars, chases players it sees for a limited time (a sprinting
// player can escape; the hut is always safe), bites hard, then rests.
// Meat bait can lure it away.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';

const C = CONFIG.dinos.trex;
const BITE_WINDUP = 0.45;

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

  onHurt(d, sys, byId) {
    const p = sys.world.players.get(byId);
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

    const target = d.targetId ? sys.world.players.get(d.targetId) : null;
    const lost = !target || !target.alive || sys.inSafeZone(target);

    switch (d.mode) {
      case 'patrol': {
        d.fl &= ~1;
        // bait lures it
        const bait = sys.nearestBait(d, CONFIG.weapons.bait.attractRadius);
        if (bait) {
          if (sys.distTo(d, bait.x, bait.z) > 3) { sys.steer(d, bait.x, bait.z, C.walkSpeed * 1.6, dt); d.st = DS.WALK; }
          else {
            sys.halt(d, dt);
            d.st = DS.EAT;
            bait.eatenBy = d.id;
            d.eatT = (d.eatT || 0) + dt;
            if (d.eatT > CONFIG.weapons.bait.eatTime) { sys.eatBait(bait); d.eatT = 0; }
          }
          return;
        }
        if (d.rest <= 0) {
          const p = sys.nearestPlayer(d, C.sightRadius, (q) => !sys.inSafeZone(q));
          if (p) {
            d.targetId = p.id;
            d.mode = 'roar';
            d.modeT = 0;
            sys.roar(d);
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
      case 'chase': {
        d.fl |= 1;
        d.chaseT += dt;
        // hiding between trees that are too close for its body works: it gives up
        if (lost || d.chaseT > C.chaseTime || (d.blockedT || 0) > 3 || sys.distTo(d, target.x, target.z) > C.sightRadius * 1.6) {
          if ((d.blockedT || 0) > 3) sys.roar(d);
          d.blockedT = 0;
          d.mode = 'patrol';
          d.modeT = 0;
          d.targetId = null;
          d.rest = C.restTime;
          return;
        }
        const dist = sys.distTo(d, target.x, target.z);
        if (dist < C.biteRange && d.cool <= 0) {
          d.mode = 'bite';
          d.modeT = 0;
          d.bitten = false;
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
          if (target && target.alive && sys.distTo(d, target.x, target.z) < C.biteRange + 1) {
            sys.hitPlayer(d, target, C.biteDamage, C.knockback, 1);
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
