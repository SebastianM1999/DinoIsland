# Short, deep face with a plain closed snout, crowned by the huge bone dome: the dome is part of the skull loft
# (round-topped sections rising behind the snout; a separate ellipsoid read as a ball on the head). Lower jaw: mouth.py profile
# with cheeks (herbivore). Grumpy round-pupil eyes under the dome's brow rim.
exec(bpy.data.texts['mouth'].as_string(), globals())
for n in ('PcHead', 'PcJaw', 'PcDome', 'PcEyes', 'PcGlints', 'PcPupils', 'PcLids', 'PcTongue'): remove(n)
PC_MOUTH = pch(0, 0, 1.46).z; PC_CORNER = pch(0, -1.87, 0).y   # short visible mouth: cheeks close it behind the corner
PC_DOME_C, PC_DOME_R = pch(0, -1.46, 1.8), V((.33, .33, .27)) * PC_HK   # ellipsoid approximating the dome (knobs, paint)

def pc_prof(w, top, bot, dome=0.0):
    """Half profile, 9 points: a round (domed) top blending into flat cheeks and a lip line. dome 0..1 rounds
    the top (1 = half ellipse over the upper 55 %)."""
    mid = bot + 0.45 * (top - bot)
    up = [(w * math.cos(math.radians(a)) ** (1 - .5 * dome) * (1 - .25 * (1 - dome) * (a > 50)), mid + (top - mid) * math.sin(math.radians(a)) ** (1.0 - .4 * dome))   # round, not conical
          for a in (90, 62, 34)]
    return [(0, top)] + up[1:] + [(w, mid), (0.99 * w, mid - 0.25 * (mid - bot)), (0.95 * w, mid - 0.7 * (mid - bot)),
                                  (0.86 * w, bot + 0.01), (0.55 * w, bot + 0.003), (0, bot)]

def pc_sec(y, half):
    q = [pch(x, y, z) for x, z in half]; return (q[0].y, [(p.x, p.z) for p in q])
M = 1.46
#          y       w    top    bot     dome      (reference space; pch() shrinks it. Compact dome, plain snout:
#                                                 no hooked beak - the owner disliked the "napping turtle" mouth)
PC_HS = [(-1.1, .23, 1.84, 1.3, .3), (-1.24, .3, 1.98, 1.33, .9), (-1.38, .33, 2.06, M, 1), (-1.52, .34, 2.08, M, 1),
         (-1.66, .31, 2.02, M, 1), (-1.77, .25, 1.88, M, .7), (-1.85, .2, 1.79, M, .35), (-1.92, .17, 1.74, M, .2),
         (-1.97, .145, 1.7, M, .1), (-2.01, .115, 1.65, M - .01, .05), (-2.04, .07, 1.59, M - .02, 0), (-2.06, .03, 1.53, M - .03, 0)]
head = loft2('PcHead', [pc_sec(y, pc_prof(w, top, bot, d)) for y, w, top, bot, d in PC_HS])
PC_EYE0 = pch(.2, -1.76, 1.68)

def pc_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * PC_EYE0.x, PC_EYE0.y, PC_EYE0.z))
    p -= n * .014 * math.exp(-((p - e).length / .045) ** 2)                          # eye socket under the dome rim
    b = pch(sx * .21, -1.74, 1.76)                                                    # heavy brow shelf from the dome rim
    p += (n * .4 + V((sx * .5, 0, .1))) * .02 * math.exp(-((p - b).length / .04) ** 2)
    p += n * .022 * math.exp(-((p - pch(sx * .26, -1.45, 1.55)).length / .065) ** 2)  # cheek bulge
    p += n * .009 * math.exp(-((p - pch(sx * .05, -1.99, 1.58)).length / .022) ** 2)  # nostril rims
    return p
sculpt(head, pc_head_sculpt)

# nearly flush under the wide cheeks (a narrow jaw left a deep shadow strip that read as a gaping mouth)
PC_JS = [(-1.3, .2, 1.34), (-1.5, .27, 1.31), (-1.68, .24, 1.33), (-1.82, .19, 1.36), (-1.92, .155, 1.38), (-1.99, .115, 1.4), (-2.04, .05, 1.43)]
PC_JS = [(pch(0, y, 0).y, w * PC_HK, pch(0, 0, b).z) for y, w, b in PC_JS]
# behind the mouth corner the jaw top rises INTO the skull, so the union welds them into one cheek (a groove
# along the lip line there read as a long gaping mouth); ahead of the corner the lips stay apart
def pc_jaw_top(y): return PC_MOUTH + .045 * smooth(PC_CORNER - .01, PC_CORNER + .06, y)
jaw = loft2('PcJaw', [(y, jaw_prof(w, bot, pc_jaw_top(y), 0.02 * trough_fade(y, PC_JS[-1][0], PC_JS[0][0]))) for y, w, bot in PC_JS])
add_tongue('PcTongue', pch(0, -1.62, 1.44), (.045, .11, .012), seg=(14, 8))

exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, PC_EYE0.y, PC_EYE0.z)), V((-1, 0, 0)))
PC_EYE = V((hit[1].x - .02, PC_EYE0.y, PC_EYE0.z)) if hit[0] else PC_EYE0
# smaller, deeper-set eye with a thin rim and a slight focused slant (the big round bulging eye read as "stupid")
PC_E = dict(c=tuple(PC_EYE), R=.044, yaw=.3, W=.9, Ht=.4, Hb=.5, tilt=.3, rim=(.15, .05), pupil=(.2, .28), iris=.78,
            ball=(24, 16), rimseg=(40, 6))
build_eyes('Pc', PC_E)
