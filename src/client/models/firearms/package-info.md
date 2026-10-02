# firearms
> Detailed pistol (P-19) and rifle (M4A1) models: third-party MIT-licensed hard-surface geometry plus a small adapter that turns it into cached, animatable Three.js groups for this game.

## Files
- `index.js` — adapter: `makeFirearm(kind)` builds (once per kind, cached) the reference assembly, applies lightweight shared materials by part key, and returns a `THREE.Group` with movable parts and grip points.

### reference/
- `reference/LICENSE` — MIT license of the original source (Claude-of-Duty, copyright (c) 2026 mshumer).
- `reference/geometry.js` — procedural hard-surface kit: chamfered boxes, lathes, tubes, extrusions, rails, knurling, screws, `Assembly`, `mergeAll`, `triCount`.
- `reference/parts.js` — reusable firearm parts on top of the kit (barrels, muzzle devices, receivers, handguards, grips, stocks, magazines, optics, sights, slide, trigger, cartridges).

### reference/models/
- `reference/models/pistol.js` — `buildPistol()`: the P-19 pistol assembly.
- `reference/models/rifle.js` — `buildRifle()`: the M4A1 rifle assembly.

## Entry points
- `makeFirearm(kind)` (`'pistol'`, anything else builds the rifle) is called by `models/playerModel.js` (third-person held weapon), `player/viewmodel.js` (first-person) and `entities/items.js` (firearms lying on the ground).
- `index.js` is the only importer of `reference/models/*`; the reference files only import each other and `three` / `three/addons`.

## Rules
- Files under `reference/` carry the header "From Claude-of-Duty ... MIT; see LICENSE". Keep the header and `LICENSE` with them; the adapter comment says to preserve the original assemblies and adapt only materials in `index.js`.
- Returned group contract (relied on by viewmodel/player model): `root.userData.parts` holds movable groups (`magazine`, `slide`, `charging`, `bolt`, `trigger`, `selector`) positioned at their rest nodes with `userData.rest`; `root.userData.nodes` exposes the model's named nodes; `root.userData.gripR` / `gripL` are palm contacts tuned for this game's hands.
- Geometry and materials are cached per kind/key and marked with `retainResource`, so island disposal never frees them; every call returns a new group sharing them.
- Materials are plain `MeshStandardMaterial` chosen by part-key keywords (brass, glass, polymer, rubber, cavity, ...); no textures.

## Not here
- Firing, ammo, reload logic and damage: `client/player/` and `src/sim/`; ammo/weapon numbers in `src/shared/config.js`.
- Bow, spear, arrows, traps, knife: `models/weapons.js`.
- Shot tracers and shot sounds: `entities/gunEffects.js`, `client/audio/`.
