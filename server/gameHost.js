// WebSocket host for the authoritative ServerWorld: connection handling,
// join/lobby, message routing, fixed-rate ticking, snapshots and timeouts.

import { WebSocketServer } from 'ws';
import { CONFIG } from '../src/shared/config.js';
import { MSG } from '../src/shared/protocol.js';
import { ServerWorld } from '../src/sim/world.js';

const NET = CONFIG.net;
const MAX_MSG_BYTES = 8 * 1024;

export function startGameHost(httpServer = null, { onConnection } = {}) {
  const wss = httpServer ? new WebSocketServer({ server: httpServer, maxPayload: MAX_MSG_BYTES }) : null;
  /** @type {Map<number, import('ws').WebSocket>} */
  const sockets = new Map();

  const world = new ServerWorld({
    send(to, msg, except) {
      const data = JSON.stringify(msg);
      if (to === '*') {
        for (const [id, ws] of sockets) if (id !== except && ws.readyState === ws.OPEN) ws.send(data);
      } else {
        const ws = sockets.get(to);
        if (ws && ws.readyState === ws.OPEN) ws.send(data);
      }
    },
    log: (...a) => console.log('[world]', ...a),
  });

  function attachConnection(ws, addr = 'local') {
    let playerId = null;
    let joined = false;
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
        const res = world.join(msg.name, (id) => {
          playerId = id;
          joined = true;
          sockets.set(id, ws);
        }, msg.outfit);
        if (!res.ok) {
          ws.send(JSON.stringify({ t: MSG.REJECT, reason: res.reason }));
          ws.close(4000, 'full');
          return;
        }
        console.log(`[net] player #${playerId} connected from ${addr}`);
        return;
      }
      world.receive(playerId, msg);
    });
    ws.on('close', () => {
      if (playerId !== null && joined) {
        joined = false;
        sockets.delete(playerId);
        world.leave(playerId);
        console.log(`[net] player #${playerId} disconnected`);
      }
    });
    ws.on('error', () => {});
  }
  wss?.on('connection', (ws, req) => {
    attachConnection(ws, req.socket.remoteAddress);
    onConnection?.(ws, req);
  });

  // Fixed-rate simulation + snapshot broadcast.
  const tickMs = 1000 / NET.tickRate;
  let last = performance.now();
  let acc = 0;
  const interval = setInterval(() => {
    const now = performance.now();
    acc += Math.min(250, now - last);
    last = now;
    while (acc >= tickMs) {
      world.step(tickMs / 1000);
      acc -= tickMs;
      if (world.snapshotDue(tickMs / 1000) && sockets.size > 0) world.host.send('*', world.snapshot());
    }
    // drop silent clients (closed laptop lids, crashed tabs)
    for (const p of world.players.values()) {
      if ((world.now - p.lastInput) * 1000 > NET.timeoutMs) {
        const ws = sockets.get(p.id);
        console.log(`[net] player #${p.id} timed out`);
        ws?.terminate();
        sockets.delete(p.id);
        world.leave(p.id);
      }
    }
  }, tickMs / 2);

  return {
    world,
    attachConnection,
    stop() {
      clearInterval(interval);
      for (const ws of sockets.values()) ws.terminate();
      wss?.close();
    },
    status() {
      return {
        maxPlayers: NET.maxPlayers,
        players: [...world.players.values()].map((p) => ({ name: p.name, slot: p.slot, alive: p.alive })),
        mission: world.mission.state().title,
      };
    },
  };
}
