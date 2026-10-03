# Small, wide, flat-topped triangular head: broad at the back (horn corners), tapering to a narrow
# hooked beak. Skull + lower jaw are lofts; 'afuse' welds them with the neck into ONE mesh.
exec(bpy.data.texts['mouth'].as_string(), globals())
for n in ('AnkHead', 'AnkJaw', 'AnkEyes', 'AnkGlints', 'AnkPupils', 'AnkLids', 'AnkTongue'): remove(n)
AK_MOUTH = 1.32; AK_CORNER = -2.95   # cheeks close the mouth behind the corner (beaked herbivore)

def ak_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2      # flatter top than the Triceratops: the armoured skull roof is a plateau
    return [(0, top), (0.62 * w, top - 0.015), (0.9 * w + brow, top - (top - mid) * 0.3), (w, mid + 0.1 * (top - mid)),
            (0.99 * w, mid - 0.25 * (mid - bot)), (0.95 * w, mid - 0.7 * (mid - bot)), (0.86 * w, bot + 0.02),
            (0.55 * w, bot + 0.004), (0, bot)]
M = AK_MOUTH
#            y      w    top   bot      brow
AK_HS = [(-2.2, .5, 1.98, 1.25, 0), (-2.38, .6, 2.04, M, .03), (-2.56, .6, 2.02, M, .04), (-2.74, .54, 1.96, M, .02),
         (-2.9, .46, 1.88, M, 0), (-3.04, .38, 1.8, M, 0), (-3.16, .3, 1.7, M, 0), (-3.26, .22, 1.58, M - .04, 0),
         (-3.33, .14, 1.45, M - .1, 0), (-3.37, .07, 1.36, M - .15, 0)]
head = loft2('AnkHead', [(y, ak_prof(w, top, bot, br)) for y, w, top, bot, br in AK_HS])
AK_EYE0 = V((.44, -2.8, 1.68))                    # rough eye spot on the cage; refined on the surface below

def ak_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * AK_EYE0.x, AK_EYE0.y, AK_EYE0.z))
    a, b = V((sx * .4, -2.66, 1.84)), V((sx * .36, -2.92, 1.8))                    # heavy brow shelf
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .2))) * .05 * math.exp(-(d / .07) ** 2)
    p -= n * .03 * math.exp(-((p - e).length / .08) ** 2)                          # eye socket
    p += n * .05 * math.exp(-((p - V((sx * .5, -2.5, 1.45))).length / .14) ** 2)   # cheek bulge
    p += n * .025 * math.exp(-((p - V((sx * .12, -3.28, 1.5))).length / .06) ** 2)  # nostril rims
    return p
sculpt(head, ak_head_sculpt)

# Lower jaw (mouth.py profile: trough, cutting lip, flat side, jawline keel), narrower than the upper
# lip, deepest under the cheek, the pointed lower beak stops behind the upper beak's hook.
AK_JS = [(-2.36, .3, 1.12), (-2.5, .36, 1.05), (-2.72, .35, 1.05), (-2.9, .3, 1.08), (-3.05, .24, 1.11),
         (-3.15, .17, 1.14), (-3.22, .1, 1.17), (-3.26, .04, 1.2)]
jaw = loft2('AnkJaw', [(y, jaw_prof(w, bot, AK_MOUTH, 0.065 * trough_fade(y, -3.26, -2.36))) for y, w, bot in AK_JS])
add_tongue('AnkTongue', (0, -2.85, AK_MOUTH - .06), (.1, .24, .036))

exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((2.0, AK_EYE0.y, AK_EYE0.z)), V((-1, 0, 0)))
AK_EYE_R = .1; AK_EYE_YAW = 0.3
AK_EYE = V((hit[1].x - .035, AK_EYE0.y, AK_EYE0.z)) if hit[0] else AK_EYE0
AK_E = dict(c=tuple(AK_EYE), R=AK_EYE_R, yaw=AK_EYE_YAW, W=.88, Ht=.45, Hb=.53, tilt=.2, rim=(.22, .06),
            pupil=(.27, .3), iris=.74, ball=(24, 16), rimseg=(40, 6))
build_eyes('Ank', AK_E)
