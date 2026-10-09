// Levels: one island per level. Each island has a biome (look, plants, rocks,
// dinosaurs, relic sites) and gets harder the further the team sails.
// Shared by server and client; the island itself is generated from
// (level index, variant seed) by shared/island.js. Every island is a FIXED map:
// it always loads its `variant` below (`?variant=N` overrides it for testing).

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

  // Ashfall Isle: a round island round one huge caldera (shared/island.js
  // volcanoHeight). Lava flows run from vents on its flanks to the beach, the
  // paths cross them on basalt bridges; small lava craters dot the lowland; the ground near lava and fumaroles is hot, and the
  // volcano erupts now and then (sim/volcano.js). The crater floor on top is
  // the arena (shared/volcanoArena.js).
  volcano: {
    id: 'volcano',
    name: 'Volcano',
    sites: ['peak', 'nest', 'ruins', 'lava'],
    river: 'lava',
    shape: 'round',
    vegetation: {
      treeDensity: 0.62,
      maxTrees: 560,
      // charred trunks everywhere; pines and ferns gather in the cooler green pockets (layout.js)
      trees: { charred: 0.42, dead: 0.2, pine: 0.3, kapok: 0.08 },
      beachTrees: ['palm', 'charred'],
      bushes: { shrub: 0.55, fern: 0.45 },
      maxBushes: 620,
      // greens muted toward ash grey (client/world/vegetation.js)
      tints: { pine: '#a3ac8e', kapok: '#9aa087', palm: '#b5ae94', fern: '#a8aa8a', shrub: '#b0a68e' },
      grass: 0.3,
      flowers: 0.06,
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
    // dark and glowing: a smoky red-brown sky over a hot horizon
    sky: {
      background: '#4e3a3a', fog: '#6e4c44', fogNear: 40, fogFar: 200,
      top: '#2a2228', horizon: '#c0583a', cloud: '#5e4e50',
      sun: '#ff9a5e', sunIntensity: 1.6, hemiSky: '#8e7e8a', hemiGround: '#8a3e26', hemiIntensity: 1.2,
      exposure: 0.9,
    },
    water: { shallow: '#4a9a92', mid: '#1d5e72', deep: '#12324e', foam: '#cfd4d6', sky: '#7a5e5c' },
    // its own fruit, one per role (config.js fruit.types): chilis on warm ground, plums, rare obsidian figs
    fruit: { bush: 'emberchili', tree: 'ashplum', plant: 'obsidianfig' },
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
      treeDensity: 0.85,              // open clearings between the dry-land groves
      maxTrees: 1050,
      minTreeHeight: 1.2,           // the lowland is low: trees grow on any dry ground
      // dry land only: the mangroves grow in and along the bogs (layout.js, their own pass)
      trees: { kapok: 0.35, tall: 0.2, snag: 0.25, nipa: 0.2 },
      beachTrees: ['nipa'],
      bushes: { reed: 0.55, fern: 0.45 },
      maxBushes: 1600,
      // jungle palettes muted toward the swamp's olive greys (client/world/vegetation.js)
      tints: { kapok: '#93a07e', tall: '#909e80', mangrove: '#c9cdb8', nipa: '#b4b99e', snag: '#d0d0c4', fern: '#a2ab8c', reed: '#c8c6a8' },
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
      background: '#76806f', fog: '#7f8a78', fogNear: 12, fogFar: 95,
      top: '#4d5a52', horizon: '#8a9682', cloud: '#a3aa9c',
      sun: '#e8e2c4', sunIntensity: 1.3, hemiSky: '#a5b4a0', hemiGround: '#5a5038', hemiIntensity: 1.25,
      exposure: 0.85,
    },
    water: { shallow: '#5a6a3c', mid: '#3c4a2c', deep: '#26301e', foam: '#b8bfa2', sky: '#7e8a78' },
    // its own fruit, one per role (config.js fruit.types): bog-shore shrubs, figs, hidden lotus
    fruit: { bush: 'marshberry', tree: 'swampfig', plant: 'glowlotus' },
    dinos: { brachio: 1, stego: 1, raptor: 3, ptera: 3, trex: 0 },
    music: 'calm',
  },

  // The Hollow Mountain: a round mountain between two coves. The team lands in
  // the west cove, crosses the mountain through a branching tunnel maze (dark,
  // wet stone, crystal halls, flooded tunnels, shared/caveMaze.js) and leaves
  // it by the one exit tunnel onto the east beach. The world is still a
  // heightfield: tunnels are low floor, rock is high wall, the roof is
  // Terrain.ceilingAt. Cave species come later (layout.caveDinoSpots).
  cave: {
    id: 'cave',
    name: 'Hollow Mountain',
    sites: ['cave', 'lake', 'abyss'],
    river: 'water',
    shape: 'cave',
    vegetation: {
      treeDensity: 0,
      maxTrees: 0,
      trees: {},
      beachTrees: [],
      bushes: {},
      maxBushes: 0,
      grass: 0,
      flowers: 0,
    },
    // wet dark stone with cool tints, little moss (stone kinds as in the jungle)
    rocks: { colors: ['#5d6068', '#4b4e5a', '#6a6a70'], moss: '#3f6a52', mossChance: 0.45, count: 0.16,
      kinds: [[0.98, 0.98, 1.0], [1.1, 1.0, 0.9], [0.66, 0.68, 0.78], [1.05, 1.08, 1.14]] },
    terrain: {
      sandDry: '#8a8678', sand: '#767366', sandWet: '#4f4f4a',
      seabed: '#4f5558', seabedDeep: '#2c3640',
      grass: '#3d5a4a', grassLight: '#4c6c58', grassDark: '#2f4a3c',
      floor: '#3a4048', high: '#565a66',
      rock: '#555864', rockDark: '#383b48', rockWarm: '#6a5d66',
      dirt: '#5b5148', dirtDark: '#3e3732',
      riverbed: '#2c3238',
      // flowstone (pale, banded), moss on wet ledges, cave mud
      flowstone: '#a79fa6', moss: '#3f6a52', mud: '#4a4038',
    },
    // inside the mountain: very dark, cold teal and violet, the torch and the crystals do the lighting
    sky: {
      background: '#04070a', fog: '#071118', fogNear: 3, fogFar: 46,
      top: '#101826', horizon: '#1c3038', cloud: '#2a3a46',
      sun: '#9fb8d0', sunIntensity: 0, hemiSky: '#4a6a8c', hemiGround: '#2a2038', hemiIntensity: 0.34,
      exposure: 1.3,
    },
    // the two coves outside: a dusk, warm low sun over a teal sea (the client blends sky -> skyOutside by the
    // depth into the mountain, client/world/caveFx.js; the sky dome and the sea use this one)
    skyOutside: {
      background: '#2f4c5c', fog: '#35566a', fogNear: 35, fogFar: 300,
      top: '#182f4a', horizon: '#c7a58a', cloud: '#8fa6b4',
      sun: '#ffc690', sunIntensity: 1.5, hemiSky: '#8ab4cf', hemiGround: '#4a5a62', hemiIntensity: 1.15,
      exposure: 0.95,
    },
    water: { shallow: '#2f7f86', mid: '#16525e', deep: '#0b2a3a', foam: '#9fc4c8', sky: '#1c3038' },
    // flyers and giants never fit under the roof: one raptor pack strayed in, the
    // pale noise-hunting gloom raptors (packs, sim/ai/gloomRaptor.js) own the dark
    // and a sump lurker waits in every flooded tunnel (sim/ai/sumpLurker.js)
    dinos: { brachio: 0, stego: 0, raptor: 1, ptera: 0, trex: 0, 'gloom-raptor': 5, 'sump-lurker': 2, 'crystal-plodder': 3 },
    music: 'volcano',   // (cave music comes with the client)
  },
};

