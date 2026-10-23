// Defensive herbivores (docs/dino-ai-concept.md section 4): the shared brain of the Triceratops, Ankylosaurus and
// Pachycephalosaurus. They notice a player with their senses (ai/senses.js), escalate in plain steps
// (watch -> threaten -> strike), keep a leash from where the threat began and walk back afterwards. A hit on one
// herd member alerts the whole herd (herd memory); an attacker beyond the leash makes the herd drift away instead
// of standing still. Utility (ai/utility.js) picks the option, the species' strike style does the committed attack.
// Tuning: CONFIG.dinos[type].ai.defend (`warn`, `strike`, `charge`, `leash`, `calm`, `territory`, `cooldown`, ...).

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { LEVEL, perceive, perceived, levelOf, alarm } from './senses.js';
import { choose, curve, rethink } from './utility.js';
import { grazeWander } from './territorial.js';

const toYaw = (d, x, z) => Math.atan2(-(x - d.x), -(z - d.z));
/** Spacing (m, at scale 1 plus body radius) between herd members standing in a front line. */
const FRONT_GAP = 2;

/** Create a herd in `sys.groups` and spawn `n` members of `type` around `home`. */
export function spawnHerd(sys, type, home, n) {
  const id = `${type}-${sys.world.id()}`;
  const herd = { id, home: { x: home.x, z: home.z }, hurtBy: null, hurtAt: -Infinity };
  sys.groups.set(id, herd);
  for (let i = 0; i < n; i++) {
    const p = sys.randomWalkablePoint({ type, home: herd.home }, home.x, home.z, 8);
    sys.spawn(type, p.x, p.z, { group: id, slot: i, home: { x: home.x, z: home.z } });
  }
  return herd;
}

const membersOf = (sys, d) => sys.list.filter((o) => o.group === d.group && o.alive).sort((a, b) => a.id - b.id);

/** What the animal knows right now, for the utility options. */
function context(d, sys, herd, D) {
  const now = sys.world.now;
  const angry = !!herd && herd.hurtBy != null && now - herd.hurtAt < D.calm;
  let t = angry ? perceived(d, sys, herd.hurtBy) : null;
  t ??= perceive(d, sys, LEVEL.SUSPICIOUS);
  const anchor = d.anchor ?? { x: d.x, z: d.z };
  let crowd = 0;
  for (const p of sys.world.players.values()) {
    if (levelOf(d, p.id) >= LEVEL.SUSPICIOUS && p.alive && Math.hypot(p.x - d.x, p.z - d.z) < D.warn) crowd++;
  }
  return {
    t, angry: angry && t?.id === herd.hurtBy, crowd, anchor,
    lv: t ? levelOf(d, t.id) : LEVEL.UNAWARE,
    dist: t ? Math.hypot(t.x - d.x, t.z - d.z) : Infinity,
    tFromAnchor: t ? Math.hypot(t.x - anchor.x, t.z - anchor.z) : Infinity,
    selfFromAnchor: Math.hypot(d.x - anchor.x, d.z - anchor.z),
    hp: d.hp / (d.maxHp || 1),
    ready: (d.cool ?? 0) <= 0,
  };
}

/** The options every defender weighs (scores 0..1 before the species' weights). */
function options(D) {
  const opts = {
    // calm only back near its ground; out there it walks back first (`return`)
    graze: (c) => [c.t ? 0.15 : 1, curve.inv(c.selfFromAnchor, D.leash * 0.6, D.leash * 0.9)],
    watch: (c) => [c.t ? 0.5 : 0],
    // between the warning and the strike radius; inside the strike radius the display gives way to the strike
    threaten: (c) => [c.t?.seen ? 1 : 0, curve.inv(c.dist, D.warn, D.warn * 1.25),
      c.angry ? 0.5 : curve.linear(c.dist, D.strike * 0.7, D.strike)],
    strike: (c) => [c.t?.seen ? 1 : 0, c.ready ? 1 : 0,
      c.angry ? curve.inv(c.dist, D.charge, D.charge * 1.3) : curve.inv(c.dist, D.strike, D.strike * 1.3),
      curve.inv(c.tFromAnchor, D.leash * 0.85, D.leash)],
    return: (c) => [curve.linear(c.selfFromAnchor, D.leash * 0.5, D.leash * 0.8)],
    // an attacker shooting from beyond the leash: the herd moves off instead of standing still
    avoid: (c) => [c.angry ? 1 : 0, c.t ? 1 : 0, curve.linear(c.tFromAnchor, D.leash * 0.9, D.leash * 1.3)],
  };
  if (D.flee) {
    // skittish: a group of players, or being badly hurt, sends it running
    opts.flee = (c) => [c.t ? 1 : 0, Math.max(curve.linear(c.crowd, 1, 2), curve.inv(c.hp, D.flee.hp, D.flee.hp + 0.2)),
      curve.inv(c.dist, D.warn, D.warn * 1.6)];
  }
  return opts;
}

