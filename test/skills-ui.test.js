import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, saveProfile, PROFILE_KEY } from '../src/client/core/profile.js';
import { Net } from '../src/client/net/net.js';
import { MSG } from '../src/shared/protocol.js';
import { SKILL_IDS, SKILLS, TIER_GATE, freshProfile, progress, skillMods, MAX_XP, sanitizeProfile } from '../src/shared/skills.js';
import { buildSkillView, skillView, tierLabel, tierGateText, previewBuy, refundOf, xpTableText, nearCamp, campStationPoints } from '../src/client/ui/skillModel.js';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};

/** Run `fn` with a fake global localStorage (Net saves through the default storage). */
async function withStorage(storage, fn) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try { return await fn(); } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage;
  }
}

// ------------------------------------------------------------------ persistence

test('profile: empty storage gives a fresh profile, a saved one round-trips', () => {
  const st = fakeStorage();
  assert.deepEqual(loadProfile(st), freshProfile());
  const prof = { xp: 450, bonus: 1, skills: { bruteForce: 2, marksman: 1 } };
  assert.equal(saveProfile(prof, st), true);
  assert.deepEqual(loadProfile(st), prof);
  assert.ok(PROFILE_KEY in st.data);
});

test('profile: a tampered or corrupt save is repaired, never thrown on', () => {
  // over budget (level 1 = 1 point), tier 3 without gate, unknown skill, absurd xp type
  const st = fakeStorage({ [PROFILE_KEY]: JSON.stringify({ xp: 'lots', bonus: 99, skills: { bruteForce: 3, bloodlust: 1, nope: 5 } }) });
  const p = loadProfile(st);
  assert.equal(p.xp, 0);
  assert.ok(p.bonus <= 12);
  assert.equal(p.skills.bloodlust, undefined, 'capstone needs its gate');
  assert.equal(p.skills.nope, undefined);
  assert.ok(progress(p).free >= 0, 'never overspent');
  assert.deepEqual(loadProfile(fakeStorage({ [PROFILE_KEY]: '{not json' })), freshProfile());
  assert.deepEqual(loadProfile(fakeStorage({ [PROFILE_KEY]: 'null' })), freshProfile());
});

test('profile: blocked storage is tolerated', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadProfile(throwing), freshProfile());
  assert.equal(saveProfile(freshProfile(), throwing), false);
  assert.deepEqual(loadProfile(null), freshProfile());
  assert.equal(saveProfile(freshProfile(), null), false);
});

test('profile: saving sanitizes (an over-budget profile cannot be persisted)', () => {
  const st = fakeStorage();
  saveProfile({ xp: 0, bonus: 0, skills: { bruteForce: 3 } }, st);
  assert.deepEqual(JSON.parse(st.data[PROFILE_KEY]).skills, { bruteForce: 1 });
});

// ------------------------------------------------------------------ hello carries the profile

const PROFILE = { xp: 300, bonus: 0, skills: { thickSkin: 1 } };
const WELCOME = { t: MSG.WELCOME, id: 1, slot: 0, now: 1, k: 0, world: { level: { index: 0, variant: 1 } } };

test('hello: the websocket join sends the profile', async () => {
  const sent = [];
  const old = globalThis.WebSocket;
  let ws;
  globalThis.WebSocket = class {
    constructor() { this.readyState = 1; ws = this; }
    send(data) { sent.push(JSON.parse(data)); }
    close() {}
  };
  try {
    const promise = Net.connect('ws://x', 'Ann', { hat: 1 }, PROFILE);
    ws.onopen();
    ws.onmessage({ data: JSON.stringify(WELCOME) });
    const net = await promise;
    const hello = sent.find((m) => m.t === MSG.HELLO);
    assert.deepEqual(hello.profile, PROFILE);
    assert.equal(hello.name, 'Ann');
    net.close();
  } finally { globalThis.WebSocket = old; }
});

test('hello: the steam join sends the profile', async () => {
  const sent = [];
  let listener;
  const bridge = {
    onEvent: (fn) => { listener = fn; return () => {}; },
    host: async () => ({ sessionId: 's1' }),
    send: (id, message) => {
      sent.push(message);
      if (message.t === MSG.HELLO) queueMicrotask(() => listener({ sessionId: id, type: 'message', message: WELCOME }));
    },
    leave: async () => {},
  };
  const net = await Net.steam(bridge, { host: true }, 'Bo', null, PROFILE);
  assert.deepEqual(sent.find((m) => m.t === MSG.HELLO).profile, PROFILE);
  net.close();
});

