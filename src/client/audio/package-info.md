# audio
> All game sound on the client via Web Audio: recorded effects and footsteps, synthesized fallback/UI cues, positional 3D audio (including distinct Sarcosuchus attack wind-up cues), water and shore ambience, and adaptive island/menu/boss music.

## Files
- `audio.js` — `GameAudio`: the audio graph (master, sfx, music, ambience buses), `play(name, opts)` (synthesized fallbacks, and the volcano's own: `rumble`, `eruption`, `bombWhistle`, `bombImpact`, `geyserBubble`, `geyserBlast`, `columnCrack`, `treasure`), listener updates, ambience and water loops (and the ash rain's wind: `update({ ash })`), music control; follows volume settings.
- `catalog.js` — sample file catalog: `FOOTSTEPS` / `RUN_FOOTSTEPS` per surface, `STEP_TEXTURES` / `DINO_WEIGHT` for optional recorded layers, `SAMPLE_GROUPS` for complete preload/provenance checks, `EFFECTS` per sound name, `ISLAND_MUSIC` (jungle/volcano calm+danger; the swamp borrows the volcano's), `MENU_MUSIC`, `BOSS_MUSIC`, `musicLoopStart`, `effectGroup()`.
- `music.js` — `IslandMusic`: owns music sources across Game instances, crossfades calm/danger/boss/menu tracks (`MUSIC_FADE`, `DANGER_HOLD`).
- `samples.js` — `SampleBank` (deduplicated fetch + decode, failures remembered for the session) and `SamplePicker` (variation picking).
- `steps.js` — `StepCadence`: distance-driven footstep trigger (silent when blocked or airborne; no bursts after teleports).
- `creatureSteps.js` — `CreatureStepCadence` and `CREATURE_STEP_PROFILES`: distance-driven contacts for every dinosaur, species gait/relative sound weight and oversized titan strides; silent when dead, trapped, airborne or swimming and after teleports.
- `surface.js` — `footstepSurface()` picks the footstep surface (wood, rock, water, sand, mud – also in swamp bogs –, dirt, gravel, leaves, grass); `woodSupports()` filters standable log colliders.
- `region.js` — `inBossMusicArea()`: whether the player is in a boss arena (jungle lava islet or swamp kettle) or on the jungle causeway, with an exit margin.

## Entry points
- `main.js` creates a `GameAudio` for the menu (unlocked on a user gesture) and passes it to `Game` for reuse; `core/game.js` creates one if none is given and calls `play`, `setIsland`, `setListener`, `update(dt, { coast, water, danger, bossArea })`, `startMusic`/`stopMusic`, `resume`.
- `core/game.js` also uses `StepCadence`, `footstepSurface`, `woodSupports` and `inBossMusicArea`.
- `entities/gunEffects.js` plays shot sounds through `game.audio.play(kind, { pos })`.
- `test/audio.test.js` covers catalog, music, samples, steps, surface and region.

## Rules
- Audio only reads state; it never changes gameplay. `surface.js` and `region.js` are audio-only queries: terrain, collision and `shared/` geometry (`shared/collision.js`, `shared/bossArena.js`) stay the source of truth, and these files reuse them rather than defining their own shapes.
- Sound names used by callers must exist in `EFFECTS` (or be `step` with a `FOOTSTEPS` surface) to play a recorded sample; otherwise (or when the sample failed to load) `play()` falls through to the synthesized `switch` cases in `audio.js`.
- Sample URLs point to `/assets/audio/sfx/` and `/assets/audio/music/`; adding a sound means adding the file and the catalog entry together.
- `dinoStep` layers an actual terrain contact with species/size weight treatment; only T-Rex uses the approved W2 thump. Every layer preserves the caller's position and effects bus, and disconnects its source/filter/panner when finished. Per-entity throttling allows simultaneous nearby animals.
- Approved opening footstep contacts are reused for running with more weight and faster distance-driven timing; playback never loops a multi-step recording. All active recorded layers belong in `SAMPLE_GROUPS`, and provenance/cuts belong in `assets/audio/sources.json`.
- `SampleBank` never retries a failed URL within a session and never throws to callers (resolves `null`).
- `IslandMusic` is shared across Game instances; stale loads from an old session must not restart music (generation counter).
- Volumes come from `core/settings.js` (`onSettings`, `audioGains`) and `CONFIG.audio`; no other volume storage here.
- `GameAudio` is a no-op when the browser has no `AudioContext` (`this.ok === false`) and plays nothing until the context is running.

## Not here
- Deciding when sounds happen (events, hits, roars, footsteps): `client/core/game.js`, `client/entities/`, `client/player/`.
- Audio settings UI: `client/ui/menus.js`; settings storage: `client/core/settings.js`.
- Audio asset files: `assets/audio/` at repo root.
- Boss arena geometry: `src/shared/bossArena.js`.
