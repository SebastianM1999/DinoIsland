import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ShadowCadence, SHADOW_HZ } from '../src/client/core/shadowCadence.js';

/** Redraws per second and the share of frames that redraw, for `frames` frames at `fps`. */
function run(fps, frames = 600) {
  const c = new ShadowCadence();
  let n = 0;
  for (let i = 0; i < frames; i++) if (c.due(i * 1000 / fps)) n++;
  return { hz: n / (frames / fps), share: n / frames };
}

test('shadows redraw every frame at or below 60 FPS (no stutter on slow PCs)', () => {
  for (const fps of [30, 45, 59, 60]) assert.equal(run(fps).share, 1, `${fps} FPS`);
});

test('above 60 FPS the shadows average 60 Hz on any refresh rate, not the frame rate', () => {
  for (const fps of [75, 120, 144, 165, 240]) {
    const { hz } = run(fps);
    assert.ok(Math.abs(hz - SHADOW_HZ) <= 1, `${fps} FPS redraws ${hz.toFixed(1)} Hz`);
  }
  assert.ok(Math.abs(run(120).share - 0.5) < 0.01, '120 FPS halves the shadow passes');
});

test('a slow frame never makes the next frames catch up with a burst of redraws', () => {
  const c = new ShadowCadence();
  let t = 0, n = 0;
  for (let i = 0; i < 60; i++) c.due(t += 1000 / 144);
  t += 500;                                   // a half-second hitch
  c.due(t);
  for (let i = 0; i < 6; i++) if (c.due(t += 1000 / 144)) n++;
  assert.ok(n <= 3, `${n} redraws in the 6 frames after a hitch`);
});

test('a forced redraw (new shadow size or range) happens at once and restarts the interval', () => {
  const c = new ShadowCadence();
  assert.equal(c.due(0), true);
  assert.equal(c.due(5), false);
  assert.equal(c.due(6, true), true);
  assert.equal(c.due(12), false);
  c.reset();
  assert.equal(c.due(13), true);
});

test('the renderer no longer redraws the shadow map unconditionally every frame', () => {
  const src = readFileSync(new URL('../src/client/core/renderer.js', import.meta.url), 'utf8');
  const render = src.slice(src.indexOf('  render(rawDt'));
  assert.doesNotMatch(render.slice(0, render.indexOf('\n  }\n')), /^\s*r\.shadowMap\.needsUpdate = true;$/m);
  assert.match(render, /shadowCadence\.due\(/);
});
