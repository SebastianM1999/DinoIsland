# 06 – Begehbare Gebäude (Technik)

**Branch:** `codex/luca/walkable-buildings` · **Hängt ab von:** – · **Hotspots:** keine

## Ziel
Die technische Grundlage dafür, dass alle Häuser und Module begehbar sind. Danach kann jedes Gebäude als Daten (Wände, Böden, Rampen, Decken) beschrieben werden.

## Ausgangslage
- Heute ist jedes Gebäude ein massiver Box-Collider.
- `collision.js` kennt schon `stand` (Fläche, auf der man stehen kann) und `bottom` (Decke).
- Spieler und Dinos teilen sich dieselbe Box-Liste (`playerColliders.boxes === colliders.boxes` in `layout.js`).

## Schritte
1. Neues Modul `src/shared/buildingShape.js`: ein Gebäude als Liste lokaler Teile (`wall` mit Türlücke, `floor` mit `stand`, `ramp`/`steps`, `ceiling` mit `bottom`, `doorBlock`) und eine Funktion, die daraus Collider im Plot-Frame macht (`siteFrame.js`).
2. Collider-Art `doorBlock`: blockiert nur Dinos. `layout.js` trennt dafür die Box-Listen von Spielern und Dinos (oder filtert nach `kind`, wie bei Felsen).
3. Rampen: Steigung, die `controller.js` und die Server-Bewegung als begehbar akzeptieren (vorhandene `climb`-Grenze prüfen).
4. `src/sim/pathfind.js`: Gebäude-Grundfläche ist für Dinos blockiert.
5. Testgebäude als Fixture (ein Raum, eine Tür, eine Rampe).
6. `src/shared/package-info.md` aktualisieren.

## Akzeptanz
- Neuer Test `test/walkable.test.js`: Spieler läuft durch die Tür, steht auf dem Boden, kommt die Rampe hoch, stößt an die Decke; ein Dino wird an der Tür geblockt.
- `test/movement.test.js`, `test/traversal.test.js`, `test/spring-collision.test.js` grün.

## Nicht hier
- Konkrete Gebäude: Zelt (07), Pfahlstation und weitere (11).
