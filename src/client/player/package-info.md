# src/client/player
> The local player on the client: predicted first-person movement, tool use and interactions (all sent as requests to the server), the first-person viewmodel, and automatic stuck detection.

## Files
- Off-hand torch (`viewmodel.js` `updateTorch`, own arm/hand rig `tHand`, independent of `this.tool`): raised while lit and the left hand is free, lowered smoothly (light dims to an ember) for bow/trap/rifle/eating; a pistol is one-handed while it is up. `actions.js` toggles it with L (`game.torchLit`, only with `inv.torch`).
- `controller.js` — `PlayerController`: client-predicted movement: WASD, sprint/stamina, jump, gravity, terrain and rock-top following, slope sliding, swimming in rivers/lakes (never the sea), wading slower (in a swamp bog exactly `swampSpeedMul`, `inBog`), collider collision and step-up, the cave roof's head bump (`Terrain.ceilingAt`), knockback/knockdown, creative flight, skill effects (Adrenaline, Dash), fruit buffs (`setBuffs`: Mud Walker, Second Wind, Fireproof, Quickfoot), the volcano's hot ground (`heat`: stamina drains faster, refills slower) and ash rain (`ashOutside`, set by core/game.js: stamina refills slower), grove barrier.
- `actions.js` — `PlayerActions`: hotbar slots and tools (spear stab/throw, bow, trap placement with ghost preview, fruit eat/give, pistol/rifle shots and reload), knife butchering (hold V), revive (hold E), E-interactions (pickup, harvest, loot drop-off, base plots/flag, boat, wardrobe, crafting box, resupply, mission board, heal teammate), auto-loot, carry weight, and the HUD parts tied to them (hotbar, prompt, hints, dino alert, compass markers).
- `viewmodel.js` — `Viewmodel`: first-person arms in the outfit's sleeves holding the current tool (spear, bow with drawable string, trap, fruit, knife, firearms), with stab/throw/draw/eat/place/recoil/reload/ADS animation; drawn in the renderer's separate viewmodel pass.
- `spearThrow.js` — `SPEAR_THROW`, `spearLaunch`, `spearReleaseRotation`, `cameraPlaneScale`: one release contract (timing, origin, velocity) shared by viewmodel, gameplay and the workshop.
- `stuck.js` — `StuckDetector`, `STUCK`: detects no progress, endless sliding, deep water or repeated server corrections and requests `ACT.UNSTUCK` (auto with cooldown, or manual via U).
- `weapon-preview.js` — standalone weapon workshop script: viewmodel, co-op player model, tools, outfits, gun effects in a test scene (no server).
- `weapon-preview.html` — page that hosts `weapon-preview.js` with its controls.

## Entry points
- `src/client/core/game.js` creates `PlayerController` (`update(dt, intent)`, `look`, `teleport` on welcome/respawn/revive, `knock` on HURT events, `setMods`, `setCreative`, `barrier`, `onDash`) and `StuckDetector` (`update`, `manual`, `onCorrect`, `reset`), and registers `PlayerActions` as one of its systems (`update`, `compassMarkers`, `fullAlert`, `vm`).
- `PlayerActions` creates the `Viewmodel` and `GunEffects` (`src/client/entities/gunEffects.js`) and subscribes to EAT, BUTCHER, REVIVE, REVIVED, HURT, DINO_HIT, DEATH events.
- Projectiles in flight (arrows, thrown spears) are handed to `src/client/entities/projectiles.js`, which sends `ACT.FIRE` / `ACT.LAND`.
- `weapon-preview.html` is opened directly in the browser as a dev tool.

## Rules
- Only the player's own position is predicted; HP, inventory, loot, kills and all action outcomes are server-authoritative. Every gameplay effect leaves through `game.net.act(ACT.*)`.
- Hit tests run on the client against the animated dino hit spheres; melee and gun hits send the hit point, zone and `rt: game.renderTime` so the server can check them against the rewound pose (lag compensation).
- Movement limits (radius, step height, slopes, swim, creative) come from `CONFIG.player` and the shared collision functions, the same ones the server uses to validate (`ServerWorld.onState`); keep both sides in sync when changing them.
- Mouse sensitivity comes from `src/client/core/settings.js` (`settings.sens`, read in `PlayerController.look`).
- Butcher stroke/ring timing uses monotonic elapsed seconds, never the movement frame delta capped at 50 ms. Server-confirmed duration includes the knife skill; only a successful `EV.BUTCHER` (`done: true`) briefly holds the final stroke and full ring before recovery.
- The spear release timing/origin lives only in `spearThrow.js`; the viewmodel and gameplay must read it from there.
- The stuck detector only asks; the server decides the spot (`src/sim/unstuck.js`).

## Not here
- Key bindings and pointer lock: `src/client/input/`.
- Remote players, dinosaurs, items, projectiles in flight: `src/client/entities/`.
- Weapon, hand, fruit and firearm meshes: `src/client/models/`.
- HUD widgets and panels themselves: `src/client/ui/`.
- Validation of every action: `src/sim/world.js` (`onAct`), guns in `src/sim/firearms.js`.
