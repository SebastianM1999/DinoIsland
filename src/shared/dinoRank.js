// Ranks of dinosaurs: the ordinary animal, the rare alpha (bigger, tougher, more
// loot) and the bosses (the grove's titan, the T-Rex, the Alpha Sarcosuchus). The
// rank sets how long butchering takes (sim/world.js startButcher). Pure rules,
// shared by the sim (spawn, butchering) and the client (health bar).

import { CONFIG } from './config.js';

/** An alpha: rolled on ordinary spawns (sim/dinos.js spawn). */
export const ALPHA = { chance: 0.05, scale: 1.15, hpMul: 1.6, dmgMul: 1.25, lootMul: 2 };

/** Seconds to butcher a carcass of each rank (Butcher's Eye still halves it). */
export const BUTCHER_TIME = { normal: 3, alpha: 5, boss: 10 };

/** Always bosses, never alphas. */
const BOSS_TYPES = new Set(['trex', 'alpha-sarcosuchus']);

/** Could a fresh spawn of `type` with these extras be an alpha? Bosses, raiders and the grove's titan never are. */
export function canBeAlpha(type, extra = {}) {
  return !BOSS_TYPES.has(type) && !extra.boss && !extra.raid && !extra.leash && !extra.scale && !extra.title;
}

/** 'boss' | 'alpha' | 'normal' of a dinosaur state (a leashed animal guards an arena: the titan, the swamp boss). */
export function rankOf(d) {
  if (BOSS_TYPES.has(d.type) || d.boss || d.leash) return 'boss';
  return d.alpha ? 'alpha' : 'normal';
}

/** Butchering time of a carcass in seconds (before the Butcher's Eye skill). */
export const butcherTime = (d) => BUTCHER_TIME[rankOf(d)];

/** The display name of an alpha. */
export const alphaTitle = (name) => `Alpha ${name}`;

/**
 * Everything a carcass gives when it is butchered: the animal's loot and its butcher
 * loot (bones, skull...), the meat a pterosaur stole, all doubled for an alpha.
 * Killing an animal drops nothing but the arrows stuck in it (sim/dinos.js).
 */
export function carcassLoot(d) {
  const c = CONFIG.dinos[d.type];
  const out = {};
  for (const loot of [c.loot, c.butcher?.loot, d.carcassMeat ? { meat: d.carcassMeat } : null]) {
    for (const [k, n] of Object.entries(loot || {})) out[k] = (out[k] || 0) + n;
  }
  if (d.alpha) for (const k in out) out[k] *= ALPHA.lootMul;
  return out;
}
