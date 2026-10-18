// A modelled Steam API for tests of desktop/steam-session.js: lobby membership, friends and paired
// native P2P connections. The game host, protocol, world and renderer transport stay real in the tests.
export class SteamHub {
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
