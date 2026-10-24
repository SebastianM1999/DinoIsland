# 25 – Map 3: Großer Ausbruch (Finale)

**Branch:** `<agent>/volcano-cataclysm` · **Hängt ab von:** 17, 24 · **Hotspots:** world.js (Boss-Tod → Volcano, Spielende)

## Ziel
**Erst wenn der König tot ist**, bricht der Vulkan richtig aus:
- Dauer-Eruption, mehr Lavabomben, Dauer-Asche.
- Ein Lavastrom schneidet den kurzen Weg ab.
- Ein **Countdown** läuft bis zum Boot.

Ablegen mit allen Lebenden beendet das Spiel mit dem Outro. Vorher läuft der Vulkan nur im normalen Zyklus.

## Schritte
1. `src/shared/config.js`: Werte für `volcano.cataclysm`:
   - Countdown (Vorschlag 180 s),
   - Bomben-Rate x3,
   - Ascheschaden,
   - Lavastrom-Ausbreitung.
2. `src/sim/volcano.js`
   - Neue erzwungene Phase `cataclysm` über `#setPhase`. Sie verlässt den Zyklus nicht mehr.
   - Bomben weiterhin nie auf Boot oder Safe-Zone.
   - Asche wie die `ash`-Phase, aber ohne Schutz außer unter Dach.
   - **Lavastrom:** eine vorgezeichnete Strecke (`layout.cataclysmFlow`, Polygonzug) breitet sich über den kurzen Weg aus und brennt wie `heatAt`.
   - Der Umweg über die Basaltbrücken bleibt frei. Pfadprüfung im Test.
   - Die heutige Regel „`mission.phase === 'sailing'` → calm“ gilt in `cataclysm` nicht.
3. `src/sim/world.js` / `mission.js`
   - `kill:trexBoss` startet `cataclysm` und den Countdown, mit `EV.VOLCANO` und `left`.
   - Läuft der Countdown ab, sterben alle Lebenden, und es geht vom Checkpoint **vor dem Bosskampf** weiter (Save-Checkpoint bei `gateOpen`).
   - `sail()` geht in `cataclysm` sofort (kurzes `SAIL_DELAY`). Das ist der Sieg.
4. Save: Phase und Restzeit speichern. Ein Laden mitten im Ausbruch setzt ihn fort.
5. Client
   - Starker Kamera-Shake beim Start.
   - Hint „Der Berg wacht auf! Zum Boot!“
   - Countdown im HUD.
   - Rot glühender Himmel (Sky-Override), Lavastrom-Mesh mit Wachstum.
   - Bei Sieg das Outro aus 17.
6. `package-info.md` in `src/shared`, `src/sim`, `src/client/world`.

## Akzeptanz
- `test/cataclysm.test.js`:
  - Vor dem Bosstod gibt es keinen `cataclysm`.
  - Danach läuft er und bleibt.
  - Der Lavastrom sperrt den kurzen Weg, der Umweg ist begehbar (Walk-Grid).
  - Countdown-Ablauf → Checkpoint.
  - Ablegen = `won`.
  - Save-Roundtrip mitten im Ausbruch.
- Im Browser: kompletter Lauf Tor → Boss → Flucht → Outro. FPS während des Ausbruchs gemessen (Bomben- und Partikel-Spitzen).

## Nicht hier
- Neue Inseln nach dem Ausbruch (Maps 4–8 bleiben geplant).

## Umsetzung (Abweichungen)
- Ausgelöst wird beim Tod des Königs (`mission.onDinoKilled` → `volcano.startCataclysm`). Die Phase `cataclysm`: alle 1 s eine Bombenwelle (2 je Spieler), Asche wie beim Ascheregen (Camp und Base schützen), Dinos sehen schlechter. Sie endet, sobald das Boot ablegt.
- Läuft der Countdown (180 s) ab, kehrt die Insel nicht zu einem gespeicherten Checkpoint zurück. Stattdessen wacht das Team geheilt im Camp auf, der König steht wieder voll im Krater, der Schritt „König besiegen“ ist wieder offen. Das Tor bleibt offen. Das wirkt wie ein Neustart vor dem Bosskampf, ohne Save-Snapshot.
- Kein eigener Lavastrom, der den kurzen Weg sperrt: Bombenhagel und Countdown tragen das Finale. Ein Lavastrom bräuchte dynamische Terrain-/Hitze-Änderungen und bleibt offen.
- Der Countdown steht groß oben im HUD („To the boat! 2:57“). Ablegen ist der letzte Story-Schritt (`escape`), danach läuft das Outro aus 17.
