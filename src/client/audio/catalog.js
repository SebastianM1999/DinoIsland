const files = (prefix, count) => Array.from({ length: count }, (_, i) => `/assets/audio/sfx/${prefix}-${i + 1}.wav`);
const group = (prefix, count, gain, rate = 1, variation = 0.05) => ({ files: files(prefix, count), gain, rate, variation });
const selected = (names, gain, rate = 1, variation = .04) => ({ files: names.map(n => `/assets/audio/sfx/${n}.wav`), gain, rate, variation });

export const FOOTSTEPS = {
  grass: group('recorded-grass-walk', 6, 0.22), sand: group('recorded-sand-walk', 6, 0.22),
  rock: group('recorded-rock-walk', 6, 0.22), wood: group('recorded-wood-walk', 6, 0.22),
  leaves: group('recorded-leaves-walk', 6, 0.22), dirt: group('recorded-dirt-walk', 6, 0.22),
  mud: group('recorded-mud-walk', 4, 0.22), gravel: group('recorded-gravel-walk', 6, 0.22),
  water: group('recorded-water-walk', 6, 0.24),
};

// Use the approved opening takes for both gaits: cadence follows actual travel;
// running adds weight and a small pitch variation without a second loop.
export const RUN_FOOTSTEPS = Object.fromEntries(Object.entries(FOOTSTEPS).map(([surface, walk]) =>
  [surface, { ...walk, gain: .27, rate: 1.04 }]));
// Approved alternative grass and vegetation takes remain independent layers.
export const STEP_TEXTURES = {
  grass: group('recorded-grass-alt', 6, .07),
  leaves: group('recorded-brush', 3, .055),
};
export const DINO_WEIGHT = {
  trex: group('recorded-trex-step', 1, .5, 1, .05),
  ground: { ...STEP_TEXTURES.grass, gain: .18, rate: .7, lowpass: 380 },
};

export const EFFECTS = {
  pistol: group('recorded-pistol', 1, 0.8, 1, 0.015), rifle: group('recorded-rifle', 1, 0.85, 1, 0.015),
  empty: group('empty', 1, 0.25), reload: group('reload', 2, 0.3),
  bow: group('el-bow', 1, 0.5), bowDraw: group('bow-draw', 2, 0.22),
  swing: group('swish', 3, 0.4, 1.1), throw: group('el-spear', 1, 0.45, 1),
  hit: group('el-impact', 1, 0.55), hitWeak: group('el-impact', 1, 0.65, 1.15),
  thunk: group('el-impact', 1, 0.35, 0.9), bite: group('hit', 3, 0.45, 0.8),
  waterStep: FOOTSTEPS.water, splash: group('water', 2, 0.35),
  splashBig: group('water', 2, 0.5, 0.75), plop: group('water', 2, 0.12, 1.6),
  roar_trex: group('recorded-trex-roar', 3, 0.68, 1, 0.025),
  roar_raptor: selected(['recorded-trill', 'recorded-roar-1'], .45, 1.03),
  'roar_gloom-raptor': selected(['recorded-trill', 'recorded-roar-1'], .5, .74, .06),   // the raptor calls pitched down into a hiss
  roar_ptera: group('recorded-ptera', 1, 0.4, 1, 0.06),
  roar_stego: selected(['recorded-grunt-1', 'recorded-grunt-2'], .52, .85),
  roar_brachio: selected(['recorded-roar-2', 'recorded-roar-3'], .6, .68),
  'roar_alpha-sarcosuchus': group('recorded-sarco-growl', 3, .6, .85),
  sarco_enrage: group('recorded-sarco-growl', 3, .7, .75),
  bigStep: DINO_WEIGHT.ground,
};

export const ISLAND_MUSIC = {
  jungle: { calm: '/assets/audio/music/jungle-calm.ogg', danger: '/assets/audio/music/jungle-danger.ogg' },
  volcano: { calm: '/assets/audio/music/volcano-calm.ogg', danger: '/assets/audio/music/volcano-danger.ogg' },
  // the swamp borrows the volcano's darker tracks until it has its own
  swamp: { calm: '/assets/audio/music/volcano-calm.ogg', danger: '/assets/audio/music/volcano-danger.ogg' },
};

export const MENU_MUSIC = '/assets/audio/music/menu.ogg';
export const BOSS_MUSIC = '/assets/audio/music/boss.ogg';
// Forest Exploration ships as a seamless loop; other tracks retain their
// opening on first play and crossfade the tail into the first two seconds.
export const musicLoopStart = url => url === ISLAND_MUSIC.jungle.calm ? 0 : 2;

export function effectGroup(name, { surface = 'grass', movement = 'walk' } = {}) {
  if (name === 'step' || name === 'waterStep') {
    const steps = movement === 'run' ? RUN_FOOTSTEPS : FOOTSTEPS;
    return steps[name === 'waterStep' ? 'water' : surface] || steps.grass;
  }
  return EFFECTS[name];
}

/** Shared preload list also makes layered samples visible to provenance checks. */
export const SAMPLE_GROUPS = [...Object.values(EFFECTS), ...Object.values(FOOTSTEPS),
  ...Object.values(RUN_FOOTSTEPS), ...Object.values(STEP_TEXTURES), ...Object.values(DINO_WEIGHT)];
