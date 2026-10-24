# 17 – Intro- und Outro-Cutscene

**Branch:** `<agent>/story-cutscene` · **Hängt ab von:** – · **Hotspots:** game.js (Start, Spielende)

## Ziel
Eine kurze, überspringbare Kamerafahrt beim ersten Betreten von Map 1 (angespült werden) und am Spielende (brennende Insel). Die Shot-Listen stehen in [14-story.md](14-story.md).

## Schritte
1. `src/client/core/cutscene.js` (neu)
   - Spielt eine Shot-Liste ab: Kamera-Keyframes (Position, Blickziel, FOV), Schwarzblenden, Texteinblendungen, Audio-Cues.
   - Interpolation mit Catmull-Rom über `THREE.CatmullRomCurve3`.
   - `play(shots) → Promise`, `skip()`.
   - Die Kamerapfade sind relativ zu Layout-Ankern (`arrival`, Boot), damit Varianten funktionieren.
2. `src/client/core/game.js`
   - Vor der Übergabe an den Spieler läuft `cutscene.play`, wenn nötig. Input und Pointer-Lock bleiben so lange gesperrt.
   - Der HUD ist ausgeblendet.
   - Halten einer Taste (1 s) überspringt.
   - Die Sim läuft weiter. Der lokale Spieler steht auf seinem Spawn. Dinos meiden den Ankunftsstrand ohnehin (Safe-Zone).
3. **Wann:**
   - Intro: nur auf Island 0, wenn die Expedition `introSeen` noch nicht hat. Das Flag wird nach Ende oder Skip per Aktion an den Host gemeldet und gespeichert. Jeder Client spielt seine eigene Cutscene.
   - Outro: bei `mission.won` statt direkt zum Endbildschirm.
4. Die Spieler-Modelle der Mitspieler liegen in Shot 3 am Strand (einmal lokal gespawnte Posen, keine Sim).
5. Audio: Brandung (vorhandene Ambience), Fade über `music.js`.
6. `package-info.md` in `src/client/core`.

## Akzeptanz
- Unit-Test für den Shot-Interpolator (Start- und Endpunkt exakt, Dauer, Skip löst das Promise sofort auf).
- Im Browser: Neue Expedition auf `?island=1` spielt das Intro. Nach Laden kein Intro. Skip funktioniert. Sieg zeigt das Outro.
- Performance: keine zusätzlichen Draw-Calls nach dem Ende (Ressourcen freigegeben, siehe `test-coverage`-Skill).

## Nicht hier
- Keine Zwischensequenzen mitten im Spiel. Die Story läuft sonst über Nachrichten und Quests.
