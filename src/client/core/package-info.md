# src/client/core
> The client's game shell and rendering foundation: the per-island `Game` that wires every client subsystem together and runs the frame loop, plus renderer, graphics tiering, settings, saved profile and GPU-resource lifetime.

## Files
- `game.js` — `Game`: one instance per island; builds the world view, owns player, systems, HUD panels, audio and the `requestAnimationFrame` loop (see map below).
- `renderer.js` — `Renderer`: Three.js WebGL renderer (ACES tone mapping, sRGB, shadows), sun + hemisphere lights, biome sky/fog blending, world pass (optionally scaled + contact AO via `WorldPost`) and a second viewmodel pass; `prepare` (shader precompile against the real render target, then one hidden warm-up frame); live switches of render scale / contact shading / shadow tier compile their programs in the background first.
- `worldPost.js` — `WorldPost`: offscreen world render target with upscaling/sharpening and depth-based contact AO (`compile` warms its two passes); `usesPost(scale, ao)`: whether the world draws into that target.
- `programs.js` — `requestPrograms(renderer, scene, camera)`: asks for a scene's shader programs for the current target/shadow state and resolves once they are linked (parallel to drawing).
- `graphicsTier.js` — `TIERS`, `GraphicsAutoTune`, `guessTier`, `decide`, `gpuName`: automatic graphics level per GPU, measured in-game and stored per GPU.
- `gpuTimer.js` — `GpuTimer`: non-blocking GPU frame time via `EXT_disjoint_timer_query_webgl2`.
- `settings.js` — `settings`, `SETTING_DEFS`, `setSetting`, `resetSettings`, `onSettings`, `audioGains`, `FPS_LIMITS`: player preferences in localStorage with change listeners.
- `profile.js` — `loadProfile`, `saveProfile`, `PROFILE_KEY`: the XP/skills save carried by the client and sent in `hello`.
- `resources.js` — `retainResource`, `retainObjectResources`, `disposeIslandScenes`: marks cache-owned GPU resources and disposes everything else when an island is torn down.

### Areas inside `game.js` (~1000 lines)
- constructor: terrain/layout from `welcome.world.level`, reuse of `gfx`/`audio`/`input`, `PlayerController`, skill mods, grove barrier, `StuckDetector`, HUD + minimap, `input.onPanelToggle` (which panel E/Tab/M/K/Esc opens or closes), systems list `[DinoViews, Tracks, Items, PlayerActions, Projectiles, Relics]`, panels (wardrobe, boat, crafting, base, skills, grove prompt) whose callbacks send `ACT.*`.
- `#buildWorld`: adds all `world/` builders to the scene, `worldUpdaters`, F3 collider debug view.
- network (`#applyWelcome`, `#bindNet`): handlers for `WELCOME` (new island), `SNAP` (own HP/max HP/downed, remote rows, then `sys.onSnapshot`), `INV`, `PROF`, `CORRECT` (snap body, glide camera via `corrOffset`), and events: relic, boat, XP, join/leave, outfit, fruit, toast, full, item remove, trap snap, mission, store, base, raid, tower shot, hurt, death, down, revive, revived, respawn; disconnect -> `onLeave`.
- mission / base / crafting sync: `#showMission`, `setBase`, `#syncBase`, `#syncCrafting`, `stations`, `open*` helpers.
- skills / downed: `#setProfile`, `mods`, `maxHp`, `#setDowned`, `#syncDowned`, `setCreative`.
- loop: `start`, `stop`, `dispose` (returns `{gfx, audio, input}` for the next island), `loop` (FPS cap, update, render, perf stats), `update(dt)` (look, movement + dino contact prediction, unstuck, camera, send state at `CONFIG.net.clientSendRate`, remote/world/system updates, HUD at 30 Hz, audio).
- mood/audio: `#mood` (boss-arena sky blend), `#updateAudio`, water splashes/soundscape, danger music, dino sound hooks (`onRoar`, `onDinoAttack`, ...).
- HUD/camera: `#updateHud`, `#updateSkillHud`, `compassMarkers`, `#updateCamera`.

## Entry points
- `Game` is constructed and started by `src/client/main.js` (`launch`), which also calls `gfx.prepare()`, `dispose()`, `setCreative()` and sets `onLeave`, `onNewIsland`, `onPanelChange`.
- Systems receive the `Game` instance (`new DinoViews(this)` etc.) and may implement `onWelcome`, `onSnapshot`, `update(dt, renderTime)`, `minimapMarkers`, `compassMarkers`.
- `Renderer` is also used by `src/client/player/weapon-preview.js`.
- `settings.js` is used by `audio/audio.js`, `player/controller.js`, `ui/menus.js`; `profile.js` by `main.js` and `net/net.js`; `retainResource*` by model caches in `models/` and `entities/`.

## Rules
- `Game` never mutates authoritative state locally; it sends `net.act(ACT.*)` / `net.sendState` and applies what the server returns (only own movement is predicted).
- Everything island-specific created by a `Game` must be released in `Game.dispose()`; the renderer, audio and input survive across islands.
- `onDinoStep` classifies actual ground support with the player terrain helper and passes species, movement and model size to positional dinosaur audio; grounded contacts come from `DinoView` interpolation, not mesh visibility.
- Geometry/materials/textures owned by a reusable model cache must be marked with `retainResource`/`retainObjectResources`, otherwise `disposeIslandScenes` disposes them at the next island.
- Frame hitches are almost always shader recompiles: a program is specific to the render target (canvas vs. `WorldPost` target), the shadow setting and the number of visible lights. Never toggle a light's `visible` (keep intensity 0 instead), compile anything that can change these in `Renderer` first (`prepare`, `#compilePath`, `#compileShadowVariant`), and give things that first appear in play a hidden copy that the warm-up frame draws (see `Items`). `prepare` draws hidden objects too (not lights).
- Graphics tier is never chosen by the player; render scale and contact shading are the only graphics sliders (`SETTING_DEFS`).
- localStorage access goes through `storageKey()` and is guarded with try/catch (`settings.js`, `profile.js`, `graphicsTier.js`).
- The saved profile is untrusted: the server re-validates it (`sanitizeProfile`).

## Not here
- Individual systems: dinosaurs/items/projectiles/tracks/relics in `entities/`, player actions/movement in `player/`, panels and HUD in `ui/`, island meshes in `world/`, sound in `audio/`.
- Transport, clock sync and snapshot ordering: `net/`.
- Menu/lobby flow before a `Game` exists: `src/client/main.js`.
