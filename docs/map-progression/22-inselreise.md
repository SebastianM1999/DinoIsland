# 22 – Hin- und Rückreise Ashfall ↔ Hollow Mountain

**Branch:** `<agent>/island-trip` · **Hängt ab von:** 18 · **Hotspots:** world.js (nextLevel, #loadLevel), worldSave.js

## Ziel
Hollow Mountain ist die **Zusatzinsel von Map 3**. Man fährt von der Aschefeuer-Insel hin und mit dem Siegelkristall zurück. Die Aschefeuer-Insel bleibt dabei so, wie man sie verlassen hat: Boss lebt, Boot repariert, Base, Funde.

## Ausgangslage
- `nextLevel()` geht nur `levelIndex + 1` (und wrappt).
- `#loadLevel` baut den ganzen Inselzustand neu (Items, Fallen, Relics, Base, Raids, Vulkan, Dinos).
- Hollow Mountain ist heute `last: true` (Index 3).

## Schritte
1. `src/shared/levels.js`
   - Hollow Mountain bekommt `sideOf: 2` (Index von Ashfall) und verliert `last`.
   - Ashfall wird `last: true`. Gewonnen wird nur beim Ablegen nach dem Ausbruch (25).
   - `LEVEL_COUNT`/Menüs zählen Hollow Mountain als „3b“, nicht als eigene Map.
2. `src/sim/world.js`
   - `travelTo(index)` ersetzt den festen `+1`-Schritt. Das Ziel kommt aus der Mission: Map 3 mit Boot repariert und ohne `sealCrystal` → Hollow Mountain. Hollow Mountain → zurück nach Ashfall.
   - Vor dem Wechsel exportiert `#parkIsland()` den Inselzustand von Ashfall mit denselben Funktionen wie `exportWorld` (Inselteil).
   - Bei der Rückkehr stellt `#loadLevel` ihn wieder her, statt neu zu würfeln.
   - Map 3 erhält bei der Rückkehr Mission-Phase `repaired` und den Story-Schritt „Öffne das Tor“.
3. Hollow Mountain: Das Boot in der Westbucht (`arrivalBoat`) wird zum fahrbereiten Rückfahrt-Boot, sobald der Siegelkristall aufgenommen ist (kein Reparieren nötig).
4. `src/sim/worldSave.js` / `src/shared/saveSchema.js`
   - Neues Feld `parked: { [islandIndex]: islandState }`.
   - Schema-Version erhöhen, alte Saves ohne Feld laden.
5. Client: `game.onNewIsland` funktioniert unverändert (Neustart über den Ladebildschirm). Der Ladebildschirm zeigt bei der Rückfahrt den Ashfall-Text.
6. `package-info.md` in `src/shared`, `src/sim`. Feature-Map.

## Akzeptanz
- `test/island-trip.test.js`:
  - Ashfall → Hollow → Ashfall: Boss-HP, Base, aufgehobene Relics und Bodenitems sind identisch.
  - Ein Save mitten auf Hollow Mountain mit Laden enthält den geparkten Ashfall-Zustand.
  - Map 1 → 2 → 3 verhält sich wie vorher.
- 2 Clients über `server/index.js`: Beide reisen, ein Late-Join auf Hollow Mountain landet richtig.

## Nicht hier
- Siegelkristall und Kristall-Upgrades (23), Tor (24).
