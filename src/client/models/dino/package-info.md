# dino
> Dinosaur models and their animation: GLB models built in Blender (primary) plus the older procedural, code-built rigs that remain as the fallback when a GLB is missing or fails to load.

## Files
- `glbCatalog.js` — `GLB_DINOS`: per species the GLB URL (`/assets/models/dinos/<type>.glb`), fitted size, strides, bone aliases, clip names (`<Source>_<Clip>`), flyer flags and extra hit zones.
- `sarcoModel.js` — Alpha Sarcosuchus review-only GLB contract, loaded on demand by the preview; it does not register a gameplay species or add a startup download.
- `glbDino.js` — `preloadDinoModels()` (fetch + parse, 20 s timeout, warn and fall back on failure), `registerDinoGLTF()`, `buildGLBDino(type)` (clone, fit, bones, hit zones; `null` if not loaded) and `GLBDinoAnimator` (AnimationMixer clips plus procedural layers).
- `rig.js` — `Rig` (joint hierarchy + meshes) and `DinoAnimator` for procedural rigs: distance-driven gait, 2-bone leg IK on terrain, bob/sway, neck/tail follow-through, breathing, blinking, look, jaw, death, trap struggle.
- `skin.js` — `loft`, `SkinBuilder`, `restPoint`/`restMatrix`: lofted soft bodies bound to joints as a `SkinnedMesh`.
- `parts.js` — procedural building blocks: domed `tube`, `chain`, `countershade`, eyes, teeth, claws, feet.
- `theropod.js` — shared biped builder (`buildTheropod`, `standPose`, `theropodExtra`, `talon`, `theroFoot`, `jointChain`) used by raptor and T-Rex, and by brachio/stego/ptera for helpers.
- `raptor.js` — procedural Velociraptor (`buildRaptor`, `RAPTOR_ANIM`, `raptorExtraUpdate`).
- `trex.js` — procedural T-Rex (`buildTrex`, `TREX_ANIM`, `trexExtraUpdate`).
- `brachio.js` — procedural Brachiosaurus (`buildBrachio`, `BRACHIO_ANIM`, `brachioExtraUpdate`).
- `stego.js` — procedural Stegosaurus (`buildStego`, `STEGO_ANIM`, `stegoExtraUpdate`).
- `ptera.js` — procedural Pteranodon with dynamic wing membrane (`buildPtera`, `PTERA_ANIM`, `pteraExtraUpdate`).
- `skinStyle.js` — `DINO_PALETTES` and `paintSkinDetails()` vertex-colour markings (used by `ptera.js` and build scripts).
- `preview.html` — standalone dev page that loads `SPECIES` and the GLBs and shows one dino per `?type=&state=&view=` (driven by `scripts/check-dino-preview.mjs`). Sarcosuchus additionally supports direct playback of its swimming and boss attack/reposition/recovery clips.

## Entry points
- `entities/dinoViews.js` `SPECIES`: for each type `build = () => buildGLBDino(type) || <procedural build>()`, `createAnimator = rig.createAnimator?.() || new DinoAnimator(rig, ANIM)`; procedural `*ExtraUpdate` runs only when `!rig.isGLB`.
- `main.js` calls `preloadDinoModels()` before play.
- Scripts: `scripts/measure-dino-strides.mjs` (GLB strides), `scripts/build-brachio-glb.mjs` (marked SUPERSEDED), `scripts/detail-pack-dinos.mjs`.
- Tests: `test/dino-glb.test.js`, `test/dino-skin.test.js`, `test/dino-visibility.test.js`.

## Blender pipeline
- The GLBs are authored in Blender from sources in `art/sources/<type>/` (`.blend` with build scripts). The project skill `.claude/skills/dino-blender-creator` (`SKILL.md` plus `references/modeling.md`, `animation.md`, `integration.md`, helper `scripts/`) holds the modelling, rigging, clip-baking and export rules, and its `integration.md` lists the game-side files to touch: `glbCatalog.js` entry, bone aliases, extra clips, and `barHeight` in `entities/dinoViews.js`. Use that skill for any new or changed dino model or animation.

## Rules
- Every server species (`CONFIG.dinos`: brachio, stego, raptor, ptera, trex, alpha-sarcosuchus) needs a `SPECIES` entry; all six currently also have a `GLB_DINOS` entry. Clip names in the catalog must exist in the GLB: `registerDinoGLTF` throws on a missing clip (and that species falls back to procedural).
- Missing art never blocks play: `buildGLBDino` returns `null` until a template is registered, and `SPECIES` then uses the procedural builder.
- `registerDinoGLTF(type, gltf, spec)` accepts an explicit asset contract for review models outside `GLB_DINOS`; that contract is retained with the template. Alpha Sarcosuchus is registered in the gameplay catalog; its preview reports missing assets explicitly.
- Creatures face -Z; GLB exports face +Z and are turned by `yaw: Math.PI` in the catalog.
- Hit zones (`rig.hitZones` / `rig.hitSpheres`) are what client hit tests use; GLB radii are derived from `spec.height` plus `extraHitZones`.
- Stride values in `glbCatalog.js` come from `scripts/measure-dino-strides.mjs`; the gait phase advances by distance so planted feet do not slide.
- GLB templates are cached and retained (`retainObjectResources`); each view clones them, and `rig.dispose()` frees only its skeletons.

## Not here
- Placing dinos, interpolating server snapshots, health bars, spotting: `client/entities/dinoViews.js`.
- Dino AI, stats and damage: `src/sim/` and `src/shared/config.js`.
- GLB files: `assets/models/dinos/`; Blender sources: `art/sources/`.
