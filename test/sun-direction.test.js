import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BIOMES } from '../src/shared/levels.js';

test('every biome names where its sun stands, high enough for the 48 m shadow frustum', () => {
  for (const [id, biome] of Object.entries(BIOMES)) {
    const d = biome.sunDir;
    assert.ok(Array.isArray(d) && d.length === 3 && d.every(Number.isFinite), `${id} sunDir`);
    const len = Math.hypot(...d);
    const elevation = Math.asin(d[1] / len) * 180 / Math.PI;
    // a lower sun throws shadows longer than the shadow map reaches around the player
    assert.ok(elevation >= 24 && elevation <= 75, `${id} sun at ${elevation.toFixed(0)} deg`);
  }
});

test('the game sets the island\'s sun before the sky and water bake it into their shaders', () => {
  const src = readFileSync(new URL('../src/client/core/game.js', import.meta.url), 'utf8');
  const set = src.indexOf('this.gfx.setSunDir(this.layout.biome.sunDir)');
  assert.ok(set > 0);
  assert.ok(set < src.indexOf('buildSky(this.gfx'), 'before buildSky');
  assert.ok(set < src.indexOf('buildWater(this.terrain'), 'before buildWater');
  const renderer = readFileSync(new URL('../src/client/core/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer.slice(renderer.indexOf('blendBiome(a, b, k)'), renderer.indexOf('#setupLights')), /sunDir/,
    'blending moods never turns the sun (sky and water keep their baked direction)');
});
