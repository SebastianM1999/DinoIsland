// Which island a new expedition may start on. Island progress belongs to each expedition (it is
// part of its save, sim/worldSave.js), so a new expedition starts on the first island; temporary
// playtest access lets testers start a new expedition on any island.
import { LEVELS } from '../../shared/levels.js';

// Temporary playtest access. Turn off for release: new expeditions then always start on island 1.
export const TEST_ALL_ISLANDS_UNLOCKED = true;

function islandIndex(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(LEVELS.length - 1, value)) : null;
}

/** The last island a new expedition may start on. */
export function availableStartingIsland(testing = TEST_ALL_ISLANDS_UNLOCKED) {
  return testing ? LEVELS.length - 1 : 0;
}

/** Restrict a menu selection to the islands a new expedition may start on. */
export function unlockedStartingIsland(selected, testing = TEST_ALL_ISLANDS_UNLOCKED) {
  return Math.min(islandIndex(selected) ?? 0, availableStartingIsland(testing));
}
