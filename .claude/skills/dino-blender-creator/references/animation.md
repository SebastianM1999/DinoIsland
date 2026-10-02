# Animation guide (refined after raptor, brachio and T-Rex)

Read this before writing or changing any clip. It contains what worked, what looked "buggy"
to the owner, and how to do better than the first three dinos.

## Contents
1. How the game plays clips (constraints you must design for)
2. Authoring model: pose functions + IK + sampling
3. Principles that make it read as alive (and heavy)
4. Gait recipes (biped, quadruped) with numbers
5. Per-clip recipes: idle, walk, run, attack, roar, death
6. Checks before export
7. Mistakes we made

---

## 1. How the game plays clips

`src/client/models/dino/glbDino.js` (GLBDinoAnimator):

- States: `idle`, `walk`, `run`, `attack`, `death`, plus optional `roar`, `eat`, `hurt` if the catalog
  lists the clip. `attack`, `death`, `hurt` play **once and clamp**; everything else **loops**.
- Walk/run speed: `timeScale = min(speed / stride, maxCadence) * clipDuration`. So the clip length
  in frames does not matter, only **stride** (metres per cycle, measured) and the **cadence cap**.
  If speed / stride exceeds maxCadence the feet slide. Pick stride so the top speed of each state
  stays under the cap.
- Walk ↔ run crossfade keeps the **phase** (`time / duration`), so **both clips must start on the
  same footfall** (left foot touching down at t = 0) — otherwise the legs scissor during the blend.
- Crossfades are 0.18 s. The first and last frame of a looping clip must be identical (sample()
  includes frame N = frame 0).
