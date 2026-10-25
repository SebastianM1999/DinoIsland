// Weak spots per species: the damage multiplier of each hit zone (head, neck, body, leg, tail,
// and the species extras flank, plates, wing). Every species has its own weak spot (a zone
// above WEAK_AT) and most have armour somewhere (below ARMOR_AT), so learning where to hit
// pays off per animal; the Weak Spot skill (shared/skills.js `weakSpotMul`) scales only the
// part above 1. A species or zone missing here falls back to CONFIG.hitZones. Used by the sim
// (dinos.js `damage`: the multiplier, `EV.DINO_HIT` weak/armor and the `aim` hint).

import { CONFIG } from './config.js';

/** A zone above this multiplier counts as a weak spot (hit marker, `EV.DINO_HIT.weak`). */
export const WEAK_AT = 1.2;
/** ... and below this one as armour (`EV.DINO_HIT.armor`). */
export const ARMOR_AT = 0.5;

export const WEAK_SPOTS = {
  raptor:              { head: 1.6, neck: 2.0, body: 1.0, leg: 0.8, tail: 0.6 },   // thin neck
  'gloom-raptor':      { head: 1.0, neck: 1.1, body: 1.6, leg: 0.8, tail: 0.6 },   // bony crest, soft belly
  dilophosaurus:       { head: 1.1, neck: 2.0, body: 1.0, leg: 0.8, tail: 0.6 },   // the frilled neck
  spinosaurus:         { head: 1.0, neck: 1.0, body: 0.7, leg: 1.0, tail: 1.8 },   // sail back is tough, the tail base is not
  trex:                { head: 1.0, neck: 1.2, body: 0.9, leg: 1.8, tail: 0.6 },   // a skull like a rock: go for the legs
  'alpha-sarcosuchus': { head: 0.4, neck: 1.1, body: 0.7, leg: 1.8, tail: 1.0 },   // armoured snout and back, soft legs
  'sump-lurker':       { head: 1.9, neck: 1.2, body: 0.8, leg: 1.0, tail: 0.6 },
  stego:               { head: 1.3, neck: 1.5, body: 1.0, flank: 1.8, plates: 0.35, leg: 0.8, tail: 0.5 },   // flanks under the plates
  'crystal-plodder':   { head: 1.0, neck: 1.0, body: 0.6, leg: 1.9, tail: 0.7 },   // crystal-crusted back
  brachio:             { head: 2.5, neck: 1.3, body: 0.9, leg: 0.8, tail: 0.7 },   // the tiny head up high
  ptera:               { head: 1.6, neck: 1.0, body: 1.0, wing: 1.8 },             // the membrane
  triceratops:         { head: 0.4, neck: 1.0, body: 1.0, leg: 1.2, tail: 1.8 },   // frill and horns in front, soft behind
  ankylosaurus:        { head: 1.0, neck: 1.2, body: 0.4, leg: 1.9, tail: 0.3 },   // armour and club: the legs
  pachycephalosaurus:  { head: 0.4, neck: 2.0, body: 1.0, leg: 1.0, tail: 0.7 },   // the dome
};

/** Damage multiplier of `zone` on a dinosaur of `type` (before the Weak Spot skill). */
export function zoneMul(type, zone) {
  return WEAK_SPOTS[type]?.[zone] ?? CONFIG.hitZones[zone] ?? 1;
}

/** The species' best zone: its weak spot (`{ zone, mul }`). */
export function weakSpotOf(type) {
  const t = WEAK_SPOTS[type] ?? CONFIG.hitZones;
  let best = null;
  for (const [zone, mul] of Object.entries(t)) if (!best || mul > best.mul) best = { zone, mul };
  return best;
}
