# Modelling + painting guide

## Contents
1. Look the owner wants
2. Building the body
3. Building the head (the part that sells the creature)
4. Teeth, eyes, claws, spikes
5. One fluid mesh: fusing head, jaw and neck
6. Skinning
7. Paint
8. Budgets and scale

---

## 1. Look

- Comic, chunky, **smooth** stylised 3D (the owner says "comic/lowpoly" but approved smooth,
  rounded, non-faceted models; `map-design-rules` forbids visible triangles). Exaggerated big
  heads, thick thighs, readable silhouette from 50 m.
- **Predators scary:** wedge skull, heavy brow ridge slanting down toward the snout, eye sunk
  under the brow, angry upper lid covering ~45 % of the eye, slit pupil, dark eye mask, snarl with
  a red gum line showing above the teeth, horns/knobs behind the brows, dorsal spikes.
- **Herbivores friendly/majestic:** round amber eyes with a soft lid, gentle smile line, small peg
  teeth, smooth crest, cream underside.
- Every species gets its **own palette and pattern** (raptor: olive back, orange flanks, tiger
  stripes; T-Rex: grey hide with dark mottling; brachio: slate grey with freckles and wrinkle
  bands). Never reuse a palette the owner already associates with another dino.
- Follow the user's reference images for proportions/colour, translated into this comic style.

## 2. Body

- **Small/medium theropods** (author at raptor scale, ~3 m long): `skin_body()` — a Skin
  modifier skeleton of nodes (x, y, z, rx, rz) + Subsurf 3. Root at the hip. Thighs are big
  drumsticks (rx ≈ 0.2-0.25), shins slim, ankle ~0.05-0.08, a solid foot "ball" node and thick toe
  nodes so the toes read as part of the foot (thin toe nodes look like loose balls).
- **Big creatures** (brachio at real 13 m): the Skin modifier collapses into boxes when radii
  overlap → use `tube_path()` for the trunk (tail → body → neck as ONE spline) and separate pillar
  legs that **start deep inside the body, narrow at the top** so no rim shows, then join.
- The neck top must run up INTO the back of the skull (last neck node inside the head, at about
  the head's mid-height). A neck that ends under the skull reads as "head on a pipe".
- Model facing **-Y**, Z up, origin between the feet on the ground.

- Limbs on big bodies: thick leg/arm tubes (`tube_ref`) starting inside the trunk, then
  `union_fillet` into the fused body so no rim shows. Keep the joint path bends gentler than the
  tube radius.
- **Membrane wings:** arm tube (shoulder, elbow, wrist, long finger) + a thin closed slab between the
  arm's leading edge and a swept trailing edge back to the hip (arc-length resampled curves, slight
  billow, thickness ~3 cm at the arm -> ~6 mm at the edge, store `mu`/`mv` per vertex for paint).
  Skin the slab by distance to the wing bones + Body with a WIDE sigma (~0.18 m) so it stretches.

- **Sprawled legs (crocodilians, lizards):** never in a vertical plane under the body. Joint
  low on the body side (~0.7 of the half-width), upper limb out and down to the elbow/knee about
  1.4x the half-width out, lower limb near-vertical, foot turned out with fanned toes, flat sole.
  Build the limb tube with `tube_ref(..., ref=(0,1,0))` (the default X frame degenerates on a
  sideways bone). IK poles go OUTSIDE the knee (`knee + side*3 m` in X), and search the pole angle
  (720 steps) for zero rest error instead of assuming ±pi/2.
- **Keep the runtime fit uniform.** A catalog `width` (non-uniform X scale) shears every bone that
  points sideways: sprawled feet missed banks by ~5 cm in `conformFeet`. Build extra width into
  the meshes (scale X after painting, before rigging, and update the shared joint data) instead.

## 3. Head

- Build the skull with `loft2()` from ~10 cross-sections, each a 9-point half profile:
  `(0,top) → brow → brow overhang → eye socket → cheek → lip → under-lip → palate → (0,bottom)`.
  This gives a flat-topped wedge with a real brow overhang; a superellipse loft gives a dome
  ("duck head", too cute).
- The lower jaw is its own loft: narrower than the upper lip (so upper teeth overlap it like an
  overbite) and deepest at the back (jaw muscles).
- Then `sculpt()` low-frequency gaussian bumps: brow ridge along a segment slanting down to the
  snout, eye-socket dent, cheek/jaw-muscle bulge, small nasal knobs, a slight lip lift over the big
  fangs. Never per-vertex noise.
- Subsurf shrinks the cage ~10 %: model the cage oversize, and measure the evaluated mesh (not the
  cage) for anything that must sit on the surface.
