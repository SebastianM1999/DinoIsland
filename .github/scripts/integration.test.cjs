'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const integrate = require('./integration.cjs');
const candidateSha = 'cccccccccccccccccccccccccccccccccccccccc';

function fixture(options = {}) {
  const calls = [];
  const pr = { number: 7, state: 'open', draft: false, created_at: '2026-01-01', user: { login: 'developer' },
    labels: ['ready-to-merge', ...(options.labels || [])].map(name => ({ name })),
    head: { sha: 'feature-sha', ref: 'codex/task', repo: { full_name: options.fork ? 'other/game' : 'owner/game' } },
    base: { ref: 'main', repo: { full_name: 'owner/game' } }, mergeable: true, mergeable_state: 'clean', merge_commit_sha: candidateSha, ...options.pr };
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
      approveWorkflowRun: wrap('approve', {}),
      listWorkflowRunArtifacts: wrap('artifacts', options.artifacts || []),
      listWorkflowRuns: wrap('runs', args => args.workflow_id === 'integration-rebase.yml' ? (options.rebaseRuns || []) :
        args.workflow_id === 'integration-repair.yml' ? (options.repairRuns || []) :
        (args.head_sha === 'feature-sha' ? (options.headRuns || []) :
          (options.runs || [{ id: 10, head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' }])))
    },
    git: { createRef: wrap('createRef', {}), getRef: wrap('getRef', args => ({ object: { sha: args.ref === `heads/${pr.head.ref}` ? (options.taskRefSha || 'advanced-head') : (options.existingCandidate || candidateSha) } })), deleteRef: wrap('deleteRef', {}) }
  }, paginate: async (method, args) => typeof method === 'string' ? (options.rules || [{ type: 'required_status_checks',
    parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'Node 22 tests', integration_id: 15368 }] },
    ruleset_source_type: 'Repository', ruleset_id: 24 }]) : (await method(args)).data,
    request: async (route, args) => { calls.push({ name: 'ruleset', args }); return { data: options.ruleset || { enforcement: 'active', bypass_actors: [], updated_at: '2026-10-03T00:00:00Z' } }; } };
  return { calls, run: async () => {
    const before = process.env.CLAUDE_REPAIR_ENABLED;
    const beforePin = process.env.INTEGRATION_RULESET_UPDATED_AT;
    process.env.CLAUDE_REPAIR_ENABLED = options.repairEnabled === false ? 'false' : 'true';
    process.env.INTEGRATION_RULESET_UPDATED_AT = options.pin === undefined ? '2026-10-03T00:00:00Z' : options.pin;
    try { await integrate({ github, context: { repo: { owner: 'owner', repo: 'game' } }, core: { info() {}, warning() {} } }); }
    finally {
      if (before === undefined) delete process.env.CLAUDE_REPAIR_ENABLED; else process.env.CLAUDE_REPAIR_ENABLED = before;
      if (beforePin === undefined) delete process.env.INTEGRATION_RULESET_UPDATED_AT; else process.env.INTEGRATION_RULESET_UPDATED_AT = beforePin;
    }
  } };
}
const mutations = calls => calls.filter(call => ['merge', 'update', 'dispatch', 'approve'].includes(call.name));

