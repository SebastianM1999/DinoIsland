# Short, deep face with a small hooked beak, crowned by the huge bone dome: the dome is part of the skull loft
# (round-topped sections rising behind the snout; a separate ellipsoid read as a ball on the head). Lower jaw: mouth.py profile
# with cheeks (herbivore). Grumpy round-pupil eyes under the dome's brow rim.
exec(bpy.data.texts['mouth'].as_string(), globals())
for n in ('PcHead', 'PcJaw', 'PcDome', 'PcEyes', 'PcGlints', 'PcPupils', 'PcLids', 'PcTongue'): remove(n)
PC_MOUTH = 1.46; PC_CORNER = -1.78
PC_DOME_C, PC_DOME_R = V((0, -1.46, 1.84)), V((.35, .34, .29))   # ellipsoid approximating the dome (knob placement, paint)

def pc_prof(w, top, bot, dome=0.0):
    """Half profile, 9 points: a round (domed) top blending into flat cheeks and a lip line. dome 0..1 rounds
    the top (1 = half ellipse over the upper 55 %)."""
    mid = bot + 0.45 * (top - bot)
    up = [(w * math.cos(math.radians(a)) ** (1 - .5 * dome) * (1 - .25 * (1 - dome) * (a > 50)), mid + (top - mid) * math.sin(math.radians(a)) ** (1.0 - .4 * dome))   # round, not conical
          for a in (90, 62, 34)]
    return [(0, top)] + up[1:] + [(w, mid), (0.99 * w, mid - 0.25 * (mid - bot)), (0.95 * w, mid - 0.7 * (mid - bot)),
                                  (0.86 * w, bot + 0.01), (0.55 * w, bot + 0.003), (0, bot)]
M = PC_MOUTH
#          y       w    top    bot     dome      (the dome IS the skull: it rises straight out of the face)
PC_HS = [(-1.1, .23, 1.84, 1.3, .3), (-1.24, .32, 2.0, 1.33, .9), (-1.38, .36, 2.1, M, 1), (-1.52, .37, 2.13, M, 1),
         (-1.66, .34, 2.08, M, 1), (-1.77, .26, 1.92, M, .7), (-1.85, .16, 1.74, M, .3), (-1.92, .12, 1.65, M, .1),
         (-1.97, .085, 1.58, M - .02, 0), (-2.01, .05, 1.53, M - .05, 0), (-2.04, .018, 1.49, M - .07, 0)]
head = loft2('PcHead', [(y, pc_prof(w, top, bot, d)) for y, w, top, bot, d in PC_HS])
PC_EYE0 = V((.2, -1.76, 1.66))

def pc_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * PC_EYE0.x, PC_EYE0.y, PC_EYE0.z))
    p -= n * .02 * math.exp(-((p - e).length / .06) ** 2)                          # eye socket under the dome rim
    p += n * .03 * math.exp(-((p - V((sx * .26, -1.45, 1.55))).length / .09) ** 2)   # cheek bulge
    p += n * .012 * math.exp(-((p - V((sx * .05, -1.99, 1.57))).length / .03) ** 2)  # nostril rims
    return p
sculpt(head, pc_head_sculpt)

PC_JS = [(-1.3, .14, 1.34), (-1.5, .155, 1.31), (-1.68, .13, 1.35), (-1.82, .095, 1.39), (-1.92, .06, 1.42), (-1.98, .025, 1.44)]
jaw = loft2('PcJaw', [(y, jaw_prof(w, bot, PC_MOUTH, 0.03 * trough_fade(y, -1.98, -1.3))) for y, w, bot in PC_JS])
add_tongue('PcTongue', (0, -1.62, PC_MOUTH - .028), (.06, .16, .016), seg=(14, 8))

exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, PC_EYE0.y, PC_EYE0.z)), V((-1, 0, 0)))
PC_EYE = V((hit[1].x - .022, PC_EYE0.y, PC_EYE0.z)) if hit[0] else PC_EYE0
PC_E = dict(c=tuple(PC_EYE), R=.06, yaw=.25, W=.88, Ht=.42, Hb=.5, tilt=.26, rim=(.22, .06), pupil=(.27, .3), iris=.74,
            ball=(24, 16), rimseg=(40, 6))
build_eyes('Pc', PC_E)
