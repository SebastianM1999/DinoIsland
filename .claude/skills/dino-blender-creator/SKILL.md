---
name: dino-blender-creator
description: Create, redesign, recolour, fix or re-animate a dinosaur (or any creature) for Dinosaur Island in Blender through the Blender MCP, and ship it as a game GLB. Use this whenever the user wants a dino model, a new dino variant/kind, better-looking dino heads/skins/textures/teeth, smoother or fixed dino animations (walk, run, attack, roar, stomp, death, idle), fixes for heads that look detached, buggy claws or rubbery legs, or mentions Blender together with raptor, T-Rex, brachio, stego, ptera or any creature — even if they don't say "skill" or "Blender" explicitly (e.g. "make the stego look better", "the trex walk looks off").
---

# Dino Blender Creator

Builds comic, chunky, smooth, vertex-coloured dinosaurs in live Blender (Blender MCP), rigs them
with IK-planted feet, bakes clean clips and ships them into the game's GLB pipeline. Everything
here was learned the hard way on the raptor, brachio, T-Rex, stego and ptera — the owner rejected several
intermediate versions. Follow the rules and you skip those rounds.

Also read `map-design-rules` (art style source of truth) when it is available.

## Reference material (load when needed)

| Read | When |
|---|---|
| `references/modeling.md` | before modelling/painting/skinning anything |
| `references/animation.md` | before writing or changing ANY clip (game constraints, principles, gait numbers, recipes) |
| `references/integration.md` | when putting the GLB into the game, tests, git |
| `scripts/lib.py` | shapes (`loft2`, `tube_path`, `tube_ref` (bent limbs/wings: never twists), `skin_body`, `horn_bm`, `blob_bm`, `sculpt`, `lip_at`), paint (`paint`, `paint_t`, `countershade`, `vc_mat`) |
| `scripts/anim.py` | rig building (`bone`, `theropod_leg_ik`, `quad_leg_ik`), posing (`rot`, `loc`, `track`, `chain`), gaits (`biped_leg`, `quad_leg`, `LATERAL`, `follow_body`), baking (`sample`) and checks (`min_z`, `max_step`, `ground_report`) |
| `scripts/fuse.py` | `fuse_head()` + `paint_regions()` — head, jaw and neck as ONE mesh; `union_fillet()` — limbs grown out of the trunk |
| `scripts/eyes.py` | `build_eyes` / `paint_eyes`: living eyes (almond lid opening, rolled lid rim, painted iris, pupil disc, catchlights; `tilt` sets the mood) |
| `scripts/mouth.py` | `jaw_prof` (keel profile, inward lip, trough), `trough_fade`, `add_tongue`, `cheeks` (Head->Jaw blend behind the mouth corner) - see `references/modeling.md` §5b |
| `scripts/weights.py` | `distance_weights`, `crisp_chain`, `limb_weights` (limbs unioned into a trunk), `head_jaw_regions`, `rigid_islands`, `check_weights`, `limit_influences` (glTF = 4) |
| `scripts/views.py` | `s_views()` / `s_clip_sheet()` — ortho-camera model views and 8-frame clip sheets you can Read (use these; `sheet.py` viewport renders mis-frame) |
| `scripts/export.py` | `export_dino()` — clean deform-only rig, one skinned mesh, `<Source>_<Clip>` actions, GLB |
| `scripts/check_glb.mjs` | validate the GLB through the game's own loader (strides, seams, jaw, knee steps, tris) |
| `scripts/hit_coverage.mjs` | % of the surface inside the client hit spheres + where the misses are (aim ≥ 95 %) |

Existing sources to copy patterns from: `art/sources/raptor/` (theropod template, rebuild with
`rbuild`, variants via `VARIANT`), `art/sources/trex/` (fused head+jaw+neck, roar clip),
`art/sources/brachio/` (big quadruped with spline tubes, stomp), `art/sources/stego/` (quadruped with
limbs union-filleted into the trunk, `limb_weights`-style skinning, plates, attack hitbox measured from
the clip), `art/sources/ptera/` (FLYER: membrane wings, flight clips, in-air Fall + impact Death,
game `flyer` branch). Each `.blend` holds its build
scripts as text blocks and a `scripts/` mirror.

## Setup and Blender MCP traps

- MCP server must be `uvx --native-tls blender-mcp` on this machine (TLS interception).
- **Never call `bpy.ops.wm.read_factory_settings`** — it unloads the addon and kills the
  connection. Clear the scene by deleting objects instead. If Blender is disconnected, restart
  Blender (the addon auto-starts its server on port 9876).
