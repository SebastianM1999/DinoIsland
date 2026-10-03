# src/sim
> The authoritative game simulation: one `ServerWorld` per session owns players, dinosaurs, items, missions and the team base, validates every client request and produces snapshots and events.

## Files
- `world.js` — `ServerWorld`: island loading, players, actions, inventory, combat validation, base, skills, tick and snapshots (see map below).
- `dinos.js` — `DinoSystem`: spawning, steering and local avoidance, stuck nudges, footprints (tracks), traps, damage, death, carcass loot, respawn, pose history; delegates behaviour to the brains in `ai/`.
- `ai/` — one behaviour "brain" per species (see `ai/package-info.md`).
- `pathfind.js` — `findPath`: coarse A* over walkable ground (4 m cells) for detours and raiders.
- `hitCheck.js` — `nearDino`, `plausibleZone`: plausibility checks for client-reported dinosaur hits.
- `firearms.js` — pistol/rifle: `gunInventory`, `gunAction` (validated hitscan shot and reload), `updateGunReload`.
- `mission.js` — `Mission`: boat-parts main quest per island (search -> repaired -> sailing) and the team contracts from the mission board.
- `raids.js` — `Raids` (scheduling, announcing, spawning, ending raids on the team base), `raidGroup`, `raiderStep` (raider movement/siege).
- `towers.js` — `updateTowers`, `hostile`: base defence towers pick and shoot hostile dinosaurs.
- `unstuck.js` — `standable`, `goodSpot`, `findUnstuckSpot`: nearest safe spot for the "get unstuck" action.
- `worker.js` — Web Worker host for solo play: runs `ServerWorld` on a timer and relays messages to the page.

### Areas inside `world.js` (~1500 lines, find by the `// ----- <area>` banners)
- constructor / `#loadLevel` / `nextLevel`: builds terrain + layout from `shared/` (`planIsland`, `buildLayout`), resets per-island state; `worldEpoch` bumps per island.
- players: `join`, `leave`, `freshInventory`, `caps`, `carryWeight`, `hurtPlayer`.
- knife: butchering carcasses (`startButcher`/`updateButcher`); successful completion emits `EV.BUTCHER` with `done: true`, cancellation omits it.
- downed/revive/death: `killPlayer`, `downPlayer`, `defeatPlayer`, `startRevive`/`updateRevive`, `updateDowned`, `respawnPlayer`.
- skills / XP: `awardXp`, `skillAction`, `refreshMods`, `grantDash`, `damageMul`, `sendProf`.
- base: `stations`, `safeZone`, `baseAction`, `towerAction`, `repairBase`, `finishBuilding`, `pay`, `creativeSupply`.
- messages: `receive` -> `onState` (movement validation: move budget, collision, sea, grove barrier, epoch/sequence), `receiveAction` (validates the bundled state, replays against state history for overtaken packets), `onAct` (one `case ACT.*` per action: creative, spot, shot/reload, melee, fire/land, pickup, harvest, eat, give, trap, drop, deposit, outfit, repair, unstuck, butcher, refill, craft, base, skill, revive, dash, respawn).
- `craft`, `validMeleeHit`, `validProjectileLanding`, `canSpotDino`, `groveBlocks`, `unstuck`.
- items: `spawnItem`, `removeItem`, `dropInventoryItem`, `dropLoot`, `addTrack`.
- tick: `step(dt)` (player upkeep, eating/regen/aura, lava, relic pickup, campfire healing, fruit regrowth, item/projectile/track expiry, then dinos, towers, raids, dino history, player-dino contact, mission), `snapshotDue`, `hitPose`, `snapshot`, `fullState`.

## Entry points
- `ServerWorld` (`world.js`): constructed by `server/gameHost.js` (online/LAN/Steam host) and by `worker.js` (solo). Hosts call `join`, `leave`, `receive(id, msg)`, `step(dt)` at `CONFIG.net.tickRate`, `snapshotDue(dt)` + `snapshot()`, and supply `host.send(to, msg, except)`.
- `worker.js`: started by `Net.local` in `src/client/net/net.js` via `new Worker(new URL('../../sim/worker.js', ...))`; page messages `start` / `msg` / `stop`.
- Many tests in `test/` import `ServerWorld` and individual modules directly (`findPath`, `climbSlope`, `gunAction`, `nearDino`, `RAID`, `raiderStep`, brains).

## Rules
- Imports only from `src/shared/` and within `src/sim/`; never from `src/client/` or `server/`.
- `world.js` and its dependencies use no Node or browser APIs (header contract). Only `worker.js` touches worker globals (`postMessage`, `onmessage`, `performance`, `setInterval`).
- The server is authoritative: clients send state and requests (`MSG.STATE`, `MSG.ACT`); the sim validates movement (`onState`), action origin, hit plausibility and costs, and answers with `MSG.CORRECT`, events or nothing.
- Every outgoing message gets the current `worldEpoch` as `w` (`send`/`broadcast`); a new island bumps it.
- Lag compensation is bounded: `hitPose` clamps the client render time to `CONFIG.net.lagCompMax`; `DinoSystem.recordHistory` keeps just that much pose history.
- Tick and snapshot rates come from `CONFIG.net.tickRate` / `CONFIG.net.snapshotRate`; far dinosaurs are only sent every `CONFIG.net.farSnapshotEvery` snapshots.
- New species behaviour belongs in an `ai/*.js` brain registered in `BRAINS` in `dinos.js`, not in `DinoSystem.update`.
- Searches that run inside a tick must stay bounded (`MAX_NODES` in `pathfind.js`).

## Not here
- Rules and data shared with the client (config, protocol constants, terrain, layout, collision, skills, crafting, base costs, grove, relics, missions): `src/shared/`.
- WebSocket/Steam hosting, lobby, timeouts: `server/` (`gameHost.js`) and `desktop/`.
- Anything visual, audio or input: `src/client/`.