test('normal successful PR CI proves its exact merge candidate with an artifact and avoids duplicate CI', async () => {
  const normal = { id: 81, event: 'pull_request', head_sha: 'feature-sha', status: 'completed', conclusion: 'success',
    head_repository: { full_name: 'owner/game' }, pull_requests: [{ number: 7 }] };
  const f = fixture({ headRuns: [normal], runs: [], artifacts: [{ name: `tested-${candidateSha}`, expired: false }] });
  await f.run(); assert.deepEqual(mutations(f.calls).map(c => c.name), ['merge']);
  assert.equal(f.calls.find(c => c.name === 'artifacts').args.run_id, 81);
  assert.ok(!f.calls.some(c => c.name === 'runs' && c.args.head_sha === candidateSha));
  assert.ok(!f.calls.some(c => c.name === 'createRef'));
});
test('mismatched or expired PR CI artifacts cannot prove candidate safety', async () => {
  const normal = { id: 81, event: 'pull_request', head_sha: 'feature-sha', status: 'completed', conclusion: 'success',
    head_repository: { full_name: 'owner/game' }, pull_requests: [{ number: 7 }] };
  for (const artifacts of [[], [{ name: 'tested-old-commit', expired: false }], [{ name: `tested-${candidateSha}`, expired: true }]]) {
    const f = fixture({ headRuns: [normal], runs: [], artifacts }); await f.run();
    assert.deepEqual(mutations(f.calls).map(c => c.name), ['dispatch']);
    assert.ok(f.calls.some(c => c.name === 'createRef'));
  }
});
test('pending normal PR CI waits and failed normal PR CI requests repair', async () => {
  const normal = { id: 81, event: 'pull_request', head_sha: 'feature-sha', status: 'in_progress', conclusion: null,
    head_repository: { full_name: 'owner/game' }, pull_requests: [{ number: 7 }] };
  const olderPassed = { ...normal, id: 80, status: 'completed', conclusion: 'success' };
  const artifacts = [{ name: `tested-${candidateSha}`, expired: false }];
  const pending = fixture({ headRuns: [olderPassed, normal], artifacts }); await pending.run(); assert.deepEqual(mutations(pending.calls), []);
  const failed = fixture({ headRuns: [olderPassed, { ...normal, status: 'completed', conclusion: 'failure' }], artifacts }); await failed.run();
  assert.equal(failed.calls.find(c => c.name === 'dispatch').args.workflow_id, 'integration-repair.yml');
  assert.ok(!failed.calls.some(c => c.name === 'merge'));
});

