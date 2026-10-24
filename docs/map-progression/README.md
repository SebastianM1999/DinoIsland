# Map-Progression – Übersicht

Stand: 2026-10-03

Dieser Ordner ist der Gesamtplan für Waffen-Freischaltung, Dino-Level, Craft-Kiste, Zelt auf Map 1, den Nebelsumpf (Map 2), die neue, begehbare Base und die Story (14–25). Er ist in **Teilpläne** zerlegt, die jeweils ein eigener Branch (`codex/luca/<task>`) und ein eigener PR sind.

**So wird gearbeitet**
- Einen Teilplan erst starten, wenn alle Teilpläne unter „Hängt ab von“ gemergt sind.
- Beim Start den Status unten auf `in Arbeit` setzen, nach dem Merge auf `fertig`.
- Weicht die Umsetzung vom Teilplan ab, wird der Teilplan im selben PR angepasst.
- Hotspots (`src/sim/world.js`, `src/client/core/game.js`, `src/client/ui/hud.js`) sind pro Teilplan angegeben. Zwei Teilpläne mit demselben Hotspot-Bereich nicht gleichzeitig bearbeiten.
- Voraussetzung für alles: `codex/luca/world-surface-detail` ist gemergt (ändert `layout.js`, `levels.js`, `hut.js`, `world/base.js`).

## Teilpläne und Status

