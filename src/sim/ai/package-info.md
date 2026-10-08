# src/sim/ai
> Per-species behaviour "brains" for the server-side dinosaurs: when to wander, graze, chase, attack, defend, flee or rest.

## Files
- `sarcosuchus.js` — `sarcosuchusBrain`: one Alpha Sarcosuchus in island 2's central Drowned Hollow; submerged warnings, committed lunges with miss recovery, bite/shove pressure, swept tail hits, bounded pivots and lateral steps, water retreats and low-health bite/pivot/tail chains. Exports `SARCO_TIMING`, `sarcoMouthHit`, `sarcoTailSweep` for clip synchronization and combat tests; `sarcoGroundHeight` resolves absolute water support after movement so bank height is not added twice (the shared maths lives in `aquatic.js`). Emergence stays low for the full warning and rises smoothly with the committed surge; model length/height scales affect reach and immersion without shrinking width.
- `aquatic.js` — helpers shared by the water ambushers (Alpha Sarcosuchus, Sump Lurker): `toYaw`, `phase`, `submergeToward`/`flagSubmerged`, `aquaticGroundHeight`, `carcassSurface`, `mouthCapsuleHit`. Species opt in with `CONFIG.dinos[type].aquatic` (`maxWaterDepth`, `submerge {shallow, range}`, `carcassDepth`, `phaseClips`); `DinoSystem` reads the same flag for swimming and floating carcasses.
- `sumpLurker.js` — `sumpLurkerBrain`: the cave ambusher of flooded tunnels. Lies submerged (`DS.SUBMERGED`), creeps through its own water toward prey, lunges (0.6 s wind-up, 0.7 s strike, `LURKER_TIMING` synced to `SumpLurker_Attack`) at players who swim or stand within `edge` m of deep water inside `lungeRange`, drags back to the water afterwards and retreats when hurt. Leashed to its spawn pool (`d.leash`), no boss rules (no phases, bar or arena), normal respawn. Spawns only at flooded `layout.caveDinoSpots` (`floodedSpot`: truthy `water`/`flooded` or deep water at the spot), count from `level.dinos['sump-lurker']`.
- `crystalPlodder.js` — `crystalPlodderBrain`: the armoured cave herbivore. Grazes in its hall (`plodderChambers`, one per hall), peaceful until hit or crowded (`angerRadius` 3 m), then bellows, turns its rump on the offender, swings the club tail (`clubSweep`/`PLODDER_TIMING` measured from `CrystalPlodder_Attack`, strong damage + knockback) or charges a short burst at attackers out of reach, and calms after `calmTime`. 600 HP.
- `territorial.js` — helpers shared by the stego and the plodder: `makeTailSweep` (swept tail hitbox from a baked clip), `rearYaw`, `grazeWander` (calm graze/wander loop).
- `brachio.js` — `brachioBrain`: peaceful herds that wander and graze, flee together, and defend with a telegraphed rear-up stomp when a player gets close or attacks; also spawns the oversized titan leashed inside the giant's pen (`layout.grove`, `shared/grove.js`).
- `stego.js` — `stegoBrain` (tail maths via `territorial.js`): territorial grazer that gets angry, charges in bursts and whips its spiked tail (swept-arc hitbox taken from the baked Attack clip); counters hits from the front. Exports `tailSweep`, `tailRelative` (tail geometry helpers, also used by tests).
- `raptor.js` — `raptorBrain`: pack hunter (packs stored in `sys.groups`; sight shortened in the volcano's ash rain, `world.sightMul`) that spots, chases, flanks and does hit-and-run bites; hits frighten it briefly. Exports `updateRaptorFear` (shared with raiders), `packHunterBrain(type, species, acquire)` (the pack brain, reused by `gloomRaptor.js`) and `spawnPack`.
- `gloomRaptor.js` — `gloomRaptorBrain`: the cave raptor kin; same pack logic as the raptor (`packHunterBrain`) but it notices players by NOISE (`noiseRadius`: walking quiet, sprinting loud, gunfire/arrows loudest via `player.lastShotAt`) or by touching distance, not by sight. `noticesLight(d, player)` is the (currently false) hook for the future torch feature. Packs spawn only at `layout.caveDinoSpots` `[{x, z, radius}]`, the count comes from `level.dinos['gloom-raptor']`; on levels without cave spots nothing spawns.
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
- Brains import only from `src/shared/` (and `gloomRaptor.js` from its sibling `raptor.js` for the shared pack-hunter brain) (config, protocol `DS`/`EV`/`MSG`, `rng`, `grove`, `island`); no imports from other sim files or the client.
- Species tuning comes from `CONFIG.dinos.<type>` (bound as `C` at the top of each file); fixed animation-derived timings (e.g. stego `TAIL_TIME`, `SWEEP`) are kept in sync with the baked clips named in the comments.
- Brains set the network-visible state `d.st` from `DS` and flag bit `d.fl & 1` for "aggressive/defending"; `towers.js` `hostile()` reads both.
- Player damage goes through `DinoSystem.hitPlayer` / `attackPlayer` (reach check past trees, knockback, then `world.hurtPlayer`); brains never set player HP directly. Respecting the base safe zone is each brain's job (`sys.inSafeZone`). Exception to keep in mind: the pteranodon takes stolen meat straight from `p.inv.loot.meat`.
- Ground movement goes through `sys.steer` / `sys.move` (collision, walkability, slopes, grove/boss-arena exclusion); only the pteranodon moves itself in the air.
- The grove titan is a "herd of one" with a `leash`; `DinoSystem.walkable` keeps it inside the pen and everyone else out. The Alpha Sarcosuchus has a `leash.kind: 'swamp'` in Drowned Hollow and may enter its deep inland ambush pockets; combat outside that arena is blocked. Attack events carry `kind`, `duration` and `phase: {clip, started, duration, seq}`; the phase uses the authoritative world clock, so snapshots and late joins seek past elapsed wind-ups. Boss snapshot rows append the four phase fields after the normal nine fields; other species retain their row shape. The submerged and enraged flags use bits 8 and 16 respectively.

## Not here
- Shared movement, collision, traps, tracks, damage, death/loot and respawn scheduling: `src/sim/dinos.js`.
- Raid behaviour (attacking the base, retreating): `src/sim/raids.js`.
- Client-side dinosaur animation, hit spheres and interpolation: `src/client/entities/dinoViews.js` and `src/client/models/dino/`.
- Species numbers (speed, health, radius, damage): `src/shared/config.js`.
