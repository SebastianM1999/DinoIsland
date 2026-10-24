# 10 – Base: Kern und Daten

**Branch:** `codex/luca/base-core` · **Hängt ab von:** 01, 06 · **Hotspots:** `world.js` (`baseAction`, `towerAction`, `repairBase`, `publicBase`)

## Ziel
Das neue Base-System als Daten und Server-Logik: Haupthaus mit 4 Stufen, Modul-Plätze, Turm-Plätze, begehbare Collider. Die Modelle macht 11, die Modul-Effekte 12, die Türme 13.

## Haupthaus
| Stufe | Name | Effekt | Modul-Plätze | Turm-Plätze | Mauer |
|---|---|---|---|---|---|
| 1 | Lager (Zelt + Feuer) | Heilung, Respawn, Craft-Kiste, Werkbank | 2 | 0 | – |
| 2 | Pfahlstation | größere Safe-Zone, Kartentisch = Aufgabentafel, Wardrobe | 4 | 2 | Holzzaun |
| 3 | Steinhaus | schnellere Heilung, Base-HP ↑ | 6 | 4 | Palisade |
| 4 | Festung (ab Map 5) | Wachturm, Tor, Wehrgang | 8 | 6 | Steinmauer + Tor |

## Schritte
1. `src/shared/base.js` neu strukturieren:
   - `CORE_STAGES` (4) ersetzt `BASE_STAGES`.
   - `MODULES` (Daten aus 12), `MODULE_SLOTS`, `TOWER_SLOTS` (6), `BASE_LOCAL` im Plot-Frame.
   - `moduleCost` / `stageCost` mit Map-Skalierung; Stufe 1 und 2 auf neuen Maps 30 % billiger.
   - `baseColliders()` aus `buildingShape.js` (06): Haupthaus, Module, Mauer, Tor.
   - `campStations()` liest Funktionen aus Kern und Modulen.
   - `freshBase()` → `{ plot, core, building, hp, maxHp, damaged, modules: [{slot, kind, level, damaged}], towers }`.
2. `BASE_PLOT_RADIUS` vergrößern; Abflachung in `src/shared/island.js` anpassen.
3. `src/shared/protocol.js`: `ACT.MODULE` (bauen, verbessern, reparieren).
4. `src/sim/world.js`: `moduleAction()`; `baseAction()` auf `core`; Raids können einzelne Module beschädigen.
5. Persistenz: freigeschaltete Baupläne und Turm-Typen im Team-State über Inselwechsel.
6. `src/client/ui/basePanel.js`: Slot-Auswahl, Modul-Liste mit „Ab Map n“.
7. Übergang: Client zeigt bis 11 vorhandene Modelle bzw. Platzhalter-Boxen.
8. `package-info.md` in `src/shared`, `src/sim`, `src/client/ui` aktualisieren.

## Akzeptanz
- `test/base.test.js` erweitert: Kern bauen, Module auf Slots, belegter Slot abgelehnt, Collider begehbar, `campStations` aus Modulen, Rabatt auf neuen Maps.
- `test/raids.test.js`: Module werden beschädigt, nicht zerstört.
- Late-Join sieht dieselbe Base.
