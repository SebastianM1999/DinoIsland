# 14 – Story

**Branch:** – (nur Doku) · **Hängt ab von:** – · **Hotspots:** keine

Die Story-Bibel für Map 1–3 und die Zusatzinsel Hollow Mountain. Die Teilpläne 15–25 setzen sie um. Weicht die Umsetzung ab, wird diese Datei im selben PR angepasst.

Die Namen sind Vorschläge und können getauscht werden. Dann alle Nachrichtentexte unten mit anpassen.

## Figuren
| Figur | Rolle |
|---|---|
| **Die Spieler** | Schiffbrüchige. Ihr Schiff geht im Sturm unter (wird nie gezeigt, nur Wrackteile am Strand). 1–4 Spieler, alle werden am selben Strand angespült. Sie sprechen nie. |
| **Elias Brand** | Naturforscher der *Meridian*. Er strandete vor Jahren und folgt der Spur der Dinos zu ihrem Ursprung. Er taucht nie auf, man liest nur seine Nachrichten. Er ist neugierig und etwas besessen und hat Respekt vor den Tieren. |
| **Jonas Wiek** | Steuermann der *Meridian*. Er blieb auf Map 1 zurück, verletzt, und starb am Lagerfeuer. Er schreibt nüchtern und erschöpft. |
| **Der König** | Der T-Rex in der Caldera der Aschefeuer-Insel, der Endboss. Elias hat ihn hinter einem Siegel eingesperrt. |

## Ton
- Kurze Texte. Ein Brief passt auf ein Panel ohne Scrollen, höchstens etwa 90 Wörter.
- Jede Nachricht hat drei Teile: **Stimmung**, **ein konkreter Hinweis** (wohin, was tun) und **ein Haken zur nächsten Spur**.
- Es gibt keine Dialoge und keine Sprachausgabe. Die Story läuft über Nachrichten, Quest-Texte, Orte und zwei Cutscenes.
- Im Spiel stehen die Nachrichten auf Englisch (wie alle Spieltexte) in `src/shared/notes.js`. Hier steht die deutsche Fassung; Änderungen an beiden Stellen nachziehen.

## Ablauf
```
Map 1  Ankunft ─ Brief Jonas ─ Speer ─ Erkunde die Insel ─ Gipfel (Bogen, Rezepte) ─ Boot entdeckt ─ Bootsteile ─ Ablegen
Map 2  Floß/Nachricht 3 ─ Laterne bauen ─ Alpha Sarcosuchus ─ Glutblut ─ Schwarzmoor (letztes Teil, Nachricht 4) ─ Ablegen
Map 3  Station/Nachricht 5 ─ versiegeltes Tor ─ Bootsteile ─ Überfahrt
  3b   Hollow Mountain: Laterne, Kristall/Upgrades, Nachricht 6, Elias' Lager (Nachricht 7, Siegelkristall) ─ Rückfahrt
Map 3  Siegel einsetzen ─ T-Rex-Boss ─ großer Ausbruch ─ Countdown ─ Ablegen = Spielende (Outro)
```

## Map 1 – Smaragd-Dschungel

### Intro-Cutscene (Teilplan 17)
Sie dauert etwa 12 s. Jede Taste zeigt „Überspringen halten“, langes Halten überspringt. Sie läuft nur beim **ersten Betreten von Map 1 einer neuen Expedition**, nicht nach einem Laden.

| # | Shot | Dauer |
|---|---|---|
| 1 | Schwarz. Brandung und Wind (Ambience), langsam lauter. | 2 s |
| 2 | Aufblende auf das offene Meer im Morgengrauen. Die Kamera gleitet tief über die Wellen auf die Insel zu. Wrackteile treiben im Bild. | 4 s |
| 3 | Am Strand liegen die Spieler-Modelle bäuchlings im flachen Wasser. Die Kamera senkt sich auf den eigenen Charakter. | 3 s |
| 4 | Die Blende geht kurz auf Schwarz und kommt verschwommen zurück, in First Person auf Augenhöhe am Boden. Der Blick hebt sich und richtet sich auf. Im Bild: das erloschene Lagerfeuer und dahinter das Skelett. | 3 s |

Danach hat der Spieler die Kontrolle. Hint-Text: „Wo bin ich?“, darunter „[E] Untersuchen“, sobald das Skelett im Fokus ist.

