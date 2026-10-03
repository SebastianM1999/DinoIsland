'use strict';

// Runs only from trusted main. Pull-request source is never loaded by this controller.
async function validateProtection(github, repo) {
  const branch = (await github.rest.repos.getBranch({ ...repo, branch: 'main' })).data;
  const checks = branch.protection?.required_status_checks;
  if (!branch.protected || !branch.protection?.enabled || checks?.enforcement_level !== 'everyone'
    || !checks.checks?.some(check => check.context === 'Node 22 tests' && check.app_id === 15368)) {
    throw new Error('Integration requires strict Node 22 tests from GitHub Actions and protection enforced for admins.');
  }
  // The default Actions token cannot inspect classic branch-protection administration or GraphQL
  // rules. Effective branch rules and repository rulesets expose the necessary policy via REST.
  const rules = await github.paginate('GET /repos/{owner}/{repo}/rules/branches/{branch}', { ...repo, branch: 'main', per_page: 100 });
  const candidates = rules.filter(rule => rule.type === 'required_status_checks'
    && rule.parameters?.strict_required_status_checks_policy === true
    && rule.parameters.required_status_checks?.some(check => check.context === 'Node 22 tests' && check.integration_id === 15368)
    && rule.ruleset_source_type === 'Repository' && Number.isInteger(rule.ruleset_id));
  let enforced = false;
  const approvedTimestamp = process.env.INTEGRATION_RULESET_UPDATED_AT;
  for (const rule of candidates) {
    const ruleset = (await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}', { ...repo, ruleset_id: rule.ruleset_id })).data;
    // An administrator verifies an empty bypass list and pins this exact updated_at in a repository
    // variable. The default workflow token can read the timestamp but may not see bypass_actors.
    // Any policy edit invalidates that approval; a visible nonempty bypass list always fails closed.
    const bypassAcceptable = ruleset.bypass_actors === undefined
      || (Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length === 0);
    if (approvedTimestamp && ruleset.updated_at === approvedTimestamp && ruleset.enforcement === 'active' && bypassAcceptable) {
      enforced = true;
      break;
    }
  }
  if (!enforced) throw new Error('Integration requires strict Node 22 tests from GitHub Actions and an approved unchanged active ruleset with no bypass actors.');
  return branch;
}

