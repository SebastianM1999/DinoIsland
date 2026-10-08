# test
> Automated tests for shared rules, the authoritative simulation, headless client logic, the server and the Steam session, run with Node's built-in test runner (`npm test` = `node --test`).

## Files

- `coverage-gaps.test.js` — reporting of uncovered lines, functions and branches, including topic filters.
- `performance-harness.test.js` — benchmark percentile correctness, invalid-sample rejection and fail-closed timing-budget arguments; deterministic checks, without timing thresholds.

- `map-previews.test.js` — all island photographs preload/decode once, cache reuse and missing-photo fallback isolation.

- `mission-summary.test.js` — compact phase/relic goals, pinned contracts and win/travel copy; verifies host mission data stays unchanged.

- `torch.test.js` — torch pickup authority, respawn at the spot, `PF.TORCH` gating, `carriesLight`.
`sarco-model.test.js` validates the Alpha Sarcosuchus boss GLB: near-black green skin, bright red scars, red/yellow emissive eyes, normalized weights, jaw deformation, fourteen clips, braced wind-up contacts and staggered attack steps, loop closure and ground clearance.
Grouped by the module area they mainly cover. Many simulation tests also check the matching client code.

### World generation, terrain and collision (src/shared)
- `map-rules.test.js` — map design rules over many generated islands of the first three levels (the Hollow Mountain has its own rules in `cave-level.test.js`) (planIsland, Terrain, buildLayout, tree trunks).
- `volcano.test.js` — Ashfall Isle: round outline and area (1.3× the swamp), the caldera in the middle, the path up through the notch (no lava on it but at its lava fields, never too steep; short, a ridge with a drop and a ditch, lava beside it almost all the way but not burning on it, two jump and runs: lava fields with no way round, varied columns a jump apart; a bomb zone, no burning on a column; geysers on the path and in the fields, sinking columns, the treasure islet with its row of columns), geysers spouting (warning, damage, quiet with nobody near), a sinking column (down into the lava, burning, up again, late join), the treasure (once, loot and xp), the crater arena (flat floor, moat open at the entrance, columns block), lava flows with basalt bridges, no lava hanging in the air (pool edges under the ground, vent cones), lava lakes and craters off paths and camps, cool camps, heat and fumaroles, no crust plates, the eruption cycle with lava bombs (never at the camp) and ash rain, ash rain on the wind (the eruption keeps its time, late join), ash hurting players out in it (grace time, floor, shelter at the camp and base, not creative), bombs hurting dinosaurs.
- `volcano-fruit.test.js` — the volcano's own fruit: placement (chilis on warm ground, plums in plum trees), eating effects and buffs (Fireproof, Quickfoot, Sharp Edge), the buffs and heat on the client, fruit plant meshes.
- `swamp-fruit.test.js` — the swamp's own fruit: placement by role, eating effects and buffs on the server (Mud Walker, Second Wind, Lotus Skin), the buffs on the client, fruit plant meshes.
- `swamp.test.js` — the Misty Swamp: hourglass outline and area, the arena as the only way through the waist (ring and waist walls, both gates open, trail through them), dry paths, shallow bogs, mangroves only at the bogs, dry hut/boat/relics/plots, -20 % for players and dinosaurs in bogs.
- `cave-level.test.js` — the Hollow Mountain over 16 variants: determinism, the maze (loops, dead ends, crystal halls, flooded branch, relics off the direct way), dry reachability over the real grid (rooms, relics, exit, boat), the east beach reachable only through the mountain by exactly one tunnel (no way round, no wading round), unclimbable walls, no unreachable floor pocket, roof >= 3.5 m over every walkable cell, flooded tunnels (swimmable, air gap, no water above dry floor), relics, torch spots, raptor spawns, cave decor (>= 4 m clear), server height cap and the controller's head bump.
- `levels.test.js` — island structure per level (all four) (hut beach, boat beach, reachable relic spots), boat repair and sailing to the next island, lava damage, winning on the last island.
- `boss-arena.test.js` — boss arena islet, causeway and fixed boss spawn; walking the causeway with the player controller.
- `grove.test.js` — giant's pen barrier: entry tests, shots stopped by `shotEnd`, titan only hurtable from inside.
- `water.test.js` — every waterfall forms an unbroken grotto -> fall -> basin -> river chain (incl. client `buildWater`).
- `spring-collision.test.js` — waterfall grotto SDF colliders vs. player controller and server movement checks.
- `props.test.js` — cave, ruins, boat, tree colliders and relic/prop meshes match (shared shapes + `src/client/models/props/*`); pines keep their needles over the trunk to the tip, without gaps.
- `traversal.test.js` — the player controller gets over every fallen trunk and ruin stone on real islands without server corrections.
- `swim.test.js` — swimming in rivers/lakes, climbing out on banks, sea stays blocked (PlayerController).
- `movement.test.js` — `resolveCircle`/`penetration`, player controller, server movement correction, unstuck (`src/sim/unstuck.js`), dinosaur spawn spots.

