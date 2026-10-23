# Dino AI concept: smarter, more dangerous dinosaurs

Status: phases 1-4 implemented (senses + memory, utility + herbivore brains, pack tactics, director). Still open: the
Dilophosaurus and Spinosaurus brains (section 4), the Crystal Plodder's torch reaction, and moving the old
`Math.random()` calls to `world.aiRng` (3.6). Each phase
in section 5 becomes its own PR. What was built differently from this plan is listed per phase in section 5.

Goal: every species is dangerous and feels like it thinks. **Predators hunt on sight**. **Herbivores are
defensive-aggressive**: they threaten you, then charge or fight back when you come too close or hurt the herd,
but they do not chase far.

Ground rules that do not change:
- The sim stays authoritative. All AI runs in `src/sim/` (Node server, Electron host, solo Web Worker); clients only
  see snapshots and events.
- The existing per-species mode machines (`d.mode`, `DS` states, timed wind-ups synced to baked clips) stay as the
  layer that decides *how* an animal does something. The new layers decide *what* it knows and *what* it wants.
- Brains still move only through `sys.steer` / `sys.move`, damage only through `sys.hitPlayer` / `attackPlayer`, and
  import only from `src/shared/` (see `src/sim/ai/package-info.md`). The new modules in `src/sim/ai/` follow the same rule.

---

## 1. Research basis and how it applies here

| Technique | Source / model | What we take from it |
|---|---|---|
| **Perception: sight cone + line of sight** | Stealth games (Thief, Splinter Cell, Far Cry "awareness meter") | A player is seen only inside a view cone, within range, with a clear line (`lineBlocked`). Distance, light, movement and the Stalker skill change how fast awareness grows instead of a yes/no circle. |
| **Hearing as noise events** | Same family; the gloom raptor already does a cut-down version | The world emits noise *events* (`{x, z, radius, kind, t}`) for shots, sprinting, melee, trap snaps and falls. Every dino within the radius hears them, so a gunshot draws a T-Rex from far away. Events cost nothing between shots, unlike a per-tick loudness check. |
| **Gradual awareness states** | Awareness meters | Per dino and player: `unaware → suspicious → alert → hunting`. Awareness rises with stimulus and decays without it, with hysteresis between thresholds. "Suspicious" is the window where a careful player can still back off, which makes the game fair. |
| **Memory** | Standard last-known-position model (e.g. *F.E.A.R.*, *The Last of Us*) | `lastSeen {x, z, vx, vz, t}`. When sight is lost, the dino goes to the predicted spot and searches with expanding points, then forgets after a timeout. Breaking line of sight therefore matters, and hiding works. |
| **Utility AI** | Dave Mark, *Behavioral Mathematics for Game AI*; GDC "Improving AI Decision Modeling Through Utility Theory" | Each option (graze, rest, investigate, stalk, chase, attack, threaten, defend herd, flee, search, regroup) gets a score from 0 to 1, built from response curves over needs (hunger, fear, own HP fraction, distance from home, pack size, target value). The best score wins, with a momentum bonus and a minimum commit time. It sits *on top of* the existing mode machines and picks which mode to enter. Behaviour trees and GOAP were considered and rejected: our brains already are small state machines, and a tree or a planner adds a runtime and authoring cost without a matching gain. |
| **Reynolds steering** | Craig Reynolds, "Steering Behaviors for Autonomous Characters" (GDC 1999) | Seek and arrive already exist (`steer`). New: **pursue with lead** (aim at `p + v * t`, with `t` capped), evade, separation inside packs and herds, and orbiting a slot. These are targets fed into the existing `steer`, so collision, slopes, swimming and `#detour` / A* stay untouched. |
| **Pack tactics** | Wolf hunts: approach, encircle, test, relay chase (Mech; Muro et al. 2011, "Wolf-pack hunting strategies emerge from simple rules", *Behavioural Processes*) and Doom (2016) attack tokens | **Surround slots** around the target, an **attack-token** budget (only N bite at once, the rest circle and feint), **roles** (a driver pushes from the front, flankers cut off the escape direction), **regroup** when the pack is split or hurt. Muro shows that two rules (close in to a safe distance, keep apart from packmates) already produce encirclement, which is our cheap fallback when slots are blocked. |
| **Chase economics** | Optimal foraging / real predators: cheetahs and lions abandon most chases early | Commit while the expected gain (target weakness, target alone) beats the cost (time, distance not closing, own HP, distance from home). Ambushers (sarcosuchus, sump lurker) commit once, then reset. This replaces fixed timers such as the T-Rex's `chaseTime`. |
| **Co-op pacing director** | Michael Booth, "The AI Systems of Left 4 Dead" (2009) | One controller per world tracks how intense each player's last minutes were and limits how many predators may escalate from stalking to attacking at once. It also allows more pressure after quiet stretches. Four players are not swarmed, and one player still feels hunted. |

