# Dinosaur Island — UI image reference prompt pack

Attach the approved skill-tree screenshot as the visual reference. Copy the shared brief below and append **one** numbered screen brief per generation. Generate separate images for different screens or states. These are design references, not runtime assets yet.

The element inventories below were checked against the current game code. Percentages describe the intended reference composition, not new gameplay. Any example quantities or player/save names are illustrative.

## Shared brief — paste before every screen prompt

```text
Create a polished UI reference image for Dinosaur Island, a 1–4-player cooperative first-person dinosaur survival/hunting game.

Use the attached approved SKILL TREE image as the visual source of truth. Make this screen look like another screen from exactly the same game and UI art set.

ART DIRECTION
Hand-painted, tactile prehistoric expedition adventure. Chunky carved and chipped stone frames, warm ivory sandstone/parchment title plaques, dark forest-green or deep teal recessed content surfaces, moss and small ferns in frame seams, broad jungle leaves around the outer corners. Warm sunlight, soft painted shading, restrained bevel highlights, subtle prehistoric silhouettes. Rich and welcoming, with strong readability. Detailed decorative edges, quiet areas behind text. Stone, parchment and foliage must have the same finish as the reference.

Use moss green/teal for normal controls, warm gold for primary or selected controls, blue stone for information, muted red/terracotta for dangerous actions, grey stone for unavailable actions. Do not repeat the skill tree's three colored columns on every screen: preserve the material family while following each screen's actual layout.

LAYOUT AND CONSISTENCY
Landscape 1672 × 941 composition, approximately 16:9, viewed straight on. This is a fixed-proportion composition that will be centered on ultrawide monitors; never stretch the artwork horizontally. Dialogs sit within this stage with generous surrounding space. A small settings dialog must not become a full-screen dashboard. Preserve the requested column counts and numbers of slots.

Use compact, consistently sized buttons and cards. Center a lone card within its row; do not make it longer than paired cards. Align the visible lettering within the actual clear space inside the painted borders. Center headings, button labels and equipment-card labels. Longer descriptions, settings rows, lists and key/action tables may use readable left alignment. Give icons and text their own space; never overlap them. Keep decorations away from controls and text. Keep a clear hierarchy between screen title, section headings, item names, descriptions and numeric details.

TYPOGRAPHY AND CONTROLS
Bold, friendly, slightly condensed adventure lettering for titles, readable rounded sans-serif for body copy. Dark teal text on parchment, warm cream text on dark panels. Large legible labels, subtle text shadow, no texture running through the letters. Consistent carved square close button with X at the top right of dialogs. Compact teal Close/Back buttons, stone tabs, inset slider grooves with gold fill and a substantial stone thumb, carved checkboxes, recessed text-entry fields and small arrow buttons. Focused/hovered controls have a warm light rim; disabled controls are muted and visibly unavailable.

CONTENT RULES
Follow the requested screen's actual game controls. Do not invent currencies, shops, battle passes, armor equipment slots, talent categories, extra settings or extra menu routes. Do not add buttons just to fill space. Different conditional states should be separate images. Main-menu scenery is a backdrop; in-game dialogs sit over a subdued game view. No developer labels, browser chrome, watermarks, phone frame, perspective mockup, or collage.

OUTPUT
Produce exactly one complete screen reference for the screen brief appended below, with the specified UI labels and all listed controls. This is a readable labeled design mockup. Do not generate unrelated screens in the same image.
```

## 01 — Main menu

