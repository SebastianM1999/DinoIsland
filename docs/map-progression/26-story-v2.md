# 26 – Story v2: meaning, ending and gun progression

**Branch:** `claude/story-v2` · **Hängt ab von:** 14–25 (umgesetzt) · **Status:** Vorschlag (Doku, noch nichts umgesetzt)

Proposal on top of the story bible ([14-story.md](14-story.md)). The notes, quests and the finale of 14–25 stay as they are. This file adds a meaning to the story, a real ending and a gun progression. Scope: 3 islands plus the Hollow Mountain (3b, the loot island). Maps 4–8 of the README table are dropped. Only the four guns that already exist in the game are used: **P-19 pistol, MPX-9 SMG, M4A1 assault rifle, SR7 sniper** (`CONFIG.pistol|mpx|rifle|sniper`). No new guns.

Numbers below are starting points, not tuned values.

## 1. What the story is today (short)

| Island | Beats |
|---|---|
| 1 Emerald Jungle | wash ashore without weapons, cold fire, Jonas' skeleton + bottle letter, his spear, raptors hunt in pairs, Elias' peak camp (bow, tier-1 recipes), wreck on the east shore, 3 boat parts, sail |
| 2 Misty Swamp | Elias' raft + note, lantern, Alpha Sarcosuchus, glowblood, fill lantern, Blackmire (last boat part, note about nestless clutches, red glow in the east), sail |
| 3 Ashfall Isle | Elias' station + note, sealed crater gate, repair boat, sail to the Hollow Mountain |
| 3b Hollow Mountain | lantern in the cave maze, wall writing (the source of the eggs), crystal for tier-3 upgrades, Elias' last camp + diary, seal crystal |
| 3 finale | return, open gate, kill the T-Rex king, eruption, countdown, boat = game end, "Elias Brand was never found" |

Weaknesses this file addresses:
- Every island repeats read note, build thing, kill boss or find parts, sail. The goal is always "get the boat".
- The egg / nestless clutch mystery is dropped: the notes explain it, the player's goal never touches it.
- "Sail home" has no destination and no reason.
- Upgrades are only +% stats. The firearm models exist but are creative-only.

## 2. Meaning

**The archipelago is a nursery, and the sea is a cage.**
- The crystal lake in the Hollow Mountain hatches the eggs. The pteranodons carry them to every island, so each island is a seeded hunting ground.
- The same crystal field warps compasses and raises a permanent storm wall around the archipelago. That is why the Meridian sank, and why nobody ever left.
- Elias did not die. He stayed to understand the source, and he wants it protected.
- The boat only hops between islands. It cannot cross the storm wall.

**Final goal: survive the eruption and sail through the gap it burns into the storm.**
- Killing the king wakes the volcano (Elias: "the king and the mountain belong together"). The eruption vents the crystal energy and burns the storm wall away.
- That gives the existing finale a purpose: the escape only opens because of the eruption.
- Implementation hook: outro cutscene shot 1 already shows the boat leaving a burning island. Add a clear horizon where the storm wall stood.

**Final choice at the boat (new, cheap):**
- Take a crystal shard home: rescue and proof, but the source is exposed.
- Leave it and sail home silently, as Elias asked ("do not tell them where we are").
- One interact prompt at the boat and two outro texts. Optional: the text can mention how much the team used guns.

**Tension of the arc:** Elias writes "do not hunt what you do not need". Every gun is stronger and louder than the last, so power costs something, and the ending reflects it.

## 3. Gun progression

Order: pistol, SMG, assault rifle, sniper. Each gun needs:
1. a **recipe** taught by a story note (existing `learn` mechanism of `shared/crafting.js`),
2. a **bench tier** matching its island,
3. **materials**, and
4. **crafted ammo** (no gun starts with ammo, no gun is found lying around).

| Gun | Unlocked on | Recipe taught by | Bench | Materials | Ammo recipe (same bench) |
|---|---|---|---|---|---|
| P-19 pistol | Island 1, after the wreck | new note: Jonas' logbook at the wreck | camp table (exists, `miniBench`) | scrap 6, ironwood 2, resin 1 | 12 rounds: scrap 2, ironwood 1, resin 1 |
| MPX-9 SMG | Island 2, after the Blackmire | existing note `blackmire` | workbench in the swamp base | scrap 10, plates 3, resin 2, hide 1 | 32 rounds: scrap 3, nitre 1, resin 1 |
| M4A1 rifle | Island 3 | existing note `station` | gun bench (new base module) | scrap 16, plates 4, ironwood 4, sulfur 3 | 30 rounds: scrap 4, nitre 1, sulfur 1 |
| SR7 sniper | Hollow Mountain loot, built back on Ashfall | existing note `diary` | same gun bench | crystal 4 (scope lens), scrap 14, plates 3, sulfur 3 | 5 rounds: scrap 3, sulfur 2, crystal 1 |

