# Dinosaur Island

1-4 player co-op first-person dinosaur hunting game: Three.js client, authoritative simulation shared by a Node WebSocket server, an Electron/Steam desktop app and an in-browser Web Worker (solo). ES modules, Node 22+.

- Run: `npm start` (http://localhost:8080), desktop: `npm run desktop`
- Test: `npm test` (`node --test`, files in `test/`)

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

Not documented by a package-info: `art/` (Blender sources, see the `dino-blender-creator` skill), `assets/` (runtime models/audio), `scripts/` (offline asset tooling), `docs/` (design notes), `dist/` and `output/` (build output).

## Parallel agents and integration

- Each independent task owns one short-lived `codex/<developer>/<task>` branch and one worktree, based on fresh `origin/main`. Claude may use the same prefix. Never have two agents edit the same worktree or task branch concurrently.
- Keep commits focused. Run `npm test` and `git diff --check` before submission. Describe intended behavior and validation in the PR so the integration agent can preserve intent.
- Never push unless the user explicitly authorizes it. Once authorized for a task, push its task branch, create a PR targeting `main`, attach it to the chat, and label it `ready-to-merge` when complete. Do not push directly to `main` or independently merge task PRs.
- The shared integration controller updates, validates, and squash-merges eligible PRs. Required CI runs against current `main`; a branch-only pass is insufficient.
- Coordinate ownership of sections in `src/sim/world.js`, `src/client/core/game.js`, and `src/client/ui/hud.js`. Prefer independent modules with small integration edits. One writer per binary asset (Blender/GLB/audio).
- Automation/configuration changes under `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, or `.mcp.json` require explicit manual integration and are excluded from unattended merging.
- When integration is blocked, preserve the branch and explain the ambiguity. Do not choose all of `ours`/`theirs`, discard another task, weaken checks, or force-push shared history.
- See `.github/package-info.md` and `docs/agent-workflow.md` for operation and setup.
