# Small, low head: blunt beak, round cheeks, heavy sleepy brow (friendly but grumpy).
# Skull + lower jaw are lofts; 'sfuse' welds them with the neck into ONE mesh.
for n in ('StegoHead', 'StegoJaw', 'StegoEyes', 'StegoPupils', 'StegoLids'): remove(n)
S_MOUTH = 0.9; S_CORNER = -3.15

def s_prof(w, top, bot, brow=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.5 * w, top - 0.015), (0.86 * w + brow, top - (top - mid) * 0.32), (w, mid + 0.18 * (top - mid)),
            (0.98 * w, mid - 0.2 * (mid - bot)), (0.9 * w, mid - 0.65 * (mid - bot)), (0.7 * w, bot + 0.012),
            (0.36 * w, bot + 0.002), (0, bot)]
#           y      w    top   bot   brow        (blunt rounded snout, no beak point)
S_HS = [(-2.72, .2, 1.30, .92, 0), (-2.82, .28, 1.40, S_MOUTH, 0), (-2.94, .33, 1.46, S_MOUTH, .02),
        (-3.06, .345, 1.46, S_MOUTH, .035), (-3.18, .335, 1.42, S_MOUTH, .015), (-3.32, .31, 1.37, S_MOUTH, 0),
        (-3.46, .29, 1.33, S_MOUTH, 0), (-3.58, .275, 1.30, S_MOUTH, 0), (-3.68, .255, 1.27, S_MOUTH, 0),
        (-3.75, .22, 1.23, S_MOUTH + .005, 0), (-3.8, .16, 1.17, S_MOUTH + .01, 0), (-3.83, .08, 1.1, S_MOUTH + .02, 0)]
head = loft2('StegoHead', [(y, s_prof(w, top, bot, br)) for y, w, top, bot, br in S_HS])
S_EYE0 = V((.33, -3.06, 1.26))                     # rough eye spot on the cage; refined on the surface below

def s_head_sculpt(p, n):
    sx = 1 if p.x >= 0 else -1; e = V((sx * S_EYE0.x, S_EYE0.y, S_EYE0.z))
    # heavy brow ridge over the eye, slanting a little toward the snout (grumpy)
    a, b = V((sx * .29, -2.97, 1.37)), V((sx * .27, -3.22, 1.33))
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
    p += (n * 0.7 + V((sx * .3, 0, .2))) * .05 * math.exp(-(d / .06) ** 2)
    p -= n * .03 * math.exp(-((p - e).length / .08) ** 2)                       # eye socket
    p += n * .035 * math.exp(-((p - V((sx * .3, -3.18, 1.0))).length / .12) ** 2)  # round cheeks
    p += n * .014 * math.exp(-((p - V((sx * .1, -3.79, 1.2))).length / .04) ** 2)  # nostril rims
    return p
sculpt(head, s_head_sculpt)

S_T = [(0, 0.9), (0.5, 0.93), (0.82, 1.0), (0.97, 0.9), (1.0, 0.62), (0.92, 0.3), (0.72, 0.1), (0.4, 0.015), (0, 0.0)]
#           y      w     bot      (narrower than the upper lip -> soft overbite; deep at the back)
S_JS = [(-2.76, .19, .74), (-2.88, .26, .65), (-3.04, .29, .64), (-3.2, .275, .68), (-3.36, .26, .71), (-3.5, .245, .73),
        (-3.62, .225, .75), (-3.71, .195, .77), (-3.77, .15, .79), (-3.8, .08, .81)]
jaw = loft2('StegoJaw', [(y, [(tx * w, bot + tz * (S_MOUTH - bot)) for tx, tz in S_T]) for y, w, bot in S_JS])

# eyes sit IN the measured head surface (ray cast from outside), slightly sunk
dg = bpy.context.evaluated_depsgraph_get(); eh = head.evaluated_get(dg)
hit = eh.ray_cast(V((1.0, S_EYE0.y, S_EYE0.z)), V((-1, 0, 0)))
S_EYE = V((hit[1].x - .03, S_EYE0.y, S_EYE0.z)) if hit[0] else S_EYE0
S_EYE_R = .11; S_EYE_YAW = 0.3                     # eyes look slightly forward
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx * S_EYE.x, S_EYE.y, S_EYE.z)), (S_EYE_R * .8, S_EYE_R, S_EYE_R), (0, 0, -sx * S_EYE_YAW), 24, 16)
mk('StegoEyes', bm)
bm = bmesh.new()
for sx in (1, -1):
    d = V((sx * math.cos(S_EYE_YAW), -math.sin(S_EYE_YAW), 0))
    blob_bm(bm, V((sx * S_EYE.x, S_EYE.y, S_EYE.z - .012)) + d * S_EYE_R * .7, (.02, .042, .05), (0, 0, -sx * S_EYE_YAW), 16, 10)
mk('StegoPupils', bm)
bm = bmesh.new()   # heavy upper lid covering ~40 %, its edge sloping down toward the back of the head
for sx in (1, -1):
    blob_bm(bm, V((sx * (S_EYE.x + .004), S_EYE.y, S_EYE.z + S_EYE_R * .6)), (S_EYE_R * .9, S_EYE_R * 1.14, S_EYE_R * .52),
            (0, 0, -sx * S_EYE_YAW), 24, 14)
mk('StegoLids', bm)
S_LID_TILT = 0.22                                    # rotate each lid about the eye's outward axis
lids = bpy.data.objects['StegoLids']
for v in lids.data.vertices:
    sx = 1 if v.co.x > 0 else -1; c = V((sx * S_EYE.x, S_EYE.y, S_EYE.z))
    ax = V((sx * math.cos(S_EYE_YAW), -math.sin(S_EYE_YAW), 0))
    v.co = c + mathutils.Matrix.Rotation(-sx * S_LID_TILT, 3, ax) @ (v.co - c)
lids.data.update()

