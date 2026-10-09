import test from 'node:test';
import assert from 'node:assert/strict';
import { InterpBuffer } from '../src/client/net/interp.js';

test('an empty interpolation buffer leaves the rendered position unchanged', () => {
  const buffer = new InterpBuffer();
  const out = [7, 8, 9];
  assert.equal(buffer.sample(0, out), false);
  assert.deepEqual(out, [7, 8, 9]);
  assert.equal(buffer.latest(), undefined);
});

test('remote positions interpolate between snapshots and cap extrapolation during a packet gap', () => {
  const buffer = new InterpBuffer();
  const out = [];
  buffer.push(10, [0, 20]);
  assert.equal(buffer.sample(5, out), true);
  assert.deepEqual(out, [0, 20]);
  buffer.push(12, [8, 12]);
  buffer.sample(11, out);
  assert.deepEqual(out, [4, 16]);
  buffer.sample(12, out);
  assert.deepEqual(out, [8, 12]);
  buffer.sample(100, out);
  assert.deepEqual(out, [10, 10], 'packet loss cannot move the entity indefinitely');
});

test('duplicate and reordered snapshots cannot rewind a remote entity', () => {
  const buffer = new InterpBuffer();
  buffer.push(1, [10]);
  buffer.push(2, [20]);
  buffer.push(2, [-100]);
  buffer.push(0, [-200]);
  const out = [];
  buffer.sample(1.5, out);
  assert.deepEqual(out, [15]);
  assert.deepEqual(buffer.latest(), [20]);
  assert.equal(buffer.frames.length, 2);
});

test('heading interpolation crosses the angle seam by the short path', () => {
  const buffer = new InterpBuffer([1]);
  const radians = degrees => degrees * Math.PI / 180;
  buffer.push(0, [0, radians(179)]);
  buffer.push(1, [10, radians(-179)]);
  const out = [];
  buffer.sample(0.5, out);
  assert.equal(out[0], 5);
  assert.ok(Math.abs(out[1] - Math.PI) < 1e-10, 'the entity turns two degrees, not a full revolution');
});

test('snapshot storage stays bounded and sampling retains the surrounding frames', () => {
  const buffer = new InterpBuffer();
  for (let i = 0; i < 1000; i++) buffer.push(i, [i]);
  assert.equal(buffer.frames.length, 30, 'a long session has bounded interpolation memory');
  const out = [];
  buffer.sample(995.5, out);
  assert.deepEqual(out, [995.5]);
  assert.equal(buffer.frames[0].t, 995);
  buffer.sample(2000, out);
  assert.equal(buffer.frames.length, 2);
  assert.deepEqual(out, [999.25]);
});
