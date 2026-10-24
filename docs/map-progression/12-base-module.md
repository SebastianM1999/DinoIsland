# 12 – Base: Module

**Branch:** `codex/luca/base-modules` · **Hängt ab von:** 05, 10 · **Hotspots:** `world.js` (Effekte in Heilung, Revive, Crafting, Raids)

Kann pro Modul ein eigener kleiner PR sein.

## Module
| Modul | Ab Map | Funktion |
|---|---|---|
| Waffenschmiede | 2 | Waffen schneller bzw. günstiger bauen (keine Tier-Sperre) |
| Vorratslager | 2 | mehr Kapazität der Craft-Kiste, schützt einen Teil bei Raids |
| Kleiderkammer | 2 | zweite Wardrobe |
| Lazarett | 3 | Revive-Zeit ↓, Heilung außerhalb des Feuers |
| Räucherhütte | 3 | Fleisch → Buff-Essen (Ausdauer / Schaden) |
| Munitionsbank | 4 | Munition günstiger |
| Jäger-Hochsitz | 4 | markiert Alphas auf der Karte |
| Trophäenhalle | 5 | kleine Boni pro erlegter Alpha-Art |
| Werkstatt | 6 | Turm-Upgrades Stufe 3, Reparatur günstiger |

Module ab Map 4 sind vorerst nur Daten.

## Schritte
1. `MODULES` in `src/shared/base.js`: Kosten, `unlock`, Effekt-Werte, Stufen.
2. Effekte pro Modul an der passenden Stelle (Kisten-Kapazität in 05er-Logik, Revive, Heilung, Crafting-Rabatt, Raid-Schutz).
3. Räucherhütte: neue Buff-Items und Buff-Anzeige im HUD.
4. Jäger-Hochsitz: Alpha-Marker in `minimap.js`.
5. Trophäenhalle: Zähler erlegter Alpha-Arten im Team-State.

## Akzeptanz
- Ein Test pro Modul-Effekt in `test/base.test.js` bzw. eigenem Test.
- Module nur ab ihrer Map baubar; Creative alles frei.
