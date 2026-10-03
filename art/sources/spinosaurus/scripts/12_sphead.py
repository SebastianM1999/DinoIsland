# Long crocodile skull: deep at the back (jaw muscles, eyes set high under a heavy slanted brow), a long
# narrow snout with a low nasal crest, widening again into the tooth rosette at the tip. Lower jaw follows
# the same line (mouth.py profile). Conical interlocking teeth rooted in the measured lip lines, the
# biggest fangs in the rosette; slit-pupil eyes under angry lids. 'spfuse' welds skull + jaw + neck.
exec(bpy.data.texts['mouth'].as_string(), globals())
for n in ('SpHead', 'SpJaw', 'SpEyes', 'SpGlints', 'SpPupils', 'SpLids', 'SpTongue', 'SpTeethUp', 'SpTeethLow'): remove(n)
SP_MOUTH = 3.7; SP_CORNER = -4.35       # predator: the gape runs back to the corner under the eye

def sp_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.45 * w, top - 0.01), (0.8 * w + brow, top - (top - mid) * 0.32 + brow * .4),
            (0.94 * w, mid + 0.25 * (top - mid)), (w, mid - 0.15 * (mid - bot)), (0.97 * w, mid - 0.6 * (mid - bot)),
            (0.9 * w, bot + 0.02), (0.55 * w, bot + 0.005), (0, bot)]
M = SP_MOUTH
#          y      w    top   bot      brow
SP_HS = [(-3.95, .4, 4.45, 3.6, 0), (-4.2, .5, 4.6, 3.62, 0), (-4.5, .5, 4.6, M, .08), (-4.8, .43, 4.5, M, .1),
         (-5.1, .3, 4.24, M, .03), (-5.4, .23, 4.08, M, 0), (-5.7, .2, 3.98, M, 0), (-6.0, .18, 3.93, M, 0),
         (-6.25, .2, 3.92, M, 0), (-6.48, .18, 3.88, M, 0), (-6.62, .11, 3.8, M - .05, 0), (-6.72, .035, 3.72, M - .1, 0)]
head = loft2('SpHead', [(y, sp_prof(w, top, bot, br)) for y, w, top, bot, br in SP_HS])
SP_EYE0 = V((.38, -4.68, 4.3))

def sp_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * SP_EYE0.x, SP_EYE0.y, SP_EYE0.z))
    a, b = V((sx * .32, -4.45, 4.5)), V((sx * .27, -4.95, 4.4))                    # heavy brow, slanting to the snout
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.4 + V((sx * .55, 0, .05))) * .16 * math.exp(-(d / .1) ** 2) * (0.6 + 0.4 * math.sin(u * math.pi))   # shelf over the eye
    p -= n * .05 * math.exp(-((p - e).length / .13) ** 2)                          # sunk eye socket
    p += n * .12 * math.exp(-((p - V((sx * .48, -4.15, 3.95))).length / .3) ** 2)   # jaw muscles
    p += V((0, 0, .1)) * math.exp(-(((p.y + 5.45) / .3) ** 2 + (p.x / .1) ** 2)) * smooth(3.9, 4.05, p.z)  # nasal crest
    p += n * .03 * math.exp(-((p - V((sx * .1, -5.75, 4.0))).length / .08) ** 2)   # nostril rims (set far back)
    for yy in (-6.32, -6.5):                                                         # lip lifted over the rosette fangs
        p += V((0, 0, .03)) * math.exp(-((p.y - yy) / .08) ** 2) * smooth(M + .12, M + .02, p.z) * smooth(.1, .2, abs(p.x))
    return p
sculpt(head, sp_head_sculpt)

# narrower than the upper lip at every section and the skull's underside stays ON the lip line over the
# whole jaw: fuse_head presses the jaw top under the skull, and a dipping snout folded the jaw (no fuse).
SP_JS = [(-4.2, .34, 3.12), (-4.6, .36, 3.2), (-5.0, .27, 3.32), (-5.4, .2, 3.4), (-5.8, .16, 3.44),
         (-6.1, .15, 3.45), (-6.35, .155, 3.43), (-6.5, .12, 3.46), (-6.56, .045, 3.54)]
jaw = loft2('SpJaw', [(y, jaw_prof(w, bot, SP_MOUTH, 0.06 * trough_fade(y, -6.56, -4.2))) for y, w, bot in SP_JS])
add_tongue('SpTongue', (0, -5.1, SP_MOUTH - .055), (.13, .7, .035), seg=(16, 10))

exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((2.0, SP_EYE0.y, SP_EYE0.z)), V((-1, 0, 0)))
SP_EYE = V((hit[1].x - .05, SP_EYE0.y, SP_EYE0.z)) if hit[0] else SP_EYE0
SP_E = dict(c=tuple(SP_EYE), R=.135, yaw=.3, W=.9, Ht=.34, Hb=.48, tilt=.38, rim=(.2, .06), pupil=(.08, .34), iris=.8,
            ball=(24, 16), rimseg=(40, 6))
build_eyes('Sp', SP_E)

# teeth: straight conical fish-catching teeth rooted 6 cm inside the measured lip, the biggest in the
# rosette, upper and lower rows offset so they interlock; the row stops before the snout tip.
def sp_tooth_row(name, ob, ys, lower, big):
    bm = bmesh.new()
    for i, y in enumerate(ys):
        lx, lz = lip_at(ob, y, lower=not lower)
        L = (.12 + .1 * math.sin(i * 1.7 + .5) ** 4) * (2.1 if any(abs(y - b) < .07 for b in big) else 1)   # uneven sizes, no fence
        L *= 1.0 - 0.25 * smooth(-5.0, -4.4, y)                                  # smaller toward the corner
        dz = 1 if lower else -1
        for sx in (1, -1):
            root = V((sx * (lx - .055), y, lz - dz * .06)); tip = V((sx * (lx - .03), y + .025, lz + dz * L))
            horn_bm(bm, root, tip, .03 + L * .17, bend=(sx * .008, -.02, 0), seg=6, rings=5)
    return mk(name, bm)
sp_tooth_row('SpTeethUp', head, [-4.55 - 0.19 * i for i in range(11)], False, (-6.45, -6.26))
sp_tooth_row('SpTeethLow', jaw, [-4.64 - 0.19 * i for i in range(10)], True, (-6.35,))
