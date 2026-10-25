// The expedition lobby: a hosted expedition waits until its owner starts it (ServerWorld `inLobby`).
// Explorers see each other there (characters, outfits, skill trees), nobody plays, the island's
// clock stands still; Start hands everyone the island, and later arrivals play at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { MSG, EV, ACT, OWNER_KEY } from '../src/shared/protocol.js';
import { xpForLevel } from '../src/shared/skills.js';
import { Net } from '../src/client/net/net.js';
import { lobbyCard, standX } from '../src/client/ui/lobbyScreen.js';

function lobbyWorld() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg, except) => sent.push({ to, msg, except }) }, { level: 0, variant: 1, lobby: true });
  const join = (name, key, outfit) => world.join(name, null, outfit, null, key).id;
  return { world, sent, join, to: (id, t) => sent.filter((s) => (s.to === id || (s.to === '*' && s.except !== id)) && s.msg.t === t) };
}
const outfit = { hat: 'ranger', top: 'vest', pants: 'shorts' };

test('explorers meet in the lobby: each sees everyone, with outfit, host and skills', () => {
  const { world, sent, join, to } = lobbyWorld();
  const host = join('Host', OWNER_KEY);
  world.players.get(host).prof.xp = xpForLevel(5);
  world.players.get(host).prof.skills = { toughness: 1 };
  const ada = join('Ada', 'steam-76561198000000001', outfit);

  const welcome = to(ada, MSG.WELCOME).at(-1).msg;
  assert.ok(welcome.lobby, 'a joiner of a waiting expedition is told it waits');
  assert.deepEqual(welcome.lobby.members.map((m) => [m.name, m.host, m.slot]), [['Host', true, 0], ['Ada', false, 1]]);
  const hostEntry = welcome.lobby.members[0];
  assert.equal(hostEntry.prof.xp, xpForLevel(5));
  assert.deepEqual(hostEntry.prof.skills, { toughness: 1 });
  assert.deepEqual(welcome.lobby.members[1].outfit, world.players.get(ada).outfit);

  // the host already waiting hears about Ada; Ada got the list with her welcome
  const update = to(host, MSG.EV).filter((s) => s.msg.e === EV.LOBBY).at(-1).msg;
  assert.deepEqual(update.members.map((m) => m.name), ['Host', 'Ada']);
  const since = sent.indexOf(to(ada, MSG.WELCOME).at(-1));
  assert.equal(sent.slice(since).filter((s) => s.msg.e === EV.LOBBY && s.except !== ada).length, 0, 'no second copy for Ada');

  world.leave(ada);
  const after = to(host, MSG.EV).filter((s) => s.msg.e === EV.LOBBY).at(-1).msg;
  assert.deepEqual(after.members.map((m) => m.name), ['Host'], 'someone who leaves leaves the lobby too');
});

test('the island waits in the lobby: no clock, no movement, no actions', () => {
  const { world, join, sent } = lobbyWorld();
  const host = join('Host', OWNER_KEY);
  const p = world.players.get(host);
  const { now } = world;
  const dinoAt = [...world.dinos.byId.values()].map((d) => [d.x, d.z]);
  for (let i = 0; i < 40; i++) world.step(0.05);
  assert.equal(world.now, now, 'raids, eruptions and regrowth are timed by the island clock');
  assert.deepEqual([...world.dinos.byId.values()].map((d) => [d.x, d.z]), dinoAt);
  assert.ok(Math.abs(world.idleFor(p) - 2) < 1e-9, 'the silent-client timeout still counts in the lobby');

  const x = p.x;
  world.receive(host, { t: MSG.STATE, s: 1, k: p.epoch, x: x + 3, y: p.y, z: p.z, yaw: 0, pitch: 0, spd: 0, eq: 0, fl: 0 });
  world.receive(host, { t: MSG.ACT, a: ACT.TRAP, x: p.x, z: p.z, yaw: 0 });
  assert.equal(p.x, x);
  assert.equal(world.traps.size, 0);
  world.receive(host, { t: MSG.PING, c: 1 });
  assert.equal(world.idleFor(p), 0, 'a ping keeps a waiting explorer connected');
  assert.ok(!sent.some((s) => s.msg.t === MSG.SNAP));
});

