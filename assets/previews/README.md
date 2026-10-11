# Island photographs

Twenty 2560x1440 WebP photographs (`island-{n}-{k}.webp`, five per island, all four islands, about 3.5 MB together), taken in the real game at its top graphics tier. The home screen plays them as a Ken Burns slideshow (`src/client/ui/menuPostcards.js`, `css/menu.css`) and the expedition loading screen shows the same decoded images for the selected island. The home screen builds no live scenery.

`PREVIEW_SHOT_COUNTS` in `src/client/ui/mapPreviews.js` lists how many shots each island has; `test/menu-postcards.test.js` fails when it and this folder disagree, or when a photograph is not 2560x1440.

Compose with the subject in the middle band and right of centre: the picture is cover-cropped (about 2.4:1 on an ultrawide, 16:10 on a laptop), the left third sits under the menu scrim, and the Ken Burns zoom crops another few percent.

## Regenerate

After map art changes (or to change a view), with Chrome installed and `npm ci` done, on an otherwise idle machine:

```powershell
node scripts/capturePreviews.mjs                  # all islands (about 7 minutes, the Hollow Mountain is the slowest)
node scripts/capturePreviews.mjs --island=4       # one island
node scripts/capturePreviews.mjs --scout --island=1   # quick 1280x720 JPEGs in output/menu-check/scout/ to compose views
```

The script starts the dev server, opens each fixed island with `?debug&dev&capturePreviews=1` in headed Chrome (1920x1080 at device pixel ratio 2), and uses the photo studio of `src/client/ui/menuPreviewCapture.js` (top tier, free camera, no HUD, no viewmodel, creative mode). Poses live in `scripts/preview-shots.json`: per island a list of `{ name, from: [x, z, metresOverGround], to: [x, z, metresOverGround], fov, dinos }`; the screenshot is downsampled to 2560x1440 and encoded as WebP (quality 0.9, `--quality=` to change). Each island uses its fixed variant (`levelDef(i).variant`); the Hollow Mountain's interior is dark by design, so its shots use the coves and the crystal halls.

Look at every result before committing: no black or underwater frames, no camera inside rock, no HUD, no dinosaur filling the picture (set `"dinos": false` for a shot if one wanders in). Node and the browser build the same islands bit for bit (`src/shared/dmath.js`), so poses can be looked up with Node-side scripts (e.g. the cave's halls from `planIsland(3, 7).cave.maze.nodes`, crystals from `buildLayout(...).caveDecor.crystals`).
