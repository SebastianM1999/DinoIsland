# 21 – Map 2: Laterne und Glutblut

**Branch:** `<agent>/swamp-lantern` · **Hängt ab von:** 15, 18 · **Hotspots:** world.js (Inventar, Butchern)

Vorher prüfen: die Branches `claude/swamp-vibe` und `claude/swamp-volcano-resources` (Sumpf-Atmosphäre, Ressourcen).

## Ziel
Im Nebelsumpf baut das Team eine **Laterne**. Sie brennt nur mit **Glutblut** vom Alpha Sarcosuchus. Mit brennender Laterne kann man das **Schwarzmoor** durchqueren, in dem das letzte Bootsteil und Nachricht 4 liegen. Die Laterne bleibt für Hollow Mountain.

## Schritte
1. `src/shared/config.js`
   - Loot `bossBlood` („Glutblut“). Der Alpha Sarcosuchus gibt beim Butchern z. B. 4 Stück (`butcher.loot`), für jeden Spieler im Team erreichbar (in die Kiste oder pro Spieler, nach 05).
   - Lantern-Werte: Brennzeit pro Glutblut (Vorschlag 6 min), Lichtradius und Farbe (warmes Orange-Grün).
2. `src/shared/crafting.js`: Rezept `lantern` (`kind: 'gear'`, `learn: 'note3'`). Kosten z. B. ironwood 2, resin 2, hide 1 plus eine Sumpf-Ressource.
3. `src/shared/torch.js`
   - `carriesLight` gilt auch für eine brennende Laterne (eigenes Flag `PF.LANTERN` in `protocol.js`).
   - `LANTERN`-Lichtwerte neben `TORCH`.
   - Anders als die Fackel geht die Laterne im Wasser und im Schwarzmoor **nicht** aus.
4. `src/sim/world.js`
   - `inv.lantern = { fuel }`. Neue Aktion zum Auffüllen (Glutblut verbrauchen).
   - Die Brennzeit sinkt nur, solange die Laterne ausgerüstet ist.
   - Das Item hält über Inseln (`resupplyForIsland` lässt es stehen).
5. **Schwarzmoor-Zone**
   - `src/shared/island.js` oder `swampArena`-Nachbarschaft: eine Bog-Fläche als `layout.blackmire` (Polygon).
   - Das letzte Relic der Insel und Nachricht 4 liegen darin.
   - Sim: In der Zone erlischt eine Fackel. Die Dino-Sicht ist kürzer (wie die Asche, `sightMul`).
   - Client: Der Nebel zieht auf wenige Meter zu. Eine brennende Laterne öffnet einen Lichtkreis von etwa 15 m (Fog-Uniform pro Frame aus der Spielerposition, `caveFx`-ähnlich).
6. Story-Events für 18: `item:lantern`, `item:bossBlood`, `near:blackmire`.
7. Client: Laternen-Viewmodel (linke Hand wie die Fackel, `leftHandBusy` beachten), Füllstand im HUD neben der Hotbar.
8. `package-info.md` in `src/shared`, `src/sim`, `src/client/player`, `src/client/world`.

## Akzeptanz
- `test/lantern.test.js`:
  - Craften braucht Nachricht 3.
  - Füllen verbraucht Glutblut.
  - Die Brennzeit läuft nur ausgerüstet ab.
  - Im Schwarzmoor geht eine Fackel aus, die Laterne nicht.
  - Der Sarcosuchus droppt Glutblut.
  - Save-Roundtrip mit Füllstand.
- Im Browser: Schwarzmoor ohne Laterne fast blind, mit Laterne begehbar. FPS-Messung im Moor nach dem `test-coverage`-Skill.

## Nicht hier
- Die Laterne als Höhlenlicht (23).

## Umsetzung (Abweichungen)
- Die Laterne ist kein eigenes Werkzeug, sondern das Licht in der linken Hand (Fackel-Rig, Taste L) mit einem Eisenkäfig um die Flamme. Hat sie Glutblut, ersetzt sie die Fackel; leer und mit Glutblut im Rucksack füllt L sie zuerst (`ACT.FUEL`) und zündet sie dann an.
- Das Rezept ist ein Supply (`lantern`, Kosten: 2 Haut, 1 Klaue, 1 Harz, gelernt aus der Floß-Notiz). Jeder baut seine eigene. Der Sumpf hat noch keine Sammel-Ressourcen, daher Material aus Map 1 und der Jagd.
- Glutblut: 3 Fläschchen pro Alpha Sarcosuchus (Butchern). Eins brennt 6 Minuten, voll sind es 12.
- Schwarzmoor: Die Map-Regeln verbieten Bootsteile im Schlamm. Das Ei (sonst das letzte Teil) liegt deshalb auf einer trockenen Kuppe am größten fernen Moor, und das Schwarzmoor (24 m) ist um diese Kuppe gelegt. Das Teil hat einen eigenen Hinweis („deep in the Blackmire“).
- Im Schwarzmoor erstickt eine Fackel (Server und Client). Die Sicht zieht sich auf wenige Meter zu; mit Laterne auf etwa 15 m. Die Dino-Sicht bleibt unverändert.
- Creative-Modus trägt eine volle Laterne (zum Testen).
