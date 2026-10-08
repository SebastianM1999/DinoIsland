// The hand-held torch: tunables both sides agree on and the one question other
// systems (dinosaur brains, later) ask about it. Pure data, no DOM, no three.

import { PF } from './protocol.js';

export const TORCH = {
  /** Seconds until a taken torch reappears at its ground spot (`layout.torchSpots`). */
  respawnTime: 60,
  /** World light of one lit torch (client `LightPool`, physical units under ACES tone mapping). */
  light: { color: '#ff9a45', distance: 20, decay: 2, intensity: 42, ember: 0.12 },
  /** Light-pool slots: 0 is the local player, 1-3 are remote players. */
  slots: 4,
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
