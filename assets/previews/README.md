# Island postcards

Nine 1280x800 JPEG captures of the actual seeded map scenery (variant 1), three views per island. The home lookout and expedition loading screen share these decoded images; neither runs a background Three.js scene.

After map art changes, open the development game with `?capturePreviews=1`. The developer-only `src/client/ui/menuPreviewCapture.js` builds the actual map corridors, warms shaders, and adds nine hidden `.tour-preload` images with `data-island` and `data-shot` to the DOM. Export their JPEG data URLs to `island-{1..3}-{1..3}.jpg` here. Normal sessions never import this renderer. Existing live world art is reused without repositioning props.
