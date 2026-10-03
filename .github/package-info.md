# .github
> GitHub-hosted automation and repository integration configuration.

## Files
- `workflows/ci.yml` — read-only CI for pull requests targeting `main`, pushes to `main`, merge-group candidates, and manual runs. Installs locked dependencies and runs the Node 22 test suite and submitted-diff whitespace/conflict-marker checks on Ubuntu.
- `workflows/integration.yml` — trusted-main controller, awakened by PR events, completed CI/repairs, manual runs, and a 15-minute schedule. Does not execute PR source.
- `workflows/integration-repair.yml` — reserved same-repository task repair using Claude subscription credentials; validates eligibility, merges main, repairs files, tests, publishes only the task branch, and wakes the controller for independent candidate CI.
- `scripts/integration.cjs` — durable ready-label queue controller; checks protection, collaborator eligibility, protected paths, revision-specific CI, repair budgets, and guarded squash merges.
- `scripts/integration.test.cjs` — mocked integration safety tests, explicitly run by CI because default Node discovery skips hidden directories.

## Entry points
- GitHub Actions runs `CI / Node 22 tests`; use this stable check name when configuring required status checks.
- The normal `pull_request` checkout tests GitHub's combined merge candidate. Merge-group runs test the queue candidate when a native GitHub merge queue is available.

## Rules
- CI has read-only repository permissions, no AI credentials, and no persisted checkout credentials.
- Use `npm ci` with the committed lockfile and Node 22. Electron's binary download is disabled because headless tests do not launch Electron.
- Superseded CI runs are cancelled per PR or ref to limit runner usage.
- Workflows must not execute untrusted pull-request code with write tokens or secrets.
- AI repairs may execute same-repository code authored by collaborators with write access. Those collaborators are trusted; outside authors and forks never enter privileged repairs or merging.
- Set `AUTOMERGE_ENABLED=true` only after main protection is active. `CLAUDE_REPAIR_ENABLED=true` separately enables subscription repair and requires `CLAUDE_CODE_OAUTH_TOKEN` in Actions secrets.
- The required check context is `Node 22 tests`, bound to the GitHub Actions App (15368). Main protection is strict and includes administrators. Human PR approvals are not required.
- The active repository ruleset `Tested agent integration` applies the same strict check to `main` with no bypass actors. The controller validates effective rules using metadata APIs available to the normal workflow token, avoiding administrator credentials.
- `INTEGRATION_RULESET_UPDATED_AT` pins the administrator-verified ruleset snapshot. Missing or changed snapshots fail closed; an administrator must verify bypass actors and repin after editing the ruleset, since GitHub hides bypass metadata from ordinary workflow tokens.
- Automation/configuration changes require manual integration. Repairs never modify them; independent read-only CI must pass before merging.
- A bot-triggered PR run marked `action_required` has no CI jobs and cannot supersede the independently dispatched CI for the same revision. Test failures and pending runs still prevent merging.
- Candidate CI runs on a temporary `integration/ci-pr-*` branch pointing at GitHub's combined PR merge commit. A task-head result alone is insufficient: strict rules require checks on the combined commit. Candidate refs are validated before reuse and cleaned up after successful integration.
- Each repair has a 25-minute timeout and 25-turn limit; at most two attempts per task. Ready/blocked/attempt labels persist state across Actions runs; concurrency is only mutual exclusion.
- See `docs/agent-workflow.md` for setup, operation, pausing and coverage limitations.
- Update this file when adding or changing workflow responsibilities.

## Not here
- Game behavior and tests: `src/`, `server/`, `desktop/`, and `test/`.
- Browser rendering, Windows packaging, and real Steam validation are not covered by this baseline CI.
- The controller approves pending bot PR CI only after same-repository, collaborator, protected-path and current-main checks, matching the exact task SHA and PR number. Other actors and forks remain subject to GitHub approval policy.