- T-Rex trick: reuse a good skull by mapping it (`MAPP`: wider ×1.32, longer, taller ×1.3) and
  blunting the front sections (×1.25-1.6), tapering the back two sections so the skull blends into
  the neck.

## 4. Teeth, eyes, claws, spikes

- Teeth: `horn_bm` cones, curved slightly back, sizes alternating, 1-2 bigger fangs. **Root every
  tooth in the measured lip line** (`lip_at()` on the evaluated head/jaw), base 3 cm inside the
  gum, and stop the row before the snout tip (teeth past the tip clump and stick forward).
- Eyes: use `eyes.py` (`build_eyes` + `paint_eyes`), never a ball + button pupil + cap lid (the owner
  called those lifeless). See §4b.
- Claws/spikes: `horn_bm` with the 'ht' layer for base→tip gradients (`paint_t`). Dorsal spikes:
  ray-cast the body top (`scene.ray_cast`) for their bases; flatten sideways (`flat=0.4-0.55`).
- All of these are separate rigid islands (one bone each) — that's fine because they are small and
  embedded. The skull, jaw and neck are NOT (see §5).

## 4b. Living eyes (`eyes.py`)

Why the old eyes looked dead: flat single-colour ball, black bump pupil, a lid that sat on top like a
hat, no highlight. `build_eyes(prefix, E)` / `paint_eyes(prefix, E, P, gloss, skin)` fix all four:

- **Catchlights:** two white glints (big front-top, small opposite) on the gloss material. The single
  biggest gain; they read even at preview distance. Keep them inside the lid opening (move them down
  when the opening gets slimmer, or the upper lid hides them).
- **Lids wrap the ball:** an almond opening (`W`, `Ht`, `Hb` in units of R); the ball outside it is
  painted as lid skin and uses the skin material; a rolled rim (`rim` = upper, lower thickness), heavy
  upper lid, thin lower lid.
- **Mood = `tilt`:** `+` lifts the back corner / drops the snout-side corner = angry (owner wants
  "a bit angry": Triceratops `Ht .42, Hb .5, tilt .24`); `-` = droopy/sad. The sign was wrong once and
  produced a sad face - check a close-up from the side.
- **Iris:** limbal ring, radial streaks, glow ring round the pupil, shadow under the upper lid.
- **Pupil:** a curved disc lying on the ball (crisp at any ball density). Round for herbivores
  (`pupil=(.27, .3)`), slit for predators (e.g. `(.09, .34)`).
- Eye radius ~0.14 at 8 m body length; sink the centre ~0.045 below the measured head surface.
- Rigid on Head like before (Eyes, Lids, Pupils, Glints). Cost ~2.5k triangles for both eyes; near the
  60k budget pass `ball=(24, 16), rimseg=(40, 6)` (brachio).
- Presets the owner approved (Oct 2026):

  | Species | Ht / Hb | tilt | pupil | mood |
  |---|---|---|---|---|
  | Triceratops | .42 / .50 | .24 | round (.27, .30) | grumpy / a bit angry |
  | Stego | .48 / .56 | .16 | round | grumpy-calm |
  | Brachio | .56 / .62 | .06 | round | gentle |
  | Raptor, T-Rex | .38 / .50 | .34 | slit (.09, .34) | angry predator |
  | Ptera | .40 / .50 | .32 | slit (.10, .34) | angry predator |

## 5. One fluid mesh (head, jaw, neck)

The owner rejected every version where the head was a separate piece on the neck, and the version
where the lower jaw was separate ("edge/gap between head and neck, looks not attached").
Use `fuse.py → fuse_head(body, head, jaw, corner_y, mouth_z)`:
exact boolean union of body + skull + jaw; ahead of the mouth corner the jaw top is pressed just
under the skull (ray cast) so the lips never weld; a Smooth modifier on a seam group fillets the
neck/skull and neck/jaw junctions (never the lips); region groups `rg_head`/`rg_jaw` drive paint
and skinning. Then check, closed AND with the jaw at 1.0 rad: no webs between the lips, no torn
palate, cheek skin stretching smoothly.

Dead ends: voxel remesh (dropped the Skin-modifier trunk), boolean slit cutter (boxy planes and a
stray sheet), soft head/jaw split (upper lip followed the jaw and tore the snout).

## 5b. Lower jaw and mouth (owner: "not happy with the bottom jaw")

Researched against creature-topology guides (lips roll inward, an inner mouth so an open mouth never shows
empty space, a jawline from chin to ear) and ceratopsid jaw anatomy (deep dentary, deepest at the back,
separate pointed predentary beak). Rejected version: a round "sausage" loft with a flat top that hung
like a pouch under the snout.

