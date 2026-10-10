# Dinosaur Island: Copilot startup instructions

Read the repository-root [AGENTS.md](../AGENTS.md) before starting work. It is the
shared source of project instructions for Copilot, Claude and Codex. Read the
relevant directory's `package-info.md` before changing files there.

The required workflow is:

- Before editing, inspect the current branch, status and worktrees. Each feature
  uses its own worktree and feature branch, normally `<agent>/<feature>`,
  using `codex`, `claude` or `copilot` as the agent prefix, without a developer name.
  based on fresh `origin/main`. Create that worktree if starting in the shared
  checkout or on `main`. An isolated platform task checkout/branch also qualifies.
- Run all edits, installs, tests and commits inside that feature checkout. Never
  share it with another writer or discard someone else's changes.
- Read and follow [the shared test-coverage skill](../.claude/skills/test-coverage/SKILL.md)
  for every code change and before every push, even if skill discovery does not
  select it. Run `npm test`, `npm run test:coverage`, `npm run coverage:gaps`, and
  `git diff --check`; resolve failures before pushing. Preserve the coverage scope
  and floors; a passing check does not mean 100% coverage. Keep focused commits.
- Never push unless the user explicitly authorizes it. With authorization, push
  the feature branch and create or update exactly one PR targeting `main` after
  local checks pass. The controller adds `ready-to-merge` automatically after
  eligible current-head PR CI succeeds. Reuse a platform-created PR. Keep all follow-up
  fixes on that same branch/PR. Report the PR URL and integration status.
- Let the integration controller rebase feature branches onto main, test and land
  ordinary feature PRs with GitHub Rebase and merge. Never merge main into a feature
  branch. Never push
  directly to `main`, bypass checks, or independently merge them. All file paths, including instructions and
  automation, are eligible after required checks pass.

GitHub deletes the remote PR branch after merging. Remove local worktrees only
when clean and confirmed integrated. Rebased feature publication uses an exact-head
force-with-lease; never rewrite main or overwrite newer work.

See [the workflow guide](../docs/agent-workflow.md) for commands and limitations.
Keep this startup summary consistent with AGENTS.md when workflow rules change.
