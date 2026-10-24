# 18 – Story-Quests

**Branch:** `<agent>/story-quests` · **Hängt ab von:** 15 · **Hotspots:** world.js (Mission-Events)

## Ziel
Jede Insel hat eine Folge von Story-Schritten vor und um die Bootsquest:
- „Erkunde die Insel“, „Finde das Wrack“ (Map 1),
- „Ein Licht im Nebel“ (Map 2),
- „Das versiegelte Tor“, „Im hohlen Berg“, „Besiege den König“ (Map 3).

Auf Map 1 werden die Bootsquest und die Contracts erst mit der **Entdeckung des Boots** sichtbar.

## Schritte
1. `src/shared/story.js` (neu)
   - `STORY[islandIndex] = [{ id, text, done: { note?|event?|near? } }]`, mit den Texten aus [14-story.md](14-story.md).
   - `boatGate: true` für Map 1: Die Bootsquest beginnt erst nach dem Schritt `boatFound`.
2. `src/sim/mission.js`
   - Neue Phase `explore` vor `search`, nur wenn die Insel ein `boatGate` hat.
   - `onEvent` versteht `note:<id>`, `near:<anchor>`, `kill:<boss>`, `item:<id>`. Das Ende eines Story-Schritts aktiviert den nächsten.
   - `boatFound`: Ein Spieler ist im Umkreis (z. B. 25 m) des Wracks. Die Prüfung läuft in `step` mit niedriger Rate.
   - `state()` zeigt erst die Story-Schritte, danach die Relic-Ziele.
   - Vorher gefundene Relics zählen sofort mit. Die Relic-Pickups funktionieren in jeder Phase (wie heute).
3. `src/shared/missions.js`: `unlockedBy: 'boatFound'` für alle Contracts auf Island 0. Board und Zusammenfassung blenden gesperrte Contracts aus.
4. Save: Story-Schritt und `boatFound` gehören zum Inselzustand in `worldSave.js`.
5. Client: `missionSummary.js` / Mission Board zeigen den aktiven Story-Schritt. Beim Wechsel gibt es einen kurzen „Neues Ziel“-Toast (ein bestehender HUD-Toast).
6. `package-info.md` in `src/shared`, `src/sim`, `src/client/ui`. Feature-Map.

## Akzeptanz
- `test/story.test.js`:
  - Die Schrittfolge auf Map 1 stimmt (Brief → Gipfel → Boot).
  - Contracts sind vor `boatFound` gesperrt.
  - Zwei vorher gefundene Relics zeigen danach 2/3.
  - Inseln ohne `boatGate` starten direkt in `search`.
  - Save-Roundtrip in jeder Phase.

## Nicht hier
- Die Inhalte, die einzelne Schritte brauchen (Laterne 21, Tor 24, Ausbruch 25). Diese Teilpläne liefern nur ihre Events.

## Umsetzung (Abweichungen)
- Story-Schritte werden in beliebiger Reihenfolge abgehakt, das Log zeigt sie in ihrer Reihenfolge. So blockiert ein noch nicht baubarer Schritt (z. B. der Gipfel vor 19) nichts.
- Die Schritte gehören der Expedition (`world.story.steps`, Save). `STORY` enthält vorerst nur Map 1; die Teilpläne 21–25 tragen ihre Schritte selbst ein.
- Vor dem Wrack zählen Contracts nicht mit und werden im HUD, auf dem Board und im Pause-Menü als „kommen mit dem Boot“ ausgeblendet.
- Wer am Wrack „Reparieren“ drückt, hat es auch gefunden: Die Bootsquest öffnet sich, sie kann also nie hängen bleiben.
