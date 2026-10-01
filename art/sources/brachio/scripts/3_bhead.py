
V = mathutils.Vector
for n in ('BrachioHead', 'BrachioJaw', 'BrachioEyes', 'BrachioPupils', 'BrachioLids', 'BrachioTeeth'): remove(n)
def prof(w, top, bot, dome=0.0):
    mid = (top + bot) / 2
    return [(0, top), (0.55*w, top - 0.04 - dome*0.4), (0.9*w, top - (top-mid)*0.4 - dome*0.5), (w, mid + 0.12*(top-mid)),
            (0.98*w, mid - 0.15*(mid-bot)), (0.86*w, mid - 0.62*(mid-bot)), (0.58*w, bot + 0.03), (0.26*w, bot + 0.004), (0, bot)]
HS = [(-4.66, .2, 12.42, 12.08, 0), (-4.78, .37, 12.66, 11.99, 0), (-4.96, .46, 12.82, 11.96, 0), (-5.16, .48, 12.95, 11.97, .05),
      (-5.34, .44, 13.06, 11.98, .14), (-5.52, .39, 13.06, 11.99, .16), (-5.7, .35, 12.88, 12.0, .1), (-5.88, .34, 12.64, 12.01, .02),
      (-6.04, .32, 12.5, 12.02, 0), (-6.16, .27, 12.43, 12.04, 0), (-6.25, .14, 12.34, 12.09, 0), (-6.29, .05, 12.26, 12.14, 0)]
head = loft2('BrachioHead', [(y, prof(w, top, bot, d)) for y, w, top, bot, d in HS])
JT = 12.03
JS = [(-4.8, .34, 11.68), (-5.0, .41, 11.6), (-5.28, .38, 11.71), (-5.58, .34, 11.77), (-5.88, .31, 11.84),
      (-6.08, .27, 11.9), (-6.2, .2, 11.96), (-6.27, .07, 12.0)]
jaw = loft2('BrachioJaw', [(y, [(tx*w, bot + tz*(JT-bot)) for tx, tz in [(0,0.88),(0.5,0.92),(0.84,1.0),(0.97,0.9),(1.0,0.62),(0.92,0.3),(0.72,0.1),(0.4,0.015),(0,0.0)]]) for y, w, bot in JS])
EYE = V((.43, -5.12, 12.55))
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z)), (.09, .12, .11), (0, 0, -sx*0.25), 24, 16)
mk('BrachioEyes', bm)
bm = bmesh.new()
for sx in (1, -1):
    d = V((sx*math.cos(.25), -math.sin(.25), 0))
    blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z)) + d*.075, (.025, .05, .055), (0, 0, -sx*0.25), 16, 10)
mk('BrachioPupils', bm)
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z + .045)), (.1, .135, .07), (0.12, 0, -sx*0.25), 24, 14)
mk('BrachioLids', bm)
bm = bmesh.new()
for sx in (1, -1):
    for i, y in enumerate((-5.7, -5.83, -5.96, -6.08, -6.18)):
        w = .31 - i * .03
        horn_bm(bm, (sx*w*.85, y, JT + .03), (sx*w*.83, y, JT - .08), .03, seg=8, rings=5)
mk('BrachioTeeth', bm)
