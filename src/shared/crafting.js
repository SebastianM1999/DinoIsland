// Crafting box at the hut workbench: recipes and upgrade effects. Shared by the
// server (validation, effects) and the client (panel, weapon handling).
//
// Supplies are crafted again and again. Upgrades are built once for the whole
// team; an upgrade of tier n is unlocked on island n (levelDef(i).number).
// More tiers can be added later by appending entries with a higher `tier`.

/** Costs use the loot keys of CONFIG.loot. */
export const RECIPES = [
  // ---- supplies
  { id: 'arrows',  kind: 'supply', icon: 'arrow', name: 'Arrows ×6', text: 'Six fresh arrows for the quiver.', cost: { teeth: 1 }, give: { arrows: 6 } },
  { id: 'trap',    kind: 'supply', icon: 'trap',  name: 'Spike trap', text: 'One more trap to set.', cost: { hide: 1, claws: 1 }, give: { traps: 1 } },
  { id: 'spear',   kind: 'supply', icon: 'spear', name: 'Spare spear', text: 'A new spear if you lost yours.', cost: { teeth: 1, hide: 1 }, give: { spear: 1 } },

  // ---- upgrades, tier 1 (island 1)
  { id: 'bow1',    kind: 'upgrade', tier: 1, line: 'bow',   icon: 'bow',    name: 'Reinforced bow', text: '+20% arrow damage.', cost: { hide: 2, teeth: 3 }, mods: { bowDamage: 0.2 } },
  { id: 'spear1',  kind: 'upgrade', tier: 1, line: 'spear', icon: 'spear',  name: 'Stone spearhead', text: '+20% stab and throw damage.', cost: { hide: 1, teeth: 2 }, mods: { spearDamage: 0.2 } },
  { id: 'quiver1', kind: 'upgrade', tier: 1, line: 'gear',  icon: 'quiver', name: 'Leather quiver', text: '+4 arrows in the quiver.', cost: { hide: 2 }, mods: { quiver: 4 } },
  // ---- tier 2 (island 2)
  { id: 'bow2',    kind: 'upgrade', tier: 2, line: 'bow',   icon: 'bow',    name: 'Longbow', text: 'Faster arrows and +15% arrow damage.', cost: { claws: 2, plates: 2, teeth: 3 }, requires: 'bow1', mods: { bowDamage: 0.15, bowSpeed: 8 } },
  { id: 'spear2',  kind: 'upgrade', tier: 2, line: 'spear', icon: 'spear',  name: 'Barbed spear', text: 'Farther throws and a quicker next throw.', cost: { claws: 2, teeth: 2 }, requires: 'spear1', mods: { throwSpeed: 0.15, throwCooldown: -0.25 } },
  { id: 'traps2',  kind: 'upgrade', tier: 2, line: 'gear',  icon: 'trap',   name: 'Trap crate', text: 'Carry one more trap.', cost: { plates: 2, hide: 1 }, mods: { traps: 1 } },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Total effect of a set/array of built upgrade ids. */
export function upgradeMods(built) {
  const m = { bowDamage: 0, bowSpeed: 0, spearDamage: 0, throwSpeed: 0, throwCooldown: 0, quiver: 0, traps: 0 };
  for (const id of built || []) {
    const r = RECIPE_BY_ID[id];
    if (r?.kind === 'upgrade') for (const k in r.mods) m[k] += r.mods[k];
  }
  return m;
}

/** Island number from which a recipe can be crafted (supplies: always). */
export const unlockIsland = (r) => r.tier || 1;

/** Whether `have` (loot totals) covers the recipe cost. */
export const canAfford = (r, have) => Object.entries(r.cost).every(([k, n]) => (have?.[k] || 0) >= n);
