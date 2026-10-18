import test from 'node:test';
import assert from 'node:assert/strict';
import { SteamSession, STEAM_PROTOCOL } from '../desktop/steam-session.js';
import { connectSteam } from '../src/client/net/steamTransport.js';
import { Net } from '../src/client/net/net.js';
import { SteamHub } from './helpers/fakeSteam.js';
import { PROTOCOL_VERSION } from '../src/shared/protocol.js';

function setup(t, count = 2, options = {}) {
  const hub = new SteamHub();
  const events = Array.from({ length: count }, () => []);
  const sessions = events.map((ev, i) => new SteamSession(hub.createUser(i), { ...options, emit: event => ev.push(event) }));
  t.after(() => sessions.forEach(session => session.dispose()));
  return { hub, sessions, events, async pump() { sessions.forEach(session => session.tick()); await new Promise(resolve => setImmediate(resolve)); } };
}

test('Steam co-op routes two real players through the authoritative world and handles host loss', async t => {
  const { sessions: [host, guest], events: [he, ge], pump } = setup(t);
  const h = await host.hostGame();
  host.send(h.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Host' });
  const g = await guest.joinGame(h.lobbyId);
  guest.send(g.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Guest' });
  await pump(); await pump(); await pump();
  const hw = he.find(e => e.message?.t === 'welcome').message;
  const gw = ge.find(e => e.message?.t === 'welcome').message;
  assert.notEqual(hw.id, gw.id);
  assert.equal(gw.world.players.length, 2);
  assert.equal(host.host.world.players.size, 2);
  assert.equal(host.steam.matchmaking.getLobbyData(h.lobbyId, 'protocol'), STEAM_PROTOCOL);
  guest.send(g.sessionId, { t: 'ping', c: 123 });
  await pump(); await pump();
  assert(ge.some(e => e.message?.t === 'pong' && e.message.c === 123));
  host.leave();
  await pump();
  assert(ge.some(e => e.type === 'closed' && /host/i.test(e.reason)));
  assert.equal(guest.sessionId, null);
  assert.equal(host.steam.listener, 0);
  assert.equal(host.steam.presence.size, 0);
});

test('Steam lobbies cap players at four and reject connections from nonmembers', async t => {
  const { sessions, pump } = setup(t, 5);
  const h = await sessions[0].hostGame('private');
  sessions[0].send(h.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Host' });
  for (const guest of sessions.slice(1, 4)) {
    const g = await guest.joinGame(h.lobbyId);
    guest.send(g.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Guest' });
    await pump(); await pump();
  }
  assert.equal(sessions[0].host.world.players.size, 4);
  await assert.rejects(sessions[4].joinGame(h.lobbyId), /full/);
  const intruderConnection = sessions[4].steam.networkingSockets.connectP2P(sessions[0].hostId);
  await pump();
  assert(intruderConnection);
  assert(sessions[0].steam.closed.some(c => /Not admitted/.test(c.text)));
  assert.equal(sessions[0].host.world.players.size, 4);
});

test('reject incompatible or abandoned lobbies, clean up failed joins, and ignore stale renderer messages', async t => {
  const { sessions: [host, guest], hub } = setup(t);
  const first = await host.hostGame();
  hub.lobbies.get(first.lobbyId).data.protocol = 'old';
  await assert.rejects(guest.joinGame(first.lobbyId), /different game version/);
  assert(!hub.lobbies.get(first.lobbyId).members.has(guest.steam.getStatus().steamId));
  host.leave();
  const second = await host.hostGame();
  host.send(first.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Stale' });
  assert.equal(host.host.world.players.size, 0);
  host.send(second.sessionId, { t: 'hello', v: PROTOCOL_VERSION, name: 'Current' });
  assert.equal(host.host.world.players.size, 1);
  hub.lobbies.get(second.lobbyId).owner = guest.steam.getStatus().steamId;
  await assert.rejects(guest.joinGame(second.lobbyId), /host has left/);
});

test('friends, invitations, public discovery and accepted invite callbacks use Steam lobby IDs', async t => {
  const { sessions: [host, guest], events } = setup(t);
  const h = await host.hostGame('public');
  const friend = guest.friends()[0];
  assert.equal(friend.lobbyId, h.lobbyId);
  assert.equal((await guest.lobbies())[0].lobbyId, h.lobbyId);
  host.invite(guest.steam.getStatus().steamId);
  assert.equal(host.steam.inviteLog[0].lobbyId, h.lobbyId);
  for (const callback of guest.steam.invites) callback({ lobbyId: h.lobbyId });
  assert.equal(guest.status().pendingLobbyId, h.lobbyId);
  assert(events[1].some(e => e.type === 'invite'));
  assert.throws(() => host.invite('invalid'), /Choose/);
});

test('renderer Steam transport handles fast welcome, rejection, disconnect, timeout and teardown', async () => {
  let handler;
  const left = [];
  let reply = 'welcome';
  const bridge = {
    onEvent: fn => { handler = fn; return () => { handler = null; }; },
    leave: async id => { left.push(id); },
    send: (sessionId, _msg) => handler?.({ type: 'message', sessionId, message: { t: reply, reason: 'Lobby full', id: 1 } }),
  };
  const connect = timeout => connectSteam(bridge, async () => ({ sessionId: 'session', lobbyId: 'lobby' }), { t: 'hello' }, transport => new Net(transport, 'online'), timeout);
  const net = await connect(100);
  assert.equal(net.welcome.id, 1);
  let reason;
  net.onClose = value => reason = value;
  handler({ type: 'closed', sessionId: 'session', reason: 'Host left' });
  assert.equal(reason, 'Host left');
  assert.equal(net.closed, true);
  reply = 'reject';
  await assert.rejects(connect(100), /Lobby full/);
  assert.equal(handler, null);
  bridge.send = () => {};
  await assert.rejects(connect(5), /did not answer/);
  assert.equal(left.length, 2);
  assert.equal(handler, null);
});
