import test from 'node:test';
import assert from 'node:assert/strict';
import { SteamSession, STEAM_PROTOCOL } from '../desktop/steam-session.js';
import { connectSteam } from '../src/client/net/steamTransport.js';
import { Net } from '../src/client/net/net.js';

// Model Steam's lobby membership and paired native connections. The game host,
// message protocol, world simulation and renderer transport below are real.
class SteamHub {
  next = 1;
  lobbyCounter = 0;
  users = new Map();
  lobbies = new Map();
  connections = new Map();
  createUser(index) {
    const id = String(76561198000000000n + BigInt(index));
    const states = [], handlers = new Set(), invites = new Set();
    const user = { id, listener: 0, pending: new Map(), closed: [], inviteLog: [], presence: new Map(),
      getStatus: () => ({ appId: 480, steamId: id }), runCallbacks() {},
      friends: {
        getPersonaName: () => `Explorer ${index}`,
        getFriendPersonaName: other => `Explorer ${other}`,
        getAllFriends: () => [...this.users.values()].filter(u => u.id !== id).map(u => ({ steamId: u.id, personaName: `Friend ${u.id}`, personaState: 1 })),
        getFriendGamePlayed: other => {
          const lobby = [...this.lobbies.values()].find(l => l.members.has(other));
          return lobby ? { gameId: '480', steamIDLobby: lobby.id } : null;
        },
      },
      richPresence: { setRichPresence: (key, value) => user.presence.set(key, value), clearRichPresence: () => user.presence.clear() },
      networkingUtils: { initRelayNetworkAccess() {} },
      matchmaking: {
        createLobby: async (visibility, max) => {
          const lobbyId = String(109775240000000000n + BigInt(++this.lobbyCounter));
          this.lobbies.set(lobbyId, { id: lobbyId, owner: id, members: new Set([id]), data: {}, visibility, max });
          return { success: true, lobbyId };
        },
        joinLobby: async lobbyId => {
          const lobby = this.lobbies.get(lobbyId);
          if (!lobby || lobby.members.size >= lobby.max) return { success: false };
          lobby.members.add(id); return { success: true, lobbyId };
        },
        leaveLobby: lobbyId => {
          const lobby = this.lobbies.get(lobbyId);
          if (!lobby) return;
          lobby.members.delete(id);
          if (lobby.owner === id) lobby.owner = [...lobby.members][0] ?? null;
        },
        setLobbyData: (lobbyId, key, value) => { this.lobbies.get(lobbyId).data[key] = value; return true; },
        getLobbyData: (lobbyId, key) => this.lobbies.get(lobbyId)?.data[key] ?? '',
        getLobbyOwner: lobbyId => this.lobbies.get(lobbyId)?.owner,
        getLobbyMembers: lobbyId => [...(this.lobbies.get(lobbyId)?.members ?? [])],
        onGameLobbyJoinRequested: fn => { invites.add(fn); return () => invites.delete(fn); },
        inviteUserToLobby: (lobbyId, friendId) => { user.inviteLog.push({ lobbyId, friendId }); return true; },
        addRequestLobbyListStringFilter() {}, addRequestLobbyListFilterSlotsAvailable() {}, addRequestLobbyListResultCountFilter() {},
        requestLobbyList: async () => ({ success: true, lobbies: [...this.lobbies.keys()] }),
      },
      networkingSockets: {
        onConnectionStateChange: fn => { handlers.add(fn); return () => handlers.delete(fn); },
        runCallbacks: () => { for (const state of states.splice(0)) for (const handler of handlers) handler(state); },
        createListenSocketP2P: () => user.listener = this.next++,
        closeListenSocket: () => { user.listener = 0; },
        connectP2P: hostId => {
          const host = this.users.get(hostId);
          if (!host?.listener) return 0;
          const client = this.next++, server = this.next++;
          this.connections.set(client, { user, other: server });
          this.connections.set(server, { user: host, other: client });
          user.pending.set(client, []); host.pending.set(server, []);
          host.states.push({ connection: server, newState: 1, info: { listenSocket: host.listener, identityRemote: id } });
          return client;
        },
        acceptConnection: connection => {
          const pair = this.connections.get(connection);
          const other = this.connections.get(pair.other);
          other.user.states.push({ connection: pair.other, newState: 3, info: {} });
          return 1;
        },
        sendReliable: (connection, data) => {
          const pair = this.connections.get(connection), other = pair && this.connections.get(pair.other);
          if (!other) return { success: false };
          other.user.pending.get(pair.other).push({ data, size: data.length });
          return { success: true };
        },
        receiveMessages: (connection, max) => user.pending.get(connection)?.splice(0, max) ?? [],
        closeConnection: (connection, _reason, text) => {
          user.closed.push({ connection, text });
          const pair = this.connections.get(connection), other = pair && this.connections.get(pair.other);
          this.connections.delete(connection);
          if (other) other.user.states.push({ connection: pair.other, newState: 4, info: {} });
          return true;
        },
      },
      states, invites,
    };
    this.users.set(id, user);
    return user;
  }
}

function setup(t, count = 2) {
  const hub = new SteamHub();
  const events = Array.from({ length: count }, () => []);
  const sessions = events.map((ev, i) => new SteamSession(hub.createUser(i), { emit: event => ev.push(event) }));
  t.after(() => sessions.forEach(session => session.dispose()));
  return { hub, sessions, events, async pump() { sessions.forEach(session => session.tick()); await new Promise(resolve => setImmediate(resolve)); } };
}

test('Steam co-op routes two real players through the authoritative world and handles host loss', async t => {
  const { sessions: [host, guest], events: [he, ge], pump } = setup(t);
  const h = await host.hostGame();
  host.send(h.sessionId, { t: 'hello', name: 'Host' });
  const g = await guest.joinGame(h.lobbyId);
  guest.send(g.sessionId, { t: 'hello', name: 'Guest' });
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
  sessions[0].send(h.sessionId, { t: 'hello', name: 'Host' });
  for (const guest of sessions.slice(1, 4)) {
    const g = await guest.joinGame(h.lobbyId);
    guest.send(g.sessionId, { t: 'hello', name: 'Guest' });
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
  host.send(first.sessionId, { t: 'hello', name: 'Stale' });
  assert.equal(host.host.world.players.size, 0);
  host.send(second.sessionId, { t: 'hello', name: 'Current' });
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
