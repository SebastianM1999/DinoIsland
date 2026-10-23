// Triceratops: herd defender. The herd notices you, lines up toward you and shows its horns (threat display); come
// closer and it charges along a committed line (side-step to dodge) or, up close, thrusts and tosses with its horns.
// It never chases past its leash and walks back afterwards. The shared logic is ai/defender.js.

import { CONFIG } from '../../shared/config.js';
import { defenderBrain, spawnHerd, startCharge, chargeStep, startStrikeClip, strikeClipStep } from './defender.js';
import { ringHome } from './testDinos.js';

const C = CONFIG.dinos.triceratops;
const RUN = C.ai.defend.run;
/** Horn thrust synced to Triceratops_Attack (art/sources/triceratops README: 1.2 s, wind-up 0-0.36, shove ~0.45,
 *  hooking toss ~0.55): the hit lands on the toss, `reach` past the body edge (horn tips + player radius). */
export const HORN = { windup: 0.36, at: 0.5, len: 1.2, reach: 2, cone: 0.8, push: 1.5 };

const gore = (d, sys, p) => sys.hitPlayer(d, p, C.attackDamage, C.knockback, 1);

export const triceratopsBrain = {
  spawnInitial(sys) {
    const home = ringHome(sys, 'triceratops');
    if (home) for (let i = 0; i < home.n; i++) spawnHerd(sys, 'triceratops', home, C.groupSize);
  },
  ...defenderBrain('triceratops', {
    start(d, sys, t) {
      if (Math.hypot(t.x - d.x, t.z - d.z) < d.radius + HORN.reach + 0.5) startStrikeClip(d, sys, t);
      else startCharge(d, t);
    },
    step(d, sys, dt, ctx) {
      if (d.act.kind === 'clip') return strikeClipStep(d, sys, dt, HORN, gore);
      // a charge that reaches you ends in the horn toss
      return chargeStep(d, sys, dt, ctx, RUN, (d, sys, p) => { sys.cue(d, p.id); gore(d, sys, p); });
    },
  }),
};
