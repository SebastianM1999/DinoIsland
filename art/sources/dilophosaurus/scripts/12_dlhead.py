# Light, narrow theropod skull: deep behind the eye, a slender snout with the Dilophosaurus kink (the upper
# lip notches up just behind the snout tip, the tip hooks down), a heavy slanted brow and a low ridge on top
# that carries the two crests ('dlparts'). Lower jaw: mouth.py profile. Slit-pupil eyes, uneven teeth rooted
# in the measured lip lines. 'dlfuse' welds skull + jaw + neck.
exec(bpy.data.texts['mouth'].as_string(), globals())
for n in ('DlHead', 'DlJaw', 'DlEyes', 'DlGlints', 'DlPupils', 'DlLids', 'DlTongue', 'DlTeethUp', 'DlTeethLow'): remove(n)
DL_MOUTH = 2.3; DL_CORNER = -2.36

def dl_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.4 * w, top - 0.005), (0.78 * w + brow, top - (top - mid) * 0.3 + brow * .4),
            (0.94 * w, mid + 0.25 * (top - mid)), (w, mid - 0.15 * (mid - bot)), (0.97 * w, mid - 0.6 * (mid - bot)),
            (0.9 * w, bot + 0.01), (0.55 * w, bot + 0.003), (0, bot)]
M = DL_MOUTH
#          y      w    top    bot        brow     (skull underside stays on the lip line over the jaw)
DL_HS = [(-2.12, .2, 2.68, 2.2, 0), (-2.25, .23, 2.75, 2.22, 0), (-2.38, .23, 2.75, M, .025), (-2.5, .2, 2.7, M, .03),
         (-2.62, .16, 2.62, M, .01), (-2.74, .13, 2.54, M, 0), (-2.84, .11, 2.48, M + .015, 0), (-2.92, .1, 2.45, M + .01, 0),
         (-3.0, .085, 2.41, M, 0), (-3.06, .055, 2.37, M - .03, 0), (-3.11, .02, 2.32, M - .05, 0)]
head = loft2('DlHead', [(y, dl_prof(w, top, bot, br)) for y, w, top, bot, br in DL_HS])
DL_EYE0 = V((.17, -2.36, 2.62))

def dl_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * DL_EYE0.x, DL_EYE0.y, DL_EYE0.z))
    a, b = V((sx * .15, -2.26, 2.71)), V((sx * .13, -2.5, 2.67))                    # brow shelf over the eye
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.4 + V((sx * .55, 0, .05))) * .045 * math.exp(-(d / .04) ** 2) * (0.6 + 0.4 * math.sin(u * math.pi))
    p -= n * .02 * math.exp(-((p - e).length / .055) ** 2)                         # sunk eye socket
    p += n * .035 * math.exp(-((p - V((sx * .2, -2.24, 2.4))).length / .1) ** 2)   # jaw muscles
    p += n * .012 * math.exp(-((p - V((sx * .045, -2.98, 2.42))).length / .03) ** 2)  # nostril rims
    return p
sculpt(head, dl_head_sculpt)

DL_JS = [(-2.3, .13, 2.12), (-2.45, .135, 2.1), (-2.62, .11, 2.14), (-2.78, .085, 2.18), (-2.92, .072, 2.2),
         (-3.0, .055, 2.22), (-3.05, .022, 2.25)]
jaw = loft2('DlJaw', [(y, jaw_prof(w, bot, DL_MOUTH, 0.025 * trough_fade(y, -3.05, -2.3))) for y, w, bot in DL_JS])
add_tongue('DlTongue', (0, -2.65, DL_MOUTH - .022), (.05, .25, .014), seg=(14, 8))

exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, DL_EYE0.y, DL_EYE0.z)), V((-1, 0, 0)))
DL_EYE = V((hit[1].x - .025, DL_EYE0.y, DL_EYE0.z)) if hit[0] else DL_EYE0
DL_E = dict(c=tuple(DL_EYE), R=.06, yaw=.3, W=.9, Ht=.36, Hb=.5, tilt=.36, rim=(.22, .06), pupil=(.09, .34), iris=.8,
            ball=(24, 16), rimseg=(40, 6))
build_eyes('Dl', DL_E)

def dl_tooth_row(name, ob, ys, lower, big):
    bm = bmesh.new()
    for i, y in enumerate(ys):
        lx, lz = lip_at(ob, y, lower=not lower)
        L = (.04 + .03 * math.sin(i * 1.7 + .5) ** 4) * (1.6 if any(abs(y - b) < .03 for b in big) else 1)
        L *= 1.0 - 0.3 * smooth(-2.6, -2.4, y)
        dz = 1 if lower else -1
        for sx in (1, -1):
            root = V((sx * (lx - .02), y, lz - dz * .022)); tip = V((sx * (lx - .012), y + .01, lz + dz * L))
            horn_bm(bm, root, tip, .012 + L * .16, bend=(sx * .002, .008, 0), seg=6, rings=5)   # recurved: tips lean back
    return mk(name, bm)
dl_tooth_row('DlTeethUp', head, [-2.45 - 0.058 * i for i in range(10)], False, (-3.02, -2.68))
dl_tooth_row('DlTeethLow', jaw, [-2.48 - 0.06 * i for i in range(9)], True, (-2.96,))
