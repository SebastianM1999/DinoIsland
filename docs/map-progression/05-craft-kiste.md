# 05 – Craft-Kiste

**Branch:** `codex/luca/craft-stash` · **Hängt ab von:** 01 · **Hotspots:** `world.js` (`store`, Abgabe an der Ablage, `pay()`)

## Ziel
Eine Kiste für das ganze Team ersetzt die Ablage. Man kann alles ablegen und wieder herausnehmen; Crafting bezahlt direkt daraus.

## Regeln
- Inhalt: Loot, Pfeile, Fallen, Speere, Früchte, Köder, später Munition.
- Die Kiste ist der erweiterte `world.store`; `pay()` und `canAfford()` bleiben.
- Basis-Kapazität begrenzt; das Modul Vorratslager (12) erhöht sie.
- Alle Standorte (Zelt Map 1, Landecamp, Haupthaus) greifen auf denselben Inhalt zu.
- `deliver:<k>`-Contracts zählen beim Ablegen.

## Schritte
1. `src/shared/`: Kisten-Item-Arten und Kapazität in der Config; Hilfsfunktionen für Ablegen/Herausnehmen (pure, testbar).
2. `src/shared/protocol.js`: `ACT.STASH` (`dir: 'in'|'out'`, `kind`, `n`).
3. `src/sim/world.js`: Handler mit Prüfung von Reichweite (an einer Kiste), Kapazität und Rucksack-Limits (`caps()`); Abgabe-Logik auf die Kiste umstellen; `EV.STORE` sendet den vollen Inhalt.
4. `src/shared/base.js` / `layout.js`: `dropOff` heißt künftig `stash`.
5. Client: neues `src/client/ui/stashPanel.js` mit zwei Spalten „Rucksack“ / „Kiste“, Klick und Shift-Klick; Kisten-Modell in `client/world` ersetzt die Loot-Kisten.
6. `package-info.md` der berührten Verzeichnisse aktualisieren.

## Akzeptanz
- Neuer Test `test/stash.test.js`: ablegen, herausnehmen, Kapazität, zu weit weg abgelehnt, Crafting bezahlt aus der Kiste.
- Multiplayer: Late-Join sieht denselben Inhalt.

## Nicht hier
- Kistenplatz im neuen Zelt (07). Vorratslager-Kapazität und Raid-Schutz (12).
