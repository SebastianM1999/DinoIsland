# Journal paper and dialog ornaments

`dialog-leaves.svg` and `dialog-leaves-reversed.svg` are hand-authored corner vector decorations
retained for dialog decoration. The field-journal theme hides the external overlays described below and reuses the reversed leaves as a faint, panel-local background below all controls. They sit
on separate viewport overlays extending beyond frame bevels, with corner clusters, shaded stems, leaf veins and
contact shadows. The vines along the edges are generated per dialog by
`src/client/ui/dialogVines.js` (seeded inline SVG, never tiled). They render around frames, extending 22 px outside the border, and paint
over any dialog content they reach (highest page layer). Dialog content keeps its
existing scrolling and clipping. They never receive pointer events. Compact windows reduce their size. Same-origin files preserve
the game's Content Security Policy without allowing inline image data URLs.

`skills/` retains the historical generated skill-tree image and its provenance;
the game no longer loads that image.

`journal-grain.svg` is a small seamless, hand-authored SVG noise texture for the CSS paper material. It contains no text or controls. CSS supplies water stains, fold lines, worn corners and shadows at the actual panel size, so this texture can repeat without stretching a UI screenshot.

## Open-source interface icons

`src/client/ui/uiIcons.js` vendors a Lucide SVG subset from revision `7faf87628a1ad6175975bc595344337ce14a7db4` of https://github.com/lucide-icons/lucide. The glyph paths are unchanged; the shared presentation uses a 1.8px stroke and currentColor. The local aliases `trash-2`, `circle-help`, `music`, and `waves` use upstream `trash`, `circle-question-mark`, `eighth-notes`, and `waves-horizontal`, respectively. `skillIcons.js` maps skills to distinct licensed glyphs.

`lucide-LICENSE.txt` contains the upstream ISC license and the MIT notice for icons inherited from Feather. Both notices are retained in distributed assets and linked from Credits. No network requests, icon font, runtime package or telemetry are required for these icons. Game-specific item/resource illustrations remain in icons.js.

## Ancient scroll margins

`journal-botanical.png`, `journal-island.png`, and `journal-leaves.png` are separate transparent decorations generated with the built-in GPT Images tool from the user's selected field-journal reference crops. They contain no interface controls or text. CSS places the drawings within a reserved gutter using contain sizing and multiply blending for the ink sketches; they never determine panel dimensions or intercept input. See [scroll-art-prompts.md](scroll-art-prompts.md) for the prompts and input roles.

`journal-binding.svg` is a hand-authored repeating vector strip for the stitched leather spine and rope ties. `preserveAspectRatio="none"` keeps repeat boundaries seamless at different spine sizes. CSS supplies the remaining frame shadows, worn paper and letter tabs. The handwritten margin notes are real text in the bundled Caveat font, not embedded in the artwork.