test('a bot PR approval request cannot override independently dispatched CI, but still requires a passing run', async () => {
  const approval = { id: 12, event: 'pull_request', head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'action_required' };
  const passed = { id: 11, event: 'workflow_dispatch', head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' };
  const good = fixture({ runs: [approval, passed] }); await good.run();
  assert.deepEqual(mutations(good.calls).map(c => c.name), ['merge']);
  const missing = fixture({ runs: [approval] }); await missing.run();
  assert.deepEqual(mutations(missing.calls).map(c => c.name), ['dispatch']);
  const failed = fixture({ runs: [approval, { ...passed, conclusion: 'failure' }] }); await failed.run();
  assert.equal(failed.calls.some(c => c.name === 'merge'), false);
  assert.equal(failed.calls.find(c => c.name === 'dispatch').args.workflow_id, 'integration-repair.yml');
});

test('merges a current passing collaborator task using an exact-head rebase guard', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(mutations(f.calls).map(c => c.name), ['merge']);
  assert.equal(f.calls.find(c => c.name === 'merge').args.sha, 'feature-sha');
  assert.equal(f.calls.find(c => c.name === 'merge').args.merge_method, 'rebase');
});
test('fails closed if required CI protection is missing or allows bypass', async () => {
  for (const protection of [ { enabled: false },
    { enabled: true, required_status_checks: { enforcement_level: 'non_admins', checks: [] } },
    { enabled: true, required_status_checks: { enforcement_level: 'everyone', checks: [{ context: 'Node 22 tests', app_id: 42 }] } } ]) {
    const f = fixture({ protection }); await assert.rejects(f.run(), /requires strict/); assert.deepEqual(mutations(f.calls), []);
  }
  const f = fixture({ rules: [{ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false,
    required_status_checks: [{ context: 'Node 22 tests', integration_id: 15368 }] }, ruleset_source_type: 'Repository', ruleset_id: 24 }] });
  await assert.rejects(f.run(), /requires strict/);
});
test('effective rules require an approved active ruleset and reject visible bypass actors', async () => {
  for (const ruleset of [{ enforcement: 'evaluate', bypass_actors: [], updated_at: '2026-10-03T00:00:00Z' },
    { enforcement: 'active', bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5 }], updated_at: '2026-10-03T00:00:00Z' }]) {
    const f = fixture({ ruleset }); await assert.rejects(f.run(), /no bypass actors/); assert.deepEqual(mutations(f.calls), []);
  }
  const absent = fixture({ rules: [] }); await assert.rejects(absent.run(), /no bypass actors/);
});
test('an exact administrator-approved timestamp permits hidden bypass metadata but any changed or missing pin blocks', async () => {
  const approved = fixture({ ruleset: { enforcement: 'active', updated_at: '2026-10-03T00:00:00Z' } });
  await approved.run(); assert.equal(mutations(approved.calls)[0].name, 'merge');
  for (const options of [{ pin: '' }, { pin: '2026-10-02T00:00:00Z' },
    { ruleset: { enforcement: 'active', bypass_actors: [], updated_at: '2026-10-03T00:01:00Z' } }]) {
    const f = fixture(options); await assert.rejects(f.run(), /approved unchanged/); assert.deepEqual(mutations(f.calls), []);
  }
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
test('reserves an exact-head deterministic rebase when a task is behind main', async () => {
  const f = fixture({ behind: true }); await f.run();
  assert.deepEqual(mutations(f.calls).map(c => c.name), ['dispatch']);
  const dispatch = f.calls.find(c => c.name === 'dispatch');
  assert.equal(dispatch.args.workflow_id, 'integration-rebase.yml');
  assert.equal(dispatch.args.ref, 'main');
  assert.deepEqual(dispatch.args.inputs, { pr_number: '7', expected_head_sha: 'feature-sha' });
  const reservation = f.calls.find(c => c.name === 'labels');
  assert.deepEqual(reservation.args.labels, ['integration-rebasing']);
  assert.ok(f.calls.indexOf(reservation) < f.calls.indexOf(dispatch));
  assert.ok(!f.calls.some(c => c.name === 'update'));
});
test('active rebase reservations suppress duplicates and abandoned reservations recover', async () => {
  const current = fixture({ behind: true, labels: ['integration-rebasing'] }); await current.run();
  assert.deepEqual(mutations(current.calls), []);
  const events = [{ event: 'labeled', label: { name: 'integration-rebasing' }, created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }];
  const active = fixture({ behind: true, labels: ['integration-rebasing'], events, rebaseRuns: [{ status: 'in_progress' }] });
  await active.run(); assert.deepEqual(mutations(active.calls), []);
  const abandoned = fixture({ behind: true, labels: ['integration-rebasing'], events }); await abandoned.run();
  assert.equal(abandoned.calls.find(c => c.name === 'removeLabel').args.name, 'integration-rebasing');
  assert.equal(abandoned.calls.find(c => c.name === 'dispatch').args.workflow_id, 'integration-rebase.yml');
});
test('rebase conflicts hold without retries or invoke optional bounded repair', async () => {
  const held = fixture({ behind: true, repairEnabled: false, labels: ['integration-rebase-conflict'] });
  await held.run(); assert.deepEqual(mutations(held.calls), []);
  const repair = fixture({ behind: true, labels: ['integration-rebase-conflict'] }); await repair.run();
  assert.equal(repair.calls.find(c => c.name === 'dispatch').args.workflow_id, 'integration-repair.yml');
  const exhausted = fixture({ labels: ['integration-rebase-conflict', 'integration-attempt-2'] }); await exhausted.run();
  assert.deepEqual(mutations(exhausted.calls), []);
  assert.ok(exhausted.calls.some(c => c.name === 'labels' && c.args.labels.includes('integration-blocked')));
});
test('rebase dispatch failure releases the reservation', async () => {
  const f = fixture({ behind: true, errors: { dispatch: new Error('unavailable') } });
  await assert.rejects(f.run(), /unavailable/);
  assert.equal(f.calls.find(c => c.name === 'removeLabel').args.name, 'integration-rebasing');
});
test('task-head success never substitutes for synthetic-candidate CI', async () => {
  const f = fixture({ runs: [{ id: 99, head_sha: 'feature-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' }] });
  await f.run(); assert.deepEqual(mutations(f.calls).map(c => c.name), ['dispatch']);
  assert.ok(f.calls.some(c => c.name === 'runs' && c.args.head_sha === candidateSha));
  assert.equal(f.calls.find(c => c.name === 'createRef').args.sha, candidateSha);
  assert.equal(f.calls.find(c => c.name === 'dispatch').args.ref, 'integration/ci-pr-7-cccccccccccccccc');
});
test('approves only GitHub Actions exact-head CI for the validated same-repository PR', async () => {
  const approval = { id: 71, event: 'pull_request', head_sha: 'feature-sha', conclusion: 'action_required', actor: { login: 'github-actions[bot]' },
    head_repository: { full_name: 'owner/game' }, pull_requests: [{ number: 7 }] };
  const good = fixture({ headRuns: [approval] }); await good.run();
  assert.deepEqual(mutations(good.calls).map(c => c.name), ['approve']);
  assert.equal(good.calls.find(c => c.name === 'approve').args.run_id, 71);
  for (const change of [{ head_sha: 'old-sha' }, { event: 'workflow_dispatch' }, { actor: { login: 'outsider' } },
    { head_repository: { full_name: 'other/game' } }, { pull_requests: [{ number: 8 }] }, { pull_requests: [] }]) {
    const f = fixture({ headRuns: [{ ...approval, ...change }] }); await f.run();
    assert.ok(!f.calls.some(c => c.name === 'approve'));
  }
  for (const options of [{ fork: true }, { permission: 'read' }, { files: [{ filename: 'AGENTS.md' }] }, { behind: true }]) {
    const f = fixture({ ...options, headRuns: [approval] }); await f.run(); assert.ok(!f.calls.some(c => c.name === 'approve'));
  }
});
test('missing or invalid merge candidate waits without accepting head checks', async () => {
  for (const merge_commit_sha of [null, 'invalid']) {
    const f = fixture({ pr: { merge_commit_sha } }); await f.run(); assert.deepEqual(mutations(f.calls), []);
  }
});
test('existing candidate branch is reused only if it points to the exact candidate', async () => {
  const exists = Object.assign(new Error('already exists'), { status: 422 });
  const f = fixture({ runs: [], errors: { createRef: exists } }); await f.run();
  assert.equal(f.calls.find(c => c.name === 'dispatch').args.ref, 'integration/ci-pr-7-cccccccccccccccc');
  const mismatch = fixture({ runs: [], errors: { createRef: exists }, existingCandidate: 'wrong-commit' });
  await assert.rejects(mismatch.run(), /unexpected commit/); assert.ok(!mismatch.calls.some(c => c.name === 'dispatch'));
});
test('successful merge cleans up only its exact candidate ref', async () => {
  const f = fixture(); await f.run();
  assert.equal(f.calls.find(c => c.name === 'deleteRef').args.ref, 'heads/integration/ci-pr-7-cccccccccccccccc');
  const changed = fixture({ existingCandidate: 'wrong-commit' }); await changed.run();
  assert.ok(!changed.calls.some(c => c.name === 'deleteRef'));
});
test('pending or wrong-head CI never allows a merge', async () => {
  const pending = fixture({ runs: [{ id: 11, head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'in_progress' }] });
  await pending.run(); assert.deepEqual(mutations(pending.calls), []);
  const wrong = fixture({ runs: [{ id: 11, head_sha: 'old-sha', head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' }] });
  await wrong.run(); assert.deepEqual(mutations(wrong.calls).map(c => c.name), ['dispatch']);
});
test('latest failed run wins over older success and reserves a bounded repair', async () => {
  const f = fixture({ runs: [
    { id: 10, head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'success' },
    { id: 11, head_sha: candidateSha, head_repository: { full_name: 'owner/game' }, status: 'completed', conclusion: 'failure' }
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
  const comment = { body: '<!-- integration-ci:' + candidateSha + ' -->', created_at: new Date().toISOString(), user: { login: 'github-actions[bot]' } };
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
    head: { sha: 'feature-sha', ref: 'codex/second', repo: { full_name: 'owner/game' } }, base: { ref: 'main', repo: { full_name: 'owner/game' } }, mergeable: true, mergeable_state: 'clean', merge_commit_sha: candidateSha };
  const f = fixture({ repairEnabled: false, pr: { mergeable: false, mergeable_state: 'dirty' }, otherPrs: [second] });
  await f.run(); assert.equal(f.calls.find(c => c.name === 'merge').args.pull_number, 8);
});

test('successful API merge deletes only its unchanged integrated feature ref', async () => {
  const f = fixture({ taskRefSha: 'feature-sha' }); await f.run();
  const deletion = f.calls.find(c => c.name === 'deleteRef' && c.args.ref === 'heads/codex/task');
  assert.ok(deletion);
  assert.ok(f.calls.indexOf(deletion) > f.calls.findIndex(c => c.name === 'merge'));
});

test('advanced feature refs survive post-merge cleanup', async () => {
  const f = fixture({ taskRefSha: 'newer-work' }); await f.run();
  assert.ok(!f.calls.some(c => c.name === 'deleteRef' && c.args.ref === 'heads/codex/task'));
});

test('post-merge feature cleanup never deletes main', async () => {
  const f = fixture({ taskRefSha: 'feature-sha', pr: { head: { sha: 'feature-sha', ref: 'main', repo: { full_name: 'owner/game' } } } }); await f.run();
  assert.ok(!f.calls.some(c => c.name === 'deleteRef' && c.args.ref === 'heads/main'));
});
