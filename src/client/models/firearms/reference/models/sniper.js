// Adapted from Operation Ironhold, copyright (c) 2026 StarKnightt, MIT; see ../OPERATION-IRONHOLD-LICENSE.
// Uses the Claude-of-Duty receiver/hand contact kit, MIT; see ../LICENSE.
import { buildRifle } from './rifle.js';

/** SR7 Longbow: heavy barrel, tan skeleton chassis, folded bipod and telescopic scope. */
export function buildSniper() {
  return buildRifle({ sniper: true });
}
