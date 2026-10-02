// Steam owns discovery and packet delivery; this PC owns the world simulation.
// No renderer has access to native Steam APIs or arbitrary IPC channels.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { startGameHost } from '../server/gameHost.js';
import { CONFIG } from '../src/shared/config.js';
import { BRAND } from '../src/shared/brand.js';

export const STEAM_PROTOCOL = `${BRAND.slug}-1`;
const MAX_INPUT_BYTES = 8192;
const MAX_WORLD_BYTES = 512 * 1024;
const CONNECTION_TIMEOUT = 30000;
// Messages that may be lost or reordered (JSON.stringify keeps `t` first).
const UNRELIABLE = /^\{"t":"(snap|state)"/;

export function validSteamId(value) {
  return typeof value === 'string' && /^[1-9]\d{15,19}$/.test(value) && BigInt(value) <= 0xffffffffffffffffn;
}

class Peer extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  constructor(send, close) { super(); this.deliver = send; this.disconnect = close; }
  send(data) { if (this.readyState === 1) this.deliver(data); }
  close(_code, reason = 'Disconnected') {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
    this.disconnect(reason);
  }
  terminate() { this.close(0, 'Connection timed out'); }
}

export class SteamSession {
  constructor(steam, { emit = () => {}, createHost = startGameHost, now = Date.now } = {}) {
    this.steam = steam;
    this.emit = emit;
    this.createHost = createHost;
    this.now = now;
    this.peers = new Map();
    this.sessionId = null;
    this.generation = 0;
    this.pendingLobbyId = null;
    this.offState = steam.networkingSockets.onConnectionStateChange(change => this.connectionChanged(change));
    this.offInvite = steam.matchmaking.onGameLobbyJoinRequested(event => this.requestJoin(event.lobbyId));
    steam.networkingUtils.initRelayNetworkAccess();
  }

  requestJoin(lobbyId) {
    if (!validSteamId(lobbyId)) return;
    this.pendingLobbyId = lobbyId;
    this.emit({ type: 'invite', lobbyId });
  }

  status() {
    return {
      available: true, name: this.steam.friends.getPersonaName(),
      lobbyId: this.lobbyId ?? null, hosting: !!this.host,
      pendingLobbyId: this.pendingLobbyId,
    };
  }

  friends() {
    const appId = String(this.steam.getStatus().appId);
    return this.steam.friends.getAllFriends().map(friend => {
      const game = this.steam.friends.getFriendGamePlayed(friend.steamId);
      return { id: friend.steamId, name: friend.personaName, online: friend.personaState !== 0,
        lobbyId: game?.gameId === appId && validSteamId(game.steamIDLobby) ? game.steamIDLobby : null };
    });
  }

  async lobbies() {
    const mm = this.steam.matchmaking;
    mm.addRequestLobbyListStringFilter('game', BRAND.slug, 0);
    mm.addRequestLobbyListStringFilter('protocol', STEAM_PROTOCOL, 0);
    mm.addRequestLobbyListStringFilter('ready', '1', 0);
    mm.addRequestLobbyListFilterSlotsAvailable(1);
    mm.addRequestLobbyListResultCountFilter(30);
    const result = await mm.requestLobbyList();
    if (!result.success) throw new Error('Steam could not load public games. Try refreshing.');
    return result.lobbies.map(lobbyId => ({ lobbyId,
      name: this.steam.friends.getFriendPersonaName(mm.getLobbyOwner(lobbyId)) || 'Explorer',
      players: mm.getLobbyMembers(lobbyId).length,
    }));
  }

  begin() {
    if (this.operation || this.sessionId) throw new Error('Leave your current game before starting another.');
    this.operation = true;
    return ++this.generation;
  }

  checkOperation(generation, lobbyId) {
    if (generation === this.generation) return;
    this.steam.matchmaking.leaveLobby(lobbyId);
    throw new Error('Connection cancelled.');
  }

  publishPresence() {
    this.steam.richPresence.setRichPresence('status', `Exploring ${BRAND.name}`);
    this.steam.richPresence.setRichPresence('steam_player_group', this.lobbyId);
    this.steam.richPresence.setRichPresence('steam_player_group_size', String(this.steam.matchmaking.getLobbyMembers(this.lobbyId).length));
  }

