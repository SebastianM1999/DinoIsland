# Trunk (long stiff tail -> barrel body -> short thick neck ending inside the skull) as ONE spline tube; strong
# hind legs with three toes, small arms with three fingers (separate tubes starting deep inside the trunk;
# 'pcfuse' unions them in one by one with a fillet).
for n in ['PcBody'] + [o.name for o in bpy.data.objects if o.name.startswith('PcLimb')]: remove(n)
PC_TRUNK = [
    (0, 2.46, .88, .02, .02), (0, 1.73, 1.0, .055, .055), (0, 1.09, 1.18, .11, .11), (0, .45, 1.33, .25, .26),
    (0, 0.0, 1.33, .4, .45), (0, -.32, 1.24, .44, .51), (0, -.67, 1.23, .38, .44), (0, -.92, 1.38, .3, .33),
    (0, -1.12, 1.54, .26, .28), (0, -1.3, 1.66, .23, .25)]
body = tube_path('PcBody', PC_TRUNK, ring=26, k=5, sub=1)

PC_LEGJ, PC_ARMJ = {}, {}
parts = []
for s, sx in (('L', 1), ('R', -1)):
    PC_LEGJ[s] = [(.25*sx, 0.0, 1.14), (.28*sx, -.13, .75), (.28*sx, .19, .37), (.28*sx, .1, .06), (.28*sx, -.32, .03)]
    PC_ARMJ[s] = [(.25*sx, -.77, 1.0), (.28*sx, -.86, .82), (.28*sx, -.86, .64), (.28*sx, -.9, .55)]
    leg = [(.12*sx, .03, 1.35, .26, .3), (.25*sx, 0.0, 1.14, .27, .31), (.27*sx, -.07, .94, .22, .25), (.28*sx, -.13, .75, .14, .15),
           (.28*sx, .03, .56, .1, .11), (.28*sx, .19, .37, .08, .085), (.28*sx, .15, .17, .085, .09), (.28*sx, .1, .065, .09, .08)]
    parts.append(tube_ref('Leg' + s, leg, ring=14, k=4, sub=1))
    for dx, L in ((-.1, .3), (0, .38), (.1, .3)):                             # three blunt toes
        parts.append(tube_ref('Toe', [(.28*sx, .12, .07, .07, .06), (.28*sx + dx*sx*.5, -.05, .055, .055, .05),
                                      (.28*sx + dx*sx, .06 - L, .04, .042, .038)], ring=8, k=3, sub=1))
    arm = [(.12*sx, -.72, 1.12, .1, .11), (.25*sx, -.77, 1.0, .09, .1), (.27*sx, -.82, .9, .07, .075), (.28*sx, -.86, .82, .06, .062),
           (.28*sx, -.86, .72, .055, .055), (.28*sx, -.86, .64, .05, .045), (.28*sx, -.88, .58, .045, .04)]
    parts.append(tube_ref('Arm' + s, arm, ring=10, k=4, sub=1))
    for dx, L in ((-.03, .07), (0, .085), (.03, .065)):
        parts.append(tube_ref('Finger', [(.28*sx, -.88, .6, .025, .025), (.28*sx + dx*sx, -.9, .59 - L*.5, .02, .02),
                                         (.28*sx + dx*sx, -.92, .59 - L, .017, .017)], ring=6, k=3, sub=1))
for o in parts: apply_mods(o)
for o in parts:                                                              # flat soles on the ground plane
    for v in o.data.vertices:
        if v.co.z < .03: v.co.z = .03 + (v.co.z - .03) * .12
    o.data.update()
for i, o in enumerate(parts): o.name = o.data.name = 'PcLimb%02d' % i
PC_PARTS = [o.name for o in parts]
PC_FINGERTIPS = [(s, (.28*sx + dx*sx, -.92, .59 - L)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.03, .07), (0, .085), (.03, .065))]
PC_TOETIPS = [(s, (.28*sx + dx*sx, .06 - L, .04)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.1, .3), (0, .38), (.1, .3))]
