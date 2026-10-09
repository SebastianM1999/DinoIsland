# Dinosaur Island

1-4 player co-op first-person dinosaur hunting game: Three.js client, authoritative simulation shared by a Node WebSocket server, an Electron/Steam desktop app and an in-browser Web Worker (solo). ES modules, Node 22+.

- Run: `npm start` (http://localhost:8080), desktop: `npm run desktop`
- Test: `npm test` (`node --test`, files in `test/`)
- Dev pins: testers press F8 in a solo game started with `?dev` (e.g. `http://localhost:8080/?island=4&variant=1&dev`) to pin a glitch. Reports land in `dev-pins/<id>.json` + `.png` (gitignored): position, view, what the crosshair hits, terrain/cave facts, level/variant/seed, commit. Read them when asked to fix pinned spots; `revisit` + `&pin=<id>` reloads the same layout at the spot. See `src/client/core/devPins.js`, `server/devPins.js`.

## Directory specs
Every main directory has a `package-info.md` with its responsibility, files, entry points, rules and what does **not** belong there. **Before changing code in a directory, read its `package-info.md`.** For a feature that spans layers, start with the feature map in `src/package-info.md`. When you add, rename or remove a file, or change a rule, update that directory's `package-info.md` in the same change.

- `src/package-info.md`: system overview, allowed imports, hosting, authority model, **feature map**
- `src/shared/package-info.md`: pure deterministic data/rules shared by client and sim, protocol, config
- `src/sim/package-info.md`: authoritative `ServerWorld` simulation (map of areas inside world.js)
- `src/sim/ai/package-info.md`: per-species dinosaur behaviour brains
- `src/client/package-info.md`: client overview, menu to `Game` flow
- `src/client/core/package-info.md`: `Game` shell (map of areas inside game.js), renderer, settings, profile
- `src/client/net/package-info.md`: `Net` session over WebSocket / Steam / Worker, interpolation
- `src/client/input/package-info.md`: key/mouse to named actions, pointer lock
- `src/client/player/package-info.md`: local player prediction, actions, viewmodel
- `src/client/entities/package-info.md`: views of server-owned things (dinos, items, players, projectiles)
- `src/client/ui/package-info.md`: DOM HUD (map of areas inside hud.js), panels, menus, minimap
- `src/client/audio/package-info.md`: Web Audio effects, ambience, music
- `src/client/world/package-info.md`: island scenery built from the shared layout
- `src/client/models/package-info.md`: code-built models (kit, player, weapons, props)
- `src/client/models/dino/package-info.md`: dino GLBs and procedural fallback rigs
- `src/client/models/firearms/package-info.md`: pistol and rifle models
- `server/package-info.md`: Node HTTP + WebSocket host
- `desktop/package-info.md`: Electron wrapper and Steam bridge
- `test/package-info.md`: test layout and conventions

Not documented by a package-info: `art/` (Blender sources, see the `dino-blender-creator` skill), `assets/` (runtime models/audio; `assets/cave/*.bin` is the baked Hollow Mountain of the fixed map, rebuilt by `node scripts/bakeCave.mjs` after any change to the cave field, walk sampling, mesher or vertex paint: `test/cave-bake.test.js` fails when it is stale), `scripts/` (offline asset tooling; `islandmap.mjs` renders top-down PNGs of islands for picking fixed maps), `docs/` (design notes), `dist/` and `output/` (build output).

## Required coverage skill before pushing

- Codex, Claude and Copilot must read and follow [.claude/skills/test-coverage/SKILL.md](.claude/skills/test-coverage/SKILL.md) for every code change and before pushing a feature branch. This is mandatory even when automatic skill discovery does not select it.
- The tracked `.claude/skills` directory is the shared source. `npm ci` links `.agents/skills` to it for Codex discovery. If discovery or linking fails, read the tracked skill directly; do not skip it.
- Before every push, run `npm test`, `npm run test:coverage`, `npm run coverage:gaps`, and `git diff --check` in the owning worktree. Resolve failures before pushing, and report the protected behavior, measured coverage scope, and remaining runtime validation gaps in the PR.
- Preserve the complete-source scope and enforced floors in `.c8rc.json`. Do not lower thresholds, exclude difficult code, or add assertion-free tests to make a gate pass. The current floors are not a 100% coverage gate; do not describe a passing check as 100% coverage.

## Parallel agents and integration

- These rules apply to Codex, Claude and Copilot. Read this file at session start; follow `docs/agent-workflow.md` for commands.
- Before editing, check `git status --short`, `git branch --show-current` and `git worktree list`. Each feature owns one dedicated worktree and one short-lived feature branch, normally `<agent>/<feature>`, based on fresh `origin/main`. Use the current agent as the prefix: `codex/<feature>`, `claude/<feature>` or `copilot/<feature>`. A developer-name segment is not required; use a unique feature slug to avoid collisions.
- If the session starts in the shared checkout or on `main`, fetch `origin` and create a separate worktree with `git worktree add -b <agent>/<feature> ../dino-<agent>-<feature> origin/main`, then run all edits, installs, tests and commits inside that worktree. Do not edit the shared checkout first, switch another agent's branch, or move/discard someone else's changes. Reuse an existing worktree only when it belongs to this same feature and no other writer is active. A platform-provided isolated task checkout on its own feature branch satisfies the isolation requirement.
- Never have two agents edit the same worktree or feature branch concurrently. Give independent implementation subagents their own worktrees/branches; read-only helpers may inspect the owner's checkout.
- Keep commits focused. Run `npm test` and `git diff --check` before submission. Describe intended behavior and validation in the PR so the integration agent can preserve intent.
- One feature has exactly one PR targeting `main`, regardless of how many commits, fixes or sessions it needs. Continue the same branch and PR for follow-up fixes; do not create a PR per commit or per test failure. A platform-created task PR must be reused.
- Never push unless the user explicitly authorizes it; authorization for the current feature remains valid across its follow-ups. When finished and authorized, commit the intended files, push the feature branch, create or update its single PR after local checks pass. The integration controller automatically adds `ready-to-merge` after successful current-head PR CI for eligible non-draft collaborator PRs; manual labeling is optional. In Codex, attach the PR to the chat. Do not stop at a local commit when submission is authorized. If pushing is not authorized, report that the branch is ready but unsubmitted. Do not push directly to `main` or independently merge task PRs.
- The shared integration controller rebases feature branches onto current main, validates, and lands eligible PRs using GitHub Rebase and merge. It must not merge main into a feature branch or create merge commits. Required CI runs against current `main`; a branch-only pass is insufficient.
- Report the PR URL, validation and whether integration is pending, blocked or merged. Preserve the worktree/branch until merging is confirmed and local work is safe. GitHub automatically deletes the remote PR branch after merging; remove a local worktree/branch only when clean and its work is confirmed integrated. Repair failures or conflicts on the same PR; do not bypass checks. Cloud AI repair is optional and must not be assumed enabled.
- Coordinate ownership of sections in `src/sim/world.js`, `src/client/core/game.js`, and `src/client/ui/hud.js`. Prefer independent modules with small integration edits. One writer per binary asset (Blender/GLB/audio).
- All file paths, including workflows, configuration, skills and agent instructions, are eligible for automatic integration after required checks pass.
- When integration is blocked, preserve the branch and explain the ambiguity. Do not choose all of `ours`/`theirs`, discard another task, weaken checks, or force-push shared history. The integration workflows may publish a rebased feature branch only with `--force-with-lease=refs/heads/<branch>:<reserved-head-sha>`; refuse if another writer advanced it. Never rewrite main.
- See `.github/package-info.md` and `docs/agent-workflow.md` for operation and setup.
