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

## Umsetzung (Abweichungen)
- Das Tor ist kein Collider. Der Krater als Ganzes ist gesperrt (Server `gateBlocks`, Client-Barriere wie am Hain), solange der Kristall fehlt. Das Tor-Modell (Säulen, Gitter, leerer Sockel) steht auf dem Pfad an der Kerbe; offen verschwindet das Gitter und der Kristall leuchtet im Sockel.
- Der König ist der einzige T-Rex auf Ashfall: Boss mit 3-facher T-Rex-Gesundheit, an die Arena geleint, nur von innen verwundbar, mit eigener Patrouille im Krater. Der frühere herumstreifende T-Rex entfällt.
- Story-Schritte auf Ashfall: Station → Tor finden → Kristall einsetzen → König besiegen.
- Elias' Station steht auf kühlem, flachem Boden neben dem Bergpfad (Unterstand aus Treibholz, Tisch, Messstäbe).