### Ankunft (Teilplan 16)
- Spawn am Strand vor dem Camp-Strand. Das Zelt (07) liegt landeinwärts in Sichtweite.
- **Erloschenes Lagerfeuer:** kalte Asche, ein dünner Rauchfaden. Interagieren zündet es an, mit Funken und Ton. Ab dann gilt:
  - Es heilt wie das heutige Camp-Feuer.
  - Es ist Respawn-Punkt.
  - Hint: „Das Feuer brennt. Hier seid ihr sicher.“
- **Skelett** an einen Treibholzstamm gelehnt. Eine Flasche mit Papierrolle steckt zwischen den Rippen. Interagieren öffnet **Nachricht 1**.
- **Speer** steckt schräg neben dem Skelett im Sand. Aufheben gibt den Startspeer.
- Man startet **ohne Waffen**: kein Speer, kein Bogen, keine Fallen.

### Nachricht 1 – Flaschenpost (Jonas)
> *An wen auch immer das Meer dich gespült hat,*
>
> mein Bein ist hin, ich komme nicht mehr weit. Elias ist vor drei Tagen auf den Berg gestiegen. Dort oben hat er seine Aufzeichnungen versteckt, sagt er, und alles, was man zum Überleben braucht.
>
> Hüte dich vor den Raptoren. Sie jagen nie allein, immer zu zweit. Wenn du einen siehst, ist der andere schon hinter dir.
>
> Am Ostufer liegt unser Beiboot. Es ist kaputt, aber nicht verloren.
>
> Nimm meinen Speer. Ich brauche ihn nicht mehr.
>
> *– J. Wiek, Steuermann der Meridian*

Nach dem Lesen kommt **Quest 1: „Erkunde die Insel“**. Ziel: „Folge Elias' Spur auf den Berg.“ Auf der Karte erscheint ein grober Marker am Gipfel.

### Unterwegs
- Raptoren treten **in Paaren** auf (Teilplan 20). Das bestätigt den Brief.
- Bootsteile und Ressourcen lassen sich schon aufheben. Die Bootsteile zählen erst ab der Boot-Entdeckung als Quest, aber sofort mit dem schon gefundenen Stand.

### Gipfel – Elias' Lager (Teilplan 19)
Eine Plane über einem Felsvorsprung, eine Kiste, eine Feuerstelle. Daneben liegt **Elias' Bogen** mit Köcher (der heutige `bowCamp`, verlegt). Aufheben gibt Bogen und Startpfeile, jeder Spieler holt seinen eigenen.

### Nachricht 2 – Gipfel (Elias)
> *Notiz, Tag 41*
>
> Von hier oben sieht man alles: den Hain im Norden mit dem alten Riesen, die Nester, das Wrack am Ostufer. Jonas glaubt nicht mehr daran, dass wir hier wegkommen. Ich schon.
>
> Ich lasse hier, was ich gelernt habe: wie man Pfeile schnitzt, Fallen stellt und Köder legt. Und meinen Bogen. Jagt nicht, was ihr nicht braucht.
>
> Ich baue ein Floß und folge den Flugechsen nach Süden, in den Nebel. Dort, glaube ich, beginnt die Spur.
>
> *– E. Brand*

Lesen schaltet die **Tier-1-Rezepte** für das ganze Team frei: Pfeile, Falle, Köder, `bow1`, `spear1`, `quiver1`. Neue Quest: „Finde das Wrack am Ostufer.“

### Das Boot (Teilplan 18)
- Ist man in Sichtweite des Wracks, wird es als entdeckt markiert und der Quest-Text kommt: „Das Beiboot der Meridian. Mit den richtigen Teilen schwimmt es wieder.“
- Ab jetzt laufen:
  - die heutige Hauptquest (Bootsteile n/3, reparieren, ablegen),
  - das **Mission Board / die Contracts** (Item-Quests).
- Ablegen: wie heute.

## Map 2 – Nebelsumpf

### Landung
Am Landepunkt liegt **Elias' Floß** halb versunken. Am Mast hängt ein Wachstuchbeutel mit **Nachricht 3**.

