# Loading and rendering changes, October 11, 2026

Implementation branch: `codex/lag-analysis`, based on `ea5a9ff`.

## Behavior

- Menu photographs load only for the selected island. A live tour builds one
  scenery corridor, retains one island, and cancels obsolete selections.
- The Hollow Mountain preview uses its fixed variant and committed cave bake;
  it no longer constructs an unbaked alternate cave while Jungle is selected.
  There are no committed cave postcards, so no missing cave-image requests are made.
- Solo launch stops the tour before starting the Worker. Terrain rows, layout
  placement searches and vegetation construction run in cooperative steps;
  GPU warm-up uploads meshes in batches between browser tasks.
- Outdoor terrain retains deterministic CPU surface data and streams nearby
  render chunks onto the GPU. This does not stream simulation/collision state.
  Vegetation chooses detail per instance within spatial batches and omits
  instances beyond fog. Terrain vertices, normals and seeded placements are preserved.
- Graphics start conservatively at Medium, recheck saved calibration each
  session, and recover from sustained slow frames. Medium caps DPR at 1, uses
  two world-target MSAA samples and disables foliage shadow casters.
- Cancellation and teardown release owned instance buffers and event listeners
  while preserving shared geometry/material caches.
- Reliable network changes are buffered during construction and replayed after
  handlers are installed, followed by the latest valid snapshot. Bounded queues
  and replacement-world detection fail explicitly instead of losing co-op state.

## Hardware diagnostics

Node 22.20.0, Chrome 155 headless, i7-11700K, RTX 3070 through ANGLE/D3D11,
1920 x 1080, DPR 1. These are separate Chrome contexts, not the user's original
Chrome session. Existing browser tools could not inspect that session.

`browser.mjs --channel=chrome --variant=1 --seconds=30 --warmup-seconds=8`
measured real WebSocket gameplay with four players and active dinosaur AI.
The fixture observes a herbivore with small legal movement; it is not combat
or normal landing-spawn acceptance. Both revisions used their actual Medium
presets, which differ in MSAA and foliage-shadow policy.

| Island | Baseline mean FPS | Implemented mean FPS | Baseline frame p95 | Implemented frame p95 |
|---|---:|---:|---:|---:|
| Jungle | 155.7 | 138.3 | 7.7 ms | 9.8 ms |
| Swamp | 110.1 | 154.3 | 11.7 ms | 9.0 ms |
| Volcano | 134.9 | 123.2 | 10.3 ms | 9.9 ms |

These single comparisons support a Swamp improvement, not a universal gain.
All implemented scenarios missed the strict 8.333 ms p95 target. Jungle also
had seven measured frames over 50 ms; Swamp and Volcano had zero. GPU p95 was
6.53/7.52/8.62 ms respectively, so Volcano exceeded the total target budget
on GPU time alone. More representative routes and repetitions remain required.

The real menu-to-Worker-solo script (`startup.mjs`) separately exercised
starting while the tour was still pending and after a live preview completed.
An initial three-run diagnostic made the menu interactive in 462–600 ms and
measured 110.5–138.5 FPS at normal Jungle spawn, with p95 10.8–17.3 ms.
Zero JavaScript errors or failed asset requests were recorded. It still showed
loading tasks over 600 ms, prompting finer terrain/layout/vegetation steps.

A later three-run measurement (`final-startup.json`) overlapped another agent's
Playwright game benchmark on the same machine. Its timings are retained for
diagnostics but excluded from before/after conclusions. Fresh isolated hardware
measurements are required for the final construction and menu warm-up changes.

## Validation limits

Final `npm test` and `npm run test:coverage`: 549 passed, one skipped, zero
failures (550 tests). Complete-source c8 measured 214 files: 71.41%
lines/statements, 84.43% functions and 88.97% branches; all configured floors
passed. `npm run coverage:gaps` and `git diff --check` also passed. A dev-pin
fixture's 20 ms sleep was replaced with bounded response-completion waiting
after the full run exposed its timing race; production endpoint behavior was
unchanged.

Final Chrome smoke checks launched solo both during pending preview construction
and after the live preview completed, including a wider viewport resize. Both
retained active dinosaurs, released the network loading queue, and reported zero
JavaScript errors or failed requests. Screenshots confirmed the live menu and
landing scenery rendered. This functional check did not measure FPS.

Regression tests protect full terrain-cell coverage, streaming eviction,
nested mesh warm-up, cancellation cleanup, seeded synchronous/staged world
and vegetation parity, spatial detail selection, stale postcards, slow-frame
calibration, and input teardown. Complete-source coverage is measured across
`src`, `server` and `desktop`; passing its floors is not 100% coverage.

Remaining runtime checks: the user's Chrome/profile/display, complete combat
routes, cave FPS, real Steam/Electron packaging, and repeated expedition changes.
No consistent 120 FPS acceptance claim is made. The user's shared checkout at
localhost:8080 has not been changed by this isolated branch.

## Follow-up: reported drops to 30 FPS

The selected client world does not construct cave geometry on Jungle, and the
menu renderer's diagnostics show zero retained islands after solo launch.
However, `src/sim/worker.js` still prefetches the entire 8,888,900-byte cave bake
on every solo start, inflating just its walk section. This background prefetch
was missed in the first review; it is startup work, not evidence that cave
geometry renders continuously on Jungle. Loading all dinosaur catalog GLBs is
another cross-island preload.

At normal Jungle landing spawn, frame counters recorded approximately 754 draw
calls and 5.48 million triangles across render passes at Medium, DPR 1. That
is substantially heavier than the benchmark's herbivore-observation camera.
The automatic graphics budget is 11 ms GPU time and 22 ms frame time, targeting
roughly 60 FPS; it does not enforce the requested 120 FPS reference target.
Its completed-calibration watchdog requires consecutive slow frames, so
intermittent spikes can escape recovery.

The pause overlay keeps world simulation/rendering active and rebuilds its DOM
lists once per second. Its final CSS disables backdrop blur and it does not use
the brush SVG filter. Hidden HUD/minimap updates continue, which is avoidable
work, but no measured evidence yet attributes sustained 30 FPS to the pause
menu. Settings still uses backdrop blur and brush filtering.

A controlled menu/render comparison was stopped after another Claude-controlled
Playwright game benchmark was detected running concurrently. Its timing results
are excluded. Multiple game instances compete for the same GPU and can affect
both lab measurements and the user's live game. Future attribution runs must
have exclusive hardware access; source findings and scene counters alone do
not establish the precise cause of the user's frame drops.
