# Trunk (long whip tail -> slim body -> S-neck ending inside the skull) as ONE spline tube; long slender
# hind legs with three toes, long arms with three fingers (all separate tubes starting deep inside the trunk;
# 'dlfuse' unions them in one by one with a fillet).
for n in ['DlBody'] + [o.name for o in bpy.data.objects if o.name.startswith('DlLimb')]: remove(n)
DL_TRUNK = [
    (0, 3.9, 1.08, .02, .02), (0, 2.8, 1.4, .07, .07), (0, 2.05, 1.65, .12, .12), (0, 1.3, 1.83, .19, .2),
    (0, 0.6, 1.86, .3, .33), (0, 0.0, 1.88, .38, .44), (0, -0.6, 1.78, .42, .49), (0, -1.05, 1.76, .36, .42),
    (0, -1.38, 1.86, .26, .3), (0, -1.72, 2.1, .2, .23), (0, -2.02, 2.38, .18, .2), (0, -2.22, 2.48, .17, .19)]
body = tube_path('DlBody', DL_TRUNK, ring=24, k=5, sub=1)

DL_LEGJ, DL_ARMJ = {}, {}
parts = []
for s, sx in (('L', 1), ('R', -1)):
    DL_LEGJ[s] = [(.3*sx, 0.0, 1.65), (.34*sx, -.25, 1.0), (.34*sx, .25, .45), (.34*sx, .05, .07), (.34*sx, -.45, .035)]
    DL_ARMJ[s] = [(.28*sx, -1.0, 1.48), (.34*sx, -1.15, 1.2), (.34*sx, -1.3, 1.05), (.34*sx, -1.36, .88)]
    leg = [(.16*sx, .05, 1.95, .3, .34), (.3*sx, 0.0, 1.65, .32, .36), (.33*sx, -.13, 1.32, .25, .28), (.34*sx, -.25, 1.0, .15, .16),
           (.34*sx, 0.0, .72, .11, .12), (.34*sx, .25, .45, .08, .085), (.34*sx, .16, .2, .085, .09), (.34*sx, .05, .075, .09, .08)]
    parts.append(tube_ref('Leg' + s, leg, ring=14, k=4, sub=1))
    for dx, L in ((-.12, .36), (0, .46), (.12, .36)):                       # three slender toes
        parts.append(tube_ref('Toe', [(.34*sx, .07, .08, .075, .065), (.34*sx + dx*sx*.5, -.12, .065, .055, .05),
                                      (.34*sx + dx*sx, .02 - L, .045, .04, .038)], ring=8, k=3, sub=1))
    arm = [(.14*sx, -.95, 1.62, .15, .16), (.28*sx, -1.0, 1.48, .14, .15), (.32*sx, -1.08, 1.33, .11, .11), (.34*sx, -1.15, 1.2, .08, .085),
           (.34*sx, -1.23, 1.12, .075, .075), (.34*sx, -1.3, 1.05, .07, .065), (.34*sx, -1.34, .96, .06, .05)]
    parts.append(tube_ref('Arm' + s, arm, ring=12, k=4, sub=1))
    for dx, L in ((-.05, .13), (0, .16), (.05, .12)):                       # three fingers, hooked claws on their tips
        parts.append(tube_ref('Finger', [(.34*sx, -1.33, .98, .04, .04), (.34*sx + dx*sx, -1.37, .96 - L*.5, .032, .032),
                                         (.34*sx + dx*sx, -1.4, .96 - L, .026, .026)], ring=8, k=3, sub=1))
for o in parts: apply_mods(o)
for o in parts:                                                              # flat soles on the ground plane
    for v in o.data.vertices:
        if v.co.z < .03: v.co.z = .03 + (v.co.z - .03) * .12
    o.data.update()
for i, o in enumerate(parts): o.name = o.data.name = 'DlLimb%02d' % i
DL_PARTS = [o.name for o in parts]
DL_FINGERTIPS = [(s, (.34*sx + dx*sx, -1.4, .96 - L)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.05, .13), (0, .16), (.05, .12))]
DL_TOETIPS = [(s, (.34*sx + dx*sx, .02 - L, .045)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.12, .36), (0, .46), (.12, .36))]
