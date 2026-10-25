import test from 'node:test';
import assert from 'node:assert/strict';
import { Net } from '../src/client/net/net.js';
import { MSG, EV } from '../src/shared/protocol.js';
import { SKILL_IDS, SKILLS, TIER_GATE, freshProfile, progress, skillMods, MAX_XP, sanitizeProfile } from '../src/shared/skills.js';
import { buildSkillView, skillView, tierLabel, tierGateText, previewBuy, refundOf, xpTableText, nearCamp, campStationPoints } from '../src/client/ui/skillModel.js';
import { SkillPanel } from '../src/client/ui/skillPanel.js';

// Only the event surface needed by the panel: layout is checked in a real browser.
function withPanel(options, check) {
  const previous = globalThis.document;
  const events = {}, description = { innerHTML: '' };
  const element = {
    hidden: true, setAttribute() {},
    addEventListener: (name, listener) => { events[name] = listener; },
    querySelector: selector => selector === '.sk-desc' ? description : null,
  };
  globalThis.document = { activeElement: null, querySelector: () => ({}), createElement: () => element };
  let panel;
  try {
    panel = new SkillPanel({ onClose() {}, ...options });
    check({ panel, events, description });
  } finally { panel?.dispose(); globalThis.document = previous; }
}

const tileTarget = id => ({ closest: selector => selector === '[data-skill]' ? { dataset: { skill: id }, focus() {} } : null });

test('panel: keyboard inspection replaces the description of a stationary pointer', () => {
  withPanel({}, ({ events, description }) => {
    events.pointerover({ target: tileTarget('weaponMastery') });
    assert.match(description.innerHTML, /Weapon Mastery/);
    events.focusin({ target: tileTarget('weakSpot') });
    assert.match(description.innerHTML, /Weak Spot/);
    assert.match(description.innerHTML, /Spend 4 points in Fighting first/);
    events.pointerover({ target: tileTarget('deepLungs') });
    assert.match(description.innerHTML, /Deep Lungs/);
  });
});

test('panel: the home and lobby preview inspect skills without spending points', () => {
  let buys = 0;
  withPanel({ readOnly: true, onBuy: () => buys++ }, ({ panel, events }) => {
    events.click({ target: tileTarget('weaponMastery') });
    assert.equal(buys, 0);
    assert.deepEqual(panel.view, freshProfile());
  });
});

test('panel: previews and play keep one close control, including during reset confirmation', () => {
  let closed = 0;
  for (const readOnly of [false, true]) {
    withPanel({ readOnly, onClose: () => closed++ }, ({ panel, events }) => {
      for (const confirming of [false, true]) {
        panel.confirming = confirming;
        panel.render();
        assert.equal((panel.el.innerHTML.match(/data-act="close"/g) ?? []).length, 1);
        assert.match(panel.el.innerHTML, /aria-label="Close skill tree"/);
      }
      events.click({ target: { closest: selector => selector === 'button' ? { dataset: { act: 'close' } } : null } });
    });
  }
  assert.equal(closed, 2);
});

// ------------------------------------------------------------------ progression belongs to the expedition

const WELCOME = { t: MSG.WELCOME, id: 1, slot: 0, now: 1, k: 0, world: { level: { index: 0, variant: 1 } } };

test('hello: the websocket join carries no profile (the expedition keeps it)', async () => {
  const sent = [];
  const old = globalThis.WebSocket;
  let ws;
  globalThis.WebSocket = class {
    constructor() { this.readyState = 1; ws = this; }
    send(data) { sent.push(JSON.parse(data)); }
    close() {}
  };
  try {
    const promise = Net.connect('ws://x', 'Ann', { hat: 1 });
    ws.onopen();
    ws.onmessage({ data: JSON.stringify(WELCOME) });
    const net = await promise;
    const hello = sent.find((m) => m.t === MSG.HELLO);
    assert.equal(hello.profile, undefined);
    assert.equal(hello.name, 'Ann');
    net.close();
  } finally { globalThis.WebSocket = old; }
});

