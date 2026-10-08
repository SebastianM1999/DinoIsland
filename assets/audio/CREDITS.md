# Audio credits

All files are bundled locally. No audio service, account, or network connection
is required after installing the desktop game.

## Music

- **Forest Exploration** by Tsorthan Grove — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Source and author](https://opengameart.org/content/forest-exploration). Emerald Jungle exploration. Uses the author's original loop version.
- **Escape Velocity** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/escape-velocity/). Emerald Jungle danger.
- **Shadows and Dust** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/shadows-and-dust/). Ashfall Isle exploration.
- **Eyes In The Void** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/eyes-in-the-void/). Ashfall Isle danger.
- **Call To Adventure** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/call-to-adventure/). Main menu (starts after the first click or key press).
- **Simulacra** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/simulacra/). Boss arena and its causeway, overriding ordinary island danger/exploration music.

Full tracks are retained. Scott Buckley's tracks have two-second tail/head
crossfades; playback repeats from 2s after the first play to join the loop.
Forest Exploration retains its original seamless loop. All music was
level balanced and encoded as Ogg Vorbis. These are modified versions of the
original works, with no endorsement implied. The exact source segments are in
`sources.json`. Videos using Scott Buckley's music should credit him in their
descriptions as requested on his source pages.

## Sound effects

