# Small, low, broad head with a horn beak (ankylosaur-like): derived from the stego head loft with the
# transform hy/hz/HW (shorter, lower, wider), gentle round eyes.
for n in ('PlodHead', 'PlodJaw', 'PlodEyes', 'PlodPupils', 'PlodLids', 'PlodGlints', 'PlodTongue'): remove(n)
def hy(y): return -2.45 + (y + 2.72) * 0.85
def hz(z): return z - 0.43
HW = 1.22
P_MOUTH = hz(0.9); P_CORNER = hy(-3.4)

def p_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.5 * w, top - 0.015), (0.86 * w + brow, top - (top - mid) * 0.32), (w, mid + 0.18 * (top - mid)),
            (0.98 * w, mid - 0.2 * (mid - bot)), (0.9 * w, mid - 0.65 * (mid - bot)), (0.7 * w, bot + 0.012),
            (0.36 * w, bot + 0.002), (0, bot)]
S_MOUTH = .9
S_HS = [(-2.72, .2, 1.30, .92, 0), (-2.82, .28, 1.40, S_MOUTH, 0), (-2.94, .33, 1.46, S_MOUTH, .02),
        (-3.06, .345, 1.46, S_MOUTH, .035), (-3.18, .335, 1.42, S_MOUTH, .015), (-3.32, .31, 1.37, S_MOUTH, 0),
        (-3.46, .29, 1.33, S_MOUTH, 0), (-3.58, .275, 1.30, S_MOUTH, 0), (-3.68, .255, 1.27, S_MOUTH, 0),
        (-3.75, .22, 1.23, S_MOUTH + .005, 0), (-3.8, .16, 1.17, S_MOUTH + .01, 0), (-3.83, .08, 1.1, S_MOUTH + .02, 0)]
head = loft2('PlodHead', [(hy(y), p_prof(w * HW, hz(top), hz(bot), br)) for y, w, top, bot, br in S_HS])
P_EYE0 = V((.33 * HW, hy(-3.06), hz(1.26)))

def p_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * P_EYE0.x, P_EYE0.y, P_EYE0.z))
    a, b = V((sx * .29 * HW, hy(-2.97), hz(1.37))), V((sx * .27 * HW, hy(-3.22), hz(1.33)))
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .2))) * .05 * math.exp(-(d / .06) ** 2)
    p -= n * .03 * math.exp(-((p - e).length / .08) ** 2)
    p += n * .035 * math.exp(-((p - V((sx * .3 * HW, hy(-3.18), hz(1.0)))).length / .12) ** 2)
    p += n * .014 * math.exp(-((p - V((sx * .1 * HW, hy(-3.79), hz(1.2)))).length / .04) ** 2)
    return p
sculpt(head, p_head_sculpt)

exec(bpy.data.texts['mouth'].as_string(), globals())
S_JS = [(-2.76, .19, .76), (-2.88, .26, .69), (-3.04, .28, .68), (-3.2, .265, .71), (-3.36, .25, .74), (-3.5, .235, .76),
        (-3.62, .21, .78), (-3.7, .17, .8), (-3.75, .12, .82), (-3.78, .06, .84)]
jaw = loft2('PlodJaw', [(hy(y), jaw_prof(w * HW * .97, hz(bot), P_MOUTH, 0.05 * trough_fade(hy(y), hy(-3.78), hy(-2.76)))) for y, w, bot in S_JS])
add_tongue('PlodTongue', (0, hy(-3.3), P_MOUTH - .045), (.09, .17, .028))

dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.2, P_EYE0.y, P_EYE0.z)), V((-1, 0, 0)))
P_EYE = V((hit[1].x - .035, P_EYE0.y, P_EYE0.z)) if hit[0] else P_EYE0
exec(bpy.data.texts['eyes'].as_string(), globals())
P_E = dict(c=tuple(P_EYE), R=.1, yaw=0.3, W=.9, Ht=.5, Hb=.56, tilt=.06, rim=(.22, .06), pupil=(.28, .3), iris=.76)
build_eyes('Plod', P_E)
