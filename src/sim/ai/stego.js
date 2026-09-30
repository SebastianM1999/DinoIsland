// Stegosaurus: territorial grazer. Gets angry when players come too close
// or attack it, charges in short bursts and turns sideways to swing its
// spiked tail (high damage + knockback). Plates protect it from above and
// behind (see hit zones on the client model); flank and neck are weak.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';

const C = CONFIG.dinos.stego;
const TAIL_WINDUP = 0.55;
const TAIL_TIME = 1.2;

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
    if (sys.world.players.get(byId)) d.targetId = byId;
    // the whole group gets upset
    for (const o of sys.list) if (o.type === 'stego' && o.alive && o !== d && sys.distTo(o, d.x, d.z) < 30) { o.anger = C.calmTime; o.targetId = o.targetId || byId; }
  },

  update(d, sys, dt) {
    d.cool = Math.max(0, d.cool - dt);
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
        d.modeT += dt;
        d.st = DS.TAIL;
        sys.halt(d, dt);
        // keep the target on the side the tail swings to
        const sideYaw = toTarget + (d.tailSide || 1) * Math.PI * 0.62;
        sys.turnTo(d, sideYaw, dt, C.turnRate * 1.4);
        if (!d.tailHit && d.modeT >= TAIL_WINDUP) {
          d.tailHit = true;
          // the tail reaches players behind/beside it
          const rel = Math.abs(angleDiff(d.yaw, toTarget));
          if (dist < C.tailRange + 0.5 && rel > 0.9) sys.hitPlayer(d, target, C.tailDamage, C.tailKnockback, 1);
        }
        if (d.modeT >= TAIL_TIME) { d.mode = 'recover'; d.modeT = 0; d.cool = 1.2; }
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
      if (d.cool <= 0 && dist < C.tailRange) {
        d.mode = 'tail';
        d.modeT = 0;
        d.tailHit = false;
        d.tailSide = angleDiff(d.yaw, toTarget) > 0 ? -1 : 1;
        sys.cue(d, target.id);
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
    d.fl &= ~1;
    d.targetId = null;
    d.mode = d.mode === 'walk' ? 'walk' : 'graze';
    d.modeT -= dt;
    if (d.mode === 'graze') {
      sys.halt(d, dt);
      d.st = DS.GRAZE;
      if (d.modeT <= 0) {
        d.mode = 'walk';
        d.wander = sys.randomWalkablePoint(d, home.x, home.z, C.territoryRadius * 0.8);
        d.modeT = 20;
      }
    } else {
      const left = d.wander ? sys.steer(d, d.wander.x, d.wander.z, C.walkSpeed, dt) : 0;
      d.st = DS.WALK;
      if (!d.wander || left < 2 || d.modeT <= 0) {
        d.mode = 'graze';
        d.modeT = 5 + Math.random() * 8;
      }
    }
  },
};
