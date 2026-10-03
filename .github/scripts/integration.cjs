'use strict';

// Runs only from trusted main. Pull-request source is never loaded by this controller.
async function validateProtection(github, repo) {
  const branch = (await github.rest.repos.getBranch({ ...repo, branch: 'main' })).data;
  const metadata = await github.graphql(`query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){ref(qualifiedName:"refs/heads/main"){branchProtectionRule{requiresStrictStatusChecks requiresStatusChecks isAdminEnforced requiredStatusCheckContexts}}}}`, repo);
  const rule = metadata.repository?.ref?.branchProtectionRule;
  const checks = branch.protection?.required_status_checks;
  if (!branch.protected || !branch.protection?.enabled || checks?.enforcement_level !== 'everyone'
    || !checks.checks?.some(check => check.context === 'Node 22 tests' && check.app_id === 15368)
    || !rule?.requiresStatusChecks || !rule.requiresStrictStatusChecks || !rule.isAdminEnforced
    || !rule.requiredStatusCheckContexts?.includes('Node 22 tests')) {
    throw new Error('Integration requires strict Node 22 tests from GitHub Actions and protection enforced for admins.');
  }
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
    const marker = `<!-- integration-ci:${pr.head.sha} -->`;
    const comments = await github.paginate(api.issues.listComments, { ...repo, issue_number: pr.number, per_page: 100 });
    // Allow recovery if dispatch failed or GitHub never created a run. Never trust a user-written marker.
    if (comments.some(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(marker)
      && Date.now() - Date.parse(c.created_at) < 10 * 60 * 1000)) return;
    await api.actions.createWorkflowDispatch({ ...repo, workflow_id: 'ci.yml', ref: pr.head.ref });
    await api.issues.createComment({ ...repo, issue_number: pr.number, body: `${marker}\nRequested CI for ${pr.head.sha}.` });
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
    if (pr.mergeable === null || !pr.mergeable_state || pr.mergeable_state === 'unknown') continue;
    if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
      if (await repair(pr, 'The branch has merge conflicts.')) return;
      continue;
    }
    const main = (await api.repos.getBranch({ ...repo, branch: 'main' })).data.commit.sha;
    const comparison = (await api.repos.compareCommits({ ...repo, base: pr.head.sha, head: main })).data;
    if (comparison.ahead_by > 0) {
      try {
        await api.pulls.updateBranch({ ...repo, pull_number: pr.number, expected_head_sha: pr.head.sha });
      } catch (error) {
        // A moving head or newly discovered conflict is retried from fresh state on the next run.
        if ([409, 422].includes(error.status)) { core.info(`PR ${pr.number}: branch update deferred.`); return; }
        throw error;
      }
      const updated = (await api.pulls.get({ ...repo, pull_number: pr.number })).data;
      await dispatchCi(updated);
      return;
    }
    const runs = await github.paginate(api.actions.listWorkflowRuns, { ...repo, workflow_id: 'ci.yml', head_sha: pr.head.sha, per_page: 100 });
    // A pull_request run's head_sha can differ from its checkout merge commit. Strict branch protection
    // is the final authority; this explicit run check additionally prevents bypassing failed/pending CI.
    const matching = runs.filter(run => run.head_sha === pr.head.sha && run.head_repository?.full_name === pr.base.repo.full_name)
      .sort((a, b) => b.id - a.id || (b.run_attempt || 1) - (a.run_attempt || 1));
    if (!matching.length) { await dispatchCi(pr); return; }
    const latest = matching[0];
    if (latest.status !== 'completed') continue;
    if (latest.conclusion !== 'success') {
      if (['failure', 'timed_out'].includes(latest.conclusion)) {
        if (await repair(pr, 'CI failed.')) return;
      } else { await dispatchCi(pr); return; }
      continue;
    }
    try {
      const result = await api.pulls.merge({ ...repo, pull_number: pr.number, sha: pr.head.sha, merge_method: 'squash' });
      if (!result.data.merged) core.info(`PR ${pr.number}: GitHub declined the merge.`);
    } catch (error) {
      if (![405, 409, 422].includes(error.status)) throw error;
      core.info(`PR ${pr.number}: merge deferred because its head, checks, or protected base changed.`);
    }
    return;
  }
};
module.exports.validateProtection = validateProtection;
