// Levels: one island per level. Each island has a biome (look, plants, rocks,
// dinosaurs, relic sites) and gets harder the further the team sails.
// Shared by server and client; the island itself is generated from
// (level index, variant seed) by shared/island.js.

/**
 * Biome definitions. Colors are plain hex strings so the server can load this
 * file too; the client turns them into THREE colors.
 */
export const BIOMES = {
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    sites: ['cave', 'waterfall', 'peak', 'nest', 'river', 'ruins'],
    river: 'water',
    vegetation: {
      treeDensity: 1.35,            // multiplier on the jungle density field
      maxTrees: 1250,
      trees: { jungle: 0.24, round: 0.12, tall: 0.1, kapok: 0.12, giant: 0.12, bamboo: 0.14, banana: 0.12, palm: 0.1 },
      beachTrees: ['palm'],
      bushes: { fern: 0.4, bigleaf: 0.35, bush: 0.25 },
      maxBushes: 1100,
      grass: 1,
      flowers: 1,
    },
    rocks: { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845', mossChance: 0.7, count: 1 },
    terrain: {
      sandDry: '#f6d08a', sand: '#efc176', sandWet: '#d9a862',
      seabed: '#e2bd7a', seabedDeep: '#b99a68',
      grass: '#7cc34a', grassLight: '#95d256', grassDark: '#5ea83a',
      floor: '#4c9434', high: '#86c650',
      rock: '#aa9fb4', rockDark: '#8d82a0', rockWarm: '#b59c90',
      dirt: '#c9985c', dirtDark: '#b0814c',
      riverbed: '#b3a27a',
    },
    sky: {
      background: '#7cc8f5', fog: '#a8dcf7', fogNear: 70, fogFar: 260,
      top: '#4fb0f0', horizon: '#a8dcf7', cloud: '#ffffff',
      sun: '#fff0d6', sunIntensity: 2.6, hemiSky: '#bfe6ff', hemiGround: '#d8bb80', hemiIntensity: 1.6,
      exposure: 1.05,
    },
    water: { shallow: '#57e6dc', mid: '#1fb4e0', deep: '#1560c4', foam: '#f4fcff', sky: '#a9dcf8' },
    dinos: { brachio: 1, stego: 1, raptor: 2, ptera: 3, trex: 0 },   // herds / groups / packs / flyers / rexes
    music: 'calm',
  },

  volcano: {
    id: 'volcano',
    name: 'Volcano',
    sites: ['cave', 'peak', 'nest', 'ruins', 'lava'],
    river: 'lava',
    vegetation: {
      treeDensity: 0.55,
      maxTrees: 420,
      trees: { pine: 0.45, dead: 0.4, palm: 0.1, kapok: 0.05 },
      beachTrees: ['palm', 'dead'],
      bushes: { shrub: 0.6, fern: 0.4 },
      maxBushes: 500,
      grass: 0.35,
      flowers: 0.1,
    },
    rocks: { colors: ['#4a4452', '#3a3540', '#5a5058'], moss: '#6b7a4a', mossChance: 0.15, count: 1.6 },
    terrain: {
      sandDry: '#6e6468', sand: '#5a5256', sandWet: '#433c40',
      seabed: '#5a5054', seabedDeep: '#3a3438',
      grass: '#7c8a4c', grassLight: '#8d9656', grassDark: '#5f6b3e',
      floor: '#4f5a36', high: '#6b6468',
      rock: '#4b4452', rockDark: '#35303b', rockWarm: '#6a4a44',
      dirt: '#7a6a60', dirtDark: '#5e5048',
      riverbed: '#2a2226',
      ash: '#6f686c', scorch: '#2e2629',
    },
    sky: {
      background: '#6b5a5e', fog: '#8a6f68', fogNear: 55, fogFar: 230,
      top: '#3a3440', horizon: '#b0785c', cloud: '#8a7f86',
      sun: '#ffb27a', sunIntensity: 2.0, hemiSky: '#a09aae', hemiGround: '#7a4a36', hemiIntensity: 1.35,
      exposure: 1.0,
    },
    water: { shallow: '#4fb7ad', mid: '#1d7690', deep: '#123f63', foam: '#dde6ea', sky: '#9a8a90' },
    dinos: { brachio: 1, stego: 1, raptor: 3, ptera: 4, trex: 1 },
    music: 'calm',
  },
};

/** The islands, in order. Sailing away from the last one wins the game. */
export const LEVELS = [
  // the first island only has raptors and pteranodons
  { name: 'Emerald Jungle', biome: 'jungle', dinos: { brachio: 0, stego: 0 } },
  { name: 'Ashfall Isle', biome: 'volcano' },
];

export const LEVEL_COUNT = LEVELS.length;

/**
 * Full definition of level `index` (0-based, clamped to the existing islands).
 * difficulty scales dinosaur health/damage.
 */
export function levelDef(index) {
  const i = Math.min(LEVEL_COUNT - 1, Math.max(0, index | 0));
  const base = LEVELS[i];
  const biome = BIOMES[base.biome];
  return {
    index: i,
    number: i + 1,
    name: base.name,
    biome,
    difficulty: 1 + i * 0.3,
    dinos: { ...biome.dinos, ...base.dinos },
    relicCount: 3,
    last: i === LEVEL_COUNT - 1,
  };
}
