// Sump Lurker: the small ambush predator of the flooded cave tunnels (Hollow Mountain). It lies submerged in its
// water, lunges at players who swim or stand at the water's edge, drags back into the water after the strike and
// retreats when hurt. No boss rules: not unkillable, no phases, no arena. It shares the submergence / lunge helpers
// of the Alpha Sarcosuchus (`aquatic.js`).
import { CONFIG } from '../../shared/config.js';
import { DS, EV } from '../../shared/protocol.js';
import { angleDiff, clamp } from '../../shared/rng.js';
import { toYaw, submergeToward, flagSubmerged, mouthCapsuleHit } from './aquatic.js';

const TYPE = 'sump-lurker';
const C = () => CONFIG.dinos[TYPE];
/** Seconds, synchronized with SumpLurker_Attack (jaws snap at ~0.67 s of its 1.33 s). */
export const LURKER_TIMING = { windup: 0.6, strike: 0.7, recover: 0.9, missRecover: 1.4, calm: 3 };
const DEEP = 1.2;   // water deeper than this hides the lurker and counts as "its water"
const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k / 8) * Math.PI * 2);

/** Is (x, z) water the lurker can lie in? */
const wet = (sys, x, z, depth = DEEP) => sys.terrain.waterDepthAt(x, z) > depth;

/** A flooded cave spot: flagged `water` / `flooded` by the layout, or standing in deep water. */
export function floodedSpot(sys, s) {
  return !!(s && (s.water || s.flooded || wet(sys, s.x, s.z)));
}

/** Prey: someone in the water or standing within `edge` metres of deep water (and not in the base). */
function atWater(sys, p) {
  if (sys.terrain.waterDepthAt(p.x, p.z) > 0.3) return true;
  const edge = C().edge;
  return EIGHT.some((a) => wet(sys, p.x + Math.cos(a) * edge, p.z + Math.sin(a) * edge));
}
function prey(d, sys, p) {
  return p.alive && !sys.inSafeZone(p) && Math.abs(p.y - d.y) < 4 && atWater(sys, p);
}

/** A deep, walkable water point within the leash: the one nearest to `near` (the player, or the lurker itself). */
function waterGoal(d, sys, near) {
  const r = d.leash?.r ?? C().leashRadius, home = d.home;
  let best = null, score = Infinity;
  for (const f of [0.2, 0.5, 0.8]) for (const a of EIGHT) {
    const x = home.x + Math.cos(a) * r * f, z = home.z + Math.sin(a) * r * f;
    if (!wet(sys, x, z) || !sys.walkable(x, z, d)) continue;
    const s = Math.hypot(near.x - x, near.z - z);
    if (s < score) { score = s; best = { x, z }; }
  }
  return best ?? (wet(sys, home.x, home.z) ? home : { x: d.x, z: d.z });
}

function startLunge(d, sys, p) {
  const T = LURKER_TIMING;
  d.mode = 'lunge'; d.modeT = 0; d.victims = new Set(); d.hitAttack = false; d.targetId = p.id;
  d.st = DS.LUNGE; d.strikeYaw = d.yaw;
  sys.world.event(EV.ATTACK, { id: d.id, target: p.id, kind: 'lunge', duration: T.windup + T.strike });
}
function retreat(d, sys, p = null) {
  d.mode = 'retreat'; d.modeT = 0; d.waterGoal = waterGoal(d, sys, p ?? d);
}