---

## 2. Current state and its weaknesses

Verified on `origin/main` at `6ab2a0d`.

| # | Weakness | Where | Effect |
|---|---|---|---|
| 1 | **Omniscient circle sight.** `nearestPlayer` is a 2D distance check with no cone, no line of sight and no height. | `src/sim/dinos.js:184`, used by `raptor.js:44`, `trex.js:66`, `testDinos.js:16`, `brachio.js:24` | Dinos see through hills, trees, rocks and cave roofs. Hiding is useless, and sneaking is limited to the Stalker radius multiplier. |
| 2 | **No memory.** Brains read the target's live position every tick (`sys.world.players.get(id)`). | `raptor.js:100`, `trex.js:59`, `brachio.js:30` | A chasing dino tracks you perfectly around corners. A dino that loses you forgets instantly (raptor give-up radius, T-Rex `chaseTime`). There is no searching. |
| 3 | **Only the gloom raptor hears.** `noiseRadius` polls `player.lastShotAt` and `sprinting` per player; the only other "hearing" is the brachio herd startling at sprinters nearby (`brachio.js:165`). | `src/sim/ai/gloomRaptor.js:27`, set in `world.js:1128` | A rifle shot next to a T-Rex goes unnoticed. Noise is a per-species poll instead of an event. |
| 4 | **Dead torch hook.** `noticesLight` always returns false, although `PF.TORCH` is accepted (`world.js:942`) and `carriesLight` exists for brains. | `gloomRaptor.js:19`, `src/shared/torch.js:35` | Carrying a torch in the Hollow Mountain has no risk. |
| 5 | **Shallow flanking.** Every pack member gets a fixed angle offset (`(slot % 3 - 1) * 0.9`), shrinking with distance. | `raptor.js:66`, `:134` | The pack funnels into a cone from one side instead of surrounding you. Everyone bites whenever cooldowns allow, so it is a pile-on, not a hunt. |
| 6 | **Test species borrow the raptor brain.** Triceratops, Ankylosaurus, Pachycephalosaurus, Dilophosaurus and Spinosaurus run `packHunterBrain` as a pack of one; the `peaceful` ones never acquire anyone. | `src/sim/ai/testDinos.js:14-18` | A Triceratops behaves like a slow raptor after a hit (bite and dart back). The Dilophosaurus has no spit and the Spinosaurus no water edge. |
| 7 | **Safe-zone dead band.** Dinos may not walk within `zone.r + 10`, but a player counts as safe only within `zone.r + 6`. | `walkable` `dinos.js:229`, `inSafeZone` `dinos.js:579` | A player in the 4 m ring between them is a valid target that no dino can reach. Predators pace at the edge while the player shoots them for free. |
| 8 | **`canReach` ignores terrain and rocks.** It checks the bite line against `layout.colliders` only, and `segmentColliders` skips `kind: 'rock'` circles. | `dinos.js:547`, `src/shared/collision.js:249` | Bites and stomps land through a ridge crest or a boulder. Minor at bite range, but wrong as soon as the same check gates "can I attack from here". |
| 9 | **Cave head-room special case.** Under the Hollow Mountain roof only `'raptor'` gets 3.5 m clearance; everyone else needs 7 m, including the gloom raptor that lives there. | `dinos.js:226` | The cave raptor kin cannot follow players into low tunnels its own model would fit. The rule should come from each species' `height`. |
| 10 | **Pteranodon uses absolute HP.** It prefers players with `p.hp < 50`, but max HP is `100 + maxHpAdd` (Thick Skin). | `src/sim/ai/ptera.js:77`, `world.js:202` | A Thick Skin player at 49/150 counts the same as one at 49/100. It should be `p.hp / p.maxHp`. |

