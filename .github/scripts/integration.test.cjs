'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const integrate = require('./integration.cjs');

function fixture(options = {}) {
  const calls = [];
  const pr = { number: 7, state: 'open', draft: false, created_at: '2026-01-01', user: { login: 'developer' },
    labels: ['ready-to-merge', ...(options.labels || [])].map(name => ({ name })),
    head: { sha: 'feature-sha', ref: 'codex/task', repo: { full_name: options.fork ? 'other/game' : 'owner/game' } },
    base: { ref: 'main', repo: { full_name: 'owner/game' } }, mergeable: true, mergeable_state: 'clean', ...options.pr };
  const wrap = (name, result) => async args => {
    calls.push({ name, args });
    if (options.errors?.[name]) throw options.errors[name];
    return { data: typeof result === 'function' ? result(args) : result };
  };
  const github = { rest: {
    repos: {
      getCollaboratorPermissionLevel: wrap('permission', { permission: options.permission || 'write' }),
      getBranch: wrap('main', { commit: { sha: 'main-sha' }, protected: true, protection: options.protection || { enabled: true, required_status_checks: { enforcement_level: 'everyone', checks: [{ context: 'Node 22 tests', app_id: 15368 }] } } }),
      compareCommits: wrap('compare', { ahead_by: options.behind ? 1 : 0 })
    },
    pulls: {
      list: wrap('list', [pr, ...(options.otherPrs || [])]), get: wrap('get', args => args.pull_number === pr.number ? pr : options.otherPrs.find(p => p.number === args.pull_number)), listFiles: wrap('files', options.files || [{ filename: 'src/sim/world.js' }]),
      updateBranch: wrap('update', {}), merge: wrap('merge', { merged: true })
    },
    issues: {
      addLabels: wrap('labels', {}), createComment: wrap('comment', {}), removeLabel: wrap('removeLabel', {}),
      listComments: wrap('comments', options.comments || []), listEvents: wrap('events', options.events || [])
    },
    actions: {
      createWorkflowDispatch: wrap('dispatch', {}),
      listWorkflowRuns: wrap('runs', args => args.workflow_id === 'integration-repair.yml' ? (options.repairRuns || []) :
        (options.runs || [{ id: 10, head_sha: 'feature-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' }]))
    }
  }, paginate: async (method, args) => (await method(args)).data,
    graphql: async () => ({ repository: { ref: { branchProtectionRule: options.rule || { requiresStrictStatusChecks: true, requiresStatusChecks: true, isAdminEnforced: true, requiredStatusCheckContexts: ['Node 22 tests'] } } } }) };
  return { calls, run: async () => {
    const before = process.env.CLAUDE_REPAIR_ENABLED;
    process.env.CLAUDE_REPAIR_ENABLED = options.repairEnabled === false ? 'false' : 'true';
    try { await integrate({ github, context: { repo: { owner: 'owner', repo: 'game' } }, core: { info() {} } }); }
    finally { if (before === undefined) delete process.env.CLAUDE_REPAIR_ENABLED; else process.env.CLAUDE_REPAIR_ENABLED = before; }
  } };
}
const mutations = calls => calls.filter(call => ['merge', 'update', 'dispatch'].includes(call.name));

