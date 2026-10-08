// Skill tree + progression (XP, levels, points). Shared by server and client:
// the server owns the profile and applies the damage/HP/healing effects, the
// client derives the same `skillMods()` to apply its own movement/stamina
// effects and to show the tree. Pure data + functions, no I/O.
//
// A profile is `{ xp, bonus, skills }`:
//   xp      total experience (the level is derived from it)
//   bonus   extra skill points earned outside levelling (required items)
//   skills  { [skillId]: rank } – bought ranks
// It is saved by the client (localStorage), sent in `hello`, and re-validated by
// the server with sanitizeProfile() so an edited save can never exceed its budget.

export const LEVEL_CAP = 30;
/** Points a freshly spent tier needs in the same tree (spent BEFORE buying the node). */
export const TIER_GATE = { 1: 0, 2: 4, 3: 10 };
export const TREES = ['fighting', 'endurance', 'durability'];
export const TREE_NAMES = { fighting: 'Fighting', endurance: 'Endurance', durability: 'Durability' };

/** XP granted to every player when a dinosaur of this type dies (anywhere on the island). */
export const XP_BY_TYPE = { raptor: 20, 'gloom-raptor': 30, stego: 40, ptera: 60, brachio: 80, trex: 400, 'alpha-sarcosuchus': 800, 'sump-lurker': 70, 'crystal-plodder': 90 };
/** A required item (boat part): XP for everyone plus one bonus skill point. */
export const RELIC_XP = 150;
export const RELIC_POINTS = 1;
export const MAX_BONUS_POINTS = 12;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level) => 100 + 40 * (level - 1);
/** Total XP at which `level` is reached (level 1 = 0). */
export function xpForLevel(level) {
  let t = 0;
  for (let l = 1; l < Math.min(level, LEVEL_CAP); l++) t += xpToNext(l);
  return t;
}
export const MAX_XP = xpForLevel(LEVEL_CAP);
export function levelFromXp(xp) {
  let l = 1;
  while (l < LEVEL_CAP && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Dash (Endurance capstone, key Q): a short burst of speed. Client-side movement, server grants the distance. */
export const DASH = { cost: 25, distance: 3.6, duration: 0.18, cooldown: 2 };

/**
 * Skill definitions. `ranks[i]` describes what rank i+1 gives (shown in the UI);
 * `cost` is points per rank. Tier 1 is open, tier 2 needs TIER_GATE[2] points
 * spent in the tree, tier 3 (capstone) needs TIER_GATE[3].
 */
export const SKILLS = {
  // ---------------------------------------------------------------- fighting
  bruteForce:   { tree: 'fighting', tier: 1, name: 'Brute Force',   cost: 1, ranks: ['Spear damage +10%', 'Spear damage +20%', 'Spear damage +30%'] },
  marksman:     { tree: 'fighting', tier: 1, name: 'Marksman',      cost: 1, ranks: ['Gun damage +10%', 'Gun damage +20%', 'Gun damage +30%'] },
  steadyHands:  { tree: 'fighting', tier: 1, name: 'Steady Hands',  cost: 1, ranks: ['Reload 10% faster', 'Reload 20% faster', 'Reload 30% faster'] },
  weakSpot:     { tree: 'fighting', tier: 2, name: 'Weak Spot',     cost: 1, ranks: ['Weak-spot bonus +15%', 'Weak-spot bonus +30%', 'Weak-spot bonus +45%'] },
  executioner:  { tree: 'fighting', tier: 2, name: 'Executioner',   cost: 1, ranks: ['+15% damage to dinos under 25% HP', '+30% damage to dinos under 25% HP', '+45% damage to dinos under 25% HP'] },
  sprintStrike: { tree: 'fighting', tier: 2, name: 'Sprint Strike', cost: 1, ranks: ['The first hit after a sprint deals double damage'] },
  butchersEye:  { tree: 'fighting', tier: 2, name: "Butcher's Eye", cost: 1, ranks: ['The knife works twice as fast'] },
  bloodlust:    { tree: 'fighting', tier: 3, name: 'Bloodlust',     cost: 3, ranks: ['Each kill heals 15% max HP and gives +20% damage for 8 s'] },
  // --------------------------------------------------------------- endurance
  deepLungs:    { tree: 'endurance', tier: 1, name: 'Deep Lungs',       cost: 1, ranks: ['Max stamina +10%', 'Max stamina +20%', 'Max stamina +30%'] },
  secondWind:   { tree: 'endurance', tier: 1, name: 'Second Wind',      cost: 1, ranks: ['Stamina regen +15%, shorter delay', 'Stamina regen +30%, shorter delay', 'Stamina regen +45%, shorter delay'] },
  efficientStride: { tree: 'endurance', tier: 1, name: 'Efficient Stride', cost: 1, ranks: ['Sprint drain -15%', 'Sprint drain -30%', 'Sprint drain -45%'] },
  lightFeet:    { tree: 'endurance', tier: 2, name: 'Light Feet',       cost: 1, ranks: ['Jumps cost no stamina'] },
  stalker:      { tree: 'endurance', tier: 2, name: 'Stalker',          cost: 1, ranks: ['Dinos notice you 10% later', 'Dinos notice you 20% later', 'Dinos notice you 30% later'] },
  springyLegs:  { tree: 'endurance', tier: 2, name: 'Springy Legs',     cost: 1, ranks: ['Jump height +10%', 'Jump height +20%'] },
  adrenaline:   { tree: 'endurance', tier: 2, name: 'Adrenaline',       cost: 2, ranks: ['Below 30% HP stamina is free for 6 s (60 s cooldown)'] },
  dash:         { tree: 'endurance', tier: 3, name: 'Dash',             cost: 3, ranks: ['Press Q to dash forward (costs stamina, 2 s cooldown)'] },
  // -------------------------------------------------------------- durability
  thickSkin:    { tree: 'durability', tier: 1, name: 'Thick Skin',      cost: 1, ranks: ['Max HP +10', 'Max HP +20', 'Max HP +30'] },
  regeneration: { tree: 'durability', tier: 1, name: 'Regeneration',    cost: 1, ranks: ['Regenerate 0.5 HP/s after 8 s without damage', 'Regenerate 1 HP/s after 8 s without damage', 'Regenerate 1.5 HP/s after 8 s without damage'] },
  heartyAppetite: { tree: 'durability', tier: 1, name: 'Hearty Appetite', cost: 1, ranks: ['Fruit heals +25%', 'Fruit heals +50%', 'Fruit heals +75%'] },
  healingAura:  { tree: 'durability', tier: 2, name: 'Healing Aura',    cost: 1, ranks: ['Teammates within 6 m regenerate +0.5 HP/s', 'Teammates within 6 m regenerate +1 HP/s', 'Teammates within 6 m regenerate +1.5 HP/s'] },
  fieldMedic:   { tree: 'durability', tier: 2, name: 'Field Medic',     cost: 1, ranks: ['Hold E on a teammate to heal them with your own fruit'] },
  unshakable:   { tree: 'durability', tier: 2, name: 'Unshakable',      cost: 1, ranks: ['Knockback and knockdown time halved', 'No knockback or knockdown from any dinosaur'] },
  rescuer:      { tree: 'durability', tier: 2, name: 'Rescuer',         cost: 1, ranks: ['Revive takes 60% of the time', 'Revive takes 30% of the time'] },
  lastStand:    { tree: 'durability', tier: 3, name: 'Last Stand',      cost: 3, ranks: ['Survive one lethal hit per life at 1 HP, then 2 s invulnerable'] },
};
export const SKILL_IDS = Object.keys(SKILLS);

/** Skill ids of a tree, tier-sorted (definition order inside a tier). */
export const treeSkills = (tree) => SKILL_IDS.filter((id) => SKILLS[id].tree === tree).sort((a, b) => SKILLS[a].tier - SKILLS[b].tier);
export const maxRank = (id) => SKILLS[id].ranks.length;

// ------------------------------------------------------------------ profile

export const freshProfile = () => ({ xp: 0, bonus: 0, skills: {} });

/** Points spent on skills (all trees, or one tree). */
export function spentPoints(skills, tree = null) {
  let n = 0;
  for (const id of SKILL_IDS) {
    if (tree && SKILLS[id].tree !== tree) continue;
    n += (skills[id] | 0) * SKILLS[id].cost;
  }
  return n;
}

/** Derived numbers for the UI/server: level, points, progress to the next level. */
export function progress(prof) {
  const level = levelFromXp(prof.xp);
  const capped = level >= LEVEL_CAP;
  const base = xpForLevel(level);
  const total = level + (prof.bonus | 0);
  const spent = spentPoints(prof.skills);
  return {
    level, capped, xp: prof.xp,
    into: capped ? 1 : prof.xp - base,
    need: capped ? 1 : xpToNext(level),
    frac: capped ? 1 : (prof.xp - base) / xpToNext(level),
    total, spent, free: total - spent,
  };
}

/**
 * Creative mode: every skill at max rank and nothing left to spend. Not a valid saved
 * profile (sanitizeProfile would trim it), so it is only ever shown, never saved.
 */
export function creativeProfile() {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, maxRank(id)]));
  const level = levelFromXp(MAX_XP);
  return { xp: MAX_XP, bonus: Math.max(0, spentPoints(skills) - level), skills, creative: true };
}