Other observations that shape the design:
- **Determinism.** AI code in `src/sim/ai/*.js` and `dinos.js` calls `Math.random()` 26 times. The only seeded generator in the sim is `fruitRng` (`world.js:86`), and even that is seeded from `Math.random()`. Lockstep is not needed (clients never run the AI), but the new layers must be testable and reproducible, see 3.6.
- **Line of sight cost.** `lineBlocked` (`src/shared/visibility.js:6`) samples the terrain 16 times and then loops over **every** tree and rock of the island. On island 1 (697 trees, 1,466 rocks) one call took about **0.23 ms** in Node (rough measurement, 400 calls). A naive check of 20 dinos × 4 players × 20 Hz would be 1,600 calls per second, about **370 ms of CPU per second**. That is not affordable; see 3.1.
- `sys.world.sightMul()` (`world.js:670`, the volcano ash) and `p.mods.stalkerMul` (the Stalker skill) already scale sight. Both must keep working under the new model.

---

## 3. Target architecture

```
world.step(dt)
  └─ DinoSystem.update
       ├─ director.tick(world)                 once per tick: intensity, hunt budget         (phase 4)
       └─ per dino:
            senses.update(d, sys, dt)          awareness per player, memory, noise inbox      (phase 1)
            brain.update(d, sys, dt)
               ├─ utility.choose(d, options)   at 2-4 Hz, staggered, with hysteresis          (phase 2)
               ├─ pack.assign(group, target)   slots, tokens, roles for pack hunters          (phase 3)
               └─ existing mode machine        steer / move / attackPlayer / hitPlayer as today
```

### 3.1 `src/sim/ai/senses.js` (phase 1)

Per dino, in `d.senses`:
- `aware: Map<playerId, number>` with values from 0 to 1. Thresholds `suspicious`, `alert` and `hunting` come from
  config, with a gap between rising and falling thresholds.
- `memory: Map<playerId, {x, z, vx, vz, t, how}>`. `how` is `'seen' | 'heard' | 'told'`.
- `noise: []`, the inbox filled by `world` noise events this tick.

**Sight**, checked in order from cheap to expensive, stopping at the first fail:
1. Range: `sightRange * world.sightMul() * p.mods.stalkerMul` (keeps the Stalker skill and the ash).
2. View cone: a dot product against `d.yaw`, with half-angle `fov`. A narrow peripheral band only adds a little awareness.
3. Line of sight: `lineBlocked(eye, chest, terrain, layout)`. The eye sits at the species' eye height (from `height`,
   scaled), and the target is the player's chest. Only when that ray is blocked and the player is close is a second
   ray cast to the head.
4. Gain per second = `base × distanceFalloff × movement (still 0.3 / walk 1 / sprint 1.6) × light (torch: ×2 in caves, ×1.3 outside) × (cone centre 1 / periphery 0.3)`.

**Hearing.** `world` calls `sys.noise(x, z, radius, kind)` from shots (where `lastShotAt` is set today, `world.js:1128`),
sprinting (throttled to every 0.5 s per player), melee hits, trap snaps and dino roars (packmates hear each other).
A dino that hears a noise gets a jump in awareness and a memory entry with `how: 'heard'` at the noise position,
**not** the player position. It investigates the spot and does not know where you went. The gloom raptor's `noiseRadius`
becomes the first user of this event path, and `noticesLight` reads `carriesLight(p.fl)`.

