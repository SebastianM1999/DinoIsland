# Game integration, tests, git

## Files to touch for a new/replaced species

| File | What |
|---|---|
| `assets/models/dinos/<type>.glb` | the export |
| `src/client/models/dino/glbCatalog.js` | `model('<type>', '<Source>', height, length, walkStride, runStride, quadruped)`; bone aliases (`jaw`, `neck`, `spine`, `feet` = planted contact bones, `knees`, `legs`, `tail`); `clips.roar = '<Source>_Roar'` for extra clips; `maxCadence`; remove any old `yaw = 0` override (our exports face +Z after glTF → default yaw PI) |
| `test/dino-glb.test.js` | add the type to the `authored` list (jaw + eyes in mesh); update `sourceTriangles` |
| `art/asset-manifest.json` | source = `Project-authored ...; art/sources/<type>/<type>.blend`, license `Project source`, triangles |
| `art/validation/dinosaur-models.md` | table row |
| `src/client/entities/dinoViews.js` | `barHeight` above the new head height |
| `scripts/detail-pack-dinos.mjs` | remove the type so a rerun never paints over the authored model |
| old generator scripts (e.g. `scripts/build-brachio-glb.mjs`) | mark SUPERSEDED at the top |
| `art/sources/<type>/` | `<type>.blend` (all build scripts as text blocks + a `*build` master), `scripts/NN_*.py` mirror, `README.md` |

Bone names the game understands: `Head`, `Jaw`, `Body`, neck/tail chains, legs
`BackUpLeg/BackLowLeg/BackFoot(/BackToes)<L|R>` and `Front...` for quadrupeds. Feet aliases must
be the bones that are **planted** during stance (theropods: `BackToes`, quadrupeds: `...Foot`).

## Hit zones (player hits ON the dino)

Generic GLB spheres sit on joints (head, neck, spine, `bones.legs` upper legs, tail) and covered only
~63 % (stego) / ~73 % (ptera) of the surface: snout, beak, lower legs, feet, thick tail base and
crests were not hittable. Run `node <skill>/scripts/hit_coverage.mjs <type>` and add
`GLB_DINOS.<type>.extraHitZones = [{ zone, bone, at: [x, y, forward], radius }]` (rest-pose point in
FITTED game metres; game x = -Blender x, y = Blender z * scale, forward = -Blender y * scale). They
are added after the joint padding, so they are never duplicated along bones. Restore species zones
the old procedural model had (`plates` x0.35, `flank` x1.6, `wing`; see `CONFIG.hitZones`); measure
plate/membrane spheres in Blender from the islands' bounding boxes instead of guessing.

## Attack hitboxes (dino hits the PLAYER)

Derive server hit geometry from the baked clip, not from guesses: sample the attack in Blender
(angle + reach of the striking part around its pivot per frame, in game metres) and paste the table
into the AI (`src/sim/ai/stego.js` `SWEEP`). Then hit everyone inside the area swept between the
previous and current tick (no single-target / single-frame checks), only in the real strike window
(wind-up = dodge time). Re-measure if the clip changes. Prove dodge windows with sim tests (walk vs
sprint speeds from `CONFIG.player`).

## Flyers (ptera)

`GLB_DINOS.<type>.flyer = true` switches `GLBDinoAnimator` to `flightState()`: clips `fly`, `glide`,
`dive`, `fall` (+ idle/attack/death; map `walk`/`run` to Fly/Glide since registration needs them).
Alive + `airborne` -> dive (pose.dive) / fly while climbing / glide while sinking / alternate when
level; dead + airborne -> `fall` loop; dead + landed -> `death` once (latched, never replays).
`dinoViews` passes `airborne` (ptera: `!grounded()`); body pitch follows the flight path, `tilt`
banks with yawRate, `spec.pivot` moves the pitch pivot to the torso. Bones: `legs/feet/knees: []`
(the GLB test then expects a `wing` zone instead of `leg`). The server drops a dead flyer
ballistically; the client just follows y. Preview: `fall` button.

## Measuring

`node <skill>/scripts/check_glb.mjs assets/models/dinos/<type>.glb <type> [--length L]` from the
repo root (catalog entry must exist). Paste height, length and both strides into the catalog,
then run `npm test`. Species speeds live in `src/shared/config.js` (walkSpeed, runSpeed/flee/
charge); choose strides so `speed / stride ≤ maxCadence` (raptor 2.4, T-Rex 1.25, brachio 1.25).

## Tests

`npm test`. `test/dino-glb.test.js` checks: clone independence, jaw presence, eyes, exact skin
triangle counts, manifest triangles, ≤ 60k, vertex colours, fitted size = catalog, hit zones,
every pose input stays finite, walk timeScale = duration / stride, baked leg poses untouched by
overlays, jaw overlay opens and doesn't accumulate, **no knee snap > 0.4 rad per 1/60 s at run
speed 10.2 m/s**, cadence cap, death clamps. `discovery-fruit.test.js` ("fruit plant visuals …")
is a known random failure unrelated to dinos — rerun it alone before blaming your change.

## Previewing

If the browser pane is in the background, `requestAnimationFrame` never fires and the preview stands
still. Drive it from `javascript_tool`: `window.dinoPreview.anim.update(dt, {...})` in a loop, then
take a screenshot (each screenshot renders one frame). Overlay hit spheres for a visual check by
adding wireframe spheres from `window.dinoPreview.rig.hitSpheres([])` to the scene.

The owner runs the game at `http://localhost:8080`. The dino preview page
`/src/client/models/dino/preview.html?type=<type>&state=<idle|walk|run|attack|roar|dead>&view=side`
plays the real GLB with the game's animator, overlays and lighting. Reload with a new query
param (`&v=2`) after re-exporting. It cannot zoom — use Blender close-ups for detail.

## Git (important on this machine)

- Other agents' uncommitted edits can sit INSIDE files you touched (e.g. `dinoViews.js`). Check
  `git diff -- <file>` before staging; if it has foreign hunks, stage only yours: build the file from
  `git show HEAD:<file>` + your edits, `git hash-object -w` it and `git update-index --cacheinfo`.
  Then verify the staged snapshot alone: `git checkout-index -a --prefix=<scratch>/` + a
  `node_modules` junction, run the tests there, delete the junction with
  `[System.IO.Directory]::Delete(path, $false)` before removing the folder.
- If your feature only works together with someone else's uncommitted change, say so to the owner.

- Another agent (Codex) works in the same folder and switches branches mid-session. Run
  `git branch --show-current` right before every commit, and `git add` only your own files
  (never `git add -A`); leave others' uncommitted work alone.
- Commit on `main` when the owner asks; **never push** unless asked.
- Don't create git worktrees without asking — a worktree on `main` blocked the owner from
  checking out `main` locally. If one exists, remove its `node_modules` junction first
  (`[System.IO.Directory]::Delete(path, $false)`) so the real packages survive.
- Blender saves `*.blend1` backups — delete them before committing.
