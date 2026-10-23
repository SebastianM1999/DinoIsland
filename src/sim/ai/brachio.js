// Brachiosaurus: peaceful, slow, lives in a small herd that wanders the
// eastern meadows, grazes, and flees together when threatened. A player it
// notices coming close gets a threat display first (head high, bellow), then
// the stomp; a hit on one animal puts the whole herd on to the attacker, and
// while the herd drifts away the adults close ranks round the injured one.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { GROVE, titanScale } from '../../shared/grove.js';
import { LEVEL, perceive, alarm } from './senses.js';

const C = CONFIG.dinos.brachio;
const D = C.ai.defend;
const PF_SPRINT = 1;

/**
 * Threat display: a player it sees inside `warn` m (but not yet at stomp distance) makes it stop, face them and
 * bellow. Returns true while it displays.
 */
function threaten(d, sys, dt) {
  const t = perceive(d, sys, LEVEL.ALERT);
  if (!t?.seen) return false;
  const dist = Math.hypot(t.x - d.x, t.z - d.z);
  if (dist > D.warn * (d.scale || 1) || dist < C.closeRadius) return false;
  sys.halt(d, dt);
  sys.turnTo(d, Math.atan2(-(t.x - d.x), -(t.z - d.z)), dt, C.turnRate * 1.3);
  d.st = DS.ROAR;
  sys.roar(d, 6);
  return true;
}

function herdOf(sys, d) {
  return sys.groups.get(d.group);
}

/**
 * Self-defence: a Brachiosaurus turns on a player who attacked it from close
 * range or simply walks up too close, rears up and stomps (telegraphed wind-up,
 * big knockback). Returns true while it is busy defending.
 */
function defend(d, sys, dt) {
  d.cool = Math.max(0, d.cool - dt);
  // someone walked right up to it?
  if (!(d.defendT > 0)) {
    const close = sys.nearestPlayer(d, C.closeRadius, (p) => !sys.inSafeZone(p));
    if (!close) { d.fl &= ~1; return false; }
    d.defendT = C.defendTime * 0.6;
    d.targetId = close.id;
    d.defendFrom = { x: d.x, z: d.z };
    sys.roar(d);
  }
  d.defendFrom ??= { x: d.x, z: d.z };
  const p = sys.world.players.get(d.targetId);
  // leash: it never follows further than `leash` m from where the defence began
  if (!p || !p.alive || sys.inSafeZone(p) || sys.distTo(d, p.x, p.z) > C.defendRange * 1.6
    || Math.hypot(p.x - d.defendFrom.x, p.z - d.defendFrom.z) > D.leash * (d.scale || 1)) {
    d.defendFrom = null;
    d.defendT = 0;
    d.stompT = -1;
    d.fl &= ~1;
    return false;
  }
  d.fl |= 1;
  d.defendT -= dt;
  const dist = sys.distTo(d, p.x, p.z);
  const toP = Math.atan2(-(p.x - d.x), -(p.z - d.z));

  if (d.stompT >= 0) {
    // rear up (wind-up), then slam the front legs down
    d.stompT += dt;
    d.st = DS.ATTACK;
    sys.halt(d, dt);
    sys.turnTo(d, toP, dt, C.turnRate * 1.5);
    if (!d.stomped && d.stompT >= C.stompWindup) {
      d.stomped = true;
      if (sys.distTo(d, p.x, p.z) < C.stompRange + 1) sys.hitPlayer(d, p, C.stompDamage, C.stompKnockback, 1);
    }
    if (d.stompT >= C.stompWindup + 0.6) { d.stompT = -1; d.cool = C.stompCooldown; }
    return true;
  }
  if (dist < C.stompRange && d.cool <= 0) {
    d.stompT = 0;
    d.stomped = false;
    sys.cue(d, p.id);
    return true;
  }
  // face the intruder and close in slowly
  if (dist > C.stompRange * 0.8) {
    sys.steer(d, p.x, p.z, C.walkSpeed * 1.4, dt, C.turnRate * 1.4);
    d.st = DS.WALK;
  } else {
    sys.halt(d, dt);
    sys.turnTo(d, toP, dt, C.turnRate * 1.4);
    d.st = DS.ALERT;
  }
  if (d.defendT <= 0) d.fl &= ~1;
  return d.defendT > 0;
}

