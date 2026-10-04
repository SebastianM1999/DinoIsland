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
    sites: ['waterfall', 'peak', 'nest', 'river', 'ruins'],   // (caves are disabled for now)
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
    // kinds: per-rock tints (multiplied onto colors) that also pick the stone pattern in
    // client/world/surfaceDetail.js: warm = layered sandstone, dark = cracked basalt,
    // light = pitted limestone, neutral = speckled granite
    rocks: { colors: ['#9c93a8', '#8a8199', '#a79c9a'], moss: '#6fa845', mossChance: 0.7, count: 1,
      kinds: [[0.98, 0.98, 1.0], [1.2, 1.0, 0.8], [0.66, 0.66, 0.72], [1.16, 1.14, 1.1]] },
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
    sites: ['peak', 'nest', 'ruins', 'lava'],
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
    // basalt, red scoria, obsidian, pale pumice (see the jungle biome)
    rocks: { colors: ['#4a4452', '#3a3540', '#5a5058'], moss: '#6b7a4a', mossChance: 0.15, count: 1.6,
      kinds: [[0.98, 0.98, 1.0], [1.35, 0.95, 0.8], [0.6, 0.6, 0.68], [1.45, 1.42, 1.38]] },
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

  // The Misty Swamp: a gloomy mangrove forest – many shallow bogs (planBogs in
  // shared/island.js: wading through them slows everyone, CONFIG.player.swampSpeedMul)
  // crossed by dry dirt causeways. The island is an hourglass with the swamp
  // arena (shared/swampArena.js) in its waist.
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    sites: ['ruins', 'nest', 'river', 'peak'],
    river: 'water',
    shape: 'hourglass',
    vegetation: {
      treeDensity: 1.25,
      maxTrees: 640,
      minTreeHeight: 1.2,           // the lowland is low: trees grow on any dry ground
      trees: { mangrove: 0.56, snag: 0.14, nipa: 0.12, kapok: 0.18 },
      beachTrees: ['mangrove', 'nipa'],
      bushes: { reed: 0.55, fern: 0.45 },
      maxBushes: 850,
      grass: 0.8,
      flowers: 0.25,
    },
    // wet dark stone, lots of moss (stone kinds as in the jungle)
    rocks: { colors: ['#6c6a64', '#5e5c58', '#77716a'], moss: '#4f6e34', mossChance: 0.85, count: 0.7,
      kinds: [[0.98, 0.98, 1.0], [1.2, 1.0, 0.8], [0.66, 0.66, 0.72], [1.16, 1.14, 1.1]] },
    terrain: {
      sandDry: '#b9a678', sand: '#a89468', sandWet: '#857350',
      seabed: '#8a7a58', seabedDeep: '#5e5440',
      grass: '#5d7c3a', grassLight: '#6c8a40', grassDark: '#46622e',
      floor: '#3e5428', high: '#647a3e',
      rock: '#77716a', rockDark: '#5a5650', rockWarm: '#7c6a58',
      dirt: '#7a6446', dirtDark: '#5e4c36',
      riverbed: '#4e4232',
      mud: '#4a3d2c', bog: '#3c3424',
    },
    sky: {
      background: '#5f6b5c', fog: '#6f7c69', fogNear: 25, fogFar: 150,
      top: '#4d5a52', horizon: '#8a9682', cloud: '#a3aa9c',
      sun: '#e8e2c4', sunIntensity: 1.3, hemiSky: '#a5b4a0', hemiGround: '#5a5038', hemiIntensity: 1.25,
      exposure: 0.85,
    },
    water: { shallow: '#5a6a3c', mid: '#3c4a2c', deep: '#26301e', foam: '#b8bfa2', sky: '#7e8a78' },
    dinos: { brachio: 1, stego: 1, raptor: 3, ptera: 3, trex: 0 },
    music: 'calm',
  },
};

/** The islands, in order. Sailing away from the last one wins the game. */
export const LEVELS = [
  // the first island only has raptors and pteranodons – plus the giant locked
  // away in the Primeval Grove (shared/grove.js), a teaser for later islands –
  // and the Boss Arena, a lava islet beside the boat (shared/bossArena.js)
  { name: 'Emerald Jungle', biome: 'jungle', dinos: { brachio: 0, stego: 0, raptor: 4 }, grove: true, bossArena: true },
  // twice the land area of the first island (incl. its boss islet); the swamp
  // arena in the waist waits for its boss (shared/swampArena.js)
  { name: 'Misty Swamp', biome: 'swamp', scale: 0.86, swampArena: true, seedIndex: 2 },
  // keeps the seeds it had as the second island: same islands as before
  { name: 'Ashfall Isle', biome: 'volcano', seedIndex: 1 },
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
    grove: !!base.grove,
    bossArena: !!base.bossArena,
    swampArena: !!base.swampArena,
    // which seed family the island's variants come from (shared/island.js islandSeed)
    seedIndex: base.seedIndex ?? i,
    // island size: the first island is a small tutorial island, later ones full size
    scale: base.scale ?? (i === 0 ? 0.52 : 0.87),
    last: i === LEVEL_COUNT - 1,
  };
}
