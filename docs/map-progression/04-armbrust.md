# 04 – Armbrust

**Branch:** `codex/luca/crossbow` · **Hängt ab von:** 03 · **Hotspots:** `game.js` und `hud.js` (Hotbar)

## Ziel
Die Armbrust ist die einzige neue spielbare Waffe bis Map 4 und trägt mit Speer und Bogen das frühe Spiel. Freischaltung auf Map 2.

## Regeln
- Bogen-Physik, aber fester Zug (kein Aufladen), mehr Schaden, längere Nachladezeit.
- Nutzt die normalen Pfeile; Feuerpfeile sind ein späteres Supply-Rezept auf Map 2.
- Rezept `tier: 2`, Kosten u. a. Giftdrüse (`venom`).

## Schritte
1. `src/shared/config.js`: `CONFIG.weapons.crossbow` (Schaden, Pfeilgeschwindigkeit, Nachladezeit).
2. `src/shared/protocol.js`: `crossbow` in `EQUIP`.
3. Server: Schuss über die bestehende Bogen-/Projektil-Logik mit Armbrust-Werten.
4. `src/client/player/`: Aktion, Client-Prediction, Viewmodel.
5. `src/client/models/`: Armbrust-Modell (code-built).
6. `src/client/audio/`: Spann- und Schuss-Sound.
7. Hotbar in `game.js` / `hud.js`.
8. Feuerpfeile als Supply-Rezept (`tier: 2`, brennen kurz).
9. `package-info.md` der berührten Verzeichnisse aktualisieren.

## Akzeptanz
- `test/weapons.test.js` erweitert: Armbrust-Schaden und -Nachladezeit, nur ausrüstbar wenn gebaut.
- Im Spiel: Armbrust auf Map 2 baubar, schießt, Viewmodel und Sound passen.

## Nicht hier
- Balance gegen Sumpf-Dinos (Feinschliff nach 09).
