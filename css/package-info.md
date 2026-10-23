# css
> Runtime presentation for the plain-DOM shell, dialogs and HUD. Game rules and input behavior stay in JavaScript.

- `main.css`: font/tokens, shell primitives, settings, pause and lobby base layouts.
- `menu.css`: home slideshow, navigation, expedition picker and home dialogs.
- `expeditionTheme.css`: shared expedition stone/parchment material system and responsive menu/dialog skins. Loaded by `index.html`; rules are scoped to `body.island-theme` and specific dialog classes so late HUD styles cannot override the theme or alter the live HUD. Uses CSS surfaces, not reference-image backgrounds; the slideshow and game scene remain visible. Styles separate fixed foliage overlays that straddle dialog borders and mask out the content, including inventory and station dialogs and one shared carved style for header close buttons (including skills); skill layout remains in skills.css.
- `hud.css`: live HUD, inventory, mission board and station dialog base layouts; loaded lazily by the HUD and home previews.
- `skills.css`: the native stone/parchment skill tree, its hosts, equal-sized centered tiles and descriptions. Width caps at 1480 px; compact viewports reduce decoration, and very small windows scroll instead of clipping controls. Skill SVG sizing must outrank generic `.hud svg` regardless of stylesheet order.
- `loading.css`: lightweight expedition loading photograph/phase presentation.

Keep real text and controls in the DOM. Preserve native keyboard focus, disabled/selected states, setting slider fill values, inventory slot counts and item visibility. Dialogs stay centered and capped rather than stretching across ultrawide monitors. Verify both initial home loads and transitions into play because stylesheet order changes there. Never replace the slideshow or live scene with a baked reference backdrop.
