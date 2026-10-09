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
Players spawn at a legal herbivore observation point outside nearby predators'
initial detection ranges, 40–140 metres from a live herbivore (outside the grove
boundary for a scaled titan). AI and damage remain active; the benchmark does not grant
invulnerability. A run where the player is incapacitated for more than 10% of
measured updates is invalid, even if its rendered FPS looks good. Validity and
HP/movement diagnostics are saved in the report before the command fails.
Normal controller movement follows one-metre circular waypoints inside a checked
patch of walkable, cool ground, with a gentle camera sway aimed at the dinosaur.
Unexpected interaction dialogs are dismissed through the normal panel handler.
Bots move within that patch too. Dinosaurs are neither removed nor frozen. This is a repeatable local
observation workload, not complete combat, boss, raid or expedition
coverage. Add separately labeled scenarios before making claims about those.

Default warmup is 8 seconds, measurement 15 seconds per island, after model
preloading and real shader preparation. Asset/world construction and shader
startup are outside the measured steady-state window. Reports include frame
interval p50/p95/p99/max, stalls over 50 ms, update/render CPU and GPU times where available,
draw calls, triangles, geometry/texture counts, applied graphics tiers,
movement distance, visible dinosaur counts, snapshot counts and viewport.
Network diagnostics include RTT percentiles, jitter, interpolation delay, missing
snapshots and movement corrections. Local loopback latency does not establish
internet or real Steam latency.
The script rejects empty rendering/movement/snapshot workloads, missing visible
dinosaurs, incapacitated players, missing clients and uncaught browser exceptions.

Customize duration with `--seconds=30 --warmup-seconds=10`, viewport with
`--width=1920 --height=1080`, seed with `--variant=42`, and target metadata with
`--target-fps=120`. `--channel=chrome` uses installed Chrome; omit it for bundled
Chromium. `--software` explicitly requests SwiftShader for portability.
Software GPU results establish functional execution and relative regressions;
they cannot establish 120 FPS performance on players' hardware. The report
labels headless mode, requested software mode and detected renderer string.

## Interpreting the target and optional gates

120 FPS allows **8.333 ms per frame**. For a calibrated hardware run, the strict target gate is p95 ≤ 8.333 ms and p99 ≤ 16.667 ms:

```powershell
node scripts/performance/browser.mjs --channel=chrome --headed --seconds=30 --warmup-seconds=10 --max-frame-p95-ms=8.333 --max-frame-p99-ms=16.667 --max-stalls=0 --output=output/performance/hardware-gated.json
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

## Measured diagnostic baseline

An October 9, 2026 run used Node 22.20.0, Chrome 155 headless, an Intel
i7-11700K and NVIDIA RTX 3070 through ANGLE/D3D11, at 1920 × 1080 Medium.
Each island had 8 seconds of warmup and 15 seconds of measurement with four
players. All three scenarios passed workload validity checks.

| Island | Average FPS | Frame p95 | Frame p99 | Stalls > 50 ms | Draw calls p95 | Triangles p95 |
|---|---:|---:|---:|---:|---:|---:|
| Jungle | 164.4 | 8.2 ms | 10.1 ms | 0 | 166 | 1.97 million |
| Swamp | 111.3 | 15.0 ms | 19.7 ms | 0 | 677 | 6.01 million |
| Volcano | 93.1 | 17.2 ms | 22.7 ms | 2 | 609 | 4.00 million |

The command failed the strict 120 FPS gates for Swamp and Volcano. Their GPU
p95 times were 10.49 and 11.86 ms, respectively; those exceed the entire 8.333 ms
frame budget and warrant rendering profiles. These measurements identify a
performance gap, not sustained gameplay acceptance. Repeat on the intended
display and across combat routes before claiming the target is met.

The separate default simulation workload (600 measured, 120 warmup ticks)
passed workload checks. Tick p95 was 2.23/1.51/1.47 ms for Jungle/Swamp/Volcano,
with maxima of 71.61/4.81/165.65 ms. The long ticks need profiling and repeated
measurements; low p95 alone does not establish absence of host stalls.

## CI and coverage

`npm run test:coverage` measures every JavaScript source file in `src/`,
`server/` and `desktop/`, including unloaded files. The measured baseline is
69.66% lines/statements, 83.61% functions and 88.40% branches across 179 files.
CI enforces floors of 69% lines/statements, 83% functions and 88% branches,
and uploads the report and missing-coverage list. These floors preserve the
current baseline; they are not the eventual 100% goal.

The manually dispatched **Performance diagnostics** workflow runs simulation
and a short software-GPU browser workload, then uploads both JSON reports.
It validates the measurement path without applying hardware FPS thresholds
on a shared runner. Timing gates remain opt-in on declared reference hardware.
