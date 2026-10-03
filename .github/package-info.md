# .github
> GitHub-hosted automation and repository integration configuration.

## Files
- `copilot-instructions.md` — automatically discovered Copilot repository instructions; points to root AGENTS.md and repeats the essential isolated-worktree, one-feature/one-PR workflow for clients that do not load AGENTS.md themselves.
- `workflows/ci.yml` — read-only CI for pull requests targeting `main`, pushes to `main`, merge-group candidates, and manual runs. Installs locked dependencies and runs the Node 22 test suite and submitted-diff whitespace/conflict-marker checks on Ubuntu.
- `workflows/integration.yml` — trusted-main controller, awakened by the ready-to-merge label, completed CI, explicit rebase/repair handoffs, and manual runs; no idle schedule. Does not execute PR source.
- `workflows/integration-repair.yml` — reserved same-repository task repair using Claude subscription credentials; validates eligibility, rebases onto main and continues resolved conflicts, repairs files, tests, publishes only the task branch, and wakes the controller for independent candidate CI.
- `workflows/integration-rebase.yml` — deterministic same-repository feature rebase onto current main, with exact-head reservation, trusted eligibility checks, disabled Git hooks and lease-guarded publication; holds conflicts for repair without running feature code.
- `scripts/integration.cjs` — durable ready-label queue controller; checks protection, collaborator eligibility, revision-specific CI, repair budgets, and guarded rebase-and-merge integration.
- `scripts/rebase.test.cjs` — real temporary-Git tests for clean rebasing, exact-head lease rejection and conflict preservation.
- `scripts/integration.test.cjs` — mocked integration safety tests, explicitly run by CI because default Node discovery skips hidden directories.
- `scripts/await-task-ci.cjs` — bounded metadata-only wait after a rebased/repaired head is published; explicitly dispatches integration on CI completion instead of relying on recursive workflow completion events.
- `scripts/await-task-ci.test.cjs` — fake-clock checks for pending/stale/head-changing CI, approval wakeups and timeout holds.

## Entry points
- GitHub Actions runs `CI / Node 22 tests`; use this stable check name when configuring required status checks.
- The normal `pull_request` checkout tests GitHub's combined merge candidate. Merge-group runs test the queue candidate when a native GitHub merge queue is available.

## Rules
- Feature branches use `<agent>/<feature>` (for example `claude/new-dinos`), without requiring a developer name. The controller accepts eligible feature branches regardless of prefix.
- CI has read-only repository permissions, no AI credentials, and no persisted checkout credentials.
- Use `npm ci` with the committed lockfile and Node 22. Electron's binary download is disabled because headless tests do not launch Electron.
- Superseded CI runs are cancelled per PR or ref to limit runner usage.
- Successful rebase/repair publication starts a separate metadata-only wait job (17-minute wait, 20-minute job limit) with trusted-main checkout. It wakes integration after current-revision CI completes, stops on closed/ineligible tasks or a new rebase/repair reservation (releasing workflow concurrency for the queued replacement), and holds timed-out tasks with a comment. There is no idle schedule and CI itself remains read-only. Rebase/repair completion events are replaced by explicit handoffs to avoid missed recursive workflow_run events.
- Update feature branches by rebase, never by merging main into them. Land passing feature PRs with GitHub Rebase and merge. GitHub automatically deletes merged remote PR branches; local worktrees are cleaned only when safe.
- After a successful API merge, the controller also removes the feature ref if its observed SHA still matches the integrated head, preserving advanced branches and main. This covers API merges where the repository auto-delete setting leaves the ref behind.
- Only reserved feature branches may be rewritten, using force-with-lease pinned to the validated head SHA. Never rewrite main or overwrite concurrent changes. The rebase-conflict label holds a PR for optional repair, and rebasing reservations prevent duplicate dispatches.
- Workflows must not execute untrusted pull-request code with write tokens or secrets.
- AI repairs may execute same-repository code authored by collaborators with write access. Those collaborators are trusted; outside authors and forks never enter privileged repairs or merging.
- Set `AUTOMERGE_ENABLED=true` only after main protection is active. `CLAUDE_REPAIR_ENABLED=true` separately enables subscription repair and requires `CLAUDE_CODE_OAUTH_TOKEN` in Actions secrets.
- The required check context is `Node 22 tests`, bound to the GitHub Actions App (15368). Main protection is strict and includes administrators. Human PR approvals are not required.
- The active repository ruleset `Tested agent integration` applies the same strict check to `main` with no bypass actors. The controller validates effective rules using metadata APIs available to the normal workflow token, avoiding administrator credentials.
- `INTEGRATION_RULESET_UPDATED_AT` pins the administrator-verified ruleset snapshot. Missing or changed snapshots fail closed; an administrator must verify bypass actors and repin after editing the ruleset, since GitHub hides bypass metadata from ordinary workflow tokens.
- No file paths are excluded from automatic integration or task repair. Workflow, configuration, skill and instruction changes still require passing independent CI.
- A bot-triggered PR run marked `action_required` has no CI jobs and cannot supersede the independently dispatched CI for the same revision. Test failures and pending runs still prevent merging.
- Candidate CI runs on a temporary `integration/ci-pr-*` branch pointing at GitHub's combined PR merge commit. A task-head result alone is insufficient: strict rules require checks on the combined commit. Candidate refs are validated before reuse and cleaned up after successful integration.
- Each repair has a 25-minute timeout and 25-turn limit; at most two attempts per task. Ready/blocked/attempt labels persist state across Actions runs; concurrency is only mutual exclusion.
- See `docs/agent-workflow.md` for setup, operation, pausing and coverage limitations.
- Update this file when adding or changing workflow responsibilities.

## Not here
- Game behavior and tests: `src/`, `server/`, `desktop/`, and `test/`.
- Browser rendering, Windows packaging, and real Steam validation are not covered by this baseline CI.
- The controller approves pending bot PR CI only after same-repository, collaborator and current-main checks, matching the exact task SHA and PR number. Other actors and forks remain subject to GitHub approval policy.

- Successful normal PR CI records a tested-SHA artifact. The controller accepts it only for the exact current synthetic merge commit, avoiding duplicate candidate tests. Old CI without this record retains independent candidate CI as a compatibility fallback.
