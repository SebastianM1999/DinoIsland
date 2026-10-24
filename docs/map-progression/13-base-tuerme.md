# 13 – Base: Türme

**Branch:** `codex/luca/base-towers` · **Hängt ab von:** 10 · **Hotspots:** keine (nur `towers.js`)

## Türme
| Turm | Ab Map | Hinweis |
|---|---|---|
| Pfeilturm | 2 | Luft + Boden |
| Ballista | 2 | |
| Feuerkorb | 3 | Flächenschaden |
| Kanone | 6 | nur Daten |
| Kristall-Blitzturm | 7 | nur Daten |

Jeder Turm hat 3 Upgrade-Stufen; Stufe 3 braucht die Werkstatt (12).

## Schritte
1. `TOWERS` in `src/shared/base.js` auf 3 Stufen und neue Typen erweitern, `towerCost` mit Map-Skalierung.
2. `src/sim/towers.js`: Feuerkorb mit Flächenschaden und kurzem Brennen.
3. Client: Feuerkorb-Modell und Effekt, Upgrade-Optik pro Stufe.
4. `src/sim/package-info.md` aktualisieren.

## Akzeptanz
- `test/raids.test.js` / Turm-Test: Feuerkorb trifft mehrere Dinos im Radius; Stufe 3 ohne Werkstatt abgelehnt.