test('merges a current passing collaborator task using an exact-head squash guard', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(mutations(f.calls).map(c => c.name), ['merge']);
  assert.equal(f.calls.find(c => c.name === 'merge').args.sha, 'feature-sha');
  assert.equal(f.calls.find(c => c.name === 'merge').args.merge_method, 'squash');
});
test('fails closed if required CI protection is missing or allows bypass', async () => {
  for (const protection of [ { enabled: false },
    { enabled: true, required_status_checks: { enforcement_level: 'non_admins', checks: [] } },
    { enabled: true, required_status_checks: { enforcement_level: 'everyone', checks: [{ context: 'Node 22 tests', app_id: 42 }] } } ]) {
    const f = fixture({ protection }); await assert.rejects(f.run(), /requires strict/); assert.deepEqual(mutations(f.calls), []);
  }
  const f = fixture({ rule: { requiresStrictStatusChecks: false, requiresStatusChecks: true, isAdminEnforced: true, requiredStatusCheckContexts: ['Node 22 tests'] } });
  await assert.rejects(f.run(), /requires strict/);
});
test('forks, drafts and blocked tasks never reach integration', async () => {
  for (const options of [{ fork: true }, { pr: { draft: true } }, { labels: ['integration-blocked'] }]) {
    const f = fixture(options); await f.run(); assert.deepEqual(mutations(f.calls), []);
  }
});
test('non-collaborator authors and automation changes are blocked before executing CI', async () => {
  for (const options of [{ permission: 'read' }, { files: [{ filename: '.github/workflows/ci.yml' }] },
    { files: [{ filename: 'ordinary.txt', previous_filename: 'AGENTS.md' }] }]) {
    const f = fixture(options); await f.run(); assert.deepEqual(mutations(f.calls), []);
    assert.ok(f.calls.some(c => c.name === 'labels' && c.args.labels.includes('integration-blocked')));
  }
});
test('updates a behind branch and explicitly dispatches CI instead of merging its stale success', async () => {
  const f = fixture({ behind: true }); await f.run();
  assert.deepEqual(mutations(f.calls).map(c => c.name), ['update', 'dispatch']);
  assert.equal(f.calls.find(c => c.name === 'update').args.expected_head_sha, 'feature-sha');
  assert.equal(f.calls.find(c => c.name === 'dispatch').args.workflow_id, 'ci.yml');
});
test('pending or wrong-head CI never allows a merge', async () => {
  const pending = fixture({ runs: [{ id: 11, head_sha: 'feature-sha', head_repository: { full_name: 'owner/game' }, status: 'in_progress' }] });
  await pending.run(); assert.deepEqual(mutations(pending.calls), []);
  const wrong = fixture({ runs: [{ id: 11, head_sha: 'old-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' }] });
  await wrong.run(); assert.deepEqual(mutations(wrong.calls).map(c => c.name), ['dispatch']);
});
test('latest failed run wins over older success and reserves a bounded repair', async () => {
  const f = fixture({ runs: [
    { id: 10, head_sha: 'feature-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' },
    { id: 11, head_sha: 'feature-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'failure' }
  ] }); await f.run();
  const reserve = f.calls.find(c => c.name === 'labels');
  assert.deepEqual(reserve.args.labels, ['integration-attempt-1', 'integration-repairing']);
  const dispatch = f.calls.find(c => c.name === 'dispatch');
  assert.equal(dispatch.args.workflow_id, 'integration-repair.yml');
  assert.equal(dispatch.args.ref, 'main');
  assert.deepEqual(dispatch.args.inputs, { pr_number: '7', expected_head_sha: 'feature-sha' });
  assert.ok(f.calls.indexOf(reserve) < f.calls.indexOf(dispatch));
});
test('conflicts repair twice then block, and active reservations cannot dispatch duplicates', async () => {
  const second = fixture({ labels: ['integration-attempt-1'], pr: { mergeable: false, mergeable_state: 'dirty' } });
  await second.run(); assert.ok(second.calls.some(c => c.name === 'labels' && c.args.labels.includes('integration-attempt-2')));
  const exhausted = fixture({ labels: ['integration-attempt-2'], pr: { mergeable: false, mergeable_state: 'dirty' } });
  await exhausted.run(); assert.deepEqual(mutations(exhausted.calls), []);
  assert.ok(exhausted.calls.some(c => c.name === 'labels' && c.args.labels.includes('integration-blocked')));
  const reserved = fixture({ labels: ['integration-repairing'] }); await reserved.run(); assert.deepEqual(mutations(reserved.calls), []);
});
test('unknown mergeability waits without spending a repair attempt', async () => {
  const f = fixture({ pr: { mergeable: null, mergeable_state: 'unknown' } }); await f.run(); assert.deepEqual(mutations(f.calls), []);
});
test('recent bot CI dispatch suppresses duplicates, while user comments cannot suppress CI', async () => {
  const comment = { body: '<!-- integration-ci:feature-sha -->', created_at: new Date().toISOString(), user: { login: 'github-actions[bot]' } };
  const f = fixture({ runs: [], comments: [comment] }); await f.run(); assert.deepEqual(mutations(f.calls), []);
  const forged = fixture({ runs: [], comments: [{ ...comment, user: { login: 'developer' } }] });
  await forged.run(); assert.equal(mutations(forged.calls)[0].name, 'dispatch');
});
test('a dispatch error releases its repairing reservation and preserves the attempt limit', async () => {
  const f = fixture({ pr: { mergeable: false, mergeable_state: 'dirty' }, errors: { dispatch: new Error('unavailable') } });
  await assert.rejects(f.run(), /unavailable/);
  assert.ok(f.calls.some(c => c.name === 'removeLabel' && c.args.name === 'integration-repairing'));
});
test('a concurrent protected-base or head change defers the merge', async () => {
  const f = fixture({ errors: { merge: Object.assign(new Error('out of date'), { status: 405 }) } });
  await f.run(); assert.deepEqual(mutations(f.calls).map(c => c.name), ['merge']);
});
test('disabled Claude repair preserves the attempt budget', async () => {
  const f = fixture({ repairEnabled: false, pr: { mergeable: false, mergeable_state: 'dirty' } });
  await f.run(); assert.deepEqual(mutations(f.calls), []); assert.ok(!f.calls.some(c => c.name === 'labels'));
});
test('an orphan repair reservation expires only after 30 minutes with no active repair runs', async () => {
  const events = [{ event: 'labeled', label: { name: 'integration-repairing' }, created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }];
  const f = fixture({ labels: ['integration-repairing'], events }); await f.run();
  assert.ok(f.calls.some(c => c.name === 'removeLabel'));
  assert.equal(mutations(f.calls)[0].name, 'merge');
  const active = fixture({ labels: ['integration-repairing'], events, repairRuns: [{ status: 'in_progress' }] });
  await active.run(); assert.deepEqual(mutations(active.calls), []); assert.ok(!active.calls.some(c => c.name === 'removeLabel'));
});
test('disabled repair on an older task does not starve a later passing task', async () => {
  const second = { number: 8, state: 'open', draft: false, user: { login: 'developer' }, labels: [{ name: 'ready-to-merge' }],
    head: { sha: 'feature-sha', ref: 'codex/second', repo: { full_name: 'owner/game' } }, base: { ref: 'main', repo: { full_name: 'owner/game' } }, mergeable: true, mergeable_state: 'clean' };
  const f = fixture({ repairEnabled: false, pr: { mergeable: false, mergeable_state: 'dirty' }, otherPrs: [second] });
  await f.run(); assert.equal(f.calls.find(c => c.name === 'merge').args.pull_number, 8);
});
