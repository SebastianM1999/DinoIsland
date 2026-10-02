import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILLS, SKILL_IDS, TREES, LEVEL_CAP, TIER_GATE, treeSkills, maxRank, xpForLevel, levelFromXp, MAX_XP,
  freshProfile, progress, canBuy, buy, sanitizeProfile, skillMods, spentPoints,
} from '../src/shared/skills.js';

const treeCost = (tree) => treeSkills(tree).reduce((n, id) => n + SKILLS[id].cost * maxRank(id), 0);

test('each tree costs 20 points and capstones are single-rank', () => {
  for (const t of TREES) assert.equal(treeCost(t), 20, t);
  for (const id of SKILL_IDS) if (SKILLS[id].tier === 3) assert.equal(maxRank(id), 1);
});

test('level curve: level 1 at 0 XP, cap at MAX_XP', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(xpForLevel(3), 240);
  assert.equal(levelFromXp(MAX_XP), LEVEL_CAP);
  assert.equal(levelFromXp(MAX_XP * 10), LEVEL_CAP);
  assert.equal(progress({ xp: MAX_XP, bonus: 0, skills: {} }).total, LEVEL_CAP);
});

test('tier gates and the point budget are enforced', () => {
  let prof = { xp: MAX_XP, bonus: 0, skills: {} };        // 30 points
  assert.equal(canBuy(prof, 'weakSpot').ok, false);        // tier 2 locked
  for (let i = 0; i < TIER_GATE[2]; i++) prof = { ...prof, skills: buy(prof, i < 3 ? 'bruteForce' : 'marksman') };
  assert.equal(canBuy(prof, 'weakSpot').ok, true);
  assert.equal(canBuy(prof, 'bloodlust').ok, false);       // capstone needs 10
  assert.equal(canBuy(prof, 'dash').ok, false);            // other tree: its own gate
  assert.equal(buy({ xp: 0, bonus: 0, skills: {} }, 'bruteForce') !== null, true); // level 1 = 1 point
  const broke = { xp: 0, bonus: 0, skills: { bruteForce: 1 } };
  assert.equal(canBuy(broke, 'bruteForce').reason, 'Not enough skill points');
});

test('30 points cannot buy three capstones', () => {
  let prof = { xp: MAX_XP, bonus: 0, skills: {} };
  const take = (id, n) => { for (let i = 0; i < n; i++) { const s = buy(prof, id); assert.ok(s, id); prof = { ...prof, skills: s }; } };
  take('bruteForce', 3); take('marksman', 3); take('steadyHands', 3); take('weakSpot', 3);   // 12 fighting
  take('bloodlust', 1);                                                                      // 15
  take('deepLungs', 3); take('secondWind', 3); take('efficientStride', 3);                  // 24 (endurance 9)
  assert.equal(canBuy(prof, 'dash').ok, false);       // gate 10 not met in endurance (9)
  take('lightFeet', 1);                                // 25, endurance 10
  take('dash', 1);                                     // 28
  assert.equal(progress(prof).free, 2);
  assert.equal(canBuy(prof, 'lastStand').ok, false);   // durability empty
});

test('sanitizeProfile repairs forged saves', () => {
  const forged = sanitizeProfile({ xp: 1e12, bonus: 999, skills: { dash: 1, bloodlust: 1, nope: 5, bruteForce: 99 } });
  assert.equal(forged.xp, MAX_XP);
  assert.equal(forged.bonus, 12);
  assert.equal(forged.skills.nope, undefined);
  assert.equal(forged.skills.dash, undefined);           // gate not met
  assert.equal(forged.skills.bruteForce, 3);
  const p = progress(forged);
  assert.ok(p.free >= 0);
  assert.deepEqual(sanitizeProfile(null), freshProfile());
  assert.deepEqual(sanitizeProfile('x'), freshProfile());
  const over = sanitizeProfile({ xp: 0, bonus: 0, skills: { bruteForce: 3, marksman: 3 } });  // only 1 point
  assert.equal(spentPoints(over.skills), 1);
});

test('skillMods defaults are neutral and ranks scale', () => {
  const m = skillMods({});
  assert.equal(m.meleeMul, 1); assert.equal(m.knockMul, 1); assert.equal(m.stalkerMul, 1);
  assert.equal(m.dash, false); assert.equal(m.maxHpAdd, 0);
  const s = skillMods({ bruteForce: 3, unshakable: 2, stalker: 2, rescuer: 1, thickSkin: 1, secondWind: 3 });
  assert.equal(s.meleeMul, 1.3); assert.equal(s.knockMul, 0); assert.equal(s.stalkerMul, 0.8);
  assert.equal(s.reviveTimeMul, 0.6); assert.equal(s.maxHpAdd, 10); assert.equal(s.regenDelayMul, 0.55);
  assert.equal(skillMods({ unshakable: 1 }).knockMul, 0.5);
});
