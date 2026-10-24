# 23 – Hollow Mountain: Kristall, Upgrades, Elias' Lager

**Branch:** `<agent>/hollow-story` · **Hängt ab von:** 15, 21, 22 · **Hotspots:** world.js (craft)

## Ziel
Auf Hollow Mountain sammelt das Team **Kristall** für die Tier-3-Upgrades. Es findet Nachricht 6 und am Ende **Elias' letztes Lager** mit Nachricht 7 und dem **Siegelkristall**. Die Laterne ist das Hauptlicht.

## Schritte
1. `src/shared/notes.js`: Anker für Nachricht 6 (eine Kristallhalle im Labyrinth) und Nachricht 7 (`eliasCamp`).
2. **Elias' Lager:** ein fester Raum am Urquelle-See tief im Berg.
   - Lage im Cave-Feld beachten: eine Änderung am Cave-Feld bedeutet `node scripts/bakeCave.mjs`, sonst schlägt `test/cave-bake.test.js` fehl.
   - Die Regeln im `map-design-rules`-Skill gelten (eine Volume-Mesh, nichts anflicken).
   - Wenn möglich einen bestehenden Raum nutzen und nur Props setzen, damit kein Rebake nötig ist.
3. **Kristall:** Ressource `crystal` (aus 01) an `resourceSpots` in der Höhle, gesammelt mit `ACT.GATHER`.
4. **Tier-3-Upgrades** in `crafting.js`: `bow3`, `spear3`, Rüstung oder Ähnliches mit Kristall-Kosten, `learn: 'note6'`. Sie sind auf die Boss-Werte des T-Rex abgestimmt (24).
5. **Siegelkristall:**
   - Ein Team-Item `sealCrystal` (`world.storyItems`, nicht im Spieler-Inventar, damit ein Disconnect nichts verliert).
   - Aufheben am Lager löst `item:sealCrystal` aus (18) und macht das Rückfahrt-Boot (22) bereit.
6. **Laterne als Höhlenlicht:** Die Werte aus 21 gelten. Die Fackel-Respawns (`torchSpots`) bleiben.
7. `package-info.md` in `src/shared`, `src/sim`, `src/client/world`.

## Akzeptanz
- `test/hollow-story.test.js`:
  - Der Siegelkristall ist nach dem Aufheben Team-Item.
  - Das Rückfahrt-Boot ist vorher gesperrt, danach bereit.
  - Tier-3-Rezepte brauchen Nachricht 6 und Kristall.
- `test/cave-bake.test.js` bleibt grün.
- Im Browser: Weg zum Lager mit Laterne begehbar, FPS in der Halle gemessen.

## Nicht hier
- Tor und Boss (24).

## Umsetzung (Abweichungen)
- Elias' Lager liegt in der trockenen Sackgasse, die am weitesten vom Eingang entfernt ist. Die Schrift steht an der Wand der nächstgelegenen Kristallhalle ohne Bootsteil. Beides sind nur Props und Anker, das Cave-Feld bleibt unverändert (kein Rebake).
- Der Siegelkristall ist ein Expeditions-Flag (`story.sealCrystal`) und wird wie Bootsteile durch Hingehen aufgenommen. `EV.STORY` lässt ihn bei allen verschwinden.
- Hollow Mountain hat keine eigene Bootsquest mehr. Der Siegelkristall ist das Gate-Ziel, danach legt das Boot in der Westbucht (`arrivalBoat`) zurück nach Ashfall ab. Die drei Höhlen-Bootsteile bleiben als Fundstücke (XP).
- Tier 3: `bow3`, `spear3`, `quiver3` (Kristall + Material, gelernt aus der Wandschrift). Gebaut wird an der Base-Werkbank auf Ashfall.
- Kristall: 8 Cluster an den Kristallen der Hallen, sammeln mit E, nachwachsend.
