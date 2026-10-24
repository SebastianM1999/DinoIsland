# 11 – Base: Gebäudemodelle

**Branch:** `codex/luca/base-models` · **Hängt ab von:** 10 · **Hotspots:** keine

Kann in Teil-PRs pro Gebäude aufgeteilt werden. Jedes Modell muss exakt zu seinen Collidern aus 10 passen.

## Gebäude
- **Lager (Stufe 1):** das Zelt aus 07.
- **Pfahlstation (Stufe 2):** Expeditionshaus auf Stelzen, ca. 1,8 m hoch. Rampe und Leiter zur umlaufenden Veranda (Schussplatz bei Raids, Dinos kommen nicht hoch). Hauptraum mit Kartentisch (Aufgabentafel), Kleiderecke, Craft-Kiste. Wellblechdach, Funkmast, Laternen.
- **Steinhaus (Stufe 3):** zwei Räume, Steinwände, Kamin.
- **Festung (Stufe 4):** Steinmauer mit Tor, begehbarer Wehrgang, Wachturm mit Treppe, Trophäenwand.
- **Mauern:** Holzzaun (2), Palisade (3), Steinmauer (4).
- **Modul-Hütten:** kleine Ein-Raum-Hütten mit Tür, je eine Grundform plus Erkennungsmerkmal (Amboss, Fässer, rotes Kreuz, Räucherrauch, Hochsitz …).
- **Baugerüst** pro Gebäude.

Biom-Varianten über das `style`-System (Sumpf: dunkles Holz, Schilfdach; Vulkan: graues Holz, Asche-Plane).

## Schritte
1. `src/client/world/base.js` aufteilen: ein Modul pro Gebäude (z. B. `world/base/stilthouse.js`), statische Teile weiter zu wenigen Meshes mergen.
2. Innenräume: Beleuchtung, keine Schatten-Artefakte, Kamera clippt nicht durch Wände.
3. Schadenszustand pro Gebäude und Modul.
4. Alte Modelle (Lodge/Cabin, Fort) entfernen.
5. `src/client/world/package-info.md` aktualisieren.

## Akzeptanz
- `test/props.test.js` / Draw-Call-Budget hält.
- `?island=3&base=…`: alle Stufen begehbar, Wände passen zu den Collidern.