### Nachricht 3 – Floß (Elias)
> *Notiz, Tag 58*
>
> Der Nebel hier hat einen Geruch, süß und faulig. Im Schwarzmoor wird er so dicht, dass Fackeln darin ersticken.
>
> Aber ich habe etwas gesehen: Als ich das große Panzerkrokodil mit dem Speer traf, glomm sein Blut im Wasser. Es brennt, ohne zu rauchen.
>
> Den Rahmen für eine Laterne habe ich gebaut, die Zeichnung liegt bei. An das Blut bin ich nie gekommen. Das Tier ist zu stark für einen allein.
>
> Was im Schwarzmoor liegt, will ich wissen. Ich gehe es mit einer Fackel versuchen.
>
> *– E. Brand*

Lesen schaltet das Rezept **Laterne** frei. Quest **„Ein Licht im Nebel“**:
1. „Baue eine Laterne.“ (Ressourcen von Map 1/2, siehe Teilplan 21)
2. „Erlege den Alpha Sarcosuchus und nimm sein Glutblut.“ Beim Zerlegen des Bosses gibt es Glutblut für das Team.
3. „Fülle die Laterne mit Glutblut.“
4. „Durchquere das Schwarzmoor.“

### Schwarzmoor (Teilplan 21)
- Ohne brennende Laterne liegt die Sichtweite bei wenigen Metern. Die Fackel geht dort aus.
- Mit Laterne leuchtet ein Lichtkreis von etwa 15 m.
- Dort liegen das letzte Bootsteil und Elias' halb versunkene Fackel mit **Nachricht 4**.

### Nachricht 4 – Schwarzmoor (Elias)
> *Notiz, Tag 63*
>
> Die Fackel ist aus. Ich schreibe im Dunkeln.
>
> Ich habe Gelege gefunden, hier, mitten im Moor, warm wie frisch gelegt. Aber keine Nester, keine Muttertiere. Als hätte jemand sie gebracht.
>
> Im Osten sieht man nachts ein rotes Glühen über dem Meer. Ein Berg, der blutet. Die Flugechsen fliegen alle dorthin.
>
> Wenn ich es zurück zum Floß schaffe, folge ich ihnen.
>
> *– E. Brand*

Die Laterne bleibt im Inventar und ist auf Map 3b die Hauptlichtquelle.

## Map 3 – Aschefeuer-Insel: Ankunft

### Elias' Forschungsstation
Eine Hütte aus Basalt und Treibholz am Vulkanhang, mit Messstäben im Boden und Notizen an der Wand. Auf dem Tisch liegt **Nachricht 5**.

### Nachricht 5 – Station (Elias)
> *Notiz, Tag 97*
>
> In der Caldera lebt ein König. Größer als alles, was ich gesehen habe. Er hat zwei meiner Lager zertrampelt.
>
> Ich habe das Tor zur Kraterarena mit einem Siegel verschlossen. Der Kristall, der es hält, ist das Einzige, was ihn draußen hält. Ich nehme ihn mit in den hohlen Berg auf der Nachbarinsel, damit niemand ihn leichtsinnig öffnet.
>
> Wer gegen den König antreten will, braucht bessere Waffen als meine. Im Berg gibt es Kristalle, härter als Eisen.
>
> Meine Messungen sagen: Der Vulkan schläft nur.
>
> *– E. Brand*

Quest **„Das versiegelte Tor“**:
1. „Finde das Tor zur Kraterarena.“ Am Tor sieht man den leeren Siegel-Sockel. Hint: „Hier fehlt ein Kristall.“
2. „Repariere das Boot und fahre zum hohlen Berg.“ Die heutige Bootsquest, aber das Ziel ist die Zusatzinsel.

Der Vulkan läuft im **normalen Zyklus** und bricht noch nicht groß aus.

## Map 3b – Hollow Mountain (Zusatzinsel)

### Ankunft
In der Westbucht liegt **Elias' Floß zerschellt** (das vorhandene `arrivalBoat`). Quest **„Im hohlen Berg“**:
1. „Finde Elias.“
2. „Sammle Kristall für bessere Waffen.“ Tier-3-Upgrades, Teilplan 23.
3. „Bring den Siegelkristall zurück.“

Die Laterne ist das Licht im Labyrinth. Glutblut-Nachschub muss man von Map 2 mitbringen. Handfackeln und Wandfackeln bleiben als Ergänzung.

