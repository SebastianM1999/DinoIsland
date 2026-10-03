'use strict';

// Loaded from trusted main; this helper only observes metadata and wakes the controller.
module.exports = async function awaitTaskCi({ github, context, core, prNumber, expectedHead,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  maxWaitMs = 17 * 60 * 1000, pollMs = 15000 }) {
  const sha = value => /^[a-f0-9]{40}$/i.test(value || '');
  if (!Number.isSafeInteger(Number(prNumber)) || Number(prNumber) <= 0 || !sha(expectedHead)) {
    throw new Error('A positive PR number and exact 40-character head SHA are required.');
  }
  if (!(maxWaitMs > 0) || !(pollMs > 0)) throw new Error('Wait and poll durations must be positive.');
  const repo = context.repo;
  const fullName = `${repo.owner}/${repo.repo}`;
  const api = github.rest;
  const wake = async reason => {
    await api.actions.createWorkflowDispatch({ ...repo, workflow_id: 'integration.yml', ref: 'main' });
    core.info(`PR ${prNumber}: ${reason}`);
  };
  const approvals = new Set();
  const requested = new Set();
  const started = now();
  for (;;) {
    const pr = (await api.pulls.get({ ...repo, pull_number: Number(prNumber) })).data;
    if (pr.state !== 'open') return 'PR closed; no controller dispatch needed.';
    const labels = new Set(pr.labels.map(label => label.name));
    if (pr.draft || pr.base.ref !== 'main' || pr.head.repo?.full_name !== fullName
      || pr.base.repo?.full_name !== fullName || !labels.has('ready-to-merge')
      || labels.has('integration-blocked')) return 'PR no longer eligible; stopped.';
    if (labels.has('integration-rebasing') || labels.has('integration-repairing')) {
      return 'New integration reservation supersedes this CI wait; stopped.';
    }
    const permission = (await api.repos.getCollaboratorPermissionLevel({ ...repo, username: pr.user.login })).data.permission;
    if (!['write', 'maintain', 'admin'].includes(permission)) return 'Author lacks write permission; stopped.';
    if (pr.head.sha !== expectedHead) {
      await wake('Head changed; controller must revalidate the new revision.');
      return 'Head changed; controller dispatched.';
    }
    const runsFor = async head => (await github.paginate(api.actions.listWorkflowRuns,
      { ...repo, workflow_id: 'ci.yml', head_sha: head, per_page: 100 }))
      .filter(run => run.head_sha === head && run.head_repository?.full_name === fullName);
    const newest = runs => runs.sort((a, b) => b.id - a.id)[0];
    const normal = newest((await runsFor(expectedHead)).filter(run => run.event === 'pull_request'
      && run.pull_requests?.some(pull => pull.number === Number(prNumber))));
    let pending = false;
    if (normal?.status === 'completed' && normal.conclusion !== 'action_required') {
      await wake(`CI run ${normal.id} completed (${normal.conclusion}).`);
      return 'Task CI completed; controller dispatched.';
    }
    if (normal?.conclusion === 'action_required') {
      pending = true;
      if (!approvals.has(normal.id)) {
        await wake(`CI run ${normal.id} needs approval; controller will validate it.`);
        approvals.add(normal.id);
      }
    } else if (normal) pending = true;
    const candidate = pr.merge_commit_sha;
    if (!pending && sha(candidate)) {
      const fallback = newest((await runsFor(candidate)).filter(run => run.event === 'workflow_dispatch'));
      if (fallback?.status === 'completed' && fallback.conclusion !== 'action_required') {
        await wake(`Candidate CI run ${fallback.id} completed (${fallback.conclusion}).`);
        return 'Candidate CI completed; controller dispatched.';
      }
      if (!fallback && !requested.has(candidate)) {
        await wake(`No CI exists for candidate ${candidate}; controller will request it.`);
        requested.add(candidate);
      }
    }
    const remaining = maxWaitMs - (now() - started);
    if (remaining <= 0) {
      await api.issues.addLabels({ ...repo, issue_number: Number(prNumber), labels: ['integration-blocked'] });
      await api.issues.createComment({ ...repo, issue_number: Number(prNumber),
        body: `Automatic integration paused: CI for task head ${expectedHead} did not complete within ${Math.round(maxWaitMs / 60000)} minutes. Inspect the CI runs, approve or rerun them if needed, then remove integration-blocked and manually run integration.yml to resume.` });
      return 'CI wait timed out; PR held for manual action.';
    }
    await sleep(Math.min(pollMs, remaining));
  }
};
