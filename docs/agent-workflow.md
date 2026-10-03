# Parallel agents and automatic integration

Each developer uses their own clone. Each task uses a separate branch and worktree.
The repository's default branch is `main`; agents submit complete tasks as PRs.
No human approval is required for ordinary task PRs. Automated checks are required.

## Start and submit a task

From a clean clone, use a unique developer/task name:

```powershell
git fetch origin
git worktree add -b codex/sebas/task-name ../dino-task-name origin/main
```

Run Claude or Codex in that worktree. Read AGENTS.md and directory specs, implement
the task, run `npm test`, and make focused commits. After the user authorizes pushing:

```powershell
git push -u origin codex/sebas/task-name
gh pr create --base main --title "Describe resulting behavior" --body-file pr-body.md
gh pr edit --add-label ready-to-merge
```

Use an untracked temporary body file outside the checkout. Agents should attach
created PRs to their Codex chat. The bot squash-merges one task into one main commit;
checkpoint commits remain on the task branch. Remove finished worktrees only after
confirming their work is merged and no local changes need preserving.

## Repository setup

1. Enable GitHub Actions. Protect `main`: require `Node 22 tests` from GitHub Actions
   (app ID 15368), require up-to-date branches, enforce the rule for administrators,
   require PRs with zero approving reviews, and disable force pushes/deletions.
   Also keep the active repository ruleset **Tested agent integration** on `main`,
   with the same strict required check and no bypass actors. The controller reads
   effective rules through GitHub's metadata API; it needs no administrator token.
   After verifying no bypass actors as an administrator, store the ruleset's
   `updated_at` value in Actions variable `INTEGRATION_RULESET_UPDATED_AT`. Any
   ruleset edit pauses integration until an administrator verifies and repins it.
   This approved snapshot covers bypass metadata GitHub hides from workflow tokens.
2. Create labels `ready-to-merge`, `integration-blocked`, `integration-repairing`,
   `integration-attempt-1`, and `integration-attempt-2`.
3. Set repository Actions variable `AUTOMERGE_ENABLED=true` to enable the controller.
4. Optional AI repair: run `claude setup-token` locally and save the token only in
   repository Actions secret `CLAUDE_CODE_OAUTH_TOKEN`. Set Actions variable
   `CLAUDE_REPAIR_ENABLED=true` after adding the secret. The repair workflow passes
   the GitHub workflow token explicitly, so a separate Claude GitHub App installation
   is unnecessary for this custom workflow. Repairs use the subscription allowance.

Only a repository administrator should enable these variables. No API key is
required. Tokens must never be pasted into chat, committed, or printed in logs.
Standard public-repository hosted runners are free under GitHub's current billing;
AI subscription limits still apply. There are no paid API fallbacks in this setup.

## How the controller works

PR events, CI/repair completion, manual dispatch, and a 15-minute schedule wake a
single controller. Ready labels persist the queue; Actions concurrency only prevents
simultaneous controllers. Eligible same-repository PRs are considered in creation
order; blocked tasks do not prevent later independent tasks from progressing.

The controller requires a collaborator with write access as PR author. It refuses
automation/configuration edits and validates branch protection before making changes.
It brings the task branch up to date, explicitly requests CI (workflow-token pushes
may leave PR workflows awaiting approval), and merges only a passing current
combined merge commit. CI runs on a temporary `integration/ci-pr-*` branch pointing
at GitHub's PR merge commit so the required check attaches to the exact candidate
GitHub will merge. Testing only the task head is insufficient. Candidate branches
are removed after their task merges; task branches are preserved.
The merge API guards the expected task SHA; strict branch protection guards against
main advancing between validation and merge.

Conflicts or failing CI may trigger at most two Claude repair attempts, each capped
at 25 turns/25 minutes. Claude edits the task candidate; deterministic steps rerun
tests, check protected paths, commit, and publish only that task branch. Independent
read-only CI must then pass before the controller merges. There is no automatic
approval based solely on Claude's own report.

When blocked, inspect the PR and repair/CI logs, clarify intent or fix the branch,
then remove `integration-blocked`. Reset attempt labels only when deliberately
giving a fixed task another repair budget. Never enable an API-billing fallback
without explicit authorization.

Find controller decisions in GitHub's **Actions > Integration queue** logs, test
results in **Actions > CI**, and repair details in **Actions > Integration repair**.
To wake the queue immediately, use the Integration queue workflow's **Run workflow**
button on `main`, or run `gh workflow run integration.yml --ref main`.

## Pause and limitations

Set `AUTOMERGE_ENABLED=false` to pause new integrations/repairs. Cancel already
running jobs too when an immediate stop is required. Disable scheduled controller
runs if the repository is idle and you want no periodic runner usage.

The existing tests cover headless behavior, not browser rendering or real Steam.
Browser gameplay smoke tests remain a separate follow-up. Passing checks cannot
prove that two features have compatible intent; ambiguous conflicts require input.
Binary assets require coordinated single-writer ownership.

Treat write-access collaborators as trusted: their task code can run in an AI repair
job that has credentials. Forks and outside authors are excluded from privileged
automation. Workflow/configuration changes require manual integration. No policy
here guarantees isolation from a malicious collaborator with repository write access.
