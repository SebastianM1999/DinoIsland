import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, number, options } from '../scripts/performance/common.mjs';

test('benchmark percentiles expose the slow tail and leave original samples unchanged', () => {
  const values = [80, ...Array(98).fill(7), 150];
  assert.deepEqual(distribution(values), { count: 100, p50: 7, p95: 7, p99: 80, max: 150 });
  assert.equal(values[0], 80);
  assert.deepEqual(distribution([0]), { count: 1, p50: 0, p95: 0, p99: 0, max: 0 });
});

test('missing or invalid measurements fail instead of generating a reassuring empty report', () => {
  for (const values of [[], [NaN], [Infinity], [-1], [7, undefined]]) {
    assert.throws(() => distribution(values));
  }
});

test('mistyped or duplicated budget arguments cannot silently disable a performance gate', () => {
  const allowed = ['max-frame-p95-ms', 'output', 'headed'];
  assert.deepEqual(options(allowed, ['--max-frame-p95-ms=8.333', '--output=report=name.json', '--headed']),
    { 'max-frame-p95-ms': '8.333', output: 'report=name.json', headed: true });
  assert.throws(() => options(allowed, ['--max-frame-p95=8']), /Unknown/);
  assert.throws(() => options(allowed, ['--max-frame-p95-ms=8', '--max-frame-p95-ms=90']), /Duplicate/);
  assert.throws(() => options(allowed, ['8']), /Expected/);
  assert.equal(number({}, 'seconds', 15, 1), 15);
  assert.equal(number({ seconds: '30' }, 'seconds', 15, 1), 30);
  for (const value of [true, '', 'NaN', 'Infinity', '-1']) assert.throws(() => number({ seconds: value }, 'seconds', 15, 1));
});
