// Steam peers reach the game host in the utility process (desktop/host-process.js): the Steam SDK
// lives in the main process (desktop/steam.cjs), the world and its saves in the host process.
// The bridge carries each connection over the process channel as small messages:
//
//   main -> host  { type: 'conn-open', id, addr, info } | { type: 'conn-msg', id, data } | { type: 'conn-close', id }
//   host -> main  { type: 'conn-send', id, data } | { type: 'conn-close', id, code, reason }
//
// `createRemoteHost` (main) looks like a game host to SteamSession (attachConnection, stop);
// `serveBridgedConnections` (host process) turns the messages into WebSocket-like sockets for
// server/gameHost.js `attachConnection`, so Steam and loopback players share one world.

import { EventEmitter } from 'node:events';

/**
 * Main side. `channel`: { postMessage(message), on('message', fn), off('message', fn) } of the host process.
 * `attachConnection(peer, addr, info)`: `peer` is a SteamSession Peer (send, close, 'message', 'close').
 */
export function createRemoteHost(channel) {
  const peers = new Map();
  let next = 1;
  const onMessage = (message) => {
    const peer = peers.get(message?.id);
    if (!peer) return;
    if (message.type === 'conn-send') peer.send(message.data);
    else if (message.type === 'conn-close') { peers.delete(message.id); peer.close(message.code, message.reason); }
  };
  channel.on('message', onMessage);
  return {
    attachConnection(peer, addr = 'steam', info = {}) {
      const id = next++;
      peers.set(id, peer);
      channel.postMessage({ type: 'conn-open', id, addr, info });
      peer.on('message', (data) => { if (peers.get(id) === peer) channel.postMessage({ type: 'conn-msg', id, data: String(data) }); });
      peer.on('close', () => { if (peers.delete(id)) channel.postMessage({ type: 'conn-close', id }); });
    },
    /** The Steam session ended: its connections leave the world (the expedition itself stays open on the host). */
    stop() {
      for (const id of peers.keys()) channel.postMessage({ type: 'conn-close', id });
      peers.clear();
    },
    dispose() { this.stop(); channel.off('message', onMessage); },
  };
}

/** A bridged connection inside the host process: the surface server/gameHost.js uses of a `ws` socket. */
class BridgedSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  constructor(id, post) { super(); this.id = id; this.post = post; }
  send(data) { if (this.readyState === 1) this.post({ type: 'conn-send', id: this.id, data: String(data) }); }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.post({ type: 'conn-close', id: this.id, code, reason: String(reason) });
    this.emit('close');
  }
  terminate() { this.close(1006, 'Connection timed out'); }
}

/**
 * Host-process side: handle one bridge message. `host` is a server/gameHost.js host; `post` sends
 * to the main process. Returns true when the message belonged to the bridge.
 */
export function createBridgeEndpoint(host, post) {
  const sockets = new Map();
  return function handle(message) {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('conn-')) return false;
    const { id } = message;
    if (message.type === 'conn-open' && Number.isSafeInteger(id) && !sockets.has(id)) {
      const socket = new BridgedSocket(id, post);
      socket.on('close', () => sockets.delete(id));
      sockets.set(id, socket);
      const info = message.info && typeof message.info === 'object' ? message.info : {};
      host.attachConnection(socket, String(message.addr ?? 'steam'), info);
    } else if (message.type === 'conn-msg') {
      const socket = sockets.get(id);
      if (socket && typeof message.data === 'string') socket.emit('message', message.data);
    } else if (message.type === 'conn-close') {
      const socket = sockets.get(id);
      if (socket) { socket.readyState = 3; sockets.delete(id); socket.emit('close'); }
    }
    return true;
  };
}
