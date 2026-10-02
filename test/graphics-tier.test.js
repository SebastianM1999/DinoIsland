import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, guessTier, decide, GraphicsAutoTune, BUDGET_MS } from '../src/client/core/graphicsTier.js';

const TOP = TIERS.length - 1;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('the GPU name gives a sensible first guess', () => {
  assert.equal(guessTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), TOP);
  assert.equal(guessTier('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)'), TOP);
  assert.equal(guessTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 0);
  assert.equal(guessTier(''), 2);
});

test('a slow level steps down until it fits; a fast one tries one level up', () => {
  const failed = new Set();
  assert.deepEqual(decide({ tier: 3, gpuMs: BUDGET_MS + 5, failed }), { tier: 2, done: false });
  assert.deepEqual(decide({ tier: 2, gpuMs: 8, failed }), { tier: 2, done: true });
  assert.deepEqual(decide({ tier: 1, gpuMs: 3, failed: new Set() }), { tier: 2, done: false });
  assert.deepEqual(decide({ tier: 0, gpuMs: 40, failed: new Set() }), { tier: 0, done: true });
});

test('a level found too slow is never tried again (no bouncing)', () => {
  const failed = new Set();
  decide({ tier: 3, gpuMs: 20, failed });                       // 3 too slow
  assert.deepEqual(decide({ tier: 2, gpuMs: 2, failed }), { tier: 2, done: true });
});

test('without GPU timers it only steps down on slow frames', () => {
  assert.deepEqual(decide({ tier: 3, frameMs: 30 }), { tier: 2, done: false });
  assert.deepEqual(decide({ tier: 2, frameMs: 6 }), { tier: 2, done: true });
});

test('the measured level is stored per GPU and not measured again', () => {
  const storage = memory(), applied = [];
  const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)';
  const tune = new GraphicsAutoTune((t) => applied.push(t), gpu, storage);
  assert.equal(tune.tier, TOP);
  for (let i = 0; i < 60 * 8; i++) tune.frame(1 / 60, BUDGET_MS + 6);   // far too slow
  assert.deepEqual(applied, [TOP - 1]);
  for (let i = 0; i < 60 * 8; i++) tune.frame(1 / 60, 7);               // fits
  assert.equal(tune.active, false);

  const again = new GraphicsAutoTune(() => assert.fail('no re-measure'), gpu, storage);
  assert.equal(again.tier, TOP - 1);
  assert.equal(again.active, false);
  for (let i = 0; i < 600; i++) again.frame(1 / 60, 30);

  const newGpu = new GraphicsAutoTune(() => {}, 'ANGLE (Intel, Intel(R) UHD Graphics 620)', storage);
  assert.equal(newGpu.active, true);
  assert.equal(newGpu.tier, 1);
});

test('hitches and hidden-tab gaps are not measured', () => {
  const tune = new GraphicsAutoTune(() => assert.fail('no change'), '', memory());
  for (let i = 0; i < 100; i++) tune.frame(2, 50);
  assert.equal(tune.active, true);
});
