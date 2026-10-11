// Opt-in hardware measurement of the actual menu -> Worker solo -> landing
// spawn flow. Complements the four-player herbivore observation benchmark.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createGameServer } from '../../server/index.js';
import { options, number, distribution, environment, report } from './common.mjs';

const opts = options(['channel', 'runs', 'seconds', 'warmup-seconds', 'width', 'height', 'output']);
const runs = number(opts, 'runs', 3, 1);
assert(Number.isInteger(runs));
const seconds = number(opts, 'seconds', 30, 1), warmup = number(opts, 'warmup-seconds', 8);
const width = number(opts, 'width', 1920, 1), height = number(opts, 'height', 1080, 1);
const server = createGameServer();
server.host.stop(); // asset hosting only; the actual solo world runs in its Worker
let browser;
const scenarios = [];
try {
  await new Promise((resolve, reject) => { server.httpServer.once('error', reject); server.httpServer.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(opts.channel ? { channel: opts.channel } : {}) });
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [], failedRequests = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.error('[startup browser]', message.text()); });
      page.on('request', request => requests.push(new URL(request.url()).pathname));
      page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
      await page.addInitScript(() => {
        window.startupLongTasks = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            window.startupLongTasks.push({ at: entry.startTime, ms: entry.duration });
            if (window.startupLongTasks.length > 512) window.startupLongTasks.shift();
          }
        }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(`${base}/?debug`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => !document.getElementById('btn-solo').disabled && document.querySelector('.menu-preview-image.is-front')?.naturalWidth > 0, null, { timeout: 60000 });
      const interactiveMs = await page.evaluate(() => performance.now());
      console.log(`[startup] run ${run + 1}: menu interactive at ${interactiveMs.toFixed(0)} ms`);
      // The menu is a photograph slideshow (no WebGL, no map models); wait until the selected island's shots are cached.
      await page.waitForFunction(() => window.__menuPostcards?.diagnostics.frames > 0, null, { timeout: 120000 });
      const preview = await page.evaluate(() => ({ readyMs: performance.now(), ...window.__menuPostcards.diagnostics,
        canvases: document.querySelectorAll('#menu canvas').length }));
      assert.equal(preview.cachedIslands, 1, 'menu must only retain the selected island');
      assert.equal(preview.canvases, 0, 'the menu draws no canvas');
      const menuRequests = requests.slice();
      assert(!menuRequests.some(path => /island-[234]-\d\.webp$|\/assets\/cave\//.test(path)), 'first island menu must not download other maps');
      const startAt = await page.evaluate(() => performance.now());
      await page.locator('#btn-solo').click();
      await page.waitForFunction(() => window.__game?.running, null, { timeout: 120000 });
      console.log(`[startup] run ${run + 1}: solo running`);
      const measurement = await page.evaluate(async ({ seconds, warmup }) => {
        const game = window.__game;
        const playableMs = performance.now();
        const { setSetting } = await import('/src/client/core/settings.js');
        setSetting('fpsLimit', 6);
        game.gfx.autoTune.frame = () => {}; // documented fixed Medium fixture
        game.gfx.setTier(1);
        const frame = [], cpu = [], gpu = [], triangles = [], calls = [];
        const render = game.gfx.render.bind(game.gfx);
        let previous, first, last;
        await new Promise(resolve => {
          const timeout = setTimeout(() => { game.gfx.render = render; resolve(); }, (seconds + warmup + 30) * 1000);
          game.gfx.render = dt => {
            render(dt);
            const now = performance.now();
            if (now < playableMs + warmup * 1000) return;
            first ??= now;
            if (previous !== undefined) frame.push(now - previous);
            previous = last = now;
            cpu.push(game.gfx.metrics.cpuRenderMs);
            if (Number.isFinite(game.gfx.metrics.gpuMs)) gpu.push(game.gfx.metrics.gpuMs);
            calls.push(game.gfx.renderer.info.render.calls);
            triangles.push(game.gfx.renderer.info.render.triangles);
            if (now - first >= seconds * 1000) { clearTimeout(timeout); game.gfx.render = render; resolve(); }
          };
        });
        const gl = game.gfx.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { playableMs, actualMeasurementMs: last - first, frame, cpu, gpu, triangles, calls,
          gpuName: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          graphics: game.gfx.graphics, renderScale: game.gfx.renderScale, contactShading: game.gfx.aoStrength,
          alive: game.me.alive, dinos: game.dinos.map.size, snapshots: game.net.telemetry.snapshots,
          island: game.level, position: { ...game.player.pos }, paused: !game.input.locked,
          menuLongTasks: window.startupLongTasks.filter(task => task.at < playableMs),
          steadyLongTasks: window.startupLongTasks.filter(task => task.at >= first) };
      }, { seconds, warmup });
      assert(measurement.alive && measurement.dinos > 0 && measurement.snapshots > 0);
      assert(measurement.frame.length > 0 && measurement.actualMeasurementMs >= seconds * 1000, 'actual spawn frame workload did not complete');
      assert.equal(measurement.island.index, 0);
      assert.deepEqual(errors, []);
      scenarios.push({ run: run + 1, route: 'stationary-normal-landing-spawn', hosting: 'solo-worker', players: 1,
        viewport: { width, height, devicePixelRatio: 1 }, interactiveMs, preview,
        soloLaunchMs: measurement.playableMs - startAt, ...measurement,
        averageFps: measurement.frame.length * 1000 / measurement.actualMeasurementMs,
        frame: distribution(measurement.frame), cpu: distribution(measurement.cpu),
        gpu: measurement.gpu.length ? distribution(measurement.gpu) : null,
        triangles: distribution(measurement.triangles), calls: distribution(measurement.calls),
        stallsOver50ms: measurement.frame.filter(ms => ms > 50).length,
        errors, failedRequests, menuRequests, valid: true });
    } finally { await context.close(); }
  }
} finally {
  await browser?.close(); server.internet.stop(); server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
await report({ kind: 'real-menu-solo-spawn', environment: environment(), channel: opts.channel ?? 'bundled',
  headless: true, targetFps: 120, frameBudgetMs: 1000 / 120, caveats: 'Stationary landing camera; headless pointer-lock may show pause UI. No combat, co-op or cave FPS claim.', scenarios }, opts.output);
