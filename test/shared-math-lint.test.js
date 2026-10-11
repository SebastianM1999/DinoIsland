// Code that client and server must agree on bit for bit (src/shared, and the client code whose numbers key or fill the
// Hollow Mountain bake) uses src/shared/dmath.js, never the engine's transcendental Math functions: they differ in the
// last bit between V8 versions and between browsers, and the island generator turns such bits into other islands.
// Also rejects `**` with any exponent but a literal 2 (x ** 2 is exactly x * x everywhere; other exponents are pow) and
// sort comparators that draw random numbers (their result depends on the engine's sort algorithm: use one key per
// element or sortV8Order).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = fs.readdirSync(path.join(ROOT, 'src/shared')).filter((f) => f.endsWith('.js') && f !== 'dmath.js').map((f) => `src/shared/${f}`);
/** client modules that run in scripts/bakeCave.mjs or compute the bake's paint probe / light source keys */
const BAKE_CLIENT = ['caveTerrain.js', 'caveLight.js', 'caveStyle.js', 'caveSky.js', 'caveVolumeMesh.js'].map((f) => `src/client/world/${f}`);

const ENGINE_MATH = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/;
const POW_OP = /\*\*\s*(?!2\b)[^\s]/;
const RANDOM_SORT = /\.sort\(\s*(\([^)]*\)|\w+)\s*=>[^;]*?\b(rng\w*|random)\s*\(/;

/** The code without comments, strings and template literal text (replaced by spaces, line numbers kept). */
function codeOnly(src) {
  let out = '', i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? src.length : e; out += blank(src.slice(i, j)); i = j; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out += blank(src.slice(i, j)); i = j; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += c + blank(src.slice(i + 1, j)) + c; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

function offences(file) {
  const lines = codeOnly(fs.readFileSync(path.join(ROOT, file), 'utf8')).split('\n');
  const found = [];
  lines.forEach((line, k) => {
    if (ENGINE_MATH.test(line)) found.push(`${file}:${k + 1}: engine ${line.match(ENGINE_MATH)[0]}, use dmath`);
    if (POW_OP.test(line)) found.push(`${file}:${k + 1}: \`**\` with an exponent other than 2, use dmath.pow or multiply`);
    if (RANDOM_SORT.test(line)) found.push(`${file}:${k + 1}: sort comparator drawing random numbers`);
  });
  return found;
}

test('shared and bake code use dmath, not the engine\'s transcendental Math functions', () => {
  const found = [...SHARED, ...BAKE_CLIENT].flatMap(offences);
  assert.deepEqual(found, [], `engine-dependent math:\n${found.join('\n')}`);
});

test('the lint finds what it should and ignores comments and strings', () => {
  const probe = (src) => {
    const lines = codeOnly(src).split('\n');
    return lines.filter((l) => ENGINE_MATH.test(l) || POW_OP.test(l) || RANDOM_SORT.test(l)).length;
  };
  assert.equal(probe('const a = Math.sin(x);'), 1);
  assert.equal(probe('const a = Math.hypot(x, y);'), 1);
  assert.equal(probe('const a = x ** 3;'), 1);
  assert.equal(probe('const a = rng() ** 1.4;'), 1);
  assert.equal(probe('const a = (x - 1) ** 2;'), 0);
  assert.equal(probe('hosts.sort(() => rng() - 0.5);'), 1);
  assert.equal(probe('a.sort((p, q) => p.w + (rng() - 0.5) - q.w);'), 1);
  assert.equal(probe('a.sort((p, q) => p.w - q.w);'), 0);
  assert.equal(probe('const a = dmath.sin(x) + Math.sqrt(y) + Math.PI;'), 0);
  assert.equal(probe('/** Math.sin is banned */\n// Math.cos too\nconst s = "Math.exp(1) ** 3";'), 0);
});
