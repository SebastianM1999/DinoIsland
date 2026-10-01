# Island audio validation

Implemented on `codex/island-audio`, October 1, 2026.

- 70 prepared audio assets, approximately 24.9 MiB: 64 mono WAV effects and
  six stereo Ogg music tracks. Source filenames, licenses, and edits are
  recorded in `assets/audio/sources.json`.
- `npm test`: 93 passed, one existing skip, zero failures. Includes eleven audio
  tests covering provenance, HTTP types, load/decode failures, stale loads,
  sample variation, terrain/support selection, walking/running cadence,
  two-second crossfades, four-second danger hold, music teardown, menu/island
  stale-load cancellation, boss region selection, and causeway edge hysteresis.
- Chromium playback check: no page errors or failed audio assets. All effect
  groups and surface profiles produced sample sources. Both island transitions
  reused the AudioContext and selected the destination island's music.
- Main-menu music starts on the first click/key press, using the same
  AudioContext as gameplay. Browser traversal confirmed boss music on the
  causeway and plateau, island music after leaving, and a clean reset on travel.
- All six selected music files decode in Chromium (85–408 seconds). Full-file
  numerical peak checks range from 0.444 to 0.687, below clipping. Music mute
  reached zero; stopping left no music voices. The earlier effects stress mix
  peaked at 0.439 with the original danger track; it was not repeated with the
  replacement music.
- Electron playback check: jungle and volcano music loaded; island travel
  selected volcano calm music; local credit notices opened in a sandboxed
  window; teardown stopped music successfully.
- Windows unpacked build succeeded using the installed Electron distribution
  and disabling executable signing/editing for this local packaging check.
  The ordinary build's download was blocked by the environment's certificate
  chain. Inspection of `app.asar` confirmed all four tracks, SFX, provenance,
  credits, and music loader were included. The updated package was inspected
  again and contains all six selected tracks plus the boss region helper.

Browser/desktop check output and the settings screenshot are under the ignored
`output/playwright` directory. The local packaging check is under the ignored
`.cache/audio-desktop-build` directory. Playwright's npm CLI download had the
same certificate issue; checks used the bundled runtime and installed browser.

Selected music: Forest Exploration / Escape Velocity (Emerald Jungle),
Shadows and Dust / Eyes In The Void (Ashfall Isle), Call To Adventure (menu),
and Simulacra (boss arena and entire causeway, even before combat). Scott
Buckley's full tracks retain their opening on first play and use two-second
tail/head crossfades with loopStart=2s. Forest Exploration uses its original loop.

These checks validate playback and lifecycle behavior, not subjective listening
quality. Music and creature pitch profiles may benefit from a listening
pass. Ash uses gravel, and reload/dinosaur footfalls use adapted metal/wood
foley. UI cues and ambient soundscapes retain their existing synthesis.

## ElevenLabs weapon effects

Five effects generated on October 1, 2026 with `eleven_text_to_sound_v2`:
pistol shot, single M4 shot, spear throw, bow release, and compact weapon impact.
Generated assets use ElevenLabs account terms rather than CC0. Prompts and
preparation edits are recorded in `assets/audio/sources.json`; originals are
cached in `.cache/elevenlabs-sfx`. The local API key remains in ignored `.env`.

The catalog uses these effects for pistol/rifle, spear release, bow release,
and normal/weak/world impacts. Recorded bites, large footsteps, bow handling,
and spear melee swings keep their earlier recordings. Previous recorded
weapon shots are retained locally but are no longer selected by the catalog.

Chromium and Electron both decoded all five assets and played all seven effect
aliases through HRTF panners at the requested position, with no failed assets.
Master and SFX mute gains fell below 0.001. An offline mix of 40 M4 rounds at
10 rounds per second plus pistol, impact, bow and spear effects peaked at
0.4912. These are objective playback checks, not a subjective audition.

The full suite initially exposed a seed-dependent failure in
`fruit plant visuals show exactly the remaining harvests`: its randomly
generated map had no berry spot. That test passed in the isolated rerun.
The final `npm test` run passed: 93 passed, one existing skip, zero failures.
Re-running the generator reused all five cached originals without API requests.
