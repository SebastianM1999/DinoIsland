# ui
> Plain-DOM user interface: the in-game HUD and minimap, the dialogs opened at world stations (crafting, base, boat, wardrobe, skills, grove), shell menus, the performance readout and the desktop/LAN lobby helpers.

## Files
- Torch: `hud.setTorch(owned, lit)` pill beside the quiver (hidden until picked up, shows L and Lit/Out); `icons.js` `torch`, `itemInfo.js` `torch`.
- `hud.js` — `Hud`: the in-game HUD (~1080 lines, see below).
- `missionSummary.js` — pure compact goal copy from host mission phases/relic progress; keeps pinned contracts visible without rendering the entire checklist during play. Full objectives remain in the expedition menu and board, and the live HUD expands expedition objectives and team quests with X.
- `caveMap.js` — `buildCaveMapBaseSteps` and fog of war for the Hollow Mountain's map: the interior is covered, `revealMap` (called from `Hud.setMinimap`) uncovers what the player has walked through; the coves show normally.
- `minimap.js` — `buildMapBase` (`buildMapBaseSteps`, the same painted in row bands for the loading sequence) paints the island once to an offscreen canvas (swamp bogs and the swamp arena ring, the volcano's lava craters and crater rim included); `drawMap` blits a region plus markers each frame.
- `icons.js` — `ICONS`, `icon(id)`, `portraitSvg()`: inline 32x32 SVG item/HUD icons with distinct equipment/material silhouettes at small sizes (every fruit kind, the map resources `resin`, `ironwood`, `herb`, `flame` for heat and the volcano's warnings, `ash` for the ash rain).
- `itemInfo.js` — `ITEM_INFO`: names and tooltip texts for inventory items, numbers taken from `CONFIG` (no fixed slot numbers: pockets are rearrangeable); `itemStats(kind, count)`: the inventory's [label, value] stat rows (damage, range, magazine, heal, weight per unit and stack weight).
- `craftingPanel.js` — `CraftingPanel`: hut workbench dialog (supplies tab and team upgrades tab, refill).
- `basePanel.js` — `BasePanel`: base dialog on islands 2+ (pick plot, upgrade stage, build/upgrade towers, repair).
- `boatPanel.js` — `BoatPanel`: boat wreck dialog listing found/missing boat parts and the Repair button; once repaired, Set sail (Enter) and Inventory (Tab).
- `grovePrompt.js` — `GrovePrompt`: Yes/No warning and hint shown at the giant's pen barrier.
- `wardrobe.js` — `Wardrobe` (hat/top/pants picker with rotatable 3D preview) and `savedOutfit()` from localStorage.
- `characterPreview.js` — `CharacterPreview(canvas, { slot, outfit, equipped })`: the rotatable explorer on a wooden platform (own WebGL renderer, created on first `start`, drag to turn, idle spin), `setOutfit`, `setEquipped`, `start/stop`, `dispose`. Used by the wardrobe (and through it the home explorer) and the inventory.
- `skillPanel.js` — `SkillPanel`: skill tree dialog (key K), numeric ranks/costs and readable locked states, a viewport-fitted three-branch tree without scrolling, aggregate tier spending/progress, with optimistic buys reverted after a timeout. All three branches and tiers fit the viewport without tree scrolling; selected skill explanations remain in the footer. Locked tiles remain keyboard-inspectable; purchase rules stay in the shared model.
- `skillModel.js` — pure, DOM-free view-model of the skill panel (`buildSkillView`, `previewBuy`, `nearCamp`, ...).
- `skillIcons.js` — 24x24 stroke SVG icons per skill and tree, plus lock/tick/close glyphs.
- `menus.js` — `ICON_SPRITE`, `initSettings()` (settings dialog) and `renderPause(game)` (live expedition menu: left action rail, always-visible mission objectives, team quests and players in a right-hand column). Keyboard focus/navigation lives in `main.js`; the island keeps running.
- `menuPostcards.js` — the home screen's backdrop (the only one: there is no live scenery behind the menu). Two stacked `<img class="menu-preview-image">` layers crossfade (`FADE_MS` 1.8 s) through the selected island's photographs (`SHOT_MS` 9.5 s each, all shots in order, then around); each shot gets one of four Ken Burns motions (`kb-0..3` in `css/menu.css`: slow zoom plus a pan whose direction varies; transform and opacity only, so no per-frame JavaScript, one `setTimeout` per shot). The next photograph is decoded on the hidden layer (`img.decode()`) before it fades in; a broken one is skipped. `setIsland` crossfades to another island's first shot (stale selections ignored), `setSuspended` (dialogs open) and a hidden tab pause the timer (remaining time kept) and the CSS animation (`is-still`); `prefers-reduced-motion` shows one still photograph without cycling. Notifies main.js (`onIsland`) so Next island and the solo starting island stay in sync. No Three.js, no world/sim imports (`test/menu-postcards.test.js` checks the module graph).
- `loadingScreen.js` — lightweight expedition loading overlay using cached map photographs, CSS motion and truthful connection/model/world/shader stages with playful secondary captions; generated dinosaur footprint loading icon; cleanup, hidden-tab and reduced-motion support. Styled by `css/loading.css`.
- `mapPreviews.js` — shared per-island preload/decode cache for photographs, also reused by expedition loading. `PREVIEW_SHOT_COUNTS` (five per island, all four islands) names `assets/previews/island-{n}-{k}.webp`; a test compares it with the files on disk. Failed photographs are omitted; independent island loads never wait for other islands.
- `menuPreviewCapture.js` — opt-in developer photo studio (`?debug&dev&capturePreviews=1`, installed by `main.js` after the game is built; never imported by a normal session): top graphics tier, free camera (`pose({from, to, fov, dinos})`, heights over the terrain), no HUD or viewmodel, creative mode so the player (and with it the streamed terrain) moves to the camera. Driven by `scripts/capturePreviews.mjs`; see `assets/previews/README.md`.
- `homeMenu.js` — `initHomeMenu()`: create/join expedition, how-to-play and credits dialogs; focus handling and connection status feedback. The right-side Next island button cycles available solo starting islands; the temporary playtest flag exposes all solo starting islands without granting earned unlocks.
- `homeExplorer.js` — `initHomeExplorer()`: saved level/XP/skills summary and lazy outfit customization with the existing wardrobe; no skill purchases, preview GPU resources are released on close.
- `homeSkills.js` — `initHomeSkills()`: complete skill tree before play, draft purchases and refund/reset using earned points; explicit Save build persists the validated profile, Cancel discards edits. XP and bonus points are preserved; gameplay keeps its authoritative camp reset rules.
- `perfStats.js` — `PerfStats` / `FrameSamples`: FPS and ping overlay (off / compact / detailed).
- `internetTest.js` — `initInternetTest()`: UI for the server's `/internet` start/stop/status endpoint and the shareable address.
- `steamLobby.js` — `initSteamLobby()`: Steam friends/invite panel over the Electron bridge `window.dinoSteam`.
- `preview.html` — standalone HUD preview page (dev tool) with buttons for inventory, map, death, win, hit.
- `preview.js` — fills the preview HUD with fake data every frame, using a real `Terrain` and `buildLayout`.

### hud.js areas of responsibility
- Layout built once in `_build()`: independent bottom-left player name, portrait/XP ring, level badge and labeled HP/stamina percentages; expandable mission top-left, single-column compact key hints/equipment/team at the edges; perk chips (dash, adrenaline); compass and hint bubble; minimap and big map; crosshair, hit marker, eat ring, interaction prompt, revive/medic prompt; carry/load info. Normal edge information hides behind the live expedition menu while critical overlays remain available.
- Overlays: death, downed, mission complete, damage flash/source, toasts and alerts.
- Fruit buffs running (`setBuffs`), the swamp tag (`setSwamp`), hot ground (`setHeat`), the ash rain (`setAsh`: sheltered, a countdown, choking).
- Selected equipment readout identifies the weapon/item and separates durability, arrow wear, loaded/reserve rounds, reload status and available item counts; numeric hotbar slots retain their keyboard shortcuts.
- Inventory (Tab, never scrolls): pockets 1-7 (the seven tools, shown in two rows of four in the player's order from `inv.pockets`; locked/unowned tools keep their pocket, greyed with a lock; drag a pocket onto another, or select one and press 1-7, to swap: `onPocketSwap`) and the 2x3 backpack (non-zero material stacks only, `inv.slots` cells, empty cells shown as empty slots, load/speed line). The right side shows the explorer (`CharacterPreview`, imported lazily on first open, running only while visible, outfit from `setOutfit`, holding the tool in hand); selecting a cell swaps it for the item's `itemStats` and `ITEM_INFO` with Drop (and Deposit for materials) through `onInventoryDrop`; Back, clicking the cell again or Esc (`inventoryBack()`, asked first by core/game.js) return to the explorer. Dragging a stack/tool out of the panel or onto the drop zone drops it; server validates deposit proximity. The mission board (`shared/missions.js` contracts, relics) and XP gain popups.
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
- `new Hud(root)` clears the root element, so each island builds a fresh HUD in the same `#hud` element; `dispose()` frees the inventory's preview WebGL context.

## Not here
- Network calls and action wiring: `client/core/game.js` and `client/net/`.
- Settings storage and definitions: `client/core/settings.js` (menus only renders them).
- Stylesheets: `css/` at repo root (`hud.css` is linked by `hud.js`).
- 3D models (wardrobe preview uses `models/playerModel.js`); world stations themselves: `client/world/hut/`, `client/world/base.js`.
- Rule data (recipes, skill tree, base stages): `src/shared/`.
