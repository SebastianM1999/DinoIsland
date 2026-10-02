// Client networking. The game always talks to an authoritative ServerWorld
// through the same message protocol – either over WebSocket (co-op) or to an
// in-page host (solo / offline). Gameplay code never knows the difference.

import { CONFIG } from '../../shared/config.js';
import { MSG, EV } from '../../shared/protocol.js';
import { connectSteam } from './steamTransport.js';

export class Net {
  constructor(transport, mode) {
    this.transport = transport;
    this.mode = mode;               // 'online' | 'local'
    this.handlers = new Map();
    this.welcome = null;
    this.rtt = 0;
    this.serverOffset = null;       // serverTime - localTime
    this.jitter = 0;                // smoothed lateness of snapshots vs. the least delayed one (s)
    this.interpDelay = CONFIG.net.interpDelay;   // adapts to the measured jitter
    // Own movement updates carry a sequence number and the correction epoch the
    // server last told us (CORRECT / RESPAWN / WELCOME `k`), so the server can
    // drop reordered and pre-correction updates (see ServerWorld.onState).
    this.stateSeq = 0;
    this.epoch = 0;
    this.myId = null;
    this.minSnapNow = -Infinity;    // snapshots older than the last welcome belong to the previous island
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

  /**
   * Start an authoritative world for solo play. It runs in a Web Worker
   * (src/sim/worker.js), so its ticks never stall a rendered frame.
   * Resolves after the welcome. `level` (0-based) starts on a later island (testing).
   */
  static local(name, outfit, { level = 0, baseStage = 0 } = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../../sim/worker.js', import.meta.url), { type: 'module' });
      const transport = {
        onMessage: null,
        onClose: null,
        // structured clone copies the message, like a real network
        send: (msg) => worker.postMessage({ type: 'msg', msg }),
        close: () => worker.postMessage({ type: 'stop' }),
      };
      const net = new Net(transport, 'local');
      worker.onmessage = (e) => {
        const msg = e.data;
        if (!net.welcome && msg.t === MSG.WELCOME) { net.welcome = msg; resolve(net); }
        transport.onMessage?.(msg);
      };
      worker.onerror = (e) => {
        console.error('[solo] world worker failed:', e.message);
        if (!net.welcome) reject(new Error('The island could not be started'));
        else transport.onClose?.('The island simulation stopped');
      };
      worker.postMessage({ type: 'start', name, outfit, level, baseStage });
    });
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

  /**
   * Render remote entities just far enough in the past that the next snapshot
   * has (almost always) arrived: one snapshot interval plus headroom for the
   * measured jitter. Moves slowly so the remote timeline never visibly jumps.
   */
  #adaptInterp(lateness) {
    const N = CONFIG.net;
    this.jitter += (Math.min(lateness, 0.5) - this.jitter) * 0.1;
    const target = Math.min(N.interpDelayMax, Math.max(N.interpDelayMin, 1 / N.snapshotRate + 2.5 * this.jitter + 0.02));
    this.interpDelay += (target - this.interpDelay) * (target > this.interpDelay ? 0.1 : 0.01);
  }

  /** A movement update for the server (fields of MSG.STATE without t/s/k). */
  sendState(fields) {
    this.send({ t: MSG.STATE, s: ++this.stateSeq, k: this.epoch, ...fields });
  }

  #dispatch(msg) {
    if (msg.t === MSG.WELCOME) {
      this.myId = msg.id;
      this.epoch = msg.k ?? 0;
      this.minSnapNow = msg.now;
    } else if (msg.t === MSG.SNAP) {
      if (msg.now < this.minSnapNow) return;   // overtaken by the welcome (unreliable transport)
    } else if (msg.t === MSG.CORRECT || (msg.t === MSG.EV && msg.e === EV.RESPAWN && msg.id === this.myId)) {
      if (Number.isFinite(msg.k)) this.epoch = msg.k;
    }
    if (msg.t === MSG.SNAP || msg.t === MSG.WELCOME || msg.t === MSG.PONG) {
      const local = performance.now() / 1000;
      const target = msg.now - local;
      // Take the smallest offset seen recently (least delayed packet), drift slowly.
      if (this.serverOffset === null) this.serverOffset = target;
      else if (target > this.serverOffset) this.serverOffset += (target - this.serverOffset) * 0.05;
      else this.serverOffset += (target - this.serverOffset) * 0.3;
      if (msg.t === MSG.SNAP) this.#adaptInterp(Math.max(0, this.serverOffset - target));
    }
    if (msg.t === MSG.PONG) this.rtt = performance.now() / 1000 - msg.c;
    const key = msg.t === MSG.EV ? `ev:${msg.e}` : msg.t;
    const list = this.handlers.get(key);
    if (list) for (const fn of list) fn(msg);
  }
}