/**
 * The defensive herbivore brain for `type`. `style` is the species' committed attack:
 * `start(d, sys, t, ctx)` begins it (sets `d.act`), `step(d, sys, dt, ctx)` runs it and returns false once over.
 */
export function defenderBrain(type, style) {
  const C = CONFIG.dinos[type];
  const D = C.ai.defend, U = C.ai.utility;
  const OPTIONS = options(D);
  const calm = { walkSpeed: C.walkSpeed, territoryRadius: D.territory };

  return {
    respawn(sys, r) {
      const herd = sys.groups.get(r.group);
      if (!herd) return;
      const p = sys.randomWalkablePoint({ type, home: herd.home }, herd.home.x, herd.home.z, 10);
      sys.spawn(type, p.x, p.z, { group: r.group, slot: 0, home: { ...herd.home } });
    },

    init(d) {
      d.mode = 'graze';
      d.modeT = 2 + Math.random() * 4;
      d.cool = 0;
      d.act = null;
      d.anchor = null;
      d.forced = null;
    },

    /** Nudged free by the dino system: drop the committed attack and think again. */
    onStuck(d) {
      if (d.act) { d.act = null; d.cool = D.cooldown; }
      d.wander = null;
      rethink(d);
    },

    onHurt(d, sys, byId) {
      const herd = sys.groups.get(d.group);
      const p = sys.world.players.get(byId);
      if (!p) return;
      // herd memory: every member knows who did it and where they stood
      if (herd) { herd.hurtBy = byId; herd.hurtAt = sys.world.now; }
      for (const o of herd ? membersOf(sys, d) : [d]) alarm(o, sys, byId);
      if (!d.anchor) d.anchor = { x: d.x, z: d.z };
      sys.roar(d);
      if (!d.act && (d.cool ?? 0) <= 0 && Math.hypot(p.x - d.x, p.z - d.z) < D.charge * 1.2) d.forced = 'strike';
    },

    update(d, sys, dt) {
      const herd = sys.groups.get(d.group);
      d.cool = Math.max(0, (d.cool ?? 0) - dt);
      const ctx = context(d, sys, herd, D);

      // a committed attack runs to its end (dodgeable, never re-aimed by a new thought)
      if (d.act) {
        if (style.step(d, sys, dt, ctx)) return;
        d.act = null;
        d.cool = D.cooldown;
        rethink(d);
      }

      const forced = d.forced && ctx.t ? d.forced : null;
      d.forced = null;
      const option = choose(d, OPTIONS, ctx, U, sys.world.now, forced);
      if (option !== 'graze' && !d.anchor) d.anchor = { x: d.x, z: d.z };
      const t = ctx.t;

      switch (option) {
        case 'strike':
          if (t?.seen) {
            d.fl |= 1;
            style.start(d, sys, t, ctx);
            style.step(d, sys, dt, ctx);
            return;
          }
        // falls through: nothing in sight to strike at
        case 'watch':
          d.fl &= ~1;
          sys.halt(d, dt);
          if (t) sys.turnTo(d, toYaw(d, t.x, t.z), dt);
          d.st = DS.ALERT;
          return;
        case 'threaten': {
          d.fl &= ~1;
          // the herd lines up between its ground and the threat, heads down toward it
          const members = herd ? membersOf(sys, d) : [d];
          const i = members.indexOf(d), n = members.length;
          const a = d.anchor, len = Math.hypot(t.x - a.x, t.z - a.z) || 1;
          const ux = (t.x - a.x) / len, uz = (t.z - a.z) / len;
          const side = (i - (n - 1) / 2) * (FRONT_GAP + 2 * (d.radius ?? 1));
          const gx = a.x + ux * 2 - uz * side, gz = a.z + uz * 2 + ux * side;
          if (n > 1 && Math.hypot(gx - d.x, gz - d.z) > 2) {
            sys.steer(d, gx, gz, C.walkSpeed * 1.3, dt);
            d.st = DS.WALK;
          } else {
            sys.halt(d, dt);
            sys.turnTo(d, toYaw(d, t.x, t.z), dt, C.turnRate * 1.3);
            d.st = DS.ROAR;
            sys.roar(d, 4);
          }
          return;
        }
        case 'return': {
          d.fl &= ~1;
          const left = sys.steer(d, d.anchor.x, d.anchor.z, C.walkSpeed * 1.4, dt);
          d.st = DS.WALK;
          if (left < 3) { d.anchor = null; rethink(d); }
          return;
        }
        case 'avoid': {
          // move off out of the shooter's reach: the herd's ground moves with it
          d.fl &= ~1;
          if (!d.away || Math.hypot(d.away.x - d.x, d.away.z - d.z) < 4) d.away = sys.fleePoint(d, t.x, t.z, 30);
          sys.steer(d, d.away.x, d.away.z, (C.runSpeed + C.walkSpeed) / 2, dt);
          d.st = d.spd > C.walkSpeed * 1.3 ? DS.RUN : DS.WALK;
          d.anchor = { x: d.x, z: d.z };
          return;
        }
        case 'flee': {
          d.fl &= ~1;
          if (!d.away || Math.hypot(d.away.x - d.x, d.away.z - d.z) < 4) d.away = sys.fleePoint(d, t.x, t.z, 25);
          sys.steer(d, d.away.x, d.away.z, C.runSpeed, dt);
          d.st = DS.FLEE;
          d.anchor = { x: d.x, z: d.z };
          return;
        }
        default:
          d.anchor = null;
          d.away = null;
          grazeWander(d, sys, dt, calm, d.home);
      }
    },
  };
}