```text
SCREEN: MAIN MENU
Full-stage prehistoric jungle island backdrop with a waterfall, mountains and distant dinosaurs, leaving the navigation area readable. Preserve the current composition: the main navigation occupies the left third; the right side remains mostly scenic.

At upper left, small line: “Co-op dinosaur survival · 1–4 explorers”. Large two-line game logo: “Dinosaur Island”. Supporting line: “Explore the islands. Hunt together. Repair your boat and sail into the unknown.”

Below, one compact explorer identity card: feather/expedition emblem, “Playing as”, editable name “Explorer”, the note “Level and skills are kept per expedition”, and “Customize”.

Navigation: one prominent “Play solo” button with arrow and the smaller caption “An offline expedition of your own”. Beneath it, two equal side-by-side buttons: “Create game” and “Join game”. Reserve a discreet status/player-list area beneath these controls.

Bottom utility navigation: four separate compact buttons, “Skill tree”, “How to play”, “Settings”, “Credits”. On the scenic right side, a compact “Next island” control. Do not add a shop, battle pass, achievements, or a separate global character-level meter.
```

## 02 — Settings: Sound & view

```text
SCREEN: SETTINGS — SOUND & VIEW
A centered medium dialog, roughly 720:600 proportions, not a full-screen panel. Parchment header with gear emblem, “Settings”, top-right X. Three equal tabs: “Sound & view” selected, “Graphics”, “Controls”. All three settings screens must share exactly the same outer frame and footer positions.

Content rows have a label at left, horizontal slider in the middle, value at right. Section “Sound”: “Master volume” 0–100%, “Music” 0–100%, “Effects” 0–100%. Section “View”: “Field of view” 60–100°, “Mouse sensitivity” 20–300%. Show sensible example values, not extra controls.

Below the rows, a collapsed disclosure labeled “Audio credits”. Bottom footer: grey “Reset to defaults” at left, gold/teal primary “Done” at right. Content may scroll internally in the implemented dialog, but do not paint a native scrollbar. No Apply button, language setting, voice chat, subtitles, or additional tabs.
```

## 03 — Settings: Graphics

```text
SCREEN: SETTINGS — GRAPHICS
Use exactly the same frame, size, header, three tabs and footer as the Sound & view reference. Select “Graphics”.

Four rows only: “Render scale” slider 50–100%; “Contact shading” slider 0–60%; “Max frame rate” discrete slider with choices 30 FPS, 60 FPS, 90 FPS, 120 FPS, 144 FPS, 240 FPS, Unlimited; “Show FPS & ping” checkbox with an adjacent status value. Show the checkbox enabled and labeled On; the game can also show Detailed through its in-game diagnostic shortcut, but this screen does not contain a separate detailed-mode dropdown.

Keep “Reset to defaults”, “Done” and top-right X. Do not invent resolution, fullscreen, V-sync, ray tracing, shadow-quality presets, texture-quality settings or a GPU benchmark button.
```

## 04 — Settings: Controls

```text
SCREEN: SETTINGS — CONTROLS
Same fixed settings dialog and tabs; select “Controls”. The body is a readable two-column key/action reference list: carved keycaps on the left, descriptions on the right. It is a help list, not a key-rebinding editor. Use enough spacing to keep entries legible; long content continues through internal scrolling rather than tiny compressed text. Do not paint a native scrollbar.

Entries, in order:
W A S D — Move
Shift — Sprint
Space — Jump
Q — Dash (Endurance skill)
Mouse — Look around
Left click — Attack / hold to draw the bow / place
R — Reload firearm
Right click — Throw spear / hold to scope the sniper
1–8 — Spear, bow, trap, fruit, pistol, rifle, MPX, sniper
E — Interact (loot is picked up automatically)
F — Eat fruit
G — Give fruit to a teammate
V (hold) — Butcher a carcass with the knife
L — Light / put out the torch; light cave wall torches with E while carrying a burning torch
C (hold) — Dive while swimming; Space swims up
Tab — Inventory
M — Map
X — Expand/collapse missions and team quests
K — Skills
U — Get unstuck
Esc — Pause menu
Space Space — Creative mode: fly on/off; Space up, Shift down

Keep Reset to defaults and Done in the fixed footer. A single image should show the top portion of this scrollable list clearly, not squeeze every row into unreadably small type.
```

## 05 — Credits

