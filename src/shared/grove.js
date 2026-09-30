// The Primeval Grove: a walled-off, overgrown hollow on the first island where
// an ancient, oversized Brachiosaurus lives. It is a teaser for later islands:
// players can look in over the standing stones but can't enter yet, and
// nothing they throw or shoot from outside gets past its barrier.
// Shared by client (visuals, prompt, movement) and server (validation, AI).

export const GROVE = {
  name: 'Primeval Grove',
  /** Radius of the barrier (m); the flattened hollow reaches a bit further. */
  radius: 28,
  /**
   * The skill a later island will teach. Only the hint text uses it so far.
   * TODO(grove-unlock): hook this up to the skill/unlock system once it exists.
   */
  requiredSkill: 'Primal Courage',
  /** The giant that lives here. */
  titan: {
    name: 'Elder Brachiosaurus',
    minScale: 1.1,       // model and body size vs. a normal Brachiosaurus –
    maxScale: 1.35,      // as big as its grove allows (see titanScale)
    healthMul: 6,        // on top of the island's difficulty scaling
    tail: 11.5,          // Brachiosaurus length behind its centre (m, before scale): keeps the tail inside
  },
};

/** The standing stones reach at most this far past the barrier radius (see layout.js). */
export const GROVE_STONE_REACH = 1.9;

/** The titan is as big as its grove allows: a small grove gets a slightly smaller giant. */
export function titanScale(grove) {
  const T = GROVE.titan;
  return Math.min(T.maxScale, Math.max(T.minScale, grove.r / 17));
}

/** Is (x, z) inside the grove of `layout` (pad > 0 grows the circle)? */
export function insideGrove(layout, x, z, pad = 0) {
  const g = layout?.grove;
  if (!g) return false;
  const r = g.r + pad;
  return (x - g.x) ** 2 + (z - g.z) ** 2 < r * r;
}

/**
 * Where a segment from a to b first enters the grove from outside, as a
 * fraction t in [0, 1], or -1. Segments starting inside never hit the
 * barrier (someone inside may shoot out and around).
 */
export function groveEntry(layout, ax, az, bx, bz) {
  const g = layout?.grove;
  if (!g) return -1;
  const fx = ax - g.x, fz = az - g.z;
  const c = fx * fx + fz * fz - g.r * g.r;
  if (c <= 0) return -1;
  const dx = bx - ax, dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return -1;
  const b = fx * dx + fz * dz;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * May this player walk into the grove?
 *
 * TODO(grove-unlock): the grove is meant to open once the player has learned
 * GROVE.requiredSkill on a later island. There is no skill/unlock system yet,
 * so for now nobody may enter – except in creative mode (testing). When the
 * unlock system exists, check the player's unlocked skills here; client
 * (controller barrier + prompt) and server (ServerWorld.onState) both use
 * this one function.
 *
 * @param {{creative?: boolean}} player server player or client controller
 */
export function mayEnterGrove(player) {
  return !!player?.creative;
}
