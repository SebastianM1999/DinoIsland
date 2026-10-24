# 03 – Waffen-Freischaltung

**Branch:** `codex/luca/weapon-unlock` · **Hängt ab von:** 01 · **Hotspots:** `world.js` (`craft()`, Inventar-Init, `ACT.REFILL`, Equip)

## Ziel
Waffen werden pro Map freigeschaltet und an der Werkbank gebaut. Feuerwaffen sind nicht mehr kostenlos und erst ab Map 4 baubar.

## Regeln
- Rezept `kind: 'weapon'` mit `tier` (= Map-Nummer) und `weapon` (`'crossbow'`, `'pistol'`, …).
- Einmal gebaut = für das ganze Team freigeschaltet, bleibt über Inselwechsel (wie `upgrades`).
- Kosten: Ressourcen der eigenen Map oder einer früheren.
- Munition ist ein `supply`-Rezept. `ACT.REFILL` gibt keine Gun-Munition mehr.
- Creative-Modus: alles frei.

## Schritte
1. `src/shared/crafting.js`: Waffen-Rezepte für alle 8 Maps (ab Map 3 nur Daten: Obsidian-Speer, Giftpfeile, Betäubungsdart; ab Map 4 Pistole, Schrotflinte, Harpune …). Munitions-Supplies für Pistole und Gewehr.
2. Team-State `weapons` (Liste gebauter Waffen) neben `upgrades`, über Inselwechsel persistent, in `fullState`.
3. `src/sim/firearms.js`: `gunInventory()` setzt `owned` nur für gebaute Waffen (das Flag existiert schon für Drop/Pickup).
4. `src/sim/world.js`:
   - `craft()` behandelt `kind: 'weapon'`.
   - `ACT.REFILL` ohne Gun-Munition.
   - Equip-Prüfung: nicht gebaute Waffen werden abgelehnt.
5. `src/client/ui/craftingPanel.js`: Reiter „Waffen“, gesperrte Rezepte mit Schloss und „Ab Map n“.
6. Hotbar: nicht gebaute Waffen ausgegraut.
7. `package-info.md` in `src/shared`, `src/sim`, `src/client/ui` aktualisieren.

## Akzeptanz
- Neuer Test `test/weaponUnlock.test.js`: Pistole ohne Bau nicht ausrüstbar; Tier-4-Rezept auf Map 2 abgelehnt; gebaute Waffe bleibt nach Inselwechsel.
- `test/firearms.test.js`, `test/creative.test.js` angepasst und grün.

## Nicht hier
- Die Armbrust selbst (04). Mini-Werkbank-Regel auf Map 1 (07). Waffenschmiede-Rabatt (12).
