# Audio credits

All files are bundled locally. No audio service, account, or network connection
is required after installing the desktop game.

## Music

- **Medieval: Exploration** by RandomMind — [source](https://opengameart.org/content/medieval-exploration), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Emerald Jungle exploration.
- **Battle Theme A** by cynicmusic — [source](https://opengameart.org/content/battle-theme-a), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Emerald Jungle danger.
- **The Spaces Between** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/the-spaces-between/). Ashfall Isle exploration.
- **The Encounter** by Scott Buckley — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/library/the-encounter/). Ashfall Isle danger.

Music was edited into excerpts, joined with two-second circular crossfades,
level balanced, and encoded as Ogg Vorbis. These are modified versions of the
original works, with no endorsement implied. The exact source segments are in
`sources.json`. Videos using Scott Buckley's music should credit him in their
descriptions as requested on his source pages.

## Sound effects

All selected sound effects are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/):

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
large dinosaur steps use slowed wood-impact recordings. Ash uses gravel.

The Vincent Sevedge `sounds.zip` gunshot collection is **not included**: its
archive contains a CC BY 3.0 notice despite the listing showing CC0.

## Rebuilding

Run `python scripts/prepare-audio.py` with `numpy`, `soundfile`,
`imageio-ffmpeg`, and `7z` installed. Source archives are cached under
`.cache/audio-sources`; only prepared assets are shipped. `sources.json`
records each asset's original filename, author, license, URL, and edits.