/** The islands, in order. Sailing away from the last one wins the game. */
export const LEVELS = [
  // the first island only has raptors and pteranodons – plus the giant locked
  // away in the Primeval Grove (shared/grove.js), a teaser for later islands –
  // and the Boss Arena, a lava islet beside the boat (shared/bossArena.js)
  { name: 'Emerald Jungle', biome: 'jungle', dinos: { brachio: 0, stego: 0, raptor: 4 }, grove: true, bossArena: true, variant: 1 },
  // twice the land area of the first island (incl. its boss islet); the swamp
  // arena in the waist waits for its boss (shared/swampArena.js)
  { name: 'Misty Swamp', biome: 'swamp', scale: 0.86, swampArena: true, seedIndex: 2, variant: 1 },
  // round, about 1.3 times the swamp's land area; the crater arena on top waits
  // for its boss (shared/volcanoArena.js)
  { name: 'Ashfall Isle', biome: 'volcano', scale: 0.65, seedIndex: 1, variant: 1 },
  // the last level: through the mountain from the west cove to the east beach (shared/caveMaze.js)
  { name: 'Hollow Mountain', biome: 'cave', scale: 1, seedIndex: 3, variant: 1 },
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
    // the fixed map: the island always builds this variant (sim/world.js; `?variant=N` overrides it)
    variant: base.variant ?? 1,
    // island size: the first island is a small tutorial island, later ones full size
    scale: base.scale ?? (i === 0 ? 0.52 : 0.87),
    last: i === LEVEL_COUNT - 1,
  };
}
