# src/client/core
> The client's game shell and rendering foundation: the per-island `Game` that wires every client subsystem together and runs the frame loop, plus renderer, graphics tiering, settings, saved profile and GPU-resource lifetime.

## Files
- `lightPool.js` — `LightPool` (fixed PointLights, `set(i,x,y,z,intensity)`, `off(i)`); `Renderer.addLightPool(name, opts)` must be called while the island is built, before `prepare()` (returns null and warns later); `gfx.lightPools` (Map). The viewmodel scene always has one torch glow light (`gfx.viewTorch`). Other agents (crystals) add pools the same way.
- `game.js` — `Game`: one instance per island; builds the world view, owns player, systems, HUD panels, audio and the `requestAnimationFrame` loop (see map below).
- `renderer.js` — `Renderer`: Three.js WebGL renderer (ACES tone mapping, sRGB, shadows), sun + hemisphere lights, biome sky/fog blending, world pass (optionally scaled + contact AO via `WorldPost`) and a second viewmodel pass; `prepare` precompiles shaders against the real render target, then uploads meshes in hidden batches with yields between draws; live switches of render scale / contact shading / shadow tier compile their programs in the background first.
- `shadowCadence.js` — `ShadowCadence`, `SHADOW_HZ`: when `Renderer.render` redraws the sun's shadow map: every frame up to 60 FPS, a steady 60 Hz (phase kept) above it, at once when forced (`#applyShadow`). Following the player never forces a redraw: the shadow matrix only changes when the map is drawn, so map and matrix stay in step.
- `worldPost.js` — `WorldPost`: offscreen world render target with upscaling/sharpening and depth-based contact AO (`compile` warms its two passes); `usesPost(scale, ao)`: whether the world draws into that target.
- `programs.js` — `requestPrograms(renderer, scene, camera)`: asks for a scene's shader programs for the current target/shadow state and resolves once they are linked (parallel to drawing).
- `graphicsTier.js` — `TIERS`, `GraphicsAutoTune`, `guessTier`, `decide`, `gpuName`: conservative initial graphics level, measured in-game and stored per GPU with `CALIBRATION_VERSION`; saved calibration is rechecked each session and after sustained slowdown. Visible long frames remain evidence; hidden tabs discard the measurement window. Tiers control world-target MSAA, pixel ratio and foliage shadow policy without overwriting player settings.
- `gpuTimer.js` — `GpuTimer`: non-blocking GPU frame time via `EXT_disjoint_timer_query_webgl2`.
- `settings.js` — `settings`, `SETTING_DEFS`, `setSetting`, `resetSettings`, `onSettings`, `audioGains`, `FPS_LIMITS`: player preferences in localStorage with change listeners.
- `persistence.js` — `storage` (localStorage-shaped; the desktop's `window.dinoStore`, file-backed, else the browser's localStorage, looked up per call), `readItem` / `writeItem` (blocked storage tolerated), `migrateLocalPreferences` (desktop: carries name/outfit/settings/pockets/calibration from an older build's localStorage once; never XP or skills), `guestCredential` / `rememberGuestCredential` (the credentials hosts issued this player, per expedition UUID, newest 40).
- `islandProgress.js` — which island a new expedition may start on: the first, or any while the temporary `TEST_ALL_ISLANDS_UNLOCKED` playtest access is on. Island progress itself belongs to each expedition (its save).
- `resources.js` — `retainResource`, `retainObjectResources`, `disposeIslandScenes`: marks cache-owned GPU resources and disposes everything else when an island is torn down.

### Areas inside `game.js` (~1000 lines)
- constructor: terrain/layout from `welcome.world.level`, reuse of `gfx`/`audio`/`input`, `PlayerController`, skill mods, grove barrier, `StuckDetector`, HUD + minimap, `input.onPanelToggle` (which panel E/Tab/M/K/Esc opens or closes), systems list `[DinoViews, Tracks, Items, PlayerActions, Projectiles, Relics]`, panels (wardrobe, boat, crafting, base, skills, grove prompt) whose callbacks send `ACT.*`.
- `#buildWorld`: cooperatively builds terrain and vegetation, adds each completed `world/` builder to the scene, `worldUpdaters`, F3 collider debug view. `Game.create` also schedules deterministic terrain rows and layout placement searches; cancelling construction releases partial scenes.
- network (`#applyWelcome`, `#bindNet`): handlers for `WELCOME` (new island), `SNAP` (own HP/max HP/downed, remote rows, then `sys.onSnapshot`), `INV`, `PROF`, `CORRECT` (snap body, glide camera via `corrOffset`), and events: relic, boat, XP, join/leave, outfit, fruit, map resource, bow found, toast, full, item remove, trap snap, mission, store, base, raid, tower shot, hurt, death, down, revive, revived, respawn; disconnect -> `onLeave`.
- mission / base / crafting sync: `#showMission`, `setBase`, `#syncBase`, `#syncCrafting`, `stations`, `open*` helpers.
- skills / downed: `#setProfile`, `mods`, `maxHp`, `#setDowned`, `#syncDowned`, `setCreative`.
- loop: `start`, `stop`, `dispose` (returns `{gfx, audio, input}` for the next island), `loop` (FPS cap, update, render, perf stats), `update(dt)` (look, movement + dino contact prediction, unstuck, camera, send state at `CONFIG.net.clientSendRate`, remote/world/system updates, HUD at 30 Hz, audio).
- mood/audio: `#mood` (boss-arena sky blend), `#updateAudio`, water splashes/soundscape, danger music, dino sound hooks (`onRoar`, `onDinoAttack`, ...).
- HUD/camera: `#updateHud`, `#updateSkillHud`, `compassMarkers`, `#updateCamera`.
- `cutscene.js` — `Cutscene`: plays a shot list on the camera (`shotPose`: eased glide from pose to pose, fades from/to black, a line of text; `shotsLength`, `lookPoint`); a DOM overlay (black, text, "Hold Space to skip" bar: `SKIP_HOLD`); its own props (`actors`) are removed at the end; `update(dt, skipHeld)` each frame, `end(skipped)`.
- `storyShots.js` — the story's shot lists from the layout: `introShots` (island 1: dark surf, a glide over the sea to the explorer lying on the beach, waking up; ends exactly in the player's view at the spawn) and `outroShots` (out to sea from the boat, the island behind, black with a last line).
- `devPins.js` — dev pin tool (`?dev` or `?pin=` in the URL, solo; installed by `main.js`): F8 captures where you stand and look, what the crosshair hits (object path, mesh, material, face, instance), terrain/cave facts there and at the player, level/variant/seed, graphics stats and a screenshot, asks for a note and posts it to the dev server (`server/devPins.js`). Draws red markers for pins of the current layout; `?island=N&dev&pin=<id>` revisits a pin (creative, `ACT.DEV_TP`); `revisitUrl` adds `&variant=V` only for a pin taken on a `?variant` override.

