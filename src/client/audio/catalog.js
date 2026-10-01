const files = (prefix, count) => Array.from({ length: count }, (_, i) => `/assets/audio/sfx/${prefix}-${i + 1}.wav`);
const group = (prefix, count, gain, rate = 1, variation = 0.05) => ({ files: files(prefix, count), gain, rate, variation });

export const FOOTSTEPS = {
  grass: group('grass', 5, 0.17), sand: group('sand', 6, 0.2),
  rock: group('rock', 6, 0.19), wood: group('wood', 3, 0.2),
  leaves: group('leaves', 2, 0.19), dirt: group('dirt', 2, 0.2),
  mud: group('mud', 1, 0.19, 1, 0.09), gravel: group('gravel', 1, 0.19, 1, 0.09),
  water: group('water', 2, 0.2),
};

export const EFFECTS = {
  pistol: group('el-pistol', 1, 0.8, 1, 0.015), rifle: group('el-m4', 1, 0.85, 1, 0.015),
  empty: group('empty', 1, 0.25), reload: group('reload', 2, 0.3),
  bow: group('el-bow', 1, 0.5), bowDraw: group('bow-draw', 2, 0.22),
  swing: group('swish', 3, 0.4, 1.1), throw: group('el-spear', 1, 0.45, 1),
  hit: group('el-impact', 1, 0.55), hitWeak: group('el-impact', 1, 0.65, 1.15),
  thunk: group('el-impact', 1, 0.35, 0.9), bite: group('hit', 3, 0.45, 0.8),
  waterStep: FOOTSTEPS.water, splash: group('water', 2, 0.35),
  splashBig: group('water', 2, 0.5, 0.75), plop: group('water', 2, 0.12, 1.6),
  roar_trex: group('trex', 3, 0.75, 0.85, 0.04),
  roar_raptor: group('raptor', 2, 0.55, 1.2, 0.08),
  roar_ptera: group('ptera', 2, 0.35, 1.8, 0.09),
  roar_stego: group('stego', 2, 0.5, 0.72, 0.06),
  roar_brachio: group('brachio', 2, 0.55, 0.6, 0.04),
  bigStep: group('thunk', 3, 0.6, 0.45),
};

export const ISLAND_MUSIC = {
  jungle: { calm: '/assets/audio/music/jungle-calm.ogg', danger: '/assets/audio/music/jungle-danger.ogg' },
  volcano: { calm: '/assets/audio/music/volcano-calm.ogg', danger: '/assets/audio/music/volcano-danger.ogg' },
};

export const MENU_MUSIC = '/assets/audio/music/menu.ogg';
export const BOSS_MUSIC = '/assets/audio/music/boss.ogg';
// Forest Exploration ships as a seamless loop; other tracks retain their
// opening on first play and crossfade the tail into the first two seconds.
export const musicLoopStart = url => url === ISLAND_MUSIC.jungle.calm ? 0 : 2;

export function effectGroup(name, { surface = 'grass' } = {}) {
  return name === 'step' ? FOOTSTEPS[surface] || FOOTSTEPS.grass : EFFECTS[name];
}