```text
SCREEN: CREDITS
Centered compact-to-medium parchment-and-teal dialog. Header eyebrow “Behind the expedition”, title “Credits”, X at upper right. Intro: “Dinosaur Island · A co-op dinosaur hunting game.”

Two stacked framed sections. First: “Music & sound”, with text crediting Scott Buckley and Tsorthan Grove and a sentence that recorded/performed effects have source and license credits. Include the link “View sound credits” and button “Music attribution & settings”. Second: “Built with”, with “Three.js, Node.js and Electron. Steam co-op uses Steamworks.”

Bottom “Back to menu”. Use generous whitespace; do not invent development-team names, publisher logos, awards or extra sponsor credits. Keep attribution text easy to read.
```

## 06 — Inventory: explorer overview

```text
SCREEN: INVENTORY — EXPLORER OVERVIEW
A wide centered fixed-size dialog over a subdued first-person jungle game view. Parchment header “Inventory”; compact top-right “Close Esc”. Two main columns, approximately 55% for item storage on the left and 45% for explorer preview on the right. No scrolling.

Left upper section “Pockets”, helper “drag to rearrange · select one and press 1–8”. Exactly EIGHT equal compact pocket cards in FOUR columns and TWO rows. Default order: 1 Spear; 2 Bow; 3 Trap; 4 Fruit; 5 P-19 pistol; 6 M4A1 assault rifle; 7 MPX-9 submachine gun; 8 SR-7 Longbow. Each has its key number, distinct equipment icon, centered name and a small count/ammo/durability readout. Show one equipped highlight and a few unavailable weapons with a lock and muted icon.

Below, “Backpack”, used/max stack count, exactly SIX equal cells in THREE columns and TWO rows. Example filled cells: Meat, Hide, Teeth, Resin; retain two visibly empty cells. Each occupied cell has an icon, quantity and name. Beneath: “Load [current / max] · Speed [percent]”, then an outlined target “Drag here to drop on the ground”. Values are illustrative.

Right: one full-body stylized explorer on a round wooden platform, wearing a ranger outfit and holding the selected equipment, with “Select a pocket or a backpack stack to see its stats.” Keep the preview calm and unobstructed.

Do not add helmet/chest/boots equipment slots, an RPG paper-doll gear system, quest lists, a 30-slot bag, currency or a ninth torch pocket. The torch is separate offhand equipment in the game.
```

## 07 — Inventory: selected item

```text
SCREEN: INVENTORY — SELECTED MATERIAL
Preserve exactly the same frame, two-column proportions, eight pockets and six backpack slots as the inventory overview. Highlight the selected Teeth backpack stack.

The right column REPLACES the explorer preview with an item-detail card. Do not show both simultaneously. Include a large tooth icon, material/type label, name “Teeth”, carried quantity, short material description, and labeled stat rows such as weight per unit and stack weight. Use illustrative values rather than inventing balance rules.

At the bottom of the details area: “Back”, “Drop stack”, and “Deposit at hut”, with a small hut-proximity note. Show Deposit unavailable if the explorer is away from the hut. For a weapon variation, use its actual ammo/durability and weapon-stat rows and omit Deposit at hut. Keep all text centered or aligned within its own clear inset area, with equal compact action buttons.
```

## 08 — Buttons and reusable controls

```text
SCREEN: UI COMPONENT REFERENCE SHEET
This particular image is an organized component sheet, not a gameplay screen. Plain dark forest-green background, generously spaced and consistently lit front-facing assets matching the attached skill tree.

Show compact rounded carved buttons in teal normal, moss-green, gold primary/selected, red dangerous, grey disabled. Provide aligned normal, hover/focus and pressed variants at exactly matching dimensions. Include both a short icon-plus-text button and a medium label button; do not make random lengths.

Example labels: Play solo, Continue, Back, Close, Done, Craft, Repair, Delete. Include square X close, left/right arrows, three stone tabs with one selected, slider groove with fill and thumb, checkbox off/on, recessed name/address input, copy-address icon button, lock/check badges, small numeric counter, circular icon medallion, empty item slot, selected item slot, locked item slot, and a restrained progress bar.

Keep a quiet interior for every label. No UI code, CSS names or implementation annotations in the art. This is a reference kit; clean transparent production pieces can be requested separately after design approval.
```

