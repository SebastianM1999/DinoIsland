// The game's colour bible for swatches that belong to no single biome. Biome
// colours (terrain, rocks, sky, water, vegetation tints) live in
// shared/levels.js BIOMES; fallbacks for a layout without a biome read
// BIOMES.jungle instead of keeping their own copy (copies drift apart).
// New world/model code takes its colours from here or from the biome, never
// new hex literals: test/palette.test.js only lets their count go down.

/** Terrain accents painted over any biome's ground (client/world/terrainMesh.js). */
export const GROUND = {
  ember: '#7a2a12',        // glowing cracks in hot ground
  causeway: '#6a5f62',     // the boss arena's stone causeway
  wetRock: '#4a4652',      // rock at the water line and under the waterfall
  wetMoss: '#3f6e3a',      // moss on that wet rock
};

/** Meadow flower tints (client/world/vegetation.js): bright, sparse accents. */
export const FLOWERS = ['#ff7fbf', '#ffe066', '#ffffff', '#b49cff', '#ff9a4a', '#ff5f6d'];

/** Effects on creatures and things (client/models/dino/hitFlash.js). */
export const FX = {
  hitFlash: '#ffd9c2',     // warm flash on a dinosaur that takes damage
};

/** Far islands on the horizon (client/world/sky.js): softer than any biome so they sit back in the haze. */
export const DISTANT_LAND = { grass: '#78b857', sand: '#e8c98a', rock: '#9a8fa6' };
