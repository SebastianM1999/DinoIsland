'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const awaitCi = require('./await-task-ci.cjs');
const head = 'a'.repeat(40);
const candidate = 'b'.repeat(40);
const name = 'owner/game';
function fixture({ frames, maxWaitMs = 30, pollMs = 10, candidateOnly = false, useDefaultBudget = false }) {
  let index = 0;
  let clock = 0;
  const dispatches = [];
  const holds = [];
  const comments = [];
  const pr = { number: 1, state: 'open', draft: false, labels: [{ name: 'ready-to-merge' }],
    base: { ref: 'main', repo: { full_name: name } }, head: { sha: head, repo: { full_name: name } },
    user: { login: 'writer' }, merge_commit_sha: candidate };
  const frame = () => frames[Math.min(index, frames.length - 1)];
  const run = (overrides = {}) => ({ id: 1, head_sha: head, head_repository: { full_name: name },
    event: 'pull_request', pull_requests: [{ number: 1 }], status: 'in_progress', conclusion: null, ...overrides });
  const github = { rest: {
    pulls: { get: async () => ({ data: { ...pr, ...frame().pr } }) },
    repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: frame().permission || 'write' } }) },
    actions: { listWorkflowRuns: () => {}, createWorkflowDispatch: async args => dispatches.push(args) },
    issues: { addLabels: async args => holds.push(args), createComment: async args => comments.push(args) }
  }, paginate: async (_method, args) => (frame().runs || []).map(run).filter(item => item.head_sha === args.head_sha) };
  return { run, dispatches, holds, comments, start: () => awaitCi({ github, context: { repo: { owner: 'owner', repo: 'game' } },
    core: { info() {} }, prNumber: 1, expectedHead: head, ...(useDefaultBudget ? {} : { maxWaitMs }), pollMs, candidateOnly,
    now: () => clock, sleep: async ms => { clock += ms; index++; } }), clock: () => clock };
}
test('pending task CI wakes once when success completes', async () => {
  const f = fixture({ frames: [{ runs: [{}] }, { runs: [{}] }, { runs: [{ status: 'completed', conclusion: 'success' }] }] });
  assert.match(await f.start(), /Task CI completed/);
  assert.equal(f.dispatches.length, 1);
  assert.deepEqual(f.dispatches[0], { owner: 'owner', repo: 'game', workflow_id: 'integration.yml', ref: 'main' });
});
test('stale task and candidate runs cannot finish the wait; missing candidate wakes once', async () => {
  const f = fixture({ frames: [{ runs: [{ head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success' }] }] });
  assert.match(await f.start(), /timed out/);
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.holds.length, 1);
  assert.equal(f.comments.length, 1);
  assert.equal(f.clock(), 30);
});
test('head change wakes controller once', async () => {
  const f = fixture({ frames: [{ pr: { head: { sha: candidate, repo: { full_name: name } } } }] });
  assert.match(await f.start(), /Head changed/);
  assert.equal(f.dispatches.length, 1);
});
test('closed PR stops without waking', async () => {
  const f = fixture({ frames: [{ pr: { state: 'closed' } }] });
  assert.match(await f.start(), /closed/);
  assert.equal(f.dispatches.length, 0);
});
test('approval wake occurs only once per run, then cancellation wakes controller', async () => {
  const approval = { status: 'completed', conclusion: 'action_required' };
  const fallback = { id: 2, head_sha: candidate, event: 'workflow_dispatch', status: 'in_progress' };
  const f = fixture({ frames: [{ runs: [approval, fallback] }, { runs: [approval, fallback] },
    { runs: [{ status: 'completed', conclusion: 'cancelled' }] }] });
  assert.match(await f.start(), /Task CI completed/);
  assert.equal(f.dispatches.length, 2);
});
test('pending candidate finishes and dispatches only at completion', async () => {
  const f = fixture({ frames: [{ runs: [{ head_sha: candidate, event: 'workflow_dispatch' }] },
    { runs: [{ head_sha: candidate, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure' }] }] });
  assert.match(await f.start(), /Candidate CI completed/);
  assert.equal(f.dispatches.length, 1);
});
test('pending timeout holds PR without repeated dispatch or exceeding deadline', async () => {
  const f = fixture({ frames: [{ runs: [{}] }], maxWaitMs: 25 });
  assert.match(await f.start(), /timed out/);
  assert.equal(f.clock(), 25);
  assert.equal(f.dispatches.length, 0);
  assert.equal(f.holds.length, 1);
  assert.match(f.comments[0].body, /manually run integration.yml/);
});

test('the default deadline allows long CI and still holds the PR at exactly 27 minutes', async () => {
  const f = fixture({ frames: [{ runs: [{}] }], useDefaultBudget: true, pollMs: 17 * 60000 });
  assert.match(await f.start(), /timed out/);
  assert.equal(f.clock(), 27 * 60000);
  assert.equal(f.dispatches.length, 0);
  assert.equal(f.holds.length, 1);
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /within 27 minutes/);
});

test('CI completes within the helper budget and every metadata job leaves time for a timeout hold', async () => {
  const f = fixture({ frames: [{ runs: [{}] }], useDefaultBudget: true, pollMs: 60 * 60000 });
  await f.start();
  const waitMinutes = f.clock() / 60000;
  const timeout = (file, job) => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'workflows', file), 'utf8').split(/\r?\n/);
    const start = lines.indexOf(`  ${job}:`);
    assert.ok(start >= 0, `${file} has job ${job}`);
    const block = [];
    for (let i = start + 1; i < lines.length && !/^  [\w-]+:/.test(lines[i]); i++) block.push(lines[i]);
    const match = block.join('\n').match(/^    timeout-minutes: (\d+)$/m);
    assert.ok(match, `${file} ${job} declares a bounded timeout`);
    return Number(match[1]);
  };
  assert.ok(timeout('ci.yml', 'test') + 2 <= waitMinutes, 'helper outlasts the CI job with a startup margin');
  for (const [file, job] of [['integration.yml', 'await-candidate-ci'], ['integration-rebase.yml', 'await-ci'], ['integration-repair.yml', 'await-ci']]) {
    assert.ok(timeout(file, job) >= waitMinutes + 3, `${file} leaves setup and timeout reporting time`);
  }
});
test('ineligible author stops before dispatch', async () => {
  const f = fixture({ frames: [{ permission: 'read' }] });
  assert.match(await f.start(), /lacks write/);
  assert.equal(f.dispatches.length, 0);
});
test('foreign repository and wrong PR successes do not finish the wait', async () => {
  const f = fixture({ frames: [{ runs: [
    { status: 'completed', conclusion: 'success', head_repository: { full_name: 'other/game' } },
    { id: 2, status: 'completed', conclusion: 'success', pull_requests: [{ number: 2 }] }
  ] }] });
  assert.match(await f.start(), /timed out/);
  assert.equal(f.holds.length, 1);
});
test('latest matching CI run supersedes an older successful run', async () => {
  const f = fixture({ frames: [{ runs: [
    { status: 'completed', conclusion: 'success' }, { id: 2 }
  ] }] });
  assert.match(await f.start(), /timed out/);
  assert.equal(f.dispatches.length, 0);
});
test('invalid input rejects without querying GitHub', async () => {
  await assert.rejects(awaitCi({ prNumber: 1, expectedHead: 'short' }), /exact 40-character/);
});

test('a new rebase or repair reservation releases the old wait without blocking its queued workflow', async () => {
  for (const reservation of ['integration-rebasing', 'integration-repairing']) {
    const f = fixture({ frames: [{ runs: [{ status: 'completed', conclusion: 'action_required' }] },
      { pr: { labels: [{ name: 'ready-to-merge' }, { name: reservation }] } }] });
    assert.match(await f.start(), /supersedes/);
    assert.equal(f.dispatches.length, 1);
    assert.equal(f.holds.length, 0);
    assert.equal(f.clock(), 10);
  }
});


test('candidate handoff ignores completed normal CI until exact current candidate finishes', async () => {
  const normal = { status: 'completed', conclusion: 'success' };
  const fallback = { id: 2, head_sha: candidate, event: 'workflow_dispatch' };
  const f = fixture({ candidateOnly: true, frames: [{ runs: [normal, fallback] },
    { runs: [normal, { ...fallback, status: 'completed', conclusion: 'success' }] }] });
  assert.match(await f.start(), /Candidate CI completed/);
  assert.equal(f.clock(), 10);
  assert.equal(f.dispatches.length, 1);
});

test('candidate handoff follows a changed merge candidate without accepting old success', async () => {
  const next = 'c'.repeat(40);
  const old = { head_sha: candidate, event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const fallback = { id: 2, head_sha: next, event: 'workflow_dispatch' };
  const f = fixture({ candidateOnly: true, frames: [
    { pr: { merge_commit_sha: next }, runs: [old, fallback] },
    { pr: { merge_commit_sha: next }, runs: [old, { ...fallback, status: 'completed', conclusion: 'failure' }] }
  ] });
  assert.match(await f.start(), /Candidate CI completed/);
  assert.equal(f.clock(), 10);
  assert.equal(f.dispatches.length, 1);
});