## 09 — Choose an expedition

```text
SCREEN: CHOOSE AN EXPEDITION
Centered medium-wide dialog. Eyebrow “Play solo”, title “Choose an expedition”, X. Small explanatory text: each expedition keeps its own island, team progress, explorer level, skills and backpack.

Top section “New expedition”: a “Name” input with example “Expedition 3”, adjacent primary “Start”, and a short note about a fresh explorer at level 1.

Below, “Saved expeditions” with two or three vertically stacked equal cards. Each shows a save name, island number/name, play time, last-save line, party names, and compact actions Continue, Rename, Export, Delete. Show one small “Creative used” or “Restored from a backup” badge as an example, not every warning at once. Browser footer includes “Import from file” and a small export/back-up reminder. Bottom “Back to menu”.

For the host variation the primary row action is “Host” and new-expedition action “Start and host”. No global character-progression panel, save-slot purchase buttons, cloud-sync switches or invented map-selection carousel.
```

## 10 — Create an expedition

```text
SCREEN: CREATE AN EXPEDITION
Centered dialog with three stacked connection sections. Eyebrow “Gather your crew”, title “Create an expedition”, X, and “Explore together with up to four players. Choose how your friends will connect.”

Section 1 “Steam friends”: connection-status line; “Who can join?” selection with Friends only / Invite only / Anyone; “Host game”. These Steam controls are present in the Steam-enabled state.
Section 2 “Over the internet”: “Host internet game”, “Address to share” read-only field with an adjacent copy icon, status line, and conditional “Stop internet game” in the hosting state.
Section 3 “On the same network”: “Host LAN game”, “Your host address” read-only field and copy icon, optional “Network to share” selector, network-status line.

Bottom feedback area and “Back to menu”. Address fields must look like fields, not long decorative buttons. No server rental, server-region map, password field or additional game-mode choices.
```

## 11 — Join an expedition

```text
SCREEN: JOIN AN EXPEDITION
Centered dialog. Eyebrow “Find your crew”, title “Join an expedition”, X. Three stacked sections.
“Steam games”: availability note and “Friends & public games”.
“Internet invitation”: label “Your friend’s room address”, address input, primary “Join internet game”.
“LAN / direct connection”: label “IP or WebSocket address”, input with example ws://192.168.1.10:8081, “Join LAN game”, and short same-network helper text.

Bottom connection-feedback area and “Back to menu”. Preserve the distinction between Steam, internet invitation and LAN. Do not invent a browser-wide server table on this screen.
```

## 12 — Friends / public games

```text
SCREEN: JOIN A FRIEND
Centered compact list dialog titled “Join a friend”. Status text at top. List of equal rows with a friend name and small “Join” button. Below the list, “Or enter a lobby ID”, numeric input and adjacent “Join”. Footer actions “Browse public games”, “Refresh”, “Back”.

Public-game variation is titled “Public expeditions”; rows show expedition name, N/4 explorers and Join; the browse toggle says “Show friends”. Invite variation is titled “Invite friends” with Invite buttons, and omits the lobby-ID form and public-browse button. Generate only the requested variation, not all states together. No chat box, voice controls or fake social feed.
```

## 13 — Expedition lobby

```text
SCREEN: EXPEDITION LOBBY
Wide centered composition with header eyebrow “EXPEDITION LOBBY”, expedition name and status line. Central stage has FOUR evenly spaced round wooden platforms. Show two or three stylized explorers and retain the empty platform positions for remaining slots.

Directly under each occupied position, an equal compact player card: name, optional Host badge, Level number, “Skills”, and a conditional host-only Kick control for another explorer. Empty slots read as waiting for players. Do not add ready-check toggles; the host starts the expedition.

Bottom actions: prominent “Start expedition”, “Invite friends” when supported, and red “Leave”. Shared parchment/stone/foliage materials; leave enough space around the characters to read their silhouettes.
```

