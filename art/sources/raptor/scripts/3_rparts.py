
V = mathutils.Vector
for n in ('RaptorSpikes','RaptorClaws','RaptorTeethUp','RaptorTeethLow'): remove(n)
def lerp(secs, y, f):
    for a, b in zip(secs, secs[1:]):
        if a[0] >= y >= b[0]:
            u = (y - a[0]) / (b[0] - a[0]); return f(a) + (f(b) - f(a)) * u
    return f(secs[-1])
H = HEAD_N
bm = bmesh.new()
for sx in (1, -1):
    for y, L in zip([-0.84, -0.885, -0.93, -0.975, -1.02, -1.065, -1.11, -1.15, -1.19], [.035, .05, .042, .058, .045, .06, .07, .055, .05]):
        x = lerp(H, y, lambda s: s[1][6][0]) * .9; z = lerp(H, y, lambda s: s[1][6][1]) + .012
        horn_bm(bm, (sx*x, y, z), (sx*x*.98, y + .014, z - L - .012), .011 + L*.16, bend=(sx*.004, -.008, 0), seg=8, rings=6)
mk('RaptorTeethUp', bm)
bm = bmesh.new()
for sx in (1, -1):
    for y, L in zip([-0.86,-0.91,-0.96,-1.01,-1.06,-1.11,-1.16], [.03,.04,.035,.045,.04,.05,.045]):
        x = lerp(JAW_N, y, lambda s: s[1]) * .8
        horn_bm(bm, (sx*x, y, 1.33), (sx*x*.98, y + .01, 1.33 + L), .01 + L*.15, bend=(0, -.006, 0), seg=8, rings=6)
mk('RaptorTeethLow', bm)
bm = bmesh.new()
for y, z, L in SPIKES:
    horn_bm(bm, (0, y + .015, z - .02), (0, y + L*.85, z + L), .028 + L*.15, bend=(0, .012, -.008), seg=10, rings=6, flat=.4)
for sx in (1, -1):
    horn_bm(bm, (sx*.14, -0.69, 1.6), (sx*.175, -0.56, 1.66), .03, bend=(sx*.01, 0, .02), seg=10, rings=7)
    horn_bm(bm, (sx*.175, -0.63, 1.43), (sx*.21, -0.53, 1.44), .022, bend=(sx*.01, 0, .01), seg=8, rings=6)
    horn_bm(bm, (sx*.16, -0.60, 1.38), (sx*.19, -0.50, 1.36), .018, bend=(sx*.01, 0, 0), seg=8, rings=6)
mk('RaptorSpikes', bm)
bm = bmesh.new()
for sx in (1, -1):
    horn_bm(bm, (sx*.21, -0.15, .04), (sx*.21, -0.25, .005), .022, bend=(0, -.01, .02), seg=10, rings=7)
    horn_bm(bm, (sx*.27, -0.11, .04), (sx*.29, -0.19, .005), .019, bend=(0, -.008, .015), seg=10, rings=7)
    horn_bm(bm, (sx*.165, 0.02, .075), (sx*.15, -0.10, .16), .03, bend=(0, -.045, -.04), seg=10, rings=9)
    horn_bm(bm, (sx*.175, 0.05, .06), (sx*.165, 0.0, .1), .02, bend=(0, -.01, -.01), seg=8, rings=5)
    for dx, dy in ((-.025, 0), (0, -.012), (.025, 0)):
        horn_bm(bm, (sx*(.19+dx), -0.52+dy, .64), (sx*(.19+dx), -0.6+dy, .57), .016, bend=(0, -.02, .02), seg=8, rings=6)
mk('RaptorClaws', bm)
paint_t(bpy.data.objects['RaptorTeethUp'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['RaptorTeethLow'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['RaptorSpikes'], lambda p, t: mix(mix(P['back2'], P['stripe'], .35), P['red'], smooth(0.2, 0.8, t)))
paint_t(bpy.data.objects['RaptorClaws'], lambda p, t: mix(P['claw'], P['clawtip'], smooth(0.4, 1.0, t)))

# living eyes (eyes.py): predator -> slim opening slanting down toward the snout, slit pupil, catchlights
exec(bpy.data.texts['eyes'].as_string(), globals())
R_E = dict(c=EYE_C, R=.034, yaw=.4, W=.9, Ht=.38, Hb=.5, tilt=.34, rim=(.26, .07), pupil=(.09, .34), iris=.78)
build_eyes('Raptor', R_E)
paint_eyes('Raptor', R_E, dict(iris=P['eye'], iris2=P['eye2'], glow=lin('#ffe07a'), limbal=lin('#2a1206'), pupil=P['pupil'],
                               sclera=lin('#d8b892'), lid=mix(P['mask'], P['back2'], 0.35), lid2=P['mask']),
           bpy.data.materials['RaptorGloss'], bpy.data.materials['RaptorSkin'])
for o in bpy.data.objects:
    if o.type == 'MESH' and not o.data.materials:
        o.data.materials.append(bpy.data.materials['RaptorGloss' if o.name in ('RaptorEyes','RaptorPupils','RaptorTeethUp','RaptorTeethLow','RaptorClaws') else 'RaptorSkin'])
