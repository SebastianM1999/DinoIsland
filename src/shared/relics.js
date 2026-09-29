// Boat parts ("relics"): three of these are hidden on every island. Each kind
// belongs to one kind of site. Shared by server (placement, pickup) and client
// (models, HUD, boat dialog). It doesn't have to make sense – it's an island.

export const RELICS = {
  egg: { name: 'Golden Egg', site: 'nest', hint: 'in a dinosaur nest', color: '#ffc933' },
  crystal: { name: 'Glow Crystal', site: 'cave', hint: 'deep inside a cave', color: '#6fe3ff' },
  propeller: { name: 'Brass Propeller', site: 'waterfall', hint: 'at the foot of the waterfall', color: '#d9a441' },
  wheel: { name: "Ship's Wheel", site: 'peak', hint: 'on the highest peak', color: '#9a6632' },
  anchor: { name: 'Old Anchor', site: 'river', hint: 'on a sand island in the middle of the river', color: '#7d8796' },
  sail: { name: 'Patched Sail', site: 'ruins', hint: 'in the old ruins', color: '#f2e6c8' },
  rudder: { name: 'Obsidian Rudder', site: 'lava', hint: 'beside the lava flow', color: '#3b2f4a' },
};

export const RELIC_KINDS = Object.keys(RELICS);

/** Relic kind that belongs to a site type. */
export const RELIC_FOR_SITE = Object.fromEntries(RELIC_KINDS.map((k) => [RELICS[k].site, k]));