export const sumpLurkerBrain = {
  /**
   * Lurkers only exist where the layout lists flooded cave spots: `layout.caveDinoSpots = [{ x, z, radius, water? }]`
   * (a spot counts as flooded when it has a truthy `water`/`flooded` field or lies in deep water). The count comes from
   * `level.dinos['sump-lurker']`; on levels without such spots nothing spawns.
   */
  spawnInitial(sys) {
    const layout = sys.world.layout, total = layout.level?.dinos?.[TYPE] ?? 0;
    const spots = (Array.isArray(layout.caveDinoSpots) ? layout.caveDinoSpots : []).filter((s) => floodedSpot(sys, s));
    if (!spots.length || !(total > 0)) return;
    const base = Math.floor(total / spots.length), extra = total % spots.length;
    spots.forEach((s, i) => { for (let k = 0; k < base + (i < extra ? 1 : 0); k++) spawnAt(sys, s); });
  },
  respawn(sys) {
    const spots = (Array.isArray(sys.world.layout.caveDinoSpots) ? sys.world.layout.caveDinoSpots : []).filter((s) => floodedSpot(sys, s));
    if (spots.length) spawnAt(sys, spots[Math.floor(Math.random() * spots.length)]);
  },
  init(d, sys) {
    Object.assign(d, { mode: 'lurk', modeT: 0, submergence: 1, hitAttack: false, calmUntil: 0 });
    d.y = sys.terrain.heightAt(d.x, d.z); d.st = DS.SUBMERGED; d.fl |= 8;
  },
  onHurt(d, sys, byId) {
    // a hit drives it back into the water to lick its wounds; a committed lunge is never cancelled
    if (sys.world.players.has(byId)) d.targetId = byId;
    if (d.mode === 'lunge') return;
    d.calmUntil = sys.world.now + LURKER_TIMING.calm;
    retreat(d, sys);
  },
  update(d, sys, dt) {
    const c = C(), T = LURKER_TIMING, now = sys.world.now;
    d.modeT += dt;
    let p = sys.world.players.get(d.targetId);
    if (!p || !prey(d, sys, p) || sys.distTo(d, p.x, p.z) > c.sightRadius) p = sys.nearestPlayer(d, c.sightRadius, (q) => prey(d, sys, q));
    if (p) { d.targetId = p.id; d.fl |= 1; } else d.fl &= ~1;
    const deep = wet(sys, d.x, d.z);
    submergeToward(d, dt, deep && (d.mode === 'lurk' || d.mode === 'stalk' || d.mode === 'retreat'));
    flagSubmerged(d);
    const dist = p ? sys.distTo(d, p.x, p.z) : Infinity;
    const off = p ? Math.abs(angleDiff(d.yaw, toYaw(d, p))) : 0;
    const calm = now < d.calmUntil;

    if (d.mode === 'lurk') {
      d.st = deep ? DS.SUBMERGED : DS.IDLE; sys.halt(d, dt);
      if (!deep) { retreat(d, sys); return; }
      if (!p || calm) return;
      sys.turnTo(d, toYaw(d, p), dt, c.turnRate * 0.7);
      if (dist <= c.lungeRange && off < 0.35 && d.modeT > 0.8) startLunge(d, sys, p);
      else if (dist > c.lungeRange) { d.mode = 'stalk'; d.modeT = 0; }
      return;
    }
    if (d.mode === 'stalk') {
      // creep through its water toward the prey; never onto land
      if (!p || calm) { d.mode = 'lurk'; d.modeT = 0; return; }
      const q = waterGoal(d, sys, p);
      d.st = DS.SWIM; sys.steer(d, q.x, q.z, c.runSpeed * 0.6, dt, c.turnRate);
      if (dist <= c.lungeRange * 0.9) {
        sys.turnTo(d, toYaw(d, p), dt, c.turnRate);
        if (off < 0.35) startLunge(d, sys, p);
      }
      return;
    }
    if (d.mode === 'lunge') {
      d.st = DS.LUNGE;
      if (d.modeT <= T.windup) {
        sys.halt(d, dt);
        // aim is locked after the first part of the wind-up: a dodge leaves the flank exposed
        const q = sys.world.players.get(d.targetId);
        if (q && d.modeT < T.windup * 0.6) { sys.turnTo(d, toYaw(d, q), dt, c.turnRate); }
        d.strikeYaw = d.yaw;
      } else {
        const from = { x: d.x, z: d.z }; d.yaw = d.strikeYaw;
        sys.move(d, c.lungeSpeed, dt, 25, true);
        d.yaw = d.strikeYaw;
        for (const q of sys.players()) {
          if (d.victims.has(q.id) || !q.alive || sys.inSafeZone(q) || Math.abs(q.y - d.y) > 3) continue;
          if (!mouthCapsuleHit(d, q, from, 2.2, { lengthScale: 1, half: 0.85, back: 0 })) continue;
          d.victims.add(q.id); d.hitAttack = true;
          sys.hitPlayer(d, q, c.biteDamage, c.knockback, 0.4);
        }
      }
      if (d.modeT >= T.windup + T.strike) { d.mode = 'recover'; d.modeT = 0; }
      return;
    }
    if (d.mode === 'recover') {
      d.st = DS.RECOVER; sys.halt(d, dt);
      if (d.modeT >= (d.hitAttack ? T.recover : T.missRecover)) retreat(d, sys, p);   // drag back to the water
      return;
    }
    if (d.mode === 'retreat') {
      const q = d.waterGoal ??= waterGoal(d, sys, d);
      d.st = deep ? DS.SWIM : DS.RETREAT;
      sys.steer(d, q.x, q.z, c.runSpeed, dt, c.turnRate);
      if ((deep && sys.distTo(d, q.x, q.z) < 2) || d.modeT > 8) { d.waterGoal = null; d.mode = 'lurk'; d.modeT = 0; }
    }
  },
};

function spawnAt(sys, s) {
  const r = clamp(s.radius ?? C().leashRadius, 6, C().leashRadius);
  return sys.spawn(TYPE, s.x, s.z, { leash: { kind: 'water', x: s.x, z: s.z, r, bound: r + 2 }, home: { x: s.x, z: s.z } });
}
