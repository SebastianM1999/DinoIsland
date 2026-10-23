// Velociraptor: fast, alert, aggressive pack hunter. Wanders its home
// territory, spots players in its view cone (ai/senses.js), calls the pack,
// surrounds them (ai/pack.js: ring slots, a driver from the front, one on the
// escape side), bites in turns (attack tokens) while the others circle and
// feint, and darts back after each bite (hit-and-run). A strung-out or badly
// hurt pack regroups. A player who breaks the line of sight is searched for
// where it was last seen.
// Hits scare it off briefly; traps stop it.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { LEVEL, perceive, perceived, share, alarm, forget, afterDowned, searchGoal } from './senses.js';
import { packSpec, assignSlots, leadPoint, muroGoal, takeToken, tokenFree, dropToken, regroupPoint, ASSIGN_EVERY, RING_GAP } from './pack.js';

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

/** How a pack hunter picks a target: the player it is at least alert to (seen, heard or felt). */
export const alertTarget = (d, sys) => perceive(d, sys, LEVEL.ALERT);

/** Seconds between two calls in which the pack shares what it knows about its target. */
const SHARE_EVERY = 0.5;
/** A pack whose target went down with nobody left to go for walks off this far and keeps away a while. */
const LEAVE = { dist: 25, time: 8 };

const members = (sys, pack) => sys.list.filter((o) => o.group === pack.id && o.alive);
/** A member without a token feints this often (per second, on average) and for this long. */
const FEINT_RATE = 0.6, FEINT_TIME = 0.5;
const rand = (sys) => (sys.world.aiRng ?? Math.random)();

/** `d` gives back its attack token (bite over, frightened, regrouping, target changed). */
function letGo(d, sys) {
  if (d.biting != null) dropToken(sys, d, d.biting);
  d.biting = null;
}

/** The hunt is over (or moved on): forget the slot plan and the once-per-hunt regroup. */
function endHunt(pack) {
  pack.target = null;
  pack.plan = null;
  pack.hurtRegrouped = false;
  pack.regroup = null;
}

/** The pack calls: whoever knows something about the target tells the others (ai/senses.js share). */
function sharePack(sys, pack, from = null) {
  const now = sys.world.now;
  if (!from && now - (pack.sharedAt ?? -99) < SHARE_EVERY) return;
  pack.sharedAt = now;
  const all = members(sys, pack);
  for (const a of from ? [from] : all) for (const b of all) share(a, b, pack.target, sys);
}

/** Walk the whole pack away from a downed body (no camping, docs/dino-ai-concept.md 3.2a). */
function leaveBody(sys, pack, d, body) {
  const away = sys.fleePoint(d, body.x, body.z, LEAVE.dist);
  pack.wander = away;
  pack.wanderT = LEAVE.time;
}

/**
 * The shared pack-hunter brain (raptor, gloom raptor, test species): a loose wandering pack that acquires one
 * target together, flanks it and does hit-and-run bites; hits frighten the animal briefly. A member that does
 * not see the target goes where the pack last knew it to be and searches there.
 * `species` is the CONFIG.dinos entry, `acquire(d, sys)` finds the player the pack goes for (a perceived
 * target, see ai/senses.js `perceived`) or null.
 */
