// Velociraptor: fast, alert, aggressive pack hunter. Wanders its home
// territory, spots players quickly, chases and flanks them, bites and
// darts back (hit-and-run). Meat bait distracts it; traps stop it.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';

const C = CONFIG.dinos.raptor;
const RETREAT_TIME = 0.9;

function spawnPack(sys, cx, cz, n, home) {
  const id = `raptor-${sys.world.id()}`;
  const pack = { id, home: home || { x: cx, z: cz }, target: null, wander: null, wanderT: 0 };
  sys.groups.set(id, pack);
  for (let i = 0; i < n; i++) {
    const p = sys.randomWalkablePoint({ type: 'raptor', home: pack.home }, cx, cz, 8);
    sys.spawn('raptor', p.x, p.z, { group: id, slot: i });
  }
  return pack;
}

export const raptorBrain = {
  spawnInitial(sys) {
    // one pack per zone (the first one guards the nest on jungle islands)
    for (const z of sys.world.layout.dinoZones.raptor) spawnPack(sys, z.x, z.z, z.size || C.groupSize);
  },

  respawn(sys, r) {
    const pack = sys.groups.get(r.group);
    if (!pack) return;
    const pos = sys.randomWalkablePoint({ type: 'raptor', home: pack.home }, pack.home.x, pack.home.z, 10);
    sys.spawn('raptor', pos.x, pos.z, { group: r.group, slot: 0 });
  },

  init(d) {
    d.cool = 0;
    d.retreat = 0;
    d.eatT = 0;
    d.flank = (d.slot % 3 - 1) * 0.9;   // approach angle offset for pack flanking
  },

  onHurt(d, sys, byId) {
    const pack = sys.groups.get(d.group);
    if (pack && sys.world.players.get(byId)) pack.target = byId;
    d.eatT = 0;
  },

  update(d, sys, dt) {
    const pack = sys.groups.get(d.group);
    if (!pack) return;
    d.cool = Math.max(0, d.cool - dt);
    d.retreat = Math.max(0, d.retreat - dt);

    // validate / acquire the pack's target
    let target = pack.target ? sys.world.players.get(pack.target) : null;
    if (target && (!target.alive || sys.inSafeZone(target) || sys.distTo(target, pack.home.x, pack.home.z) > C.giveUpRadius + 30)) {
      pack.target = null;
      target = null;
    }
    if (!target) {
      const seen = sys.nearestPlayer(d, C.sightRadius, (p) => !sys.inSafeZone(p));
      // bait distracts unless a player is right on top of them
      const bait = sys.nearestBait(d, CONFIG.weapons.bait.attractRadius);
      if (seen && !(bait && sys.distTo(d, seen.x, seen.z) > 8)) {
        pack.target = seen.id;
        target = seen;
        sys.roar(d);
      }
    }

    // --- chase
    if (target) {
      d.fl |= 1;
      d.eatT = 0;
      const dist = sys.distTo(d, target.x, target.z);
      if (d.retreat > 0) {
        // dart back after a bite
        const away = Math.atan2(d.x - target.x, d.z - target.z);
        sys.steer(d, d.x + Math.sin(away) * 6, d.z + Math.cos(away) * 6, C.runSpeed * 0.7, dt);
        d.st = DS.RUN;
        return;
      }
      if (dist < C.attackRange + 0.4 && d.cool <= 0) {
        d.st = DS.ATTACK;
        sys.halt(d, dt);
        sys.attackPlayer(d, target, C.attackDamage, 3.5);
        d.cool = C.attackCooldown + Math.random() * 0.5;
        d.retreat = RETREAT_TIME;
        return;
      }
      // flank: approach from an angle offset per pack member
      const base = Math.atan2(d.x - target.x, d.z - target.z) + d.flank * Math.min(1, dist / 12);
      const r = dist > 6 ? Math.min(dist - 1, 3) : 0.8;
      const tx = target.x + Math.sin(base) * r, tz = target.z + Math.cos(base) * r;
      sys.steer(d, tx, tz, dist > 3 ? C.runSpeed : C.walkSpeed * 1.5, dt, C.turnRate * (dist < 5 ? 1.6 : 1));
      d.st = d.spd > C.walkSpeed * 1.2 ? DS.RUN : DS.WALK;
      return;
    }
    d.fl &= ~1;

    // --- bait
    const bait = sys.nearestBait(d, CONFIG.weapons.bait.attractRadius);
    if (bait) {
      const dist = sys.distTo(d, bait.x, bait.z);
      if (dist > 1.4) {
        sys.steer(d, bait.x, bait.z, C.runSpeed * 0.8, dt);
        d.st = DS.RUN;
      } else {
        sys.halt(d, dt);
        bait.eatenBy = d.id;
        d.eatT += dt;
        d.st = DS.EAT;
        if (d.eatT > CONFIG.weapons.bait.eatTime) {
          sys.eatBait(bait);
          d.eatT = 0;
        }
      }
      return;
    }

    // --- wander around home as a loose pack
    pack.wanderT -= dt;
    const leader = sys.list.find((o) => o.group === d.group && o.alive);
    if (leader === d && (!pack.wander || pack.wanderT <= 0 || sys.distTo(d, pack.wander.x, pack.wander.z) < 3)) {
      pack.wander = sys.randomWalkablePoint(d, pack.home.x, pack.home.z, 26);
      pack.wanderT = 6 + Math.random() * 8;
    }
    const goal = leader === d ? pack.wander : { x: leader.x + Math.sin(d.slot * 2.1) * 3.5, z: leader.z + Math.cos(d.slot * 2.1) * 3.5 };
    if (goal && sys.distTo(d, goal.x, goal.z) > 1.5) {
      sys.steer(d, goal.x, goal.z, C.walkSpeed, dt);
      d.st = DS.WALK;
    } else {
      sys.halt(d, dt);
      d.st = Math.random() < 0.01 ? DS.ALERT : d.st === DS.ALERT ? DS.ALERT : DS.IDLE;
      if (d.st === DS.ALERT && Math.random() < 0.02) d.st = DS.IDLE;
    }
  },
};
