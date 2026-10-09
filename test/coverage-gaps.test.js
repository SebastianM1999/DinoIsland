import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { coverageGaps } from '../scripts/coverage-gaps.mjs';

test('coverage gaps identify failed paths without hiding functions or branches behind covered lines', () => {
  const root = path.resolve('fixture');
  const report = {
    [path.join(root, 'src', 'actions.js')]: {
      s: { 0: 0, 1: 1 },
      statementMap: { 0: { start: { line: 10 }, end: { line: 12 } }, 1: { start: { line: 20 }, end: { line: 20 } } },
      f: { 0: 0, 1: 2 },
      fnMap: { 0: { name: 'cancel', loc: { start: { line: 10 } } }, 1: { name: 'fire', loc: { start: { line: 20 } } } },
      b: { 0: [1, 0] },
      branchMap: { 0: { locations: [{ start: { line: 20 } }, { start: { line: 21 } }] } },
    },
  };
  const [gap] = coverageGaps(report, root);
  assert.equal(gap.file, 'src/actions.js');
  assert.deepEqual(gap.lines, [10, 11, 12]);
  assert.deepEqual(gap.functions, [{ name: 'cancel', line: 10 }]);
  assert.deepEqual(gap.branches, [{ line: 21 }]);
  assert.deepEqual(coverageGaps(report, root, ['unrelated']), []);
  assert.equal(coverageGaps(report, root, ['actions']).length, 1);
});