test('only the host starts; everyone then gets the island, and later arrivals play at once', () => {
  const { world, join, to } = lobbyWorld();
  const host = join('Host', OWNER_KEY);
  const ada = join('Ada', 'steam-76561198000000001');
  const before = to(ada, MSG.WELCOME).length;

  world.receive(ada, { t: MSG.START });
  assert.equal(world.inLobby, true, 'a guest cannot start the expedition');

  world.receive(host, { t: MSG.START });
  assert.equal(world.inLobby, false);
  for (const id of [host, ada]) {
    const welcome = to(id, MSG.WELCOME).at(-1).msg;
    assert.equal(welcome.lobby, undefined, 'the island to build');
    assert.equal(welcome.k, world.players.get(id).epoch);
  }
  assert.equal(to(ada, MSG.WELCOME).length, before + 1);
  world.receive(host, { t: MSG.START });
  assert.equal(to(ada, MSG.WELCOME).length, before + 1, 'a second start changes nothing');

  const now = world.now;
  world.step(0.05);
  assert.ok(world.now > now, 'the island lives');
  const ben = join('Ben', 'steam-76561198000000002');
  assert.equal(to(ben, MSG.WELCOME).at(-1).msg.lobby, undefined, 'a late arrival plays at once');
});

test('a world without a lobby (solo, plain servers) plays from the first welcome', () => {
  const { world, join, to } = (() => {
    const sent = [];
    const w = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: 0, variant: 1 });
    return { world: w, join: (n, k) => w.join(n, null, undefined, null, k).id, to: (id, t) => sent.filter((s) => s.to === id && s.msg.t === t) };
  })();
  const id = join('Solo', OWNER_KEY);
  assert.equal(to(id, MSG.WELCOME)[0].msg.lobby, undefined);
  const now = world.now;
  world.step(0.05);
  assert.ok(world.now > now);
});

test('the client keeps the lobby members and re-estimates the clock when the island starts', () => {
  const transport = { sent: [], send(m) { this.sent.push(m); }, close() {} };
  const net = new Net(transport, 'online');
  const heard = [];
  const fn = (m) => heard.push(m.members.length);
  try {
    transport.onMessage({ t: MSG.WELCOME, id: 2, k: 0, now: 10, w: 1, r: 1, world: {}, lobby: { members: [{ id: 1 }, { id: 2 }] } });
    assert.equal(net.inLobby, true);
    assert.deepEqual(net.lobbyMembers.map((m) => m.id), [1, 2]);
    net.on(`ev:${EV.LOBBY}`, fn);
    transport.onMessage({ t: MSG.EV, e: EV.LOBBY, members: [{ id: 1 }, { id: 2 }, { id: 3 }], r: 2, w: 1 });
    assert.equal(net.lobbyMembers.length, 3);
    net.off(`ev:${EV.LOBBY}`, fn);
    transport.onMessage({ t: MSG.EV, e: EV.LOBBY, members: [{ id: 1 }], r: 3, w: 1 });
    assert.deepEqual(heard, [3], 'off stops the handler');
    assert.equal(net.lobbyMembers.length, 1, 'but the newest members are still kept');

    // the island clock stood at 10 while the lobby took a while: the estimate starts again from the new welcome
    const offset = net.serverOffset;
    const start = { t: MSG.WELCOME, id: 2, k: 1, now: 10, w: 1, r: 4, world: {} };
    net.serverOffset = offset - 500;   // (as if the old estimate had drifted)
    transport.onMessage(start);
    assert.equal(net.inLobby, false);
    assert.equal(net.lobbyMembers, null);
    assert.equal(net.lastWelcome, start);
    assert.ok(Math.abs(net.serverOffset - offset) < 1, 'not dragged along from the lobby');
  } finally { net.close(); }
});

test('a lobby card shows the explorer, the host and their level; the stage keeps slots apart', () => {
  const card = lobbyCard({ id: 4, name: 'Ada', slot: 1, host: false, prof: { xp: xpForLevel(7), skills: { nonsense: 9 } } }, 4);
  assert.deepEqual([card.name, card.host, card.level], ['Ada (you)', false, 7]);
  assert.deepEqual(card.prof.skills, {}, 'an unknown skill from the wire is dropped');
  assert.equal(lobbyCard({ id: 1, name: 'Host', host: true, prof: null }, 4).level, 1);
  const xs = [0, 1, 2, 3].map(standX);
  assert.ok(xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > 1.2), 'platforms never overlap');
  assert.ok(Math.abs(xs[0] + xs[3]) < 1e-9, 'the stage is centred');
});