/** Can the next rank of `id` be bought? -> { ok, reason? } */
export function canBuy(prof, id) {
  const s = SKILLS[id];
  if (!s) return { ok: false, reason: 'Unknown skill' };
  const rank = prof.skills[id] | 0;
  if (rank >= maxRank(id)) return { ok: false, reason: 'Already at max rank' };
  if (progress(prof).free < s.cost) return { ok: false, reason: 'Not enough skill points' };
  const need = TIER_GATE[s.tier];
  if (spentPoints(prof.skills, s.tree) < need) return { ok: false, reason: `Spend ${need} points in ${TREE_NAMES[s.tree]} first` };
  return { ok: true };
}

/** Buy one rank (returns a new skills object or null). */
export function buy(prof, id) {
  if (!canBuy(prof, id).ok) return null;
  return { ...prof.skills, [id]: (prof.skills[id] | 0) + 1 };
}

/**
 * Make an untrusted profile valid: clamp XP/bonus, drop unknown skills, and replay
 * the purchases in tier order so ranks, gates and the point budget all hold.
 * Anything that doesn't fit is dropped (never throws).
 */
export function sanitizeProfile(raw) {
  const num = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  const prof = { xp: num(raw?.xp, MAX_XP), bonus: num(raw?.bonus, MAX_BONUS_POINTS), skills: {} };
  const want = raw?.skills && typeof raw.skills === 'object' ? raw.skills : {};
  const ids = SKILL_IDS.filter((id) => (want[id] | 0) > 0).sort((a, b) => SKILLS[a].tier - SKILLS[b].tier);
  for (const id of ids) {
    const target = Math.min(maxRank(id), want[id] | 0);
    for (let r = 0; r < target; r++) {
      const next = buy(prof, id);
      if (!next) break;
      prof.skills = next;
    }
  }
  return prof;
}

