# Small, low head: blunt beak, round cheeks, heavy sleepy brow (friendly but grumpy).
# Skull + lower jaw are lofts; 'sfuse' welds them with the neck into ONE mesh.
for n in ('StegoHead', 'StegoJaw', 'StegoEyes', 'StegoPupils', 'StegoLids', 'StegoGlints', 'StegoTongue'): remove(n)
S_MOUTH = 0.9; S_CORNER = -3.4   # cheeks close the mouth behind the corner

def s_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.5 * w, top - 0.015), (0.86 * w + brow, top - (top - mid) * 0.32), (w, mid + 0.18 * (top - mid)),
            (0.98 * w, mid - 0.2 * (mid - bot)), (0.9 * w, mid - 0.65 * (mid - bot)), (0.7 * w, bot + 0.012),
            (0.36 * w, bot + 0.002), (0, bot)]
#           y      w    top   bot   brow        (blunt rounded snout, no beak point)
S_HS = [(-2.72, .2, 1.30, .92, 0), (-2.82, .28, 1.40, S_MOUTH, 0), (-2.94, .33, 1.46, S_MOUTH, .02),
        (-3.06, .345, 1.46, S_MOUTH, .035), (-3.18, .335, 1.42, S_MOUTH, .015), (-3.32, .31, 1.37, S_MOUTH, 0),
        (-3.46, .29, 1.33, S_MOUTH, 0), (-3.58, .275, 1.30, S_MOUTH, 0), (-3.68, .255, 1.27, S_MOUTH, 0),
        (-3.75, .22, 1.23, S_MOUTH + .005, 0), (-3.8, .16, 1.17, S_MOUTH + .01, 0), (-3.83, .08, 1.1, S_MOUTH + .02, 0)]
head = loft2('StegoHead', [(y, s_prof(w, top, bot, br)) for y, w, top, bot, br in S_HS])
S_EYE0 = V((.33, -3.06, 1.26))                     # rough eye spot on the cage; refined on the surface below

def s_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * S_EYE0.x, S_EYE0.y, S_EYE0.z))
    # heavy brow ridge over the eye, slanting a little toward the snout (grumpy)
    a, b = V((sx * .29, -2.97, 1.37)), V((sx * .27, -3.22, 1.33))
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .2))) * .05 * math.exp(-(d / .06) ** 2)
    p -= n * .03 * math.exp(-((p - e).length / .08) ** 2)                       # eye socket
    p += n * .035 * math.exp(-((p - V((sx * .3, -3.18, 1.0))).length / .12) ** 2)  # round cheeks
    p += n * .014 * math.exp(-((p - V((sx * .1, -3.79, 1.2))).length / .04) ** 2)  # nostril rims
    return p
sculpt(head, s_head_sculpt)

# lower jaw (mouth.py): flat sides to a jawline keel, thin inward-rolled lip, mouth trough + tongue;
# narrower than the upper lip (soft overbite), deepest at the back, tip just behind the snout tip
exec(bpy.data.texts['mouth'].as_string(), globals())
#           y      w     bot
S_JS = [(-2.76, .19, .76), (-2.88, .26, .69), (-3.04, .28, .68), (-3.2, .265, .71), (-3.36, .25, .74), (-3.5, .235, .76),
        (-3.62, .21, .78), (-3.7, .17, .8), (-3.75, .12, .82), (-3.78, .06, .84)]
jaw = loft2('StegoJaw', [(y, jaw_prof(w, bot, S_MOUTH, 0.05 * trough_fade(y, -3.78, -2.76))) for y, w, bot in S_JS])
add_tongue('StegoTongue', (0, -3.3, S_MOUTH - .045), (.08, .2, .028))

# eyes sit IN the measured head surface (ray cast from outside), slightly sunk
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, S_EYE0.y, S_EYE0.z)), V((-1, 0, 0)))
S_EYE = V((hit[1].x - .035, S_EYE0.y, S_EYE0.z)) if hit[0] else S_EYE0
S_EYE_R = .11; S_EYE_YAW = 0.3
# living eyes (eyes.py): grumpy-calm herbivore, round pupil, slight angry slant
exec(bpy.data.texts['eyes'].as_string(), globals())
S_E = dict(c=tuple(S_EYE), R=S_EYE_R, yaw=S_EYE_YAW, W=.88, Ht=.48, Hb=.56, tilt=.16, rim=(.22, .06),
           pupil=(.27, .3), iris=.74)
build_eyes('Stego', S_E)