test('hello: the solo worker is started with the profile', async () => {
  const posted = [];
  const old = globalThis.Worker;
  globalThis.Worker = class {
    postMessage(m) {
      posted.push(m);
      if (m.type === 'start') queueMicrotask(() => this.onmessage({ data: WELCOME }));
    }
  };
  try {
    const net = await Net.local('Cy', null, { level: 0 }, PROFILE);
    assert.deepEqual(posted.find((m) => m.type === 'start').profile, PROFILE);
    net.close();
  } finally { globalThis.Worker = old; }
});

// ------------------------------------------------------------------ MSG.PROF

test('prof: the net layer sanitizes, keeps and saves the server profile, and handlers see the clean one', async () => {
  const st = fakeStorage();
  await withStorage(st, () => {
    let transport;
    const net = new Net({ send() {}, close() {}, set onMessage(f) { transport = f; }, set onClose(f) {} }, 'local');
    let seen = null;
    net.on(MSG.PROF, (m) => { seen = m.prof; });
    // the server's profile: level 3 (240 xp) = 3 points, so 4 requested ranks are one too many
    transport({ t: MSG.PROF, prof: { xp: 240, bonus: 0, skills: { thickSkin: 3, marksman: 1 } } });
    assert.deepEqual(net.prof, seen);
    assert.equal(progress(net.prof).spent, 3);
    assert.equal(skillMods(net.prof.skills).maxHpAdd, 20, 'the mods the game derives from it');
    assert.deepEqual(JSON.parse(st.data[PROFILE_KEY]), net.prof);
    // a later, bigger profile replaces it
    transport({ t: MSG.PROF, prof: { xp: MAX_XP * 5, bonus: 50, skills: {} } });
    assert.equal(net.prof.xp, MAX_XP);
    assert.equal(net.prof.bonus, 12);
    net.close();
  });
});

test('prof: it is delivered in reliable order (held snapshots wait for it)', async () => {
  await withStorage(fakeStorage(), () => {
    let transport;
    const net = new Net({ send() {}, close() {}, set onMessage(f) { transport = f; }, set onClose(f) {} }, 'local');
    transport({ ...WELCOME, r: 0 });
    const order = [];
    net.on(MSG.PROF, () => order.push('prof'));
    net.on(MSG.SNAP, () => order.push('snap'));
    transport({ t: MSG.SNAP, now: 2, r: 1, p: [], d: [] });       // overtakes the profile: held back
    transport({ t: MSG.PROF, r: 1, prof: freshProfile() });
    assert.deepEqual(order, ['prof', 'snap']);
    net.close();
  });
});

// ------------------------------------------------------------------ skill panel view-model

const rich = (skills = {}) => ({ xp: MAX_XP, bonus: 0, skills });   // 30 points

test('view: tiers are grouped per tree with their gate labels', () => {
  const v = buildSkillView(rich());
  assert.deepEqual(v.trees.map((t) => t.name), ['Fighting', 'Endurance', 'Durability']);
  const f = v.trees[0];
  assert.deepEqual(f.tiers.map((t) => t.label), ['Tier I', 'Tier II', 'Capstone']);
  assert.deepEqual(f.tiers.map((t) => t.gateText), ['', '4 points in Fighting', '10 points']);
  assert.deepEqual(v.trees.map((t) => t.sub), ['Hunt harder', 'Run further', 'Survive together']);
  assert.deepEqual(f.tiers.map((t) => t.skills.length), [3, 4, 1]);
  assert.equal(tierLabel('endurance', 3), 'Capstone');
  assert.equal(tierGateText('endurance', 3), `${TIER_GATE[3]} points`);
  assert.equal(v.free, 30);
  assert.equal(v.level, 30);
});

