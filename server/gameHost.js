// WebSocket host for the authoritative ServerWorld: connection handling,
// join/lobby, message routing, fixed-rate ticking, snapshots and timeouts.
//
// The hosted world can be swapped (`load`) or closed (`unload`): a host that serves saved
// expeditions (server/saveCoordinator.js) starts without one (`worldless`) and opens the
// expedition the owner picks. `admit` decides at hello time who may join and under which
// persistent roster key (sim/worldSave.js); without it everyone joins without a key.

import { WebSocketServer } from 'ws';
import { CONFIG } from '../src/shared/config.js';
import { MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';
import { installCaveBakes } from './caveBake.js';

const NET = CONFIG.net;
const MAX_MSG_BYTES = 8 * 1024;

/**
 * demo: host the demo (CONFIG.demo: island 1 only, two explorers, no firearms or skills).
 * worldless: start with no world (joins are refused until `load`).
 * admit({ addr, url }) -> { ok:true, key? } | { ok:false, reason }: who may join, and as whom.
 * onCheckpoint(reason): the world reached a moment worth saving.
 */
export function startGameHost(httpServer = null, { onConnection, demo = false, worldless = false, admit = null, onCheckpoint = null } = {}) {
  installCaveBakes();   // (the Hollow Mountain's baked walk grid: assets/cave, see src/shared/caveBake.js)
  const wss = httpServer ? new WebSocketServer({ server: httpServer, maxPayload: MAX_MSG_BYTES }) : null;
  /** @type {Map<number, import('ws').WebSocket>} */
  const sockets = new Map();
  const reliableSeq = new Map();
  /** every attached connection, joined or not (closed when the world changes): ws -> forget() */
  const connections = new Map();

  function sendTo(id, ws, msg) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    // Unreliable snapshots identify the reliable messages that must arrive
    // first. Counters are per recipient, including private inventory updates.
    const r = (reliableSeq.get(id) ?? 0) + (msg.t === MSG.SNAP ? 0 : 1);
    reliableSeq.set(id, r);
    if (msg.t === MSG.SNAP && ws.bufferedAmount > 64 * 1024) return;
    ws.send(JSON.stringify({ ...msg, r }));
  }

  /** What a world talks to: the sockets of this host. */
  const io = {
    send(to, msg, except) {
      if (to === '*') {
        for (const [id, ws] of sockets) if (id !== except) sendTo(id, ws, msg);
      } else {
        const ws = sockets.get(to);
        sendTo(to, ws, msg);
      }
    },
    log: (...a) => console.log('[world]', ...a),
    checkpoint: (reason) => onCheckpoint?.(reason),
  };

  let world = worldless ? null : new ServerWorld(io, { demo, alphas: true });

  function attachConnection(ws, addr = 'local', info = {}) {
    let playerId = null;
    let joined = false;
    let joinedWorld = null;
    // (the world changed under this connection: it no longer owns a player id of the new world)
    const forget = () => {
      if (joined && sockets.get(playerId) === ws) { sockets.delete(playerId); reliableSeq.delete(playerId); }
      joined = false;
      joinedWorld = null;
    };
    connections.set(ws, forget);
    ws.on('message', (raw) => {
      if (Buffer.byteLength(raw) > MAX_MSG_BYTES) { ws.close(4002, 'Message too large'); return; }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed input
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (playerId === null) {
        if (msg.t !== MSG.HELLO) return;
        const gate = !world ? { ok: false, reason: 'No expedition is open on this host.' } : admit ? admit({ addr, ...info, credential: msg.credential }) : { ok: true };
        // a saved expedition asks a guest which credential it holds for it, then waits for the next hello
        if (gate.ident) { ws.send(JSON.stringify({ t: MSG.IDENT, world: gate.ident })); return; }
        // (progression belongs to the expedition: a client-sent profile is never used)
        const res = gate.ok ? world.join(msg.name, (id) => {
          playerId = id;
          joined = true;
          joinedWorld = world;
          sockets.set(id, ws);
        }, msg.outfit, null, gate.key ?? null) : gate;
        if (!res.ok) {
          ws.send(JSON.stringify({ t: MSG.REJECT, reason: res.reason }));
          ws.close(4000, 'full');
          return;
        }
        // a new guest keeps this to get the same character back next time
        if (gate.issue) sendTo(playerId, ws, { t: MSG.CREDENTIAL, ...gate.issue });
        console.log(`[net] player #${playerId} connected from ${addr}`);
        return;
      }
      if (joined && joinedWorld === world) world.receive(playerId, msg);
    });
    ws.on('close', () => {
      connections.delete(ws);
      if (playerId !== null && joined) {
        joined = false;
        sockets.delete(playerId);
        reliableSeq.delete(playerId);
        if (joinedWorld === world) world?.leave(playerId);
        console.log(`[net] player #${playerId} disconnected`);
      }
    });
    ws.on('error', () => {});
  }
  wss?.on('connection', (ws, req) => {
    attachConnection(ws, req.socket.remoteAddress, { url: req.url });
    onConnection?.(ws, req);
  });

  /** Close every connection (they see `reason`); their players leave the current world first. */
  function dropAll(reason) {
    for (const [ws, forget] of [...connections]) {
      forget();
      connections.delete(ws);
      try { ws.close(4001, reason); } catch { /* already gone */ }
    }
  }

  // Fixed-rate simulation + snapshot broadcast.
  const tickMs = 1000 / NET.tickRate;
  let last = performance.now();
  let acc = 0;
  const interval = setInterval(() => {
    const now = performance.now();
    acc += Math.min(250, now - last);
    last = now;
    if (!world) { acc = 0; return; }
    let snapshotDue = false;
    const tickStart = performance.now();
    while (acc >= tickMs) {
      world.step(tickMs / 1000);
      acc -= tickMs;
      if (world.snapshotDue(tickMs / 1000)) snapshotDue = true;
    }
    world.tickDurationMs = performance.now() - tickStart;
    if (snapshotDue && sockets.size > 0) world.host.send('*', world.snapshot());
    // drop silent clients (closed laptop lids, crashed tabs)
    for (const p of world.players.values()) {
      if ((world.now - p.lastInput) * 1000 > NET.timeoutMs) {
        const ws = sockets.get(p.id);
        console.log(`[net] player #${p.id} timed out`);
        ws?.terminate();
        sockets.delete(p.id);
        reliableSeq.delete(p.id);
        world.leave(p.id);
      }
    }
  }, tickMs / 2);

  return {
    get world() { return world; },
    attachConnection,
    /** Host another world: `build(io)` returns a ServerWorld wired to this host. Everyone connected is dropped first. */
    load(build, reason = 'The host opened another expedition.') {
      dropAll(reason);
      world = build(io);
      return world;
    },
    /** Stop hosting a world; everyone connected is dropped. */
    unload(reason = 'The host closed the expedition.') {
      dropAll(reason);
      world = null;
    },
    /** The connected player that joined with roster key `key`, if any. */
    playerByKey(key) {
      for (const p of world?.players.values() ?? []) if (p.key === key) return p;
      return null;
    },
    stop() {
      clearInterval(interval);
      for (const ws of sockets.values()) ws.terminate();
      wss?.close();
    },
    status() {
      return {
        demo,
        open: !!world,
        maxPlayers: demo ? CONFIG.demo.maxPlayers : NET.maxPlayers,
        players: world ? [...world.players.values()].map((p) => ({ name: p.name, slot: p.slot, alive: p.alive })) : [],
        mission: world ? world.mission.state().title : null,
      };
    },
  };
}