Spear throw, bow release, and weapon impact were
generated with [ElevenLabs Sound Effects](https://elevenlabs.io/sound-effects)
(`eleven_text_to_sound_v2`). They are governed by the generating account's
[ElevenLabs terms](https://elevenlabs.io/terms-of-use), **not CC0**. Generation
prompts and settings are recorded in `sources.json`. Prepared files are mono,
silence trimmed, peak balanced, and given 2ms edge fades. Original generations
are cached locally; the API key is never included in the game.

The recorded effects (and retained previous weapon recordings) are
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/):

- Fantozzi — [Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone).
- TinyWorlds — [Different steps on wood, stone, leaves, gravel and mud](https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud).
- Kenney — [Impact Sounds](https://kenney.nl/assets/impact-sounds).
- Jan Schupke / Vehicle — [Fantasy Sound Effects (Tinysized SFX)](https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx).
- qubodup — [Bamboo stick weapon swishes](https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes).
- Ben Jaszczak et al. — [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library). Selected 1911 and AR-15 recordings.
- Ali_6868 — [Bow Release](https://freesound.org/people/Ali_6868/sounds/384915/) and [Bow Release 2](https://freesound.org/people/Ali_6868/sounds/384916/). High-quality previews of the CC0 originals.
- CaveboyTup — [T-rex Calls](https://opengameart.org/content/t-rex-calls), made from CC0 alligator, lion, and elk samples.
- Darsycho — [Monster Snarls](https://opengameart.org/content/monster-snarls).
- Peludo — [Water Splash and Sand Footsteps](https://opengameart.org/content/water-splash-and-sand-footsteps).

Effects were cut into individual one-shots, mixed to mono, trimmed, peak
balanced, and given short edge fades. Runtime playback adjusts pitch and gain
for creature identity, movement, and distance. Reloads use edited metal foley;
Ash uses gravel. The approved replacements below supersede the old shots,
footsteps and creature calls in the active catalog. Old assets, including the
generated pistol/M4 files, are retained for provenance but are not used by the
current shot/footstep/roar catalog.

### Approved recorded replacements — 8 October 2026

All selected sources publish [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Freesound files here were prepared from the public HQ MP3 previews, not original
lossless uploads. WAV output does not restore detail lost in the MP3. The manifest
records exact downloaded checksums, cut boundaries, creator processing and edits.

- **G1 pistol** — michorvath, [9mm pistol shot](https://freesound.org/people/michorvath/sounds/427592/).
- **G4 rifle** — GeneralSigma, [AR15 Single Shot](https://freesound.org/people/GeneralSigma/sounds/515322/), cut from SuperPhat's [AR15 Real Recording](https://freesound.org/people/SuperPhat/sounds/432366/). Both publish CC0. This is an AR15-family recording used for the game's M4; it is not documented as an exact M4 recording.
- **F1–F6/F9 terrain and vegetation** — Nox_Sound: [grass](https://freesound.org/people/Nox_Sound/sounds/556042/), [gravel](https://freesound.org/people/Nox_Sound/sounds/556002/), [rock](https://freesound.org/people/Nox_Sound/sounds/558812/), [wet sand](https://freesound.org/people/Nox_Sound/sounds/564893/), [mud](https://freesound.org/people/Nox_Sound/sounds/548384/), [dirt/water](https://freesound.org/people/Nox_Sound/sounds/490951/), [grass brushing](https://freesound.org/people/Nox_Sound/sounds/559082/).
- **F7/F10 wood and grass alternatives** — Fission9: [wood](https://freesound.org/people/Fission9/sounds/521589/), [grass](https://freesound.org/people/Fission9/sounds/521587/).
- **F8 jungle leaves** — spenceomatic, [outdoor footsteps](https://freesound.org/people/spenceomatic/sounds/119765/).
- **F11 dirt alternatives** — simonjeffery13, [outdoor dirt steps](https://freesound.org/people/simonjeffery13/sounds/750796/).
- **W2 T-Rex weight** — Breviceps, [Dinosaur falls to ground](https://freesound.org/people/Breviceps/sounds/457531/). Only the initial body thump is used, not the entire fall.
- **R1 T-Rex and separate Sarcosuchus calls** — CaveboyTup, [T-rex Calls](https://opengameart.org/content/t-rex-calls). Finished sound design from CC0 alligator, lion and elk samples. T-Rex uses longer roars; Sarcosuchus uses separate shorter growl/huff cuts and lower playback pitch.
- **R3 Pteranodon** — dinodilopho, [pterodactyl](https://freesound.org/people/dinodilopho/sounds/263530/), a performed creature voice.
- **R4 Raptor trill** — JhennaSide, [dinosaur](https://freesound.org/people/JhennaSide/sounds/455906/), a performed creature voice.
- **R5–R9 grunts and roars** — rubberduck, [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx). Creator-performed and filtered sounds. Grunts go to Stegosaurus, roar 01 to Raptor and roars 02/03 to Brachiosaurus/Titan. R2/R10/R11 and the rejected raw animal voices are not integrated.

Opening walking takes were split into individual contacts, mixed to mono, DC
removed, peak balanced below full scale and given short attack/tail fades.
Running uses these approved contacts with stronger gain, small pitch adjustment
and faster distance-based timing; there is no repeating walking loop. Dinosaur
profiles vary stride, speed, terrain, pitch and weight. T-Rex layers W2; other
heavy creatures layer low-passed grass thuds. Larger Titan steps are deeper and
heavier. Flying, swimming, trapped or stationary dinosaurs do not make land steps.
These creature voices are designed effects, not authentic extinct-animal recordings.

The Vincent Sevedge `sounds.zip` gunshot collection is **not included**: its
archive contains a CC BY 3.0 notice despite the listing showing CC0.

## Rebuilding

Run `python scripts/prepare-audio.py` with `numpy`, `soundfile`,
`imageio-ffmpeg`, and `7z` installed. Source archives are cached under
`.cache/audio-sources`; only prepared assets are shipped. `sources.json`
records each asset's original filename, author, license, URL, and edits.

Run `python scripts/generate-weapon-audio.py` to prepare the generated weapon
effects. It reads a local `.env` or `ELEVENLABS_API_KEY` environment variable
and reuses cached original MP3s under `.cache/elevenlabs-sfx`. It generates only
missing originals, so repeated preparation does not spend additional credits.

Run `python scripts/prepare-approved-audio.py` with `numpy` and `soundfile` to
rebuild the selected replacements. `scripts/approved-audio-sources.json` records
auditioned source hashes; `scripts/approved-audio-cuts.json` records opening-take
boundaries. The tool reuses `.cache/approved-audio` or an optional `--preview-dir`
and verifies originals before cutting. It does not call any generation service.