// -------------------------------------------------------------------- mods

const rank = (skills, id) => Math.min(maxRank(id), skills?.[id] | 0);
const at = (skills, id, values) => (rank(skills, id) ? values[rank(skills, id) - 1] : 0);

/** Every number the game needs from the bought ranks. Multipliers default to 1, bonuses to 0. */
export function skillMods(skills = {}) {
  const r = (id) => rank(skills, id);
  return {
    // fighting (server)
    meleeMul: 1 + at(skills, 'bruteForce', [0.1, 0.2, 0.3]),
    gunMul: 1 + at(skills, 'marksman', [0.1, 0.2, 0.3]),
    reloadMul: 1 - at(skills, 'steadyHands', [0.1, 0.2, 0.3]),
    weakSpotMul: 1 + at(skills, 'weakSpot', [0.15, 0.3, 0.45]),   // scales the extra part of a weak-spot zone multiplier
    executionerBonus: at(skills, 'executioner', [0.15, 0.3, 0.45]), // vs dinos below executionerBelow of max HP
    executionerBelow: 0.25,
    sprintStrike: r('sprintStrike') > 0,
    knifeTimeMul: r('butchersEye') ? 0.5 : 1,
    bloodlust: r('bloodlust') > 0,                 // kill: heal bloodlustHeal of max HP, +bloodlustDmg damage for bloodlustTime s
    bloodlustHeal: 0.15, bloodlustDmg: 0.2, bloodlustTime: 8,
    // endurance (client; the server only needs stalker/dash)
    staminaMul: 1 + at(skills, 'deepLungs', [0.1, 0.2, 0.3]),
    staminaRegenMul: 1 + at(skills, 'secondWind', [0.15, 0.3, 0.45]),
    regenDelayMul: r('secondWind') ? [0.85, 0.7, 0.55][r('secondWind') - 1] : 1,
    sprintDrainMul: 1 - at(skills, 'efficientStride', [0.15, 0.3, 0.45]),
    lightFeet: r('lightFeet') > 0,
    jumpMul: 1 + at(skills, 'springyLegs', [0.1, 0.2]),
    adrenaline: r('adrenaline') > 0,               // below adrenalineBelow of max HP: free stamina for adrenalineTime s, cooldown adrenalineCooldown
    adrenalineBelow: 0.3, adrenalineTime: 6, adrenalineCooldown: 60,
    dash: r('dash') > 0,
    stalkerMul: 1 - at(skills, 'stalker', [0.1, 0.2, 0.3]),        // dino sight / alert radius multiplier
    // durability (server, maxHp also client HUD)
    maxHpAdd: at(skills, 'thickSkin', [10, 20, 30]),
    regenHps: at(skills, 'regeneration', [0.5, 1, 1.5]),           // after regenDelay s without damage
    regenDelay: 8,
    fruitHealMul: 1 + at(skills, 'heartyAppetite', [0.25, 0.5, 0.75]),
    auraHps: at(skills, 'healingAura', [0.5, 1, 1.5]), auraRadius: 6,
    fieldMedic: r('fieldMedic') > 0,
    knockMul: r('unshakable') === 0 ? 1 : r('unshakable') === 1 ? 0.5 : 0,   // scales knockback AND knockdown time; 0 = none
    reviveTimeMul: r('rescuer') ? [0.6, 0.3][r('rescuer') - 1] : 1,
    lastStand: r('lastStand') > 0, lastStandInvuln: 2,
  };
}