## 14 — In-game expedition menu

```text
SCREEN: EXPEDITION MENU
Centered wide dialog over a subdued live island scene. Eyebrow “LIVE EXPEDITION”, title “Expedition menu”, subtitle “Stay alert. The island keeps moving.”, save-status line and upper-right X.

Left action rail about one third: primary “Back to the island”, “Settings”, collapsed “Testing tools”, and red “Save & quit” for a saved expedition (or “Leave game” for a non-saved session). Do not show both exit labels as separate actions. Testing tools may expand to “Creative mode: Off”.

Right two-thirds: upper section with current expedition title, objective checklist and progress; Team quests beneath. Lower section “Players” with up to four rows: name, Host badge where applicable, health bar and value, and conditional host-only Kick control. Include optional “Invite friends” and, for an internet host, an address/copy field below the players.

Small footer keyboard hints for selection/open/return. Preserve that the expedition remains live; do not add a misleading “Game paused” banner.
```

## 15 — Home explorer / outfit

```text
SCREEN: EXPLORER CUSTOMIZATION
Centered wide dialog. Eyebrow “Your expedition companion”, title “Explorer”, X. A slim information area explains that name/outfit travel between expeditions while level, XP, skills and backpack belong to each expedition. Include “Read the skill tree”.

Main customization area: rotatable full-body explorer on a round wooden platform at left, helper “Drag to turn”. At right, three stacked groups: “Hat”, “Shirt / Jacket”, “Pants”. Each group has previous arrow, selected outfit name, index such as 1/10, next arrow and exactly TEN small outfit/color swatches. Example selections: Ranger Hat, Explorer Shirt, Hiking Shorts.

Bottom actions: “Surprise me”, “Undo changes”, primary “Wear outfit”. The unchanged state can instead read “Looking good!”. No face sculpting, skin-tone editor, body sliders, purchasable skins or armor-stat comparison.
```

## 16 — Camp wardrobe

```text
SCREEN: WARDROBE
Reuse the same explorer preview, three category groups, ten choices per category and three footer actions from the explorer customization reference. This is the in-game camp version, with title “Wardrobe” and E / Esc close hint. Omit the home-only expedition-progression explanation and Read the skill tree link. Use the same fixed frame family and preview platform.
```

## 17 — Crafting box: Supplies

```text
SCREEN: CRAFTING BOX — SUPPLIES
Centered medium-wide list dialog. Header crate emblem, “Crafting box”, E / Esc close hint. Horizontal “Hut store” resource strip: Meat, Hide, Teeth, Plates, Claws, Bones, Skull, Resin, Ironwood, Healing herb, each with an icon and example quantity.

Tabs “Supplies” selected and “Team upgrades”. Exactly THREE equal recipe rows: “Arrows ×6” costs 1 Tooth; “Spike trap” costs 1 Hide + 1 Claw; “Spare spear” costs 1 Tooth + 1 Hide. Each row: circular recipe icon, name/short effect, resource-cost medallions, “Craft” action at right. Show one unavailable Craft action and muted shortage cost to demonstrate the disabled state.

Footer “Free basic resupply” and “Close”. Do not add a forge, recipe-search system, dozens of new items or personal currency.
```

## 18 — Crafting box: Team upgrades