// ---------------------------------------------------------------- strike building blocks

/**
 * A committed charge: a head-down wind-up (`windup` s facing the target), then a run along the line it chose,
 * with only small corrections (a side-step dodges it), until it touches the target (`onContact`), runs `time` s,
 * leaves its leash or is blocked. Returns false when over. `d.act` = { kind: 'charge', ... } from `startCharge`.
 */
export function startCharge(d, t) {
  d.act = { kind: 'charge', id: t.id, phase: 'windup', t: 0, dir: toYaw(d, t.x, t.z), hit: false };
}

export function chargeStep(d, sys, dt, ctx, spec, onContact) {
  const a = d.act, C = CONFIG.dinos[d.type];
  const p = sys.world.players.get(a.id);
  a.t += dt;
  if (a.phase === 'windup') {
    sys.halt(d, dt);
    if (p) { a.dir = toYaw(d, p.x, p.z); sys.turnTo(d, a.dir, dt, C.turnRate * 2); }
    d.st = DS.ALERT;
    if (a.t >= spec.windup) { a.phase = 'run'; a.t = 0; sys.roar(d, 3); }
    return true;
  }
  if (a.phase === 'run') {
    d.st = DS.CHARGE;
    if (p?.alive) {
      const to = toYaw(d, p.x, p.z);
      sys.turnTo(d, a.dir + angleDiff(a.dir, to) * 0.25, dt, 0.7);
    }
    sys.move(d, spec.speed, dt, 12);
    const reach = (d.radius ?? 1) + spec.reach;
    if (!a.hit && p?.alive && Math.hypot(p.x - d.x, p.z - d.z) < reach
      && Math.abs(angleDiff(d.yaw, toYaw(d, p.x, p.z))) < 1.1) {
      a.hit = true;
      onContact(d, sys, p);
    }
    const anchor = ctx.anchor, D = C.ai.defend;
    const outside = Math.hypot(d.x - anchor.x, d.z - anchor.z) > D.leash;
    if (a.hit || a.t > spec.time || outside || (d.blockedT || 0) > 0.8) { a.phase = 'recover'; a.t = 0; }
    return true;
  }
  sys.halt(d, dt);
  d.st = DS.ALERT;
  return a.t < spec.recover;
}

/**
 * A timed melee move synced to the baked Attack clip: `windup` s in which it still turns to the target, the hit
 * at `at` s (once, if the live player is within `reach` m of the body edge and in front), over at `len` s.
 * `push` keeps it moving forward at that speed (a ram). Call `startStrikeClip` first (cues the Attack clip).
 */
export function startStrikeClip(d, sys, t) {
  d.act = { kind: 'clip', id: t.id, t: 0, hit: false };
  sys.cue(d, t.id);
}

export function strikeClipStep(d, sys, dt, spec, onHit) {
  const a = d.act, C = CONFIG.dinos[d.type];
  const p = sys.world.players.get(a.id);
  a.t += dt;
  d.st = DS.ATTACK;
  if (spec.push && a.t < spec.at + 0.1) sys.move(d, spec.push, dt, 10);
  else sys.halt(d, dt);
  if (p && a.t < spec.windup) sys.turnTo(d, toYaw(d, p.x, p.z), dt, C.turnRate * 1.6);
  if (!a.hit && a.t >= spec.at) {
    a.hit = true;
    if (p?.alive && Math.hypot(p.x - d.x, p.z - d.z) < (d.radius ?? 1) + spec.reach
      && Math.abs(angleDiff(d.yaw, toYaw(d, p.x, p.z))) < (spec.cone ?? 1)) onHit(d, sys, p);
  }
  return a.t < spec.len;
}

export { toYaw };
