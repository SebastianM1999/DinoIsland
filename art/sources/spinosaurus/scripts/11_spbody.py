# Trunk (long tail -> deep narrow body -> S-curved neck ending inside the skull) as ONE spline tube,
# massive hind legs with three thick toes, long powerful arms with three fingers (all tubes start deep
# inside the trunk; 'spfuse' unions them in with a fillet).
for n in ['SpBody'] + [o.name for o in bpy.data.objects if o.name.startswith('SpLimb')]: remove(n)
SP_TRUNK = [
    (0, 6.1, 1.9, .04, .04), (0, 5.0, 2.12, .14, .15), (0, 3.95, 2.38, .26, .28), (0, 2.6, 2.65, .42, .46),
    (0, 1.3, 2.8, .62, .72), (0, 0.0, 2.85, .8, 1.0), (0, -1.4, 2.72, .86, 1.12), (0, -2.2, 2.8, .74, 1.0),
    (0, -2.75, 3.02, .56, .74), (0, -3.3, 3.38, .46, .56), (0, -3.8, 3.82, .43, .5), (0, -4.25, 4.08, .4, .46)]
body = tube_path('SpBody', SP_TRUNK, ring=28, k=4, sub=1)

# joints shared with the rig
SP_LEGJ, SP_ARMJ = {}, {}
parts = []
for s, sx in (('L', 1), ('R', -1)):
    SP_LEGJ[s] = [(.5*sx, 0.0, 2.55), (.6*sx, -.48, 1.52), (.6*sx, .3, .58), (.6*sx, 0.0, .12), (.6*sx, -.78, .06)]
    SP_ARMJ[s] = [(.5*sx, -2.55, 2.45), (.62*sx, -3.05, 1.75), (.62*sx, -3.5, 1.4), (.62*sx, -3.66, 1.12)]
    leg = [(.3*sx, .1, 3.1, .6, .7), (.5*sx, 0.0, 2.55, .62, .74), (.56*sx, -.26, 2.0, .5, .58), (.6*sx, -.48, 1.52, .32, .36),
           (.6*sx, -.1, 1.0, .25, .27), (.6*sx, .3, .58, .19, .21), (.6*sx, .17, .27, .2, .22), (.6*sx, 0.0, .13, .22, .2)]
    parts.append(tube_ref('Leg' + s, leg, ring=16, k=4, sub=1))
    for dx, L in ((-.24, .62), (0, .8), (.24, .62)):                         # three thick toes
        parts.append(tube_ref('Toe', [(.6*sx, .05, .14, .17, .14), (.6*sx + dx*sx*.5, -.3, .12, .13, .12),
                                      (.6*sx + dx*sx, -.08 - L, .085, .09, .085)], ring=10, k=3, sub=1))
    arm = [(.28*sx, -2.45, 2.75, .3, .32), (.5*sx, -2.58, 2.45, .3, .32), (.57*sx, -2.82, 2.1, .24, .25), (.62*sx, -3.05, 1.75, .18, .19),
           (.62*sx, -3.3, 1.56, .2, .19), (.62*sx, -3.5, 1.4, .17, .15), (.62*sx, -3.6, 1.24, .15, .12)]
    parts.append(tube_ref('Arm' + s, arm, ring=14, k=4, sub=1))
    for dx, L in ((-.1, .26), (0, .3), (.1, .24)):                           # three fingers, hooked claws on their tips
        parts.append(tube_ref('Finger', [(.62*sx, -3.58, 1.26, .085, .085), (.62*sx + dx*sx, -3.66, 1.24 - L*.5, .07, .07),
                                         (.62*sx + dx*sx, -3.72, 1.24 - L, .058, .058)], ring=8, k=3, sub=1))
for o in parts: apply_mods(o)
for o in parts:                                                              # flat soles on the ground plane
    for v in o.data.vertices:
        if v.co.z < .05: v.co.z = .05 + (v.co.z - .05) * .12
    o.data.update()
for i, o in enumerate(parts): o.name = o.data.name = 'SpLimb%02d' % i   # unioned one by one in 'spfuse'
SP_PARTS = [o.name for o in parts]
SP_FINGERTIPS = [(s, (.62*sx + dx*sx, -3.72, 1.24 - L)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.1, .26), (0, .3), (.1, .24))]
SP_TOETIPS = [(s, (.6*sx + dx*sx, -.08 - L, .085)) for s, sx in (('L', 1), ('R', -1)) for dx, L in ((-.24, .62), (0, .8), (.24, .62))]
