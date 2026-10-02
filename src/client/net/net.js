// Client networking. The game always talks to an authoritative ServerWorld
// through the same message protocol – either over WebSocket (co-op) or to an
// in-page host (solo / offline). Gameplay code never knows the difference.

import { CONFIG } from '../../shared/config.js';
import { MSG, EV } from '../../shared/protocol.js';
import { connectSteam } from './steamTransport.js';
import { sanitizeProfile } from '../../shared/skills.js';
import { saveProfile } from '../core/profile.js';

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
    this.stateProvider = null;
    this.onStateSent = null;
    this.lastSnapNow = -Infinity;
    this.lastSnapSeq = null;
    this.reliableSeq = 0;
    this.worldEpoch = null;
    this.prof = null;               // newest private progression from the server (sanitized); the Game reads it when it is built
    this.pendingSnapshot = null;
    this.lastRenderTime = -Infinity;
    this.offsetSamples = [];
    this.pongSamples = [];
    this.rttSamples = [];
    this.telemetry = { snapshots: 0, staleSnapshots: 0, missingSnapshots: 0, bufferUnderruns: 0, snapshotAge: 0, rttP50: 0, rttP95: 0 };
    transport.onMessage = (msg) => this.#dispatch(msg);
    transport.onClose = (reason) => {
      this.closed = true;
      clearInterval(this.heartbeat);
      this.onClose?.(reason);
    };
  }

  /** Connect to a co-op server and join with `name`. Resolves after the welcome. */
  static steam(bridge, options, name, outfit, profile) {
    return connectSteam(bridge,
      () => options.host ? bridge.host(options.visibility) : bridge.join(options.lobbyId),
      { t: MSG.HELLO, name, outfit, profile }, transport => new Net(transport, 'online'));
  }

  static connect(url, name, outfit, profile) {
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
      ws.onopen = () => transport.send({ t: MSG.HELLO, name, outfit, profile });
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
   * Resolves after the welcome. Testing aids in `opts`: level (0-based start island),
   * baseStage (base already standing), raidIn (seconds until the first raid).
   */
  static local(name, outfit, opts = {}, profile) {
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
      worker.postMessage({ type: 'start', name, outfit, opts, profile });
    });
  }

  /** Forget every handler (the game for the next island registers its own). */
  clearHandlers() {
    this.handlers.clear();
    this.onClose = null;
    this.stateProvider = null;
    this.onStateSent = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  send(msg) {
    if (!this.closed) this.transport.send(msg);
  }

  act(a, data = {}) {
    // An action must not depend on an earlier unreliable movement packet.
    // The bundled state goes through exactly the same server validation.
    const state = this.stateProvider ? this.#state(this.stateProvider()) : undefined;
    this.send({ t: MSG.ACT, a, ...data, ...(state ? { state } : {}) });
    if (state) this.onStateSent?.(state.s);
  }

  close() {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.transport.close();
  }

  /** Estimated current server time in seconds. */
  serverNow() {
    return performance.now() / 1000 + (this.serverOffset ?? 0);
  }

  /** Remote playback never runs backwards when delay or clock estimates change. */
  renderNow() {
    const target = this.serverNow() - this.interpDelay;
    this.lastRenderTime = Math.max(this.lastRenderTime, target);
    this.telemetry.snapshotAge = Number.isFinite(this.lastSnapNow) ? Math.max(0, this.serverNow() - this.lastSnapNow) : 0;
    if (Number.isFinite(this.lastSnapNow) && this.lastRenderTime > this.lastSnapNow) this.telemetry.bufferUnderruns++;
    return this.lastRenderTime;
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
    const state = this.#state(fields);
    this.send({ t: MSG.STATE, ...state });
    this.onStateSent?.(state.s);
    return state.s;
  }

  #state(fields) { return { ...fields, s: ++this.stateSeq, k: this.epoch }; }

  #clock(msg, local) {
    if (msg.t === MSG.PONG && Number.isFinite(msg.c) && msg.c <= local) {
      this.rtt = local - msg.c;
      this.rttSamples.push(this.rtt);
      if (this.rttSamples.length > 60) this.rttSamples.shift();
      const sorted = [...this.rttSamples].sort((a, b) => a - b);
      this.telemetry.rttP50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
      this.telemetry.rttP95 = sorted[Math.ceil((sorted.length - 1) * 0.95)];
      this.pongSamples.push({ at: local, rtt: this.rtt, offset: msg.now - (msg.c + local) / 2 });
    }
    this.offsetSamples.push({ at: local, offset: msg.now - local });
    while (this.offsetSamples.length && local - this.offsetSamples[0].at > 5) this.offsetSamples.shift();
    while (this.pongSamples.length && local - this.pongSamples[0].at > 10) this.pongSamples.shift();
    // Highest arrival offset is the least delayed snapshot; a minimum-RTT
    // ping refines it with both ends of the measured round trip.
    const bestPong = this.pongSamples.reduce((a, b) => !a || b.rtt < a.rtt ? b : a, null);
    const target = bestPong ? bestPong.offset : Math.max(...this.offsetSamples.map(s => s.offset));
    if (this.serverOffset === null) this.serverOffset = target;
    else this.serverOffset += (target - this.serverOffset) * 0.05;
  }

  #acceptSnapshot(msg, local) {
    if (!Number.isFinite(msg.now) || msg.now < this.minSnapNow || msg.now <= this.lastSnapNow ||
        (Number.isFinite(msg.r) && msg.r < this.reliableSeq) ||
        (this.worldEpoch !== null && Number.isFinite(msg.w) && msg.w !== this.worldEpoch)) {
      this.telemetry.staleSnapshots++;
      return false;
    }
    if (Number.isFinite(msg.r) && msg.r > this.reliableSeq) {
      // A snapshot can overtake reliable death/respawn/add/remove events.
      // Keep only the newest and release after its reliable prerequisites.
      if (!this.pendingSnapshot || msg.now > this.pendingSnapshot.now) this.pendingSnapshot = msg;
      return false;
    }
    if (Number.isFinite(msg.n) && this.lastSnapSeq !== null) this.telemetry.missingSnapshots += Math.max(0, msg.n - this.lastSnapSeq - 1);
    if (Number.isFinite(msg.n)) this.lastSnapSeq = msg.n;
    if (this.lastSnapshotArrival !== undefined) {
      const arrivalGap = local - this.lastSnapshotArrival;
      const serverGap = msg.now - this.lastSnapNow;
      this.#adaptInterp(Math.max(Math.abs(arrivalGap - serverGap), serverGap - 1 / CONFIG.net.snapshotRate));
    }
    this.lastSnapshotArrival = local;
    this.lastSnapNow = msg.now;
    this.telemetry.snapshots++;
    return true;
  }

  #dispatch(msg) {
    if (this.closed || !msg || typeof msg !== 'object') return;
    const local = performance.now() / 1000;
    if (msg.t === MSG.WELCOME) {
      this.myId = msg.id;
      this.epoch = msg.k ?? 0;
      this.minSnapNow = msg.now;
      this.worldEpoch = Number.isFinite(msg.w) ? msg.w : null;
      this.lastSnapNow = -Infinity;
      this.lastSnapSeq = null;
      this.lastSnapshotArrival = undefined;
      this.lastRenderTime = -Infinity;
      this.pendingSnapshot = null;
      if (!this.heartbeat) {
        // Arm before the first ping: a synchronous transport may answer re-entrantly.
        this.heartbeat = setInterval(() => this.send({ t: MSG.PING, c: performance.now() / 1000 }), 2000);
        this.heartbeat.unref?.();
        this.send({ t: MSG.PING, c: local });
      }
    } else if (msg.t === MSG.SNAP) {
      if (!this.#acceptSnapshot(msg, local)) return;
    } else if (msg.t === MSG.CORRECT || (msg.t === MSG.EV && (msg.e === EV.RESPAWN || msg.e === EV.REVIVED) && msg.id === this.myId)) {
      if (Number.isFinite(msg.k)) this.epoch = msg.k;
    }
    // The profile can arrive while the island is still loading (no Game yet): validate, keep and save it here.
    if (msg.t === MSG.PROF) {
      this.prof = msg.prof = sanitizeProfile(msg.prof);
      saveProfile(this.prof);
    }
    if (msg.t !== MSG.SNAP && Number.isFinite(msg.r)) this.reliableSeq = Math.max(this.reliableSeq, msg.r);
    if ((msg.t === MSG.SNAP || msg.t === MSG.WELCOME || msg.t === MSG.PONG) && Number.isFinite(msg.now)) this.#clock(msg, local);
    const key = msg.t === MSG.EV ? `ev:${msg.e}` : msg.t;
    const list = this.handlers.get(key);
    if (list) for (const fn of list) fn(msg);
    if (msg.t !== MSG.SNAP && this.pendingSnapshot && this.pendingSnapshot.r <= this.reliableSeq) {
      const pending = this.pendingSnapshot;
      this.pendingSnapshot = null;
      this.#dispatch(pending);
    }
  }
}