test('view: available, locked (with the reason) and maxed states', () => {
  let prof = rich();
  assert.equal(skillView(prof, 'bruteForce').state, 'available');
  const weak = skillView(prof, 'weakSpot');
  assert.equal(weak.state, 'locked');
  assert.match(weak.reason, /4 points in Fighting/);
  assert.equal(weak.lock, 'gate');
  assert.match(skillView(prof, 'bloodlust').reason, /10 points/);
  for (let i = 0; i < 3; i++) prof = previewBuy(prof, 'bruteForce');
  const bf = skillView(prof, 'bruteForce');
  assert.equal(bf.state, 'maxed');
  assert.equal(bf.rank, 3);
  assert.equal(bf.next, null);
  assert.equal(bf.now, SKILLS.bruteForce.ranks[2]);
  // no free points: an open node is locked for lack of points
  const broke = skillView({ xp: 0, bonus: 0, skills: { bruteForce: 1 } }, 'marksman');
  assert.equal(broke.state, 'locked');
  assert.match(broke.reason, /Not enough skill points/);
  assert.equal(broke.lock, 'points', 'tier open, only points missing');
});

test('view: current and next rank text come from SKILLS', () => {
  const v = skillView(rich({ thickSkin: 1 }), 'thickSkin');
  assert.equal(v.now, SKILLS.thickSkin.ranks[0]);
  assert.equal(v.next, SKILLS.thickSkin.ranks[1]);
  assert.equal(v.state, 'available');
  const first = skillView(rich(), 'thickSkin');
  assert.equal(first.now, null);
  assert.equal(first.next, SKILLS.thickSkin.ranks[0]);
  assert.equal(skillView(rich(), 'dash').capstone, true);
});

test('view: every skill of the contract appears exactly once', () => {
  const ids = buildSkillView(freshProfile()).trees.flatMap((t) => t.tiers.flatMap((g) => g.skills.map((s) => s.id)));
  assert.deepEqual([...ids].sort(), [...SKILL_IDS].sort());
});

test('previewBuy matches the server rules and never mutates', () => {
  const prof = { xp: 0, bonus: 0, skills: {} };          // 1 point
  const next = previewBuy(prof, 'bruteForce');
  assert.deepEqual(next.skills, { bruteForce: 1 });
  assert.deepEqual(prof.skills, {}, 'input untouched');
  assert.equal(previewBuy(next, 'marksman'), null, 'out of points');
  assert.equal(previewBuy(rich(), 'weakSpot'), null, 'gate');
  assert.equal(previewBuy(rich(), 'nope'), null);
  // replaying optimistic buys always stays a valid profile
  let p = rich();
  for (const id of SKILL_IDS) for (let i = 0; i < 4; i++) p = previewBuy(p, id) ?? p;
  assert.deepEqual(sanitizeProfile(p), p);
});

test('refund and xp table text', () => {
  assert.equal(refundOf({ xp: 0, bonus: 0, skills: { bruteForce: 1 } }), 1);
  assert.equal(refundOf(rich({ bloodlust: 1, bruteForce: 3, marksman: 3, steadyHands: 3 })), 3 + 9);
  const t = xpTableText();
  assert.match(t, /Raptor 20 XP/);
  assert.match(t, /boat part 150 XP \+ 1 point/);
});

test('camp check: any camp station within the radius counts, missing stations are ignored', () => {
  const st = { home: { x: 0, z: 0 }, fire: null, workbench: { x: 30, z: 0 }, wardrobe: null, board: null, dropOff: [{ x: 0, z: 40 }], refill: [] };
  assert.equal(campStationPoints(st).length, 3);
  assert.equal(nearCamp(st, { x: 5, z: 5 }, 18), true);
  assert.equal(nearCamp(st, { x: 29, z: 2 }, 5), true);
  assert.equal(nearCamp(st, { x: 100, z: 100 }, 18), false);
  assert.equal(nearCamp({}, { x: 0, z: 0 }, 18), false);
});

test('icons: every skill and tree has its own icon', async () => {
  const { SKILL_ICONS, TREE_ICONS } = await import('../src/client/ui/skillIcons.js');
  assert.deepEqual(Object.keys(SKILL_ICONS).sort(), [...SKILL_IDS].sort());
  assert.equal(new Set(Object.values(SKILL_ICONS)).size, SKILL_IDS.length, 'no two skills share an icon');
  assert.equal(Object.keys(TREE_ICONS).length, 3);
});
