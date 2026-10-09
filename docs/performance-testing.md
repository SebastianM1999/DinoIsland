# Gameplay performance measurements

These scripts measure the authoritative simulation and the real Three.js game,
not the menu. Reports are JSON; use the same machine, browser, settings, seeds,
durations and background workload when comparing revisions. Run performance
measurements separately from the test suite, coverage and builds.

## Simulation

```powershell
node scripts/performance/simulation.mjs --output=output/performance/simulation.json
```

Each of the three islands uses variant 42 and seeded simulation randomness,
four real joined players, predictive player controllers, movement packets,
live dinosaur AI and serialized snapshots. The default is 120 warmup ticks
followed by 600 measured ticks. Timings include movement prediction, packet
validation, the authoritative step and snapshot serialization, but exclude
world construction. This runs faster than real time; it is not an FPS test.
Reports contain tick p50/p95/p99/max, workload counts and a final-state hash.
The hash is a reproducibility aid, not a committed cross-version golden value.

The script asserts player count, packet count, finite dinosaur positions and
nonempty dinosaur/snapshot workloads. These are deterministic CI checks.
Customize with `--ticks=600`, `--warmup=120`, `--players=4`, `--variant=42`.
An optional `--max-tick-p95-ms=10` exits unsuccessfully if any island exceeds
that calibrated budget. No wall-clock threshold is enabled by default.

## Browser gameplay

Install dependencies with `npm ci`, then install Chromium once:

```powershell
npx playwright install chromium
node scripts/performance/browser.mjs --output=output/performance/browser.json
node scripts/performance/browser.mjs --channel=chrome --headed --output=output/performance/hardware.json
```

The default target is **120 FPS, Medium, 1920 × 1080, device pixel ratio 1**.
Medium means the game's actual internal `TIERS[1]`: shadows enabled, 1024 shadow
map, 0.65 grass density, vegetation LOD distance 80. The benchmark freezes that
tier instead of permitting auto-tuning to reduce quality during a slow run.
Production auto-tuning is unchanged. Render scale/contact shading use fresh
context defaults (100%/30%), and their applied values are recorded.

Each island has its own server and fresh browser context. A small fixture HTML
document replaces the menu so its scenery cannot consume GPU time alongside
gameplay. The actual HTTP asset host, `Net.connect`, `Game`, frame loop, physics,
HUD, audio, models, world builders, WebSocket snapshots and live dinosaur AI
run unchanged. Three additional WebSocket players send movement at 20 Hz; this
measures four-player hosting and one real rendered client, not four GPUs.
Players spawn at a legal observation point 25–60 metres from a live dinosaur.
Normal controller movement follows alternating directions with a gentle camera
turn. Dinosaurs are neither removed nor frozen. This is a repeatable local
observation/traversal workload, not complete combat, boss, raid or expedition
coverage. Add separately labeled scenarios before making claims about those.

Default warmup is 8 seconds, measurement 15 seconds per island, after model
preloading and real shader preparation. Asset/world construction and shader
startup are outside the measured steady-state window. Reports include frame
interval p50/p95/p99/max, stalls over 50 ms, render CPU/GPU times where available,
draw calls, triangles, geometry/texture counts, applied graphics tiers,
movement distance, visible dinosaur counts, snapshot counts and viewport.
The script rejects empty rendering/movement/snapshot workloads, missing visible
dinosaurs, missing clients and uncaught browser exceptions.

Customize duration with `--seconds=30 --warmup-seconds=10`, viewport with
`--width=1920 --height=1080`, seed with `--variant=42`, and target metadata with
`--target-fps=120`. `--channel=chrome` uses installed Chrome; omit it for bundled
Chromium. `--software` explicitly requests SwiftShader for portability.
Software GPU results establish functional execution and relative regressions;
they cannot establish 120 FPS performance on players' hardware. The report
labels headless mode, requested software mode and detected renderer string.

## Interpreting the target and optional gates

120 FPS allows **8.333 ms per frame**. For a calibrated hardware run, a reasonable
starting gate is p95 ≤ 9 ms (small scheduling tolerance) and p99 ≤ 16.667 ms:

```powershell
node scripts/performance/browser.mjs --channel=chrome --headed --seconds=30 --warmup-seconds=10 --max-frame-p95-ms=9 --max-frame-p99-ms=16.667 --max-stalls=0 --output=output/performance/hardware-gated.json
```

These gates are opt-in and apply independently to every island; failure sets
exit code 1. They are not enabled in shared CI by default. Use repeated runs and
investigate a regression rather than selecting the best sample.

`requestAnimationFrame` remains the normal game scheduler. A 60 Hz display or
headless cadence may limit frame pacing to roughly 16.667 ms despite spare GPU
capacity. The report records an idle rAF cadence sample and its observed Hz,
browser/CPU/GPU information and the effective limiter. This is an observation,
not an authoritative identification of physical monitor refresh. Neither short
render CPU time nor a software/headless run proves 120 FPS display delivery.
Use a display with at least 120 Hz and confirm refresh settings for that claim.

The host's layout seed and initial random state are controlled, while browser
and network scheduling remain asynchronous. Exact browser state hashes are
therefore intentionally not used as deterministic gates. Resource counts
describe allocations, not bytes of GPU memory. Missing GPU timer results are
reported as `null`, not zero. Current reports cover one fixed variant per
island; add seeds, camera routes and target hardware before treating them as a
comprehensive performance guarantee.

## Initial diagnostic sample

A short October 9, 2026 run used Node 22.20.0, Chrome 155 headless, an Intel
i7-11700K and an actual NVIDIA RTX 3070 through ANGLE/D3D11. Idle rAF cadence
was approximately 164 Hz. The browser was at the defaults above with a shorter
2-second warmup and 3-second measurement per island:

| Island | Frame p50 | Frame p95 | Frame p99 | Stalls > 50 ms | Draw calls p95 | Triangles p95 |
|---|---:|---:|---:|---:|---:|---:|
| Jungle | 6.1 ms | 7.1 ms | 7.9 ms | 0 | 133 | 1.94 million |
| Swamp | 6.6 ms | 8.9 ms | 10.6 ms | 0 | 654 | 6.36 million |
| Volcano | 6.0 ms | 7.3 ms | 8.6 ms | 0 | 333 | 3.19 million |

The swamp exceeded the strict 8.333 ms p95 budget. This short headless sample
does not certify sustained 120 FPS, combat performance or other hardware.
It establishes an initial measurement and identifies the swamp as the most
expensive of these three routes. Rerun longer on the intended display/hardware.

The default simulation workload (600 measured, 120 warmup ticks) measured
tick p95 of 2.18/1.11/0.78 ms across Jungle/Swamp/Volcano, with maxima of
64.39/3.97/117.12 ms. The occasional long ticks need repeat measurements and
profiling; low p95 alone does not establish absence of host stalls.
