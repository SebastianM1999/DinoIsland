# Dinosaur Island: Copilot startup instructions

Read the repository-root [AGENTS.md](../AGENTS.md) before starting work. It is the
shared source of project instructions for Copilot, Claude and Codex. Read the
relevant directory's `package-info.md` before changing files there.

The required workflow is:

- Before editing, inspect the current branch, status and worktrees. Each feature
  uses its own worktree and feature branch, normally `codex/<developer>/<feature>`,
  based on fresh `origin/main`. Create that worktree if starting in the shared
  checkout or on `main`. An isolated platform task checkout/branch also qualifies.
- Run all edits, installs, tests and commits inside that feature checkout. Never
  share it with another writer or discard someone else's changes.
- Run `npm test` and `git diff --check`. Keep focused commits.
- Never push unless the user explicitly authorizes it. With authorization, push
  the feature branch, create or update exactly one PR targeting `main`, and add
  `ready-to-merge` when complete. Reuse a platform-created PR. Keep all follow-up
  fixes on that same branch/PR. Report the PR URL and integration status.
- Let the integration controller test and merge ordinary feature PRs. Never push
  directly to `main`, bypass checks, or independently merge them. Instruction and
  automation changes require manual integration after checks pass.

See [the workflow guide](../docs/agent-workflow.md) for commands and limitations.
Keep this startup summary consistent with AGENTS.md when workflow rules change.
