# Parallel agents and automatic integration

Each developer uses their own clone. Each task uses a separate branch and worktree.
The repository's default branch is `main`; agents submit complete tasks as PRs.
No human approval is required for ordinary task PRs. Automated checks are required.

## Instructions at session start

The repository-root `AGENTS.md` is the shared source for Codex, Claude and Copilot.
Codex discovers it directly. Root `CLAUDE.md` imports it with `@AGENTS.md`.
Copilot discovers `.github/copilot-instructions.md`, which directs it to AGENTS.md
and includes the essential workflow itself. Keep Copilot custom instructions
enabled in the client. All these files are tracked and travel with clones/worktrees;
personal instruction files on one developer's computer are not required.

Start sessions inside the project or its feature worktree. If starting on `main`
or in the shared checkout, the agent must create an isolated feature worktree before
editing. If resuming a feature, reuse its existing worktree, branch and PR rather
than creating another PR. After pulling these instructions, restart existing
sessions or explicitly ask them to reread AGENTS.md.

Opening the finished feature's PR requires explicit push authorization under the
shared Git rule. Once authorized, the agent must submit the PR. The controller adds
`ready-to-merge` automatically after successful current-head PR CI for eligible
non-draft collaborator PRs; a local commit alone is not a submitted feature. A platform that
already creates a task PR should reuse it. Follow-up fixes remain in that one PR.

## Start and submit a task

Use `<agent>/<feature>`: `codex/new-dinos`, `claude/new-dinos` or
`copilot/new-dinos`. No developer-name segment is required. Choose a unique feature
slug when parallel agents use the same prefix. For example, a Claude task starts:

```powershell
git fetch origin
git worktree add -b claude/task-name ../dino-claude-task-name origin/main
```

Run `npm ci` in the new worktree: its `prepare` hook (`scripts/link-agent-skills.mjs`) links the
git-ignored `.agents/skills` to the tracked `.claude/skills`, so Codex finds the project skills
like Claude and Copilot do. Then run Claude or Codex in that worktree. Read AGENTS.md and directory specs, implement
the task, run `npm test`, and make focused commits. After the user authorizes pushing:

```powershell
git push -u origin claude/task-name
gh pr create --base main --title "Describe resulting behavior" --body-file pr-body.md
```

Use an untracked temporary body file outside the checkout. Agents should attach
created PRs to their Codex chat. The bot rebases the feature onto current main and
uses GitHub Rebase and merge, preserving feature commits in linear main history.
GitHub automatically deletes the remote PR branch after merging. Remove finished
local worktrees/branches only after confirming integration and that no local changes
need preserving; a rebase changes commit IDs, so ancestry checks alone are insufficient.

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
   `integration-rebasing`, `integration-rebase-conflict`, `integration-attempt-1`,
   and `integration-attempt-2`. Allow Rebase and merge, disable merge-commit/squash
   landing, and enable automatic deletion of merged PR branches.
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

When automatic integration is enabled, the controller enrolls open, non-draft PRs
targeting main from the same repository, authored by collaborators with write access,
after their latest current-head PR CI succeeds. It rechecks the head and eligibility
before adding `ready-to-merge` and continues immediately without relying on a bot
label event. Blocked PRs stay blocked; failed, pending, stale or unrelated CI cannot
enroll a PR. Ready-for-review transitions wake the controller after draft CI passes.
Manual dispatch also sweeps existing eligible PRs. Manual readiness labeling remains
available, but all existing exact merge-candidate and protection checks still apply.

The ready-to-merge label, CI/rebase/repair completion, and manual dispatch wake a
single controller. Ready labels persist the queue; Actions concurrency only prevents
simultaneous controllers. Eligible same-repository PRs are considered in creation
order; blocked tasks do not prevent later independent tasks from progressing.

The controller requires a collaborator with write access as PR author. It accepts all file paths and validates branch protection before making changes.
It rebases the task branch onto current main without running task code, then requests CI (workflow-token pushes
may leave PR workflows awaiting approval). It automatically approves only eligible
same-repository PR runs from `github-actions[bot]` for the exact task revision,
then merges only a passing current
combined merge commit. Normal PR CI records the tested merge SHA after all tests pass;
the controller requires that exact current candidate before merging. This avoids a
second test run for the same feature revision. Older runs without this record use a
temporary candidate branch as a compatibility fallback. Merged remote PR branches
are deleted automatically; local worktrees are kept until safe cleanup.
The merge API guards the expected task SHA; strict branch protection guards against
main advancing between validation and merge.

After a bot rebase or repair, or dispatching fallback candidate CI, a metadata-only job waits for the newly published
head's CI (the current combined candidate for fallback runs) and explicitly wakes integration on completion. This avoids relying on
chained workflow completion events, which GitHub may suppress. It uses no AI and
does not execute feature code. The wait stops after 17 minutes and holds the PR
with an explanatory comment if CI never finishes; it does not poll while idle.
A new rebase/repair reservation stops the previous CI wait so the queued replacement
can start when main advances during integration.

Conflicts or failing CI may trigger at most two Claude repair attempts, each capped
at 25 turns/25 minutes. Claude resolves each pending rebase conflict and continues
the rebase without skipping commits; deterministic steps rerun
tests, commit, and publish only that task branch. Independent
read-only CI must then pass before the controller merges. There is no automatic
approval based solely on Claude's own report.

Rebasing rewrites feature commit IDs. Publishing uses an exact reserved-head
`--force-with-lease`, so concurrent pushes are rejected instead of overwritten.
The integration workflows never rewrite main. A conflict during deterministic
rebase holds the same PR for optional AI repair or a local agent; clean rebases do
not need AI credentials. After a local conflict fix, remove the rebase-conflict
label and keep using the same PR.

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
running jobs too when an immediate stop is required. There are no scheduled queue runs while the repository is idle.

The existing tests cover headless behavior, not browser rendering or real Steam.
Browser gameplay smoke tests remain a separate follow-up. Passing checks cannot
prove that two features have compatible intent; ambiguous conflicts require input.
Binary assets require coordinated single-writer ownership.

Treat write-access collaborators as trusted: their task code can run in an AI repair
job that has credentials. Forks and outside authors are excluded from privileged
automation. All file paths, including workflow/configuration and agent instructions,
are eligible for automatic integration after required checks. No policy
here guarantees isolation from a malicious collaborator with repository write access.
