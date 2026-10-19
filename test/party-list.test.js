// The pause card's party list: who hosts, and the host removing an explorer (MSG.KICK). The world
// decides who may kick (ServerWorld.onKick); the game host closes the connection and keeps that
// explorer out (server/gameHost.js, end to end in save-guests.test.js); the client shows the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, EV, OWNER_KEY } from '../src/shared/protocol.js';
import { Net } from '../src/client/net/net.js';
import { renderPause } from '../src/client/ui/menus.js';

function hostedWorld() {
  const kicks = [];
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }), kick: (id, reason) => kicks.push({ id, reason }) }, { level: 0, variant: 1 });
  const owner = world.join('Host', null, undefined, null, OWNER_KEY).id;
  const guest = world.join('Ada', null, undefined, null, 'steam-76561198000000001').id;
  const other = world.join('Ben', null, undefined, null, 'steam-76561198000000002').id;
  return { world, kicks, sent, owner, guest, other };
}

test('players see who hosts the expedition', () => {
  const { world, owner, guest, sent } = hostedWorld();
  const players = world.fullState().players;
  assert.equal(players.find((p) => p.id === owner).host, true);
  assert.equal(players.find((p) => p.id === guest).host, false);
  const joined = sent.filter((s) => s.msg.e === EV.PLAYER_JOIN).map((s) => s.msg.player);
  assert.deepEqual(joined.map((p) => [p.name, p.host]), [['Host', true], ['Ada', false], ['Ben', false]]);
});

test('only the host can kick, and only someone else who is in the expedition', () => {
  const { world, kicks, owner, guest, other } = hostedWorld();
  world.receive(guest, { t: MSG.KICK, id: other });
  world.receive(guest, { t: MSG.KICK, id: owner });
  world.receive(owner, { t: MSG.KICK, id: owner });
  world.receive(owner, { t: MSG.KICK, id: 999 });
  world.receive(owner, { t: MSG.KICK, id: String(guest) });
  assert.deepEqual(kicks, [], 'a guest cannot remove anybody, the host not themself or a stranger');
  world.receive(owner, { t: MSG.KICK, id: guest });
  assert.deepEqual(kicks, [{ id: guest, reason: 'The host removed you from this expedition.' }]);
});

test('a solo world without a host connection ignores a kick', () => {
  const world = new ServerWorld({ send() {} }, { level: 0, variant: 1 });
  const owner = world.join('Solo', null, undefined, null, OWNER_KEY).id;
  const extra = world.join('Bot', null, undefined, null, null).id;
  assert.doesNotThrow(() => world.receive(owner, { t: MSG.KICK, id: extra }));
  assert.equal(world.players.size, 2);
});

test('a removed player is told why the host ended their session', () => {
  const transport = { sent: [], send(m) { this.sent.push(m); }, close() {} };
  const net = new Net(transport, 'online');
  const closed = [];
  net.onClose = (reason) => closed.push(reason);
  try {
    // (before the welcome a reject is a refused join: Net.connect/steam reject the promise, never the session)
    transport.onMessage({ t: MSG.REJECT, reason: 'too early' });
    transport.onMessage({ t: MSG.WELCOME, id: 2, k: 0, now: 1, w: 1, r: 1 });
    transport.onMessage({ t: MSG.REJECT, reason: 'The host removed you from this expedition.' });
    transport.onClose('The host disconnected. Your expedition has ended.');
    assert.deepEqual(closed, ['The host removed you from this expedition.']);
  } finally { net.close(); }

  const plain = new Net({ send() {}, close() {} }, 'online');
  const reasons = [];
  plain.onClose = (reason) => reasons.push(reason);
  plain.transport.onMessage({ t: MSG.WELCOME, id: 3, k: 0, now: 1, w: 1, r: 1 });
  plain.transport.onClose('Disconnected from the server');
  plain.close();
  assert.deepEqual(reasons, ['Disconnected from the server'], 'an ordinary disconnect keeps its own reason');
});

// ------------------------------------------------------------------ pause card

/** Just the DOM surface renderPause uses. */
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.hidden = false; this.disabled = false; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.style = { setProperty() {} }; this.className = ''; this._text = ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_) { this.children = []; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') { this._text += n; continue; } n.remove(); n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { for (const c of this.children) c.parent = null; this.children = []; this.append(...nodes); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { if (!this.disabled) for (const fn of this.listeners.click ?? []) fn(); }
  querySelector() { return null; }
  get classList() { return { add() {} }; }
}

function pauseCard(t) {
  const ids = {};
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new El(tag), getElementById: (id) => (ids[id] ??= new El('div')) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const list = () => ids['pause-team'].children.map((li) => {
    const [name, , state, action] = li.children;
    const [label, badge] = name.children;
    const kick = action.children[0];
    return { li, name: label.textContent, host: !badge.hidden, state: state.textContent, kick };
  });
  return { ids, list };
}

const member = (id, name, extra = {}) => ({ id, name, slot: id - 1, hp: 80, alive: true, host: false, isYou: false, ...extra });

test('the party list marks the host and offers Kick only to the host, for the others', (t) => {
  const { list } = pauseCard(t);
  const kicked = [];
  const game = { mission: null, team: [member(1, 'Host', { host: true, isYou: true }), member(2, 'Ada', { alive: false })], kickPlayer: (id) => kicked.push(id) };
  renderPause(game);
  let rows = list();
  assert.deepEqual(rows.map((r) => [r.name, r.host, r.state, r.kick.hidden]), [['Host (you)', true, '80', true], ['Ada', false, 'Down', false]]);

  // a guest sees the host marker but no Kick
  game.team = [member(1, 'Host', { host: true }), member(2, 'Ada', { isYou: true })];
  renderPause(game);
  rows = list();
  assert.deepEqual(rows.map((r) => [r.name, r.host, r.kick.hidden]), [['Host', true, true], ['Ada (you)', false, true]]);

  // alone, nobody needs to be told who hosts
  game.team = [member(1, 'Solo', { host: true, isYou: true })];
  renderPause(game);
  assert.equal(list()[0].host, false);
  assert.deepEqual(kicked, []);
});

test('Kick needs a confirming second click and survives the pause card\'s refresh', (t) => {
  const { ids, list } = pauseCard(t);
  const kicked = [];
  const game = { mission: null, team: [member(1, 'Host', { host: true, isYou: true }), member(2, 'Ada'), member(3, 'Ben')], kickPlayer: (id) => kicked.push(id) };
  renderPause(game);
  const ada = list()[1];
  ada.kick.click();
  assert.deepEqual(kicked, [], 'one click only arms it');
  assert.equal(ada.kick.textContent, 'Confirm kick');
  assert.match(ada.kick.attrs['aria-label'], /Confirm: remove Ada/);

  // the card refreshes every second: the same row and button stay, still armed
  renderPause(game);
  assert.equal(list()[1].li, ada.li);
  assert.equal(list()[1].kick.dataset.confirm, '1');
  ada.kick.click();
  assert.deepEqual(kicked, [2]);
  assert.equal(ada.kick.disabled, true, 'no second kick while the first is under way');

  // Ada is gone: her row leaves, the others keep theirs
  const ben = list()[2].li;
  game.team = game.team.filter((p) => p.id !== 2);
  renderPause(game);
  assert.deepEqual(list().map((r) => r.name), ['Host (you)', 'Ben']);
  assert.equal(list()[1].li, ben);
  assert.equal(ids['pause-team-count'].textContent, '2 explorers');
});