  async hostGame(visibility = 'friends') {
    if (!['friends', 'private', 'public'].includes(visibility)) throw new Error('Invalid lobby visibility.');
    const generation = this.begin();
    try {
      const result = await this.steam.matchmaking.createLobby({ private: 0, friends: 1, public: 2 }[visibility], CONFIG.net.maxPlayers);
      if (!result.success || !validSteamId(result.lobbyId)) throw new Error('Steam could not create the lobby. Check your connection and try again.');
      this.checkOperation(generation, result.lobbyId);
      this.lobbyId = result.lobbyId;
      this.hostId = this.steam.getStatus().steamId;
      const metadata = { game: BRAND.slug, protocol: STEAM_PROTOCOL, host: this.hostId, ready: '1' };
      this.listenSocket = this.steam.networkingSockets.createListenSocketP2P(0);
      if (!this.listenSocket) throw new Error('Steam could not open a host connection.');
      this.host = this.createHost();
      for (const [key, value] of Object.entries(metadata)) {
        if (!this.steam.matchmaking.setLobbyData(this.lobbyId, key, value)) throw new Error('Steam could not publish the lobby.');
      }
      this.sessionId = randomUUID();
      const sessionId = this.sessionId;
      this.localPeer = new Peer(data => {
        queueMicrotask(() => this.emit({ type: 'message', sessionId, message: JSON.parse(data) }));
      }, reason => this.endFromHost(reason));
      this.host.attachConnection(this.localPeer, 'Steam host');
      this.publishPresence();
      return { sessionId, lobbyId: this.lobbyId, hosting: true };
    } catch (error) {
      if (generation === this.generation) this.leave();
      throw error;
    } finally { if (generation === this.generation) this.operation = false; }
  }

  async joinGame(lobbyId) {
    if (!validSteamId(lobbyId)) throw new Error('Invalid Steam lobby ID.');
    const generation = this.begin();
    try {
      const result = await this.steam.matchmaking.joinLobby(lobbyId);
      if (!result.success) throw new Error('Could not join this lobby. It may be full, private, or closed.');
      this.checkOperation(generation, lobbyId);
      this.lobbyId = lobbyId;
      const mm = this.steam.matchmaking;
      if (mm.getLobbyData(lobbyId, 'game') !== BRAND.slug || mm.getLobbyData(lobbyId, 'protocol') !== STEAM_PROTOCOL) {
        throw new Error('This lobby uses a different game version. Update both games and try again.');
      }
      this.hostId = mm.getLobbyData(lobbyId, 'host');
      if (!validSteamId(this.hostId) || mm.getLobbyOwner(lobbyId) !== this.hostId || mm.getLobbyData(lobbyId, 'ready') !== '1') {
        throw new Error('The host has left this game.');
      }
      this.sessionId = randomUUID();
      this.connection = this.steam.networkingSockets.connectP2P(this.hostId, 0);
      if (!this.connection) throw new Error('Steam could not connect to the host.');
      this.connected = false;
      this.startedAt = this.now();
      this.outbox = [];
      this.pendingLobbyId = null;
      this.publishPresence();
      return { sessionId: this.sessionId, lobbyId, hosting: false };
    } catch (error) {
      if (generation === this.generation) this.leave();
      throw error;
    } finally { if (generation === this.generation) this.operation = false; }
  }

  send(sessionId, message) {
    if (!this.sessionId || sessionId !== this.sessionId) return;
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid game message.');
    const data = JSON.stringify(message);
    if (Buffer.byteLength(data) > MAX_INPUT_BYTES) throw new Error('Game message is too large.');
    if (this.localPeer) this.localPeer.emit('message', data);
    else if (this.connected) this.sendPacket(this.connection, data);
    else if (this.outbox.length < 64) this.outbox.push(data);
  }

  sendPacket(connection, data) {
    const sockets = this.steam.networkingSockets;
    // Snapshots and own-movement updates go unreliable: a lost one is replaced
    // 50 ms later, while a reliable resend would stall every packet behind it.
    // Clients drop stale snapshots (InterpBuffer timestamps, Net drops snapshots
    // older than the last welcome); the host drops out-of-order states (seq `s`).
    // Everything else (events, actions, welcome, corrections) stays reliable and ordered.
    if (sockets.sendUnreliable && UNRELIABLE.test(data)) {
      sockets.sendUnreliable(connection, Buffer.from(data));   // a full send queue just drops it
      return;
    }
    const result = sockets.sendReliable(connection, Buffer.from(data));
    if (!result.success) {
      const peer = this.peers.get(connection);
      if (peer) peer.close(0, 'Connection could not send game data');
      else if (connection === this.connection) this.endFromHost('Connection could not send game data');
    }
  }

