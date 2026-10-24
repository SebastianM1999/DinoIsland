# Dialog ornaments

`dialog-leaves.svg` and `dialog-leaves-reversed.svg` are hand-authored corner vector decorations
for the native stone/parchment dialogs in `css/expeditionTheme.css`. They sit
on separate viewport overlays extending beyond frame bevels, with corner clusters, shaded stems, leaf veins and
contact shadows. The vines along the edges are generated per dialog by
`src/client/ui/dialogVines.js` (seeded inline SVG, never tiled). They render around frames with a transparent content cutout, extending 22 px
outside and at most 8 px inside the border. Dialog content keeps its existing
scrolling and clipping; the leaves cannot paint over controls. They never receive
pointer events. Compact windows reduce their size. Same-origin files preserve
the game's Content Security Policy without allowing inline image data URLs.

`skills/` retains the historical generated skill-tree image and its provenance;
the game no longer loads that image.
