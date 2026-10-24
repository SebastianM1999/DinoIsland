# 15 – Lesbare Nachrichten

**Branch:** `<agent>/story-notes` · **Hängt ab von:** – · **Hotspots:** hud.js (Panel), world.js (onAct)

## Ziel
Briefe, Notizen und Tagebücher liegen als Props in der Welt. Mit E öffnet sich ein Brief-Panel. Das Team sammelt gelesene Nachrichten in einem Tagebuch. Eine Nachricht kann beim ersten Lesen etwas freischalten (Rezepte, Quest-Schritt). Die Texte stehen in [14-story.md](14-story.md).

## Schritte
1. `src/shared/notes.js` (neu)
   - `NOTES`: `{ id, island, author, title, text, prop: 'bottle'|'paper'|'wall'|'book', unlocks?: { recipes?: [...], story?: '<step>' } }`.
   - Platzierung über eine Site oder einen Layout-Anker (`at: 'skeleton'|'peakCamp'|'raft'|…`), aufgelöst in `layout.js` (Abschnitt neu: `notes`) zu `layout.notes = [{ id, x, z, y, rot }]`.
2. `src/shared/protocol.js`
   - `ACT.READ` (Note-ID), `EV.NOTE` (wer hat was zuerst gelesen, Freischaltungen).
3. `src/sim/notes.js` (neu, klein)
   - Hält `world.notesRead` (Set, Team).
   - `read(p, id)` prüft Reichweite (wie andere Interaktionen), wendet beim ersten Lesen `unlocks` an und feuert `EV.NOTE`.
   - Einbinden in `world.js` `onAct`, nur die Weiterleitung.
4. Save: `worldSave.js` exportiert und importiert `notesRead`. Test für den Roundtrip.
5. Client
   - `src/client/world/notes.js`: Props (Flasche, Papierrolle, Wandschrift, Buch). Ein ungelesenes Prop hat einen leichten Glanz.
   - `src/client/ui/notePanel.js`: Brief-Panel im Papier-Look (`dialogOrnaments.js`). Schließen mit E oder Esc, Pointer-Lock zurück. Integration in `hud.js` ist eine Zeile.
   - Interaktions-Hint „[E] Lesen“.
   - Pause-Menü (`menus.js`): Reiter **Tagebuch** mit allen gelesenen Nachrichten, sortiert nach Insel.
6. `package-info.md` in `src/shared`, `src/sim`, `src/client/ui`, `src/client/world` und die Feature-Map in `src/package-info.md`.

## Akzeptanz
- `test/notes.test.js`:
  - Jede `NOTES`-ID ist eindeutig, jede Nachricht hat eine gültige Insel und einen Anker.
  - Lesen aus der Ferne wird abgelehnt.
  - `unlocks` greifen genau einmal.
  - Der Save-Roundtrip funktioniert.
- 2 Clients: Liest A eine Nachricht, sieht B sie im Tagebuch. Late-Join sieht dasselbe.

## Nicht hier
- Die Freischaltungslogik für Rezepte (19) und Quest-Schritte (18). Hier nur der Hook.