### Nachricht 6 – Höhlenwand (Elias)
In Kohle an die Wand einer Kristallhalle geschrieben, mit einer Skizze daneben.

> Ich habe sie gefunden. Die Urquelle.
>
> Ein See, warm wie Blut, voll Kristall. Darin liegen Eier, Hunderte. Die Flugechsen tragen sie hinaus, auf alle Inseln. Deshalb gibt es Gelege ohne Nester.
>
> Das hier ist kein Ort zum Fliehen. Das ist ihr Anfang.
>
> Weiter unten habe ich mein Lager.

### Elias' letztes Lager
Ein Lager tief im Berg neben dem See. Hängematte, Bücherstapel, ein kalter Kocher. Elias selbst ist nicht da (offen gelassen). Auf einem Stein liegt der **Siegelkristall**, darauf das Tagebuch mit **Nachricht 7**.

### Nachricht 7 – Tagebuch (Elias)
> *Letzter Eintrag*
>
> Wenn du das liest, bist du weiter gekommen als jeder vor dir. Jonas hätte gestaunt.
>
> Ich gehe nicht mehr zurück. Jemand muss sie verstehen, und hier unten sind sie keine Monster.
>
> Nimm den Kristall. Öffne das Tor, wenn du bereit bist. Aber hör mir zu: Der König und der Berg gehören zusammen. Fällt der König, wacht der Berg auf. Sei dann schnell bei deinem Boot.
>
> Fahr nach Hause. Erzähl ihnen nicht, wo wir sind.
>
> *– Elias*

Aufheben gibt das Team-Item `sealCrystal`. Neue Quest: „Kehre zur Aschefeuer-Insel zurück.“ Das Boot in der Westbucht ist sofort bereit.

## Map 3 – Aschefeuer-Insel: Finale

1. **Rückkehr** an denselben Strand. Die Insel ist im Zustand von vorher: Boot repariert, Base, Funde.
2. **„Öffne das Tor“:** Den Siegelkristall in den Sockel setzen (Interaktion, ein Spieler reicht). Der Kristall glüht, das Tor fährt mit Erdbeben-Rumpeln auf.
3. **„Besiege den König“:** Der T-Rex-Boss in der Kraterarena (Teilplan 24).
4. **Großer Ausbruch** (Teilplan 25). Er kommt **erst, wenn der Boss tot ist**:
   - Die Kamera wackelt stark, der Vulkan explodiert, Hint: „Der Berg wacht auf! Zum Boot!“
   - Es gibt Dauer-Eruption mit mehr Lavabomben und Dauer-Asche.
   - Ein Lavastrom schneidet den kurzen Weg zum Boot ab.
   - Ein Countdown (Vorschlag 3:00) läuft, bis alle beim Boot sein müssen. Läuft er ab, sterben alle und es geht vom Checkpoint vor dem Ausbruch weiter.
5. **Ablegen** wie heute, alle Lebenden am Boot. Das ist das **Spielende**.

### Outro-Cutscene (Teilplan 17)
| # | Shot | Dauer |
|---|---|---|
| 1 | Von hinten über dem Boot: Es fährt aufs offene Meer, hinter ihm brennt die Insel. | 5 s |
| 2 | Die Kamera dreht sich zur Insel. Lava im Abendrot, Ascheregen. Flugechsen ziehen in Richtung des hohlen Bergs. | 5 s |
| 3 | Abblende auf Schwarz. Text: „Elias Brand wurde nie gefunden.“ Dann die Credits / Expeditions-Statistik. | 5 s |

## Zustand, der gespeichert werden muss
| Zustand | Gültig für | Teilplan |
|---|---|---|
| Intro gesehen | Expedition | 17 |
| gelesene Nachrichten (Team) | Expedition | 15 |
| Lagerfeuer Map 1 angezündet | Insel | 16 |
| bekannte Rezepte (Team) | Expedition | 19 |
| Story-Schritt pro Insel, Boot entdeckt | Insel | 18 |
| Glutblut, Laternen-Füllstand | Spieler-Inventar | 21 |
| Ashfall-Inselzustand während Map 3b | Expedition | 22 |
| `sealCrystal`, Tor offen | Expedition | 23, 24 |
| Ausbruch aktiv + Countdown | Insel | 25 |
