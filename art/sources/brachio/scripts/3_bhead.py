
V = mathutils.Vector
for n in ('BrachioHead', 'BrachioJaw', 'BrachioEyes', 'BrachioPupils', 'BrachioLids', 'BrachioGlints', 'BrachioTongue', 'BrachioTeeth'): remove(n)
def prof(w, top, bot, dome=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.55*w, top - 0.04 - dome*0.4), (0.9*w, top - (top-mid)*0.4 - dome*0.5), (w, mid + 0.12*(top-mid)),
            (0.98*w, mid - 0.15*(mid-bot)), (0.86*w, mid - 0.62*(mid-bot)), (0.58*w, bot + 0.03), (0.26*w, bot + 0.004), (0, bot)]
HS = [(-4.66, .2, 12.42, 12.08, 0), (-4.78, .37, 12.66, 11.99, 0), (-4.96, .46, 12.82, 11.96, 0), (-5.16, .48, 12.95, 11.97, .05),
      (-5.34, .44, 13.06, 11.98, .14), (-5.52, .39, 13.06, 11.99, .16), (-5.7, .35, 12.88, 12.0, .1), (-5.88, .34, 12.64, 12.01, .02),
      (-6.04, .32, 12.5, 12.02, 0), (-6.16, .27, 12.43, 12.04, 0), (-6.25, .14, 12.34, 12.09, 0), (-6.29, .05, 12.26, 12.14, 0)]
head = loft2('BrachioHead', [(y, prof(w, top, bot, d)) for y, w, top, bot, d in HS])
JT = 12.03
# lower jaw (mouth.py): flat sides to a jawline keel, thin inward-rolled lip, mouth trough + tongue
exec(bpy.data.texts['mouth'].as_string(), globals())
JS = [(-4.8, .34, 11.7), (-5.0, .41, 11.64), (-5.28, .38, 11.74), (-5.58, .34, 11.8), (-5.88, .31, 11.86),
      (-6.08, .27, 11.91), (-6.2, .2, 11.96), (-6.27, .07, 12.0)]
jaw = loft2('BrachioJaw', [(y, jaw_prof(w, bot, JT, 0.04 * trough_fade(y, -6.27, -4.8))) for y, w, bot in JS])
add_tongue('BrachioTongue', (0, -5.5, JT - .035), (.15, .4, .025), seg=(12, 8))
# living eyes (eyes.py): gentle giant -> round pupil, open almost level lids; centre sunk into the head
exec(bpy.data.texts['eyes'].as_string(), globals())
EYE0 = V((.43, -5.12, 12.55))
dg = bpy.context.evaluated_depsgraph_get(); _h = head.evaluated_get(dg).ray_cast(V((2.0, EYE0.y, EYE0.z)), V((-1, 0, 0)))
EYE = V((_h[1].x - .045, EYE0.y, EYE0.z)) if _h[0] else EYE0
B_E = dict(c=tuple(EYE), R=.115, yaw=.25, W=.88, Ht=.56, Hb=.62, tilt=.06, rim=(.2, .06), pupil=(.28, .31), iris=.74,
           ball=(24, 16), rimseg=(40, 6))   # brachio sits near the 60k budget
build_eyes('Brachio', B_E)
bm = bmesh.new()
for sx in (1, -1):
    for i, y in enumerate((-5.7, -5.83, -5.96, -6.08, -6.18)):
        w = .31 - i * .03
        horn_bm(bm, (sx*w*.85, y, JT + .03), (sx*w*.83, y, JT - .08), .03, seg=8, rings=5)
mk('BrachioTeeth', bm)
