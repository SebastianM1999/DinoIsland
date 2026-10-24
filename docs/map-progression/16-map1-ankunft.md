# 16 – Map 1: Ankunft am Strand

**Branch:** `<agent>/story-arrival` · **Hängt ab von:** 15 · **Hotspots:** world.js (Inventar, Lagerfeuer, Spawn)

Vorher prüfen: Die laufenden Branches `claude/map1-feedback` und `claude/bow-find` (Lagerfeuer-Ring, Jägerlager) und 07 (Zelt) fassen dieselbe Ecke an.

## Ziel
Neue Spieler auf Map 1 werden am Strand angespült.
- Vor ihnen liegt ein **erloschenes Lagerfeuer**, das man anzündet.
- Daneben lehnt **Jonas' Skelett** mit der Flaschenpost (Nachricht 1).
- Neben der Leiche steckt ein **Speer** im Sand.
- Man startet ohne Waffen.

## Schritte
1. `src/shared/layout.js`
   - Neuer Anker `arrival` auf Island 0: ein Strandpunkt zwischen Wasserlinie und Camp, in Sichtweite des Zelts.
   - `spawnPoints` auf Island 0 liegen dort, Blick Richtung Feuer und Skelett.
   - `arrival.fire`, `arrival.skeleton`, `arrival.spear` als Positionen.
   - Die Note-Anker `skeleton` (15) zeigen auf `arrival.skeleton`.
2. `src/sim/world.js`
   - **Inventar:** `freshInventory()` gibt auf Island 0 keinen Speer und keine Fallen (`layout.bareStart`). `resupplyForIsland` bleibt für Map 2+ wie heute.
   - **Speer-Pickup:** Beim Laden von Island 0 einen Welt-Speer an `arrival.spear` über `spawnItem` legen, einmalig pro Insel (nicht respawnend).
   - **Lagerfeuer:** `world.fireLit` (Insel-Zustand). Neue Interaktion `ACT.LIGHT` am Feuer (wie die Wandfackeln) zündet es an.
     - Erst dann gelten Heilung (`hutHealRadius`) und Respawn an diesem Feuer.
     - Vorher wird an den Spawn-Punkten respawnt, ohne Heilung.
3. Save: `fireLit` in `worldSave.js`. Speer schon aufgehoben = Bodenitem weg (wird schon gespeichert).
4. Client
   - `src/client/world/hut/fx.js`: Feuer aus (Asche, Rauchfaden) bzw. an.
   - `src/client/models/props/skeleton.js` (neu): Code-Modell (Rippen, Schädel, Flasche).
   - Speer-Prop steckt schräg im Sand (Pickup-Darstellung mit Rotation).
   - Hint-Texte nach [14-story.md](14-story.md).
5. `package-info.md` in `src/shared`, `src/sim`, `src/client/world`, `src/client/models`.

## Akzeptanz
- `test/arrival.test.js`:
  - Auf Island 0 hat das Start-Inventar keinen Speer.
  - Das Speer-Item liegt an `arrival.spear`, Aufheben gibt den Speer.
  - Ohne `fireLit` heilt das Feuer nicht, danach schon.
  - Map 2 Start-Inventar unverändert.
- `?island=1`: Spawn am Strand, Feuer anzünden, Skelett lesen, Speer aufheben.

## Nicht hier
- Cutscene (17), Quest-Text „Erkunde die Insel“ (18), Bogen (19).

## Umsetzung (Abweichungen)
- Das erloschene Feuer ist das Lagerfeuer des Zelt-Camps. Der Spawn liegt rund 20 m davor am Strand, noch im sicheren Ring des Camps; der Weg dorthin bleibt frei von Büschen.
- Anzünden läuft über `ACT.BASE` op `kindle` und setzt `base.fireLit`. Das Base-Event verteilt den Zustand, der Save hält ihn. Vor dem Anzünden ist das Camp sicher, heilt aber nicht.
- Der Speer ist wie der Bogen ein Pickup pro Spieler: Jeder ohne Speer nimmt beim Hingehen einen (`EV.SPEAR_FOUND`). Die Gratis-Nachfüllung gibt nur dem einen Speer, der schon einen hatte (`inv.spearFound`).
- Skelett, Treibholz und Speer im Sand liegen in `src/client/world/arrival.js`.
