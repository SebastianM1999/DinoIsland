# Dialog ornaments

`dialog-leaves.svg`, `dialog-leaves-reversed.svg`, `dialog-vine.svg` and
`dialog-vine-horizontal.svg` are hand-authored vector decorations
for the native stone/parchment dialogs in `css/expeditionTheme.css`. They sit
on separate viewport overlays extending beyond frame bevels, with corner clusters, shaded stems, leaf veins and
contact shadows. Reversed corners and horizontal vines wrap the bottom/right
and top/bottom edges. They render around frames with a transparent content cutout, extending 22 px
outside and at most 8 px inside the border. Dialog content keeps its existing
scrolling and clipping; the leaves cannot paint over controls. They never receive
pointer events. Compact windows reduce their size. Same-origin files preserve
the game's Content Security Policy without allowing inline image data URLs.

`skills/` retains the historical generated skill-tree image and its provenance;
the game no longer loads that image.
