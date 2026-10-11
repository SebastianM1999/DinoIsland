// src/shared/dmath.js: deterministic transcendental functions. Accuracy against Math.* (within 2 ulp over many inputs,
// small, game-sized and huge), ECMAScript's special values, the reduction tables against 2/pi and pi/2 computed with
// BigInt, pinned bit patterns (a change to dmath changes islands and the cave bake's keys), and sortV8Order against V8's
// own Array.prototype.sort with a comparator that draws random numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as dmath from '../src/shared/dmath.js';
import { makeRng, sortV8Order } from '../src/shared/rng.js';

const f64 = new Float64Array(1), i64 = new BigInt64Array(f64.buffer), u32 = new Uint32Array(f64.buffer);
/** Distance in units in the last place (0 for equal values, both NaN, or +0 vs -0 handled by the caller). */
function ulps(a, b) {
  if (Object.is(a, b) || (a !== a && b !== b)) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const ord = (x) => { f64[0] = x; const v = i64[0]; return v < 0n ? -(v & 0x7fffffffffffffffn) : v; };
  const d = ord(a) - ord(b);
  return Number(d < 0n ? -d : d);
}
const hex = (x) => { f64[0] = x; return u32[1].toString(16).padStart(8, '0') + u32[0].toString(16).padStart(8, '0'); };

const rng = makeRng(2024);
const uni = (lo, hi) => () => lo + (hi - lo) * rng();
const logUni = (lo, hi) => () => (rng() < 0.5 ? -1 : 1) * dmath.exp(dmath.log(lo) + (dmath.log(hi) - dmath.log(lo)) * rng());

const CASES = {
  sin: [[uni(-7, 7)], [uni(-2000, 2000)], [logUni(1e-12, 1e300)], [logUni(1e250, 1.7e308)]],
  cos: [[uni(-7, 7)], [uni(-2000, 2000)], [logUni(1e-12, 1e300)], [logUni(1e250, 1.7e308)]],
  tan: [[uni(-7, 7)], [logUni(1e-12, 1e300)]],
  atan: [[uni(-4, 4)], [logUni(1e-12, 1e300)]],
  asin: [[uni(-1, 1)]],
  acos: [[uni(-1, 1)]],
  exp: [[uni(-30, 30)], [uni(-745, 709.7)]],
  log: [[uni(0, 10)], [() => Math.abs(logUni(1e-310, 1e308)())]],
  atan2: [[uni(-10, 10), uni(-10, 10)], [logUni(1e-30, 1e30), logUni(1e-30, 1e30)]],
  pow: [[uni(0, 3), uni(-6, 6)], [uni(0, 200), uni(-60, 60)], [uni(-5, 0), () => Math.round(uni(-25, 25)())],
    [uni(1 - 1e-7, 1 + 1e-7), uni(-1e9, 1e9)]],
};

test('dmath agrees with Math.* within 2 ulp over many inputs', () => {
  for (const [name, sets] of Object.entries(CASES)) {
    for (const gens of sets) {
      let worst = 0, at = null;
      for (let i = 0; i < 20000; i++) {
        const args = gens.map((g) => g());
        const u = ulps(dmath[name](...args), Math[name](...args));
        if (u > worst) { worst = u; at = args; }
      }
      assert.ok(worst <= 2, `${name}(${at}) is ${worst} ulp from Math.${name}`);
    }
  }
});

test('hypot is the correctly rounded pieces sqrt(a*a + b*b [+ c*c])', () => {
  for (let i = 0; i < 2000; i++) {
    const a = (rng() - 0.5) * 600, b = (rng() - 0.5) * 600, c = (rng() - 0.5) * 60;
    assert.equal(dmath.hypot(a, b), Math.sqrt(a * a + b * b));
    assert.equal(dmath.hypot(a, b, c), Math.sqrt(a * a + b * b + c * c));
    assert.ok(ulps(dmath.hypot(a, b, c), Math.hypot(a, b, c)) <= 2);
  }
});

test('special values are the ones ECMAScript specifies', () => {
  const xs = [0, -0, Infinity, -Infinity, NaN, 1, -1, 0.5, -0.5, 2, -2, 3, -3, 5e-324, -5e-324, 1e-310, Math.PI, -Math.PI,
    Math.PI / 2, 710, -746, 1e308, -1e308, 2 ** 53, 2 ** 64 + 2 ** 12, 1 + 2 ** -52, 1 - 2 ** -53];
  for (const name of ['sin', 'cos', 'tan', 'atan', 'asin', 'acos', 'exp', 'log']) {
    for (const x of xs) {
      const d = dmath[name](x), m = Math[name](x);
      if (!Number.isFinite(m) || m === 0) assert.ok(Object.is(d, m), `${name}(${x}): ${d} vs ${m}`);
      else assert.ok(ulps(d, m) <= 1, `${name}(${x}): ${d} vs ${m}`);
    }
  }
  for (const name of ['atan2', 'pow']) {
    for (const x of xs) {
      for (const y of xs) {
        const d = dmath[name](x, y), m = Math[name](x, y);
        if (!Number.isFinite(m) || m === 0) assert.ok(Object.is(d, m), `${name}(${x}, ${y}): ${d} vs ${m}`);
        else assert.ok(ulps(d, m) <= 1, `${name}(${x}, ${y}): ${d} vs ${m}`);
      }
    }
  }
  // exact cases
  assert.equal(dmath.pow(3, 2), 9);
  assert.equal(dmath.pow(2, 10), 1024);
  assert.equal(dmath.pow(2, -1074), 5e-324);
  assert.equal(dmath.pow(16, 0.5), 4);
  assert.equal(dmath.log(1), 0);
  assert.equal(dmath.exp(0), 1);
  assert.equal(dmath.scalbn(1.5, -1074), 1e-323);   // (1.5 units of the last subnormal place round to even: 2)
  assert.equal(dmath.scalbn(0.25, -1074), 0);
  assert.equal(dmath.scalbn(1, -1074), 5e-324);
  assert.equal(dmath.scalbn(1, 1024), Infinity);
  assert.equal(dmath.scalbn(5e-324, 2097), 2 ** 1023);
});

