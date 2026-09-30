# Quaternius dinosaur source assets

Downloaded from https://quaternius.com/packs/animateddinosaurs.html and its linked
Google Drive folder on 2026-09-30. Original license is in License.txt.
All six original .blend files are retained for reproducible conversion.
Parasaurolophus and Triceratops are unused; the game has no corresponding species.
The pack contains no flying dinosaur, so ptera remains procedural.

Convert with Blender 4.5 LTS from the repository root:

```
blender -b art/sources/quaternius-dinosaurs/Velociraptor.blend --python scripts/convert-dino-pack.py -- raptor
blender -b art/sources/quaternius-dinosaurs/Trex.blend --python scripts/convert-dino-pack.py -- trex
blender -b art/sources/quaternius-dinosaurs/Stegosaurus.blend --python scripts/convert-dino-pack.py -- stego
node scripts/detail-pack-dinos.mjs
node scripts/smooth-dino-clips.mjs
node scripts/build-brachio-glb.mjs
```

Each source has Attack, Death, Idle, Jump, Run, Walk actions prefixed with its
species name (T-Rex uses TRex). Apatosaurus's death action is named
Stegosaurus_Death in the original file. The exporter preserves that name.
Use inspect-dino-pack.py to print source action names and skeletons.

Two subdivision levels round silhouettes; smooth normals remove flat facets.
Materials are replaced by species vertex palettes with gradual variation.
The loader fits height and length independently to the game's scale and rotates
the pack's forward direction to -Z. The detailing pass replaces the source heads
with eyes, nostrils, cheeks, teeth and separate lower jaws, then adds rest-space
body stripes and flecks. Run it once after a fresh Blender conversion.
The smoothing pass closes gait endpoints, filters sparse knee keys, and retimes
held frames moderately. Runtime cadence is bounded to avoid frantic short-stride runs.

Brachio is now baked from the project's own Brachiosaurus builder, with natural
neck/body/leg proportions and a 0.8-second defensive-stomp windup. Apatosaurus is
retained as an unused source rather than stretched into a different dinosaur.
Ptera retains its procedural flight rig, with corrected outward-facing skin,
larger eyes, body markings, wing rays and a pale trailing-edge band.