**Memory and search.** When sight is lost, the dino moves to `lastSeen + v * min(2 s, age)`, then picks 3-5 search
points with `randomWalkablePoint` in a radius that grows from 6 to 18 m. After `memoryTime` it forgets that player.
Pack and herd members share a memory entry when one of them roars or calls (`how: 'told'`), which is how a raptor
pack converges on you after one scout spots you.

**Performance budget** (the main risk of this phase):
- Make `lineBlocked` cheap first. Add a spatial grid of trees and rocks in `src/shared/visibility.js`, built once per
  layout and cached on it (8 m cells, walking only the cells the segment crosses). It must return exactly the same
  result as today: a test compares old and new over thousands of random segments on several islands. The client's
  `DINO_SIGHTING` gets faster for free.
- Stagger: each dino re-checks sight on each candidate player every 0.25 s, with the phase offset by its id
  (`(id + tick) % 5`). Awareness gain uses the time since the last check, so the result does not depend on the rate.
- A global cap of rays per tick (start at 32) with a round-robin queue. A dino in `hunting` with a fresh sighting
  under 0.5 s old gets priority. Dinos with no player inside `sightRange` cast nothing.
- Target: under 1 ms per tick for all senses on the busiest island with 4 players, measured with the existing perf
  tests. If that is missed, lower the per-dino rate before cutting the cone or LOS.

### 3.2 Brains read perceived targets, not live positions

Brains get a perceived target from `senses.target(d, sys)`: `{ id, x, z, vx, vz, seen: boolean, age }`.
- While `seen` is true, `x/z` are the live position, so close combat stays tight and hit checks stay honest.
- When `seen` is false, `x/z` come from memory and the brain plays its search or investigate mode.
- `sys.nearestPlayer` stays, but only for non-perception uses (contact damage, crowding checks such as brachio
  `closeRadius`, plodder `angerRadius`, where touch-range awareness is fine).
- `attackPlayer` / `hitPlayer` still validate against the live player; perception never lets a bite land on a
  remembered position.

### 3.2a Downed players are never attacked (decided)

A downed player is never a target. Predators switch to the teammates who come to revive them. Today this holds
almost by accident: `downPlayer` sets `p.alive = false` (`world.js:486`), and brains skip players who are not alive.
The new layers must keep it explicit:
- `senses` gives no awareness to a downed player and drops them as a target. `hurtPlayer` already ignores a player
  who is not alive (`world.js:372`), so a wind-up that started before the player went down cannot finish them off.
  Keep that guard and cover it with a test.
- **Switch to revivers:** when a predator's target goes down, it picks the player whose `p.reviving.to` is that
  target, if it perceives them. A revive channel emits a quiet noise event at the body, so a predator nearby hears the
  rescue. If nobody revives, it takes the next perceived player. If there is none, it drops back to stalk or patrol.
- **No camping:** a predator never orbits or waits near a downed body. Slots around a reviver are placed at
  `attackRange + 2.5` from the *reviver*, and a predator with no living target leaves the body's area within a few
  seconds. Bleed-out is the cost of going down; dinos do not add to it.
- **Fairness for revivers:** reviving is dangerous, but not certain death. Attack tokens per target still apply, so a
  reviver faces at most `tokens` biters. A hit already cancels the revive channel (`world.js:388`). The director
  (phase 4) adds no new hunters during the revive; only predators already engaged may switch.
- **Herbivores** calm down when their attacker goes down and return within their leash. They do not go after revivers
  unless a reviver hurts the herd.

### 3.3 `src/sim/ai/utility.js` (phase 2)

A small helper module, not a framework:
- Curves: `linear`, `quad`, `logistic`, `step`, and `inv`, mapping an input to 0..1.
- `score(option, ctx)` multiplies its considerations, with a compensation factor so options with many inputs are not
  punished.
- `choose(d, options, ctx)` evaluates at `C.ai.thinkRate` (2-4 Hz, staggered by id). The current option gets
  `+momentum` and cannot be left before `minCommit` seconds, except by an override (hurt, trapped, target downed).
- Weights live in `CONFIG.dinos.<type>.ai.utility`, so tuning stays in `src/shared/config.js` beside the species
  numbers that are already there.

