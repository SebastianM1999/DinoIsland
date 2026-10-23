// Ankylosaurus: the armoured tank. It never runs: it turns its rump on whoever comes close and swings the tail
// club (swept arc behind it, heavy knockback); a player just out of reach gets a few heavy steps' charge first.
// Very short leash. The shared logic (senses, threat display, herd memory, leash) is ai/defender.js.

import { CONFIG } from '../../shared/config.js';
import { DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { defenderBrain, spawnHerd, startCharge, chargeStep } from './defender.js';
import { makeTailSweep, rearYaw } from './territorial.js';
import { ringHome } from './testDinos.js';

const C = CONFIG.dinos.ankylosaurus;
const RUN = C.ai.defend.run;
/** Ankylosaurus_Attack is 1.4 s (art/sources/ankylosaurus README). */
const CLUB_TIME = 1.4;
/**
 * Club sweep around the hip pivot, [time s, min angle, max angle] from straight behind (+ = its right). Taken
 * from the README's clip timings (coils left in the 0-0.36 wind-up, whips right, crosses the centre ~0.48, peak
 * ~0.55), not yet measured from the baked clip like the stego's SWEEP: re-measure when the clip changes.
 */
const SWEEP = [[0.36, -0.95, -0.55], [0.42, -0.6, -0.2], [0.48, -0.25, 0.25], [0.55, 0.25, 0.8], [0.62, 0.6, 1.05]];
const tail = makeTailSweep({ sweep: SWEEP, strikeEnd: 0.65, pivotBack: 0.9, reach: 2.9, halfWidth: 0.45 });
/** Aim the rump so the target sits in the middle of the strike arc. */
const AIM_PHI = 0.1;

/** The rump must point this close (rad) at the target before the swing starts; it gives up turning after TURN_MAX s. */
const TURN_OK = 0.5, TURN_MAX = 1.6;

function startClub(d, sys, t) {
  d.act = { kind: 'club', id: t.id, t: 0, phase: 'turn' };
  d.tailVictims = new Set();
}

function clubStep(d, sys, dt) {
  const a = d.act;
  const p = sys.world.players.get(a.id);
  if (a.phase === 'turn') {
    // first swing the rump round onto the target (the telegraph), then the clip
    a.t += dt;
    sys.halt(d, dt);
    d.st = DS.ALERT;
    const want = p ? rearYaw(d, p.x, p.z, AIM_PHI) : d.yaw;
    sys.turnTo(d, want, dt, C.turnRate * 2);
    if (Math.abs(angleDiff(d.yaw, want)) < TURN_OK || a.t > TURN_MAX) { a.phase = 'swing'; a.t = 0; sys.cue(d, a.id); }
    return true;
  }
  const t0 = a.t;
  a.t += dt;
  d.st = DS.TAIL;
  sys.halt(d, dt);
  // swing the rump round during the wind-up, then commit (sprinting away dodges it)
  if (p && a.t < tail.strikeStart) sys.turnTo(d, rearYaw(d, p.x, p.z, AIM_PHI), dt, C.turnRate * 2);
  tail.tailStrike(d, sys, t0, a.t, (q, rel) => sys.hitPlayer(d, q, C.tailDamage, C.tailKnockback, 1, { x: rel.px, z: rel.pz }));
  return a.t < CLUB_TIME;
}

export const ankylosaurusBrain = {
  spawnInitial(sys) {
    const home = ringHome(sys, 'ankylosaurus');
    if (home) for (let i = 0; i < home.n; i++) spawnHerd(sys, 'ankylosaurus', home, C.groupSize);
  },
  ...defenderBrain('ankylosaurus', {
    start(d, sys, t) {
      if (Math.hypot(t.x - d.x, t.z - d.z) < C.tailRange * (d.scale || 1)) startClub(d, sys, t);
      else startCharge(d, t);
    },
    step(d, sys, dt, ctx) {
      if (d.act.kind === 'club') return clubStep(d, sys, dt);
      // the charge only closes the gap; the club comes next
      return chargeStep(d, sys, dt, ctx, RUN, (d, sys, p) => sys.hitPlayer(d, p, C.chargeDamage, 6, 0));
    },
  }),
};

export const clubSweep = tail;