- **Overlays on top of every clip** (don't fight them, leave room for them):
  - jaw: `rotateX(-0.52 * max(jaw, roar, attack))` → the game already opens the mouth ~30° on
    attack/roar. Keep the clip's own jaw opening ≤ ~0.5 rad or the mouth dislocates.
  - head look: yaw up to ±0.55 rad toward targets; neck pitch for headDown/neckRaise/roar;
    head shake on roar. Keep clip head yaw small (≤ 0.1) so the sum stays plausible.
  - tail: spring yaw from turning (±0.35 over the chain) + tiny sway.
  - body pitch follows terrain (±0.35), hurt shake.
- No per-foot IK at runtime: the feet must already be planted in the baked clips.
- Server timings to match: brachio stomp windup 0.8 s (`stompWindup`); bites land at ~45-50 % of
  the attack clip; T-Rex roar holds while `pose.roar` is set (loop the roar).

## 2. Authoring model

- Write each clip as a Python function `clip(t)` with `t ∈ [0, 1]` that poses the rig from scratch
  (`reset()` first). Express motion as functions of phase, not as hand-set keyframes.
- Feet: animate the IK controls (`IK_Ball`/`IK_Ankle`/`IK_Toe` for theropods, `IK_<key>` for
  quadrupeds). The leg chain follows by IK. `sample()` reads every deform bone back in local space
  with constraints applied, `export.py` keys them per frame (30 fps). This gives perfectly planted
  feet and smooth curves; no NLA bake operator needed.
- Use `track(t, keys)` (smoothstep between keys) for one-shot actions: anticipation, holds,
  overshoot-and-settle are just extra keys.
- Use sines with **phase lag per chain index** for loops (`sin(TAU*t - 0.5*i)`), always with an
  integer number of cycles per clip so the loop closes.
- Directions in `rot()`: +X = nose/forward end down (tail bones: tail up), +Z = yaw left, Y = roll.

## 3. Principles (what makes it look alive, not robotic)

1. **Weight first.** Body drops slightly *after* each foot contact (compression), rises at mid
   stance. Heavier animal → longer contact, smaller bounce, slower cadence. A T-Rex walk at
   0.5 Hz; a raptor at ~1.8 Hz.
2. **Overlapping action / follow-through.** Neck, head, tail and arms lag the body with a phase
   delay that grows along the chain (0.3-0.6 rad per bone). Never move a chain rigidly.
3. **Head stabilisation.** Predators keep the head steadier than the body: counter-rotate the
   head against body pitch/yaw (30-60 % of it). Herbivores may bob more.
4. **Counter-rotation.** Hips yaw toward the swing leg, shoulders/torso yaw the other way, tail
   swings opposite to the hips.
5. **Asymmetric timing.** Stance is slow and even, swing is quick with ease-in/out; heel lifts in
   the last ~45 % of stance; toes droop during swing and flatten just before contact.
6. **Anticipation → action → recovery.** Every attack: wind-up opposite to the strike (rear back,
   jaws open), fast strike (2-4 frames), overshoot, settle. Same for stomps and roars.
7. **Holds and irregularity in idle.** Idle should not be pure sine soup: look in one direction,
   *hold*, glance, sniff (two quick head dips), small jaw snap, breathe. Use `track()` keys with
   holds; vary rhythm so 3 dinos side by side don't look synchronous (the game randomises phase).
8. **Arcs.** Feet travel in arcs (sin^1.2 lift), heads and tails in arcs — avoid linear paths.
9. **Silhouette.** Poses must read from 50 m: rear-ups, lunges and roars need big body angles
   (0.3-0.5 rad), not small wiggles.
10. **Calm small parts.** Tiny arms/hands: slow (≤ 1 cycle per clip), small (≤ 0.1 rad) motion.
    Fast flexing on small parts reads as jitter ("buggy claws").

## 4. Gait recipes

Stride for the catalog = sweep `S` / duty `β` (stance foot moves S during β of the cycle).
Measure it from the export with `check_glb.mjs` and paste the measured value.

**Biped (theropods)** — `biped_leg(side, phi, S, duty, h, lift, y0)`; left phase t, right t+0.5.

| Species (raptor-scale units) | walk S / β / h | run S / β / h | body bob | notes |
|---|---|---|---|---|
| Raptor | 1.0 / 0.55 / 0.17 | 0.9 / 0.22 / 0.30, y0 -0.02, body z -0.1 | walk 0.018, run 0.05 | run is a bound with flight phase |
| T-Rex | 0.85 / 0.60 / 0.15 | 1.0 / 0.42 / 0.26 | walk 0.022 | heavy, no long flight phase |

**Quadruped** — `quad_leg(key, phi, S, duty, h)` with `LATERAL` phases (BackL 0, FrontL .25,
BackR .5, FrontR .75). Brachio (real metres): walk 1.9 / 0.70 / 0.45, run 2.4 / 0.45 / 0.70.
Keep a constant **crouch** (Body z -0.3 walk, -0.42 run) when the front legs are near-straight
pillars, otherwise the elbow has zero slack and snaps straight at reach.

**Reach rule.** Hip-to-ankle distance must stay ≤ ~95 % of thigh+shin length at both ends of the
sweep. Near full extension the IK knee flips between frames ("knee snaps during run" test, limit
0.4 rad per 1/60 s at max cadence). Fix by shortening S, shifting y0 under the hip, or lowering
the body — never by speeding the clip up.

## 5. Clip recipes

- **Idle (3-6 s loop):** breathing 2-3 cycles (body z ±1 %, torso pitch), look-around with holds
  (neck 35 %, head 40 % of the look angle), sniff or chew beat, one jaw beat, tail slow S-wave,
  arms barely moving. Feet planted (no IK motion).
- **Walk:** as §4 plus: body x sway toward the stance foot, roll ±0.04, yaw ±0.04; neck counter
  pitch to the bob; head counter yaw; tail yaw 0.05-0.09 with lag 0.45-0.7 per bone; slight
  constant forward lean (0.03-0.05).
- **Run:** stronger lean (0.1-0.15), neck extended forward, head pitched up to stay level, jaw a
  bit open, tail raised and stiffer (smaller sway), arms tucked. Lower body for slack.
- **Attack (bite, ~1 s, plays once):** 0-0.3 rear back + jaws open (≤ 0.55), 0.3-0.5 lunge low +
  body forward 0.2-0.3 of body length, 0.5 snap shut, 0.5-0.8 head shake (4 Hz, damped), recover.
  Plant one foot, let the other slide/step with the lunge. Raptor: sickle-claw kick with the left
  foot at the strike.
- **Stomp (quadruped, 1.6 s):** rear onto hind legs over exactly the server windup (0.8 s):
  body pitch -0.45 about the hips, hips stay LOW (hind legs have little slack), front feet follow
  the body and fold (`follow_body`), slam 0.56-0.64, land slightly forward, recover with a step.
  Raise the tail base while rearing or it digs into the ground.
- **Roar (2 s loop):** 0-0.15 rise, hold with jaws open (≤ 0.5) and a 10-14 Hz rumble (small),
  slow head sweep, arms raised, 0.85-1 settle. The game adds its own jaw + head shake.
- **Death (1.5-2.4 s, clamps):** stagger/cry (head up, jaw open) → collapse with overshoot and
  settle (keys like 1.55 → 1.42 → 1.5). Bipeds roll onto the side (~1.5 rad); big quadrupeds sink
  and the **neck base** takes most of the droop so the neck lies forward, head resting on the
  ground (distal bones small). Legs follow the body (`follow_body`) and curl. Last 20 % of the
  clip is still — it is the pose the corpse keeps.

- **Flyer clips (ptera):** Fly (1 s; fast downstroke, hand folds on the upstroke, outer bones lag),
  Glide (3 s), Dive (wings swept back), Attack (flare + talons forward + beak snap ~0.4, then a power
  stroke), Idle (hover), **Fall** (dead in the air: limp tumble, wings flailing out of phase, loops)
  and **Death** (impact). Wing helper: flap = rotation about the creature's forward axis (Y), sweep =
  about Z, mirrored by side sign.
- **Clip-to-clip continuity:** when the game switches A -> B at an event (fall -> impact), build both
  from ONE parameter function so B frame 0 == A frame 0 (the ptera's `p_fall_params` + blend to a
  lying pose). Blend limbs/neck/pitch with a FAST factor that finishes before the body touches down,
  wings/roll with a slower settle; otherwise legs and beak go 0.3-0.7 m under the ground mid-impact.
- **Lying death poses:** fold legs back flat (thigh ~1.6 rad), keep the neck droop moderate, and
  `ground_report` every 0.05 of the clip, not just the end.

## 6. Checks before export (do all of them)

1. `ground_report(CLIPS)`: min z per clip at several t. Feet ≈ 0 (±0.01), death ≥ -0.01.
2. `max_step(sample(run, N))` for leg bones → convert to per-1/60 s at maxCadence, < 0.4 rad.
3. Contact sheets (`sheet.py`) of every clip from the side, 8 frames, and Read the PNGs. Look for:
   rubber limbs, sliding feet, head popping, arms jittering, parts clipping into the body/ground.
4. Close-up sheet of head + arms for idle and walk.
5. After export: `check_glb.mjs` (strides, seams, jaw direction, knee steps, tris).
6. In the game's dino preview (`/src/client/models/dino/preview.html?type=<t>`) click idle, walk,
   run, attack, roar, dead — this includes the game's overlays and real lighting.

## 7. Mistakes we made (don't repeat)

- Noodle legs: automatic weights blended thigh/shin/foot over a long stretch. Use `crisp_chain`.
- Jittery claws: arm skin smeared by body weights while claws were rigid on Hand. Crisp arm
  weights + slow, small arm motion.
- Knee snapping at run speed: foot reached too far → leg straight → IK flip.
- Brachio elbows snapping: front legs modelled straight; needed the gait crouch.
- Brachio feet sinking 7 cm: IK control bone pointed straight down while the foot bone tilted.
- Attack slam pop: switching from body-following feet to a separate landing pose mid-clip. Blend
  inside one solution instead.
- Tail through the ground on rear-ups / pitch accumulating over 5 tail bones: per-bone values add
  up — divide by the bone count.
- Death sinking 7-37 cm below ground; always check min z at t = 1.
- Raptor jaw opened upward in the game: Jaw bone roll must be flipped.
- Clip jaw 0.8 + game overlay 0.52 = dislocated mouth. Clip jaw ≤ 0.5.
