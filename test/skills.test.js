import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILLS, SKILL_IDS, TREES, LEVEL_CAP, TIER_GATE, TREE_COST, LEGACY_SKILLS, treeSkills, maxRank, xpForLevel, xpToNext, levelFromXp, MAX_XP,
  freshProfile, progress, canBuy, buy, sanitizeProfile, migrateSkills, skillMods, spentPoints, creativeProfile,
} from '../src/shared/skills.js';
import { zoneMul, weakSpotOf, WEAK_SPOTS } from '../src/shared/weakSpots.js';
import { clockText } from '../src/shared/revive.js';
import { CONFIG } from '../src/shared/config.js';

const treeCost = (tree) => treeSkills(tree).reduce((n, id) => n + SKILLS[id].cost * maxRank(id), 0);

test('the trimmed tree: tiers per tree as decided, every capstone single-rank and reachable', () => {
  const tier = (tree, t) => treeSkills(tree).filter((id) => SKILLS[id].tier === t);
  assert.deepEqual(tier('fighting', 1), ['weaponMastery', 'steadyHands']);
  assert.deepEqual(tier('fighting', 2), ['weakSpot', 'butchersEye']);
  assert.deepEqual(tier('endurance', 1), ['deepLungs', 'secondWind']);
  assert.deepEqual(tier('endurance', 2), ['lightFeet', 'springyLegs']);
  assert.deepEqual(tier('durability', 1), ['thickSkin', 'regeneration']);
  assert.deepEqual(tier('durability', 2), ['healingAura', 'rescuer']);
  assert.deepEqual(TREES.map((t) => tier(t, 3)), [['bloodlust'], ['dash'], ['lastStand']]);
  for (const id of SKILL_IDS) if (SKILLS[id].tier === 3) assert.equal(maxRank(id), 1);
  // the capstone gate can be met in every tree with tiers 1 and 2 alone
  for (const t of TREES) assert.ok(treeCost(t) - 3 >= TIER_GATE[3], t);
  for (const id of Object.keys(LEGACY_SKILLS)) assert.equal(SKILLS[id], undefined, `${id} is gone`);
});

test('one level is one point: the level cap pays for exactly the whole tree', () => {
  assert.equal(TREE_COST, TREES.reduce((n, t) => n + treeCost(t), 0));
  assert.equal(LEVEL_CAP, TREE_COST);
  for (const level of [1, 2, 17, LEVEL_CAP]) assert.equal(progress({ xp: xpForLevel(level), skills: {} }).total, level);
  // nothing else gives points: an old save's bonus is ignored
  assert.equal(progress(sanitizeProfile({ xp: 0, bonus: 12, skills: {} })).total, 1);
  // the creative profile is the whole tree, nothing left over
  const c = progress(creativeProfile());
  assert.equal(c.free, 0);
  assert.equal(c.spent, TREE_COST);
});

test('level curve: level 1 at 0 XP, +20 XP per step, cap at MAX_XP', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(xpForLevel(3), 220);
  assert.equal(xpToNext(LEVEL_CAP - 1), 100 + 20 * (LEVEL_CAP - 2));
  assert.equal(MAX_XP, 18720);
  assert.equal(levelFromXp(MAX_XP - 1), LEVEL_CAP - 1);
  assert.equal(levelFromXp(MAX_XP), LEVEL_CAP);
  assert.equal(levelFromXp(MAX_XP * 10), LEVEL_CAP);
  assert.equal(progress({ xp: MAX_XP, skills: {} }).total, LEVEL_CAP);
});

test('tier gates and the point budget are enforced', () => {
  let prof = { xp: MAX_XP, skills: {} };
  assert.equal(canBuy(prof, 'weakSpot').ok, false);        // tier 2 locked
  for (let i = 0; i < TIER_GATE[2]; i++) prof = { ...prof, skills: buy(prof, i < 3 ? 'weaponMastery' : 'steadyHands') };
  assert.equal(canBuy(prof, 'weakSpot').ok, true);
  assert.equal(canBuy(prof, 'bloodlust').ok, false);       // capstone needs 10
  assert.equal(canBuy(prof, 'dash').ok, false);            // other tree: its own gate
  assert.equal(buy({ xp: 0, skills: {} }, 'weaponMastery') !== null, true); // level 1 = 1 point
  const broke = { xp: 0, skills: { weaponMastery: 1 } };
  assert.equal(canBuy(broke, 'weaponMastery').reason, 'Not enough skill points');
  assert.equal(canBuy(prof, 'executioner').reason, 'Unknown skill');
});

test('endurance reaches its capstone with every tier-1 and tier-2 rank', () => {
  let prof = { xp: MAX_XP, skills: {} };
  const take = (id, n) => { for (let i = 0; i < n; i++) { const s = buy(prof, id); assert.ok(s, id); prof = { ...prof, skills: s }; } };
  take('deepLungs', 3); take('secondWind', 3); take('springyLegs', 3);   // 9
  assert.equal(canBuy(prof, 'dash').ok, false);
  take('lightFeet', 1);                                                   // 10
  take('dash', 1);
  assert.equal(spentPoints(prof.skills, 'endurance'), treeCost('endurance'));
});