### Simulation: dinosaurs and combat (src/sim)
- `sarcosuchus-boss.test.js` — central island 2 boss spawn, harmless telegraphs, committed lunge dodges and miss recovery, shoulder shove, swept tail knockback, low-health chains, safe-zone exclusion, arena damage boundaries and no respawn; bank targeting across fifteen variants, backwards retreats, floating corpse continuity, late-join phase synchronization, vertical strike avoidance and emergence without shore-height pops.
- `dino-slopes.test.js` — dinosaurs run down steep slopes to players, climbing stays limited (`findPath`, `climbSlope`) over seeded island variants.
- `dino-contact.test.js` — player-vs-dinosaur body contact (`resolveDinoContact`) and contact damage events.
- `gloom-raptor.test.js` — Gloom Raptor config, noise hearing, cave-spot-only spawning, GLB clips.
- `raptor-fear.test.js` — raptor retreat/hesitation behaviour and raid raiders (`raptorBrain`, `raiderStep`).
- `stego-tail.test.js` — stegosaurus tail sweep geometry and hits (`stegoBrain`, `tailSweep`).
- `ptera-flight.test.js` — dead pteranodons fall with momentum and drop loot on impact (`DinoSystem`, `pteraBrain`).
- `netcode.test.js` — snapshot rate, far-dino snapshot thinning, lag-compensated hit checks and hit-zone plausibility (`hitCheck.js`).
- `world-authority.test.js` — server corrects teleports, validates spear and arrow hits.
- `firearms.test.js` — pistol/rifle actions, reload, fire rate under host ticks, gun grips (`src/sim/firearms.js` + client viewmodel/player model).
- `weapons.test.js` — client spear throw, bow/arrow/trap hand contacts and release sync (viewmodel, projectiles, player model).
- `projectile-recovery.test.js` — arrow/spear wear, refill, lodged spears and recovery (server + client `Items`).
- `butcher.test.js` — butchering carcasses, bones/skulls as loot, low-FPS client stroke/ring timing and completion versus cancellation.

### Simulation: progression, base and economy
- `skills.test.js` — skill tree data, XP/level math, buying, `sanitizeProfile`, `skillMods` (pure shared/skills.js).
- `skills-server.test.js` — server-side profile, XP awards, skill effects, downed and revive.
- `skills-movement.test.js` — skill effects on local movement: stamina, jumps, dash (PlayerController).
- `skills-ui.test.js` — profile persistence, profile in `hello`/`MSG.PROF`, skill panel view model (`src/client/core/profile.js`, `src/client/ui/skillModel.js`).
- `island-progress.test.js` — starting-island unlock persistence, monotonic completion, catalog bounds, corrupt/blocked storage, and locked-start restriction.
- `creative.test.js` — creative mode: all skills, free crafting, full supplies, boat repair without parts.
- `crafting.test.js` — workbench recipes, upgrades and their effects on the server.
- `base.test.js` — base building stages, costs, colliders, camp stations, towers.
- `raids.test.js` — raids on the team's base and base repair (`src/sim/raids.js`); four scoped random seeds include a narrow-channel navigation regression, with a focused continuous-path edge check.
- `inventory-drop.test.js` — dropping, picking up and depositing inventory stacks without duplication.
- `discovery-fruit.test.js` — fruit plant harvests/regrowth, shared dinosaur sightings, fruit plant visuals.
- `outfits.test.js` — outfit sanitizing, server outfit changes, player model outfits.

