// Brachiosaurus: peaceful, slow, lives in a small herd that wanders the
// eastern meadows, grazes, and flees together when threatened.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';

const C = CONFIG.dinos.brachio;
const PF_SPRINT = 1;

function herdOf(sys, d) {
  return sys.groups.get(d.group);
}

function newHerd(sys, zone) {
  const id = `brachio-${sys.world.id()}`;
  const herd = { id, zone, target: { x: zone.x, z: zone.z }, retarget: 0, panic: 0, threat: null, graze: 0, alertT: 0 };
  sys.groups.set(id, herd);
  return herd;
}

function spawnHerd(sys) {
  const zone = sys.world.layout.dinoZones.brachio;
  const herd = newHerd(sys, zone);
  const spawns = zone.spawns.length ? zone.spawns : [{ x: zone.x, z: zone.z }];
  for (let i = 0; i < C.herdSize; i++) {
    const s = spawns[i % spawns.length];
    const d = sys.spawn('brachio', s.x + i * 4, s.z + i * 3, { group: herd.id, slot: i });
    d.yaw = 0.8;
  }
  return herd;
}

export const brachioBrain = {
  spawnInitial(sys) {
    spawnHerd(sys);
  },

  respawn(sys, r) {
    // A new herd arrives once the whole previous herd is gone.
    const alive = sys.list.some((d) => d.type === 'brachio' && d.alive && d.group === r.group);
    const pending = sys.respawnQueue.some((q) => q.type === 'brachio' && q.group === r.group);
    if (!alive && !pending) spawnHerd(sys);
  },

  init(d) {
    d.idleT = 2 + Math.random() * 4;
  },

  onHurt(d, sys, byId) {
    const herd = herdOf(sys, d);
    const p = sys.world.players.get(byId);
    if (!herd) return;
    if (herd.panic <= 0) sys.roar(d);   // alarm bellow
    herd.panic = C.fleeTime;
    herd.threat = p ? { x: p.x, z: p.z } : { x: d.x, z: d.z };
    herd.target = null;
  },

  update(d, sys, dt) {
    const herd = herdOf(sys, d);
    if (!herd) return;
    const leader = sys.list.find((o) => o.group === d.group && o.alive);
    const isLeader = leader === d;

    if (isLeader) {
      // Threat detection: sprinting players nearby, or anyone very close.
      const threat = sys.nearestPlayer(d, C.alertRadius, (p) => (p.fl & PF_SPRINT) !== 0)
        || sys.nearestPlayer(d, 7);
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
          herd.target = sys.randomWalkablePoint(d, herd.zone.x, herd.zone.z, herd.zone.radius + 25);
          herd.retarget = 25 + Math.random() * 20;
          herd.graze = 5 + Math.random() * 6;    // stop and graze on arrival
        }
      }
      if (herd.alertT > 0) herd.alertT -= dt;
    }

    const panic = herd.panic > 0;
    // Followers keep formation around the leader (behind and to the side).
    let tx, tz;
    if (isLeader) {
      tx = herd.target?.x ?? d.x; tz = herd.target?.z ?? d.z;
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
