import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, guessTier, decide, GraphicsAutoTune, BUDGET_MS, CALIBRATION_VERSION } from '../src/client/core/graphicsTier.js';
import { storageKey } from '../src/shared/brand.js';

const TOP = TIERS.length - 1;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('the GPU name gives a sensible first guess', () => {
  assert.equal(guessTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 1);
  assert.equal(guessTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 0);
  assert.equal(guessTier(''), 1);
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

test('a measured level is stored per GPU and rechecked in the next session', () => {
  const storage = memory(), applied = [];
  const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)';
  const tune = new GraphicsAutoTune((t) => applied.push(t), gpu, storage);
  assert.equal(tune.tier, 1);
  for (let i = 0; i < 60 * 8; i++) tune.frame(1 / 60, BUDGET_MS + 6);   // far too slow
  assert.deepEqual(applied, [0]);
  for (let i = 0; i < 60 * 8; i++) tune.frame(1 / 60, 7);               // fits
  assert.equal(tune.active, false);

  const again = new GraphicsAutoTune(() => {}, gpu, storage);
  assert.equal(again.tier, 0);
  assert.equal(again.active, true);
  assert.equal(JSON.parse(storage.getItem(storageKey('graphics-tier'))).version, CALIBRATION_VERSION);

  const newGpu = new GraphicsAutoTune(() => {}, 'ANGLE (Intel, Intel(R) UHD Graphics 620)', storage);
  assert.equal(newGpu.active, true);
  assert.equal(newGpu.tier, 1);
});

test('hidden-tab gaps are explicitly excluded and discard partial measurements', () => {
  const tune = new GraphicsAutoTune(() => assert.fail('no change'), '', memory());
  for (let i = 0; i < 100; i++) tune.frame(2, 50, false, false);
  assert.equal(tune.active, true);
  assert.equal(tune.t, 0);
});

test('sustained three FPS recovers to Low with and without GPU timers', () => {
  for (const gpuMs of [null, 330, 2]) {
    const applied = [], tune = new GraphicsAutoTune(t => applied.push(t), 'RTX 3070', memory());
    for (let i = 0; i < 90; i++) tune.frame(1 / 3, gpuMs);
    assert.equal(tune.tier, 0);
    assert.ok(applied.includes(0));
  }
});

test('an isolated long frame cannot lower a normally fitting tier', () => {
  const tune = new GraphicsAutoTune(() => assert.fail('isolated hitch changed tier'), 'RTX 3070', memory());
  for (let i = 0; i < 210; i++) tune.frame(1 / 60, null);
  tune.frame(3, null);
  for (let i = 0; i < 300; i++) tune.frame(1 / 60, null);
  assert.equal(tune.tier, 1);
  assert.equal(tune.active, false);
});

test('old calibration versions cannot keep an obsolete Ultra startup', () => {
  for (const version of [undefined, CALIBRATION_VERSION - 1]) {
    const storage = memory();
    storage.setItem(storageKey('graphics-tier'), JSON.stringify({ gpu: 'RTX 3070', tier: TOP, done: true, version }));
    const tune = new GraphicsAutoTune(() => {}, 'RTX 3070', storage);
    assert.equal(tune.tier, 1);
    assert.equal(tune.active, true);
  }
});

test('a completed calibration recovers when the workload becomes persistently slow', () => {
  const tune = new GraphicsAutoTune(() => {}, 'RTX 3070', memory());
  for (let i = 0; i < 480; i++) tune.frame(1 / 60, 7);
  assert.equal(tune.active, false);
  for (let i = 0; i < 50; i++) tune.frame(1 / 3, 330);
  assert.equal(tune.tier, 0);
});

test('a low frame cap without GPU timers does not manufacture calibration evidence', () => {
  const tune = new GraphicsAutoTune(() => assert.fail('cap changed tier'), 'RTX 3070', memory());
  for (let i = 0; i < 900; i++) tune.frame(1 / 30, null, true);
  assert.equal(tune.active, true);
  assert.equal(tune.tier, 1);
});

test('measured headroom still promotes hardware beyond the conservative startup tier', () => {
  const tune = new GraphicsAutoTune(() => {}, 'RTX 3070', memory());
  for (let i = 0; i < 1500; i++) tune.frame(1 / 144, 2);
  assert.equal(tune.tier, 2);
  for (let i = 0; i < 1500; i++) tune.frame(1 / 144, 2);
  assert.equal(tune.tier, TOP);
});