### Client (headless)
- `interpolation.test.js` — packet reordering, bounded extrapolation, short-path angle interpolation and bounded long-session snapshot storage.
- `resource-lifetime.test.js` — owned GPU resource disposal once across scenes, cache resource retention, shader uniform textures and per-instance buffer cleanup.
- `performance-samples.test.js` — frame-time percentiles expose stalls, remain bounded over long sessions and reject invalid timing samples; deterministic checks, not an FPS benchmark.
- `player-actions.test.js` — real PlayerActions input routing with headless viewmodel/effects: weapon resource handling and cooldowns, obstruction, reload rejection, fruit selection/giving, revive and butcher confirmation/cancellation, auto-loot capacities and request throttling, camp interactions, carry HUD and spotted compass markers.
- `tracking-minimap.test.js` — dinosaur discovery by sustained sighting, server sighting checks, minimap does not reveal the boss arena.
- `dino-visibility.test.js` — every server-spawned dinosaur type has an animated client model; damage events name the attacker.
- `sarco-client.test.js` — boss state/clip selection, authoritative phase sampling at late joins and five FPS, retrigger timing, directional size fitting, level torso/grounded feet and authored pose protection, missing-asset crocodile fallback and deep ambush hollows with dry causeway across 15 variants.
- `dino-glb.test.js` — GLB dinosaur loading, fallback and retry, clips and animation (`src/client/models/dino/*`).
- `dino-skin.test.js` — procedural skin loft faces outward.
- `audio.test.js` — complete audio catalog/provenance, sample variation/failures, positional creature layers and cleanup, mute and synthesized fallbacks, music transitions and boss-area music, footstep surfaces and cadence; HTTP serving of audio files.
- `creature-steps.test.js` — dinosaur species stride/weight profiles, walking/running cadence, oversized titan contacts, grounded gating, teleport cancellation and frame-rate independence.
- `graphics-tier.test.js` — automatic graphics tier choice and auto-tune.
- `frame-hitches.test.js` — frame-freeze guards: `requestPrograms` waits for linked programs, `WorldPost.compile` targets, `usesPost`, and no client code toggles a light's `visible`.
- `input-panels.test.js` — Escape/E panel handling, raw pointer-lock fallback/retry, focus/lock resets and cursor-warp rejection (`src/client/input/input.js`).
- `ordering.test.js` — packet ordering and action/state dependencies under unreliable transport (client `Net` + `ServerWorld`).

### Hosting and networking (server/, desktop/)
- `http-host.test.js` — real HTTP/WebSocket host with two co-op players routing firearm shots and reloads.
- `static-files.test.js` — static file responses: brotli/gzip bodies decode to the source, ETag answers 304, one-day caching for Three.js and the font, `index.html` carries `modulepreload` links for the menu graph but not for `core/game.js`, the menu background is a small WebP.
- `lan-address.test.js` — LAN address list, join-field parsing (`src/client/net/lan.js`), `/connection` port info.
- `internet-host.test.js` — internet relay admits only token WebSockets, control endpoint origin checks, startup failure and stop handling.
- `steam-coop.test.js` — `SteamSession` with a modelled Steam API: two players through the real game host, lobby caps, invalid lobbies, invites, renderer transport (`connectSteam`).

## Entry points
- `npm test` runs `node --test`, which discovers every `*.test.js` file here. A single file runs with `node --test test/<name>.test.js`.
- `npm run test:coverage` runs the same suite through c8. `.c8rc.json` includes all source modules, with unimported modules at zero; reports are in ignored `coverage/`. `npm run coverage:gaps -- <topic>` reads the last report and checks that no source file is missing. A focused report is not the full-suite baseline.
- There is no shared helper module; each file defines its own small fixtures (`setup()`, `fixture()`, `solo()` and similar).

## Rules
- Use `import test from 'node:test'` and `import assert from 'node:assert/strict'`; tests are flat `test('sentence describing the behaviour', ...)` calls.
- Import source modules by relative path (`../src/shared/...`, `../src/sim/...`, `../src/client/...`, `../server/...`, `../desktop/...`); no build step, no mocks library.
- Simulation tests create a real `ServerWorld` with a fake host, e.g. `new ServerWorld({ send: (to, msg) => messages.push(...) }, { level, variant })`, then drive it with real `MSG`/`ACT` messages (and `world.step()` where time must pass); assertions read world state or captured messages.
- Islands are picked by fixed `variant` seeds; rule checks that must hold everywhere iterate over many variants (seeded lists, so failures can be replayed). No test uses `Math.random`.
- Client tests run headless in Node: they use `three` objects without a renderer and temporarily stub globals (`document`, `addEventListener`, `fetch`, storage) and restore them afterwards.
- Network tests start real servers via `createGameServer()` listening on `127.0.0.1` port 0, and external dependencies (cloudflared process, DNS, Steam) are injected fakes.
- Conditionally disabled features use the `skip` option (e.g. cave checks skip while `CAVES_ENABLED` is false).

## Not here
- Code under test: `src/shared/`, `src/sim/`, `src/client/`, `server/`, `desktop/`.
- Asset and model tooling and opt-in measured gameplay/simulation benchmarks: `scripts/`. Browser/visual checks and hardware timing are outside this headless test suite; see `docs/performance-testing.md`.
