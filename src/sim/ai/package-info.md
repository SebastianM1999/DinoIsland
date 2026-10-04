# src/sim/ai
> Per-species behaviour "brains" for the server-side dinosaurs: when to wander, graze, chase, attack, defend, flee or rest.

## Files
- `brachio.js` — `brachioBrain`: peaceful herds that wander and graze, flee together, and defend with a telegraphed rear-up stomp when a player gets close or attacks; also spawns the oversized titan leashed inside the giant's pen (`layout.grove`, `shared/grove.js`).
- `stego.js` — `stegoBrain`: territorial grazer that gets angry, charges in bursts and whips its spiked tail (swept-arc hitbox taken from the baked Attack clip); counters hits from the front. Exports `tailSweep`, `tailRelative` (tail geometry helpers, also used by tests).
- `raptor.js` — `raptorBrain`: pack hunter (packs stored in `sys.groups`; sight shortened in the volcano's ash rain, `world.sightMul`) that spots, chases, flanks and does hit-and-run bites; hits frighten it briefly. Exports `updateRaptorFear`, shared with raiders.
- `trex.js` — `trexBrain`: rare apex predator patrolling `layout.trexPatrol` (sight shortened in the ash rain), roars, chases for a limited time, bites hard (wind-up), then rests.
- `ptera.js` — `pteraBrain`: nests on cliffs, circles areas of the island, dives at players (prefers lone, injured or meat-carrying ones), knocks them down, steals carried meat and flies off; does its own 3D flight (`flyTo`).

## Entry points
- Each file exports one brain object with this optional interface, called only by `DinoSystem` in `src/sim/dinos.js` (registered in its `BRAINS` map):
  - `spawnInitial(sys)` — from `DinoSystem.spawnAll()` for each new island.
  - `respawn(sys, r)` — when a respawn entry is due.
  - `init(d, sys)` — on `DinoSystem.spawn`, sets per-animal state.
  - `onStuck(d, sys)` — after the dino system nudged a stuck animal (not implemented by ptera).
  - `onHurt(d, sys, byId, dmg, weapon)` — after damage that did not kill.
  - `update(d, sys, dt)` — every tick, unless the animal is a raider handled by `raiderStep` (`src/sim/raids.js`).
- `updateRaptorFear` is also called from `raiderStep` in `src/sim/raids.js`.
- `sys` is the `DinoSystem`; brains use its helpers (`steer`, `halt`, `turnTo`, `nearestPlayer`, `distTo`, `canReach`, `attackPlayer`/`hitPlayer`, `inSafeZone`, `roar`, `randomWalkablePoint`, `fleePoint`, `spawn`, `groups`) and reach the world through `sys.world`.

## Rules
- Brains import only from `src/shared/` (config, protocol `DS`/`EV`/`MSG`, `rng`, `grove`, `island`); no imports from other sim files or the client.
- Species tuning comes from `CONFIG.dinos.<type>` (bound as `C` at the top of each file); fixed animation-derived timings (e.g. stego `TAIL_TIME`, `SWEEP`) are kept in sync with the baked clips named in the comments.
- Brains set the network-visible state `d.st` from `DS` and flag bit `d.fl & 1` for "aggressive/defending"; `towers.js` `hostile()` reads both.
- Player damage goes through `DinoSystem.hitPlayer` / `attackPlayer` (reach check past trees, knockback, then `world.hurtPlayer`); brains never set player HP directly. Respecting the base safe zone is each brain's job (`sys.inSafeZone`). Exception to keep in mind: the pteranodon takes stolen meat straight from `p.inv.loot.meat`.
- Ground movement goes through `sys.steer` / `sys.move` (collision, walkability, slopes, grove/boss-arena exclusion); only the pteranodon moves itself in the air.
- The grove titan is a "herd of one" with a `leash`; `DinoSystem.walkable` keeps it inside the pen and everyone else out.

## Not here
- Shared movement, collision, traps, tracks, damage, death/loot and respawn scheduling: `src/sim/dinos.js`.
- Raid behaviour (attacking the base, retreating): `src/sim/raids.js`.
- Client-side dinosaur animation, hit spheres and interpolation: `src/client/entities/dinoViews.js` and `src/client/models/dino/`.
- Species numbers (speed, health, radius, damage): `src/shared/config.js`.