```text
SCREEN: CRAFTING BOX — TEAM UPGRADES
Same frame, store strip, tabs and row construction as Supplies. Select “Team upgrades”. Six rows: Reinforced bow, Stone spearhead, Leather quiver (tier 1); Longbow, Barbed spear, Trap crate (tier 2). Show Bow / Spear / Gear category and tier tags where appropriate, icon-based material costs and an action/status at right.

Use a mixture of the actual states “Craft”, “Built”, “Island 2”, “Camp table”, “Needs previous”. Footer Close. This is a list of team upgrades, not a branching skill tree or a new research mechanic. Example resource quantities may be illustrative; do not invent exact upgrade bonuses.
```

## 19 — Base / defence towers

```text
SCREEN: YOUR BASE — LODGE
Centered medium-wide construction dialog over the island. Title “Your base: Lodge”, close hint. Short introduction, Hut store resource strip, base-health bar with condition text, icon-based repair costs and a compact “Repair” button.

Three stage rows: Camp — stage 1; Lodge — stage 2; Fort — stage 3. Each shows an emblem, description, costs and action/state at right. Show Camp and Lodge built, Fort available to upgrade.

Below, “Defence towers”, exactly FOUR named Tower spot rows. Lodge unlocks two spots; the remaining two show Locked. An unlocked empty spot offers Arrow tower or Spear ballista, with costs. A built tower offers Upgrade; upgraded names are Twin crossbow and Heavy ballista, with Max at their final stage. Footer Close. Do not add a building-placement grid, draggable structures, a settlement map, or worker assignments inside this dialog.
```

## 20 — Boat / The Wreck

```text
SCREEN: THE WRECK — INCOMPLETE BOAT
Compact centered boat-repair dialog. Boat emblem, title “The Wreck”, E / Esc close hint. Short status sentence and found-parts progress bar, for example 1/3 parts. Exactly THREE vertically stacked equal part cards, each with object icon at left, actual part name and found/missing hint in the middle, checkmark or question mark at right.

Use three part rows supplied by the current island. Valid game part names include Golden Egg, Glow Crystal, Brass Propeller, Ship's Wheel, Old Anchor, Patched Sail, Ship's Bell, Brass Compass, Obsidian Rudder. They are an object catalog, not nine simultaneous requirements; do not infer a specific island's combination from this list.

Bottom disabled “Repair the boat” while parts are missing, and Close. Missing hints can mention dinosaur nests, the waterfall, highest peak, old ruins or caves as appropriate to the chosen actual part.

If asked for the repaired variation instead: show all three parts found, “The boat is seaworthy!” and the team-gathering instruction; footer “Set sail Enter”, “Inventory Tab”, “Close”. Do not show Repair and Set sail as simultaneous enabled actions.
```

## 21 — Mission board

```text
SCREEN: MISSION BOARD
A large expedition noticeboard in the same stone/parchment/jungle family, with pinned paper notes and tidy readable cards. Main quest area shows “Repair the boat and sail on”, current island, parts progress, three relic-part rows, remaining objective checkboxes and an Islands completed count.

Team quest cards show an icon, title, short requirement, progress bar/count, reward text and “Track” or selected “Tracking”. Use actual quest titles: Island Forager, Raptor Trouble, Tooth Collector, Armored Giant, Trapper, Sky Hunter, King of the Island. Example real rewards include Fruit pouch +1, Quiver +4 arrows, Bigger backpack (+6 load), Carry +1 trap. Completed quests occupy their own finished area. Do not create quests with invented names, currency rewards or daily timers.
```

## 22 — Warning / hint dialogs

```text
SCREEN: ASHEN MAW WARNING
A small centered warning dialog, much smaller than inventory/settings. Terracotta stone accent, exclamation medallion, title “Warning”. Text: “Beyond these burning stones lies the Ashen Maw. Something ancient and enormous lives out there in the lava.” Followed by “Do you really want to enter?” Two equal centered buttons “Yes”, “No”. Keep all warning text within the quiet panel interior.

This is one state of an existing sequence. If asked for the next state separately, show the explorer's fearful reaction and one Continue button; the final Hint state has one Got it button. The current hint mentions Primal Courage as teaser copy; do not create a new skill tree or imply that skill is already implemented.
```

