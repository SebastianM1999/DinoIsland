import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { createGameServer } from '../../server/index.js';
import { makeRng } from '../../src/shared/rng.js';
import { goodSpot } from '../../src/sim/unstuck.js';
import { PF } from '../../src/shared/protocol.js';
import { options, number, distribution, environment, report } from './common.mjs';

const opts = options();
const duration = number(opts, 'seconds', 15, 1);
const warmup = number(opts, 'warmup-seconds', 8);
const variant = number(opts, 'variant', 42, 1);
assert(Number.isInteger(variant) && variant <= 1000000);
const frameLimit = opts['max-frame-p95-ms'] === undefined ? null : number(opts, 'max-frame-p95-ms', 0);
const stallLimit = opts['max-stalls'] === undefined ? null : number(opts, 'max-stalls', 0);
const headless = !opts.headed;
const software = !!opts.software;
const width = number(opts, 'width', 1920, 1);
const height = number(opts, 'height', 1080, 1);
const targetFps = number(opts, 'target-fps', 120, 1);
const frameP99Limit = opts['max-frame-p99-ms'] === undefined ? null : number(opts, 'max-frame-p99-ms', 0);
const results = [];
let browser;

function bounded(promise, ms, description) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${description} timed out after ${ms}ms`)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function bot(url, name, world) {
  const ws = new WebSocket(url);
  let interval;
  let seq = 0;
  let id;
  try {
    const welcome = await bounded(new Promise((resolve, reject) => {
      ws.once('error', reject);
      ws.once('open', () => ws.send(JSON.stringify({ t: 'hello', name })));
      ws.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.t === 'welcome') resolve(message);
        if (message.t === 'reject') reject(new Error(message.reason));
        if (message.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: message.c }));
      });
    }), 10000, 'Bot welcome');
    id = welcome.id;
    interval = setInterval(() => {
      const p = world.players.get(id);
      if (!p || ws.readyState !== WebSocket.OPEN) return;
      const angle = seq * .04;
      const x = p.x + Math.cos(angle) * .08, z = p.z + Math.sin(angle) * .08;
      ws.send(JSON.stringify({ t: 'state', s: ++seq, k: p.epoch,
        x, y: world.terrain.heightAt(x, z), z, yaw: angle, pitch: 0, spd: 1.6, eq: 0, fl: PF.GROUND }));
    }, 50);
    return () => { clearInterval(interval); ws.terminate(); };
  } catch (error) { clearInterval(interval); ws.terminate(); throw error; }
}

// The route replaces only the entry document. All modules, assets, terrain,
// physics, authoritative host, networking and rendering remain the real game.
const html = `<!doctype html><html><head><link rel="stylesheet" href="/css/main.css">
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.min.js","three/addons/":"/vendor/three/examples/jsm/"}}</script>
</head><body><canvas id="game"></canvas><div id="hud"></div></body></html>`;

try {
  browser = await chromium.launch({ headless, ...(opts.channel ? { channel: opts.channel } : {}),
    args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (let level = 0; level < 3; level++) {
    const originalRandom = Math.random;
    const stops = [];
    let server, context;
    try {
      // Existing host has no world-options argument. Control just its initial
      // random variant draw; subsequent AI keeps seeded, live simulation.
      const rng = makeRng(variant + level * 1000);
      let draw = 0;
      Math.random = () => ++draw === 2 ? (variant - 1) / 1e6 : rng();
      server = createGameServer();
      for (let index = 0; index < level; index++) {
        let first = true;
        Math.random = () => { if (first) { first = false; return (variant - 1) / 1e6; } return rng(); };
        server.host.world.nextLevel();
      }
      Math.random = rng;
      const world = server.host.world;
      assert.equal(world.variant, variant);
      // Observe live dinosaurs outside the protected landing camp. Find a
      // legal player position near a real spawn; never freeze/remove AI.
      const target = world.dinos.list.find(d => d.type !== 'ptera') ?? world.dinos.list[0];
      assert(target);
      let view;
      for (let radius = 25; radius <= 60 && !view; radius += 5) {
        for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI / 12;
          const x = target.x + Math.cos(angle) * radius, z = target.z + Math.sin(angle) * radius;
          if (goodSpot(world.terrain, world.layout, x, z) !== null) { view = { x, z, yaw: Math.atan2(x - target.x, z - target.z) }; break; }
        }
      }
      assert(view, 'No legal dinosaur observation point');
      world.layout.spawnPoints = Array.from({ length: 4 }, () => ({ ...view }));
      await bounded(new Promise((resolve, reject) => {
        server.httpServer.once('error', reject);
        server.httpServer.listen(0, '127.0.0.1', resolve);
      }), 10000, 'HTTP listen');
      const base = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (let i = 0; i < 3; i++) stops.push(await bot(base.replace('http:', 'ws:'), `Benchmark ${i + 2}`, world));
      context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      await context.grantPermissions(['local-network-access'], { origin: base });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') console.error('[browser]', message.text()); });
      await page.route(`${base}/`, route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      const measurement = await bounded(page.evaluate(async ({ duration, warmup, base }) => {
        const [{ Net }, { Game }, settingsModule, { preloadDinoModels }, { TIERS }] = await Promise.all([
          import('/src/client/net/net.js'), import('/src/client/core/game.js'),
          import('/src/client/core/settings.js'), import('/src/client/models/dino/glbDino.js'), import('/src/client/core/graphicsTier.js'),
        ]);
        settingsModule.setSetting('fpsLimit', 6);
        await preloadDinoModels();
        const net = await Net.connect(base.replace('http:', 'ws:'), 'Benchmark 1');
        const game = new Game(document.getElementById('game'), net);
        window.benchmarkGame = game;
        // Controlled benchmark fixture: production still chooses tiers automatically.
        game.gfx.autoTune.active = false;
        game.gfx.autoTune.tier = 1;
        game.gfx.setTier(TIERS.indexOf(TIERS[1]));
        await game.gfx.prepare();
        const gl = game.gfx.renderer.getContext();
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const cadence = [];
        let cadencePrevious;
        await new Promise(resolve => {
          const sample = now => {
            if (cadencePrevious !== undefined) cadence.push(now - cadencePrevious);
            cadencePrevious = now;
            if (cadence.length >= 30) resolve(); else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        const frameMs = [], renderCpuMs = [], gpuMs = [], calls = [], triangles = [], geometries = [], textures = [], tiers = new Set();
        let previous, measuredAt, start, updates = 0, visibleDinosMax = 0, movementMeters = 0;
        const realUpdate = game.update.bind(game);
        game.update = dt => {
          const phase = Math.floor(game.time / 1.5) % 4;
          game.input.held.clear();
          game.input.held.add(['left', 'forward', 'right', 'back'][phase]);
          const old = { ...game.player.pos };
          game.player.yaw += dt * .08;
          realUpdate(dt);
          if (measuredAt !== undefined) { updates++; movementMeters += Math.hypot(game.player.pos.x - old.x, game.player.pos.z - old.z); }
        };
        const realRender = game.gfx.render.bind(game.gfx);
        let resolve;
        const complete = new Promise(r => { resolve = r; });
        game.gfx.render = dt => {
          realRender(dt);
          const now = performance.now();
          start ??= now;
          if (now - start < warmup * 1000) return;
          measuredAt ??= now;
          if (previous !== undefined) frameMs.push(now - previous);
          previous = now;
          const info = game.gfx.renderer.info;
          renderCpuMs.push(game.gfx.metrics.cpuRenderMs);
          if (Number.isFinite(game.gfx.metrics.gpuMs)) gpuMs.push(game.gfx.metrics.gpuMs);
          calls.push(info.render.calls); triangles.push(info.render.triangles);
          geometries.push(info.memory.geometries); textures.push(info.memory.textures);
          tiers.add(game.gfx.metrics.tier);
          const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(game.gfx.camera.projectionMatrix, game.gfx.camera.matrixWorldInverse));
          let visible = 0;
          for (const dino of game.dinos.map.values()) {
            if (dino.root?.visible && frustum.intersectsSphere(new THREE.Sphere(dino.root.position, 5))) visible++;
          }
          visibleDinosMax = Math.max(visibleDinosMax, visible);
          if (now - measuredAt >= duration * 1000) { game.stop(); resolve(); }
        };
        const THREE = await import('three');
        game.start();
        await complete;
        const result = { frameMs, renderCpuMs, gpuMs, calls, triangles, geometries, textures, gpu,
          settings: { ...settingsModule.settings }, tiers: [...tiers], viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
          updates, movementMeters, visibleDinosMax, snapshots: net.telemetry.snapshots, alive: game.me.alive,
          actualMeasurementMs: previous - measuredAt, userAgent: navigator.userAgent, level: game.level,
          connectedPlayers: net.welcome.world.players.length,
          graphics: { ...game.gfx.graphics }, renderScale: game.gfx.renderScale, contactShading: game.gfx.aoStrength,
          rafCadenceMs: cadence, effectiveLimiter: 'requestAnimationFrame/display cadence; game FPS cap disabled' };
        net.close();
        const reusable = game.dispose(); reusable.gfx.dispose(); reusable.audio.dispose?.();
        return result;
      }, { duration, warmup, base }), (duration + warmup + 120) * 1000, 'Gameplay benchmark');
      assert.equal(measurement.connectedPlayers, 4, 'Welcome must contain the four-player workload');
      assert(world.players.size >= 3, 'Bot players must remain connected until cleanup');
      assert(measurement.updates > 0 && measurement.movementMeters > 0 && measurement.snapshots > 0);
      assert(measurement.visibleDinosMax > 0, 'No dinosaur entered the view frustum');
      assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
      const stats = Object.fromEntries(['frameMs', 'renderCpuMs', 'calls', 'triangles', 'geometries', 'textures'].map(key => [key, distribution(measurement[key])]));
      results.push({ ...measurement, ...stats, gpuMs: measurement.gpuMs.length ? distribution(measurement.gpuMs) : null,
        rafCadenceMs: distribution(measurement.rafCadenceMs),
        observedRafHz: 1000 / distribution(measurement.rafCadenceMs).p50,
        stallsOver50ms: measurement.frameMs.filter(ms => ms > 50).length,
        softwareGpu: /swiftshader|llvmpipe|software|microsoft basic/i.test(measurement.gpu), players: 4, variant });
    } finally {
      Math.random = originalRandom;
      for (const stop of stops) stop();
      server?.host.stop();
      server?.internet.stop();
      server?.httpServer.closeAllConnections();
      const cleanup = await Promise.allSettled([
        bounded(context?.close() ?? Promise.resolve(), 10000, 'Browser context cleanup'),
        bounded(server ? new Promise(resolve => server.httpServer.close(resolve)) : Promise.resolve(), 10000, 'HTTP cleanup'),
      ]);
      for (const result of cleanup) if (result.status === 'rejected') console.error('[cleanup]', result.reason);
    }
  }
} finally { await browser?.close(); }
await report({ kind: 'real-game-websocket-rendering', environment: { ...environment(), chromium: browser.version(), headless, requestedChannel: opts.channel ?? 'bundled', requestedSoftware: software },
  targetFps, frameBudgetMs: 1000 / targetFps, mediumTier: true,
  gates: { frameP95Ms: frameLimit, frameP99Ms: frameP99Limit, stallsOver50ms: stallLimit }, scenarios: results }, opts.output);
if (results.some(r => frameLimit !== null && r.frameMs.p95 > frameLimit || frameP99Limit !== null && r.frameMs.p99 > frameP99Limit || stallLimit !== null && r.stallsOver50ms > stallLimit)) process.exitCode = 1;
