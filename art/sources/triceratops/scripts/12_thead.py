# Big wedge head: wide cheeks at the back, tapering snout ending in a hooked parrot beak.
# Skull + lower jaw are lofts; 'tfuse' welds them with the neck into ONE mesh.
for n in ('TriHead', 'TriJaw', 'TriEyes', 'TriGlints', 'TriPupils', 'TriLids', 'TriTongue'): remove(n)
TR_MOUTH = 1.25; TR_CORNER = -3.45   # cheeks close the mouth behind the corner (beaked herbivore)

def tr_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.5 * w, top - 0.02), (0.84 * w + brow, top - (top - mid) * 0.35), (w, mid + 0.15 * (top - mid)),
            (0.99 * w, mid - 0.25 * (mid - bot)), (0.95 * w, mid - 0.7 * (mid - bot)), (0.86 * w, bot + 0.02),
            (0.55 * w, bot + 0.004), (0, bot)]
M = TR_MOUTH
#            y      w    top   bot       brow   (cheeks widest at the back, beak hooks below the lip line)
TR_HS = [(-2.3, .46, 2.1, 1.25, 0), (-2.5, .56, 2.22, 1.18, 0), (-2.7, .6, 2.26, M, .03), (-2.9, .56, 2.22, M, .04),
         (-3.1, .48, 2.13, M, .02), (-3.3, .41, 2.03, M, 0), (-3.5, .34, 1.94, M, 0), (-3.68, .28, 1.86, M, 0),
         (-3.84, .22, 1.75, M - .03, 0), (-3.96, .16, 1.6, M - .09, 0), (-4.05, .1, 1.43, M - .15, 0),
         (-4.1, .045, 1.27, M - .2, 0)]
head = loft2('TriHead', [(y, tr_prof(w, top, bot, br)) for y, w, top, bot, br in TR_HS])
TR_EYE0 = V((.5, -2.95, 1.86))                     # rough eye spot on the cage; refined on the surface below

def tr_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * TR_EYE0.x, TR_EYE0.y, TR_EYE0.z))
    # soft brow over the eye (a herbivore: rounded, not angry)
    a, b = V((sx * .42, -2.82, 2.0)), V((sx * .38, -3.05, 1.98))
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .2))) * .05 * math.exp(-(d / .08) ** 2)
    p -= n * .035 * math.exp(-((p - e).length / .1) ** 2)                          # eye socket
    p += n * .06 * math.exp(-((p - V((sx * .5, -2.72, 1.42))).length / .18) ** 2)  # cheek bulge
    p += n * .03 * math.exp(-((p - V((sx * .16, -3.82, 1.55))).length / .08) ** 2)  # nostril rims
    p += n * .12 * math.exp(-((p - V((sx * .3, -2.92, 2.12))).length / .22) ** 2)   # bony bosses under the brow horns
    p += n * .05 * math.exp(-((p - V((0, -3.7, 1.82))).length / .13) ** 2)         # nose horn boss
    return p
sculpt(head, tr_head_sculpt)

# Lower jaw (after creature-topology guides + ceratopsid anatomy): flat cheek sides that taper to a
# defined jawline keel (no round "sausage lip"), a thin cutting lip tucked inside the upper beak that
# rolls inward into a mouth trough (the cavity you see when it opens), deepest under the cheek, rising
# to a pointed, upturned lower beak (predentary) that stops behind the upper beak's hook.
def tr_jaw_prof(w, bot, trough=0.08):
    D = TR_MOUTH - bot
    return [(0, TR_MOUTH - trough), (0.42 * w, TR_MOUTH - trough * 0.85), (0.7 * w, TR_MOUTH - 0.012), (0.8 * w, TR_MOUTH),
            (0.92 * w, TR_MOUTH - 0.07 * D), (1.0 * w, TR_MOUTH - 0.32 * D), (0.86 * w, TR_MOUTH - 0.66 * D),
            (0.5 * w, bot + 0.06 * D), (0.18 * w, bot + 0.004), (0, bot)]
#            y      w     bot      (narrower than the upper lip; deepest under the cheek; pointed beak tip)
TR_JS = [(-2.5, .28, 1.05), (-2.68, .36, .93), (-2.96, .35, .93), (-3.2, .3, .96), (-3.42, .25, 1.0), (-3.6, .19, 1.04),
         (-3.73, .13, 1.08), (-3.82, .08, 1.11), (-3.87, .03, 1.15)]
jaw = loft2('TriJaw', [(y, tr_jaw_prof(w, bot, 0.08 * smooth(-3.86, -3.6, y) * smooth(-2.5, -2.7, y)))
                        for y, w, bot in TR_JS])

bm = bmesh.new()   # tongue lying in the mouth trough (top stays under the lip line -> hidden when closed)
blob_bm(bm, (0, -3.3, TR_MOUTH - .075), (.12, .3, .045), (0, 0, 0), 20, 12)
mk('TriTongue', bm)

# eyes sit IN the measured head surface (ray cast from outside), slightly sunk; 'eyes' builds the ball,
# the almond lid rim and the catchlights (slim, slanted opening: the corner toward the snout dips, so it looks grumpy/angry; round pupil)
exec(bpy.data.texts['eyes'].as_string(), globals())
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((2.0, TR_EYE0.y, TR_EYE0.z)), V((-1, 0, 0)))
TR_EYE_R = .14; TR_EYE_YAW = 0.25
TR_EYE = V((hit[1].x - .045, TR_EYE0.y, TR_EYE0.z)) if hit[0] else TR_EYE0
TR_E = dict(c=tuple(TR_EYE), R=TR_EYE_R, yaw=TR_EYE_YAW, W=.88, Ht=.42, Hb=.5, tilt=.24, rim=(.22, .06),
            pupil=(.27, .3), iris=.74)
build_eyes('Tri', TR_E)