test('hello: the steam join carries no profile', async () => {
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
  const net = await Net.steam(bridge, { host: true }, 'Bo', null);
  assert.equal(sent.find((m) => m.t === MSG.HELLO).profile, undefined);
  net.close();
});

/** A fake solo worker: answers start with a welcome, `save` with a capture. */
function fakeWorker(posted) {
  return class {
    postMessage(m) {
      posted.push(m);
      if (m.type === 'start') queueMicrotask(() => this.onmessage({ data: WELCOME }));
      if (m.type === 'save') queueMicrotask(() => this.onmessage({ data: { type: 'save-capture', world: { now: 5 }, reason: 'manual' } }));
    }
    terminate() { this.terminated = true; }
  };
}

test('solo: the worker gets the expedition to restore, and its captures reach the page', async () => {
  const posted = [];
  const old = globalThis.Worker;
  globalThis.Worker = fakeWorker(posted);
  try {
    const net = await Net.local('Cy', null, { level: 0 }, { level: 2 });
    assert.deepEqual(posted.find((m) => m.type === 'start').save, { level: 2 });
    assert.equal(posted.find((m) => m.type === 'start').profile, undefined);
    const auto = [];
    net.onSaveCapture = (world, reason) => auto.push(reason);
    net.transport.onMessage = null;
    assert.deepEqual(await net.captureSave(), { now: 5 });
    net.close();
  } finally { globalThis.Worker = old; }
});

test('solo: a save the worker cannot load rejects the start with its reason', async () => {
  const old = globalThis.Worker;
  globalThis.Worker = class {
    postMessage(m) { if (m.type === 'start') queueMicrotask(() => this.onmessage({ data: { t: MSG.REJECT, reason: 'This expedition could not be loaded (x).' } })); }
    terminate() {}
  };
  try {
    await assert.rejects(Net.local('Cy', null, {}, { level: 0 }), /could not be loaded/);
  } finally { globalThis.Worker = old; }
});

// ------------------------------------------------------------------ MSG.PROF

test('prof: the net layer sanitizes and keeps the server profile, and handlers see the clean one', () => {
  let transport;
  const net = new Net({ send() {}, close() {}, set onMessage(f) { transport = f; }, set onClose(f) {} }, 'local');
  let seen = null;
  net.on(MSG.PROF, (m) => { seen = m.prof; });
  // the server's profile: level 3 (240 xp) = 3 points, so 4 requested ranks (an old Marksman among them) are one too many
  transport({ t: MSG.PROF, prof: { xp: 240, skills: { thickSkin: 3, marksman: 1 } } });
  assert.deepEqual(net.prof, seen);
  assert.equal(progress(net.prof).spent, 3);
  assert.equal(skillMods(net.prof.skills).maxHpAdd, 20, 'the mods the game derives from it');
  // a later, bigger profile replaces it
  transport({ t: MSG.PROF, prof: { xp: MAX_XP * 5, bonus: 50, skills: {} } });
  assert.equal(net.prof.xp, MAX_XP);
  assert.equal('bonus' in net.prof, false, 'no bonus points');
  // creative mode's every-skill profile is shown only, never kept
  transport({ t: MSG.PROF, prof: { ...freshProfile(), creative: true } });
  assert.equal(net.prof.xp, MAX_XP);
  net.close();
});

test('saved: host save results reach the save listeners and the expedition', () => {
  let transport;
  const net = new Net({ send() {}, close() {}, set onMessage(f) { transport = f; }, set onClose(f) {} }, 'online');
  net.expedition = { name: 'x', savedAt: 0 };
  const heard = [];
  const off = net.onSave((s) => heard.push(s));
  transport({ ...WELCOME, r: 0 });
  transport({ t: MSG.EV, e: EV.SAVED, ok: true, at: 1234, reason: 'auto', r: 1 });
  assert.equal(net.expedition.savedAt, 1234);
  transport({ t: MSG.EV, e: EV.SAVED, ok: false, at: 1300, reason: 'auto', error: 'disk full', r: 2 });
  assert.equal(net.saveStatus.error, 'disk full');
  assert.equal(net.expedition.savedAt, 1234, 'a failed save never looks saved');
  off();
  net.reportSave({ ok: true, at: 2000 });
  assert.equal(heard.length, 2);
  net.clearHandlers();
  assert.equal(net.saveListeners.size, 0);
  net.close();
});

