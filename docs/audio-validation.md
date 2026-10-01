# Island audio validation

Implemented on `codex/island-audio`, October 1, 2026.

- 63 prepared audio assets, approximately 10 MiB: 59 mono WAV effects and
  four stereo Ogg music loops. Source filenames, licenses, and edits are
  recorded in `assets/audio/sources.json`.
- `npm test`: 88 passed, one existing skip, zero failures. Includes nine new
  tests covering provenance, HTTP types, load/decode failures, stale loads,
  sample variation, terrain/support selection, walking/running cadence,
  two-second crossfades, four-second danger hold, and music teardown.
- Chromium playback check: no page errors or failed audio assets. All effect
  groups and surface profiles produced sample sources. Both island transitions
  reused the AudioContext and selected the destination island's music.
- Master/music/effects mute controls reached zero; stopped music left no
  remaining sources. Four music files decoded successfully, with 90–118-second
  loops. An offline stress mix of rifle fire, running steps, a T-rex call, and
  danger music peaked at 0.439, below clipping.
- Electron playback check: jungle and volcano music loaded; island travel
  selected volcano calm music; local credit notices opened in a sandboxed
  window; teardown stopped music successfully.
- Windows unpacked build succeeded using the installed Electron distribution
  and disabling executable signing/editing for this local packaging check.
  The ordinary build's download was blocked by the environment's certificate
  chain. Inspection of `app.asar` confirmed all four tracks, SFX, provenance,
  credits, and music loader were included.

Browser/desktop check output and the settings screenshot are under the ignored
`output/playwright` directory. The local packaging check is under the ignored
`.cache/audio-desktop-build` directory. Playwright's npm CLI download had the
same certificate issue; checks used the bundled runtime and installed browser.

These checks validate playback and lifecycle behavior, not subjective listening
quality. Music excerpts and creature pitch profiles may benefit from a listening
pass. Ash uses gravel, and reload/dinosaur footfalls use adapted metal/wood
foley. UI cues and ambient soundscapes retain their existing synthesis.