- Python globals do **not** persist between `execute_blender_code` calls. Put every build step in a
  `.blend` text block and `exec(bpy.data.texts['name'].as_string(), globals())` it. Load the bundled
  scripts into text blocks once (`lib`, `anim`, `fuse`, `weights`, `views`, `export`).
- Text blocks share one namespace when exec'd together: avoid generic names (`T`, `s`, `P` were all
  clobbered once). Prefix data constants per species.
- Long builds can drop the MCP connection mid-call yet finish; re-check state with a short call.
- Hide old export collections before judging a new build (overlapping meshes fooled us once).
- Blender restarted (empty unsaved file, `save_mainfile` fails)? `bpy.ops.wm.open_mainfile(filepath=...)`
  is safe (unlike factory settings) — reopen the species' .blend before building.
- Purge orphan meshes/armatures in the master build (`users == 0`), or the export mesh is renamed
  `<Source>.001`.
- Author scripts as files in `art/sources/<type>/scripts/NN_name.py` and load them into text blocks
  (`text.from_string(open(...).read())`) before each run: the mirror is then always current.

## Workflow

1. **Understand the brief.** Look at every reference image the user gives (open URLs in the
   browser pane and screenshot). Note proportions, palette, head features. Read the species'
   config in `src/shared/config.js` (speeds, attacks, windups) and its catalog entry.
2. **New `.blend`** in `art/sources/<type>/` (copy the closest existing one and clear objects;
   keep library text blocks). Work in a fresh scene; never overwrite another species' file.
3. **Body** (`skin_body` or `tube_path`), **head** (`loft2` profiles + `sculpt`), **jaw**,
   then **fuse** (`fuse_head`). Show the user a side + 3/4 screenshot of the grey model early —
   proportions are cheap to change now, expensive later.
4. **Details:** teeth rooted with `lip_at`, eyes with `eyes.py` (catchlights, lid opening, tilt), lower jaw
   with `mouth.py` per `references/modeling.md` §5b (jawline keel, inward lip, mouth trough + tongue), claws, spikes/scutes/plates.
5. **Paint** (`countershade` + species pattern + head accents, `paint_regions` for the fused mesh).
6. **Rig:** bones in the YZ plane, Jaw roll flipped, IK legs; verify the rest pose is unchanged by
   IK (print joint positions) before animating.
7. **Skin:** `distance_weights` → `crisp_chain` (legs, arms) → `head_jaw_regions`;
   `rigid_islands` for parts; `check_weights()` == 0.
8. **Animate** following `references/animation.md`. After every change: `ground_report`,
   `max_step`, contact sheets (Read them!).
9. **Export** with `export_dino`, then `check_glb.mjs`; fix and repeat until clean.
10. **Look at it in the game** preview page with every state, compare with an approved dino.
11. **Integrate** (catalog, tests, manifest, docs, barHeight), `npm test`, commit only your files
    on the branch the user wants, never push. Save a master build script so the whole dino
    rebuilds from an empty scene, and mirror the scripts + README.