## 23 — Expedition loading

```text
SCREEN: EXPEDITION LOADING
Full-stage island scenery with a restrained parchment/stone information panel, following the same materials as the menus. Dinosaur footprint emblem, small “Dinosaur Island / Expedition deployment”, large island name, current loading stage, small playful caption, and FOUR stage markers. Stages: Connecting expedition; Loading dinosaur models; Building the island; Preparing shaders. Show one active stage and previous stages completed.

Island names: Emerald Jungle, Misty Swamp, Ashfall Isle, Hollow Mountain. Footer tip: “Stay together. Dinosaurs prefer explorers who wander off.” This is a status screen with no fake interaction controls, and stage progress must not look like a fabricated exact percentage.
```

## 24 — Defeated / downed status cards

```text
SCREEN: DEFEATED
Small centered restrained red/stone status card over a subdued live island view. Skull emblem, title “You were defeated”, text “Your carried loot lies where you fell.”, and a reserved countdown line. Keep the mood consistent with the friendly adventure art; no gore. Do not invent a paid revive, Retry button or new death menu.

If asked for the separate downed state instead, title “You are downed”, text “A teammate can revive you”, countdown and context-key hint. Keep this separate from the defeated image; it is a different existing game state.
```

## 25 — How to play

```text
SCREEN: HOW TO PLAY
Centered medium parchment-and-teal dialog with eyebrow “Your first expedition”, title “How to play”, top-right X. Four numbered stacked sections with modest expedition icons and short paragraphs:
1. “Explore and prepare” — follow trails, gather fruit and craft supplies at camp; fruit restores health.
2. “Hunt as a team” — track dinosaurs, choose your moment, watch your crew and harvest fallen dinosaurs for resources.
3. “Find the boat parts” — consult the mission board, search, repair the boat and gather everyone to sail.
4. “Grow stronger” — hunts and recovered boat parts earn experience; K opens Skills.

Bottom “Back to menu”. Keep this a readable guide with four sections, not a new interactive tutorial, controls editor or quest-selection screen.
```

## After a reference is approved: request usable artwork

Do not use this variant until the labeled design is approved. It avoids locking live UI text and numbers inside a bitmap.

```text
Use the approved screen reference to produce its decorative background skin at the identical canvas dimensions and positions. Preserve the frame, material shading, decorative jungle foliage, parchment regions and quiet recessed panels. Remove ALL text, letters, numbers, progress fills, item icons, skill icons, portraits, characters, slider thumbs, check states, buttons and other interactive controls. Leave the corresponding areas clean so live HTML/SVG controls can be overlaid. Do not change the panel geometry or proportions.

For reusable buttons, tabs and control ornaments, generate a separate consistently spaced transparent asset sheet with no baked labels, all variants matching dimensions and lighting. Keep background skins and transparent interactive pieces separate.
```

## Code consulted

- `index.html`: main navigation, host/join, credits, guide, settings/help, pause menu and friends shell.
- `src/client/core/settings.js`, `src/client/ui/menus.js`: actual settings definitions, attribution and party/pause controls.
- `src/client/ui/hud.js`, `itemInfo.js`, `src/shared/protocol.js`: eight pockets, six default backpack cells, explorer/detail state, mission board and defeat/downed cards.
- `src/client/ui/homeExplorer.js`, `wardrobe.js`, `src/shared/outfits.js`: explorer/outfit controls and catalogs.
- `src/client/ui/expeditionPanel.js`, `lobbyScreen.js`, `steamLobby.js`: saves, lobby, Steam/public/friend states.
- `src/client/ui/craftingPanel.js`, `basePanel.js`, `boatPanel.js`, `grovePrompt.js`, `loadingScreen.js`, with their shared catalogs: in-game station dialogs and loading.
- Approved theme: `css/skills.css`, `assets/ui/skills/jungle-skill-tree.webp` and the current skill-tree screenshot.
