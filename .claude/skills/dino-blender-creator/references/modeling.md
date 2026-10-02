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
- Eyes: glossy blob + pupil blob placed on the eye surface along the eye's outward axis; angry lid
  blob rotated so its lower edge slants down toward the snout. Eye sits in the socket, not on top.
- Claws/spikes: `horn_bm` with the 'ht' layer for base→tip gradients (`paint_t`). Dorsal spikes:
  ray-cast the body top (`scene.ray_cast`) for their bases; flatten sideways (`flat=0.4-0.55`).
- All of these are separate rigid islands (one bone each) — that's fine because they are small and
  embedded. The skull, jaw and neck are NOT (see §5).

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

## 6. Skinning

- Bone heat (`ARMATURE_AUTO`) is fine on clean meshes but **fails on fused/boolean meshes**
  ("Bone Heat Weighting: failed") and leaves thousands of verts unweighted → use
  `distance_weights()`.
- Then `crisp_chain()` for every limb below the thigh/shoulder (σ ≈ 0.015-0.025 at raptor scale),
  then `head_jaw_regions()`. Remove stray `Jaw`/`root` influence from the body before that.
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
