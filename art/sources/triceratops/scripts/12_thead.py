# Big wedge head: wide cheeks at the back, tapering snout ending in a hooked parrot beak.
# Skull + lower jaw are lofts; 'tfuse' welds them with the neck into ONE mesh.
for n in ('TriHead', 'TriJaw', 'TriEyes', 'TriPupils', 'TriLids'): remove(n)
TR_MOUTH = 1.25; TR_CORNER = -3.2

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

TR_JT = [(0, 0.92), (0.5, 0.96), (0.8, 0.92), (0.97, 0.7), (1.0, 0.45), (0.9, 0.2), (0.66, 0.05), (0.34, 0.0), (0, 0.0)]
#            y      w     bot      (narrower than the upper lip -> overbite; deep at the back; beak tip)
TR_JS = [(-2.5, .3, 1.02), (-2.68, .38, .86), (-2.96, .36, .86), (-3.2, .3, .9), (-3.45, .24, .95), (-3.66, .18, .99),
         (-3.82, .12, 1.03), (-3.93, .055, 1.08)]
jaw = loft2('TriJaw', [(y, [(tx * w, bot + tz * (TR_MOUTH - bot)) for tx, tz in TR_JT]) for y, w, bot in TR_JS])

# eyes sit IN the measured head surface (ray cast from outside), slightly sunk
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((2.0, TR_EYE0.y, TR_EYE0.z)), V((-1, 0, 0)))
TR_EYE = V((hit[1].x - .035, TR_EYE0.y, TR_EYE0.z)) if hit[0] else TR_EYE0
TR_EYE_R = .125; TR_EYE_YAW = 0.25
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx * TR_EYE.x, TR_EYE.y, TR_EYE.z)), (TR_EYE_R * .8, TR_EYE_R, TR_EYE_R), (0, 0, -sx * TR_EYE_YAW), 24, 16)
mk('TriEyes', bm)
bm = bmesh.new()
for sx in (1, -1):
    d = V((sx * math.cos(TR_EYE_YAW), -math.sin(TR_EYE_YAW), 0))
    blob_bm(bm, V((sx * TR_EYE.x, TR_EYE.y, TR_EYE.z - .006)) + d * TR_EYE_R * .7, (.022, .045, .048), (0, 0, -sx * TR_EYE_YAW), 16, 10)
mk('TriPupils', bm)
bm = bmesh.new()   # soft upper lid covering ~35 %, level edge (calm, not angry)
for sx in (1, -1):
    blob_bm(bm, V((sx * (TR_EYE.x + .004), TR_EYE.y, TR_EYE.z + TR_EYE_R * .66)), (TR_EYE_R * .9, TR_EYE_R * 1.14, TR_EYE_R * .5),
            (0, 0, -sx * TR_EYE_YAW), 24, 14)
mk('TriLids', bm)
