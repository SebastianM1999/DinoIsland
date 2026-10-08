// Velociraptor: fast, alert, aggressive pack hunter. Wanders its home
// territory, spots players quickly, chases and flanks them, bites and
// darts back (hit-and-run). Hits scare it off briefly; traps stop it.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';

const RAPTOR = CONFIG.dinos.raptor;
const C = RAPTOR;
const RETREAT_TIME = 0.9;

/** Shared with raiders so a wounded raptor breaks off either kind of attack. */
export function updateRaptorFear(d, sys, dt, C = RAPTOR) {
  if (!(d.frightened > 0)) return false;
  d.frightened = Math.max(0, d.frightened - dt);
  if (!d.frightened) return false;
  const from = sys.world.players.get(d.fearFrom) || d.fearOrigin;
  // Make a short escape, then hesitate instead of fleeing half the jungle.
  if (sys.distTo(d, from.x, from.z) >= 6) {
    sys.halt(d, dt);
    d.st = DS.ALERT;
    return true;
  }
  const away = Math.atan2(d.x - from.x, d.z - from.z);
  sys.steer(d, d.x + Math.sin(away) * 6, d.z + Math.cos(away) * 6, C.runSpeed * 0.7, dt);
  d.st = DS.RUN;
  return true;
}

/** Spawn a pack of `type` around (cx, cz) and register it in `sys.groups`. */
export function spawnPack(sys, type, cx, cz, n, home, spread = 8) {
  const id = `${type}-${sys.world.id()}`;
  const pack = { id, home: home || { x: cx, z: cz }, target: null, wander: null, wanderT: 0 };
  sys.groups.set(id, pack);
  for (let i = 0; i < n; i++) {
    const p = sys.randomWalkablePoint({ type, home: pack.home }, cx, cz, spread);
    sys.spawn(type, p.x, p.z, { group: id, slot: i });
  }
  return pack;
}

/** How a raptor notices players: whoever is inside its sight radius (shortened by ash rain). */
function seeTarget(d, sys) {
  return sys.nearestPlayer(d, C.sightRadius * sys.world.sightMul(), (p) => !sys.inSafeZone(p));
}

/**
 * The shared pack-hunter brain (raptor, gloom raptor): a loose wandering pack that acquires one target
 * together, flanks it and does hit-and-run bites; hits frighten the animal briefly.
 * `species` is the CONFIG.dinos entry, `acquire(d, sys)` finds the player the pack goes for.
 */
export function packHunterBrain(type, species, acquire) {
  const C = species;
  return {
    respawn(sys, r) {
      const pack = sys.groups.get(r.group);
      if (!pack) return;
      const pos = sys.randomWalkablePoint({ type, home: pack.home }, pack.home.x, pack.home.z, 10);
      sys.spawn(type, pos.x, pos.z, { group: r.group, slot: 0 });
    },

    init(d) {
      d.cool = 0;
      d.retreat = 0;
      d.frightened = 0;
      d.flank = (d.slot % 3 - 1) * 0.9;   // approach angle offset for pack flanking
    },

    /** Nudged free by the dino system: the pack wanders somewhere else. */
    onStuck(d, sys) {
      const pack = sys.groups.get(d.group);
      if (pack) { pack.wander = null; pack.wanderT = 0; }
    },

    onHurt(d, sys, byId) {
      const pack = sys.groups.get(d.group);
      const attacker = sys.world.players.get(byId);
      const attacking = pack?.target != null || d.st === DS.ATTACK || d.raid?.foe != null;
      if (pack && attacker) pack.target = byId;
      if (attacking && attacker) {
        d.frightened = 1 + Math.random();
        d.fearFrom = byId;
        d.fearOrigin = { x: attacker.x, z: attacker.z };
        d.retreat = 0;
        // The pause itself is the recovery time, with no extra bite cooldown.
        d.cool = 0;
        if (d.raid) d.raid.cool = 0;
        d.st = DS.RUN;
      }
    },

    update(d, sys, dt) {
      const pack = sys.groups.get(d.group);
      if (!pack) return;
      d.cool = Math.max(0, d.cool - dt);
      d.retreat = Math.max(0, d.retreat - dt);
      if (updateRaptorFear(d, sys, dt, C)) return;

      // validate / acquire the pack's target
      let target = pack.target ? sys.world.players.get(pack.target) : null;
      if (target && (!target.alive || sys.inSafeZone(target) || sys.distTo(target, pack.home.x, pack.home.z) > C.giveUpRadius + 30)) {
        pack.target = null;
        target = null;
      }
      if (!target) {
        const seen = acquire(d, sys);
        if (seen) {
          pack.target = seen.id;
          target = seen;
          sys.roar(d);
        }
      }

      // --- chase
      if (target) {
        d.fl |= 1;
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
}

export const raptorBrain = {
  spawnInitial(sys) {
    // one pack per zone (the first one guards the nest on jungle islands)
    for (const z of sys.world.layout.dinoZones.raptor) spawnPack(sys, 'raptor', z.x, z.z, z.size || C.groupSize);
  },
  ...packHunterBrain('raptor', C, seeTarget),
};