function newHerd(sys, zone) {
  const id = `brachio-${sys.world.id()}`;
  const herd = { id, zone, target: { x: zone.x, z: zone.z }, retarget: 0, panic: 0, threat: null, graze: 0, alertT: 0 };
  sys.groups.set(id, herd);
  return herd;
}

function spawnHerd(sys, zone) {
  const herd = newHerd(sys, zone);
  const spawns = zone.spawns.length ? zone.spawns : [{ x: zone.x, z: zone.z }];
  for (let i = 0; i < C.herdSize; i++) {
    const s = spawns[i % spawns.length];
    sys.spawn('brachio', s.x + i * 4, s.z + i * 3, { group: herd.id, slot: i });
  }
  return herd;
}

/**
 * The Primeval Grove's titan: one oversized, very tough Brachiosaurus leashed
 * to the middle of the grove (see shared/grove.js). It is a "herd of one" so
 * all the usual grazing/wandering/fleeing behaviour applies inside its pen.
 */
function spawnTitan(sys, grove) {
  const T = GROVE.titan;
  const scale = titanScale(grove);
  // r: how far its centre may wander (the tail stays inside the stones);
  // bound: no part of its body passes this
  const leash = { x: grove.x, z: grove.z, r: Math.max(3, grove.r - T.tail * scale * 0.9), bound: grove.r - 1 };
  const herd = newHerd(sys, { x: grove.x, z: grove.z, radius: leash.r, spawns: [], titan: true });
  const d = sys.spawn('brachio', grove.x, grove.z, {
    group: herd.id, slot: 0, leash, scale, title: T.name,
    radius: C.radius * scale, home: { x: grove.x, z: grove.z },
  });
  d.maxHp = d.hp = Math.round(d.hp * T.healthMul);
  return herd;
}