Each option maps to an existing or new mode of that brain. Utility only picks the mode and never moves the animal.

### 3.4 `src/sim/ai/pack.js` (phase 3)

Replaces the angle offset in `packHunterBrain`. It is kept per group in `sys.groups` (the pack object already exists).
- **Slots:** `k` points on a ring around the predicted target position. Ring radius is `attackRange + 2.5`. The ring
  rotates so one slot sits on the target's escape direction, its velocity. Slots that are not walkable or have no LOS
  to the target are dropped. Members are assigned greedily by distance, in ascending dino id (deterministic).
- **Attack tokens:** `C.ai.tokens` per target (raptor 2, gloom raptor 1). Holding a token is required to enter
  `ATTACK`. The token is released after the bite and the dart back. Members without a token orbit their slot and feint
  (a short dash in and out), which keeps pressure without a pile-on. Tokens are per *target*, so four players spread
  out each get at most N biters.
- **Roles:** driver, the member closest to the front, approaches openly and roars. Flankers take the slots behind the
  target's movement. Roles are reassigned when a member dies or falls far behind.
- **Regroup:** when the pack's members are more than `regroupDist` apart, or the summed HP of the pack drops below
  `regroupHp`, the pack falls back toward its leader or home, calls, and re-engages from stalk. `updateRaptorFear`
  stays for the individual flinch on a hit.
- **Fallback:** if fewer than two slots are usable (dense jungle, tunnels), use Muro's two rules: close in to the safe
  distance, keep `separation` from packmates.

### 3.5 `src/sim/ai/director.js` (phase 4)

One instance per `ServerWorld`, ticked from `DinoSystem.update` before the brains run.
- **Intensity per player** rises with damage taken, nearby hunting predators and being downed, and decays over about
  30 s. Phases are `buildUp → peak → relax`, as in Left 4 Dead.
- **Hunt budget:** the maximum number of predators in `chase` or `attack` at once, island-wide.
  `budget = base + perPlayer × (players − 1)` with `perPlayer < base`, so it grows slower than player count. During
  `relax` the budget drops. A predator over budget stays at `stalk`: it still watches and follows on sight, but holds
  distance and does not commit.
- **What it must not do:** spawn or teleport dinos, change damage, or override bosses (`alpha-sarcosuchus`) and raids
  (`raids.js` keeps its own logic and is not counted). It gates escalation only, so "predators hunt on sight" still
  holds: they always react.

### 3.6 Determinism, saves and protocol

- **RNG:** add a seeded `world.aiRng` (`makeRng` from `src/shared/rng.js`, seeded per island). All *new* AI code uses
  it, so tests can fix a seed and assert behaviour. Moving the existing 26 `Math.random()` calls over is a separate
  mechanical change; it is worth doing, but not as part of these phases. Do not assume reproducible runs until it is
  done.
- **Order:** token, slot and budget assignment must not depend on `sys.list` insertion order or `Map` iteration
  order across hosts. Sort by id where order matters.
- **Saves:** awareness, memory, tokens and director state are transient and rebuilt after a load (ordinary dinos
  respawn fresh, `worldSave.js`). This is a deliberate decision and should be noted in `src/sim/package-info.md`.
- **Protocol:** reuse `DS.ALERT`, `DS.ROAR`, `DS.CHARGE` where possible. New visible states (for example `SEARCH`,
  `THREATEN`) need a `DS` value and client work in `dinoViews.js` (animation choice and audio). Each phase lists it
  if it needs one. Flag bit `d.fl & 1` ("aggressive") keeps its meaning, because `towers.js` `hostile()` reads it.

### 3.7 Config shape

New tuning goes under `CONFIG.dinos.<type>.ai`. Existing flat fields (`sightRadius`, `giveUpRadius`, `chaseTime`)
stay until the phase that replaces them deletes them.

