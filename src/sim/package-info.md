# src/sim
> The authoritative game simulation: one `ServerWorld` per session owns players, dinosaurs, items, missions and the team base, validates every client request and produces snapshots and events.

## Files
- Torch (in `world.js`): `placeTorches` puts one `torch` item at each `layout.torchSpots` entry (none elsewhere); pickup sets `inv.torch` (owners do not use it up), the spot refills `TORCH.respawnTime` after being taken, torch items never expire; `onState` accepts `PF.TORCH` only while `inv.torch`. The torch stays with the player across death and islands (inventory is kept).
- Diving (in `world.js`): `breathe` drains/refills `p.breath` by `terrain.headUnderwater` and drowns an empty diver (`CONFIG.player.dive`, creative never drowns); `onState` accepts states under the water surface (never below the bottom, vertical speed capped) and clears `PF.TORCH` under water; `placeSumpCaches` lays each sump's loot on its floor (`keep`: never despawns).
- Wall torches (in `world.js`): `wallTorchesLit` (a Set, reset per island); `ACT.LIGHT` accepts only a living player with `PF.TORCH` (owned, raised, not under water) within `WALL_TORCH.reach + 1` m, emits `EV.WALL_TORCH` once; `fullState()` carries `wallTorches`.
- `world.js` — `ServerWorld`: island loading, players, actions, inventory, combat validation, base, skills, tick and snapshots (see map below).
- `dinos.js` — `DinoSystem`: spawning, steering (20 % slower through swamp bogs, `Terrain.swampSpeedAt`) and lateral steps, local avoidance, stuck nudges, footprints (tracks), traps, damage, death, carcass loot, respawn, pose history; delegates behaviour to the brains in `ai/`. `walkable` also keeps dinosaurs under a roof they fit (Hollow Mountain). Swamp boss leashes permit inland swimming, constrain combat to Drowned Hollow, and bosses do not respawn. Their waterborne carcasses preserve the death position and settle slowly toward the surface.
- `ai/` — one behaviour "brain" per species (see `ai/package-info.md`).
- `pathfind.js` — `findPath`: coarse A* over walkable ground (4 m cells, cached directed segment checks between centers to avoid narrow water channels and ridges, bog cells weighted by their slower going, hot ground on the volcano avoided) for detours and raiders.
- `hitCheck.js` — `nearDino`, `plausibleZone`: plausibility checks for client-reported dinosaur hits.
- `firearms.js` — pistol/rifle: `gunInventory`, `gunAction` (validated hitscan shot and reload), `updateGunReload`.
- `mission.js` — `Mission`: boat-parts main quest per island (search -> repaired -> sailing) and the team contracts from the mission board.
- `raids.js` — `Raids` (scheduling, announcing, spawning, ending raids on the team base), `raidGroup`, `raiderStep` (raider movement/siege).
- `towers.js` — `updateTowers`, `hostile`: base defence towers pick and shoot hostile dinosaurs.
- `volcano.js` — `Volcano` (island 3, idle elsewhere): hot ground burns players (not with Fireproof), the eruption cycle calm -> rumble -> erupt (lava bombs near players and anywhere, never at the camp, base or boat; they hurt dinosaurs too) -> ash (dinosaurs see less far: `sightMul`), the mountain path's bomb zone (bombs ahead of whoever climbs it, eruption or not), lava geysers (bubble, then spout: they burn and throw back players and dinosaurs; only near players), sinking columns (stood on: down under the lava and up again, their colliders with them), the lava lake treasure (loot and xp, once), and ash rain on the wind between eruptions (the eruption keeps its time); out in the ash a player loses health after a grace time, never below a floor (the camp and the base plots shelter: `ashShelter`); `public()` (phase, what brought the ash) for late joiners.
- `unstuck.js` — `standable`, `goodSpot`, `findUnstuckSpot`: nearest safe spot for the "get unstuck" action.
- `worker.js` — Web Worker host for solo play: runs `ServerWorld` on a timer and relays messages to the page.
- Fixed maps: `#loadLevel` builds the level's `levelDef(i).variant` (start and `nextLevel`); only the start island takes an `opts.variant` override.
- Dev tools: the worker passes `?variant=N` through (overrides the fixed map) and sets `world.devTools` for `?dev`; only then does `ACT.DEV_TP` (creative only) teleport, for the dev pin tool. Hosted servers never set it.

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
- fruit: `applyFruit` (heal, heal over time, fruit buffs in `p.buffs`, e.g. Lotus Skin's lower damage in `hurtPlayer`), `buffsLeft` (sent with every inventory), `bestFruitIndex`.
- tick: `step(dt)` (player upkeep, eating/regen/aura, lava, relic pickup, campfire healing, fruit regrowth, item/projectile/track expiry, then dinos, towers, raids, volcano, dino history, player-dino contact, mission), `snapshotDue`, `hitPose`, `snapshot`, `fullState`.

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