export const brachioBrain = {
  spawnInitial(sys) {
    for (const zone of sys.world.layout.dinoZones.brachio) spawnHerd(sys, zone);
    if (sys.world.layout.grove) spawnTitan(sys, sys.world.layout.grove);
  },

  respawn(sys, r) {
    // A new herd arrives once the whole previous herd is gone.
    const alive = sys.list.some((d) => d.type === 'brachio' && d.alive && d.group === r.group);
    const pending = sys.respawnQueue.some((q) => q.type === 'brachio' && q.group === r.group);
    const zone = sys.groups.get(r.group)?.zone || sys.world.layout.dinoZones.brachio[0];
    if (alive || pending || !zone) return;
    if (zone.titan) spawnTitan(sys, sys.world.layout.grove);
    else spawnHerd(sys, zone);
  },

  init(d) {
    d.idleT = 2 + Math.random() * 4;
    d.defendT = 0;
    d.cool = 0;
    d.stompT = -1;
  },

  /** Nudged free by the dino system: the herd picks a new goal. */
  onStuck(d, sys) {
    const herd = herdOf(sys, d);
    if (herd) { herd.target = null; herd.retarget = 0; }
  },

  onHurt(d, sys, byId) {
    const herd = herdOf(sys, d);
    const p = sys.world.players.get(byId);
    if (!herd) return;
    if (herd.panic <= 0) sys.roar(d);   // alarm bellow
    // herd memory: the whole herd knows who did it and where they stood
    for (const o of sys.list) if (o.group === d.group && o.alive) alarm(o, sys, byId);
    herd.injured = d.id;
    herd.injuredAt = sys.world.now;
    // An attacker close by gets stomped; from far away the herd just flees.
    if (p && sys.distTo(d, p.x, p.z) < C.defendRange) {
      if (!(d.defendT > 0)) d.defendFrom = { x: d.x, z: d.z };
      d.defendT = C.defendTime;
      d.targetId = byId;
    }
    herd.panic = C.fleeTime;
    herd.threat = p ? { x: p.x, z: p.z } : { x: d.x, z: d.z };
    herd.target = null;
  },

  update(d, sys, dt) {
    const herd = herdOf(sys, d);
    if (!herd) return;
    if (defend(d, sys, dt)) return;
    // the first herd member that isn't busy defending leads (d always qualifies here)
    const leader = sys.list.find((o) => o.group === d.group && o.alive && !(o.defendT > 0));
    const isLeader = leader === d;

    if (isLeader) {
      // Threat detection: sprinting players nearby.
      const threat = sys.nearestPlayer(d, C.alertRadius, (p) => (p.fl & PF_SPRINT) !== 0);
      if (threat) {
        herd.panic = Math.max(herd.panic, C.fleeTime * 0.6);
        herd.threat = { x: threat.x, z: threat.z };
        herd.target = null;
      }
      if (herd.panic > 0) {
        herd.panic -= dt;
        if (!herd.target || sys.distTo(d, herd.target.x, herd.target.z) < 8) {
          herd.target = sys.fleePoint(d, herd.threat.x, herd.threat.z, 45);
        }
        if (herd.panic <= 0) {
          herd.retarget = 0;
          herd.target = null;
          herd.alertT = 4;   // stays wary for a bit
        }
      } else {
        herd.retarget -= dt;
        if (!herd.target || herd.retarget <= 0 || sys.distTo(d, herd.target.x, herd.target.z) < 6) {
          herd.target = sys.randomWalkablePoint(d, herd.zone.x, herd.zone.z, herd.zone.radius + (herd.zone.titan ? 0 : 25));
          herd.retarget = 25 + Math.random() * 20;
          herd.graze = 5 + Math.random() * 6;    // stop and graze on arrival
        }
      }
      if (herd.alertT > 0) herd.alertT -= dt;
    }

    const panic = herd.panic > 0;
    if (!panic && threaten(d, sys, dt)) return;
    // Followers keep formation around the leader (behind and to the side); while the herd flees from a hit, the
    // others close ranks round the injured animal, on the side the threat came from.
    const injured = panic && herd.injured !== d.id && sys.world.now - (herd.injuredAt ?? -Infinity) < D.injured
      ? sys.list.find((o) => o.id === herd.injured && o.alive && o.group === d.group) : null;
    let tx, tz;
    if (isLeader) {
      tx = herd.target?.x ?? d.x; tz = herd.target?.z ?? d.z;
    } else if (injured && herd.threat) {
      const ux = herd.threat.x - injured.x, uz = herd.threat.z - injured.z, l = Math.hypot(ux, uz) || 1;
      const side = d.slot % 2 ? 1 : -1;
      tx = injured.x + (ux / l) * 6 - (uz / l) * side * 5;
      tz = injured.z + (uz / l) * 6 + (ux / l) * side * 5;
    } else {
      const side = d.slot % 2 ? 1 : -1;
      const back = 7 + d.slot * 3;
      const fx = -Math.sin(leader.yaw), fz = -Math.cos(leader.yaw);
      tx = leader.x - fx * back + fz * side * 6;
      tz = leader.z - fz * back - fx * side * 6;
    }

    const dist = Math.hypot(tx - d.x, tz - d.z);
    if (panic) {
      d.st = DS.FLEE;
      sys.steer(d, tx, tz, C.fleeSpeed * (isLeader ? 1 : 1.08), dt, C.turnRate * 1.3);
      return;
    }
    if (isLeader && herd.graze > 0 && dist < 10) {
      herd.graze -= dt;
      sys.halt(d, dt);
      d.st = d.spd < 0.3 ? DS.GRAZE : DS.WALK;
      return;
    }
    if (dist > 3) {
      const catchUp = !isLeader && dist > 14 ? 1.5 : 1;
      sys.steer(d, tx, tz, C.walkSpeed * catchUp, dt);
      d.st = herd.alertT > 0 && d.spd < 0.5 ? DS.ALERT : DS.WALK;
    } else {
      sys.halt(d, dt);
      d.idleT -= dt;
      if (d.idleT <= 0) d.idleT = 3 + Math.random() * 5;
      d.st = d.spd > 0.3 ? DS.WALK : d.idleT > 2.5 ? DS.GRAZE : DS.IDLE;
    }
  },
};
