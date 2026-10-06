import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { requestPrograms } from '../src/client/core/programs.js';
import { WorldPost, usesPost } from '../src/client/core/worldPost.js';

/** A renderer double: programs become ready after a number of polls. */
function fakeRenderer({ parallel = true, pollsToReady = 3 } = {}) {
  const calls = [];
  const props = new Map();
  return {
    calls,
    extensions: { has: (n) => parallel && n === 'KHR_parallel_shader_compile' },
    properties: { get: (m) => props.get(m) ?? {} },
    compileAsync(scene) {
      calls.push('compile');
      scene.traverse((o) => {
        if (!o.material) return;
        let polls = 0;
        props.set(o.material, { currentProgram: { isReady: () => ++polls > pollsToReady } });
      });
      return Promise.resolve(scene);
    },
    setRenderTarget(t) { calls.push(`target:${t === null ? 'canvas' : t.name}`); },
  };
}
const sceneWith = (n) => {
  const objects = [{}, ...Array.from({ length: n }, (_, i) => ({ material: { id: i } }))];
  return { traverse(fn) { objects.forEach(fn); } };
};

test('the world draws into its own target only when scaled down or contact-shaded', () => {
  assert.equal(usesPost(1, 0), false);
  assert.equal(usesPost(1, 0.3), true);
  assert.equal(usesPost(0.8, 0), true);
  assert.equal(usesPost(0.9995, 0), false);
});

test('requestPrograms waits until every requested program is linked', async () => {
  const r = fakeRenderer({ pollsToReady: 4 });
  const started = Date.now();
  await requestPrograms(r, sceneWith(3), {});
  assert.deepEqual(r.calls, ['compile']);
  assert.ok(Date.now() - started >= 20, 'polled until the programs were ready');
});

test('requestPrograms does not wait forever without parallel shader compile', async () => {
  const r = fakeRenderer({ parallel: false, pollsToReady: 1e9 });
  await requestPrograms(r, sceneWith(2), {});
  assert.deepEqual(r.calls, ['compile']);
});

test('WorldPost compiles the AO pass for its own target and the output pass for the canvas', async () => {
  const r = fakeRenderer({ pollsToReady: 0 });
  const post = Object.create(WorldPost.prototype);
  Object.assign(post, { renderer: r, ao: { name: 'ao' }, output: { name: 'out' }, aoTarget: { name: 'aoTarget' } });
  await post.compile({});
  assert.deepEqual(r.calls, ['target:aoTarget', 'compile', 'target:canvas', 'target:canvas', 'compile', 'target:canvas']);
  post.aoTarget = null;   // contact shading off: no AO pass
  r.calls.length = 0;
  await post.compile({});
  assert.deepEqual(r.calls, ['target:canvas', 'compile', 'target:canvas']);
});

test('no client code toggles a light\'s visibility (the light count is part of every program)', () => {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js') && /\b\w*[lL]ight\w*\.visible\s*=[^=]/.test(readFileSync(path, 'utf8'))) found.push(path);
    }
  };
  walk(new URL('../src/client', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(found, [], 'a light joining or leaving the render list recompiles every lit material');
});
