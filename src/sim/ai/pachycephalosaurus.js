// Pachycephalosaurus: the skittish rammer. It runs from a group of players (or when badly hurt), but a lone player
// who closes in gets the challenge display (dome lowered, ground scrapes: the Roar clip) and then a head-butt
// charge with a big knockback. Leash ~30 m. The shared logic is ai/defender.js.

import { CONFIG } from '../../shared/config.js';
import { defenderBrain, spawnHerd, startCharge, chargeStep, startStrikeClip, strikeClipStep } from './defender.js';
import { ringHome } from './testDinos.js';

const C = CONFIG.dinos.pachycephalosaurus;
const RUN = C.ai.defend.run;
/** Head-butt synced to Pachycephalosaurus_Attack (README: 1.0 s, rock back + lower the dome 0-0.28 = dodge time,
 *  dome contact ~0.45, toss 0.5-0.62); it keeps some of the charge's momentum into the ram. */
export const BUTT = { windup: 0.28, at: 0.45, len: 1.0, reach: 1.5, cone: 0.9, push: C.runSpeed * 0.45 };

const ram = (d, sys, p) => sys.hitPlayer(d, p, C.attackDamage, C.knockback, 1);

export const pachycephalosaurusBrain = {
  spawnInitial(sys) {
    const home = ringHome(sys, 'pachycephalosaurus');
    if (home) for (let i = 0; i < home.n; i++) spawnHerd(sys, 'pachycephalosaurus', home, C.groupSize);
  },
  ...defenderBrain('pachycephalosaurus', {
    start(d, sys, t) {
      if (Math.hypot(t.x - d.x, t.z - d.z) < d.radius + BUTT.reach + 0.5) startStrikeClip(d, sys, t);
      else startCharge(d, t);
    },
    step(d, sys, dt, ctx) {
      if (d.act.kind === 'clip') return strikeClipStep(d, sys, dt, BUTT, ram);
      // the charge ends in the head-butt once it is close
      return chargeStep(d, sys, dt, ctx, RUN, (d, sys, p) => { startStrikeClip(d, sys, p); });
    },
  }),
};