  connectionChanged({ connection, newState, info }) {
    const sockets = this.steam.networkingSockets;
    if (newState === 1 && info.listenSocket) {
      const member = this.lobbyId && this.steam.matchmaking.getLobbyMembers(this.lobbyId).includes(info.identityRemote);
      const duplicate = [...this.peers.values()].some(peer => peer.steamId === info.identityRemote);
      if (!this.host || info.listenSocket !== this.listenSocket || !member || duplicate || this.peers.size >= CONFIG.net.maxPlayers - 1) {
        sockets.closeConnection(connection, 0, 'Not admitted to this lobby', false);
        return;
      }
      const peer = new Peer(data => this.sendPacket(connection, data), reason => {
        this.peers.delete(connection);
        sockets.closeConnection(connection, 0, reason, true);
      });
      peer.steamId = info.identityRemote;
      peer.startedAt = this.now();
      this.peers.set(connection, peer);
      this.host.attachConnection(peer, info.identityRemote);
      if (sockets.acceptConnection(connection) !== 1) peer.close(0, 'Could not accept connection');
    } else if (connection === this.connection && newState === 3) {
      this.connected = true;
      for (const data of this.outbox.splice(0)) this.sendPacket(connection, data);
    } else if (newState === 4 || newState === 5) {
      const peer = this.peers.get(connection);
      if (peer) peer.close(0, 'Player disconnected');
      else if (connection === this.connection) this.endFromHost('The host disconnected. Your expedition has ended.');
    }
  }

  tick() {
    this.steam.runCallbacks();
    this.steam.networkingSockets.runCallbacks();
    if (!this.sessionId) return;
    const sockets = this.steam.networkingSockets;
    if (this.host) {
      const members = this.steam.matchmaking.getLobbyMembers(this.lobbyId);
      for (const [connection, peer] of this.peers) {
        if (!members.includes(peer.steamId) || this.now() - peer.startedAt > CONNECTION_TIMEOUT && !peer.receivedHello) {
          peer.close(0, 'Player left the lobby or timed out'); continue;
        }
        for (const message of sockets.receiveMessages(connection, 64)) {
          if (!message.data || message.size > MAX_INPUT_BYTES) { peer.close(0, 'Invalid game message'); break; }
          try { if (JSON.parse(message.data.toString()).t === 'hello') peer.receivedHello = true; } catch { /* host discards malformed JSON */ }
          peer.emit('message', message.data);
        }
        // send what this pump queued now instead of waiting out Steam's Nagle timer
        sockets.flushMessages?.(connection);
      }
    } else if (this.connection) {
      if (this.steam.matchmaking.getLobbyOwner(this.lobbyId) !== this.hostId) {
        this.endFromHost('The host left. Your expedition has ended.'); return;
      }
      if (!this.connected && this.now() - this.startedAt > CONNECTION_TIMEOUT) {
        this.endFromHost('Could not reach the host. Try joining again.'); return;
      }
      for (const message of sockets.receiveMessages(this.connection, 64)) {
        if (!message.data || message.size > MAX_WORLD_BYTES) continue;
        let data;
        try { data = JSON.parse(message.data.toString()); } catch { continue; }
        this.emit({ type: 'message', sessionId: this.sessionId, message: data });
      }
      if (this.connected) sockets.flushMessages?.(this.connection);
    }
  }

  invite(friendId) {
    if (!this.lobbyId) throw new Error('Host or join a game before inviting friends.');
    if (!validSteamId(friendId) || !this.friends().some(friend => friend.id === friendId)) throw new Error('Choose a Steam friend.');
    if (!this.steam.matchmaking.inviteUserToLobby(this.lobbyId, friendId)) throw new Error('Steam could not send the invitation.');
    return true;
  }

  endFromHost(reason) {
    const sessionId = this.sessionId;
    this.leave();
    if (sessionId) this.emit({ type: 'closed', sessionId, reason });
  }

  leave() {
    ++this.generation;
    this.operation = false;
    this.sessionId = null;
    if (this.host && this.lobbyId) this.steam.matchmaking.setLobbyData(this.lobbyId, 'ready', '0');
    // Clear these first: closing the local peer must not re-enter teardown.
    const host = this.host;
    this.host = null;
    const localPeer = this.localPeer;
    this.localPeer = null;
    if (localPeer) { localPeer.disconnect = () => {}; localPeer.close(); }
    host?.stop();
    for (const peer of [...this.peers.values()]) peer.close(0, 'The host left. Your expedition has ended.');
    this.peers.clear();
    if (this.connection) this.steam.networkingSockets.closeConnection(this.connection, 0, 'Leaving game', false);
    if (this.listenSocket) this.steam.networkingSockets.closeListenSocket(this.listenSocket);
    if (this.lobbyId) this.steam.matchmaking.leaveLobby(this.lobbyId);
    this.steam.richPresence.clearRichPresence();
    this.lobbyId = this.connection = this.listenSocket = this.hostId = null;
    this.connected = false;
    this.outbox = [];
  }

  dispose() { this.leave(); this.offState(); this.offInvite(); }
}
