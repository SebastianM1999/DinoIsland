# Head: short deep skull, long toothless dagger beak, a tall swept-back crest blade, sunk amber eyes
# under an angry lid (it is a dive-bombing predator). Skull + lower beak are fused with the neck in 'pfuse'.
for n in ('PteraHead', 'PteraJaw', 'PteraCrest', 'PteraEyes', 'PteraPupils', 'PteraLids'): remove(n)
P_MOUTH = 1.33; P_CORNER = -0.98

def p_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.55 * w, top - 0.006), (0.9 * w + brow, top - (top - mid) * 0.35), (w, mid + 0.15 * (top - mid)),
            (0.97 * w, mid - 0.2 * (mid - bot)), (0.86 * w, mid - 0.65 * (mid - bot)), (0.6 * w, bot + 0.004),
            (0.3 * w, bot + 0.001), (0, bot)]
#            y      w     top    bot          brow
P_HS = [(-0.74, .055, 1.45, 1.37, 0), (-0.8, .08, 1.51, 1.35, 0), (-0.86, .095, 1.54, P_MOUTH, .012),
        (-0.93, .092, 1.535, P_MOUTH, .015), (-1.02, .078, 1.5, P_MOUTH, .004), (-1.14, .062, 1.46, P_MOUTH, 0),
        (-1.29, .049, 1.425, P_MOUTH, 0), (-1.44, .038, 1.395, P_MOUTH, 0), (-1.59, .029, 1.372, P_MOUTH, 0),
        (-1.73, .02, 1.354, P_MOUTH + .002, 0), (-1.85, .012, 1.343, P_MOUTH + .004, 0), (-1.93, .005, 1.338, P_MOUTH + .005, 0)]
head = loft2('PteraHead', [(y, p_prof(w, top, bot, br)) for y, w, top, bot, br in P_HS])
P_EYE0 = V((.09, -0.89, 1.45))

def p_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * P_EYE0.x, P_EYE0.y, P_EYE0.z))
    # heavy brow ridge slanting DOWN toward the beak over the eye (angry)
    a, b = V((sx * .075, -0.84, 1.52)), V((sx * .07, -0.97, 1.48))
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .25))) * .016 * math.exp(-(d / .022) ** 2)
    p -= n * .012 * math.exp(-((p - e).length / .03) ** 2)                          # sunk eye socket
    p += n * .01 * math.exp(-((p - V((sx * .085, -0.83, 1.38))).length / .04) ** 2)  # jaw muscle bulge
    return p
sculpt(head, p_head_sculpt)

P_T = [(0, 0.9), (0.5, 0.93), (0.82, 1.0), (0.97, 0.9), (1.0, 0.62), (0.92, 0.3), (0.72, 0.1), (0.4, 0.015), (0, 0.0)]
#            y      w     bot      (lower beak: narrower than the upper one, a little shorter)
P_JS = [(-0.77, .065, 1.25), (-0.86, .078, 1.25), (-0.96, .07, 1.262), (-1.1, .058, 1.276), (-1.25, .047, 1.29),
        (-1.4, .037, 1.3), (-1.55, .027, 1.309), (-1.69, .018, 1.316), (-1.81, .01, 1.322), (-1.88, .004, 1.325)]
jaw = loft2('PteraJaw', [(y, [(tx * w, bot + tz * (P_MOUTH - bot)) for tx, tz in P_T]) for y, w, bot in P_JS])

# crest: a flat blade (thin sideways, tall) swept back and up from the skull, rooted inside it
P_CREST = [(0, -0.97, 1.45, .028, .09), (0, -0.84, 1.53, .03, .115), (0, -0.66, 1.63, .024, .095),
           (0, -0.5, 1.72, .017, .065), (0, -0.37, 1.8, .01, .035), (0, -0.29, 1.85, .005, .012)]
p_tube('PteraCrest', P_CREST, ring=16, k=4, sub=1, ref=(1, 0, 0))
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, P_EYE0.y, P_EYE0.z)), V((-1, 0, 0)))
P_EYE = V((hit[1].x - .022, P_EYE0.y, P_EYE0.z)) if hit[0] else P_EYE0
P_EYE_R = .03; P_EYE_YAW = 0.25
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx * P_EYE.x, P_EYE.y, P_EYE.z)), (P_EYE_R * .8, P_EYE_R, P_EYE_R), (0, 0, -sx * P_EYE_YAW), 20, 14)
mk('PteraEyes', bm)
bm = bmesh.new()   # slit pupils
for sx in (1, -1):
    d = V((sx * math.cos(P_EYE_YAW), -math.sin(P_EYE_YAW), 0))
    blob_bm(bm, V((sx * P_EYE.x, P_EYE.y, P_EYE.z)) + d * P_EYE_R * .74, (.004, .006, .022), (0, 0, -sx * P_EYE_YAW), 12, 8)
mk('PteraPupils', bm)
bm = bmesh.new()   # angry upper lid, its edge slanting down toward the beak
for sx in (1, -1):
    blob_bm(bm, V((sx * (P_EYE.x + .003), P_EYE.y, P_EYE.z + P_EYE_R * .55)), (P_EYE_R * .92, P_EYE_R * 1.18, P_EYE_R * .55),
            (0, 0, -sx * P_EYE_YAW), 20, 12)
mk('PteraLids', bm)
lids = bpy.data.objects['PteraLids']
for v in lids.data.vertices:
    sx = 1 if v.co.x > 0 else -1; c = V((sx * P_EYE.x, P_EYE.y, P_EYE.z))
    ax = V((sx * math.cos(P_EYE_YAW), -math.sin(P_EYE_YAW), 0))
    v.co = c + mathutils.Matrix.Rotation(sx * 0.38, 3, ax) @ (v.co - c)
lids.data.update()
