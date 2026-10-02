// Client networking. The game always talks to an authoritative ServerWorld
// through the same message protocol – either over WebSocket (co-op) or to an
// in-page host (solo / offline). Gameplay code never knows the difference.

import { CONFIG } from '../../shared/config.js';
import { MSG } from '../../shared/protocol.js';
import { connectSteam } from './steamTransport.js';

export class Net {
  constructor(transport, mode) {
    this.transport = transport;
    this.mode = mode;               // 'online' | 'local'
    this.handlers = new Map();
    this.welcome = null;
    this.rtt = 0;
    this.serverOffset = null;       // serverTime - localTime
    this.closed = false;
    this.onClose = null;
    transport.onMessage = (msg) => this.#dispatch(msg);
    transport.onClose = (reason) => {
      this.closed = true;
      this.onClose?.(reason);
    };
  }

  /** Connect to a co-op server and join with `name`. Resolves after the welcome. */
  static steam(bridge, options, name, outfit) {
    return connectSteam(bridge,
      () => options.host ? bridge.host(options.visibility) : bridge.join(options.lobbyId),
      { t: MSG.HELLO, name, outfit }, transport => new Net(transport, 'online'));
  }

  static connect(url, name, outfit) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(new Error('Invalid server address'));
        return;
      }
      const transport = {
        onMessage: null,
        onClose: null,
        send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)),
        close: () => ws.close(),
      };
      const net = new Net(transport, 'online');
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; ws.close(); reject(new Error('The server did not answer')); }
      }, 6000);
      ws.onopen = () => transport.send({ t: MSG.HELLO, name, outfit });
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (!settled) {
          if (msg.t === MSG.REJECT) { settled = true; clearTimeout(timer); reject(new Error(msg.reason)); return; }
          if (msg.t === MSG.WELCOME) { settled = true; clearTimeout(timer); net.welcome = msg; resolve(net); }
        }
        transport.onMessage?.(msg);
      };
      ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not reach the server')); }
      };
      ws.onclose = (e) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Connection closed')); }
        transport.onClose?.(e.reason || 'Disconnected from the server');
      };
    });
  }

  /** Start an in-page authoritative world for solo play. */
  static async local(name, outfit) {
    const { ServerWorld } = await import('../../sim/world.js');
    let playerId = null;
    const inbox = [];
    const transport = { onMessage: null, onClose: null, send: null, close: null };
    const world = new ServerWorld({
      // Messages are copied (like a real network) and delivered asynchronously.
      send(to, msg, except) {
        if (playerId === null || (to === '*' ? except === playerId : to !== playerId)) return;
        inbox.push(JSON.stringify(msg));
      },
    });
    const flush = () => {
      while (inbox.length) transport.onMessage?.(JSON.parse(inbox.shift()));
    };
    transport.send = (m) => {
      const copy = JSON.parse(JSON.stringify(m));
      queueMicrotask(() => world.receive(playerId, copy));
    };
    const tickMs = 1000 / CONFIG.net.tickRate;
    const snapEvery = Math.max(1, Math.round(CONFIG.net.tickRate / CONFIG.net.snapshotRate));
    let ticks = 0;
    let last = performance.now();
    let acc = 0;
    // The in-page "server" ticks on a timer, like the real one.
    const interval = setInterval(() => {
      const now = performance.now();
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= tickMs) {
        world.step(tickMs / 1000);
        acc -= tickMs;
        if (++ticks % snapEvery === 0) world.host.send(playerId, world.snapshot());
      }
      flush();
    }, tickMs / 2);
    transport.close = () => clearInterval(interval);
    const net = new Net(transport, 'local');
    net.world = world; // debugging aid (solo only)
    world.join(name, (id) => { playerId = id; }, outfit);
    const idx = inbox.findIndex((m) => m.startsWith('{"t":"welcome"'));
    const welcome = JSON.parse(inbox.splice(idx, 1)[0]);
    net.welcome = welcome;
    return net;
  }

  /** Forget every handler (the game for the next island registers its own). */
  clearHandlers() {
    this.handlers.clear();
    this.onClose = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  send(msg) {
    if (!this.closed) this.transport.send(msg);
  }

  act(a, data = {}) {
    this.send({ t: MSG.ACT, a, ...data });
  }

  close() {
    this.closed = true;
    this.transport.close();
  }

  /** Estimated current server time in seconds. */
  serverNow() {
    return performance.now() / 1000 + (this.serverOffset ?? 0);
  }

  #dispatch(msg) {
    if (msg.t === MSG.SNAP || msg.t === MSG.WELCOME || msg.t === MSG.PONG) {
      const local = performance.now() / 1000;
      const target = msg.now - local;
      // Take the smallest offset seen recently (least delayed packet), drift slowly.
      if (this.serverOffset === null) this.serverOffset = target;
      else if (target > this.serverOffset) this.serverOffset += (target - this.serverOffset) * 0.05;
      else this.serverOffset += (target - this.serverOffset) * 0.3;
    }
    if (msg.t === MSG.PONG) this.rtt = performance.now() / 1000 - msg.c;
    const key = msg.t === MSG.EV ? `ev:${msg.e}` : msg.t;
    const list = this.handlers.get(key);
    if (list) for (const fn of list) fn(msg);
  }
}
