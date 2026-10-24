# 19 – Map 1: Elias' Lager am Gipfel

**Branch:** `<agent>/story-peak` · **Hängt ab von:** 15, 16 · **Hotspots:** world.js (craft, Bogen-Pickup)

Vorher prüfen: Branch `claude/bow-find` (Jägerlager-Props) muss gemergt sein. Dessen Lager wird hier verlegt, nicht neu gebaut.

## Ziel
Das Jägerlager mit dem Bogen liegt jetzt **oben am Gipfel** als Elias' Lager. Dort liegt Nachricht 2. Sie schaltet die **Tier-1-Rezepte** für das Team frei. Vorher kann man an der Werkbank nichts bauen.

## Schritte
1. `src/shared/layout.js`
   - `bowCamp` wird an die `peak`-Site gelegt (flacher Platz neben dem Gipfel, nicht auf dem Relic-Punkt).
   - Note-Anker `peakCamp` für Nachricht 2.
2. `src/shared/crafting.js`
   - Jedes Rezept bekommt `learn: '<noteId>'` (Tier 1 → Nachricht 2, Laterne → Nachricht 3).
   - Neue Funktion `recipeKnown(recipe, known)`.
3. `src/sim/world.js`
   - `world.recipesKnown` (Team, Set). `craft()` lehnt unbekannte Rezepte ab, mit Grund „Noch nicht gelernt“.
   - Die `unlocks.recipes` aus 15 füllen das Set.
   - Creative-Modus: alles bekannt.
4. Save: `recipesKnown` in `worldSave.js` (Expedition). Alte Saves ohne Feld bekommen alle Rezepte bis zur aktuellen Insel, damit keine bestehende Expedition blockiert.
5. Client: `craftingPanel.js` zeigt unbekannte Rezepte gesperrt mit „Lies Elias' Notizen“.
6. `package-info.md` in `src/shared`, `src/sim`, `src/client/ui`.

## Akzeptanz
- `test/crafting.test.js`:
  - Vor Nachricht 2 lehnt `craft('arrows')` ab, danach geht es.
  - Ein Save ohne `recipesKnown` hat Tier 1 bekannt.
- `test/layout.test.js`: `bowCamp` liegt auf jeder Map-1-Variante begehbar am Gipfel und nicht im Wasser.
- `?island=1`: Bogen am Gipfel, Nachricht 2, danach Werkbank offen.

## Nicht hier
- Tier-2/3-Freischaltung über Nachrichten (folgt in 21/23 mit eigenen `learn`-Einträgen).

## Umsetzung (Abweichungen)
- Das Lager liegt nicht direkt auf dem Gipfel: Dort sitzen das Ptera-Nest und das Bootsteil. Es liegt auf einer flachen Stelle 8–26 m darunter, 2–7 m neben dem Bergpfad, mit sanftem Boden dazwischen, damit es zu Fuß erreichbar ist. Gibt es so eine Stelle nicht, bleibt es wie bisher am Trail (fester Map: Gipfel).
- Es gibt kein eigenes `recipesKnown`: Ein Rezept gilt als bekannt, sobald seine Notiz (`learn`) gelesen ist. Saves aus der Zeit vor der Story (`story` fehlt) gelten als `legacy` und kennen alle Rezepte.
- Gelernt werden Pfeile, Falle, Ersatzspeer, `bow1`, `spear1`, `quiver1`. Einen Köder gibt es im Spiel noch nicht.
- Die Notiz zeigt unter dem Text, was sie dem Team beibringt; das Crafting-Panel zeigt unbekannte Rezepte als „Unknown“.
