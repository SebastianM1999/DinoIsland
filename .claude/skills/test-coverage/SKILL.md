---
name: test-coverage
description: Measure and improve meaningful test coverage in Dinosaur Island using Node's built-in test runner. Use for coverage gaps, regression tests, test-quality reviews, or coverage-threshold work; browser and visual checks need separate validation.
---

# Test coverage for Dinosaur Island

## Repository baseline

Read `AGENTS.md`, `test/package-info.md`, and the package-info for the code under
test. Use `src/package-info.md`'s feature map to locate the matching tests when a
feature spans shared rules, simulation, and client code. Paths below are relative
to the owning feature worktree.

This repository uses ES modules, Node 22+, `node:test`, and
`node:assert/strict`. `npm test` runs `node --test`. There is currently **no
configured coverage threshold or measured repository-wide 100% baseline** in
`package.json` or `.github/workflows/ci.yml`. Recheck those files before reporting
the current policy. Do not carry over the original operatorclient skill's Vitest,
pnpm, statement counts, exclusions, or historical percentages.

Coverage identifies missing scenarios; assertions establish correct behavior.
Preserve existing regression protection and cover changed behavior when a
meaningful test can detect a real failure. Do not add tests that merely execute
lines or mirror implementation details. For reversible cosmetic changes, an
appropriate visual check may provide more value than a headless test.

If coverage enforcement is requested, first measure a reproducible baseline and
define its source scope and runtime. Add any threshold configuration in that
task; prose in this skill does not enforce it. Preserve configured thresholds
once introduced: close gaps rather than lowering a gate to make a change pass.
Do not assume that line or branch coverage must reach 100% to be useful.

## Measure with the actual runner

Run these commands from the feature worktree root:

```powershell
npm test
node --test test/skills.test.js
```

Node's experimental coverage mode reports lines, branches, and functions, not a
separate statement metric. The following measures the source loaded by the full
game test suite, excluding test fixtures and dependencies through explicit
source include patterns:

```powershell
node --test --experimental-test-coverage --test-coverage-include="src/**/*.js" --test-coverage-include="server/**/*.js" --test-coverage-include="desktop/**/*.js" --test-coverage-include="desktop/**/*.cjs"
```

For one gap, use a focused report:

```powershell
node --test --experimental-test-coverage --test-coverage-include="src/shared/skills.js" test/skills.test.js
```

The focused report is not a repository baseline. Even the full report only
includes loaded source files: an unimported module is a blind spot, not evidence
of complete coverage. Compare the reported file list with the intended source
scope and list unmeasured modules separately. Use the same Node version, include
patterns, and test selection when comparing runs; CI currently uses Node 22.
Check available flags with `node --help` when the installed version differs.

The text report lists uncovered lines. Read those lines and the surrounding
function before deciding which scenario is missing. Node does not provide this
repo with a `coverage:gaps` command or a Vitest `coverage-final.json` file.
Capture fresh output if a report is needed; `coverage/` and `*.log` are ignored.
When redirecting output in PowerShell, save `$LASTEXITCODE` immediately after the
command and propagate it after reading the log.

An unexpected failure remains a failure. Investigate its seed, isolation,
fixture, and timing; a diagnostic rerun does not erase a flaky test. Do not adopt
the foreign skill's unconditional retry or shell-pipe workaround.

## Close a gap with a behavioral test

1. Identify the gameplay or host failure an incorrect implementation would
   cause: duplicated inventory, unauthorized damage, a lost packet, an invalid
   profile, or an interaction that fires twice. That observable outcome is the
   assertion, rather than whether a method was called.
2. Extend the existing `test/<topic>.test.js` that owns the behavior. If none
   exists, add a file with English behavioral test names and update
   `test/package-info.md` in the same change. Follow the local flat
   `test('describes the behavior', ...)` convention and small per-file fixtures.
