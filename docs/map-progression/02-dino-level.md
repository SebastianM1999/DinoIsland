# 02 – Dino-Level

**Branch:** `codex/luca/dino-levels` · **Hängt ab von:** 01 · **Hotspots:** keine (nur `dinos.js`, `raids.js`)

## Ziel
Jeder Dino hat ein Level aus der Spanne seiner Map, Alphas sind seltene stärkere Tiere, der T-Rex ist ein fester Boss. `difficulty` verschwindet.

## Regeln
- Level-Wurf in `dinoLevels: [min, max]`; je weiter der Spawn vom Landeplatz bzw. der Hütte entfernt ist, desto mehr wird zum oberen Ende verschoben.
- **Alpha:** 5 % Chance, Level `max + 3`, Skalierung 1,15, doppelter Loot.
- **T-Rex:** immer Level `max`, zusätzlicher `bossHpMul` aus der Config, nie Alpha.
- **Skalierung:** HP × (1 + 0,12·(L−1)), Schaden × (1 + 0,07·(L−1)), XP × (1 + 0,10·(L−1)), Loot +1 Teil pro 5 Level.
- **Raids:** Raider würfeln nur im oberen Drittel der Spanne.

## Schritte
1. Neue Datei `src/shared/dinoLevels.js`: `rollDinoLevel(def, rng, inland)`, `dinoLevelStats(level, { alpha, boss })`. Pure Funktionen, von Server und Client genutzt.
2. `src/sim/dinos.js`: `spawn()` setzt `level`, `alpha`; die globalen `hpMul`/`dmgMul` im Konstruktor werden pro Dino berechnet (HP beim Spawn, Schaden in `hitPlayer`, XP und Loot beim Tod).
3. `src/sim/raids.js`: `difficulty`-Schaden durch das Raider-Level ersetzen.
4. `src/shared/grove.js`: `healthMul` gilt künftig auf die Level-HP statt auf `difficulty`.
5. `src/shared/levels.js`: `difficulty` aus `levelDef()` entfernen.
6. `src/shared/protocol.js`: `level` und `alpha` ins Spawn-Event und in `fullState` – **nicht** in `DINO_FIELDS`.
7. Client `src/client/entities/dinoViews.js`: Namensschild „Raptor Lv 7“ (neues Element, gerendert als Sprite oder DOM-Overlay), Farbe nach Abstand zum Level des lokalen Spielers (grau / weiß / gelb / rot), Alpha mit rotem Rahmen und Skalierung 1,15.
8. `package-info.md` in `src/shared`, `src/sim`, `src/client/entities` aktualisieren.

## Akzeptanz
- Neuer Test `test/dinoLevels.test.js`: Formel, Wurf bleibt in der Spanne, Alpha `max + 3`, T-Rex nie Alpha.
- `test/raids.test.js` und `test/grove.test.js` grün ohne `difficulty`.
- `?island=1`: Dinos zeigen Lv 1–5. Late-Join im Multiplayer sieht dieselben Level.

## Nicht hier
- Neue Dino-Arten (09). Hochsitz-Markierung von Alphas (12).
