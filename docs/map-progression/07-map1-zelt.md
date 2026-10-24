# 07 – Map 1: Zelt statt Jagdhütte

**Branch:** `codex/luca/map1-tent` · **Hängt ab von:** 05, 06 · **Hotspots:** keine

## Ziel
Auf Map 1 steht statt der Jagdhütte ein begehbares Expeditionszelt. Dasselbe Zelt ist später Base-Stufe 1.

## Inhalt des Zelts
- Aufgabentafel (Mission Board)
- Mini-Werkbank: nur Supplies und Tier-1-Rezepte
- Craft-Kiste (05)
- kleines Lagerfeuer: leichte Heilung, kleinere Safe-Zone
- Kleiderkiste (Wardrobe) im Zelt

## Schritte
1. `src/shared/layout.js` (Abschnitt `hut`): Stationen auf ein kompaktes Zelt-Layout; Hütten-Collider durch die begehbaren Zelt-Collider aus `buildingShape.js` (06) ersetzen.
2. Zelt-Geometrie als Daten in `src/shared/` (wird von Base-Stufe 1 in 10 wiederverwendet).
3. `src/client/world/hut.js` + `hut/*`: Cabin-Build und Hütten-Props entfernen, Zelt-Modell rein. `hut/cabin.js` entfällt. Der `landing`-Modus für Map 2+ bleibt.
4. `campStations()` in `src/shared/base.js`: Map 1 liefert `workbench` mit `miniBench: true`; `craft()` lehnt dort `tier > 1` ab.
5. `src/shared/missions.js`: Tutorial-Contracts für Map 1 (Bogen verbessern, 3 Raptoren erlegen, Falle stellen, Bootsteil finden über den `'island'`-Event). Mission Board zeigt nur Contracts mit passendem `island`.
6. `package-info.md` in `src/shared`, `src/client/world` aktualisieren.

## Akzeptanz
- `test/map-rules.test.js` / `test/base.test.js`: Mini-Werkbank lehnt Tier 2 ab; Board zeigt nur Map-1-Contracts.
- `?island=1`: Zelt begehbar, alle Stationen erreichbar, Heilung am Feuer, Hain und Boss-Arena unverändert.

## Nicht hier
- Base-Stufe 1 auf Map 2+ (10/11).