/** floor(atan(1 / n) * 2^bits) by its series, in BigInt. */
function atanInv(n, bits) {
  const one = 1n << BigInt(bits), N = BigInt(n), n2 = N * N;
  let sum = 0n, term = one / N, k = 0n;
  while (term !== 0n) {
    sum += (k % 2n === 0n ? 1n : -1n) * (term / (2n * k + 1n));
    term /= n2;
    k++;
  }
  return sum;
}

test('the reduction tables are the bits of 2/pi and pi/2', () => {
  const bits = 1800;
  const pi = 16n * atanInv(5, bits) - 4n * atanInv(239, bits);   // Machin: pi * 2^bits (+- a few units)
  const { IPIO2, PIO2 } = dmath.REDUCTION_TABLES;
  // 2/pi: the 24-bit chunks of its fraction
  const twoOverPi = (2n << BigInt(2 * bits)) / pi;               // 2/pi * 2^bits
  const fracBits = 24 * IPIO2.length;
  const frac = twoOverPi >> BigInt(bits - fracBits);
  for (let i = 0; i < IPIO2.length; i++) {
    assert.equal(IPIO2[i], Number((frac >> BigInt(24 * (IPIO2.length - 1 - i))) & 0xffffffn), `ipio2[${i}]`);
  }
  // pi/2: 24-bit chunks from the units bit down
  const halfPi = pi >> BigInt(bits - (23 + 24 * (PIO2.length - 1)) + 1);
  for (let i = 0; i < PIO2.length; i++) {
    const chunk = Number((halfPi >> BigInt(24 * (PIO2.length - 1 - i))) & 0xffffffn);
    assert.equal(PIO2[i], dmath.scalbn(chunk, -(23 + 24 * i)), `pio2[${i}]`);
  }
});

test('pinned bit patterns: these values must stay the same in every engine and version', () => {
  const pinned = [
    ['sin', [1], '3feaed548f090cee'],
    ['sin', [1e22], 'bfeb453ab76bf397'],
    ['cos', [1000000], '3fedf9df9906d32c'],
    ['cos', [-2.5], 'bfe9a2f7ef858b7d'],
    ['tan', [1.3], '400cd11b1696e97e'],
    ['atan', [0.7], '3fe38b112d7bd4ad'],
    ['atan2', [1, -3], '40068f095fdf593c'],
    ['asin', [0.6], '3fe4978fa3269ee1'],
    ['acos', [-0.3], '3ffe0200bbc96ad8'],
    ['exp', [-3.7], '3f99511fc6871044'],
    ['exp', [700], '7f0d945df4f8ec8e'],
    ['log', [10], '40026bb1bbb55516'],
    ['log', [1e-310], 'c0864e69394d9508'],
    ['pow', [2.5, 1.4], '400cda9f9ee44672'],
    ['pow', [0.37, -7.25], '40951a88a67530a3'],
    ['hypot', [3.1, 4.2, 5.3], '401dc19fc0556584'],
  ];
  for (const [name, args, bits] of pinned) assert.equal(hex(dmath[name](...args)), bits, `${name}(${args})`);
});

test('sortV8Order calls a random comparator exactly like V8 sort does (same order, same draws)', () => {
  for (let trial = 0; trial < 400; trial++) {
    const n = trial % 40;
    const items = Array.from({ length: n }, (_, i) => ({ id: i, w: Math.floor((i * 7919) % 13) }));
    const ra = makeRng(trial), rb = makeRng(trial);
    const cmp = (r) => (p, q) => (q.w + (r() - 0.5) * 6) - (p.w + (r() - 0.5) * 6);
    const native = items.slice().sort(cmp(ra)).map((x) => x.id);
    const ours = sortV8Order(items.slice(), cmp(rb)).map((x) => x.id);
    assert.deepEqual(ours, native, `trial ${trial}`);
    assert.equal(ra(), rb(), 'the same number of draws');
  }
  assert.deepEqual(sortV8Order([3, 1, 2], (a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(sortV8Order([5, 4, 3, 2, 1, 0], (a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(sortV8Order([], (a, b) => a - b), []);
  assert.throws(() => sortV8Order(new Array(64).fill(0), (a, b) => a - b), RangeError);
});