export function packHunterBrain(type, species, acquire = alertTarget) {
  const C = species;
  const P = packSpec(type);
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
      d.feintT = 0;
      d.biting = null;
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
      alarm(d, sys, byId);
      if (pack) pack.id ??= d.group;
      if (pack && attacker) { pack.target = byId; sharePack(sys, pack, d); }
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
      pack.id ??= d.group;
      d.cool = Math.max(0, d.cool - dt);
      d.retreat = Math.max(0, d.retreat - dt);
      // the bite and the dart back are over: the token goes back to the pool
      if (d.biting != null && d.retreat <= 0) letGo(d, sys);
      if (updateRaptorFear(d, sys, dt, C)) { letGo(d, sys); return; }

      // validate / acquire the pack's target
      if (pack.target != null) {
        const p = sys.world.players.get(pack.target);
        if (p?.downed) {
          // down: never finish them off - go for whoever revives them, or the next player, or let the body be
          const next = afterDowned(d, sys, p.id);
          if (next) pack.target = next.id;
          else { endHunt(pack); leaveBody(sys, pack, d, p); }
        } else if (!p || !p.alive || sys.inSafeZone(p, d)) {
          endHunt(pack);
        }
      }
      let t = null;
      if (pack.target != null) {
        sharePack(sys, pack);
        t = perceived(d, sys, pack.target);
        // nobody in the pack knows where it is any more, or it is too far from home: the hunt is over
        if (t && sys.distTo(t, pack.home.x, pack.home.z) > C.giveUpRadius + 30) { endHunt(pack); t = null; }
        else if (!t && !members(sys, pack).some((o) => perceived(o, sys, pack.target))) endHunt(pack);
      }
      if (pack.target == null) {
        const seen = acquire(d, sys);
        if (seen) {
          pack.target = seen.id;
          t = seen;
          sys.roar(d);
          sharePack(sys, pack, d);
        }
      }

      // --- hunt a target it does not see: where it was last, then search around there
      if (t && !t.seen) {
        d.fl |= 1;
        const goal = searchGoal(d, sys, t);
        if (!goal) { forget(d, t.id); sys.halt(d, dt); d.st = DS.ALERT; return; }
        sys.steer(d, goal.x, goal.z, t.age < 3 ? C.runSpeed * 0.8 : C.walkSpeed * 1.5, dt);
        d.st = d.spd > C.walkSpeed * 1.2 ? DS.RUN : DS.WALK;
        return;
      }

      // --- chase (pack tactics, ai/pack.js)
      if (t) {
        d.fl |= 1;
        d.search = null;
        const target = t.p;
        const dist = sys.distTo(d, target.x, target.z);
        const all = members(sys, pack);
        // strung out or badly hurt: fall back to the leader (or home), call, then come in again
        const rg = regroupPoint(sys, pack, all, P);
        if (rg) {
          letGo(d, sys);
          if (rg.leader === d.id) sys.roar(d);
          sys.steer(d, rg.x + Math.sin(d.slot * 2.1) * 3, rg.z + Math.cos(d.slot * 2.1) * 3, C.runSpeed * 0.8, dt);
          d.st = DS.RUN;
          return;
        }
        if (d.retreat > 0) {
          // dart back after a bite
          const away = Math.atan2(d.x - target.x, d.z - target.z);
          sys.steer(d, d.x + Math.sin(away) * 6, d.z + Math.cos(away) * 6, C.runSpeed * 0.7, dt);
          d.st = DS.RUN;
          return;
        }
        // bites in turns: only the holders of the target's attack tokens may bite
        if (dist < C.attackRange + 0.4 && d.cool <= 0 && takeToken(sys, d, t.id, P.tokens)) {
          d.st = DS.ATTACK;
          sys.halt(d, dt);
          sys.attackPlayer(d, target, C.attackDamage, 3.5);
          d.cool = C.attackCooldown + Math.random() * 0.5;
          d.retreat = RETREAT_TIME;
          d.biting = t.id;
          return;
        }
        // slots round the target, handed out every ASSIGN_EVERY s (deterministic by dino id)
        const now = sys.world.now;
        if (!pack.plan || now >= pack.planAt || pack.planFor !== t.id) {
          pack.plan = assignSlots(sys, all, t, P, C.attackRange);
          pack.planAt = now + ASSIGN_EVERY;
          pack.planFor = t.id;
        }
        const slot = pack.plan.slots.get(d.id);
        const ring = C.attackRange + RING_GAP;
        const mayBite = d.cool <= 0 && tokenFree(sys, d, t.id, P.tokens);
        let goal;
        d.feintT = Math.max(0, (d.feintT ?? 0) - dt);
        if (pack.plan.fallback || !slot) {
          // no room for a ring: close in to the safe distance, keep apart from packmates
          goal = muroGoal(d, t, all, mayBite ? 0 : ring, P.separation);
        } else if (mayBite) {
          // whoever may bite goes for where the target will be (pursuit with a capped lead)
          goal = leadPoint(d, t, C.runSpeed, P.lead);
          if (slot.role === 'driver') sys.roar(d, 8);
        } else if (slot.role === 'driver') {
          // the driver without a token keeps up the pressure from the front, at the ring's distance
          goal = muroGoal(d, t, all, ring, P.separation);
          sys.roar(d, 8);
        } else if (d.feintT > 0) {
          // feint: a short dash in and out (pressure without a pile-on)
          goal = dist > C.attackRange + 1.2 ? { x: t.x, z: t.z } : { x: t.x + slot.dx, z: t.z + slot.dz };
        } else {
          goal = { x: t.x + slot.dx, z: t.z + slot.dz };
          if (Math.hypot(goal.x - d.x, goal.z - d.z) < 1.5 && rand(sys) < dt * FEINT_RATE) d.feintT = FEINT_TIME;
        }
        const left = Math.hypot(goal.x - d.x, goal.z - d.z);
        if (left < 0.6 && !mayBite) {
          sys.halt(d, dt);
          sys.turnTo(d, Math.atan2(-(target.x - d.x), -(target.z - d.z)), dt, C.turnRate * 1.6);
          d.st = DS.ALERT;
          return;
        }
        sys.steer(d, goal.x, goal.z, left > 3 || d.feintT > 0 ? C.runSpeed : C.walkSpeed * 1.5, dt, C.turnRate * (dist < 5 ? 1.6 : 1));
        d.st = d.spd > C.walkSpeed * 1.2 ? DS.RUN : DS.WALK;
        return;
      }
      d.fl &= ~1;

      // --- something caught its eye or ear: stop and look that way (the cue that gives a careful player a chance)
      const hunch = perceive(d, sys, LEVEL.SUSPICIOUS);
      if (hunch) {
        sys.halt(d, dt);
        sys.turnTo(d, Math.atan2(-(hunch.x - d.x), -(hunch.z - d.z)), dt);
        d.st = DS.ALERT;
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
}

export const raptorBrain = {
  spawnInitial(sys) {
    // one pack per zone (the first one guards the nest on jungle islands)
    for (const z of sys.world.layout.dinoZones.raptor) spawnPack(sys, 'raptor', z.x, z.z, z.size || C.groupSize);
  },
  ...packHunterBrain('raptor', C),
};
