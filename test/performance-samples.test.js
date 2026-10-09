import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameSamples } from '../src/client/ui/perfStats.js';

test('frame percentiles reveal rare stalls that average FPS can hide', () => {
  const samples = new FrameSamples(100);
  for (let i = 0; i < 98; i++) samples.add(0.010);
  samples.add(0.080);
  samples.add(0.150);
  assert.equal(samples.percentile(0.5), 10);
  assert.equal(samples.percentile(0.95), 10);
  assert.equal(samples.percentile(0.99), 80);
  assert.equal(samples.percentile(1), 150);
});

test('frame telemetry uses bounded storage and forgets old stalls', () => {
  const samples = new FrameSamples(3);
  samples.add(0.120);
  samples.add(0.020);
  samples.add(0.010);
  assert.equal(samples.percentile(1), 120);
  for (let i = 0; i < 10000; i++) samples.add(0.010);
  assert.equal(samples.count, 3);
  assert.equal(samples.values.length, 3);
  assert.equal(samples.percentile(1), 10);
});

test('invalid timings cannot poison the frame-time percentile report', () => {
  const samples = new FrameSamples();
  for (const seconds of [0, -1, NaN, Infinity, -Infinity]) samples.add(seconds);
  assert.equal(samples.count, 0);
  assert.equal(samples.percentile(0.99), 0);
  samples.add(0.016);
  assert.equal(samples.percentile(-1), 16);
  assert.equal(samples.percentile(2), 16);
});
