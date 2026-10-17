# firearms
> Detailed pistol (P-19), rifle (M4A1) and SMG (MPX-9) models: third-party MIT-licensed hard-surface geometry plus a small adapter that turns it into cached, animatable Three.js groups for this game.

## Files
- `index.js` — adapter: `makeFirearm(kind)` builds (once per kind, cached) the reference assembly, applies lightweight shared materials by part key, and returns a `THREE.Group` with movable parts and grip points.

### reference/
- `reference/LICENSE` — MIT license of the original source (Claude-of-Duty, copyright (c) 2026 mshumer).
- `reference/geometry.js` — procedural hard-surface kit: chamfered boxes, lathes, tubes, extrusions, rails, knurling, screws, `Assembly`, `mergeAll`, `triCount`.
- `reference/parts.js` — reusable firearm parts on top of the kit (barrels, muzzle devices, receivers, handguards, grips, stocks, magazines, optics, sights, slide, trigger, cartridges).

- `reference/hands.js` — `Arm` (two-bone arm, fingers, sleeves, `fitToCylinder`) and `HAND_POSES`; restyled by `models/arms/cartoonArm.js`, never edited.
- `reference/clips.js` — `Clip`, `buildClips`, `makeSampleResult`: first-person animation clips from a model's nodes (with an added `rhand` channel).
- `reference/mathx.js`, `reference/rng.js` — maths and deterministic RNG helpers the clips and hands use.

### reference/models/
- `reference/models/pistol.js` — `buildPistol()`: the P-19 pistol assembly.
- `reference/models/smg.js` — `buildSmg()`: the MPX-9 assembly, licensed with the other reference models; Dinosaur Island uses compact photo-referenced front post/protective ears and a rear plate with a true circular through-aperture and side guards, with the optic removed.
- `reference/models/rifle.js` — `buildRifle()`: the M4A1 rifle assembly.

- MPX firing wrist is shifted slightly out/back/down for the thick cartoon fingers; its support hand uses the actual tilted foregrip axis and full-surface-tested poses in `player/viewmodel.js`.
- The adapter moves the CoD hand nodes for the bigger cartoon hands (`adaptHands`: rifle support hand 40 mm back under the rear third of the handguard and re-oriented by `SUPPORT_GRIP` (palm on the lower far side at clock 305 degrees, fingers rolled toward the muzzle, so the wrist stays nearly in line with the forearm and the fingers stay below the top of the handguard), pistol hands up/back so the index reaches the trigger, and the pistol support hand's fingers raised 20 degrees (`PISTOL_CUP_ORIENTATION`) so the forearm and hand line up, rifle bolt travel shortened and dipping (`RIFLE_BOLT_TRAVEL`) so a locked-back carrier stays in the receiver instead of floating behind it); clips follow because they read the nodes.

## Entry points
- `makeFirearm(kind)` (`'pistol'`, `'mpx'`, otherwise rifle) is called by `models/playerModel.js` (third-person held weapon), `player/viewmodel.js` (first-person) and `entities/items.js` (firearms lying on the ground).
- `index.js` is the only importer of `reference/models/*`; the reference files only import each other and `three` / `three/addons`.

## Rules
- Files under `reference/` (incl. `hands.js`, `clips.js`, `mathx.js`, `rng.js`) carry the header "From Claude-of-Duty ... MIT; see LICENSE". Keep the header and `LICENSE` with them; preserve the original assemblies except requested variants (MPX small iron sights replace the optic), with hand/material adaptation in `index.js` and `player/viewmodel.js`. The MPX vertical foregrip is 90 mm long to fit all four cartoon fingers.
- Returned group contract (relied on by viewmodel/player model): `root.userData.parts` holds movable groups (`magazine`, `slide`, `charging`, `bolt`, `trigger`, `selector`) positioned at their rest nodes with `userData.rest`; `root.userData.nodes` exposes the model's named nodes; the CoD wrist targets `nodes.gripR` / `nodes.gripL` (`pos`, `finger`, `back`) and `nodes.handguard` are turned into this game's hands by `arms/cartoonArm.js` (`scaledGrip`), see `player/viewmodel.js`.
- Geometry and materials are cached per kind/key and marked with `retainResource`, so island disposal never frees them; every call returns a new group sharing them.
- Materials are plain `MeshStandardMaterial` chosen by part-key keywords (brass, glass, polymer, rubber, cavity, ...); no textures.

## Not here
- Firing, ammo, reload logic and damage: `client/player/` and `src/sim/`; ammo/weapon numbers in `src/shared/config.js`.
- Bow, spear, arrows, traps, knife: `models/weapons.js`.
- Shot tracers and shot sounds: `entities/gunEffects.js`, `client/audio/`.
