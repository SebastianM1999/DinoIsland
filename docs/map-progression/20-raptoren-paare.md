# 20 – Map 1: Raptoren in Paaren

**Branch:** `<agent>/raptor-pairs` · **Hängt ab von:** – · **Hotspots:** keine

## Ziel
Auf Map 1 jagen Raptoren **zu zweit**, so wie es Jonas' Brief sagt. Ein Paar spawnt zusammen, bleibt zusammen und flankiert.

## Schritte
1. `src/shared/levels.js`: Map 1 bekommt `raptorGroup: 2`. Die Raptor-Anzahl bleibt gerade (heute 4 = 2 Paare).
2. `src/sim/ai/raptor.js` (`spawnInitial` / `respawn`)
   - Raptoren spawnen in Gruppen der Größe `raptorGroup`, beide im Umkreis von wenigen Metern.
   - Ein Respawn ersetzt das fehlende Tier des Paares, wenn das andere noch lebt.
   - Dafür das bestehende Pack-/`share`-System aus `ai/senses.js` (dino-ai-concept) nutzen, kein eigenes Gruppen-System.
3. Flanken: Der zweite Raptor nimmt beim Angriff einen seitlichen Versatz (wie die Packs im dino-ai-concept, Phase „Packs“). Ist das dort schon gebaut, hier nur konfigurieren.
4. `package-info.md` in `src/sim/ai`.

## Akzeptanz
- `test/raptor-pairs.test.js`:
  - Nach `spawnInitial` gibt es Paare innerhalb von x m.
  - Stirbt einer, respawnt er zu seinem Partner.
  - Feste RNG-Seeds, deterministisch.
- `?island=1`: Raptoren tauchen immer zu zweit auf.

## Nicht hier
- Gruppen auf anderen Maps (die nutzen die Level und Alphas aus 02).

## Umsetzung (Abweichungen)
- Raptoren spawnen schon als Packs mit gemeinsamer Jagd, Flanken und Respawn ins eigene Pack (`spawnPack`, `packHunterBrain`). Es reicht daher die Pack-Größe: `LEVELS[0].raptorPack = 2` setzt jede Raptor-Zone von Map 1 auf zwei Tiere (vorher 3 und 2 gemischt).
- Kein eigenes Gruppen- oder Flanken-System.
