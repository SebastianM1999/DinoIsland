import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { ServerWorld } from '../../src/sim/world.js';
import { PlayerController } from '../../src/client/player/controller.js';
import { makeRng } from '../../src/shared/rng.js';
import { CONFIG } from '../../src/shared/config.js';
import { MSG, PF } from '../../src/shared/protocol.js';
import { options, number, distribution, environment, report } from './common.mjs';

const opts = options();
const ticks = number(opts, 'ticks', 600, 1);
const warmup = number(opts, 'warmup', 120, 0);
const variant = number(opts, 'variant', 42, 1);
const players = number(opts, 'players', 4, 1);
for (const [name, value] of Object.entries({ ticks, warmup, variant, players })) assert(Number.isInteger(value), `${name} must be an integer`);
assert(players <= CONFIG.net.maxPlayers);
const limit = opts['max-tick-p95-ms'] === undefined ? null : number(opts, 'max-tick-p95-ms', 0);
const results = [];
const originalRandom = Math.random;
try {
  for (let level = 0; level < 3; level++) {
    Math.random = makeRng(variant + level * 1000);
    let messages = 0;
    const world = new ServerWorld({ send: () => messages++ }, { level, variant });
    const controllers = [];
    for (let slot = 0; slot < players; slot++) {
      const joined = world.join(`Benchmark ${slot + 1}`, () => {});
      assert(joined.ok);
      const p = world.players.get(joined.id);
      const controller = new PlayerController(world.terrain, world.layout.playerColliders, world.layout.rockSurfaceAt);
      Object.assign(controller.pos, { x: p.x, y: p.y, z: p.z });
      controllers.push({ p, controller, sequence: 0 });
    }
    const dt = 1 / CONFIG.net.tickRate;
    const samples = [];
    let snapshots = 0, packets = 0;
    for (let tick = 0; tick < warmup + ticks; tick++) {
      const start = performance.now();
      for (const entry of controllers) {
        const { p, controller } = entry;
        controller.yaw = (tick * dt * .2) + p.slot;
        controller.update(dt, { forward: Math.floor(tick * dt / 2) % 2 === 0, back: Math.floor(tick * dt / 2) % 2 === 1 });
        world.receive(p.id, { t: MSG.STATE, s: ++entry.sequence, k: p.epoch,
          ...controller.pos, yaw: controller.yaw, pitch: 0, spd: controller.moveSpeed, eq: 0, fl: controller.onGround ? PF.GROUND : 0 });
        packets++;
        // Server corrections must also reach the predictive fixture.
        Object.assign(controller.pos, { x: p.x, y: p.y, z: p.z });
      }
      world.step(dt);
      if (world.snapshotDue(dt)) { JSON.stringify(world.snapshot()); snapshots++; }
      if (tick >= warmup) samples.push(performance.now() - start);
    }
    assert.equal(world.players.size, players);
    assert.equal(packets, (warmup + ticks) * players);
    assert(world.dinos.list.length > 0 && snapshots > 0);
    assert(world.dinos.list.every(d => Number.isFinite(d.x) && Number.isFinite(d.z)));
    const tickMs = distribution(samples);
    results.push({ level: level + 1, variant, players, ticks, warmup, tickMs, tickBudgetMs: 1000 / CONFIG.net.tickRate,
      workload: { packets, snapshots, outgoingMessages: messages, dinos: world.dinos.list.length,
        stateSha256: createHash('sha256').update(JSON.stringify(world.snapshot())).digest('hex') } });
  }
} finally { Math.random = originalRandom; }
await report({ kind: 'authoritative-simulation', environment: environment(), timingGateMs: limit, scenarios: results }, opts.output);
if (limit !== null && results.some(r => r.tickMs.p95 > limit)) process.exitCode = 1;
