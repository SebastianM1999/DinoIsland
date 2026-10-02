// Pure view-model of the skill panel (no DOM): everything the panel draws is
// derived here from a profile, so it can be tested headlessly.

import {
  SKILLS, TREES, TREE_NAMES, TIER_GATE, treeSkills, maxRank, canBuy, progress, spentPoints,
  XP_BY_TYPE, RELIC_XP, RELIC_POINTS,
} from '../../shared/skills.js';
import { CONFIG } from '../../shared/config.js';

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

/** Small-caps tier heading. */
export function tierLabel(tree, tier) {
  return tier === 3 ? 'Capstone' : `Tier ${ROMAN[tier]}`;
}

/** What a tier needs: shown next to the padlock ('' for the open first tier). */
export function tierGateText(tree, tier) {
  if (tier === 1) return '';
  return tier === 3 ? `${TIER_GATE[3]} points` : `${TIER_GATE[tier]} points in ${TREE_NAMES[tree]}`;
}

/** Subtitle under the tree name. */
export const TREE_SUB = { fighting: 'Hunt harder', endurance: 'Run further', durability: 'Survive together' };

/** One skill card: rank, effect texts and whether the next rank can be bought. */
export function skillView(profile, id) {
  const s = SKILLS[id];
  const rank = Math.min(maxRank(id), profile.skills[id] | 0);
  const max = maxRank(id);
  const spent = spentPoints(profile.skills, s.tree);
  const gate = TIER_GATE[s.tier];
  const buyable = canBuy(profile, id);
  let state = 'available', reason = '', lock = null;
  if (rank >= max) state = 'maxed';
  else if (!buyable.ok) {
    state = 'locked';
    // the tier rule explains more than "not enough points", so it wins when both apply
    lock = spent < gate ? 'gate' : 'points';   // 'points' = the tier is open, only the points are missing
    reason = spent < gate ? `Spend ${gate} points in ${TREE_NAMES[s.tree]} first` : buyable.reason;
  }
  return {
    id, tree: s.tree, tier: s.tier, name: s.name, cost: s.cost, rank, max, state, reason, lock,
    capstone: s.tier === 3,
    now: rank > 0 ? s.ranks[rank - 1] : null,
    next: rank < max ? s.ranks[rank] : null,
    ranks: s.ranks,
  };
}

/** The whole panel: header numbers plus three trees grouped by tier. */
export function buildSkillView(profile) {
  const prog = progress(profile);
  const trees = TREES.map((tree) => {
    const spent = spentPoints(profile.skills, tree);
    const tiers = [];
    for (const id of treeSkills(tree)) {
      const v = skillView(profile, id);
      let group = tiers.find((t) => t.tier === v.tier);
      if (!group) {
        group = { tier: v.tier, label: tierLabel(tree, v.tier), gateText: tierGateText(tree, v.tier), gate: TIER_GATE[v.tier], open: spent >= TIER_GATE[v.tier], skills: [] };
        tiers.push(group);
      }
      group.skills.push(v);
    }
    return { id: tree, name: TREE_NAMES[tree], sub: TREE_SUB[tree], spent, tiers };
  });
  return { ...prog, trees };
}

const SHORT_NAME = { raptor: 'Raptor', stego: 'Stego', ptera: 'Ptera', brachio: 'Brachio', trex: 'T-Rex' };

/** Footer line: what gives XP. */
export function xpTableText() {
  const dinos = Object.entries(XP_BY_TYPE).map(([k, xp]) => `${SHORT_NAME[k] ?? CONFIG.dinos?.[k]?.name ?? k} ${xp} XP`);
  return `${dinos.join(', ')}, boat part ${RELIC_XP} XP + ${RELIC_POINTS} point`;
}

/**
 * Optimistic purchase for the panel: the profile after buying one rank of `id`,
 * or null when it is not allowed. The server stays authoritative (MSG.PROF).
 */
export function previewBuy(profile, id) {
  if (!canBuy(profile, id).ok) return null;
  return { ...profile, skills: { ...profile.skills, [id]: (profile.skills[id] | 0) + 1 } };
}

/** Points a reset refunds (everything spent). */
export const refundOf = (profile) => spentPoints(profile.skills);

/** Every point of a campStations() result a player can stand at (null entries are stations that do not exist yet). */
export function campStationPoints(st) {
  return [st?.home, st?.fire, st?.workbench, st?.wardrobe, st?.board, ...(st?.dropOff ?? []), ...(st?.refill ?? [])]
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
}

/** Is `pos` within `radius` of a camp station? (client-side hint for the reset button; the server decides) */
export const nearCamp = (st, pos, radius) => campStationPoints(st).some((s) => Math.hypot(s.x - pos.x, s.z - pos.z) <= radius);