| # | Teilplan | Hängt ab von | Hotspots | Status |
|---|---|---|---|---|
| 01 | [Datenbasis](01-datenbasis.md) | – | – | offen |
| 02 | [Dino-Level](02-dino-level.md) | 01 | – | offen |
| 03 | [Waffen-Freischaltung](03-waffen-freischaltung.md) | 01 | world.js (craft, Inventar) | offen |
| 04 | [Armbrust](04-armbrust.md) | 03 | game.js (Hotbar), hud.js (Hotbar) | offen |
| 05 | [Craft-Kiste](05-craft-kiste.md) | 01 | world.js (store, deliver) | offen |
| 06 | [Begehbare Gebäude (Technik)](06-begehbare-gebaeude.md) | – | – | offen |
| 07 | [Map 1: Zelt](07-map1-zelt.md) | 05, 06 | – | offen |
| 08 | [Sumpf: Biom und Generator](08-sumpf-biom.md) | 01 | – | offen |
| 09 | [Sumpf: Dinos](09-sumpf-dinos.md) | 02, 08 | – | offen |
| 10 | [Base: Kern und Daten](10-base-kern.md) | 01, 06 | world.js (base/tower) | offen |
| 11 | [Base: Gebäudemodelle](11-base-modelle.md) | 10 | – | offen |
| 12 | [Base: Module](12-base-module.md) | 05, 10 | world.js (Modul-Effekte) | offen |
| 13 | [Base: Türme](13-base-tuerme.md) | 10 | – | offen |
| 14 | [Story (Bibel)](14-story.md) | – | – | fertig (Doku) |
| 15 | [Lesbare Nachrichten](15-nachrichten.md) | – | hud.js (Panel), world.js (onAct) | umgesetzt (claude/story-notes) |
| 16 | [Map 1: Ankunft am Strand](16-map1-ankunft.md) | 15 | world.js (Inventar, Lagerfeuer, Spawn) | umgesetzt (claude/story-arrival) |
| 17 | [Intro-/Outro-Cutscene](17-cutscene.md) | – | game.js (Start, Spielende) | umgesetzt (claude/story-cutscene) |
| 18 | [Story-Quests](18-story-quests.md) | 15 | world.js (Mission-Events) | umgesetzt (claude/story-quests) |
| 19 | [Map 1: Elias' Lager am Gipfel](19-map1-gipfel.md) | 15, 16 | world.js (craft) | umgesetzt (claude/story-peak) |
| 20 | [Map 1: Raptoren in Paaren](20-raptoren-paare.md) | – | – | umgesetzt (claude/raptor-pairs) |
| 21 | [Map 2: Laterne und Glutblut](21-laterne.md) | 15, 18 | world.js (Inventar, Butchern) | umgesetzt (claude/swamp-lantern) |
| 22 | [Reise Ashfall ↔ Hollow Mountain](22-inselreise.md) | 18 | world.js (nextLevel/loadLevel) | umgesetzt (claude/island-trip) |
| 23 | [Hollow Mountain: Kristall & Elias' Lager](23-hollow-mountain.md) | 15, 21, 22 | world.js (craft) | umgesetzt (claude/hollow-story) |
| 24 | [Map 3: Boss-Tor und T-Rex-Boss](24-boss-tor.md) | 23 | world.js (Boss) | offen |
| 25 | [Map 3: Großer Ausbruch (Finale)](25-grosser-ausbruch.md) | 17, 24 | world.js (Boss-Tod → Volcano) | offen |

```
01 ─┬─ 02 ─────────────┐
    ├─ 03 ── 04        ├─ 09
    ├─ 05 ──┬──────────┼──────── 12
    ├─ 08 ──┼──────────┘         │
06 ─┼───────┴─ 07                │
    └─ 10 ──┬─ 11                │
            ├─ 13                │
            └────────────────────┘
```

Parallel möglich ab Start: **01** und **06**. Nach 01: **02, 03, 05, 08** parallel.

Story-Strang (Inhalte in [14-story.md](14-story.md)):
```
15 ─┬─ 16 ── 19
    ├─ 18 ─┬─ 21 ──┐
    │      └─ 22 ──┴─ 23 ── 24 ──┐
17 ─┼────────────────────────────┴─ 25
20  (unabhängig)
```
Parallel möglich ab Start: **15, 17, 20**. Nach 15: **16, 18**.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Map-Reihenfolge | Map 2 = Nebelsumpf, Map 3 = Aschefeuer-Insel (Biom, Ressource, Dinos getauscht; Waffen und Level-Spannen bleiben an ihrer Position) |
| Übergangszeit | keine – der Sumpf wird Teil dieses Plans |
| Feuerwaffen | erst ab Map 4 (Pistole, Schrotflinte), Gewehr ab Map 5; bis dahin nur im Creative-Modus |
| Obsidian-Speer | Map 3 (Aschefeuer-Insel) |
| Waffen-Ressourcen | eine Waffe kostet Ressourcen ihrer Map **oder einer früheren** |
| Startausrüstung | Speer, Bogen, Falle bleiben Start; Verbesserung über `upgrade`-Rezepte |
| Blockhaus | entfällt, Stufe 2 wird die **Pfahlstation** |
| Begehbarkeit | alle Häuser und Module sind begehbar |
| Craft-Kiste | eine Kiste für das ganze Team, ersetzt die Ablage |
| Waffenbau | *Annahme:* einmal gebaut = für das ganze Team freigeschaltet (wie `upgrades`) |
| T-Rex | *Annahme:* fester Boss mit eigenem Multiplikator, nicht über die Alpha-Regel |
| Waffenschmiede | *Annahme:* nur Rabatt/Tempo, **keine** zweite Tier-Sperre |
| Maps 4–8 | nur Daten (`PLANNED_LEVELS`), kein Terrain/Generator |
| Start Map 1 | Angespült am Strand, **ohne Waffen**. Der Speer steckt neben Jonas' Skelett, Bogen und Tier-1-Rezepte liegen in Elias' Lager am Gipfel (ersetzt „Startausrüstung“ oben für Map 1) |
| Boot Map 1 | Bootsquest und Contracts erst nach Entdeckung des Wracks. Vorher gefundene Teile zählen |
| Laterne | Wird auf Map 2 gebaut und brennt nur mit Glutblut vom Alpha Sarcosuchus. Hauptlicht in Hollow Mountain |
| Hollow Mountain | **Zusatzinsel von Map 3** („3b“), mit Hin- und Rückreise. Dort gibt es Kristall-Upgrades und den Siegelkristall für das Boss-Tor |
| Map-3-Finale | Der große Vulkanausbruch kommt **erst nach dem T-Rex-Boss**. Flucht zum Boot = Spielende |
| Tabelle „Die 8 Maps“ | Map 4 dort = nach Ashfall + Hollow Mountain (3b). Die Planung der Maps 4–8 ist von der Story noch nicht erfasst |
| Zelt (07) | Bleibt Camp und Craft-Ort. Ankunft, erloschenes Feuer und Skelett liegen davor am selben Strand |

## Die 8 Maps

| # | Map | Biom | Dino-Level | Neue Ressource | Freigeschaltete Waffen / Ausrüstung | Neue Dinos |
|---|---|---|---|---|---|---|
| 1 | Smaragd-Dschungel | jungle ✔ | 1–5 | – (Fleisch, Haut, Zähne, Klauen) | Start: Speer, Bogen, Falle · Rezepte: Köder, Tier-1-Upgrades | Raptor, Ptera (+ Titan im Hain) |
| 2 | Nebelsumpf | swamp (neu) | 4–9 | Giftdrüse | **Armbrust**, Feuerpfeile | Dilophosaurus, Sarcosuchus |
| 3 | Aschefeuer-Insel | volcano ✔ | 8–13 | Obsidian | **Obsidian-Speer**, Giftpfeile, Betäubungsdart | + Stego, Brachio, T-Rex (Boss) |
| 4 | Bernsteinküste | coast | 12–17 | Bernstein | **Pistole** (+ Munition), **Schrotflinte**, Harpune | Ankylosaurus, Spinosaurus |
| 5 | Frostfjord | tundra | 16–21 | Fell / Eiszahn | **Gewehr**, Leuchtfackel | Pachycephalosaurus, Yutyrannus |
| 6 | Glutcanyon | desert | 20–25 | Metallschrott | **Dynamit**, Explosivspeer | Carnotaurus, Triceratops |
| 7 | Kristallhöhlen | crystal | 24–29 | Kristall | **Großwildbüchse**, Kristallbogen | Therizinosaurus, Quetzalcoatlus |
| 8 | Urzeitkrater (Finale) | crater | 28–35 | Urknochen | **Elefantenbüchse** / Ballista-Armbrust | Giganotosaurus (Endboss) |

## Gesamt-Verifikation (nach allen Teilplänen)
- `?island=1`: Zelt begehbar, Tafel, Mini-Werkbank, Craft-Kiste; Dinos Lv 1–5.
- `?island=2`: Sumpf, neue Dinos, Armbrust baubar, Lv 4–9.
- `?island=3&base=…`: Base mit Modulen, Pfahlstation begehbar, Lv 8–13.
- `?raid=1`: Raider mit hohem Level, Module werden beschädigt und repariert.
- Creative-Toggle: alles frei.
- 2 Clients über `server/index.js`: Late-Join sieht dieselbe Base, dieselben Dino-Level und denselben Kisten-Inhalt.