12. Show the user, ask for feedback, iterate. **Always end the final report with the review URL**: the
    running game preview link the owner can click, e.g.
    `http://localhost:<port>/src/client/models/dino/preview.html?type=<type>&state=walk&view=three-quarter`
    (keep that server running; in a worktree the preview tool only starts the main checkout's server, so
    start the worktree's server on its own port). Also give the PR URL if one was created. The owner wants
    this link every time the agent finishes coding, without asking.

## Design rules (short version — details in references)

- Smooth, chunky, comic, readable from 50 m; no faceting; vertex colours only; ≤ 60k tris.
- **One continuous body:** skull, lower jaw and neck are one fused mesh; only lips separate.
- Predators look scary (heavy slanted brow, sunk slit-pupil eyes under angry lids, snarl with a red
  gum line, big fangs); herbivores look gentle (round eyes, soft lids, smile, peg teeth).
- Each species has its own palette and pattern. Tune colours under the game's darker lighting.
- Teeth emerge from the gum line and sit inside/over the jaws; nothing floats, nothing shows a base.
- Limbs hinge at joints (crisp weights); claws move with their hands/feet.
- Feet planted, no sliding at catalog speeds; no part below the ground in any pose.
- Animations: weight, overlapping action, head stabilisation, anticipation → strike → settle,
  idle with holds; small parts move slowly; leave room for the game's jaw/head overlays.

## Never again (owner-visible mistakes)

| Symptom the owner saw | Cause | Rule |
|---|---|---|
| "head not attached", edge between head and neck | rigid head object on a thinner neck; separate jaw ending at the throat | fuse skull + jaw + neck (`fuse_head`), neck top inside the skull |
| teeth "not inside the mouth", fence of teeth | teeth placed on the loft cage; rows past the snout tip; jaw wider than the upper lip | `lip_at` on the evaluated mesh, roots 3 cm in the gum, stop before the tip, narrower jaw |
| buggy/jittery hands and claws | arm skin smeared into the chest; fast hand flexing | `crisp_chain` for arms, claws on Hand, slow small arm motion |
| rubbery legs | wide automatic weight blends | `crisp_chain` for legs |
| duck/dog-like cute predator head | superellipse dome skull, big round eyes | profile-loft wedge skull, brow ridge, sunk eye, angry lid |
| T-Rex looked like the raptor | same palette/pattern | distinct palette + pattern per species |
| nearly black dino in game | judged colours in Blender Material Preview | judge in the game preview, brighten |
| knee/elbow snap, test failure | leg reaching full extension | reach ≤ 95 %, crouch, shorter sweep |
| jaw opening upward | default bone roll | `bone(..., flip=True)` for Jaw |
| twisted/crumpled knees, crease ring at the elbow | `tube_path` frame flips on bent limbs; bend tighter than the radius | `tube_ref` with a fixed axis; soften the joint path |
| rim/edge where leg or arm enters the body | limb tube just overlapping the trunk | `union_fillet` (then clear stray `rg_*` weights behind the head) |
| skin torn along straight edges in strong poses; belly dragged down by swinging legs; feet 1.9 m under ground | box-selected / height-faded / `side_x` limb weights | `limb_weights`: trunk-membership x distance-to-limb fade |
| red mouth-paint specks on the thighs | boolean union gave leg verts head-region weights | `union_fillet(..., head_back_y=...)` |
| mouth never opens although the Jaw bone turns (stego, ptera, first triceratops) | `set_weights` wiped the `rg_*` groups before `head_jaw_regions` | keep `rg_*` (fixed in `weights.py`); `check_glb.mjs` prints `jaw skin` |
| lower jaw like a fat sausage / pouch under the snout | round loft profile, flat top, too deep | §5b profile: flat sides, jawline keel, inward lip, trough + tongue |
| strand of skin between the beak tips when open | lower tip inside the upper hook (welded) | lower tip ends behind the hook; scale `lip_gap` |
| mouth splits open to the hinge, see-through | mouth corner too far back | herbivores: corner forward + `cheeks()` |
| rebuild overwrote another checkout's GLB | hard-coded absolute output path in the build script | output path relative to the .blend |
| over 60k after adding eyes/tongue (brachio) | default eye/tongue resolution | `E['ball']`, `E['rimseg']`, `add_tongue(seg=...)` |
| lifeless eyes (ball, button pupil, cap lid) | no highlight, no lid wrap, flat iris | `eyes.py`; slim + `tilt > 0` for an angry look |
| shots pass through snout, lower legs, plates, beak, wings | generic GLB joint spheres cover ~65-75 % | `hit_coverage.mjs`, add `extraHitZones` until ≥ 95 % |

## Done checklist

- [ ] Grey model approved-looking from side, front, 3/4 and behind (no head/neck seam)
- [ ] Jaw at 0.52 and 1.0 rad: lips separate, no webs/strands at the tip, teeth seated, cheeks stretch smoothly, mouth trough + tongue visible, nothing see-through
- [ ] `check_glb.mjs` `jaw skin` is hundreds of verts; eyes have catchlights inside the lid opening
- [ ] `check_weights() == 0`; rest pose unchanged under IK
- [ ] `ground_report` all ≥ -0.01; `max_step` legs < 0.4 rad per 1/60 s at max cadence
- [ ] Contact sheets for every clip Read and clean; arms/head close-up sheet clean
- [ ] Strongest poses (run, attack, death) checked close-up for skin tears at limb roots
- [ ] `check_glb.mjs` clean; catalog numbers pasted from it
- [ ] `hit_coverage.mjs` ≥ 95 %; species zones (plates/flank/wing) restored if the old model had them
- [ ] Viewed in the game dino preview in every state
- [ ] Final report ends with the clickable review URL (game preview link, + PR URL if one exists)
- [ ] `npm test` passes (except the known random fruit test); only own files committed; not pushed
- [ ] Master build script rebuilds from an empty scene; scripts mirrored; README written