```js
raptor: {
  // ... existing fields ...
  ai: {
    senses: { sightRange: 34, fov: 1.4, hearing: 1, memoryTime: 20, gain: 1.2, decay: 0.25 },
    utility: { thinkRate: 3, momentum: 0.15, minCommit: 1.5, weights: { stalk: 1, chase: 1.1, attack: 1, regroup: 0.8 } },
    pack: { tokens: 2, ring: 4, regroupDist: 25, regroupHp: 0.35 },
    chase: { commitMin: 4, giveUpNoGain: 5, leash: 90 },
  },
},
```

### 3.8 Reused helpers

`sys.steer`, `move`, `halt`, `turnTo`, `strafe`, the private `#detour` and `findPath` (`src/sim/pathfind.js`, bounded
by `MAX_NODES`), `randomWalkablePoint`, `fleePoint`, `distTo`, `cue`, `attackPlayer` / `hitPlayer`, `roar`,
`inSafeZone`, `sys.groups`, `updateRaptorFear`, `spawnPack`, `territorial.js` (`makeTailSweep`, `rearYaw`,
`grazeWander`), `lineBlocked`, `carriesLight`, `world.sightMul`.

---

## 4. Behaviour per species

Predators hunt on sight. Herbivores defend with a clear escalation (notice → threaten → strike), keep a **leash**
(the furthest they chase from where the threat began, or from the herd centre), and then return. "Hurting the herd"
means any herd member taking damage. That sets the whole herd to at least `alert` on the attacker, with a memory entry.

| Species | Role | Perception | Behaviour (target) | Changes from today |
|---|---|---|---|---|
| **Raptor** | Pack hunter | Cone 160°, sight 34 m, good hearing | Stalks in cover while `suspicious`, calls the pack, surrounds with slots, bites in turns with tokens (2), feints, pursues with lead, searches last position, regroups when hurt | Replaces flank offset, live tracking and the fixed give-up radius |
| **Gloom raptor** | Cave pack hunter | Nearly blind (12 m), hearing through noise events, torch light ×2 | As raptor with 1 token; strongly drawn to noise and torches, investigates the *noise spot*, fits low tunnels | Uses noise events; `noticesLight` live; head room from `height` (weakness 9) |
| **T-Rex** | Lone apex | Cone 120°, sight 40 m, hears gunshots ~120 m | Patrols, investigates shots, roar + ground-shake telegraph before a charge, pursues with lead, pushes through thin trees, searches last position, chase economics instead of `chaseTime` | Noise events, memory/search, economics |
| **Pteranodon** | Aerial opportunist | Wide cone from above, LOS from altitude | As today (dives) but targets by utility with HP as a fraction, leads moving targets on the dive | Weakness 10 fixed; lead on dive |
| **Alpha Sarcosuchus**, **Sump Lurker** | Ambushers | Water-edge sight + ripples (noise) | Unchanged mode machines; commit once, reset; may hear shots and reposition underwater | Senses only; bosses not under the director |
| **Brachiosaurus** | Herd giant | Short cone | Herd turns to face; threat: rear-up and roar at ~12 m; stomps at `closeRadius`; when a member is hurt, adults close ranks round the injured one while the herd drifts away; leash ~20 m | Escalation + herd memory; keeps its stomp |
| **Triceratops** | Herd defender | Cone 140°, sight 25 m | Head-down threat with horn toss and ground paw at ~15 m; short charge (≤ 25 m leash, committed line, dodgeable); herd forms a front toward the threat | **Own brain** (`triceratops.js`), no raptor bites |
| **Ankylosaurus** | Armoured tank | Poor sight 15 m | Does not flee. Turns its rump, club swing (`makeTailSweep`) when close, a few steps' charge, very short leash (~10 m) | **Own brain** using `territorial.js` |
| **Pachycephalosaurus** | Skittish rammer | Cone 180°, sight 30 m, good hearing | Flighty: runs from a group, but a lone player who closes in gets a telegraphed head-butt charge with knockback; leash ~30 m | **Own brain** |
| **Stegosaurus** | Territorial | As today, plus LOS | Current anger/charge/tail kept; anger now needs a perceived intruder; leash from its territory | Perception only |
| **Crystal Plodder** | Cave herbivore | Ripple noise | Current behaviour kept (never leaves its hall); torch light makes it notice from further | Perception only |
| **Dilophosaurus** | Spitter | Cone 160°, sight 28 m | Keeps distance, frill display, blinding spit (projectile), retreats when rushed | Needs a projectile and client effect: **separate PR after phase 3** |
| **Spinosaurus** | Water-edge ambusher | Sight 30 m, ripples | Waits at river and lake edges, lunges at players in or near water, short land chase | Reuses `aquatic.js`: **separate PR after phase 3** |

