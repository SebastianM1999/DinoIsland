# ui
> Plain-DOM user interface: the in-game HUD and minimap, the dialogs opened at world stations (crafting, base, boat, wardrobe, skills, grove), shell menus, the performance readout and the desktop/LAN lobby helpers.

## Files
- `hud.js` — `Hud`: the in-game HUD (~1080 lines, see below).
- `minimap.js` — `buildMapBase` paints the island once to an offscreen canvas (swamp bogs and the swamp arena ring, the volcano's lava craters and crater rim included); `drawMap` blits a region plus markers each frame.
- `icons.js` — `ICONS`, `icon(id)`, `portraitSvg()`: inline 32x32 SVG item/HUD icons (every fruit kind, `flame` for heat and the volcano's warnings, `ash` for the ash rain).
- `itemInfo.js` — `ITEM_INFO`: names and tooltip texts for inventory items, numbers taken from `CONFIG`.
- `craftingPanel.js` — `CraftingPanel`: hut workbench dialog (supplies tab and team upgrades tab, refill).
- `basePanel.js` — `BasePanel`: base dialog on islands 2+ (pick plot, upgrade stage, build/upgrade towers, repair).
- `boatPanel.js` — `BoatPanel`: boat wreck dialog listing found/missing boat parts and the Repair button.
- `grovePrompt.js` — `GrovePrompt`: Yes/No warning and hint shown at the giant's pen barrier.
- `wardrobe.js` — `Wardrobe` (hat/top/pants picker with rotatable 3D preview) and `savedOutfit()` from localStorage.
- `skillPanel.js` — `SkillPanel`: skill tree dialog (key K) with optimistic buys reverted after a timeout.
- `skillModel.js` — pure, DOM-free view-model of the skill panel (`buildSkillView`, `previewBuy`, `nearCamp`, ...).
- `skillIcons.js` — 24x24 stroke SVG icons per skill and tree, plus lock/tick/close glyphs.
- `menus.js` — `ICON_SPRITE`, `initSettings()` (settings dialog) and `renderPause(game)` (pause screen contents).
- `menuTour.js` — lazily loaded `createMenuTour(canvas, onIsland)`: live home-menu camera tour through all three seeded island layouts; owns its scenery renderer, reduced-motion and visibility handling, island selection and disposal.
- `homeMenu.js` — `initHomeMenu()`: create/join expedition, how-to-play and credits dialogs; focus handling and connection status feedback. Keeps the title screen focused on player identity and play actions.
- `homeExplorer.js` — `initHomeExplorer()`: saved level/XP/skills summary and lazy outfit customization with the existing wardrobe; no skill purchases, preview GPU resources are released on close.
- `perfStats.js` — `PerfStats` / `FrameSamples`: FPS and ping overlay (off / compact / detailed).
- `internetTest.js` — `initInternetTest()`: UI for the server's `/internet` start/stop/status endpoint and the shareable address.
- `steamLobby.js` — `initSteamLobby()`: Steam friends/invite panel over the Electron bridge `window.dinoSteam`.
- `preview.html` — standalone HUD preview page (dev tool) with buttons for inventory, map, death, win, hit.
- `preview.js` — fills the preview HUD with fake data every frame, using a real `Terrain` and `buildLayout`.

### hud.js areas of responsibility
- Layout built once in `_build()`: portrait with XP ring, level badge and HP/stamina bars; perk chips (dash, adrenaline); compass and hint bubble; minimap and big map; crosshair, hit marker, eat ring, interaction prompt, revive/medic prompt; key hints; hotbar and carry/load info; team list.
- Overlays: death, downed, mission complete, damage flash/source, toasts and alerts.
- Fruit buffs running (`setBuffs`), the swamp tag (`setSwamp`), hot ground (`setHeat`), the ash rain (`setAsh`: sheltered, a countdown, choking).
- Inventory (loot, fruit, items with `ITEM_INFO` tooltips), the mission board (`shared/missions.js` contracts, relics) and XP gain popups.
- Panel manager: `addPanel/togglePanel/isPanelOpen` host dialogs owned by other modules (wardrobe, boat, crafting, base, skills, grove), so only one panel is open at a time.

## Entry points
- `core/game.js` creates `Hud`, `PerfStats`, `Wardrobe`, `BoatPanel`, `CraftingPanel`, `BasePanel`, `SkillPanel`, `GrovePrompt`, registers the dialogs with `hud.addPanel()`, and uses `nearCamp` from `skillModel.js`.
- `main.js` uses `ICON_SPRITE`, `initSettings`, `renderPause`, `savedOutfit`, `initSteamLobby`, `initInternetTest`.
- Tests: `test/skills-ui.test.js` (skillModel), `test/tracking-minimap.test.js` (buildMapBase), `test/ordering.test.js` (PerfStats).

## Rules
- Dialogs never talk to the network. They receive callbacks (`onCraft`, `onBuild`, `onTower`, `onRepair`, `onBuy`, `onWear`, ...) and `core/game.js` turns them into `net.act(ACT.…)`. The server validates every action; `SkillPanel` treats its optimistic state as a guess replaced by `MSG.PROF`.
- Costs, recipes, skills, relics, outfits and texts come from `src/shared/` (`crafting.js`, `base.js`, `skills.js`, `relics.js`, `outfits.js`, `config.js`); do not hard-code game numbers here.
- HUD per-frame setters only touch `transform` / canvas pixels, skip unchanged values and never read layout during a frame (header rule in `hud.js`).
- The minimap base image is painted once per island (`initMinimap`); frames only blit and draw markers. Map is north-up, -z is north.
- Dynamic text is HTML-escaped (`esc`) before going into `innerHTML`.
- Settings can scroll vertically by wheel/keyboard, but never display native scrollbar tracks or thumbs (including nested audio credits).
- `skillModel.js` stays DOM-free so it can be tested headlessly.
- `new Hud(root)` clears the root element, so each island builds a fresh HUD in the same `#hud` element.

## Not here
- Network calls and action wiring: `client/core/game.js` and `client/net/`.
- Settings storage and definitions: `client/core/settings.js` (menus only renders them).
- Stylesheets: `css/` at repo root (`hud.css` is linked by `hud.js`).
- 3D models (wardrobe preview uses `models/playerModel.js`); world stations themselves: `client/world/hut/`, `client/world/base.js`.
- Rule data (recipes, skill tree, base stages): `src/shared/`.