test('prof: it is delivered in reliable order (held snapshots wait for it)', () => {
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

// ------------------------------------------------------------------ skill panel view-model

const rich = (skills = {}) => ({ xp: MAX_XP, skills });   // 40 points: the whole tree

test('view: tiers are grouped per tree with their gate labels', () => {
  const v = buildSkillView(rich());
  assert.deepEqual(v.trees.map((t) => t.name), ['Fighting', 'Endurance', 'Durability']);
  const f = v.trees[0];
  assert.deepEqual(f.tiers.map((t) => t.label), ['Tier I', 'Tier II', 'Capstone']);
  assert.deepEqual(f.tiers.map((t) => t.gateText), ['', '4 points in Fighting', '10 points']);
  assert.deepEqual(v.trees.map((t) => t.sub), ['Hunt harder', 'Run further', 'Survive together']);
  assert.deepEqual(v.trees.map((t) => t.tiers.map((g) => g.skills.length)), [[2, 2, 1], [2, 2, 1], [2, 2, 1]]);
  assert.equal(tierLabel('endurance', 3), 'Capstone');
  assert.equal(tierGateText('endurance', 3), `${TIER_GATE[3]} points`);
  assert.equal(v.free, 40);
  assert.equal(v.level, 40);
});

test('view: available, locked (with the reason) and maxed states', () => {
  let prof = rich();
  assert.equal(skillView(prof, 'weaponMastery').state, 'available');
  const weak = skillView(prof, 'weakSpot');
  assert.equal(weak.state, 'locked');
  assert.match(weak.reason, /4 points in Fighting/);
  assert.equal(weak.lock, 'gate');
  assert.match(skillView(prof, 'bloodlust').reason, /10 points/);
  for (let i = 0; i < 3; i++) prof = previewBuy(prof, 'weaponMastery');
  const bf = skillView(prof, 'weaponMastery');
  assert.equal(bf.state, 'maxed');
  assert.equal(bf.rank, 3);
  assert.equal(bf.next, null);
  assert.equal(bf.now, SKILLS.weaponMastery.ranks[2]);
  // no free points: an open node is locked for lack of points
  const broke = skillView({ xp: 0, skills: { weaponMastery: 1 } }, 'steadyHands');
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
  const prof = { xp: 0, skills: {} };          // 1 point
  const next = previewBuy(prof, 'weaponMastery');
  assert.deepEqual(next.skills, { weaponMastery: 1 });
  assert.deepEqual(prof.skills, {}, 'input untouched');
  assert.equal(previewBuy(next, 'steadyHands'), null, 'out of points');
  assert.equal(previewBuy(rich(), 'marksman'), null, 'a removed skill');
  assert.equal(previewBuy(rich(), 'weakSpot'), null, 'gate');
  assert.equal(previewBuy(rich(), 'nope'), null);
  // replaying optimistic buys always stays a valid profile, and at the cap it buys the whole tree
  let p = rich();
  for (let pass = 0; pass < 3; pass++) for (const id of SKILL_IDS) for (let i = 0; i < 4; i++) p = previewBuy(p, id) ?? p;
  assert.deepEqual(sanitizeProfile(p), p);
  assert.equal(progress(p).free, 0);
  assert.ok(SKILL_IDS.every((id) => p.skills[id] === SKILLS[id].ranks.length));
});

test('refund and xp table text', () => {
  assert.equal(refundOf({ xp: 0, skills: { weaponMastery: 1 } }), 1);
  assert.equal(refundOf(rich({ bloodlust: 1, weaponMastery: 3, steadyHands: 3, weakSpot: 3 })), 3 + 9);
  const t = xpTableText();
  assert.match(t, /Raptor 20 XP/);
  assert.match(t, /boat part 150 XP\. Every level is one skill point/);
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
