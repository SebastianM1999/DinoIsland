// The hand-held torch: tunables both sides agree on and the one question other
// systems (dinosaur brains, later) ask about it. Pure data, no DOM, no three.

import { PF } from './protocol.js';

export const TORCH = {
  /** Seconds until a taken torch reappears at its ground spot (`layout.torchSpots`). */
  respawnTime: 60,
  /** World light of one lit torch (client `LightPool`, physical units under ACES tone mapping). */
  light: { color: '#ffb877', distance: 26, decay: 1.25, intensity: 15, ember: 0.12 },
  /** Light-pool slots: 0 is the local player, 1-3 are remote players. */
  slots: 4,
};

/**
 * Wall torches in the Hollow Mountain (`layout.wallTorches`): a sconce about every `spacing` m along the tunnels,
 * left or right. A player with a lit hand torch lights one with E within `reach` m (server-checked); it stays lit
 * for the rest of the island and every player sees it, so the cave gets brighter as the team explores.
 * The nearest lit ones get a pooled light (`pool` by graphics tier), the rest show their flame and glow.
 */
export const WALL_TORCH = {
  spacing: 50,
  height: 2.3,           // metres above the tunnel floor
  reach: 3.4,
  light: { color: '#ffae66', distance: 22, decay: 1.3, intensity: 12 },
  pool: [2, 3, 4, 4],    // lights by tier: low, medium, high, ultra
};

/**
 * Does this player carry a lit torch? Takes a snapshot row's `fl` number or any
 * object with `fl` (a server player, a remote player). Dinosaur brains can use
 * it to react to light; the server only lets the flag through for torch owners.
 */
export function carriesLight(player) {
  const fl = typeof player === 'number' ? player : player?.fl;
  return ((fl | 0) & PF.TORCH) !== 0;
}

/** Main tools that need the left hand as well (bow, trap, rifle grip); eating does too. The torch is lowered meanwhile. */
const TWO_HANDED = new Set(['bow', 'trap', 'rifle']);
export function leftHandBusy(tool, eating = false) {
  return eating || TWO_HANDED.has(tool);
}