Herbivore fights stay fair because:
- Every herbivore strike is telegraphed (threat display, wind-up) and dodgeable by sprinting or side-stepping.
- Leashes are short, so a player who backs off is safe.
- Ranged attacks from beyond the leash still work, but the herd **remembers** the shooter and drifts out of range
  instead of standing still. You have to stalk, not camp.

---

## 5. Phased rollout (one PR each)

Each PR follows `AGENTS.md` (own worktree and branch, `npm test`, `npm run test:coverage`,
`npm run coverage:gaps`, `git diff --check`, and package-info updates for every new file).

### Phase 1: senses + memory
Scope: `senses.js`; the `lineBlocked` spatial grid; the noise event API in `world.js` and `dinos.js`; brains read
`senses.target`; gloom raptor moved onto noise events; `noticesLight` live. Fix weaknesses 7 (one safe radius used by
both `walkable` and `inSafeZone`), 8 (`canReach` also checks terrain and rocks) and 9 (head room from `height`).

Tests:
- `lineBlocked` grid equals the brute-force version over random segments on every island.
- Seen in the open, not seen behind a hill, behind a big trunk, behind a boulder, or through the cave roof.
- Not seen behind the dino (cone), but heard when sprinting there.
- A gunshot raises awareness within its radius only, and the memory holds the noise spot, not the player.
- A downed player gets no awareness and takes no damage, even when a bite wind-up was already running.
- A predator whose target goes down switches to a perceived reviver, or else to the next perceived player. With
  nobody left, it leaves the body's area and does not orbit it.
- Memory: lose sight → go to the predicted spot → search → forget after `memoryTime`.
- Stalker and ash rain still shorten sight.
- A torch makes the gloom raptor notice from further.
- Safe zone: no reachable-but-targetable ring.
- Perf: the senses step stays under budget with 4 players on the busiest island (ray cap respected).

### Phase 2: utility layer + herbivore brains
Scope: `utility.js`; `triceratops.js`, `ankylosaurus.js`, `pachycephalosaurus.js` replace their `TEST_BRAINS` entries;
brachio and stego get escalation, herd memory and leashes; T-Rex chase economics; ptera HP fraction (weakness 10).
Possibly `DS.THREATEN` plus client animation hookup.

Tests:
- Curves and `choose` with momentum and min-commit (no flicker between two close scores).
- Each herbivore: walking past at distance → no reaction; at warning radius → threat display; closer → strike.
- A hit on one herd member alerts the herd.
- Chase stops at the leash, and the herbivore returns home.
- A sniper outside the leash makes the herd move away.
- T-Rex abandons a chase that does not close.
- Ptera prefers 40/150 over 60/100 correctly by fraction.

As built (`test/dino-utility.test.js`):
- The three herbivores share `src/sim/ai/defender.js` (utility options graze, watch, threaten, strike, return, avoid,
  flee); `triceratops.js`, `ankylosaurus.js` and `pachycephalosaurus.js` add only their strike. The Triceratops now
  spawns as a herd of 2.
- No new `DS` value: the threat display reuses `DS.ROAR` (the Pachycephalosaurus plays its Roar challenge clip, the
  others the procedural roar overlay), so no client or protocol change was needed.
- The horn thrust and head-butt hit times come from the clip timings in the `art/sources/<type>/README.md` files. The
  Ankylosaurus club sweep is an estimate from those timings, not measured from the baked clip like the stego's
  `SWEEP`; measure it when the clip changes.
- T-Rex: `chaseTime` is gone, `ai.chase` and `chaseWorth` replace it. The Stegosaurus and Brachiosaurus got
  `ai.senses` (anger, threat display). The Crystal Plodder is unchanged (its torch reaction is still open).

