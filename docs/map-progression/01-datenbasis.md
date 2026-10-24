# 01 – Datenbasis

**Branch:** `codex/luca/progression-data` · **Hängt ab von:** – · **Hotspots:** keine

## Ziel
Alle Daten für 8 Maps liegen in `src/shared/`, ohne dass sich das Spielverhalten schon ändert. Die anderen Teilpläne lesen nur noch aus diesen Tabellen.

## Schritte
1. `src/shared/levels.js`
   - Jeder Eintrag in `LEVELS` bekommt `dinoLevels: [min, max]`, `resource` und `unlocks` (Rezept-IDs, nur für die UI).
   - Neue Konstante `PLANNED_LEVELS` mit den Maps 4–8 (`planned: true`, Biom-ID, Level-Spanne, Ressource, `unlocks`). `LEVEL_COUNT` zählt weiter nur `LEVELS`.
   - Platz 2 bleibt vorerst Ashfall Isle; die Umstellung auf den Sumpf macht Teilplan 08. Die Spannen werden aber schon nach Position gesetzt (Platz 2 = 4–9).
   - `levelDef()` liefert `dinoLevels` und `resource`. `difficulty` bleibt noch, bis Teilplan 02 es ersetzt.
2. `src/shared/config.js` `loot`: neue Ressourcen `venom`, `obsidian`, `amber`, `fur`, `scrap`, `crystal`, `primalBone` (Name, Icon, Gewicht). Noch kein Drop.
3. `src/shared/missions.js`: jeder Contract bekommt `island` (1-basiert). „Armored Giant“ und „King of the Island“ → `island: 3`, die übrigen → `island: 1`. Die Anzeige filtert noch nicht (macht Teilplan 07).
4. `src/client/ui/icons.js`: Platzhalter-Icons für die neuen Ressourcen.
5. `src/shared/package-info.md` aktualisieren.

## Akzeptanz
- `npm test` grün, `test/levels.test.js` erweitert: jede Map hat eine gültige Spanne, Spannen steigen, `PLANNED_LEVELS` hat 5 Einträge.
- Im Spiel keine sichtbare Änderung außer ggf. neuen Ressourcen im Creative-Inventar.

## Nicht hier
- Kein Level-Würfeln (02), keine Rezepte (03), kein Sumpf-Biom (08).


Was wollen wir:
Map 1 alles level 1
Ab Map 2 werden dinos in Level eingeteilt und es gibt immer wieder einen alpha aber maximal pro map 1 alpha.
Dann gibt es Bosse. Die sind schon beschrieben.
Gibt pro map 5 Level an monster Boss ist immer max level von der Map
Map 1 level 1
Map 2 2-3 Alpha ist 4 und Boss 5
Map 3 5-8 9 alpha Boss 10
usw.

Alpha bekommen nochmal besseres aussehen zb. Irgendein art Rüstung