- Sniper camera recoil/shake is applied after the base camera pose and system updates; viewmodel sunlight follows the final view rotation. Scope FOV is applied from PlayerActions.scope after system updates, over a separately damped hip FOV. Mouse sensitivity follows the optical magnification. Game disposal releases actions-owned scope DOM and scheduled sounds.
- Cutscenes (`#playCutscene`, core/cutscene.js): while one plays the HUD and the viewmodel pass are hidden, the player cannot move and the camera follows the shots after `#updateCamera`; Space held skips. `start()` plays the intro on island 1 while the expedition has not seen it (`world.story.introSeen`, then `ACT.INTRO`); the mission event of the escape (`won`) plays the outro before the win card.

## Entry points
- `buildSteps.js` runs cancellable generator construction in short tasks and warms mesh uploads in hidden batches while preserving lights and nested mesh ancestry. Each individual step must be small enough to avoid blocking UI paints. `Game.create` uses it for launch; the synchronous constructor remains available to offline fixtures.
- `Game` is constructed and started by `src/client/main.js` (`launch`), which also calls `gfx.prepare()`, `dispose()`, `setCreative()` and sets `onLeave`, `onNewIsland`, `onPanelChange`.
- Systems receive the `Game` instance (`new DinoViews(this)` etc.) and may implement `onWelcome`, `onSnapshot`, `update(dt, renderTime)`, `minimapMarkers`, `compassMarkers`.
- `Renderer` is also used by `src/client/player/weapon-preview.js`.
- `settings.js` is used by `audio/audio.js`, `player/controller.js`, `ui/menus.js`; `persistence.js` by `settings.js`, `graphicsTier.js`, `game.js` (tracked contract), `main.js` (name), `player/pockets.js`, `ui/wardrobe.js`; `retainResource*` by model caches in `models/` and `entities/`.

## Rules
- `Game` never mutates authoritative state locally; it sends `net.act(ACT.*)` / `net.sendState` and applies what the server returns (only own movement is predicted).
- Everything island-specific created by a `Game` must be released in `Game.dispose()`; the renderer, audio and input survive across islands.
- `onDinoStep` classifies actual ground support with the player terrain helper and passes species, movement and model size to positional dinosaur audio; grounded contacts come from `DinoView` interpolation, not mesh visibility.
- Geometry/materials/textures owned by a reusable model cache must be marked with `retainResource`/`retainObjectResources`, otherwise `disposeIslandScenes` disposes them at the next island.
- Frame hitches are almost always shader recompiles: a program is specific to the render target (canvas vs. `WorldPost` target), the shadow setting and the number of visible lights. Never toggle a light's `visible` (keep intensity 0 instead), compile anything that can change these in `Renderer` first (`prepare`, `#compilePath`, `#compileShadowVariant`), and give things that first appear in play a hidden copy that the warm-up frame draws (see `Items`). `prepare` draws hidden objects too (not lights).
- Graphics tier is never chosen by the player; render scale and contact shading are the only graphics sliders (`SETTING_DEFS`).
- Preference access goes through `persistence.js` with `storageKey()` keys and tolerates blocked storage. Never read `localStorage` directly: on the desktop its origin includes the random port, so values vanish between launches.
- XP, skills and inventory are never stored on the client: they belong to the expedition and arrive in `MSG.PROF` / `MSG.INV`. `game.profile` starts fresh until the host's profile arrives.
- The saved profile is untrusted: the server re-validates it (`sanitizeProfile`).

## Not here
- Individual systems: dinosaurs/items/projectiles/tracks/relics in `entities/`, player actions/movement in `player/`, panels and HUD in `ui/`, island meshes in `world/`, sound in `audio/`.
- Transport, clock sync and snapshot ordering: `net/`.
- Menu/lobby flow before a `Game` exists: `src/client/main.js`.