3. Exercise the relevant entry point. Use pure functions directly for shared
   rules; for authoritative actions, drive a real `ServerWorld` through
   `world.receive(player.id, { t: MSG.ACT, a: ACT.<action>, ... })`, advance
   `world.step(dt)` as needed, and inspect world state and captured host messages.
   Follow nearby fixtures for the exact protocol shape. A direct helper call
   cannot establish that packet validation or client input routing works.
4. Include the failure case that matters. For inventory changes, for example,
   prove that repeating or rejecting a request cannot create items and that
   successful transfers preserve relevant stack, ammo, and durability values.
   Test meaningful boundary and rejection cases, rather than manufacturing every
   fallback expression solely to improve a percentage.
5. Run the focused test and coverage report if measuring a gap. Then run the full
   required checks before submission; report both the behavior protected and the
   measurement's scope.

## Fixtures and common false confidence

- Island generation is deterministic for a fixed `(level, variant)`; simulation
  spawning and AI can use randomness. Reuse fixed variants and scoped seeded
  randomness where needed, as in `test/raids.test.js`. Record failing variants
  so they can be replayed. Drive simulation time with steps rather than sleeps.
- Client tests run headless in Node, often using Three.js objects without a
  renderer. Stub only the browser API surface required for the behavior and
  restore globals, property descriptors, and listeners with `try/finally` or
  test cleanup hooks. A stubbed DOM does not establish layout, pointer lock,
  WebGL rendering, or asset appearance in a browser.
- Trigger the registered input/event path when testing UI behavior. Check its
  observable effect and suppression of unwanted actions, as in
  `test/input-panels.test.js`; directly changing a fixture's state proves little.
- Hosting tests can run a real HTTP/WebSocket server on `127.0.0.1`, port `0`.
  Use bounded message waits, close clients and servers in cleanup hooks, and
  inject external Steam, DNS, and cloudflared dependencies. These tests do not
  establish compatibility with the real Steam client or packaged Windows app.
- A source-string or catalog assertion can protect a static invariant but does
  not prove the runtime path behaves correctly. Prefer behavior assertions when
  the defect concerns gameplay, network ordering, or state mutation.
- A skipped test is not coverage of its feature. Use a justified `skip` for a
  genuinely disabled feature, following the repository convention; never skip
  a failing enabled behavior to obtain a green result.

## Unreachable code and exclusions

First establish whether the path is actually unreachable in every supported
host: browser Worker solo play, Node WebSocket hosting, and Electron/Steam. A
browser-only path is not dead merely because the Node fixtures cannot reach it.
Validate such paths in the appropriate runtime and state the headless gap.

Do not remove a defensive guard or change production behavior just to raise
coverage. For truly redundant or unreachable code, explain the invariant at the
source and assess removal on its merits. If an ignore or file exclusion is
necessary for a requested coverage gate, document the precise scope, reason,
and alternative validation. Use only syntax supported by the installed Node
coverage runner; do not copy Vitest `v8 ignore` comments into this project.
Do not exclude difficult gameplay or host logic to inflate a score.

## Submission checks and limits

`AGENTS.md` requires `npm test` and `git diff --check` before submission. There
are no configured `lint`, `lint:layers`, `typecheck`, or `test:coverage` npm
scripts at this baseline; do not claim to have run them.

CI's `Node 22 tests` job also selects hidden integration-controller tests
explicitly, outside the game suite's default discovery:

```powershell
node --test .github/scripts/integration.test.cjs .github/scripts/rebase.test.cjs .github/scripts/await-task-ci.test.cjs
```

Run that suite for changes to integration automation and inspect
`.github/package-info.md` before editing that directory. Use the full coverage
run when making a claim about its measured source scope or setting a gate.
Browser gameplay, visual checks, real Steam, and packaging checks remain
separate validation where relevant.

Report the commands, pass/fail/skip results, scope of any coverage percentage,
and remaining untested behavior. Follow `AGENTS.md` and `docs/agent-workflow.md`
for worktree ownership and PR submission; invoking this skill alone does not
authorize pushing.