module.exports = async function integrate({ github, context, core }) {
  const repo = context.repo;
  const api = github.rest;
  await validateProtection(github, repo);
  const pulls = await github.paginate(api.pulls.list, { ...repo, state: 'open', base: 'main', sort: 'created', direction: 'asc', per_page: 100 });
  const labels = pr => new Set(pr.labels.map(label => label.name));
  const block = async (pr, reason) => {
    await api.issues.addLabels({ ...repo, issue_number: pr.number, labels: ['integration-blocked'] });
    await api.issues.createComment({ ...repo, issue_number: pr.number, body: `Automatic integration paused: ${reason}` });
  };
  const dispatchCi = async pr => {
    const candidate = pr.merge_commit_sha;
    if (!/^[a-f0-9]{40}$/i.test(candidate || '')) return false;
    const candidateBranch = `integration/ci-pr-${pr.number}-${candidate.slice(0, 16)}`;
    const marker = `<!-- integration-ci:${candidate} -->`;
    const comments = await github.paginate(api.issues.listComments, { ...repo, issue_number: pr.number, per_page: 100 });
    // Allow recovery if dispatch failed or GitHub never created a run. Never trust a user-written marker.
    if (comments.some(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(marker)
      && Date.now() - Date.parse(c.created_at) < 10 * 60 * 1000)) return false;
    try {
      await api.git.createRef({ ...repo, ref: `refs/heads/${candidateBranch}`, sha: candidate });
    } catch (error) {
      if (error.status !== 422) throw error;
      const existing = (await api.git.getRef({ ...repo, ref: `heads/${candidateBranch}` })).data;
      if (existing.object.sha !== candidate) throw new Error('Integration candidate branch points to an unexpected commit.');
    }
    await api.actions.createWorkflowDispatch({ ...repo, workflow_id: 'ci.yml', ref: candidateBranch });
    await api.issues.createComment({ ...repo, issue_number: pr.number, body: `${marker}\nRequested CI for merge candidate ${candidate}.` });
    return true;
  };
  const repair = async (pr, reason) => {
    if (process.env.CLAUDE_REPAIR_ENABLED !== 'true') {
      core.info(`PR ${pr.number}: ${reason} Claude repair is disabled; configure its token and enable CLAUDE_REPAIR_ENABLED.`);
      return false;
    }
    const tags = labels(pr);
    if (tags.has('integration-repairing')) return false;
    if (tags.has('integration-attempt-2')) {
      await block(pr, `Two repair attempts were used. ${reason}`);
      return false;
    }
    const attempt = tags.has('integration-attempt-1') ? 2 : 1;
    await api.issues.addLabels({ ...repo, issue_number: pr.number, labels: [`integration-attempt-${attempt}`, 'integration-repairing'] });
    try {
      await api.actions.createWorkflowDispatch({ ...repo, workflow_id: 'integration-repair.yml', ref: 'main',
        inputs: { pr_number: String(pr.number), expected_head_sha: pr.head.sha } });
    } catch (error) {
      await api.issues.removeLabel({ ...repo, issue_number: pr.number, name: 'integration-repairing' });
      throw error;
    }
    return true;
  };
  for (const listed of pulls) {
    if (listed.draft || !labels(listed).has('ready-to-merge') || labels(listed).has('integration-blocked')) continue;
    const pr = (await api.pulls.get({ ...repo, pull_number: listed.number })).data;
    if (pr.state !== 'open' || pr.draft || !labels(pr).has('ready-to-merge') || labels(pr).has('integration-blocked')
      || pr.base.ref !== 'main' || pr.head.repo?.full_name !== pr.base.repo?.full_name) continue;
    const permission = (await api.repos.getCollaboratorPermissionLevel({ ...repo, username: pr.user.login })).data.permission;
    if (!['write', 'maintain', 'admin'].includes(permission)) { await block(pr, 'The author must have write permission.'); continue; }
    if (pr.changed_files > 3000) { await block(pr, 'The task exceeds GitHub\'s file-list limit and requires manual integration.'); continue; }
    const files = await github.paginate(api.pulls.listFiles, { ...repo, pull_number: pr.number, per_page: 100 });
    const protectedPath = name => /^(?:\.github\/|\.claude\/|AGENTS\.md$|CLAUDE\.md$|\.mcp\.json$)/i.test(name);
    if (files.some(file => protectedPath(file.filename) || (file.previous_filename && protectedPath(file.previous_filename)))) {
      await block(pr, 'Automation and agent-instruction changes require manual integration.');
      continue;
    }
    if (labels(pr).has('integration-repairing')) {
      const events = await github.paginate(api.issues.listEvents, { ...repo, issue_number: pr.number, per_page: 100 });
      const reservation = events.filter(event => event.event === 'labeled' && event.label?.name === 'integration-repairing')
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      if (!reservation || Date.now() - Date.parse(reservation.created_at) < 30 * 60 * 1000) continue;
      const repairRuns = await github.paginate(api.actions.listWorkflowRuns, { ...repo, workflow_id: 'integration-repair.yml', branch: 'main', per_page: 100 });
      if (repairRuns.some(run => run.status !== 'completed')) continue;
      await api.issues.removeLabel({ ...repo, issue_number: pr.number, name: 'integration-repairing' });
      pr.labels = pr.labels.filter(label => label.name !== 'integration-repairing');
    }
    if (labels(pr).has('integration-rebasing')) {
      const events = await github.paginate(api.issues.listEvents, { ...repo, issue_number: pr.number, per_page: 100 });
      const reservation = events.filter(event => event.event === 'labeled' && event.label?.name === 'integration-rebasing')
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      if (!reservation || Date.now() - Date.parse(reservation.created_at) < 30 * 60 * 1000) continue;
      const rebaseRuns = await github.paginate(api.actions.listWorkflowRuns, { ...repo, workflow_id: 'integration-rebase.yml', branch: 'main', per_page: 100 });
      if (rebaseRuns.some(run => run.status !== 'completed')) continue;
      await api.issues.removeLabel({ ...repo, issue_number: pr.number, name: 'integration-rebasing' });
      pr.labels = pr.labels.filter(label => label.name !== 'integration-rebasing');
    }
    if (labels(pr).has('integration-rebase-conflict')) {
      if (await repair(pr, 'Rebasing this task onto main has conflicts.')) return;
      continue;
    }
    if (pr.mergeable === null || !pr.mergeable_state || pr.mergeable_state === 'unknown') continue;
    if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
      if (await repair(pr, 'The branch has merge conflicts.')) return;
      continue;
    }
    const main = (await api.repos.getBranch({ ...repo, branch: 'main' })).data.commit.sha;
    const comparison = (await api.repos.compareCommits({ ...repo, base: pr.head.sha, head: main })).data;
    if (comparison.ahead_by > 0) {
      await api.issues.addLabels({ ...repo, issue_number: pr.number, labels: ['integration-rebasing'] });
      try {
        await api.actions.createWorkflowDispatch({ ...repo, workflow_id: 'integration-rebase.yml', ref: 'main',
          inputs: { pr_number: String(pr.number), expected_head_sha: pr.head.sha } });
      } catch (error) {
        await api.issues.removeLabel({ ...repo, issue_number: pr.number, name: 'integration-rebasing' });
        throw error;
      }
      // The deterministic worker rebases and publishes with an exact-head force-with-lease guard.
      return;
    }
    // GitHub may require approval for bot-created PR runs even after author and source checks.
    // Approve only this trusted same-repository PR's exact task-head CI from GitHub Actions.
    const headRuns = await github.paginate(api.actions.listWorkflowRuns, { ...repo, workflow_id: 'ci.yml', head_sha: pr.head.sha, per_page: 100 });
    const awaitingApproval = headRuns.filter(run => run.head_sha === pr.head.sha && run.event === 'pull_request'
      && run.conclusion === 'action_required' && run.actor?.login === 'github-actions[bot]'
      && run.head_repository?.full_name === pr.base.repo.full_name
      && run.pull_requests?.some(pull => pull.number === pr.number)).sort((a, b) => b.id - a.id)[0];
    if (awaitingApproval) {
      await api.actions.approveWorkflowRun({ ...repo, run_id: awaitingApproval.id });
      return;
    }
    const candidate = pr.merge_commit_sha;
    if (!/^[a-f0-9]{40}$/i.test(candidate || '')) continue;
    const normalRuns = headRuns.filter(run => run.head_sha === pr.head.sha && run.event === 'pull_request'
      && run.head_repository?.full_name === pr.base.repo.full_name
      && run.pull_requests?.some(pull => pull.number === pr.number))
      .sort((a, b) => b.id - a.id || (b.run_attempt || 1) - (a.run_attempt || 1));
    let candidateTested = false;
    if (normalRuns.length) {
      const latestNormal = normalRuns[0];
      if (latestNormal.status !== 'completed') continue;
      if (['failure', 'timed_out'].includes(latestNormal.conclusion)) {
        if (await repair(pr, 'CI failed.')) return;
        continue;
      }
      if (latestNormal.conclusion === 'success') {
        const artifacts = await github.paginate(api.actions.listWorkflowRunArtifacts, { ...repo, run_id: latestNormal.id, per_page: 100 });
        candidateTested = artifacts.some(artifact => artifact.name === `tested-${candidate}` && artifact.expired === false);
      }
    }
    if (!candidateTested) {
      const runs = await github.paginate(api.actions.listWorkflowRuns, { ...repo, workflow_id: 'ci.yml', head_sha: candidate, per_page: 100 });
      // A successful normal PR run proves its synthetic checkout through a CI-generated artifact.
      // Older runs without that artifact use candidate-branch CI; task-head success alone never substitutes.
      // A bot-triggered PR run can require approval without creating any CI jobs. It must not
      // supersede the independent workflow_dispatch CI we explicitly requested for this revision.
      // Actual test failures, cancellations and pending runs remain authoritative.
      const matching = runs.filter(run => run.head_sha === candidate && run.head_repository?.full_name === pr.base.repo.full_name
        && !(run.event === 'pull_request' && run.conclusion === 'action_required'))
        .sort((a, b) => b.id - a.id || (b.run_attempt || 1) - (a.run_attempt || 1));
      if (!matching.length) { if (await dispatchCi(pr)) return; continue; }
      const latest = matching[0];
      if (latest.status !== 'completed') continue;
      if (latest.conclusion !== 'success') {
        if (['failure', 'timed_out'].includes(latest.conclusion)) {
          if (await repair(pr, 'CI failed.')) return;
        } else if (await dispatchCi(pr)) return;
        continue;
      }
    }
    try {
      const result = await api.pulls.merge({ ...repo, pull_number: pr.number, sha: pr.head.sha, merge_method: 'rebase' });
      if (!result.data.merged) core.info(`PR ${pr.number}: GitHub declined the merge.`);
      else {
        const candidateBranch = `integration/ci-pr-${pr.number}-${candidate.slice(0, 16)}`;
        try {
          const existing = (await api.git.getRef({ ...repo, ref: `heads/${candidateBranch}` })).data;
          if (existing.object.sha === candidate) await api.git.deleteRef({ ...repo, ref: `heads/${candidateBranch}` });
        } catch (error) { core.info(`PR ${pr.number}: candidate branch cleanup deferred (${error.status || 'request error'}).`); }
      }
    } catch (error) {
      if (![405, 409, 422].includes(error.status)) throw error;
      core.info(`PR ${pr.number}: merge deferred because its head, checks, or protected base changed.`);
    }
    return;
  }
};
module.exports.validateProtection = validateProtection;