test('old saves: merged skills keep their best rank, removed ones are refunded', () => {
  assert.deepEqual(migrateSkills({ bruteForce: 2, marksman: 3, stalker: 3, fieldMedic: 1, deepLungs: 1, nope: 4 }),
    { weaponMastery: 3, deepLungs: 1 });
  // a level-10 explorer from the old tree: 10 points spent, 4 of them on skills that no longer exist
  const old = { xp: xpForLevel(10), bonus: 2, skills: { bruteForce: 3, marksman: 1, executioner: 2, sprintStrike: 1, steadyHands: 1, unshakable: 1, thickSkin: 1 } };
  const prof = sanitizeProfile(old);
  assert.deepEqual(prof.skills, { weaponMastery: 3, steadyHands: 1, thickSkin: 1 });
  assert.equal(prof.bonus, undefined);
  const p = progress(prof);
  assert.equal(p.total, 10);
  assert.equal(p.free, 5, 'the points of the removed and merged ranks are free again');
  // a tier-2 skill whose gate only held thanks to removed skills drops out too (its point is refunded)
  const gated = sanitizeProfile({ xp: xpForLevel(8), skills: { executioner: 3, sprintStrike: 1, weaponMastery: 1, weakSpot: 1 } });
  assert.deepEqual(gated.skills, { weaponMastery: 1 });
  assert.equal(progress(gated).free, 7);
});

test('sanitizeProfile repairs forged saves', () => {
  const forged = sanitizeProfile({ xp: 1e12, bonus: 999, skills: { dash: 1, bloodlust: 1, nope: 5, weaponMastery: 99, constructor: 3 } });
  assert.equal(forged.xp, MAX_XP);
  assert.equal(forged.skills.nope, undefined);
  assert.equal(Object.hasOwn(forged.skills, 'constructor'), false);
  assert.equal(forged.skills.dash, undefined);           // gate not met
  assert.equal(forged.skills.weaponMastery, 3);
  const p = progress(forged);
  assert.ok(p.free >= 0);
  assert.deepEqual(sanitizeProfile(null), freshProfile());
  assert.deepEqual(sanitizeProfile('x'), freshProfile());
  const over = sanitizeProfile({ xp: 0, skills: { weaponMastery: 3, steadyHands: 3 } });  // only 1 point
  assert.equal(spentPoints(over.skills), 1);
});

test('skillMods defaults are neutral and ranks scale', () => {
  const m = skillMods({});
  assert.equal(m.damageMul, 1); assert.equal(m.reloadMul, 1); assert.equal(m.weakSpotMul, 1);
  assert.equal(m.jumpMul, 1); assert.equal(m.jumpReachMul, 1);
  assert.equal(m.dash, false); assert.equal(m.maxHpAdd, 0);
  for (const gone of ['meleeMul', 'gunMul', 'knockMul', 'stalkerMul', 'fruitHealMul', 'fieldMedic', 'adrenaline', 'sprintDrainMul', 'executionerBonus', 'sprintStrike']) {
    assert.equal(gone in m, false, gone);
  }
  const s = skillMods({ weaponMastery: 3, steadyHands: 2, springyLegs: 3, rescuer: 1, thickSkin: 1, secondWind: 3 });
  assert.equal(s.damageMul, 1.3); assert.equal(s.reloadMul, 0.8);
  assert.equal(s.jumpMul, 1.45); assert.equal(s.jumpReachMul, 1.3);
  assert.equal(s.reviveTimeMul, 0.6); assert.equal(s.maxHpAdd, 10); assert.equal(s.regenDelayMul, 0.55);
});

test('weak spots: every species names its own best zone; unknown species and zones fall back to the shared table', () => {
  const best = Object.fromEntries(Object.keys(WEAK_SPOTS).map((type) => [type, weakSpotOf(type).zone]));
  assert.equal(best.raptor, 'neck');
  assert.equal(best.trex, 'leg');
  assert.equal(best.stego, 'flank');
  assert.equal(best.ptera, 'wing');
  assert.equal(best.brachio, 'head');
  assert.ok(new Set(Object.values(best)).size >= 5, 'not one weak spot for all');
  assert.equal(zoneMul('nope', 'head'), CONFIG.hitZones.head);
  assert.equal(zoneMul('raptor', 'plates'), CONFIG.hitZones.plates, 'a zone the species table lacks');
  assert.equal(zoneMul('raptor', 'nothing'), 1);
  assert.equal(weakSpotOf('nope').zone, 'head');
});

test('cooldown texts read as m:ss and never go negative', () => {
  assert.equal(clockText(600), '10:00');
  assert.equal(clockText(125.2), '2:06');
  assert.equal(clockText(-3), '0:00');
  assert.equal(clockText(NaN), '0:00');
});