- **Cross-section** (front to back, half profile from the top centre): mouth trough centre
  (`MOUTH - 0.08`) -> inner lip edge -> thin cutting lip at the mouth line (0.8 w) -> outer lip ->
  widest flat side (1.0 w at a third of the depth) -> narrowing side -> jawline keel (0.5 w, 0.18 w)
  -> bottom centre. The trough fades out at the beak tip and at the hinge.
  `mouth.py` `jaw_prof(w, bot, mouth, trough)`; trough depth ~1/8 of the jaw depth, faded with
  `trough_fade(y, tip_y, hinge_y)`.
- **Side profile:** shallow (~0.3 m at 8 m length), straight bottom edge rising toward the front,
  deepest under the cheek. Lower jaw narrower than the upper lip at every section (overbite).
- **Beak/snout tip:** the lower tip ends BEHIND the upper beak's hook, otherwise the boolean welds them
  and a strand of skin stretches between the beak tips when the mouth opens.
- **Tongue:** `add_tongue` - a flat blob in the trough, top just under the lip line (hidden when closed),
  rigid on Jaw.
- **Separate rigid jaw (brachio):** the trough shows from the front because no skull covers it - keep it
  shallow and paint its walls mouth-coloured.
- **Predators:** the lower teeth root in the new cutting lip (`lip_at` on the evaluated jaw re-roots
  them automatically); no cheeks - the gape runs back to the corner.
- **Lip gap scales with size:** `fuse_head(lip_gap=...)` 0.006 at raptor scale, ~0.02 at 8 m.
- **Cheeks (herbivores):** put the mouth corner well forward (Triceratops `corner_y` -3.45 of a
  beak at -4.1) and blend Head -> Jaw weights over a band round the lip line behind it (`mouth.py` `cheeks()`, after
  `head_jaw_regions`; band ~0.2-0.26 m at 8-9 m length, narrower bands tear the corner), so the mouth
  does not split open to the hinge.
- **Paint:** mouth colour in the trough and on the palate, beak colour on the cutting lip.
- **Verify:** close-ups at jaw 0 and 0.52 rad (the game's roar overlay) from side, 3/4, front and
  below; `check_glb.mjs` prints `jaw skin N verts` (must be hundreds); `ground_report` again - a jaw
  that really opens can push the lower beak below the ground in grazing/run poses.

## 6. Skinning

- Bone heat (`ARMATURE_AUTO`) is fine on clean meshes but **fails on fused/boolean meshes**
  ("Bone Heat Weighting: failed") and leaves thousands of verts unweighted → use
  `distance_weights()`.
- Then `crisp_chain()` for every limb below the thigh/shoulder (σ ≈ 0.015-0.025 at raptor scale),
  then `head_jaw_regions()`. Remove stray `Jaw`/`root` influence from the body before that.
- `set_weights` must keep the fuse region groups (`rg_*`): `distance_weights` runs before
  `head_jaw_regions`, and wiping them left stego and ptera with NO jaw skin (mouth never opened).
- `check_weights()` must return 0. A single unweighted vertex shows up as a long spike in poses.
- Rigid parts: `rigid_islands()`; claws on the same bone as the skin around them.

- Limbs unioned into a trunk: skin the trunk on the spine only, then `limb_weights` per limb
  (fade = outside-the-trunk x near-the-limb). Then `limit_influences` (glTF keeps 4).

## 7. Paint (vertex colours only)

- `countershade()`: back → flanks → cream belly by normal.z with fbm drift, plus ONE pattern
  (stripes or mottling). Accents: eye mask, lip band, red gum line, dark nostril slits (paint, not
  bumps), darker scaly lower legs, light toenails, spike tips.
- Mesh density limits pattern detail — subdivide the body enough (raptor body ~17k verts) or the
  stripes look blocky.
- **The game's lighting is much darker than Blender's Material Preview.** A grey that looks right
  in Blender is near-black in the game. Judge colours in the dino preview page and brighten
  (the T-Rex back ended at #686c67, flanks #9b9e96). Compare against an approved dino side by side.
- Two materials only: matte skin (rough ~0.6) + gloss (eyes, teeth, claws, rough ~0.2), both
  reading colour attribute `Col`.

## 8. Budgets and scale

- ≤ 60k triangles per dino (test enforces). Raptor 53k, T-Rex 48k, brachio 58k. Subsurf levels are
  the main lever; bump detail where it shows (head) not everywhere.
- Author theropods at raptor scale; the game fits the GLB to the catalog's height/length uniformly,
  so set catalog height = raw height × (length / raw length). Brachio was authored at real scale.