Bench tiers = islands: camp table (island 1), workbench (island 2 base), gun bench (island 3 base). The sniper is crafted on Ashfall, because the Hollow Mountain has no base. The player has to return there anyway for the finale.

**Materials**
- Existing: resin, ironwood, herb, hide, plates, crystal.
- New (three only):
  - **scrap**: Meridian salvage at wrecks and debris on every island, regrows like the other map resources.
  - **nitre**: swamp bogs.
  - **sulfur**: Ashfall fumaroles in hot zones.
- The Alpha Sarcosuchus drops 6 plates, which pays for the SMG. The boss is the gate to the next gun.
- The sniper needs crystal (8 spots, shared with the tier-3 upgrades), so the loot island pays for it, and its ammo is rare.

**Melee and bow** keep their tier upgrades (tier 1 jungle resources, tier 2 loot, tier 3 crystal). They stay the quiet and cheap option.

## 4. Per island

### 1 Emerald Jungle: the pack hunt
- Keep: Jonas' letter, Elias' peak camp, raptor pairs, wreck.
- Add: a pteranodon raid on camp as a set-piece, hidden Meridian crew pages (2–3) so the crew are more than names, scrap salvage at the wreck.
- The locked giant in the grove stays an optional "come back later" teaser.
- Gun beat: Jonas' logbook at the wreck teaches the pistol. Scarce ammo, a taste of power, not a bow replacement.

### 2 Misty Swamp: stalk in the fog
- Keep: lantern, glowblood, Alpha, Blackmire.
- Add: fog stalking where lantern range is your vision, nitre gathering in the bogs (wading slows you), one night mission where the red glow in the east becomes visible.
- Gun beat: the SMG only arrives after the Blackmire note, so the Alpha fight is bow, spear and pistol.

### 3 Ashfall Isle: heat and timing
- Keep: station, sealed gate, base, boat to the Hollow Mountain.
- Add: sulfur from fumaroles, play around eruption cycles and lava flows, raids on the base where the rifle matters.
- Gun beat: rifle recipe from the station note, gun bench in the base. Build it before sailing to the cave.

### 3b Hollow Mountain (loot island): sound and light
- Keep: crystal, tier-3 upgrades, Elias' last camp, seal crystal, lantern as the light.
- Add: **gunfire is noise**, and the gloom raptors hunt by noise, so firing in the dark draws them. Bow and crystal weapons are the quiet route. This gives the cave its own rule.
- Loot: crystal, scrap, the `wall` and `diary` notes. The `diary` note teaches the sniper.

### Finale on Ashfall: the escape run
- The king fight uses everything the team crafted. Pre-crafted ammo matters, because nothing can be crafted during the countdown.
- Then the eruption, the run to the boat, the sail through the gap, and the final choice.
- The outro text depends on the choice (and optionally on gun use).

## 5. Implementation notes and risks

- **Ammo is free today.** `config.js` gives each gun a starting `reserve` (pistol 48, SMG 96, rifle 90, sniper 25). It has to be 0 and ammo has to come from crafting. Per-gun ammo pools stay as they are. A shared pistol/SMG pool would be a bigger change.
- **Balance is not measured.** The Alpha has 1800 HP: at 26 damage the pistol needs about 70 body shots unless zones (`SHOT.zone`) multiply. Tune ammo yields against dino HP. The goal is that guns help but the bow and spear stay viable.
- **Bench tiers do not exist.** Only the camp table (tier 1, `shared/base.js` `CAMP_BENCH`) is built. The workbench and gun bench rely on base modules (plan 12). Check their status before scheduling this.
- **Not verified yet:** whether the gloom raptor brain (`src/sim/ai/gloomRaptor.js`) reacts to gunshots, and whether `learn` already works for firearm recipes.
- **Gating:** firearms are creative-only today (README decision "Feuerwaffen erst ab Map 4"). That decision is replaced by this file. Update the README decisions and drop the maps 4–8 table when this is built.
- **Texts:** new notes (Jonas' logbook, crew pages, outro variants) go into `src/shared/notes.js` in English, and into this folder as German drafts like the other notes.

## 6. Proposed sub-plans (not started)

| # | Teilplan | Hängt ab von | Hotspots |
|---|---|---|---|
| 27 | Ammo and gun recipes (bench-gated, crafted ammo, reserve 0) | 26 | world.js (craft), crafting.js |
| 28 | Resources: scrap, nitre, sulfur | 26 | layout.js, world.js (gather) |
| 29 | Bench tiers: workbench and gun bench modules | 12 | world.js (base) |
| 30 | Notes: Jonas' logbook, crew pages, gun recipe `learn` links | 26 | notes.js, story.js |
| 31 | Gunfire noise in the cave (gloom raptors) | 27 | sim/ai/gloomRaptor.js |
| 32 | Storm wall + final choice + outro variants | 17, 25 | game.js (outro), cutscene.js |