### Phase 3: pack tactics
Scope: `pack.js`; `packHunterBrain` uses slots, tokens, roles and regroup; pursuit with lead.

Tests:
- Never more than `tokens` pack members in `ATTACK` on one target.
- Slots cover the target's escape side.
- Assignment is the same for the same inputs regardless of `sys.list` order.
- A blocked-slot fallback still closes in.
- The pack regroups below `regroupHp`.
- Lead is capped (a player who juke-turns is not hit by a perfect prediction).
- On a downed target, the pack's slots and tokens move to the reviver, and never more than `tokens` attack them.

As built (`test/dino-pack.test.js`):
- Tokens are per target island-wide (`sys.tokens`), not per pack, so two packs on one player share the budget.
- The driver goes straight in when it may bite and otherwise holds the ring distance in front; ring members without a
  token hold their slot (facing the target) and feint now and then. Slots are offsets that move with the target and
  are reassigned every 0.5 s.
- A slot on a slope is allowed (only water, cliffs and the camp drop it). The hurt regroup happens once per hunt;
  regrouping for spread at most every 20 s.
- `perceived` now carries the measured velocity while a player is seen (it was 0), for the escape slot and the lead.

### Phase 4: director
Scope: `director.js`; intensity, budget and phases; bosses and raids excluded.

Tests:
- The budget caps simultaneous chasers island-wide.
- 1 vs 4 players: the budget grows sublinearly.
- Relax after a downed player lowers it.
- Predators over budget still stalk (on-sight reaction holds).
- Bosses and raiders are ignored.

As built (`test/dino-director.test.js`):
- `sys.director` lives on the `DinoSystem` and is ticked right after the senses. Brains ask `mayHunt` every tick
  they chase or attack; a place goes stale 2.5 s after the last ask (a raptor's fright lasts up to 2 s), and a
  pack hunter with no target any more or a T-Rex that gives up frees it at once.
- Held back: raptors stalk at 14 m (`STALK_DIST`) and do not search closer than that, the T-Rex gets a `stalk`
  mode at about 20 m, the pteranodon keeps circling. Searching an unseen target does not take a place.
- Leashed animals (the grove titan, arena bosses) are not counted, besides raiders and non-predators.
- Tuning in `CONFIG.ai.director` (base 4, +1.5 per extra player, half while relaxing, +1 after a quiet minute).

---

## 6. Risks and open questions

- **CPU (high).** LOS is the dominant cost (see section 2). Without the grid and the stagger, phase 1 must not ship.
  The solo Web Worker shares the device with the renderer, and Swamp and Volcano already miss the 120 FPS gate
  (`docs/performance-testing.md`). Measure in the worker, not only in Node.
- **Co-op fairness (high).** More perceptive dinos must not feel like cheating. Every escalation needs an audible or
  visible cue: an alert huff, a head turn, a roar. Tokens are per target so one player is not swarmed while three
  watch. The director must not starve a lone player of action. Downed players are never attacked, and predators switch to
  the revivers (decided, see 3.2a). The remaining risk is that reviving becomes too deadly. Watch it in playtests and
  lower the tokens on a reviver before touching the rule.
- **Determinism (medium).** See 3.6. Until the existing `Math.random()` calls move to `world.aiRng`, tests must avoid
  asserting on paths through old code that rolls dice.
- **Difficulty creep (medium).** Smarter and more dangerous at the same time can overshoot. Each phase should ship
  with config weights that keep today's kill and death rates in internal playtests. Tune up afterwards, not in the
  same PR.
- **Stuck and edge cases (medium).** Search points and slots must use `walkable` and the cave clearance, or dinos will
  wedge at cave mouths and cliff rims. The existing stuck nudge (`onStuck`) must reset search and slot state too.
- **Hotspots shared with other agents.** `dinos.js` and `world.js` are coordination hotspots per `AGENTS.md`. Keep the
  edits small (a noise call per source, a senses call per dino) and put the logic in the new modules.
