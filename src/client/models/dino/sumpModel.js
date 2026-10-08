// Game and preview asset contract for the Sump Lurker (cave ambusher, art/sources/sump-lurker). It shares the
// Sarcosuchus rig layout (sprawled quadruped, flipped Jaw, Tail1..8, IK legs) at ~5 m instead of 16 m.
import { SARCO_MODEL } from './sarcoModel.js';

export const SUMP_TYPE = 'sump-lurker';
export const SUMP_MODEL = {
  ...SARCO_MODEL,
  url: '/assets/models/dinos/sump-lurker.glb', source: 'SumpLurker',
  // uniform fit measured with check_glb.mjs (height, length, strides)
  height: 0.723, length: 5, walkStride: 0.429, runStride: 1.053, hitHeight: 0.9,
  runThreshold: 2.5, maxCadence: 3.5, maxFootAdjustment: 0.12,
  authoredPoseClips: ['attack', 'bite', 'retreat', 'ambush', 'swim', 'hurt'],
  authoredJawClips: ['attack', 'bite', 'ambush'],
  clips: Object.fromEntries(['Idle', 'Walk', 'Run', 'Attack', 'Death', 'Swim', 'Bite', 'Hurt', 'Retreat', 'Ambush'].map(
    name => [name.toLowerCase(), `SumpLurker_${name}`])),
  // measured with hit_coverage.mjs (fitted metres: [zone, bone, x, y, forward, radius]): the narrow snout, the skull sides and
  // the sprawled feet that the generic joint spheres miss
  extraHitZones: [
    ['head', 'Head', 0, 0.49, 2.23, 0.17], ['head', 'Head', 0, 0.49, 1.64, 0.17],
    ['head', 'Head', -0.16, 0.58, 1.2, 0.17], ['head', 'Head', 0.18, 0.59, 1.18, 0.17],
    ['leg', 'BackFootL', -0.58, 0.05, -0.43, 0.17], ['leg', 'BackFootR', 0.58, 0.05, -0.43, 0.17],
    ['leg', 'FrontFootL', -0.57, 0.05, 0.65, 0.17], ['leg', 'FrontFootR', 0.57, 0.05, 0.64, 0.17],
  ].map(([zone, bone, x, y, fwd, radius]) => ({ zone, bone, at: [x, y, fwd], radius })),
};
