# 24 – Map 3: Boss-Tor und T-Rex-Boss

**Branch:** `<agent>/volcano-boss-gate` · **Hängt ab von:** 23 · **Hotspots:** world.js (Boss)

Vorher prüfen: `claude/volcano-craters` und 02 (Dino-Level: Boss ist das Max-Level der Map).

## Ziel
Die Kraterarena (`volcanoArena.js`, heute „Boss kommt später“) ist mit einem **versiegelten Tor** verschlossen. Mit dem Siegelkristall öffnet es sich. Drinnen wartet **der König**, der T-Rex als fester Boss.

## Schritte
1. `src/shared/volcanoArena.js`
   - Torposition am Arena-Eingang, Sockel-Interaktionspunkt.
   - Collider des geschlossenen Tors (blockt auch Schüsse, wie die Grove-Barriere in `grove.js`).
2. `src/sim/world.js`
   - `world.gateOpen` (Expedition, überlebt die Inselreise aus 22).
   - Interaktion am Sockel mit `sealCrystal` öffnet das Tor und feuert `EV.GATE`.
   - Ohne Kristall gibt es den Hinweis „Hier fehlt ein Kristall.“
3. **T-Rex-Boss**
   - `src/sim/ai/trex.js` auf Ashfall: kein Roaming mehr. Ein T-Rex ist in der Arena geleasht (wie der Alpha Sarcosuchus in `sarcosuchus.js`, `boss: true`). Wird schon eine Arena/Leash-Hilfe geteilt, die nutzen.
   - `dinoRank.js` `BOSS_TYPES` kennt `trex` schon.
   - Boss-HP/-Schaden über 02 (Max-Level der Map).
   - Bosstod löst `kill:trexBoss` aus (18 → 25).
   - Bosse bleiben tot, wie heute im Save.
4. Client: Tor-Modell (Basalt und Kristall-Sockel), Glüh- und Öffnungsanimation, Rumpel-Audio. Boss-HP-Leiste wie beim Sarcosuchus.
5. `package-info.md` in `src/shared`, `src/sim`, `src/sim/ai`, `src/client/world`.

## Akzeptanz
- `test/boss-gate.test.js`:
  - Ohne Kristall bleibt das Tor zu, und der Boss ist nicht erreichbar (Leash).
  - Mit Kristall geht es auf.
  - `gateOpen` überlebt Inselreise und Save.
  - Bosstod feuert das Event.
- `?island=3`: Tor, Öffnen, Bosskampf.

## Nicht hier
- Was nach dem Bosstod passiert (25).
